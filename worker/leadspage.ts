/**
 * The lead desk: every enquiry, what we already know about the firm, and the letters.
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
 * firm names and the addresses they wrote from. So the page is noindex, Cache-Control:
 * no-store, under the /api/ prefix robots.txt already disallows, and the comparison is
 * constant time.
 *
 * Now that the page can also send mail, three things follow from that and none are optional.
 *
 * The token never travels in a URL on a request that does something. GET puts it in the query
 * because a link has nowhere else to put it; POST carries it in the body, so the one request
 * that can reach a law firm is not sitting in a Referer header or a browser history entry.
 *
 * Nothing sends without being read first. Every letter is rendered into a textarea, the person
 * can edit it, and the send button posts what is on screen rather than what the template
 * produced. The templates are good; they are not good enough to mail a stranger unread.
 *
 * Every write answers 303 to a GET. A page that mails a law firm must not be a page that mails
 * them again when somebody hits refresh.
 */
import { sameBytes } from './auth';
import { dossierFor, type Dossier } from './dossier';
import {
  addNote, getLead, listLeads, recordSend, setFollowUp, setStatus,
  type Lead, type LeadStatus, type LeadEvent, RESOLVED, STATUSES,
} from './ledger';
import { sendTo } from './outbound';
import { render, TEMPLATES, templateById, priceOf } from './templates';

export interface LeadsEnv {
  FOLLOWUPS?: KVNamespace;
  PANEL?: KVNamespace;
  ASSETS?: Fetcher;
  EMAIL?: { send(message: any): Promise<unknown> };
  SUBMISSIONS_FROM?: string;
  REPLY_TO?: string;
  LISTING_PRICE_USD?: string;
  PAYPAL_LINK?: string;
}

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const NOT_FOUND = '<h1>Not found</h1><p class="sub">That link is not valid.</p>';
const DAY = 24 * 60 * 60 * 1000;
const since = (iso?: string): number =>
  iso ? Math.floor((Date.now() - Date.parse(iso)) / DAY) : -1;
const ago = (n: number): string => (n === 0 ? 'today' : `${n} day${n === 1 ? '' : 's'} ago`);
const today = (): string => new Date().toISOString().slice(0, 10);

const LABEL: Record<LeadStatus, string> = {
  arrived: 'Arrived', quoted: 'Quoted', chased: 'Chased',
  closed: 'Closed', won: 'Won', lost: 'Lost',
};

/** Days after arrival with no reply at which a lead is shouted about rather than listed. */
const STALE_DAYS = 7;

const CSS = ':root{--ink:#0A0A0C;--soft:#3B3C43;--muted:#6F7079;--line:#E7E7E2;--ground:#F6F6F3;'
  + '--warn:#B4541B;--good:#1C6B4A}'
  + 'body{font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--ground);'
  + 'color:var(--ink);margin:0;padding:28px 18px}main{max-width:1120px;margin:0 auto}'
  + 'h1{font-size:1.3rem;margin:0 0 4px}h2{font-size:1rem;margin:26px 0 10px}'
  + '.sub{color:var(--muted);margin:0 0 22px}'
  + 'a{color:#15306B}a:hover{color:#0A1D45}'
  + '.row{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 18px}'
  + '.stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 16px;min-width:116px}'
  + '.stat b{display:block;font-size:1.5rem;line-height:1.1}'
  + '.stat span{color:var(--muted);font-size:.82rem}'
  + '.alert{background:#FFF8EC;border:1px solid #F0DCB0;border-radius:12px;padding:12px 16px;'
  + 'margin:0 0 18px;color:#6A3B10}.alert b{color:var(--warn)}'
  + '.alert ul{margin:6px 0 0;padding-left:18px}'
  + 'table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);'
  + 'border-radius:12px;overflow:hidden}'
  + 'th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}'
  + 'th{font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);'
  + 'background:#FBFBF9}tr:last-child td{border-bottom:0}'
  + 'td.firm{font-weight:600;max-width:22ch}td small{display:block;color:var(--muted);font-weight:400}'
  + '.tag{display:inline-block;font-size:.76rem;padding:2px 9px;border-radius:999px;border:1px solid var(--line)}'
  + '.closed{background:#EEF0F4;border-color:#D8DCE4}.won{background:#E8F6EF;border-color:#BFE6D4;color:var(--good)}'
  + '.lost{background:#F4EFEF;border-color:#E0D2D2;color:#7A4A4A}'
  + '.chased{background:#FDF1DC;border-color:#F0DCB0}.quoted{background:#EAF1FB;border-color:#CBDCF4}'
  + '.arrived{background:#F2F2EE}'
  + '.score{font-variant-numeric:tabular-nums;font-weight:600}'
  + '.none{color:var(--warn)}'
  + '.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 16px}'
  + '.card dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0}'
  + '.card dt{color:var(--muted)}.card dd{margin:0}'
  // The same dossier cell is drawn in a table row and in this card. In the row its <small>
  // parts are already block, from the td rule; in the card they were inline and ran the slug
  // straight into the pillar line as one word.
  + '.card small{display:block;color:var(--muted)}'
  + 'form{display:inline}fieldset{border:1px solid var(--line);border-radius:12px;background:#fff;'
  + 'padding:14px 16px;margin:0 0 14px}legend{color:var(--muted);font-size:.82rem;padding:0 6px}'
  + 'button{font:inherit;padding:7px 13px;border-radius:9px;border:1px solid var(--line);'
  + 'background:#fff;cursor:pointer;margin:0 6px 6px 0}button:hover{background:#F2F2EE}'
  + 'button.go{background:var(--ink);color:#fff;border-color:var(--ink)}button.go:hover{background:#2A2A30}'
  + 'button[disabled]{opacity:.42;cursor:not-allowed}'
  + 'input,select,textarea{font:inherit;padding:6px 9px;border:1px solid var(--line);'
  + 'border-radius:8px;background:#fff;margin:0 6px 6px 0}'
  + 'textarea{width:100%;font:13.5px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;display:block}'
  + '.hist{list-style:none;margin:0;padding:0}'
  + '.hist li{border-bottom:1px solid var(--line);padding:7px 0;display:flex;gap:12px}'
  + '.hist li:last-child{border-bottom:0}'
  + '.hist time{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}'
  + '.hist .who{color:var(--muted);font-size:.8rem}'
  + '.back{display:inline-block;margin:0 0 14px}'
  + '.empty{background:#fff;border:1px solid var(--line);border-radius:12px;padding:22px;color:var(--muted)}';

function shell(title: string, body: string, status = 200): Response {
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow">'
    + `<title>${esc(title)}</title><style>${CSS}</style><main>${body}</main>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
        'referrer-policy': 'no-referrer',
      },
    },
  );
}

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

const hidden = (token: string, extra: Record<string, string> = {}): string =>
  `<input type="hidden" name="t" value="${esc(token)}">`
  + Object.entries(extra).map(([k, v]) =>
    `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');

/** The dossier as one cell: what we publish about this firm, or why we do not. */
function dossierCell(d: Dossier): string {
  if (d.unknown) return '<small>index unavailable</small>';
  if (d.firm) {
    const [code, scored, max] = d.firm.w;
    return `<span class="score">${d.firm.sc}</span> <span class="tag">${esc(d.firm.t)}</span>`
      + `<small><a href="${esc(d.url)}">${esc(d.firm.s)}</a></small>`
      + `<small>pillar ${esc(code)} ${scored}/${max}`
      + `${d.firm.g ? `, ${d.firm.g[1]} to ${esc(d.firm.g[0])}` : ''}</small>`;
  }
  if (!d.covered) {
    return `<span class="none">${esc((d.state ?? '').toUpperCase())} not published</span>`
      + '<small>no profile is possible today</small>';
  }
  return '<span class="none">no profile</span><small>not matched in the directory</small>';
}

function statsFor(leads: Lead[]): string {
  const won = leads.filter(l => l.status === 'won');
  const resolved = leads.filter(l => RESOLVED.includes(l.status));
  const open = leads.filter(l => !RESOLVED.includes(l.status));
  const last30 = leads.filter(l => since(l.arrived_at) >= 0 && since(l.arrived_at) <= 30);
  const rate = resolved.length ? Math.round((won.length / resolved.length) * 100) : 0;
  const money = won.reduce((n, l) => n + (l.amount ?? 0), 0);

  // Time to the first thing a person sent, which is the number the desk is judged on. The
  // automated acknowledgement does not count: it is not an answer, and counting it would have
  // reported a healthy figure through the month four firms waited a fortnight.
  const replied = leads
    .map(l => (l.events ?? []).find(e => e.kind === 'email' && e.by === 'owner'))
    .map((e, i) => (e ? (Date.parse(e.at) - Date.parse(leads[i].arrived_at)) / DAY : null))
    .filter((n): n is number => n !== null && Number.isFinite(n))
    .sort((a, b) => a - b);
  const median = replied.length
    ? Math.round(replied[Math.floor(replied.length / 2)] * 10) / 10
    : null;

  return [
    [String(leads.length), 'enquiries, all time'],
    [String(last30.length), 'in the last 30 days'],
    [String(open.length), 'still open'],
    [`${rate}%`, `won of ${resolved.length} resolved`],
    [money ? `$${money.toLocaleString('en-US')}` : '$0', 'booked from won leads'],
    [median === null ? 'never' : `${median}d`, 'median to a human reply'],
  ].map(([n, label]) => `<div class="stat"><b>${esc(n)}</b><span>${esc(label)}</span></div>`).join('');
}

/** The two things that need shouting: nobody answered, and a date went by. */
function alerts(leads: Lead[], token: string): string {
  const stale = leads.filter(l =>
    !RESOLVED.includes(l.status)
    && !(l.events ?? []).some(e => e.kind === 'email' && e.by === 'owner')
    && since(l.arrived_at) >= STALE_DAYS);
  const due = leads.filter(l =>
    !RESOLVED.includes(l.status) && l.follow_up_at && l.follow_up_at <= today());

  const list = (rows: Lead[], why: (l: Lead) => string) => '<ul>' + rows.map(l =>
    `<li><a href="?t=${esc(token)}&amp;id=${esc(l.id)}">${esc(l.firm)}</a>, ${esc(why(l))}</li>`)
    .join('') + '</ul>';

  let out = '';
  if (stale.length) {
    out += `<div class="alert"><b>${stale.length} waiting on a person</b>, `
      + `${STALE_DAYS} days or more since the enquiry with nothing sent by hand.`
      + list(stale, l => ago(since(l.arrived_at))) + '</div>';
  }
  if (due.length) {
    out += `<div class="alert"><b>${due.length} follow-up${due.length === 1 ? '' : 's'} due</b>.`
      + list(due, l => `set for ${l.follow_up_at}`) + '</div>';
  }
  return out;
}

async function listPage(env: LeadsEnv, token: string): Promise<Response> {
  const leads = await listLeads(env, 400);
  const dossiers = await Promise.all(leads.map(l => dossierFor(env, l)));

  const rows = leads.map((l, i) => {
    const age = since(l.arrived_at);
    return '<tr>'
      + `<td class="firm"><a href="?t=${esc(token)}&amp;id=${esc(l.id)}">${esc(l.firm)}</a>`
      + `<small>${esc(l.contact)}</small></td>`
      + `<td>${dossierCell(dossiers[i])}</td>`
      + `<td><a href="mailto:${esc(l.email)}">${esc(l.email)}</a>`
      + `${l.city ? `<small>${esc(l.city)}</small>` : ''}</td>`
      + `<td>${esc(l.request ?? '')}</td>`
      + `<td><span class="tag ${esc(l.status)}">${esc(LABEL[l.status] ?? l.status)}</span>`
      + `${l.amount ? `<small>$${l.amount.toLocaleString('en-US')}</small>` : ''}`
      + `${l.follow_up_at ? `<small>due ${esc(l.follow_up_at)}</small>` : ''}</td>`
      + `<td>${esc(l.arrived_at.slice(0, 10))}<small>${esc(ago(age))}</small></td>`
      + '</tr>';
  }).join('');

  const table = leads.length
    ? '<table><tr><th>Firm</th><th>What we publish</th><th>Contact</th><th>Asked for</th>'
      + '<th>Status</th><th>Arrived</th></tr>' + rows + '</table>'
    : '<div class="empty">No enquiries recorded yet. Rows appear here from the moment the next '
      + 'one arrives.</div>';

  return shell('Leads', '<h1>Leads</h1>'
    + '<p class="sub">Every enquiry, newest first. Open one to write to it.</p>'
    + `<div class="row">${statsFor(leads)}</div>`
    + alerts(leads, token)
    + table);
}

function history(events: LeadEvent[]): string {
  if (!events.length) return '<p class="sub">Nothing recorded before the ledger existed.</p>';
  return '<ul class="hist">' + [...events].reverse().map(e =>
    `<li><time>${esc(e.at.slice(0, 16).replace('T', ' '))}</time>`
    + `<span>${esc(e.detail)} <span class="who">${esc(e.by)}</span></span></li>`).join('')
    + '</ul>';
}

async function detailPage(
  env: LeadsEnv, token: string, id: string, tpl?: string, note?: string,
): Promise<Response> {
  const lead = await getLead(env, id);
  if (!lead) return shell('Not found', NOT_FOUND, 404);
  const d = await dossierFor(env, lead);
  const back = `<a class="back" href="?t=${esc(token)}">&larr; All leads</a>`;

  const facts = [
    ['Contact', `${esc(lead.contact)} &middot; <a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>`],
    ['Website', lead.website ? `<a href="${esc(lead.website)}">${esc(lead.website)}</a>` : 'not given'],
    ['Market', `${esc(lead.city ?? 'not given')}${lead.practice ? ` &middot; ${esc(lead.practice)}` : ''}`],
    ['Asked for', esc(lead.request ?? 'not given')],
    ['Arrived', `${esc(lead.arrived_at.slice(0, 10))}, ${esc(ago(since(lead.arrived_at)))}`],
    ['We publish', dossierCell(d)],
    lead.note ? ['Note', esc(lead.note)] : null,
    lead.reason ? ['Outcome', esc(lead.reason)] : null,
  ].filter(Boolean) as [string, string][];

  const card = '<div class="card"><dl>'
    + facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')
    + '</dl></div>';

  // A template that cannot honestly be sent to this lead is shown disabled, with the reason on
  // it, rather than hidden. Hiding it makes the desk wonder where it went; saying "we do not
  // publish that state" is the answer it wanted.
  const buttons = TEMPLATES.map(t => {
    const why = t.blocks(lead, d);
    return `<form method="get"><input type="hidden" name="t" value="${esc(token)}">`
      + `<input type="hidden" name="id" value="${esc(lead.id)}">`
      + `<input type="hidden" name="tpl" value="${esc(t.id)}">`
      + `<button${why ? ` disabled title="${esc(why)}"` : ` title="${esc(t.blurb)}"`}>`
      + `${esc(t.label)}</button></form>`;
  }).join('');

  let preview = '';
  if (tpl) {
    const made = render(tpl, lead, d, env);
    if (!made) {
      preview = '<div class="alert">No template by that name.</div>';
    } else if (made.blocked) {
      preview = `<div class="alert"><b>Not sendable:</b> ${esc(made.blocked)}</div>`;
    } else {
      const rows = Math.min(34, made.letter.text.split('\n').length + 2);
      preview = '<form method="post"><fieldset>'
        + `<legend>Edit, then send to ${esc(lead.email)}</legend>`
        + hidden(token, { id: lead.id, action: 'send', tpl })
        + `<input name="subject" value="${esc(made.letter.subject)}" style="width:100%">`
        + `<textarea name="body" rows="${rows}">${esc(made.letter.text)}</textarea>`
        + `<button class="go">Send to ${esc(lead.email)}</button>`
        + `<a href="?t=${esc(token)}&amp;id=${esc(lead.id)}">Cancel</a>`
        + '</fieldset></form>';
    }
  }

  const statusForm = '<form method="post"><fieldset><legend>Status</legend>'
    + hidden(token, { id: lead.id, action: 'status' })
    + '<select name="to">'
    + STATUSES.map(s =>
      `<option value="${esc(s)}"${s === lead.status ? ' selected' : ''}>${esc(LABEL[s])}</option>`)
      .join('')
    + '</select>'
    + `<input name="amount" type="number" min="0" step="1" placeholder="amount, if won" `
    + `value="${lead.amount ?? ''}" style="width:150px">`
    + '<input name="reason" placeholder="why, in your words" style="width:280px" '
    + `value="${esc(lead.reason ?? '')}">`
    + '<button>Set status</button></fieldset></form>';

  const followForm = '<form method="post"><fieldset><legend>Come back to this</legend>'
    + hidden(token, { id: lead.id, action: 'followup' })
    + `<input name="date" type="date" value="${esc(lead.follow_up_at ?? '')}">`
    + '<button>Set date</button>'
    + '<span class="sub" style="margin:0 0 0 8px">Empty clears it.</span>'
    + '</fieldset></form>';

  const noteForm = '<form method="post"><fieldset><legend>Note</legend>'
    + hidden(token, { id: lead.id, action: 'note' })
    + '<input name="text" placeholder="what happened" style="width:420px">'
    + '<button>Add note</button></fieldset></form>';

  const said = note ? `<div class="alert">${esc(note)}</div>` : '';

  return shell(lead.firm, back
    + `<h1>${esc(lead.firm)}</h1>`
    + `<p class="sub"><span class="tag ${esc(lead.status)}">${esc(LABEL[lead.status])}</span>`
    + ` &middot; ${priceOf(env) ? `list price ${priceOf(env)} USD` : 'no price configured'}</p>`
    + said
    + card
    + `<h2>Write to them</h2><div class="row">${buttons}</div>${preview}`
    + `<h2>Record what happened</h2>${statusForm}${followForm}${noteForm}`
    + `<h2>History</h2><div class="card">${history(lead.events ?? [])}</div>`);
}

/** Back to the lead, as a redirect, so a refresh never repeats the write. */
const backTo = (token: string, id: string, said: string): Response =>
  new Response(null, {
    status: 303,
    headers: {
      location: `/api/leads?t=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`
        + `&said=${encodeURIComponent(said)}`,
      'cache-control': 'no-store',
    },
  });

async function act(env: LeadsEnv, form: FormData, token: string): Promise<Response> {
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  const lead = await getLead(env, id);
  if (!lead) return shell('Not found', NOT_FOUND, 404);

  if (action === 'status') {
    const to = String(form.get('to') ?? '') as LeadStatus;
    const amount = Number(form.get('amount'));
    await setStatus(env, id, to, {
      reason: String(form.get('reason') ?? '').trim() || undefined,
      amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
    });
    return backTo(token, id, `Status set to ${LABEL[to] ?? to}.`);
  }

  if (action === 'note') {
    await addNote(env, id, String(form.get('text') ?? ''));
    return backTo(token, id, 'Note added.');
  }

  if (action === 'followup') {
    const date = String(form.get('date') ?? '').trim();
    await setFollowUp(env, id, date);
    return backTo(token, id, date ? `Follow-up set for ${date}.` : 'Follow-up cleared.');
  }

  if (action === 'send') {
    const subject = String(form.get('subject') ?? '').trim();
    const body = String(form.get('body') ?? '').trim();
    const tpl = String(form.get('tpl') ?? '');
    if (!subject || !body) return backTo(token, id, 'Nothing sent: the letter was empty.');
    if (!env.EMAIL) return backTo(token, id, 'Nothing sent: no mail binding on this Worker.');

    // The template is re-checked at the moment of sending, not only when it was drawn. The
    // page the person is posting from may have been open for an hour, and the thing it is
    // blocked on, such as a state we do not publish, is exactly the mistake worth catching
    // twice.
    const spec = templateById(tpl);
    if (spec) {
      const why = spec.blocks(lead, await dossierFor(env, lead));
      if (why) return backTo(token, id, `Nothing sent: ${why}.`);
    }

    try {
      await sendTo(env as any, lead.email, subject, body, true);
    } catch (err) {
      console.error('lead send failed', id, err);
      return backTo(token, id, 'Send failed. Nothing went out and nothing was recorded.');
    }
    await recordSend(env, id, `sent "${subject}"${tpl ? ` (${tpl})` : ''}`, 'owner');
    // Quoted rather than chased: the desk writing for the first time is the quote going out,
    // and a lead that was already chased stays chased because setStatus is not called here.
    if (lead.status === 'arrived') await setStatus(env, id, 'quoted');
    return backTo(token, id, `Sent to ${lead.email}.`);
  }

  return backTo(token, id, 'Nothing to do.');
}

export async function handleLeads(request: Request, env: LeadsEnv, url: URL): Promise<Response> {
  if (!env.PANEL) {
    return shell('Unavailable', '<h1>Unavailable</h1>'
      + '<p class="sub">No namespace is bound for the access token.</p>', 503);
  }

  if (request.method === 'POST') {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return shell('Not found', NOT_FOUND, 404);
    }
    // The token comes out of the body here. A request that can send mail has no business
    // putting its credential in a URL, where it lands in history and in Referer.
    const ok = await allowed(env, String(form.get('t') ?? ''));
    if (!ok) return shell('Not found', NOT_FOUND, 404);
    return act(env, form, String(form.get('t') ?? ''));
  }

  const token = url.searchParams.get('t') ?? '';
  const ok = await allowed(env, token);
  if (ok === null) {
    return shell('Unavailable', '<h1>Unavailable</h1>'
      + '<p class="sub">No namespace is bound for the access token.</p>', 503);
  }
  if (!ok) return shell('Not found', NOT_FOUND, 404);

  const id = url.searchParams.get('id');
  if (id) {
    return detailPage(env, token, id,
      url.searchParams.get('tpl') ?? undefined,
      url.searchParams.get('said') ?? undefined);
  }
  return listPage(env, token);
}
