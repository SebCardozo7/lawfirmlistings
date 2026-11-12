/**
 * The prospecting side of the desk: the firms we publish and have never spoken to.
 *
 * The leads view answers the firms that found us, which last month was six. This one is the
 * other direction, and it is the larger number by two orders of magnitude: 1,388 published
 * firms, each on a median of thirteen of our own pages, 566 of them with a contact address
 * their own site gave up. None of them has ever been told any of it.
 *
 * What this page is for is one click per firm. Everything a letter needs is already in the
 * Worker, so the view's whole job is to put the next firm in front of a person, show them the
 * letter it would send, and let them send it or skip it. The rules live in worker/prospects.ts
 * and are re-checked at the moment of sending rather than trusted from the page that drew the
 * button, because the page may have been open for an hour and somebody may have unsubscribed
 * in it.
 *
 * The daily cap is the one rule that lives here rather than there, because it is a property of
 * the queue and not of a firm. A domain that has sent a few dozen emails in its life does not
 * send 566 in an afternoon and still get delivered in the morning, and the same domain carries
 * the replies to real leads and the panel sign-ins. Twenty-five a day is slow on purpose: at
 * that rate the whole list takes a month, and a month of warming is what the domain needs
 * anyway.
 */
import { firmByDomain, logoFor, type FirmEntry } from './dossier';
import { newLeadId, recordLead } from './ledger';
import { pagesFor } from './pages';
import {
  canSend, getProspect, listProspects, nextBatch, optOut, putProspect, tally,
  type Prospect, type ProspectStatus,
} from './prospects';
import { sendTo } from './outbound';
import { verificationLetter } from './verifyletter';
import { columns, rows, stacked } from './charts';
import {
  BUILD_HOUR, SEND_FROM, SEND_TO, approveBatch, batchState, capFor, dayOf, getBatch,
  leadsToken, proposeBatch, type Batch, type BatchState,
} from './batch';

import { composer, isPreview, previewHtml, readCompose, type ComposeState } from './composer';
import {
  ROUTE, ago, avatar, esc, fig, hidden, link, shell, since, today, visit, type Nav,
} from './deskui';

export interface ProspectPageEnv {
  FOLLOWUPS?: KVNamespace;
  ASSETS?: Fetcher;
  EMAIL?: { send(message: any): Promise<unknown> };
  SUBMISSIONS_FROM?: string;
  SUBMISSIONS_TO?: string;
  REPLY_TO?: string;
  POSTAL_ADDRESS?: string;
}

/**
 * Letters a day, which is not a fixed number and not a setting.
 *
 * It ramps with how many have ever gone out, because a domain that has sent a few dozen
 * emails in its life and then sends 25 a day gets filed as spam, and this one also carries
 * the replies to real leads and the panel sign-ins. worker/batch.ts owns the steps, and the
 * manual send on these pages obeys the same one the cron does: two different daily limits in
 * one system is one limit and one bug.
 */
export const dailyCap = (all: Prospect[]): number =>
  capFor(all.filter(p => p.sent_at).length);

/** The ceiling the ramp reaches, which is what the pages call "of N". */
export const CAP = 25;

const LABEL: Record<ProspectStatus, string> = {
  new: 'Not written to', queued: 'Queued', sent: 'Written to', replied: 'Replied',
  bounced: 'Bounced', unsubscribed: 'Unsubscribed', client: 'Client',
};

const sentToday = (all: Prospect[]): number =>
  all.filter(p => (p.sent_at ?? '').slice(0, 10) === today()).length;

/** Who may still be written to at all, ignoring today's cap. */
const writable = (all: Prospect[]): Prospect[] =>
  all.filter(p => p.status === 'new' || p.status === 'queued');

function figures(all: Prospect[]): string {
  const t = tally(all);
  const left = writable(all).length;
  const answered = t.replied;
  const reach = t.sent + t.replied;
  const rate = reach ? Math.round((answered / reach) * 100) : 0;
  const cap = dailyCap(all);
  const room = Math.max(0, cap - sentToday(all));

  return [
    fig(String(t.total), 'firms with an address'),
    fig(String(left), 'never written to'),
    fig(String(t.sent + t.replied), 'letters sent'),
    fig(String(answered), 'replied', answered ? 'lit' : undefined),
    fig(reach ? `${rate}%` : 'n/a', `answered of ${reach} reached`),
    fig(String(room), `left to send today, of ${cap}`, room === 0 ? 'hot' : undefined),
  ].join('');
}

/**
 * Four charts, and the one that matters is the second.
 *
 * How many of our pages carry a firm is the whole argument of the letter: a firm on twenty
 * pages has twenty reasons to care whether those pages are right, and a firm on three has
 * three. It is also the queue's sort order, so seeing the shape of it is seeing what the first
 * week of sending will look like.
 */
function charts(all: Prospect[]): string {
  const t = tally(all);

  const split = stacked({
    title: 'Where the list stands',
    note: `${all.length} firms`,
    parts: [
      { label: 'Never written to', value: t.new + t.queued, tone: 'quiet' },
      { label: 'Written to', value: t.sent, tone: 'one' },
      { label: 'Replied', value: t.replied, tone: 'good' },
      { label: 'Unsubscribed', value: t.unsubscribed, tone: 'warn' },
      { label: 'Bounced', value: t.bounced, tone: 'dead' },
      { label: 'Clients, never written to', value: t.client, tone: 'three' },
    ],
    unit: 'firms',
  });

  // Buckets rather than a bar per firm: 566 bars is a smear, and the question the chart
  // answers is how many firms have a strong opening line, not which ones.
  const edges: [string, (n: number) => boolean][] = [
    ['1-4', n => n <= 4],
    ['5-9', n => n >= 5 && n <= 9],
    ['10-14', n => n >= 10 && n <= 14],
    ['15-19', n => n >= 15 && n <= 19],
    ['20+', n => n >= 20],
  ];
  const spread = columns({
    title: 'Pages of ours each firm is on',
    note: 'the opening line of the letter, in one number',
    data: edges.map(([label, test]) => ({
      label,
      value: all.filter(p => test(p.pages ?? 0)).length,
      tone: 'two' as const,
    })),
    unit: 'buckets',
  });

  const byState = new Map<string, number>();
  for (const p of all) {
    const s = String(p.state ?? '').toUpperCase() || 'unknown';
    byState.set(s, (byState.get(s) ?? 0) + 1);
  }
  const states = rows({
    title: 'Firms with an address, by state',
    note: 'where the sending actually is',
    data: [...byState.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ label, value, tone: 'one' as const })),
    unit: 'states',
  });

  // Fourteen days, oldest first, so the cap is visible as a ceiling the bars sit under.
  const days: { label: string; value: number; tone: 'three' }[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({
      label: d.slice(8),
      value: all.filter(p => (p.sent_at ?? '').slice(0, 10) === d).length,
      tone: 'three',
    });
  }
  const pace = columns({
    title: 'Letters sent a day',
    note: `the cap today is ${dailyCap(all)}, and it ramps to ${CAP}`,
    data: days,
    unit: 'days',
  });

  return `<div class="charts">${split}${spread}${states}${pace}</div>`;
}

/** What the firm's profile says, drawn the same way the lead desk draws it. */
function firmBlock(firm: FirmEntry | undefined, pages: string[]): string {
  if (!firm) {
    return '<div class="dossier none">Not in the index'
      + '<span class="sub">no profile to write about, so no letter</span></div>';
  }
  const [code, scored, max] = firm.w;
  const pct = Math.round((scored / Math.max(1, max)) * 100);
  return '<div class="dossier"><div class="top">'
    + `<span class="num">${firm.sc}</span><span class="pill">${esc(firm.t)}</span></div>`
    + `<a href="https://lawfirmlistings.com/firms/${esc(firm.s)}/" target="_blank" `
    + `rel="noopener">/firms/${esc(firm.s)}/</a>`
    + `<div class="bar"><i style="width:${pct}%"></i></div>`
    + `<div class="gap">Pillar ${esc(code)}, ${scored} of ${max}`
    + `${firm.g ? ` &middot; ${firm.g[1]} to ${esc(firm.g[0])}` : ''}`
    + ` &middot; on ${pages.length} of our pages</div></div>`;
}

const nav = (token: string, all: Prospect[], open: number): Nav => ({
  here: 'prospects', token, open, waiting: writable(all).length,
});

/**
 * The warning that stops everything, shown first because nothing below it can run.
 *
 * US commercial email is governed by CAN-SPAM, which requires a physical postal address in
 * every message and prices a breach per message sent. The letter builder returns an error
 * rather than a letter when the address is missing, so without this banner the desk would
 * show 566 firms and refuse each one individually with no explanation of the common cause.
 */
function postalWarning(env: ProspectPageEnv): string {
  if ((env.POSTAL_ADDRESS ?? '').trim()) return '';
  return '<div class="flag"><b>No postal address is configured, so nothing can be sent.</b> '
    + 'CAN-SPAM requires a physical address in every commercial email and prices a breach per '
    + 'message. Set it with <code>npx wrangler secret put POSTAL_ADDRESS</code> and every '
    + 'letter below starts working.</div>';
}

/**
 * When the next letters go out, in one sentence, at the top of the view.
 *
 * "When do the emails get sent" has six different true answers depending on where the day is,
 * and a page that says nothing leaves a person guessing at which one applies. Each state here
 * says the time as well as the fact, because the whole point of handing the sending to a cron
 * is that a person stops having to watch it.
 */
function batchBanner(state: BatchState, token: string): string {
  const at = `${SEND_FROM}:00 and ${SEND_TO}:00 UTC`;
  const open = (b: Batch, label: string) =>
    ` <a href="${esc(link(ROUTE.batch, token, { on: b.on }))}">${esc(label)}</a>`;

  switch (state.kind) {
    case 'none':
      return '<div class="flag"><b>No batch is waiting.</b> One is proposed for '
        + `${esc(state.on)} at ${BUILD_HOUR}:00 UTC today and emailed to you. Nothing is sent `
        + 'until you approve it.'
        // A POST and not a link. The same reason the approval is a POST: mail scanners and
        // link previewers follow every URL they are shown, and a GET that builds a batch is
        // a batch built by a robot that was reading the owner's inbox.
        + `<form method="post" action="${esc(ROUTE.prospects)}" style="margin-top:10px">`
        + hidden(token, { action: 'propose' })
        + '<button class="send" name="go" value="1">Propose one now</button>'
        + '</form></div>';
    case 'waiting':
      return `<div class="flag"><b>${state.batch.slugs.length} letters are waiting on you</b> `
        + `for ${esc(state.batch.on)}. Nothing goes out until you approve them, and a batch `
        + 'nobody approves is simply dropped.'
        + open(state.batch, 'Read the list and approve') + '</div>';
    case 'declined':
      return `<div class="flag"><b>Nothing approved for ${esc(state.batch.on)}.</b> `
        + 'No letters go out that day. A fresh list is proposed the following afternoon.'
        + open(state.batch, 'Change that') + '</div>';
    case 'approved':
      return `<div class="said"><b>${state.left} approved for ${esc(state.batch.on)}</b>, `
        + `going out between ${at}, a couple every quarter of an hour.`
        + open(state.batch, 'See the list') + '</div>';
    case 'sending':
      return `<div class="said"><b>Sending now.</b> ${state.left} of `
        + `${state.batch.approved?.length ?? 0} still to go today, finishing by ${SEND_TO}:00 `
        + 'UTC.' + open(state.batch, 'See the list') + '</div>';
    case 'done':
      return `<div class="said"><b>${state.batch.sent.length} sent on `
        + `${esc(state.batch.on)}.</b> The next list is proposed at ${BUILD_HOUR}:00 UTC and `
        + 'emailed to you.' + open(state.batch, 'See it') + '</div>';
    default:
      return '';
  }
}

/**
 * The page the link in that email opens.
 *
 * It opens. It does not send, and it does not approve: mail scanners follow links in incoming
 * messages to see where they go, so a GET that approved a day's sending would be a GET that a
 * spam filter performs on the owner's behalf. Approving is a POST from the form below, which
 * is the same rule worker/unsubscribe.ts follows for the opposite reason.
 *
 * Every row is ticked when it arrives, because the list has already passed every rule we have
 * and the person is here to catch the thing a rule cannot: that this address belongs to the
 * firm's web developer rather than to the firm.
 */
export async function batchPage(
  env: ProspectPageEnv, token: string, on: string, openLeads: number, said?: string,
): Promise<Response> {
  const all = await listProspects(env);
  // With no day on the URL, the batch that matters: today's if there is one, otherwise
  // tomorrow's. The link in the email always names a day, so this is the case where somebody
  // has bookmarked the page, and sending them to a 404 for today when five letters are
  // waiting for tomorrow is the wrong answer to the right question.
  const current = await batchState(env);
  const batch = await getBatch(env,
    on || ('batch' in current ? current.batch.on : dayOf(new Date())));
  if (!batch) {
    return shell('No batch', nav(token, all, openLeads),
      `<a class="back" href="${esc(link(ROUTE.prospects, token))}">&larr; Prospecting</a>`
      + '<h1>No batch for that day</h1>'
      + '<p class="lede">A batch is built at '
      + `${BUILD_HOUR}:00 UTC for the following day, and only when somebody is waiting and a `
      + 'postal address is configured.</p>', 404);
  }

  const rows: Prospect[] = [];
  for (const slug of batch.slugs) {
    const p = await getProspect(env, slug);
    if (p) rows.push(p);
  }
  const firms = await Promise.all(rows.map(p => firmByDomain(env, p.domain)));
  const decided = batch.approved;
  const ticked = (slug: string) => (decided ? decided.includes(slug) : true);
  const gone = (slug: string) => batch.sent.includes(slug);

  const table = '<div class="sheet"><div class="scroll"><table><thead><tr>'
    + '<th>Send</th><th>Firm</th><th>Score</th><th>On our pages</th><th>Address</th>'
    + '<th></th></tr></thead><tbody>'
    + rows.map((p, i) => {
      const out = gone(p.slug);
      return '<tr>'
        + `<td><input type="checkbox" name="slug" value="${esc(p.slug)}"`
        + `${ticked(p.slug) && !out ? ' checked' : ''}${out ? ' disabled' : ''} `
        + `aria-label="Send to ${esc(p.name)}"></td>`
        + '<td><div class="who">' + avatar(p.name, logoFor(firms[i], p.domain)) + '<div>'
        + `<a class="name" href="${esc(link(ROUTE.prospect(p.slug), token))}">`
        + `${esc(p.name)}</a><span class="sub">${esc(p.domain)}</span>`
        + `<span class="sub">${visit(p.domain)}</span></div></div></td>`
        + `<td>${firms[i] ? `<span class="num">${firms[i]!.sc}</span> `
          + `<span class="pill">${esc(firms[i]!.t)}</span>`
          : '<span class="warnish">not in the index</span>'}</td>`
        + `<td class="num">${p.pages}</td>`
        + `<td>${esc(p.email)}</td>`
        + `<td>${out ? '<span class="pill sent">Sent</span>'
          : `<a href="${esc(link(ROUTE.prospect(p.slug), token))}">Read the letter</a>`}</td>`
        + '</tr>';
    }).join('')
    + '</tbody></table></div></div>';

  const form = `<form method="post" action="${esc(ROUTE.batch)}">`
    + hidden(token, { on: batch.on, action: 'approve' })
    + table
    + '<div class="row" style="margin-top:12px">'
    + `<button class="send" name="go" value="1">Approve the ticked for ${esc(batch.on)}</button>`
    + '<button name="none" value="1">Send none that day</button>'
    + '</div></form>';

  const state = decided
    ? `<p class="lede">${decided.length} of ${batch.slugs.length} approved on `
      + `${esc(String(batch.approved_at).slice(0, 16).replace('T', ' '))}. `
      + `${batch.sent.length} sent so far. You can still change it until they go out.</p>`
    : '<p class="lede">Nothing is approved yet, so nothing will be sent. Untick anybody who '
      + 'should not hear from us: an address that belongs to a web developer or a service '
      + 'rather than to the firm is what this page exists to catch.</p>';

  return shell(`Batch for ${batch.on}`, nav(token, all, openLeads),
    `<a class="back" href="${esc(link(ROUTE.prospects, token))}">&larr; Prospecting</a>`
    + `<div class="mast"><h1>${batch.slugs.length} letters for ${esc(batch.on)}</h1>`
    + `<span class="note">going out between ${SEND_FROM}:00 and ${SEND_TO}:00 UTC</span></div>`
    + state
    + (said ? `<div class="said">${esc(said)}</div>` : '')
    + postalWarning(env)
    + form);
}

/**
 * `now` is a parameter and not `new Date()` inside because the banner says different things
 * at different hours, and a test that reads it with whatever time it happens to be run at is
 * a test that passes in the morning and fails after lunch. This one did: it asserted the
 * wording for an approved batch and got the wording for one that is already going out.
 */
export async function prospectsPage(
  env: ProspectPageEnv, token: string, openLeads: number, said?: string,
  now = new Date(),
): Promise<Response> {
  const all = await listProspects(env);
  if (!all.length) {
    return shell('Prospecting', nav(token, all, openLeads),
      '<h1>Prospecting</h1>'
      + '<p class="lede">Nothing is loaded yet.</p>'
      + '<div class="empty">The list comes from <code>scripts/crawl_emails.py</code>, which '
      + 'reads a contact address off each firm\'s own site, and is written into KV by '
      + '<code>node scripts/load_prospects.mjs</code>. Until that has run there is nobody to '
      + 'write to.</div>');
  }

  const room = Math.max(0, dailyCap(all) - sentToday(all));
  const { ready, blocked } = await nextBatch(env, Math.max(room, 1));
  const queue = ready.slice(0, room);

  const firms = await Promise.all(queue.map(p => firmByDomain(env, p.domain)));

  const queueRows = queue.map((p, i) => {
    const f = firms[i];
    return '<tr>'
      + '<td><div class="who">' + avatar(p.name, logoFor(f, p.domain)) + '<div>'
      + `<a class="name" href="${esc(link(ROUTE.prospect(p.slug), token))}">`
      + `${esc(p.name)}</a><span class="sub">${esc(p.domain)}</span>`
      + `<span class="sub">${visit(p.domain)}</span>`
      + '</div></div></td>'
      + `<td>${f ? `<span class="num">${f.sc}</span> <span class="pill">${esc(f.t)}</span>`
        : '<span class="warnish">not in the index</span>'}</td>`
      + `<td class="num">${p.pages}</td>`
      + `<td>${esc(String(p.state ?? '').toUpperCase())}</td>`
      + `<td>${esc(p.email)}</td>`
      + `<td><a href="${esc(link(ROUTE.prospect(p.slug), token))}">Read the letter</a></td>`
      + '</tr>';
  }).join('');

  const queueTable = queue.length
    ? '<div class="sheet"><div class="scroll"><table><thead><tr>'
      + '<th>Firm</th><th>Score</th><th>On our pages</th><th>State</th><th>Address</th>'
      + '<th></th></tr></thead><tbody>' + queueRows + '</tbody></table></div></div>'
    : `<div class="empty">${room === 0
      ? `Today's ${dailyCap(all)} are sent. The queue refills at midnight UTC.`
      : 'Nobody is waiting. Every firm on the list has been written to, replied, '
        + 'unsubscribed or is a client.'}</div>`;

  const recent = all
    .filter(p => p.sent_at)
    .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))
    .slice(0, 12);

  // The index is already loaded and cached by the queue above, so these are free lookups.
  const recentFirms = await Promise.all(recent.map(r => firmByDomain(env, r.domain)));

  const recentTable = recent.length
    ? '<h2>Written to, most recent first</h2><div class="sheet"><div class="scroll">'
      + '<table><thead><tr><th>Firm</th><th>Sent</th><th>Status</th><th>What happened</th>'
      + '</tr></thead><tbody>' + recent.map((p, i) =>
        '<tr>'
        + '<td><div class="who">' + avatar(p.name, logoFor(recentFirms[i], p.domain)) + '<div>'
        + `<a class="name" href="${esc(link(ROUTE.prospect(p.slug), token))}">`
        + `${esc(p.name)}</a><span class="sub">${esc(p.email)}</span>`
        + '</div></div></td>'
        + `<td>${esc(String(p.sent_at).slice(0, 10))}`
        + `<span class="sub">${esc(ago(since(p.sent_at)))}</span></td>`
        + `<td><span class="pill ${esc(p.status)}">${esc(LABEL[p.status] ?? p.status)}</span></td>`
        + `<td>${esc(p.note ?? '')}</td></tr>`).join('')
      + '</tbody></table></div></div>'
    : '';

  // Blocked rows are shown rather than dropped. A firm missing from the queue with no
  // explanation is a firm somebody goes looking for in KV.
  const held = blocked.length
    ? `<h2>Held back</h2><div class="sheet"><div class="scroll"><table><thead><tr>`
      + '<th>Firm</th><th>Why</th></tr></thead><tbody>' + blocked.slice(0, 10).map(b =>
        `<tr><td>${esc(b.p.name)}</td><td>${esc(b.why)}</td></tr>`).join('')
      + '</tbody></table></div></div>'
    : '';

  return shell('Prospecting', nav(token, all, openLeads),
    '<div class="mast"><h1>Prospecting</h1>'
    + `<span class="note">as of ${esc(today())}</span></div>`
    + '<p class="lede">Firms we already publish and have never spoken to. The letter asks '
    + 'whether what we publish about them is right. It names no price and offers no listing: '
    + 'a firm that answers hears about that from a person, in the reply.</p>'
    + (said ? `<div class="said">${esc(said)}</div>` : '')
    + postalWarning(env)
    + batchBanner(await batchState(env, now), token)
    + `<div class="figures">${figures(all)}</div>`
    + charts(all)
    + `<h2>Next ${queue.length === 1 ? 'one' : queue.length} to write to, most-listed first</h2>`
    + queueTable
    + recentTable
    + held);
}

/** The buttons that record what came back, which is the only way a row ever leaves the queue. */
function outcomeForms(token: string, p: Prospect): string {
  const to = ROUTE.prospect(p.slug);
  const one = (action: string, label: string, hint: string) =>
    `<form method="post" action="${esc(to)}">`
    + hidden(token, { slug: p.slug, action })
    + `<button title="${esc(hint)}">${esc(label)}</button></form>`;

  return '<div class="row">'
    + one('replied', 'They replied', 'Opens a lead for this firm and moves it to the lead desk')
    + one('bounced', 'Bounced', 'The address does not exist. Nothing more is sent to it')
    + one('optout', 'They asked to be left alone',
      'Records the opt-out by address, forever, exactly as the link in the letter would')
    + '</div>';
}

export async function prospectPage(
  env: ProspectPageEnv, token: string, slug: string, openLeads: number,
  state: ComposeState, said?: string, draft?: { subject: string; text: string },
  now = new Date(),
): Promise<Response> {
  const all = await listProspects(env);
  const p = await getProspect(env, slug);
  if (!p) {
    return shell('Not found', nav(token, all, openLeads),
      '<h1>Not found</h1><p class="lede">No prospect under that slug.</p>', 404);
  }

  const [firm, pages] = await Promise.all([firmByDomain(env, p.domain), pagesFor(env, p.slug)]);
  const built = verificationLetter(p, pages, firm, env);
  const why = await canSend(env, p);
  const cap = dailyCap(all);
  const room = Math.max(0, cap - sentToday(all));

  let body: string;
  if (built.blocked) {
    body = `<div class="blocked"><b>No letter.</b> ${esc(built.blocked)}</div>`;
  } else if (why) {
    // Still rendered, so the desk can read what was sent. Just not sendable.
    body = `<div class="blocked"><b>Not sendable:</b> ${esc(why)}.</div>`
      + '<div class="screen" style="margin-top:12px">'
      // allow-same-origin and no allow-scripts, for the reason set out in composer.ts: a bare
      // sandbox stops the browser requesting the logo, so the letter looks broken here and
      // arrives intact.
      + '<iframe title="The letter" sandbox="allow-same-origin" '
      + `srcdoc="${esc(previewHtml(built.letter!.text, state))}">`
      + '</iframe></div>';
  } else if (room === 0) {
    body = `<div class="blocked"><b>Today's ${cap} are sent.</b> The cap exists so the domain `
      + 'that carries our replies and sign-ins keeps being delivered. This one goes out '
      + 'tomorrow.</div>';
  } else {
    body = composer({
      token,
      action: ROUTE.prospect(p.slug),
      extra: { slug: p.slug },
      to: p.email,
      subject: draft?.subject ?? built.letter!.subject,
      text: draft?.text ?? built.letter!.text,
      state,
      foot: 'First and only contact. worker/prospects.ts refuses a second letter to this firm '
        + 'whatever happens next.',
    });
  }

  // Which batch this firm is in, if any, so the row answers "when does this one go out"
  // rather than leaving a person to work it out from the banner on the other page.
  // The clock is a parameter here for the same reason it is one on the list page. "Goes out"
  // is read off the batch for the day this is asked about, so a guard that set up a batch for
  // one day and read the page on another found no batch at all and failed on a Tuesday what
  // passed on a Monday.
  const sending = await batchState(env, now);
  const inBatch = 'batch' in sending && sending.batch.slugs.includes(p.slug)
    ? sending.batch : null;
  const when = !inBatch ? null
    : inBatch.sent.includes(p.slug) ? 'already sent in that batch'
    : !inBatch.approved ? `proposed for ${inBatch.on}, waiting on you`
    : inBatch.approved.includes(p.slug)
      ? `approved for ${inBatch.on}, between ${SEND_FROM}:00 and ${SEND_TO}:00 UTC`
      : `left out of the batch for ${inBatch.on}`;

  const facts = [
    ['Status', `<span class="pill ${esc(p.status)}">${esc(LABEL[p.status] ?? p.status)}</span>`],
    when ? ['Goes out', `${esc(when)}`
      + ` &middot; <a href="${esc(link(ROUTE.batch, token, { on: inBatch!.on }))}">the batch</a>`]
      : null,
    ['Address', esc(p.email)],
    ['Domain', esc(p.domain)],
    ['State', esc(String(p.state ?? '').toUpperCase())],
    ['On our pages', String(pages.length)],
    ['Added', esc(p.added_at)],
    p.sent_at ? ['Written to', `${esc(p.sent_at.slice(0, 10))}, ${esc(ago(since(p.sent_at)))}`] : null,
    p.note ? ['Note', esc(p.note)] : null,
  ].filter(Boolean) as [string, string][];

  const pageList = pages.length
    ? '<ul class="hist">' + pages.slice(0, 8).map(u =>
      `<li><a href="${esc(u)}" target="_blank" rel="noopener">`
      + `${esc(u.replace('https://lawfirmlistings.com', ''))}</a></li>`).join('')
      + (pages.length > 8 ? `<li class="by">and ${pages.length - 8} more</li>` : '')
      + '</ul>'
    : '<p class="meta">On no page of ours, which is why there is nothing to ask about.</p>';

  return shell(p.name, nav(token, all, openLeads),
    `<a class="back" href="${esc(link(ROUTE.prospects, token))}">&larr; Prospecting</a>`
    + '<div class="mast">'
    + avatar(p.name, logoFor(firm, p.domain), 30)
    + `<h1>${esc(p.name)}</h1>`
    + visit(p.domain)
    + `<span class="note">${esc(p.domain)}</span></div>`
    + '<p class="lede">Never written to from our side unless the history below says otherwise.</p>'
    + (said ? `<div class="said">${esc(said)}</div>` : '')
    + postalWarning(env)
    + '<div class="sheet"><div class="inside"><div class="side">'
    + '<p class="eyebrow">What we publish</p>' + firmBlock(firm, pages)
    + '<p class="eyebrow">The row</p><dl>'
    + facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')
    + '</dl>'
    + '<p class="eyebrow">Record what came back</p>' + outcomeForms(token, p)
    + '<p class="eyebrow">The pages it is on</p>' + pageList
    + '</div><div class="main">'
    + '<p class="eyebrow">The letter</p>'
    + body
    + '</div></div></div>');
}

const backTo = (
  path: string, token: string, said: string, extra: Record<string, string> = {},
): Response => {
  const q = new URLSearchParams({ t: token, ...extra, said });
  return new Response(null, {
    status: 303,
    headers: { location: `${path}?${q.toString()}`, 'cache-control': 'no-store' },
  });
};

/**
 * Everything the prospecting view can do, and the order of the checks is the point.
 *
 * A preview changes nothing and answers with a page. Everything else writes, and answers 303,
 * so a refresh cannot send a law firm a second copy of a letter that promises to be the only
 * one.
 */
export async function prospectAct(
  env: ProspectPageEnv, form: FormData, token: string, openLeads: number,
): Promise<Response> {
  // Proposing is about a day too, and carries no slug either. It builds the list and emails
  // it, which is the same thing the cron does at 17:00 UTC and nothing more: no letter
  // reaches a firm until somebody comes back and ticks the boxes.
  if (String(form.get('action') ?? '') === 'propose') {
    const made = await proposeBatch(env, await leadsToken(env), new Date(), true);
    if (!made.built && !made.notified) {
      return backTo(ROUTE.prospects, token,
        'Nothing proposed. Either a batch for that day already exists, or there is nobody '
        + 'left to write to, or no postal address is configured.');
    }
    return backTo(ROUTE.prospects, token, made.notified
      ? `${made.built} proposed and emailed to you. Nothing goes out until you approve it.`
      : `${made.built} proposed, but the email did not go out. Open the list from here.`);
  }

  // Approving a batch is about a day rather than about a firm, so it is answered before the
  // row lookup below, which would 404 on a form that carries no slug.
  if (String(form.get('action') ?? '') === 'approve') {
    const on = String(form.get('on') ?? '');
    // "Send none" is a decision and is recorded as one, rather than being the same thing as
    // never having opened the page. The difference matters to the banner and to anybody
    // wondering tomorrow why nothing went out.
    const slugs = form.get('none') ? [] : form.getAll('slug').map(String);
    const batch = await approveBatch(env, on, slugs);
    if (!batch) return backTo(ROUTE.prospects, token, 'No batch for that day.');
    return backTo(ROUTE.batch, token,
      slugs.length
        ? `${batch.approved?.length ?? 0} approved for ${on}. They go out between `
          + `${SEND_FROM}:00 and ${SEND_TO}:00 UTC that day.`
        : `Nothing will be sent on ${on}.`,
      { on });
  }

  const slug = String(form.get('slug') ?? '');
  const p = await getProspect(env, slug);
  if (!p) {
    return shell('Not found', null, '<h1>Not found</h1>', 404);
  }
  const state = readCompose(form);

  if (isPreview(form)) {
    const text = String(form.get('body') ?? '');
    if (form.get('fragment')) {
      return new Response(previewHtml(text, state), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    return prospectPage(env, token, slug, openLeads, state, undefined,
      { subject: String(form.get('subject') ?? ''), text });
  }

  const action = String(form.get('action') ?? '');
  const where = ROUTE.prospect(slug);

  if (action === 'bounced') {
    await putProspect(env, { ...p, status: 'bounced', note: 'the address did not exist' });
    return backTo(where, token, 'Marked as bounced. Nothing more goes to that address.');
  }

  if (action === 'optout') {
    await optOut(env, p.email, 'a reply asking to be left alone');
    return backTo(where, token,
      'Recorded. That address is blocked for good, whatever any row says later.');
  }

  if (action === 'replied') {
    // A reply is the moment this stops being prospecting. The lead desk is where a
    // conversation with a price in it belongs, and the two rows point at each other so
    // neither view loses the other half of the story.
    const id = newLeadId();
    await recordLead(env, {
      firm: p.name,
      contact: p.name,
      email: p.email,
      website: `https://${p.domain}/`,
      city: String(p.state ?? '').toUpperCase(),
      request: 'Replied to the letter asking whether our pages about them are right',
    }, id, 'prospecting');
    await putProspect(env, {
      ...p, status: 'replied', replied_at: new Date().toISOString(), lead_id: id,
      note: 'answered the letter',
    });
    return new Response(null, {
      status: 303,
      headers: {
        location: `${ROUTE.lead(id)}?t=${encodeURIComponent(token)}`
          + `&said=${encodeURIComponent('Opened from the prospecting letter.')}`,
        'cache-control': 'no-store',
      },
    });
  }

  if (action === 'send') {
    const subject = String(form.get('subject') ?? '').trim();
    const body = String(form.get('body') ?? '').trim();
    if (!subject || !body) return backTo(where, token, 'Nothing sent: the letter was empty.');
    if (!env.EMAIL) return backTo(where, token, 'Nothing sent: no mail binding on this Worker.');
    if (!(env.POSTAL_ADDRESS ?? '').trim()) {
      return backTo(where, token,
        'Nothing sent: no postal address is configured, and CAN-SPAM requires one.');
    }

    // Both gates again, at the moment of sending. The page that drew this button may have
    // been open for an hour, and in that hour somebody may have unsubscribed or the day's
    // cap may have been reached by another tab.
    const why = await canSend(env, p);
    if (why) return backTo(where, token, `Nothing sent: ${why}.`);
    const all = await listProspects(env);
    if (sentToday(all) >= dailyCap(all)) {
      return backTo(where, token,
        `Nothing sent: today's ${dailyCap(all)} are already out.`);
    }

    try {
      // Commercial, like the batch: a prospect is by definition a firm that never wrote to us,
      // whether the letter leaves from here or from the cron.
      await sendTo(env as any, p.email, subject, body, state.restrained, true);
    } catch (err) {
      console.error('prospect send failed', slug, err);
      return backTo(where, token, 'Send failed. Nothing went out and nothing was recorded.');
    }
    await putProspect(env, {
      ...p, status: 'sent', sent_at: new Date().toISOString(),
      note: `asked whether our pages are right: "${subject}"`,
    });
    return backTo(ROUTE.prospects, token, `Sent to ${p.email}. That firm is now done.`);
  }

  return backTo(where, token, 'Nothing to do.');
}
