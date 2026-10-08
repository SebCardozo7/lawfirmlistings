/**
 * The firm panel: a law firm signs in and works on what this directory publishes about it.
 *
 * The first version of this was one form on one page, and it was not a panel. A firm that is
 * paying for a listing arrives expecting what every other directory gives it, which is a left
 * rail and somewhere to go: a dashboard that says where it stands, a place to fix its details, a
 * place to put its logo, a place to offer the reviews and the results it wants shown, and a page
 * that explains what happens to any of it. That is what this is.
 *
 * One rule runs through all of it and it is the reason the directory is worth anything: nothing
 * a firm submits is published by submitting it. Every section writes a pending item, an email
 * arrives with one button, and pressing that button approves it. Until then the firm sees the
 * item sitting in review and the public profile has not moved.
 *
 * What is deliberately absent. Messages and billing, because neither exists yet and a dead link
 * in a paid product is worse than a short menu. Anything that writes a score, a gate or a tier,
 * because those are measured and no amount of money or editing changes them. The panel says so on
 * the dashboard, where a firm is most likely to expect otherwise.
 */
import { EmailMessage } from 'cloudflare:email';
import { mime } from './mail';
import {
  SESSION_SECONDS, clearCookie, cookieHeader, readCookie, sign, verify, verifyPassword,
} from './auth';

export interface PanelEnv {
  ASSETS: Fetcher;
  EMAIL: { send(message: EmailMessage): Promise<void> };
  /** Accounts and pending items. One namespace, two key prefixes. */
  PANEL?: KVNamespace;
  /** Signs the session cookie and the one-click approval link. A Worker secret. */
  PANEL_SECRET?: string;
  SUBMISSIONS_TO?: string;
  SUBMISSIONS_FROM?: string;
}

interface Account { slug: string; name: string; domain: string; hash: string; }

type Kind = 'profile' | 'logo' | 'review' | 'result';

const LIMITS: Record<string, number> = {
  phone: 40, fee_model: 60, languages: 200, availability: 400, office: 200, note: 2000,
  review_text: 1200, review_author: 120, review_source: 300,
  result_title: 160, result_description: 900, result_amount: 40, result_docket: 80,
  result_type: 80, result_source: 300,
};

/** A logo is a logo. Anything larger is a photograph somebody dragged in by mistake. */
const MAX_LOGO_BYTES = 512 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/** An approval link has to outlive a weekend and a holiday, and not much more. */
const APPROVAL_SECONDS = 14 * 24 * 60 * 60;

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAV: { href: string; label: string; group: string }[] = [
  { href: '/claim/dashboard', label: 'Dashboard', group: 'Overview' },
  { href: '/claim/profile', label: 'Edit profile', group: 'Overview' },
  { href: '/claim/logo', label: 'Logo', group: 'Overview' },
  { href: '/claim/reviews', label: 'Reviews', group: 'What you publish' },
  { href: '/claim/results', label: 'Case results', group: 'What you publish' },
  { href: '/claim/score', label: 'Your score', group: 'What we measured' },
  { href: '/claim/faq', label: 'How this works', group: 'What we measured' },
];

const CSS = `
:root{--ink:#14121a;--soft:#4a4654;--muted:#7a7686;--line:#e6e3ec;--paper:#fff;--bg:#faf9fc;
--accent:#6D28D9;--night:#14121a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.shell{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100vh}
aside{background:var(--night);color:#fff;padding:22px 0 40px}
aside .brand{padding:0 22px 22px;font-weight:650;letter-spacing:-.01em}
aside .brand small{display:block;color:#b9b4c6;font-weight:400;font-size:.8rem;margin-top:3px}
aside .firm{padding:14px 22px;margin:0 0 10px;border-top:1px solid #2a2733;border-bottom:1px solid #2a2733}
aside .firm b{display:block;font-size:.95rem;line-height:1.3}
aside .firm span{color:#b9b4c6;font-size:.8rem}
aside h4{color:#8b8699;font-size:.7rem;letter-spacing:.11em;text-transform:uppercase;
margin:20px 22px 7px;font-weight:600}
aside a{display:block;padding:9px 22px;color:#ddd9e6;text-decoration:none;font-size:.93rem;
border-left:3px solid transparent}
aside a:hover{background:#1d1a26;color:#fff}
aside a.on{background:#1d1a26;color:#fff;border-left-color:var(--accent)}
aside .out{margin-top:26px;padding:0 22px}
aside .out a{padding:0;color:#8b8699;font-size:.84rem;border:0}
main{padding:34px 36px 80px;max-width:860px}
h1{font-size:1.55rem;letter-spacing:-.02em;margin:0 0 6px}
h2{font-size:1.04rem;margin:30px 0 10px}
p{margin:0 0 14px}
.lede{color:var(--soft)}
.card{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:22px;margin:18px 0}
label{display:block;font-size:.84rem;font-weight:600;margin:16px 0 5px}
.card label:first-of-type{margin-top:0}
input[type=text],input[type=password],input[type=file],textarea,select{width:100%;padding:10px 12px;
border:1px solid var(--line);border-radius:9px;font:inherit;background:#fff;color:var(--ink)}
textarea{min-height:96px;resize:vertical}
.help{font-size:.8rem;color:var(--muted);margin:5px 0 0}
button{background:var(--accent);color:#fff;border:0;border-radius:9px;padding:11px 20px;
font:inherit;font-weight:600;cursor:pointer}
button.ghost{background:transparent;color:var(--soft);border:1px solid var(--line)}
.row{display:flex;gap:10px;align-items:center;margin-top:22px;flex-wrap:wrap}
.note{background:#f4f1fd;border:1px solid #e0d7fb;border-radius:11px;padding:14px 16px;
font-size:.9rem;margin:16px 0}
.bad{background:#fdf2f2;border-color:#f6d5d5;color:#8c2b2b}
.ok{background:#f0f9f3;border-color:#cfe9d8;color:#1f6b3b}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;
background:var(--line);border:1px solid var(--line);border-radius:13px;overflow:hidden;margin:18px 0}
.stat{background:var(--paper);padding:18px 18px 16px}
.stat b{display:block;font-size:1.9rem;line-height:1;letter-spacing:-.02em;
font-variant-numeric:tabular-nums}
.stat span{display:block;font-size:.84rem;color:var(--muted);margin-top:6px;line-height:1.35}
.stat.key b{color:var(--accent)}
.sub{font-size:.84rem;color:var(--muted);border-top:1px solid var(--line);padding:9px 0}
.sub b{font-variant-numeric:tabular-nums;color:var(--ink)}
.item{border:1px solid var(--line);border-radius:11px;padding:14px 16px;margin:10px 0;
background:var(--paper);font-size:.92rem}
.item .when{color:var(--muted);font-size:.8rem}
.pill{display:inline-block;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;
font-weight:650;padding:3px 9px;border-radius:999px;background:#f4f1fd;color:var(--accent)}
.pill.done{background:#f0f9f3;color:#1f6b3b}
a{color:var(--accent)}
img.logo{max-width:150px;max-height:80px;border:1px solid var(--line);border-radius:10px;
padding:10px;background:#fff}
@media(max-width:760px){.shell{grid-template-columns:1fr}aside{padding-bottom:14px}main{padding:24px 20px 60px}}
`;

function html(title: string, body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} | Law Firm Listings</title><style>${CSS}</style></head><body>${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
}

function shell(active: string, firm: { name: string; slug: string; city: string; state: string },
                title: string, body: string, status = 200) {
  let nav = '';
  let group = '';
  for (const item of NAV) {
    if (item.group !== group) { group = item.group; nav += `<h4>${esc(group)}</h4>`; }
    nav += `<a href="${item.href}"${item.href === active ? ' class="on"' : ''}>${esc(item.label)}</a>`;
  }
  return html(title, `<div class="shell">
<aside>
  <div class="brand">Law Firm Listings<small>Firm panel</small></div>
  <div class="firm"><b>${esc(firm.name)}</b><span>${esc(firm.city)}, ${esc(firm.state)}</span></div>
  ${nav}
  <div class="out"><a href="/firms/${esc(firm.slug)}/">View public profile</a><br>
    <a href="/claim/logout">Sign out</a></div>
</aside>
<main>${body}</main></div>`, status);
}

function loginPage(message?: string, status = 200, headers: Record<string, string> = {}) {
  return html('Sign in', `<main style="max-width:430px;margin:70px auto;padding:0 20px">
    <h1>Sign in</h1>
    <p class="lede">Use the credential we sent you. One account per firm, issued by hand.</p>
    ${message ? `<div class="note bad">${esc(message)}</div>` : ''}
    <form method="post" action="/claim/login" class="card">
      <label for="u">Firm ID</label>
      <input id="u" name="slug" type="text" autocomplete="username" required
             placeholder="the-name-in-your-profile-url">
      <p class="help">The last part of your profile address, after /firms/.</p>
      <label for="p">Password</label>
      <input id="p" name="password" type="password" autocomplete="current-password" required>
      <div class="row"><button type="submit">Sign in</button></div>
    </form>
    <p class="help">No account yet? Write to us from <a href="/list-your-firm/">the listing page</a>.</p>
  </main>`, status, headers);
}

async function account(env: PanelEnv, slug: string): Promise<Account | null> {
  if (!env.PANEL) return null;
  const raw = await env.PANEL.get(`account:${slug}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as Account; } catch { return null; }
}

async function firmData(env: PanelEnv, request: Request, slug: string): Promise<any | null> {
  const url = new URL(request.url);
  url.pathname = `/api/firm/${slug}.json`;
  url.search = '';
  const res = await env.ASSETS.fetch(new Request(url.toString(), { method: 'GET' }));
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

async function session(env: PanelEnv, request: Request): Promise<string | null> {
  if (!env.PANEL_SECRET) return null;
  const token = readCookie(request);
  if (!token) return null;
  const claims = await verify(env.PANEL_SECRET, token);
  return typeof claims?.slug === 'string' ? claims.slug : null;
}

/** Everything this firm has sent, newest first, so each section can show its own. */
async function submissions(env: PanelEnv, slug: string, kind?: Kind): Promise<any[]> {
  if (!env.PANEL) return [];
  const list = await env.PANEL.list({ prefix: `pending:${slug}:` });
  const out: any[] = [];
  for (const k of list.keys) {
    const raw = await env.PANEL.get(k.name);
    if (!raw) continue;
    try {
      const item = JSON.parse(raw);
      if (!kind || item.kind === kind) out.push(item);
    } catch { /* a record we cannot read is not a record to show */ }
  }
  return out.sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
}

function statusPill(s: string) {
  return s === 'approved'
    ? '<span class="pill done">Approved</span>'
    : '<span class="pill">In review</span>';
}

function submittedList(items: any[], render: (i: any) => string): string {
  if (!items.length) return '<p class="help">Nothing sent yet.</p>';
  return items.map(i => `<div class="item">${statusPill(i.status)}
    <span class="when">&nbsp; ${esc(String(i.submitted_at).slice(0, 10))}</span>
    <div style="margin-top:8px">${render(i)}</div></div>`).join('');
}

async function store(env: PanelEnv, request: Request, d: any, kind: Kind, payload: any,
                     subject: string, lines: string[]): Promise<void> {
  const key = `pending:${d.slug}:${Date.now()}`;
  const record = {
    key, kind, slug: d.slug, name: d.name, domain: d.domain,
    submitted_at: new Date().toISOString(), status: 'pending', ...payload,
  };
  await env.PANEL!.put(key, JSON.stringify(record));
  if (!env.SUBMISSIONS_TO || !env.SUBMISSIONS_FROM) return;
  const url = new URL(request.url);
  const token = await sign(env.PANEL_SECRET!, { key }, APPROVAL_SECONDS);
  const body = [
    `${d.name} sent ${subject}.`, '', ...lines, '',
    'Approve:', `${url.origin}/claim/approve?t=${token}`, '',
    `Profile: ${url.origin}/firms/${d.slug}/`, `Submitted ${record.submitted_at}`,
  ].join('\n');
  try {
    await env.EMAIL.send(new EmailMessage(env.SUBMISSIONS_FROM, env.SUBMISSIONS_TO,
      mime(env.SUBMISSIONS_FROM, env.SUBMISSIONS_TO, `${d.name}: ${subject}`, body)));
  } catch (err) {
    // The item is stored either way. A mail that did not send is ours to notice, not a reason to
    // tell a firm its submission vanished.
    console.error('panel mail failed', err);
  }
}

const field = (f: FormData, n: string, limit = 200) =>
  String(f.get(n) ?? '').trim().slice(0, LIMITS[n] ?? limit);

// ---------------------------------------------------------------------------- sections

function dashboard(d: any, pending: any[]): string {
  const open = pending.filter(p => p.status !== 'approved');
  const s = d.score;
  return `<h1>Dashboard</h1>
  <p class="lede">Where your profile stands, and what is in our hands right now.</p>
  <div class="stats">
    <div class="stat key"><b>${esc(s?.total ?? '—')}</b><span>out of 100 &middot; ${esc(s?.tier ?? 'not scored')}</span></div>
    <div class="stat"><b>${d.outbound_link?.followed ? 'Followed' : 'Nofollow'}</b><span>your outbound link</span></div>
    <div class="stat"><b>${open.length}</b><span>item${open.length === 1 ? '' : 's'} with us for review</span></div>
    <div class="stat"><b>${esc((d.editable.offices ?? []).length)}</b><span>offices published</span></div>
  </div>
  <div class="note"><b>Your link is ${d.outbound_link?.followed ? 'followed' : 'nofollow'}.</b>
    ${esc(d.outbound_link?.rule ?? '')}</div>
  <h2>With us right now</h2>
  ${submittedList(open, i => esc(i.summary ?? i.kind))}
  <h2>What this panel does not change</h2>
  <p class="lede">Your score, your eligibility gates and your tier are measured, not entered. Nothing
    on these pages moves them, and a claimed profile is measured exactly the way an unclaimed one
    is. <a href="/claim/faq">How this works</a> explains what each section does reach.</p>`;
}

function profileForm(d: any, flash?: string, bad = false): string {
  const e = d.editable;
  const offices = (e.offices ?? []).map((o: any, i: number) => `
    <label for="o${i}">Office ${i + 1}${o.is_hq ? ' (head office)' : ''}</label>
    <input id="o${i}" name="office_${i}" type="text" value="${esc(o.address)}"
           placeholder="Street, city, state, ZIP">`).join('');
  return `<h1>Edit profile</h1>
  <p class="lede">The things you publish about yourself, so you are the right person to fix them.
    We review a change before it goes live, usually the same day.</p>
  ${flash ? `<div class="note ${bad ? 'bad' : 'ok'}">${esc(flash)}</div>` : ''}
  <form method="post" action="/claim/profile" class="card">
    <label for="phone">Phone</label>
    <input id="phone" name="phone" type="text" value="${esc(e.phone)}">
    ${offices}
    <label for="languages">Languages</label>
    <input id="languages" name="languages" type="text" value="${esc((e.languages ?? []).join(', '))}">
    <p class="help">Comma separated, and only the ones you publish on your own site.</p>
    <label for="fee_model">Fee model</label>
    <input id="fee_model" name="fee_model" type="text" value="${esc(e.fee_model)}"
           placeholder="Contingency, Flat fee, Hourly">
    <label for="free_consultation">Free consultation</label>
    <select id="free_consultation" name="free_consultation">
      <option value="yes"${e.free_consultation ? ' selected' : ''}>Yes</option>
      <option value="no"${e.free_consultation ? '' : ' selected'}>No</option>
    </select>
    <label for="availability">Availability</label>
    <input id="availability" name="availability" type="text"
           value="${esc((e.availability ?? []).join(', '))}">
    <p class="help">Comma separated: 24/7 intake line, hospital and home visits.</p>
    <label for="note">Anything else</label>
    <textarea id="note" name="note" placeholder="A sub-factor you want to appeal, or anything we have wrong."></textarea>
    <div class="row"><button type="submit">Send for review</button></div>
  </form>`;
}

function logoPage(d: any, pending: any[], flash?: string, bad = false): string {
  return `<h1>Logo</h1>
  <p class="lede">The mark beside your name on your profile and on every card you appear in.
    Where we have none, we draw your initials instead.</p>
  ${flash ? `<div class="note ${bad ? 'bad' : 'ok'}">${esc(flash)}</div>` : ''}
  <div class="card">
    <p><b>On your profile now</b></p>
    ${d.logo_file
      ? `<img class="logo" src="/logos/${esc(d.logo_file)}" alt="${esc(d.name)}">`
      : '<p class="help">No logo yet, so your profile shows your initials.</p>'}
  </div>
  <form method="post" action="/claim/logo" enctype="multipart/form-data" class="card">
    <label for="file">Upload a new one</label>
    <input id="file" name="file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" required>
    <p class="help">PNG, JPEG, WebP or SVG, up to 512KB. A transparent PNG or an SVG reads best,
      because your profile puts it on white and your card puts it on a tint.</p>
    <div class="row"><button type="submit">Send for review</button></div>
  </form>
  <h2>Sent</h2>
  ${submittedList(pending, i => `${esc(i.filename)} &middot; ${esc(i.bytes)} bytes`)}`;
}

function reviewsPage(d: any, pending: any[], flash?: string, bad = false): string {
  const published = (d.quotes ?? []).length;
  return `<h1>Reviews</h1>
  <p class="lede">Offer a review you want shown on your profile. We check it against the place it
    came from before it appears, which is the whole reason a reader believes the ones already
    there.</p>
  ${flash ? `<div class="note ${bad ? 'bad' : 'ok'}">${esc(flash)}</div>` : ''}
  <div class="stats">
    <div class="stat key"><b>${esc(d.google_rating ?? '—')}</b><span>your Google rating, counted automatically</span></div>
    <div class="stat"><b>${esc(d.google_count ?? '—')}</b><span>Google reviews counted</span></div>
    <div class="stat"><b>${published}</b><span>quoted on your profile</span></div>
  </div>
  <p class="help">Your rating and your review count come from your verified Google listings and are
    not editable here: they are measured, and pillar C scores them against your own market. What
    this page adds is the wording a reader sees quoted.</p>
  <form method="post" action="/claim/reviews" class="card">
    <label for="review_text">The review</label>
    <textarea id="review_text" name="review_text" required
      placeholder="Paste the client's own words. Do not edit them beyond trimming."></textarea>
    <label for="review_author">Who wrote it</label>
    <input id="review_author" name="review_author" type="text" required placeholder="First name and last initial is enough">
    <label for="review_source">Where it is published</label>
    <input id="review_source" name="review_source" type="text" required
           placeholder="https://  the Google, Avvo or Yelp page it appears on">
    <p class="help">We need the link because we read it. A review we cannot find published
      somewhere is not one we can quote.</p>
    <div class="row"><button type="submit">Send for review</button></div>
  </form>
  <h2>Sent</h2>
  ${submittedList(pending, i => `&ldquo;${esc(String(i.review_text).slice(0, 160))}&rdquo;<br>
    <span class="when">${esc(i.review_author)} &middot; ${esc(i.review_source)}</span>`)}`;
}

function resultsPage(d: any, pending: any[], flash?: string, bad = false): string {
  return `<h1>Case results</h1>
  <p class="lede">A result with a docket number can be checked against the court record, and that
    is the only kind this directory marks verified. Send one and we look it up.</p>
  ${flash ? `<div class="note ${bad ? 'bad' : 'ok'}">${esc(flash)}</div>` : ''}
  <div class="note">Published amounts on your own site are counted but never confirmed, and your
    profile says so. A docket number is what moves a result from counted to verified.</div>
  <form method="post" action="/claim/results" class="card">
    <label for="result_title">What it was</label>
    <input id="result_title" name="result_title" type="text" required
           placeholder="Rear-end collision, cervical fusion">
    <label for="result_type">Type of case</label>
    <input id="result_type" name="result_type" type="text" placeholder="Motor vehicle, premises, DWI">
    <label for="result_amount">Amount, if there is one</label>
    <input id="result_amount" name="result_amount" type="text" placeholder="$1,250,000">
    <p class="help">Leave it empty for a disposition. A criminal result has no figure and that is
      not a gap.</p>
    <label for="result_docket">Docket or index number</label>
    <input id="result_docket" name="result_docket" type="text" required
           placeholder="Index No. 512345/2024, Kings County">
    <label for="result_description">Anything a reader needs to understand it</label>
    <textarea id="result_description" name="result_description"></textarea>
    <div class="row"><button type="submit">Send for review</button></div>
  </form>
  <h2>Sent</h2>
  ${submittedList(pending, i => `${esc(i.result_title)}${i.result_amount ? ` &middot; ${esc(i.result_amount)}` : ''}<br>
    <span class="when">${esc(i.result_docket)}</span>`)}`;
}

function scorePage(d: any): string {
  if (!d.score) return '<h1>Your score</h1><p class="lede">This profile has no score yet.</p>';
  const rows = Object.entries(d.score.pillars ?? {}).flatMap(([, p]: [string, any]) =>
    (p.subs ?? []).map((s: any) => `<div class="sub"><b>${esc(s.code)}</b> ${esc(s.label ?? '')}
      &middot; ${esc(s.pts)}/${esc(s.max)} &middot; ${esc(s.source ?? '')}<br>${esc(s.evidence ?? '')}</div>`));
  const gates = Object.entries(d.gates ?? {}).map(([k, g]: [string, any]) =>
    `<div class="sub"><b>${esc(k)}</b> ${g.pass ? 'passed' : esc(g.source ?? 'not passed')}<br>${esc(g.evidence ?? '')}</div>`);
  return `<h1>Your score</h1>
  <p class="lede">Every sub-factor, what it scored and the evidence behind it. Nothing on this page
    is editable, by you or by us: it is written by the scoring engine from measured values.</p>
  <div class="stats">
    <div class="stat key"><b>${esc(d.score.total)}</b><span>out of 100 &middot; ${esc(d.score.tier)}</span></div>
    <div class="stat"><b>${esc(d.score.methodology)}</b><span>methodology version</span></div>
    <div class="stat"><b>${esc(d.score.computed_at)}</b><span>last computed</span></div>
  </div>
  <p class="lede">${esc(d.score.verdict ?? '')}</p>
  <h2>Eligibility gates</h2><div class="card">${gates.join('')}</div>
  <h2>Sub-factors</h2><div class="card">${rows.join('')}</div>`;
}

function faqPage(d: any): string {
  const qa: [string, string][] = [
    ['What happens to something I send?',
     'It is stored as a pending item and we are emailed. One of us reads it, checks it where it '
     + 'can be checked, and approves it. Approved items go into the next publish. Nothing you '
     + 'type appears on the site by typing it, and that is the reason a reader trusts what is '
     + 'already there.'],
    ['How long does it take?',
     'A detail correction is usually the same day. A case result takes as long as looking up the '
     + 'docket takes. An appeal against a sub-factor is answered within 30 days.'],
    ['Can I change my score?',
     'No, and neither can we by hand. The score is computed from measured values by one engine '
     + 'that runs over every firm in the directory the same way. What you can change is what it '
     + 'measures: publish your bar numbers, publish your fee terms, name your attorneys on a page '
     + 'we can read. Those move the number because they move the evidence.'],
    ['Why is my outbound link followed or not?',
     d.outbound_link?.rule ?? ''],
    ['You have something wrong and it is not on these pages.',
     'Use the free text box at the bottom of Edit profile. Anything we publish about you that is '
     + 'wrong is worth telling us about, whether or not there is a field for it here.'],
    ['Who can see this panel?',
     'One account per firm, issued by hand. There is no signup, because a directory of real '
     + 'businesses cannot let whoever arrives first claim a law firm.'],
  ];
  return `<h1>How this works</h1>
  <p class="lede">What each section does, and what happens after you press send.</p>
  <div class="card">${qa.map(([q, a]) =>
    `<p><b>${esc(q)}</b></p><p class="lede">${esc(a)}</p>`).join('')}</div>`;
}

// ---------------------------------------------------------------------------- router

export async function handlePanel(request: Request, env: PanelEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/claim';
  const secure = url.protocol === 'https:';

  if (!env.PANEL || !env.PANEL_SECRET) {
    // Naming the missing half, because the two are fixed in different places and "not configured"
    // sends somebody to read a Worker rather than a setting.
    return html('Not configured', `<main style="max-width:560px;margin:70px auto;padding:0 20px">
      <h1>The panel is not configured</h1><p class="lede">${
        !env.PANEL ? 'The PANEL KV namespace is not bound to this Worker.'
                   : 'The PANEL_SECRET secret is not set on this Worker.'}</p></main>`, 503);
  }

  if (path === '/claim/logout') {
    return new Response(null, { status: 302,
      headers: { location: '/claim/', 'set-cookie': clearCookie(secure) } });
  }

  // The approval link from the review email. It carries its own proof, so it works from a phone
  // with nobody signed in, which is how it will actually be pressed.
  if (path === '/claim/approve') {
    const claims = await verify(env.PANEL_SECRET, url.searchParams.get('t') ?? '');
    if (!claims?.key) {
      return html('Link expired', '<main style="max-width:560px;margin:70px auto;padding:0 20px">'
        + '<h1>That link is no longer valid</h1><p class="lede">An approval link lasts fourteen '
        + 'days. The item is still pending and nothing was lost.</p></main>', 410);
    }
    const raw = await env.PANEL.get(String(claims.key));
    if (!raw) {
      return html('Not found', '<main style="max-width:560px;margin:70px auto;padding:0 20px">'
        + '<h1>That item is no longer pending</h1></main>', 404);
    }
    const item = JSON.parse(raw);
    if (item.status !== 'approved') {
      item.status = 'approved';
      item.approved_at = new Date().toISOString();
      await env.PANEL.put(String(claims.key), JSON.stringify(item));
    }
    return html('Approved', `<main style="max-width:620px;margin:70px auto;padding:0 20px">
      <h1>Approved</h1><p class="lede">${esc(item.name)} &middot; ${esc(item.kind)}.</p>
      <p class="lede">Run <code>python scripts/apply_claims.py</code> to write it into the firm
      files. Nothing reaches the site until that runs and the build after it.</p></main>`);
  }

  const signedIn = await session(env, request);

  if (path === '/claim/login') {
    if (request.method !== 'POST') return loginPage();
    const form = await request.formData();
    const slug = String(form.get('slug') ?? '').trim().toLowerCase().slice(0, 120);
    const acc = await account(env, slug);
    // The same work and the same answer either way: a login that returns faster for a firm with
    // no account tells somebody which firms have one.
    const ok = await verifyPassword(String(form.get('password') ?? ''), acc?.hash
      ?? 'pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    if (!acc || !ok) return loginPage('That firm ID and password do not match.', 401);
    const token = await sign(env.PANEL_SECRET, { slug }, SESSION_SECONDS);
    return new Response(null, { status: 302,
      headers: { location: '/claim/dashboard', 'set-cookie': cookieHeader(token, secure) } });
  }

  if (path === '/claim' || path === '/claim/index') {
    return signedIn
      ? new Response(null, { status: 302, headers: { location: '/claim/dashboard' } })
      : loginPage();
  }
  if (!signedIn) return loginPage('Sign in to continue.', 401);

  const d = await firmData(env, request, signedIn);
  if (!d) {
    return html('Profile missing', '<main style="max-width:560px;margin:70px auto;padding:0 20px">'
      + '<h1>We cannot find that profile</h1><p class="lede">The account exists and the published '
      + 'profile does not, which should not happen. Please write to us.</p></main>', 404);
  }
  const who = { name: d.name, slug: d.slug, city: d.market.city, state: d.market.state };
  const at = (p: string, t: string, b: string, s = 200) => shell(p, who, t, b, s);

  if (path === '/claim/dashboard') {
    return at(path, 'Dashboard', dashboard(d, await submissions(env, d.slug)));
  }
  if (path === '/claim/score') return at(path, 'Your score', scorePage(d));
  if (path === '/claim/faq') return at(path, 'How this works', faqPage(d));

  if (path === '/claim/profile') {
    if (request.method !== 'POST') return at(path, 'Edit profile', profileForm(d));
    const form = await request.formData();
    const offices = (d.editable.offices ?? []).map((o: any, i: number) => ({
      ...o, address: String(form.get(`office_${i}`) ?? '').trim().slice(0, LIMITS.office) || o.address,
    }));
    const proposed: Record<string, unknown> = {
      phone: field(form, 'phone'),
      languages: field(form, 'languages').split(',').map(s => s.trim()).filter(Boolean),
      fee_model: field(form, 'fee_model'),
      free_consultation: form.get('free_consultation') === 'yes',
      availability: field(form, 'availability').split(',').map(s => s.trim()).filter(Boolean),
      offices,
    };
    const changes = Object.keys(proposed)
      .map(k => ({ field: k, from: (d.editable as any)[k], to: proposed[k] }))
      .filter(c => JSON.stringify(c.from) !== JSON.stringify(c.to));
    const note = field(form, 'note');
    if (!changes.length && !note) {
      return at(path, 'Edit profile', profileForm(d, 'Nothing changed, so nothing was sent.', true));
    }
    await store(env, request, d, 'profile',
      { changes, note, summary: `${changes.length} detail change(s)` },
      'a correction',
      [...changes.map(c => `${c.field}:\n  now:  ${JSON.stringify(c.from)}\n  asks: ${JSON.stringify(c.to)}`),
       note ? `\nNote:\n${note}` : ''].filter(Boolean));
    return at(path, 'Edit profile', profileForm(d,
      `Sent for review. ${changes.length} change${changes.length === 1 ? '' : 's'} recorded, and `
      + 'nothing on your public profile has moved yet.'));
  }

  if (path === '/claim/logo') {
    const mine = await submissions(env, d.slug, 'logo');
    if (request.method !== 'POST') return at(path, 'Logo', logoPage(d, mine));
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) {
      return at(path, 'Logo', logoPage(d, mine, 'Choose a file first.', true));
    }
    if (!LOGO_TYPES.includes(file.type)) {
      return at(path, 'Logo', logoPage(d, mine,
        `That is a ${file.type || 'file of unknown type'}. PNG, JPEG, WebP or SVG.`, true));
    }
    if (file.size > MAX_LOGO_BYTES) {
      return at(path, 'Logo', logoPage(d, mine,
        `That file is ${Math.round(file.size / 1024)}KB and the limit is 512KB.`, true));
    }
    // Base64 into the pending record rather than a second binding. A logo is tens of kilobytes
    // and KV holds 25MB a value, so an object store would be one more thing to create for no gain.
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (const b of buf) bin += String.fromCharCode(b);
    await store(env, request, d, 'logo',
      { filename: file.name.slice(0, 120), mime: file.type, bytes: file.size,
        data: btoa(bin), summary: `logo, ${file.name}` },
      'a logo', [`File: ${file.name}`, `Type: ${file.type}`, `Size: ${file.size} bytes`]);
    return at(path, 'Logo', logoPage(d, await submissions(env, d.slug, 'logo'),
      'Sent for review. Your profile still shows what it showed before.'));
  }

  if (path === '/claim/reviews') {
    const mine = await submissions(env, d.slug, 'review');
    if (request.method !== 'POST') return at(path, 'Reviews', reviewsPage(d, mine));
    const form = await request.formData();
    const text = field(form, 'review_text');
    const author = field(form, 'review_author');
    const source = field(form, 'review_source');
    if (!text || !author || !source) {
      return at(path, 'Reviews', reviewsPage(d, mine,
        'A review needs its wording, who wrote it and where it is published.', true));
    }
    await store(env, request, d, 'review',
      { review_text: text, review_author: author, review_source: source,
        summary: `review from ${author}` },
      'a review', [`"${text}"`, `By: ${author}`, `Published at: ${source}`]);
    return at(path, 'Reviews', reviewsPage(d, await submissions(env, d.slug, 'review'),
      'Sent for review. We read it at the link you gave before it appears.'));
  }

  if (path === '/claim/results') {
    const mine = await submissions(env, d.slug, 'result');
    if (request.method !== 'POST') return at(path, 'Case results', resultsPage(d, mine));
    const form = await request.formData();
    const title = field(form, 'result_title');
    const docket = field(form, 'result_docket');
    if (!title || !docket) {
      return at(path, 'Case results', resultsPage(d, mine,
        'A result needs what it was and a docket number we can look up.', true));
    }
    await store(env, request, d, 'result',
      { result_title: title, result_docket: docket,
        result_type: field(form, 'result_type'), result_amount: field(form, 'result_amount'),
        result_description: field(form, 'result_description'),
        summary: `case result, ${title}` },
      'a case result',
      [`Title: ${title}`, `Docket: ${docket}`, `Type: ${field(form, 'result_type')}`,
       `Amount: ${field(form, 'result_amount') || 'none stated'}`,
       field(form, 'result_description')].filter(Boolean));
    return at(path, 'Case results', resultsPage(d, await submissions(env, d.slug, 'result'),
      'Sent for review. We look the docket up before it is marked verified.'));
  }

  return at('/claim/dashboard', 'Not found', '<h1>Not found</h1>', 404);
}
