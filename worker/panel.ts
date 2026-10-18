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
/* The site's own tokens, copied rather than imported: the panel is served by the Worker and never
   goes through Astro, so it cannot reach src/styles/global.css. Keeping the values identical is
   what makes a firm feel it stayed on the same site when it signed in. */
:root{
  --ink:#0A0A0C;--ink-soft:#3B3C43;--muted:#6F7079;
  --line:#E7E7E2;--line-2:#D6D6D0;--ground:#F6F6F3;--paper:#fff;--tint:#EFEFEB;
  --night:#07080C;--night-2:#0E0F16;--night-line:rgba(255,255,255,.09);
  --on-night:#F4F4F1;--on-night-soft:#A7A9B4;
  --a1:#8B5CF6;--a2:#3B82F6;--a3:#5EEAD4;
  --aurora:linear-gradient(90deg,var(--a1),var(--a2) 55%,var(--a3));
  --link:#4F46E5;--success:#15A36B;
  --r:20px;--r-sm:12px;--pill:999px;
  --shadow-sm:0 1px 2px rgba(10,10,12,.05),0 2px 8px rgba(10,10,12,.04);
  --shadow:0 12px 32px -12px rgba(10,10,12,.18),0 2px 8px rgba(10,10,12,.05);
  --font:"Sofia Pro","Sofia Pro W01","Urbanist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:var(--font);font-size:16px;line-height:1.6;color:var(--ink-soft);
background:var(--ground);-webkit-font-smoothing:antialiased}
.shell{display:grid;grid-template-columns:272px minmax(0,1fr);min-height:100vh}

/* The rail. A single aurora hairline down its right edge is the whole brand signature: it is the
   same gradient the site puts under its headings, and it costs one pixel. */
aside{background:linear-gradient(170deg,var(--night-2),var(--night));color:var(--on-night-soft);
padding:22px 0 40px;position:relative}
aside::after{content:"";position:absolute;top:0;right:0;width:1px;height:100%;background:var(--aurora);opacity:.55}
.rail-brand{display:flex;align-items:center;gap:9px;padding:0 22px 20px;color:var(--on-night);
font-weight:700;font-size:.97rem;letter-spacing:-.02em;text-decoration:none}
.rail-brand i{width:22px;height:22px;border-radius:7px;background:var(--aurora);display:block;flex:0 0 auto}
.rail-firm{margin:0 14px 6px;padding:14px;border-radius:var(--r-sm);
background:rgba(255,255,255,.045);border:1px solid var(--night-line)}
.rail-firm .top{display:flex;align-items:center;gap:11px}
.rail-firm img{width:42px;height:42px;object-fit:contain;border-radius:9px;background:#fff;padding:4px;flex:0 0 auto}
.rail-firm .mono{width:42px;height:42px;border-radius:9px;background:var(--aurora);color:#0A0A0C;
display:grid;place-items:center;font-weight:700;font-size:.95rem;flex:0 0 auto}
.rail-firm b{display:block;color:var(--on-night);font-size:.9rem;line-height:1.25;font-weight:600}
.rail-firm small{display:block;color:var(--on-night-soft);font-size:.76rem;margin-top:2px}
.rail-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}
.tierpill{font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;font-weight:700;
padding:3px 9px;border-radius:var(--pill);background:var(--aurora);color:#0A0A0C}
.tierpill.flat{background:rgba(255,255,255,.1);color:var(--on-night-soft)}
.rail-site{display:block;margin-top:9px;color:var(--a3);font-size:.78rem;text-decoration:none;
overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rail-site:hover{text-decoration:underline}
aside h4{color:#6E6F7B;font-size:.68rem;letter-spacing:.13em;text-transform:uppercase;
margin:22px 22px 6px;font-weight:700}
aside nav a{display:flex;align-items:center;gap:9px;padding:9px 22px;color:var(--on-night-soft);
text-decoration:none;font-size:.92rem;border-left:2px solid transparent}
aside nav a:hover{background:rgba(255,255,255,.05);color:var(--on-night)}
aside nav a.on{background:rgba(255,255,255,.07);color:var(--on-night);border-left-color:var(--a1);font-weight:600}
aside nav a em{margin-left:auto;font-style:normal;font-size:.7rem;font-weight:700;
background:var(--a1);color:#fff;border-radius:var(--pill);padding:1px 7px}
.rail-out{margin:26px 22px 0;padding-top:16px;border-top:1px solid var(--night-line)}
.rail-out a{display:block;color:#6E6F7B;font-size:.8rem;text-decoration:none;padding:3px 0}
.rail-out a:hover{color:var(--on-night)}

main{padding:38px 40px 90px;max-width:900px}
h1{font-size:1.75rem;letter-spacing:-.025em;margin:0 0 7px;color:var(--ink);font-weight:650}
h2{font-size:1.06rem;margin:34px 0 10px;color:var(--ink);font-weight:650;letter-spacing:-.01em}
p{margin:0 0 14px}
.lede{color:var(--muted)}
.eyebrow{display:block;font-size:.72rem;font-weight:700;letter-spacing:.14em;
text-transform:uppercase;color:var(--muted);margin-bottom:9px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:24px;
margin:18px 0;box-shadow:var(--shadow-sm)}
label{display:block;font-size:.82rem;font-weight:650;margin:18px 0 6px;color:var(--ink)}
.card label:first-of-type{margin-top:0}
input[type=text],input[type=password],input[type=file],textarea,select{width:100%;padding:11px 13px;
border:1px solid var(--line-2);border-radius:var(--r-sm);font:inherit;background:#fff;color:var(--ink)}
input:focus,textarea:focus,select:focus{outline:2px solid var(--a1);outline-offset:1px;border-color:transparent}
textarea{min-height:100px;resize:vertical}
.help{font-size:.79rem;color:var(--muted);margin:6px 0 0;line-height:1.5}
button{background:var(--ink);color:#fff;border:0;border-radius:var(--pill);padding:12px 24px;
font:inherit;font-weight:600;cursor:pointer}
button:hover{background:#26272E}
.row{display:flex;gap:10px;align-items:center;margin-top:24px;flex-wrap:wrap}

/* The number blocks, which are the same shape the guides use. */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:1px;
background:var(--line);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;
margin:20px 0;box-shadow:var(--shadow-sm)}
.stat{background:var(--paper);padding:20px}
.stat b{display:block;font-size:2rem;line-height:1;letter-spacing:-.025em;color:var(--ink);
font-variant-numeric:tabular-nums;font-weight:650}
.stat span{display:block;font-size:.81rem;color:var(--muted);margin-top:8px;line-height:1.4}
.stat.key b{background:var(--aurora);-webkit-background-clip:text;background-clip:text;color:transparent}

.note{background:var(--paper);border:1px solid var(--line);border-left:3px solid var(--a1);
border-radius:var(--r-sm);padding:15px 17px;font-size:.9rem;margin:18px 0;color:var(--ink-soft)}
.note b{color:var(--ink)}
.bad{border-left-color:#EF4444;background:#FEF6F6}
.ok{border-left-color:var(--success);background:#F3FBF6}
.sub{font-size:.83rem;color:var(--muted);border-top:1px solid var(--line);padding:10px 0;line-height:1.5}
.sub:first-child{border-top:0;padding-top:0}
.sub b{font-variant-numeric:tabular-nums;color:var(--ink)}
.item{border:1px solid var(--line);border-radius:var(--r-sm);padding:15px 17px;margin:10px 0;
background:var(--paper);font-size:.91rem;box-shadow:var(--shadow-sm)}
.item .when{color:var(--muted);font-size:.78rem}
.pill{display:inline-block;font-size:.68rem;letter-spacing:.07em;text-transform:uppercase;
font-weight:700;padding:3px 10px;border-radius:var(--pill);background:#EEF0FF;color:var(--link)}
.pill.done{background:#E8F7EF;color:var(--success)}
a{color:var(--link)}
img.logo{max-width:160px;max-height:84px;border:1px solid var(--line);border-radius:var(--r-sm);
padding:12px;background:#fff}
@media(max-width:820px){.shell{grid-template-columns:1fr}main{padding:26px 20px 60px}
aside::after{display:none}}

.gates{display:grid;gap:10px;margin:14px 0 6px}
.gate{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid var(--line);
  border-radius:12px;padding:14px 16px}
.gate-main{flex:1;min-width:0}
.gate-main b{display:block;font-weight:600;letter-spacing:-.01em}
.pill{flex:none;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  padding:5px 10px;border-radius:999px;white-space:nowrap}
.pill.ok{background:#E8F7EE;color:#116B3A}
.pill.unknown{background:#F1F1EE;color:#6F7079}
.pill.bad{background:#FDECEC;color:#9B1C1C}
.pillar{margin:18px 0 6px}
.pillar h3{font-size:1rem;margin:0 0 10px;display:flex;justify-content:space-between;
  align-items:baseline;gap:12px}
.pillar .sub{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;
  margin-bottom:8px}
.sub-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;
  margin-bottom:8px}
.sub-head b{font-weight:600}
.bar{height:6px;border-radius:999px;background:#EFEFEC;overflow:hidden}
.bar i{display:block;height:6px;border-radius:999px;background:linear-gradient(90deg,#8B5CF6,#3B82F6)}
.bar i.full{background:linear-gradient(90deg,#3B82F6,#5EEAD4)}
.bar i.empty{background:#E2E2DE}
.sub details,.gate details{margin-top:8px}
.sub summary,.gate summary{cursor:pointer;font-size:.86rem;color:var(--muted);
  list-style:none;user-select:none}
.sub summary::-webkit-details-marker,.gate summary::-webkit-details-marker{display:none}
.sub summary::before,.gate summary::before{content:"+ ";font-weight:700}
.sub details[open] summary::before,.gate details[open] summary::before{content:"− "}
.sub details p,.gate details p{margin:8px 0 0;font-size:.9rem;color:var(--ink-soft)}

.wins{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px;
  margin:22px 0 10px}
.wins h2{margin:0 0 6px}
.wins .lede{margin:0 0 14px}
.wins ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.wins li{display:flex;gap:12px;align-items:flex-start}
.wins li b{display:block;font-weight:600;letter-spacing:-.01em}
.wins li .when{display:block;margin-top:2px}
.gain{flex:none;min-width:46px;text-align:center;font-weight:700;font-size:.82rem;
  padding:4px 8px;border-radius:999px;background:#F0ECFF;color:#5B3FD1}
.todo{display:flex;gap:10px;align-items:flex-start;margin-top:10px;padding-top:10px;
  border-top:1px dashed var(--line)}
.todo b{display:block;font-weight:600;font-size:.94rem}
.todo p{margin:4px 0 0;font-size:.88rem;color:var(--muted)}
.fixed{margin:8px 0 0;font-size:.86rem;color:var(--muted);font-style:italic}
`;

function html(title: string, body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} | Law Firm Listings</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700&display=swap">
<style>${CSS}</style></head><body>${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
}

/**
 * The logo's URL, from a field that already carries one.
 *
 * /api/firm/<slug>.json serves logo_file as "/logos/name.svg", because that is what
 * fetch_logos writes into the profile, and both readers here prefixed it again. Every firm
 * with a logo saw src="/logos//logos/name.svg" and a broken image in its own panel, in the
 * sidebar and on the page whose whole job is the logo. It took a client asking why their mark
 * was missing to find it, which is the second time this week a logo was there and we were
 * looking in the wrong place.
 */
const logoSrc = (file: string) => (file.startsWith('/') ? file : `/logos/${file}`);

/** Two letters, the way the public profile draws a firm with no logo. */
function initialsOf(name: string): string {
  const words = String(name).replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || 'LF';
}

function shell(active: string, d: any, title: string, body: string, status = 200,
               counts: Record<string, number> = {}) {
  let nav = '';
  let group = '';
  for (const item of NAV) {
    if (item.group !== group) { group = item.group; nav += `<h4>${esc(group)}</h4>`; }
    const n = counts[item.href] ?? 0;
    nav += `<a href="${item.href}"${item.href === active ? ' class="on"' : ''}>`
      + `${esc(item.label)}${n ? `<em>${n}</em>` : ''}</a>`;
  }
  // The firm's own mark, because a panel that shows a firm its own logo reads as its own place
  // rather than as a form somebody built. Where there is none we draw the initials on the aurora,
  // which is exactly what the public profile does, so the two never disagree.
  const mark = d.logo_file
    ? `<img src="${esc(logoSrc(d.logo_file))}" alt="${esc(d.name)}">`
    : `<span class="mono">${esc(initialsOf(d.name))}</span>`;
  const tier = d.score?.tier
    ? `<span class="tierpill${['Verified', 'Certified', 'Distinguished', 'Elite']
        .includes(d.score.tier) ? '' : ' flat'}">${esc(d.score.tier)}</span>`
    : '';
  const site = d.website
    ? `<a class="rail-site" href="${esc(d.website)}" target="_blank" rel="noopener">`
      + `${esc(String(d.website).replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>`
    : '';
  return html(title, `<div class="shell">
<aside>
  <a class="rail-brand" href="/"><i></i>Law Firm Listings</a>
  <div class="rail-firm">
    <div class="top">${mark}<div><b>${esc(d.name)}</b>
      <small>${esc(d.market.city)}, ${esc(d.market.state)}</small></div></div>
    <div class="rail-meta">${tier}
      <span class="tierpill flat">${d.outbound_link?.followed ? 'Followed link' : 'Nofollow'}</span>
    </div>
    ${site}
  </div>
  <nav>${nav}</nav>
  <div class="rail-out">
    <a href="/firms/${esc(d.slug)}/">View public profile</a>
    <a href="/claim/logout">Sign out</a>
  </div>
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
      ? `<img class="logo" src="${esc(logoSrc(d.logo_file))}" alt="${esc(d.name)}">`
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

/**
 * What a firm can do about each sub-factor, and where the honest answer is nothing.
 *
 * The score page told a firm where it stood and left it there. A panel that shows a number and
 * no way to move it is a scoreboard, and the point of this one is that the next crawl can find
 * something different. /list-your-firm/ already does this for the gates, in a `todo` beside each
 * one; this is the same idea one level down.
 *
 * Two rules for what goes in here. Each line is something the firm does on its own property, not
 * something it asks us for: we read public pages, so publishing the thing is the whole of it.
 * And where a factor genuinely cannot be moved, it says so rather than inventing an action,
 * because filler here would be the one thing that makes the whole page not worth reading.
 */
const IMPROVE: Record<string, { do: string; why?: string } | { fixed: string }> = {
  A2: {
    do: 'Publish each attorney\u2019s bar admission number and year on their own bio page.',
    why: 'This factor is the mean years since admission across your attorneys. We can only count '
      + 'the ones we can find in the state register, and a published bar number is what ties a '
      + 'name on your site to a record in it.',
  },
  A5: {
    do: 'State on your site that the firm carries professional liability cover, and list the bar '
      + 'and trial lawyer associations it belongs to.',
    why: 'Only the firm can say this about itself, so it is scored from what you publish and '
      + 'nowhere else. Paid "Top 100" style memberships are excluded on purpose.',
  },
  A6: {
    do: 'Give every person on your team page a role, and a bar number for the ones who practise '
      + 'law.',
    why: 'This is the share of your named roster we could match to the state register. A page '
      + 'that lists attorneys, paralegals and intake staff without saying which is which costs '
      + 'points here, because we have to count everybody.',
  },
  B1: {
    do: 'Publish a case results page, and send each result through this panel with its docket or '
      + 'index number.',
    why: 'A result with a docket number can be checked against the court record, which is what '
      + 'separates this directory from one that reprints whatever a firm claims.',
  },
  B2: {
    do: 'For each result, name the type of case, the year, the court and what was at issue.',
    why: 'A list of figures with no case behind them scores nothing here. The detail is what '
      + 'makes a result readable by somebody deciding whether it resembles their own situation.',
  },
  B3: {
    do: 'Put a prior-results disclaimer on the results page itself.',
    why: 'Most state advertising rules effectively require one, and it is a single sentence. Of '
      + 'the 532 firms here that publish results, 340 carry no disclaimer at all.',
  },
  C1: { fixed: 'This counts the public reviews your verified Google listings already carry. It '
      + 'moves as they accumulate, and nothing on your own site changes it.' },
  C2: { fixed: 'Your rating, weighted so that a 5.0 from nine reviews does not outrank a 4.8 '
      + 'from four hundred. It is not something to act on here.' },
  C3: {
    do: 'Ask clients to review you as a matter of routine at the end of a matter.',
    why: 'This is the share of your reviews from the last twelve months. A firm with hundreds of '
      + 'old reviews and none this year scores low, because the question it answers is whether '
      + 'the practice is active now.',
  },
  C5: {
    do: 'Reply to the negative reviews you have, on the record.',
    why: 'Complaints are counted as a share rather than as a count, and a reply is the only part '
      + 'of this a firm controls.',
  },
  D1: {
    do: 'Fix Core Web Vitals, put a photo and a bar number on every bio, publish a fee page, and '
      + 'carry a privacy policy and the attorney-advertising notice your state requires.',
    why: 'Six separate things are counted here and each is worth a point or two, which makes this '
      + 'the factor with the most to gain from an afternoon of work.',
  },
  D2: {
    do: 'Earn links from bar associations, local press, universities and civic organisations.',
    why: 'This is the slowest factor on the page and the one no edit will move this month. It is '
      + 'measured from third-party data, not from your site.',
  },
  D3: {
    do: 'Complete your Google Business Profile: categories, hours, services, twenty or more '
      + 'photos, and a post in the last sixty days.',
    why: 'Cheap and immediate. Most of what this asks for takes a single sitting in the Business '
      + 'Profile manager.',
  },
  D4: {
    do: 'Add LegalService or Attorney schema to your pages, with your address, phone and practice '
      + 'areas in it.',
    why: 'It is one point, and it also helps every other check on this page read your site '
      + 'correctly.',
  },
  E1: {
    do: 'Publish how you charge: the contingency share, the hourly rate, or the retainer, and '
      + 'whether the first consultation is free.',
    why: 'This is the single most common thing a visitor looks for and does not find. We record '
      + '"Not stated" rather than assuming a fee model, and "Not stated" scores nothing.',
  },
  E3: {
    do: 'Say which languages your firm actually works in, on a page rather than in a translate '
      + 'widget.',
    why: 'A machine-translated site is not the same claim as a lawyer who takes the call in that '
      + 'language, and only the second one counts here.',
  },
  E4: {
    do: 'Publish your intake hours, and say plainly if you answer after hours, visit hospitals or '
      + 'take home appointments.',
    why: 'Availability is scored from what the site states, so a firm that does all three and '
      + 'mentions none of them scores the same as one that does nothing.',
  },
};

// The five pillars by the names the methodology page gives them. A firm reading its own
// scorecard should not have to learn that "D" is its website.
const PILLAR_NAMES: Record<string, string> = {
  A: 'Professional standing',
  B: 'Published outcomes',
  C: 'Client experience',
  D: 'Website and authority',
  E: 'Access and responsiveness',
};

// The five gates, in the words /list-your-firm/ uses, because "G2" means nothing to a firm.
const GATE_TITLES: Record<string, string> = {
  G1: 'Attorneys licensed where they practise',
  G2: 'No public discipline outstanding',
  G3: 'A real entity and a real office',
  G5: 'A site that names its lawyers',
  G6: 'A year in practice and ten client reviews',
};

/**
 * Three states, not two, and the third is the one the old page hid.
 *
 * A gate reads "not passed" whether we found something against the firm or whether we could not
 * look. Lopez & Humphries has two open gates and neither is a finding: Florida publishes no
 * attorney register we may query, and three of the discipline decisions naming a surname are
 * scans without searchable text. Painting those the same colour as a real failure tells a firm
 * it did something wrong.
 */
function gateState(g: any): { label: string; cls: string } {
  if (g?.pass) return { label: 'Passed', cls: 'ok' };
  const source = String(g?.source ?? '');
  const unreadable = /no queryable source|nothing to query|unavailable|incomplete|partial|pending/i;
  if (unreadable.test(source)) return { label: 'We could not check', cls: 'unknown' };
  return { label: 'Not passed', cls: 'bad' };
}

/** The line under a sub-factor that still has points in it. */
function improveBlock(code: string, missing: number): string {
  if (missing <= 0) return '';
  const entry = IMPROVE[code];
  if (!entry) return '';
  if ('fixed' in entry) {
    return `<p class="fixed">${esc(entry.fixed)}</p>`;
  }
  return `<div class="todo">
    <span class="gain">+${esc(String(round1(missing)))}</span>
    <div>
      <b>${esc(entry.do)}</b>
      ${entry.why ? `<p>${esc(entry.why)}</p>` : ''}
    </div>
  </div>`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The three actions worth doing first, by how many points each would return.
 *
 * A firm reading seventeen sub-factors has no way to tell which afternoon of work pays. This
 * sorts by what is actually recoverable and shows the top of that list, which is the only part
 * most people will read.
 */
function biggestWins(d: any): string {
  const rows: { code: string; label: string; missing: number; action: string }[] = [];
  for (const p of Object.values(d.score?.pillars ?? {}) as any[]) {
    for (const sub of (p.subs ?? [])) {
      const missing = Number(sub.max ?? 0) - Number(sub.pts ?? 0);
      const entry = IMPROVE[String(sub.code ?? '')];
      if (missing > 0 && entry && 'do' in entry) {
        rows.push({ code: sub.code, label: sub.label ?? sub.code, missing, action: entry.do });
      }
    }
  }
  if (!rows.length) return '';
  rows.sort((a, b) => b.missing - a.missing);
  const top = rows.slice(0, 3);
  const total = round1(rows.reduce((sum, r) => sum + r.missing, 0));
  return `<div class="wins">
    <h2>What would move your score most</h2>
    <p class="lede">There are ${esc(String(total))} points still available to you across
      ${esc(String(rows.length))} factors. These three carry the most of them, and every one is
      something you publish on your own site.</p>
    <ol>${top.map(r => `<li>
      <span class="gain">+${esc(String(round1(r.missing)))}</span>
      <div><b>${esc(r.action)}</b><span class="when">${esc(r.label)}</span></div>
    </li>`).join('')}</ol>
    <p class="when">The next crawl reads your site again and the score follows what it finds.</p>
  </div>`;
}

function scorePage(d: any): string {
  if (!d.score) return '<h1>Your score</h1><p class="lede">This profile has no score yet.</p>';

  const gates = Object.entries(d.gates ?? {}).map(([k, g]: [string, any]) => {
    const st = gateState(g);
    const evidence = String(g?.evidence ?? '');
    return `<div class="gate">
      <span class="pill ${st.cls}">${esc(st.label)}</span>
      <div class="gate-main">
        <b>${esc(GATE_TITLES[k] ?? k)}</b>
        ${evidence ? `<details><summary>Why</summary><p>${esc(evidence)}</p></details>` : ''}
      </div>
    </div>`;
  });

  // Sub-factors by pillar, as a bar each. The evidence is the sentence that explains the bar,
  // so it sits behind a disclosure rather than beside it: a firm wants to know where the points
  // went before it wants to know why.
  const pillars = Object.entries(d.score.pillars ?? {}).map(([key, p]: [string, any]) => {
    const subs = (p.subs ?? []).map((s: any) => {
      const pts = Number(s.pts ?? 0);
      const max = Number(s.max ?? 0) || 1;
      const share = Math.max(2, Math.round((pts / max) * 100));
      const full = pts >= max;
      const empty = pts <= 0;
      return `<div class="sub">
        <div class="sub-head">
          <b>${esc(s.label ?? s.code)}</b>
          <span class="num">${esc(String(pts))}/${esc(String(s.max ?? 0))}</span>
        </div>
        <div class="bar"><i class="${full ? 'full' : empty ? 'empty' : ''}"
          style="width:${share}%"></i></div>
        ${s.evidence ? `<details><summary>How this was measured</summary>
          <p>${esc(s.evidence)}</p></details>` : ''}
        ${improveBlock(String(s.code ?? ''), max - pts)}
      </div>`;
    }).join('');
    const got = Number(p.score ?? 0);
    const of = Number(p.max ?? 0);
    return `<section class="pillar">
      <h3>${esc(PILLAR_NAMES[key] ?? p.name ?? key)} <span class="num">${esc(String(got))}/${esc(String(of))}</span></h3>
      ${subs}
    </section>`;
  });

  const open = Object.values(d.gates ?? {}).filter((g: any) => !g?.pass).length;
  const unknown = Object.values(d.gates ?? {})
    .filter((g: any) => gateState(g).cls === 'unknown').length;

  return `<h1>Your score</h1>
  <p class="lede">What scored, out of what, and the evidence behind each line. Nothing here is
    editable, by you or by us: it is written by the scoring engine from measured values.</p>
  <div class="stats">
    <div class="stat key"><b>${esc(d.score.total)}</b><span>out of 100 &middot; ${esc(d.score.tier)}</span></div>
    <div class="stat"><b>${esc(String(5 - open))}/5</b><span>eligibility gates passed</span></div>
    <div class="stat"><b>${esc(d.score.computed_at)}</b><span>last computed</span></div>
  </div>
  ${unknown ? `<div class="note"><b>${esc(String(unknown))} of your open gates
    ${unknown === 1 ? 'is' : 'are'} not a finding about your firm.</b> ${unknown === 1
      ? 'It is marked'
      : 'They are marked'} <i>we could not check</i>: the record we would read is not published
    in a form we are allowed to query, so it is counted neither for you nor against you.</div>` : ''}
  <h2>Eligibility gates</h2>
  <div class="gates">${gates.join('')}</div>
  ${biggestWins(d)}
  <h2>Where the points are</h2>
  ${pillars.join('')}`;
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
  // Every section gets the firm itself, so the rail can draw its logo, its tier and its site.
  const open = (await submissions(env, d.slug)).filter((x: any) => x.status !== 'approved');
  const counts: Record<string, number> = {
    '/claim/dashboard': open.length,
    '/claim/reviews': open.filter((x: any) => x.kind === 'review').length,
    '/claim/results': open.filter((x: any) => x.kind === 'result').length,
    '/claim/logo': open.filter((x: any) => x.kind === 'logo').length,
  };
  const at = (p: string, t: string, b: string, st = 200) => shell(p, d, t, b, st, counts);

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
