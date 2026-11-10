/**
 * The desk: the overview, the leads, and the letters each one gets.
 *
 * Deliberately not part of /claim/. That is the firm panel, its accounts are one per law firm,
 * and a firm signing in there must never be one URL away from a list of other firms' enquiries.
 * This is a separate address behind a token, minted by scripts/leads_link.mjs.
 *
 * The token is a random value held in KV rather than something signed, for the same reason the
 * panel credentials are: PANEL_SECRET is a Worker secret and cannot be read back, so a script
 * on a laptop cannot sign anything with it, while it can write a key through wrangler exactly
 * as panel_account.mjs already does. Revoking is then a delete rather than a wait for an expiry.
 *
 * It is a bearer credential all the same: whoever holds the link sees the list, which carries
 * firm names and the addresses they wrote from. So every page is noindex, Cache-Control:
 * no-store, under the /api/ prefix robots.txt already disallows, and the comparison is
 * constant time.
 *
 * Three rules hold the sending side and none are optional.
 *
 * The token never travels in a URL on a request that does something. GET puts it in the query
 * because a link has nowhere else to put it; POST carries it in the body, so the one request
 * that can reach a law firm is not sitting in a Referer header or a browser history entry.
 *
 * Nothing sends without being read first, and read as the firm will read it. Every letter is
 * rendered into a textarea beside a preview of the actual HTML email, the person can edit it,
 * and the send button posts what is on screen rather than what the template produced.
 *
 * Every write answers 303 to a GET. A page that mails a law firm must not be a page that mails
 * them again when somebody hits refresh. The single exception is the preview, which answers
 * with a page because it changes nothing: see worker/composer.ts.
 *
 * Each lead has a URL of its own, at /api/leads/lead/<id>, as well as unfolding in place in
 * the list. The list is for working through the day and the page is for everything else:
 * sending somebody a link to one lead, keeping it open in a tab, coming back to it tomorrow.
 * Both draw the same panel from the same function, so neither can gain a control the other
 * lacks.
 */
import { sameBytes } from './auth';
import { dossierFor, logoFor, type Dossier } from './dossier';
import {
  addNote, getLead, listLeads, recordSend, setFollowUp, setStatus,
  type Lead, type LeadStatus, type LeadEvent, RESOLVED, STATUSES,
} from './ledger';
import { listProspects, tally } from './prospects';
import { cancelReminderForLead, sendTo } from './outbound';
import { render, TEMPLATES, templateById, priceOf } from './templates';
import { columns, rows, stacked, tooFew } from './charts';
import { composer, isPreview, previewHtml, readCompose, type ComposeState } from './composer';
import {
  CAP, batchPage, prospectAct, prospectPage, prospectsPage, type ProspectPageEnv,
} from './prospectpage';
import {
  ROUTE, ago, avatar, esc, fig, hidden, link, shell, since, today, visit,
  NOT_FOUND, type Nav,
} from './deskui';

export interface LeadsEnv extends ProspectPageEnv {
  SUBMISSIONS_TO?: string;
  FOLLOWUPS?: KVNamespace;
  PANEL?: KVNamespace;
  ASSETS?: Fetcher;
  EMAIL?: { send(message: any): Promise<unknown> };
  SUBMISSIONS_FROM?: string;
  REPLY_TO?: string;
  LISTING_PRICE_USD?: string;
  PAYPAL_LINK?: string;
  POSTAL_ADDRESS?: string;
}

const LABEL: Record<LeadStatus, string> = {
  arrived: 'Arrived', quoted: 'Quoted', chased: 'Chased',
  closed: 'Closed', won: 'Won', lost: 'Lost',
};

/** Days after arrival with no reply at which a lead is shouted about rather than listed. */
const STALE_DAYS = 7;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const clip = (s: string, n: number): string =>
  s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;

/** The first thing a person sent, which is the only reply that counts as an answer. */
const humanReply = (l: Lead): LeadEvent | undefined =>
  (l.events ?? []).find(e => e.kind === 'email' && e.by === 'owner');

const openLeadsIn = (leads: Lead[]): number =>
  leads.filter(l => !RESOLVED.includes(l.status)).length;

/** The token, checked in constant time. Every failure is the same 404. */
async function allowed(env: LeadsEnv, given: string): Promise<boolean | null> {
  if (!env.PANEL) return null;
  const stored = await env.PANEL.get('access:leads');
  if (!stored || !given) return false;
  let want = '';
  try {
    want = (JSON.parse(stored) as { token?: string }).token ?? '';
  } catch {
    return false;
  }
  const enc = new TextEncoder();
  if (!want || want.length !== given.length) return false;
  return sameBytes(enc.encode(want), enc.encode(given));
}

/** The dossier as one compact cell, for a table row. */
function dossierCell(d: Dossier): string {
  if (d.unknown) return '<span class="sub">index unavailable</span>';
  if (d.firm) {
    const [code, scored, max] = d.firm.w;
    return `<span class="num">${d.firm.sc}</span> <span class="pill">${esc(d.firm.t)}</span>`
      + `<span class="sub">pillar ${esc(code)} ${scored}/${max}`
      + `${d.firm.g ? `, ${d.firm.g[1]} to ${esc(d.firm.g[0])}` : ''}</span>`;
  }
  if (!d.covered) {
    return `<span class="warnish">${esc((d.state ?? '').toUpperCase())} not published</span>`
      + '<span class="sub">no profile is possible today</span>';
  }
  return '<span class="warnish">no profile</span>'
    + '<span class="sub">not matched in the directory</span>';
}

/** The same dossier as a block, for the open panel. */
function dossierBlock(d: Dossier): string {
  if (d.unknown) {
    return '<div class="dossier none">Index unavailable'
      + '<span class="sub">absence proves nothing right now</span></div>';
  }
  if (!d.firm) {
    return '<div class="dossier none">'
      + (d.covered
        ? 'No profile<span class="sub">not matched in the directory</span>'
        : `${esc((d.state ?? '').toUpperCase())} not published`
          + '<span class="sub">no profile is possible today</span>')
      + '</div>';
  }
  const [code, scored, max] = d.firm.w;
  const pct = Math.round((scored / Math.max(1, max)) * 100);
  return '<div class="dossier"><div class="top">'
    + `<span class="num">${d.firm.sc}</span><span class="pill">${esc(d.firm.t)}</span></div>`
    + `<a href="${esc(d.url ?? '#')}" target="_blank" rel="noopener">`
    + `/firms/${esc(d.firm.s)}/</a>`
    + `<div class="bar"><i style="width:${pct}%"></i></div>`
    + `<div class="gap">Pillar ${esc(code)}, ${scored} of ${max}`
    + `${d.firm.g ? ` &middot; ${d.firm.g[1]} to ${esc(d.firm.g[0])}` : ''}</div></div>`;
}

function figures(leads: Lead[]): string {
  const won = leads.filter(l => l.status === 'won');
  const resolved = leads.filter(l => RESOLVED.includes(l.status));
  const open = leads.filter(l => !RESOLVED.includes(l.status));
  const last30 = leads.filter(l => since(l.arrived_at) >= 0 && since(l.arrived_at) <= 30);
  const rate = resolved.length ? Math.round((won.length / resolved.length) * 100) : 0;
  const money = won.reduce((n, l) => n + (l.amount ?? 0), 0);

  // Time to the first thing a person sent, which is the number the desk is judged on. The
  // automated acknowledgement does not count: it is not an answer, and counting it would have
  // reported a healthy figure through the month four firms waited a fortnight.
  const waits = leads
    .map(l => {
      const e = humanReply(l);
      return e ? (Date.parse(e.at) - Date.parse(l.arrived_at)) / 86400000 : null;
    })
    .filter((n): n is number => n !== null && Number.isFinite(n))
    .sort((a, b) => a - b);
  const median = waits.length
    ? Math.round(waits[Math.floor(waits.length / 2)] * 10) / 10
    : null;

  return [
    fig(String(leads.length), 'enquiries, all time'),
    fig(String(last30.length), 'in the last 30 days'),
    fig(String(open.length), 'still open'),
    fig(`${rate}%`, `won of ${resolved.length} resolved`),
    fig(money ? `$${money.toLocaleString('en-US')}` : '$0', 'booked from won leads',
      money ? 'lit' : undefined),
    fig(median === null ? 'never' : `${median}d`, 'median to a human reply',
      median !== null && median >= STALE_DAYS ? 'hot' : undefined),
  ].join('');
}

/** The two things that need shouting: nobody answered, and a date went by. */
function alerts(leads: Lead[], token: string): string {
  const stale = leads.filter(l =>
    !RESOLVED.includes(l.status) && !humanReply(l) && since(l.arrived_at) >= STALE_DAYS);
  const due = leads.filter(l =>
    !RESOLVED.includes(l.status) && l.follow_up_at && l.follow_up_at <= today());

  const list = (set: Lead[], why: (l: Lead) => string) => '<ul>' + set.map(l =>
    `<li><a href="${esc(link(ROUTE.lead(l.id), token))}">${esc(l.firm)}</a>, `
    + `${esc(why(l))}</li>`).join('') + '</ul>';

  let out = '';
  if (stale.length) {
    out += `<div class="flag"><b>${stale.length} waiting on a person</b>, `
      + `${STALE_DAYS} days or more since the enquiry with nothing sent by hand.`
      + list(stale, l => ago(since(l.arrived_at))) + '</div>';
  }
  if (due.length) {
    out += `<div class="flag"><b>${due.length} follow-up${due.length === 1 ? '' : 's'} due</b>.`
      + list(due, l => `set for ${l.follow_up_at}`) + '</div>';
  }
  return out;
}

/**
 * The overview, which is four charts and the two numbers worth arguing about.
 *
 * Each chart refuses to draw below its own minimum rather than drawing a trend out of three
 * points. This desk has had six leads in its life; a line through six points over a year is a
 * picture of nothing, and the sentence it prints instead is the true version.
 */
async function overviewPage(env: LeadsEnv, token: string): Promise<Response> {
  const [leads, prospects] = await Promise.all([listLeads(env, 400), listProspects(env)]);
  const nav: Nav = {
    here: 'overview', token, open: openLeadsIn(leads),
    waiting: prospects.filter(p => p.status === 'new' || p.status === 'queued').length,
  };

  // A month per column, oldest first, with the current month last. Counted off arrival rather
  // than off anything we did, because the question is how many firms are finding us.
  const now = new Date();
  const months: { label: string; value: number; tone: 'one' }[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    months.push({
      label: MONTHS[d.getUTCMonth()],
      value: leads.filter(l => l.arrived_at.slice(0, 7) === key).length,
      tone: 'one',
    });
  }
  const arrivals = leads.length >= 4
    ? columns({
      title: 'Enquiries a month',
      note: 'counted when they arrived, not when we answered',
      data: months,
    })
    : tooFew('Enquiries a month', leads.length, 4, 'enquiries');

  const waits = leads
    .map(l => {
      const e = humanReply(l);
      return e
        ? {
          label: clip(l.firm, 20),
          value: Math.round(((Date.parse(e.at) - Date.parse(l.arrived_at)) / 86400000) * 10) / 10,
          tone: ((Date.parse(e.at) - Date.parse(l.arrived_at)) / 86400000 >= STALE_DAYS
            ? 'warn' : 'good') as 'warn' | 'good',
          note: 'days',
        }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 14);
  const answering = rows({
    title: 'Days before a person replied',
    note: 'the automated acknowledgement is not a reply',
    data: waits,
    unit: 'answered enquiries',
    mark: { at: STALE_DAYS, label: `${STALE_DAYS} days` },
  });

  const counts = STATUSES.map(s => ({
    label: LABEL[s],
    value: leads.filter(l => l.status === s).length,
    tone: (s === 'won' ? 'good' : s === 'lost' ? 'dead' : s === 'chased' ? 'warn'
      : s === 'quoted' ? 'one' : 'quiet') as 'good' | 'dead' | 'warn' | 'one' | 'quiet',
  }));
  const where = stacked({
    title: 'Where the enquiries stand',
    note: `${leads.length} in all`,
    parts: counts,
    unit: 'enquiries',
  });

  const t = tally(prospects);
  const outbound = prospects.length
    ? stacked({
      title: 'The prospecting list',
      note: `${prospects.length} firms we publish and could write to`,
      parts: [
        { label: 'Never written to', value: t.new + t.queued, tone: 'quiet' },
        { label: 'Written to', value: t.sent, tone: 'one' },
        { label: 'Replied', value: t.replied, tone: 'good' },
        { label: 'Unsubscribed', value: t.unsubscribed, tone: 'warn' },
        { label: 'Bounced', value: t.bounced, tone: 'dead' },
        { label: 'Clients', value: t.client, tone: 'three' },
      ],
      unit: 'firms',
    })
    : tooFew('The prospecting list', 0, 1, 'firms loaded');

  const recent = leads.slice(0, 6);
  const table = recent.length
    ? '<div class="sheet"><div class="scroll"><table><thead><tr><th>Firm</th>'
      + '<th>Status</th><th>Arrived</th></tr></thead><tbody>'
      + recent.map(l => '<tr>'
        + `<td><a class="name" href="${esc(link(ROUTE.lead(l.id), token))}">${esc(l.firm)}</a>`
        + `<span class="sub">${esc(l.email)}</span></td>`
        + `<td><span class="pill ${esc(l.status)}">${esc(LABEL[l.status])}</span></td>`
        + `<td>${esc(l.arrived_at.slice(0, 10))}`
        + `<span class="sub">${esc(ago(since(l.arrived_at)))}</span></td></tr>`).join('')
      + '</tbody></table></div></div>'
    : '<div class="empty">No enquiries recorded yet.</div>';

  return shell('Overview', nav,
    `<div class="mast"><h1>Overview</h1><span class="note">as of ${esc(today())}</span></div>`
    + '<p class="lede">Two ways in: firms that wrote to us, and firms we publish and have '
    + 'never spoken to. The second is the larger number by two orders of magnitude.</p>'
    + `<div class="figures">${figures(leads)}</div>`
    + alerts(leads, token)
    + `<div class="charts">${arrivals}${answering}${where}${outbound}</div>`
    + '<h2>Latest enquiries</h2>'
    + table
    + `<p class="meta"><a href="${esc(link(ROUTE.leads, token))}">All leads</a>`
    + ` &middot; <a href="${esc(link(ROUTE.prospects, token))}">Prospecting</a></p>`);
}

function history(events: LeadEvent[]): string {
  if (!events.length) return '<p class="meta">Nothing recorded before the ledger existed.</p>';
  return '<ul class="hist">' + [...events].reverse().map(e =>
    `<li><time>${esc(e.at.slice(0, 16).replace('T', ' '))}</time>`
    + `<span>${esc(e.detail)} <span class="by">${esc(e.by)}</span></span></li>`).join('')
    + '</ul>';
}

/**
 * Everything about one lead, as two columns, drawn once and used twice.
 *
 * The list unfolds it inside a table row and the lead's own page lays it out as the whole
 * page. Writing it twice is how one of them quietly loses the follow-up field, so there is one
 * copy and the only thing the two callers choose is where the form posts back to.
 */
function leadPanel(opts: {
  env: LeadsEnv; token: string; lead: Lead; d: Dossier; action: string;
  tpl?: string; state: ComposeState; draft?: { subject: string; text: string };
}): { side: string; main: string } {
  const { env, token, lead, d, action, state } = opts;

  const facts: [string, string][] = [
    ['Contact', esc(lead.contact)],
    ['Email', `<a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>`],
    ['Website', lead.website ? visit(lead.website, lead.website.replace(/^https?:\/\//, ''))
      : 'not given'],
    ['Market', `${esc(lead.city ?? 'not given')}`
      + `${lead.practice ? ` &middot; ${esc(lead.practice)}` : ''}`],
    ['Asked for', esc(lead.request ?? 'not given')],
    ['Arrived', `${esc(lead.arrived_at.slice(0, 10))}, ${esc(ago(since(lead.arrived_at)))}`],
  ];
  if (lead.origin) facts.push(['Came from', esc(lead.origin)]);
  if (lead.note) facts.push(['Note', esc(lead.note)]);
  if (lead.reason) facts.push(['Outcome', esc(lead.reason)]);

  const statusForm = `<form method="post" action="${esc(action)}">`
    + hidden(token, { id: lead.id, action: 'status' })
    + '<div class="row" style="margin-bottom:6px">'
    + '<select name="to" aria-label="Status">'
    + STATUSES.map(s =>
      `<option value="${esc(s)}"${s === lead.status ? ' selected' : ''}>`
      + `${esc(LABEL[s])}</option>`).join('')
    + '</select>'
    + '<input name="amount" type="number" min="0" step="1" placeholder="amount" '
    + `value="${lead.amount ?? ''}" style="width:98px" aria-label="Amount, if won">`
    + '<button>Set</button></div>'
    + '<input name="reason" placeholder="why, in your words" class="field" '
    + `value="${esc(lead.reason ?? '')}">`
    + '</form>';

  const followForm = `<form method="post" action="${esc(action)}">`
    + hidden(token, { id: lead.id, action: 'followup' })
    + '<div class="row"><input type="date" name="date" '
    + `value="${esc(lead.follow_up_at ?? '')}" aria-label="Come back to this on">`
    + '<button>Follow up</button></div>'
    + '</form>';

  const noteForm = `<form method="post" action="${esc(action)}">`
    + hidden(token, { id: lead.id, action: 'note' })
    + '<div class="row"><input name="text" placeholder="what happened" '
    + 'style="flex:1 1 150px" aria-label="Note"><button>Add</button></div>'
    + '</form>';

  const side = '<p class="eyebrow">What we publish</p>' + dossierBlock(d)
    + '<p class="eyebrow">The enquiry</p><dl>'
    + facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')
    + '</dl>'
    + '<p class="eyebrow">Record what happened</p>' + statusForm + followForm + noteForm
    + '<p class="eyebrow">History</p>' + history(lead.events ?? []);

  // A template that cannot honestly be sent to this lead is shown disabled, with the reason on
  // it, rather than hidden. Hiding it makes the desk wonder where it went; saying "we do not
  // publish that state" is the answer it wanted.
  const chosen = opts.tpl && templateById(opts.tpl)
    ? opts.tpl
    : (TEMPLATES.find(t => !t.blocks(lead, d))?.id ?? '');

  const buttons = TEMPLATES.map(t => {
    const why = t.blocks(lead, d);
    return `<form method="get" action="${esc(action)}">`
      + `<input type="hidden" name="t" value="${esc(token)}">`
      + `<input type="hidden" name="id" value="${esc(lead.id)}">`
      + `<input type="hidden" name="open" value="${esc(lead.id)}">`
      + `<input type="hidden" name="tpl" value="${esc(t.id)}">`
      + `<input type="hidden" name="view" value="${esc(state.view)}">`
      + `<input type="hidden" name="brand" value="${state.restrained ? '0' : '1'}">`
      + `<button class="tpl${t.id === chosen ? ' on' : ''}"`
      + `${why ? ` disabled title="${esc(why)}"` : ` title="${esc(t.blurb)}"`}>`
      + `${esc(t.label)}</button></form>`;
  }).join('');

  let body: string;
  const made = chosen ? render(chosen, lead, d, env) : null;
  if (!made) {
    body = '<div class="blocked">No template by that name.</div>';
  } else if (made.blocked) {
    body = `<div class="blocked"><b>Not sendable:</b> ${esc(made.blocked)}</div>`;
  } else {
    body = composer({
      token,
      action,
      extra: { id: lead.id, tpl: chosen, open: lead.id },
      to: lead.email,
      subject: opts.draft?.subject ?? made.letter.subject,
      text: opts.draft?.text ?? made.letter.text,
      state,
    });
  }

  const main = '<p class="eyebrow">Write to them</p>'
    + `<div class="row" style="margin-bottom:12px">${buttons}</div>`
    + body;

  return { side, main };
}

async function listPage(
  env: LeadsEnv, token: string, q: URLSearchParams,
  draft?: { subject: string; text: string }, said?: string,
): Promise<Response> {
  const [leads, prospects] = await Promise.all([listLeads(env, 400), listProspects(env)]);
  const dossiers = await Promise.all(leads.map(l => dossierFor(env, l)));
  const open = q.get('open') ?? '';
  const state = readCompose(q);

  const body = leads.map((l, i) => {
    const isOpen = l.id === open;
    const here = link(ROUTE.leads, token,
      isOpen ? {} : { open: l.id, view: state.view, brand: state.restrained ? '0' : '1' });
    const row = `<tr class="lead${isOpen ? ' open' : ''}">`
      + '<td><div class="who">'
      + `<a class="caret" href="${esc(here)}" style="padding-top:4px" `
      + `title="${isOpen ? 'Close' : 'Open here'}">${isOpen ? '&#9662;' : '&#9656;'}</a>`
      + avatar(l.firm, logoFor(dossiers[i].firm, dossiers[i].domain))
      + '<div>'
      + `<a class="name" href="${esc(link(ROUTE.lead(l.id), token))}">${esc(l.firm)}</a>`
      + `<span class="sub">${esc(l.contact)}</span>`
      + `${l.website ? `<span class="sub">${visit(l.website)}</span>` : ''}`
      + '</div></div></td>'
      + `<td>${dossierCell(dossiers[i])}</td>`
      + `<td>${esc(l.email)}${l.city ? `<span class="sub">${esc(l.city)}</span>` : ''}</td>`
      + `<td>${esc(l.request ?? '')}</td>`
      + `<td><span class="pill ${esc(l.status)}">${esc(LABEL[l.status] ?? l.status)}</span>`
      + `${l.amount ? `<span class="sub">$${l.amount.toLocaleString('en-US')}</span>` : ''}`
      + `${l.follow_up_at ? `<span class="sub">due ${esc(l.follow_up_at)}</span>` : ''}</td>`
      + `<td>${esc(l.arrived_at.slice(0, 10))}`
      + `<span class="sub">${esc(ago(since(l.arrived_at)))}</span></td></tr>`;
    if (!isOpen) return row;

    const panel = leadPanel({
      env, token, lead: l, d: dossiers[i], action: ROUTE.leads,
      tpl: q.get('tpl') ?? undefined, state, draft,
    });
    return row + '<tr class="panel"><td colspan="6"><div class="inside">'
      + `<div class="side">${panel.side}</div><div class="main">${panel.main}</div>`
      + '</div></td></tr>';
  }).join('');

  const table = leads.length
    ? '<div class="sheet"><div class="scroll"><table><thead><tr>'
      + '<th>Firm</th><th>What we publish</th><th>Contact</th><th>Asked for</th>'
      + '<th>Status</th><th>Arrived</th></tr></thead><tbody>' + body + '</tbody></table>'
      + '</div></div>'
    : '<div class="empty">No enquiries recorded yet. Rows appear here from the moment the '
      + 'next one arrives.</div>';

  const nav: Nav = {
    here: 'leads', token, open: openLeadsIn(leads),
    waiting: prospects.filter(p => p.status === 'new' || p.status === 'queued').length,
  };

  return shell('Leads', nav,
    `<div class="mast"><h1>Leads</h1><span class="note">${leads.length} all time, `
    + `${openLeadsIn(leads)} open</span></div>`
    + '<p class="lede">Open a row to work on it here, or follow the firm name for a page of '
    + 'its own. Both do the same things.</p>'
    + (said ? `<div class="said">${esc(said)}</div>` : '')
    + alerts(leads, token)
    + table);
}

async function leadPage(
  env: LeadsEnv, token: string, id: string, q: URLSearchParams,
  draft?: { subject: string; text: string },
): Promise<Response> {
  const lead = await getLead(env, id);
  if (!lead) return shell('Not found', null, NOT_FOUND, 404);
  const [d, leads, prospects] = await Promise.all([
    dossierFor(env, lead), listLeads(env, 400), listProspects(env),
  ]);
  const state = readCompose(q);
  const said = q.get('said');

  const panel = leadPanel({
    env, token, lead, d, action: ROUTE.lead(lead.id),
    tpl: q.get('tpl') ?? undefined, state, draft,
  });

  const nav: Nav = {
    here: 'leads', token, open: openLeadsIn(leads),
    waiting: prospects.filter(p => p.status === 'new' || p.status === 'queued').length,
  };

  const price = priceOf(env);

  return shell(lead.firm, nav,
    `<a class="back" href="${esc(link(ROUTE.leads, token))}">&larr; All leads</a>`
    + '<div class="mast">'
    + avatar(lead.firm, logoFor(d.firm, d.domain), 30)
    + `<h1>${esc(lead.firm)}</h1>`
    + `<span class="pill ${esc(lead.status)}">${esc(LABEL[lead.status])}</span>`
    + visit(lead.website)
    + `<span class="note">${price ? `list price ${price} USD` : 'no price configured'}</span>`
    + '</div>'
    + '<p class="lede">This lead has a page of its own so it can be opened, linked and left '
    + 'in a tab. Everything here is also in the row on the list.</p>'
    + (said ? `<div class="said">${esc(said)}</div>` : '')
    + '<div class="sheet"><div class="inside">'
    + `<div class="side">${panel.side}</div><div class="main">${panel.main}</div>`
    + '</div></div>');
}

/** Back where the person was, as a redirect, so a refresh never repeats the write. */
const backTo = (path: string, token: string, said: string, extra = ''): Response =>
  new Response(null, {
    status: 303,
    headers: {
      location: `${path}?t=${encodeURIComponent(token)}`
        + `&said=${encodeURIComponent(said)}${extra}`,
      'cache-control': 'no-store',
    },
  });

async function leadAct(
  env: LeadsEnv, form: FormData, token: string, from: 'list' | 'lead',
): Promise<Response> {
  const id = String(form.get('id') ?? '');
  const lead = await getLead(env, id);
  if (!lead) return shell('Not found', null, NOT_FOUND, 404);

  const state = readCompose(form);
  const where = from === 'list' ? ROUTE.leads : ROUTE.lead(id);
  const tail = from === 'list' ? `&open=${encodeURIComponent(id)}` : '';
  const home = (said: string) => backTo(where, token, said, tail);

  // The one POST that writes nothing, so the one POST that may answer with a page.
  if (isPreview(form)) {
    const draft = {
      subject: String(form.get('subject') ?? ''),
      text: String(form.get('body') ?? ''),
    };
    if (form.get('fragment')) {
      return new Response(previewHtml(draft.text, state), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    const q = new URLSearchParams({
      t: token, open: id, tpl: String(form.get('tpl') ?? ''),
      view: state.view, brand: state.restrained ? '0' : '1',
    });
    return from === 'list'
      ? listPage(env, token, q, draft)
      : leadPage(env, token, id, q, draft);
  }

  const action = String(form.get('action') ?? '');

  if (action === 'status') {
    const to = String(form.get('to') ?? '') as LeadStatus;
    const amount = Number(form.get('amount'));
    await setStatus(env, id, to, {
      reason: String(form.get('reason') ?? '').trim() || undefined,
      amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
    });
    return home(`Status set to ${LABEL[to] ?? to}.`);
  }

  if (action === 'note') {
    await addNote(env, id, String(form.get('text') ?? ''));
    return home('Note added.');
  }

  if (action === 'followup') {
    const date = String(form.get('date') ?? '').trim();
    await setFollowUp(env, id, date);
    return home(date ? `Follow-up set for ${date}.` : 'Follow-up cleared.');
  }

  if (action === 'send') {
    const subject = String(form.get('subject') ?? '').trim();
    const body = String(form.get('body') ?? '').trim();
    const tpl = String(form.get('tpl') ?? '');
    if (!subject || !body) return home('Nothing sent: the letter was empty.');
    if (!env.EMAIL) return home('Nothing sent: no mail binding on this Worker.');

    // The template is re-checked at the moment of sending, not only when it was drawn. The
    // page the person is posting from may have been open for an hour, and the thing it is
    // blocked on, such as a state we do not publish, is exactly the mistake worth catching
    // twice.
    const spec = templateById(tpl);
    if (spec) {
      const why = spec.blocks(lead, await dossierFor(env, lead));
      if (why) return home(`Nothing sent: ${why}.`);
    }

    try {
      await sendTo(env as any, lead.email, subject, body, state.restrained);
    } catch (err) {
      console.error('lead send failed', id, err);
      return home('Send failed. Nothing went out and nothing was recorded.');
    }
    await recordSend(env, id, `sent "${subject}"${tpl ? ` (${tpl})` : ''}`, 'owner');
    // Writing to the firm is answering it, which is the whole question the reminder asks.
    // It used to be cancelled only by the link in the owner's own email, so answering here
    // left it armed and it went off the next day about work already done.
    const stood = await cancelReminderForLead(env as any, id).catch(() => 0);
    // Quoted rather than chased: the desk writing for the first time is the quote going out,
    // and a lead that was already chased stays chased because setStatus is not called here.
    if (lead.status === 'arrived') await setStatus(env, id, 'quoted');
    return home(`Sent to ${lead.email}.${stood ? ' The reminder is stood down.' : ''}`);
  }

  return home('Nothing to do.');
}

/** Which view a path names, and what it carries. One table, so a typo is a 404 and not a mix-up. */
function routeOf(pathname: string): { view: string; arg: string } | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/api/leads') return { view: 'overview', arg: '' };
  if (path === '/api/leads/list') return { view: 'leads', arg: '' };
  if (path === '/api/leads/prospects') return { view: 'prospects', arg: '' };
  if (path === '/api/leads/batch') return { view: 'batch', arg: '' };
  const lead = /^\/api\/leads\/lead\/([A-Za-z0-9_-]{1,64})$/.exec(path);
  if (lead) return { view: 'lead', arg: lead[1] };
  const pro = /^\/api\/leads\/prospect\/([A-Za-z0-9_.-]{1,160})$/.exec(path);
  if (pro) return { view: 'prospect', arg: decodeURIComponent(pro[1]) };
  return null;
}

export async function handleLeads(request: Request, env: LeadsEnv, url: URL): Promise<Response> {
  if (!env.PANEL) {
    return shell('Unavailable', null, '<h1>Unavailable</h1>'
      + '<p class="lede">No namespace is bound for the access token.</p>', 503);
  }

  const route = routeOf(url.pathname);
  if (!route) return shell('Not found', null, NOT_FOUND, 404);

  if (request.method === 'POST') {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return shell('Not found', null, NOT_FOUND, 404);
    }
    // The token comes out of the body here. A request that can send mail has no business
    // putting its credential in a URL, where it lands in history and in Referer.
    const token = String(form.get('t') ?? '');
    if (!(await allowed(env, token))) return shell('Not found', null, NOT_FOUND, 404);

    const leads = await listLeads(env, 400);
    if (route.view === 'prospect' || route.view === 'prospects' || route.view === 'batch') {
      return prospectAct(env, form, token, openLeadsIn(leads));
    }
    return leadAct(env, form, token, route.view === 'lead' ? 'lead' : 'list');
  }

  const token = url.searchParams.get('t') ?? '';
  const ok = await allowed(env, token);
  if (ok === null) {
    return shell('Unavailable', null, '<h1>Unavailable</h1>'
      + '<p class="lede">No namespace is bound for the access token.</p>', 503);
  }
  if (!ok) return shell('Not found', null, NOT_FOUND, 404);

  const q = url.searchParams;
  const said = q.get('said') ?? undefined;

  // The desk used to be one page with ?id= on it, and links to it exist in sent email and in
  // somebody's bookmarks. They go where they always went.
  if (route.view === 'overview' && q.get('id')) {
    return new Response(null, {
      status: 302,
      headers: {
        location: link(ROUTE.lead(String(q.get('id'))), token,
          q.get('tpl') ? { tpl: String(q.get('tpl')) } : {}),
        'cache-control': 'no-store',
      },
    });
  }

  const openCount = async () => openLeadsIn(await listLeads(env, 400));

  switch (route.view) {
    case 'overview': return overviewPage(env, token);
    case 'leads': return listPage(env, token, q, undefined, said);
    case 'lead': return leadPage(env, token, route.arg, q);
    case 'prospects': return prospectsPage(env, token, await openCount(), said);
    case 'prospect':
      return prospectPage(env, token, route.arg, await openCount(), readCompose(q), said);
    case 'batch':
      return batchPage(env, token, q.get('on') ?? '', await openCount(), said);
    default: return shell('Not found', null, NOT_FOUND, 404);
  }
}
