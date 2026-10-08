/**
 * The firm panel: a law firm signs in and corrects what this directory publishes about it.
 *
 * The scope is not invented here. /list-your-firm/ has promised the same four things since the
 * page was written, and src/data/listing.ts is where they are declared: correct your offices,
 * phone, practice areas, languages and fee terms; submit case results with a docket number for
 * verification; appeal any sub-factor; see every sub-score and the evidence behind it. This is the
 * first of those, plus the last, which is read-only and costs nothing to give.
 *
 * Nothing a firm types here is published by typing it. A directory whose whole position is
 * "verified, not advertised" cannot let the subject of a profile rewrite it unread, so an edit
 * becomes a pending change-set, an email arrives with one button in it, and pressing that button
 * is what approves it. The firm sees "submitted, in review" until then.
 *
 * Three things this does not do, and each is deliberate:
 *
 *   It does not touch the score, the gates or the tier. Those are measured. The page says so and
 *   so does the panel, on the screen where a firm is most likely to expect otherwise.
 *
 *   It does not change the outbound link. A followed link is earned by clearing every gate, which
 *   is what reaching Verified means, and the panel states the rule rather than the answer.
 *
 *   It does not register anybody. Accounts are issued by hand, one per firm, because the first
 *   version of this is for a handful of firms and a self-serve signup on a directory of real
 *   businesses is an impersonation problem before it is a product.
 */
import { EmailMessage } from 'cloudflare:email';
import { mime } from './mail';
import {
  SESSION_SECONDS, clearCookie, cookieHeader, readCookie, sign, verify, verifyPassword,
} from './auth';

export interface PanelEnv {
  ASSETS: Fetcher;
  EMAIL: { send(message: EmailMessage): Promise<void> };
  /** Where a pending change-set and an account live. One namespace, two key prefixes. */
  PANEL?: KVNamespace;
  /** Signs the session cookie and the approval link. A Worker secret. */
  PANEL_SECRET?: string;
  SUBMISSIONS_TO?: string;
  SUBMISSIONS_FROM?: string;
}

interface Account {
  slug: string;
  name: string;
  domain: string;
  /** From hashPassword(): pbkdf2$iterations$salt$hash. */
  hash: string;
}

/** What a firm may change. Anything not named here cannot be submitted, let alone published. */
const EDITABLE = ['phone', 'languages', 'fee_model', 'free_consultation', 'availability',
                  'practices', 'offices'] as const;

const LIMITS: Record<string, number> = {
  phone: 40, fee_model: 60, languages: 200, availability: 400, practices: 200, offices: 3000,
  note: 2000,
};

/** An approval link has to outlive a weekend and a holiday, and not much more. */
const APPROVAL_SECONDS = 14 * 24 * 60 * 60;

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function page(title: string, body: string, status = 200, headers: Record<string, string> = {}) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} | Law Firm Listings</title>
<style>
:root{--ink:#14121a;--soft:#4a4654;--muted:#7a7686;--line:#e6e3ec;--paper:#fff;--bg:#faf9fc;
--accent:#6D28D9}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{background:#14121a;color:#fff;padding:18px 20px}
header b{font-weight:650;letter-spacing:-.01em}
header span{color:#b9b4c6;font-size:.86rem;margin-left:10px}
main{max-width:760px;margin:0 auto;padding:30px 20px 70px}
h1{font-size:1.6rem;letter-spacing:-.02em;margin:0 0 6px}
h2{font-size:1.06rem;margin:34px 0 10px}
p{margin:0 0 14px}
.lede{color:var(--soft)}
.card{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:22px;
margin:18px 0}
label{display:block;font-size:.84rem;font-weight:600;margin:16px 0 5px}
label:first-of-type{margin-top:0}
input[type=text],input[type=password],textarea,select{width:100%;padding:10px 12px;
border:1px solid var(--line);border-radius:9px;font:inherit;background:#fff;color:var(--ink)}
textarea{min-height:92px;resize:vertical}
.help{font-size:.8rem;color:var(--muted);margin:5px 0 0}
button{background:var(--accent);color:#fff;border:0;border-radius:9px;padding:11px 20px;
font:inherit;font-weight:600;cursor:pointer}
button.ghost{background:transparent;color:var(--soft);border:1px solid var(--line)}
.row{display:flex;gap:10px;align-items:center;margin-top:22px;flex-wrap:wrap}
.note{background:#f4f1fd;border:1px solid #e0d7fb;border-radius:11px;padding:14px 16px;
font-size:.9rem;margin:16px 0}
.bad{background:#fdf2f2;border-color:#f6d5d5;color:#8c2b2b}
.ok{background:#f0f9f3;border-color:#cfe9d8;color:#1f6b3b}
.kv{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 16px;font-size:.92rem}
.kv span{color:var(--muted)}
.score{font-size:2.3rem;font-weight:650;letter-spacing:-.02em;line-height:1}
.sub{font-size:.84rem;color:var(--muted);border-top:1px solid var(--line);padding:9px 0}
.sub b{font-variant-numeric:tabular-nums}
a{color:var(--accent)}
</style></head><body>
<header><b>Law Firm Listings</b><span>Firm panel</span></header>
<main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });
}

function loginPage(message?: string, status = 200, headers: Record<string, string> = {}) {
  return page('Sign in', `
    <h1>Sign in</h1>
    <p class="lede">Use the credential we sent you. One account per firm, issued by hand.</p>
    ${message ? `<div class="note bad">${esc(message)}</div>` : ''}
    <form method="post" action="/claim/login" class="card">
      <label for="u">Firm ID</label>
      <input id="u" name="slug" type="text" autocomplete="username" required
             placeholder="the-name-in-your-profile-url">
      <p class="help">It is the last part of your profile address, after /firms/.</p>
      <label for="p">Password</label>
      <input id="p" name="password" type="password" autocomplete="current-password" required>
      <div class="row"><button type="submit">Sign in</button></div>
    </form>
    <p class="help">No account yet? Write to us from
      <a href="/list-your-firm/">the listing page</a>. Claiming a profile is free and it does not
      change your score, your eligibility gates or your tier.</p>`, status, headers);
}

async function account(env: PanelEnv, slug: string): Promise<Account | null> {
  if (!env.PANEL) return null;
  const raw = await env.PANEL.get(`account:${slug}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Account;
  } catch {
    return null;
  }
}

async function firmData(env: PanelEnv, request: Request, slug: string): Promise<any | null> {
  // Through the assets binding, so the panel reads exactly what the build published.
  const url = new URL(request.url);
  url.pathname = `/api/firm/${slug}.json`;
  url.search = '';
  const res = await env.ASSETS.fetch(new Request(url.toString(), { method: 'GET' }));
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function session(env: PanelEnv, request: Request): Promise<string | null> {
  if (!env.PANEL_SECRET) return null;
  const token = readCookie(request);
  if (!token) return null;
  const claims = await verify(env.PANEL_SECRET, token);
  return typeof claims?.slug === 'string' ? claims.slug : null;
}

/** The read-only half of the product: every sub-score and the evidence behind it. */
function scoreCard(d: any): string {
  if (!d.score) return '';
  const rows = Object.entries(d.score.pillars ?? {}).flatMap(([, p]: [string, any]) =>
    (p.subs ?? []).map((s: any) => `<div class="sub"><b>${esc(s.code)}</b> ${esc(s.label ?? '')}
      &middot; ${esc(s.pts)}/${esc(s.max)} &middot; ${esc(s.source ?? '')}<br>${esc(s.evidence ?? '')}</div>`));
  return `
    <h2>Your score, and why</h2>
    <div class="card">
      <div class="score">${esc(d.score.total)}<span style="font-size:.9rem;color:var(--muted)">
        /100 &middot; ${esc(d.score.tier)}</span></div>
      <p class="help" style="margin-top:10px">${esc(d.score.verdict ?? '')}</p>
      <p class="help">Methodology ${esc(d.score.methodology)}, computed ${esc(d.score.computed_at)}.
        Nothing on this page changes it. The score is measured, and a claimed profile is measured
        exactly the way an unclaimed one is.</p>
      ${rows.join('')}
    </div>`;
}

function linkNote(d: any): string {
  return `<div class="note">
    <b>Your outbound link is ${d.outbound_link?.followed ? 'followed' : 'nofollow'}.</b>
    ${esc(d.outbound_link?.rule ?? '')}</div>`;
}

function profilePage(d: any, flash?: { kind: 'ok' | 'bad'; text: string }): Response {
  const e = d.editable;
  const offices = (e.offices ?? []).map((o: any, i: number) => `
    <label for="o${i}">Office ${i + 1}${o.is_hq ? ' (head office)' : ''}</label>
    <input id="o${i}" name="office_${i}" type="text" value="${esc(o.address)}"
           placeholder="Street, city, state, ZIP">`).join('');
  return page(d.name, `
    <h1>${esc(d.name)}</h1>
    <p class="lede">${esc(d.market.city)}, ${esc(d.market.state)} &middot;
      <a href="/firms/${esc(d.slug)}/">view your public profile</a></p>
    ${flash ? `<div class="note ${flash.kind}">${esc(flash.text)}</div>` : ''}
    ${linkNote(d)}

    <h2>Correct your details</h2>
    <p class="lede">These are the things you publish about yourself, so you are the right person to
      fix them. Send a change and we review it before it goes live, usually the same day.</p>
    <form method="post" action="/claim/save" class="card">
      <label for="phone">Phone</label>
      <input id="phone" name="phone" type="text" value="${esc(e.phone)}">

      ${offices}

      <label for="languages">Languages</label>
      <input id="languages" name="languages" type="text" value="${esc((e.languages ?? []).join(', '))}">
      <p class="help">Comma separated, and only the ones you publish on your own site.</p>

      <label for="fee">Fee model</label>
      <input id="fee" name="fee_model" type="text" value="${esc(e.fee_model)}"
             placeholder="Contingency, Flat fee, Hourly">

      <label for="consult">Free consultation</label>
      <select id="consult" name="free_consultation">
        <option value="yes"${e.free_consultation ? ' selected' : ''}>Yes</option>
        <option value="no"${e.free_consultation ? '' : ' selected'}>No</option>
      </select>

      <label for="availability">Availability</label>
      <input id="availability" name="availability" type="text"
             value="${esc((e.availability ?? []).join(', '))}">
      <p class="help">Comma separated: 24/7 intake line, hospital and home visits.</p>

      <label for="note">Anything else</label>
      <textarea id="note" name="note" placeholder="A sub-factor you want to appeal, a case result with its docket number, or anything we have wrong."></textarea>
      <p class="help">A case result needs a docket number before it can be published, and an
        appeal is reviewed within 30 days.</p>

      <div class="row">
        <button type="submit">Send for review</button>
        <a href="/claim/logout"><button class="ghost" type="button">Sign out</button></a>
      </div>
    </form>

    ${scoreCard(d)}`);
}

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim().slice(0, LIMITS[name] ?? 200);
}

export async function handlePanel(request: Request, env: PanelEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/claim';
  const secure = url.protocol === 'https:';

  if (!env.PANEL || !env.PANEL_SECRET) {
    // Naming the missing half, because the two are fixed in different places and "not configured"
    // sends somebody to read a worker rather than a setting.
    return page('Not configured', `<h1>The panel is not configured</h1>
      <p class="lede">${!env.PANEL ? 'The PANEL KV namespace is not bound to this Worker.'
                                   : 'The PANEL_SECRET secret is not set on this Worker.'}</p>`, 503);
  }

  if (path === '/claim/logout') {
    return new Response(null, {
      status: 302,
      headers: { location: '/claim/', 'set-cookie': clearCookie(secure) },
    });
  }

  // The approval link from the review email. It carries its own proof, so it works whether or not
  // anybody is signed in, which is the point: it is pressed from a phone, from a mail client.
  if (path === '/claim/approve') {
    const claims = await verify(env.PANEL_SECRET, url.searchParams.get('t') ?? '');
    if (!claims?.key) {
      return page('Link expired', `<h1>That link is no longer valid</h1>
        <p class="lede">An approval link lasts fourteen days. The change is still pending and
        nothing was lost.</p>`, 410);
    }
    const raw = await env.PANEL.get(String(claims.key));
    if (!raw) {
      return page('Not found', `<h1>That change is no longer pending</h1>
        <p class="lede">It was approved or discarded already.</p>`, 404);
    }
    const pending = JSON.parse(raw);
    if (pending.status === 'approved') {
      return page('Already approved', `<h1>Already approved</h1>
        <p class="lede">${esc(pending.name)}, approved ${esc(pending.approved_at)}.</p>`);
    }
    pending.status = 'approved';
    pending.approved_at = new Date().toISOString();
    await env.PANEL.put(String(claims.key), JSON.stringify(pending));
    return page('Approved', `<h1>Approved</h1>
      <p class="lede">${esc(pending.name)}. It is queued for the next publish.</p>
      <div class="note">Run <code>python scripts/apply_claims.py</code> to write it into the firm
      files and open the change for review in git. Nothing reaches the site until that runs and
      the build after it.</div>`);
  }

  const signedIn = await session(env, request);

  if (path === '/claim/login') {
    if (request.method !== 'POST') return loginPage();
    const form = await request.formData();
    const slug = String(form.get('slug') ?? '').trim().toLowerCase().slice(0, 120);
    const password = String(form.get('password') ?? '');
    const acc = await account(env, slug);
    // The same work and the same answer either way: a login that returns faster for a firm with
    // no account tells somebody which firms have one.
    const ok = acc
      ? await verifyPassword(password, acc.hash)
      : await verifyPassword(password, 'pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    if (!acc || !ok) return loginPage('That firm ID and password do not match.', 401);
    const token = await sign(env.PANEL_SECRET, { slug }, SESSION_SECONDS);
    return new Response(null, {
      status: 302,
      headers: { location: '/claim/profile', 'set-cookie': cookieHeader(token, secure) },
    });
  }

  if (path === '/claim' || path === '/claim/index') {
    return signedIn
      ? new Response(null, { status: 302, headers: { location: '/claim/profile' } })
      : loginPage();
  }

  if (!signedIn) return loginPage('Sign in to continue.', 401);

  const d = await firmData(env, request, signedIn);
  if (!d) {
    return page('Profile missing', `<h1>We cannot find that profile</h1>
      <p class="lede">The account exists and the published profile does not, which should not
      happen. Please write to us.</p>`, 404);
  }

  if (path === '/claim/profile') return profilePage(d);

  if (path === '/claim/save') {
    if (request.method !== 'POST') {
      return new Response(null, { status: 302, headers: { location: '/claim/profile' } });
    }
    const form = await request.formData();
    const offices = (d.editable.offices ?? []).map((o: any, i: number) => ({
      ...o, address: field(form, `office_${i}`) || o.address,
    }));
    const proposed: Record<string, unknown> = {
      phone: field(form, 'phone'),
      languages: field(form, 'languages').split(',').map(s => s.trim()).filter(Boolean),
      fee_model: field(form, 'fee_model'),
      free_consultation: form.get('free_consultation') === 'yes',
      availability: field(form, 'availability').split(',').map(s => s.trim()).filter(Boolean),
      practices: d.editable.practices,
      offices,
    };
    // Only what actually moved, so the review email is a diff rather than a form dump.
    const changes = EDITABLE
      .map(k => ({ field: k, from: d.editable[k], to: proposed[k] }))
      .filter(c => JSON.stringify(c.from) !== JSON.stringify(c.to));
    const note = field(form, 'note');

    if (!changes.length && !note) {
      return profilePage(d, { kind: 'bad', text: 'Nothing changed, so nothing was sent.' });
    }

    const key = `pending:${d.slug}:${Date.now()}`;
    const record = {
      key, slug: d.slug, name: d.name, domain: d.domain,
      submitted_at: new Date().toISOString(),
      status: 'pending',
      changes, note,
    };
    await env.PANEL.put(key, JSON.stringify(record));

    if (env.SUBMISSIONS_TO && env.SUBMISSIONS_FROM) {
      const token = await sign(env.PANEL_SECRET, { key }, APPROVAL_SECONDS);
      const approve = `${url.origin}/claim/approve?t=${token}`;
      const body = [
        `${d.name} submitted a correction.`,
        '',
        ...changes.map(c => `${c.field}:\n  now: ${JSON.stringify(c.from)}\n  asks: ${JSON.stringify(c.to)}`),
        note ? `\nNote:\n${note}` : '',
        '',
        'Approve:',
        approve,
        '',
        `Profile: ${url.origin}/firms/${d.slug}/`,
        `Submitted ${record.submitted_at}`,
      ].filter(Boolean).join('\n');
      try {
        await env.EMAIL.send(new EmailMessage(
          env.SUBMISSIONS_FROM, env.SUBMISSIONS_TO,
          mime(env.SUBMISSIONS_FROM, env.SUBMISSIONS_TO,
               `Correction from ${d.name}`, body)));
      } catch (err) {
        // The change is stored either way. A mail that did not send is our problem to notice,
        // not a reason to tell a firm its correction vanished.
        console.error('panel mail failed', err);
      }
    }

    return profilePage(d, {
      kind: 'ok',
      text: `Sent for review. ${changes.length} change${changes.length === 1 ? '' : 's'} `
        + `recorded, and nothing on your public profile has moved yet.`,
    });
  }

  return page('Not found', '<h1>Not found</h1>', 404);
}
