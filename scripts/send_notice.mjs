#!/usr/bin/env node
/**
 * The one unsolicited email this directory sends, to the firms it is about.
 *
 * Everything else the Worker sends answers an enquiry. This writes first, to a firm that never
 * contacted us, about a page we published without asking. That is defensible, and it is only
 * defensible if three promises the message makes are kept by something other than good
 * intentions, so they are kept here:
 *
 *   "We wrote to you once."   A sent log. A firm that has had this message never gets it again,
 *                             and the log is checked before every send, not after the batch.
 *   "Reply REMOVE and we      A suppression list, checked the same way. Replies land in a real
 *    will not write again."   mailbox a person reads; this is where that person writes it down,
 *                             and nothing sends to an address or a domain on it, ever.
 *   The figures in it.        Read from the published profile at send time, never typed. A
 *                             message telling a firm its score is wrong about its score is
 *                             worse than no message.
 *
 * Nothing sends without --send. The default prints the batch and the full text of the first
 * message, because an unsolicited commercial email should be read by its sender before it is
 * read by a stranger.
 *
 *   node scripts/send_notice.mjs --limit 5                     what it would send, to whom
 *   node scripts/send_notice.mjs --slugs arash-law,torklaw     a specific few
 *   node scripts/send_notice.mjs --limit 5 --send              actually send
 *   node scripts/send_notice.mjs --suppress info@example.com   never write to this again
 *
 * The two files it keeps live beside the crawl, out of git: .outreach-sent.json and
 * .outreach-suppressed.txt.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SENT = path.join(ROOT, '.outreach-sent.json');
const SUPPRESSED = path.join(ROOT, '.outreach-suppressed.txt');
const GATES = ['G1', 'G2', 'G3', 'G5', 'G6'];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

// --- the two ledgers -------------------------------------------------------------------
const readJson = (p, fallback) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
};
const sent = readJson(SENT, {});
const suppressed = new Set(
  (existsSync(SUPPRESSED) ? readFileSync(SUPPRESSED, 'utf8') : '')
    .split('\n').map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#')));

if (value('suppress')) {
  const entry = value('suppress').trim().toLowerCase();
  const body = (existsSync(SUPPRESSED) ? readFileSync(SUPPRESSED, 'utf8') :
    '# Addresses and domains that asked not to be written to. One per line.\n');
  if (!suppressed.has(entry)) writeFileSync(SUPPRESSED, `${body.replace(/\n*$/, '\n')}${entry}\n`, 'utf8');
  console.log(`${entry} will not be written to again.`);
  process.exit(0);
}

/*
 * An address is suppressed by itself or by its domain, so one reply can cover a whole firm,
 * and a firm is suppressed by its own domain however it publishes its address.
 *
 * That last clause is the one that was missing. The list holds the eight firms we work for,
 * because this message tells a firm it never asked us to publish its profile and that is not
 * true of a firm that engaged us. Goodwin Law was on the list by its own domain, glpa.law, and
 * was still in the batch: the address its site publishes is matt@flestatelaw.com, so neither
 * half of the old test matched and a client was one send away from being told we had never
 * spoken.
 */
const isSuppressed = ({ email, domain }) => {
  const e = (email ?? '').toLowerCase();
  const own = (domain ?? '').toLowerCase().replace(/^www\./, '');
  return suppressed.has(e) || suppressed.has(e.split('@')[1] ?? '') || (!!own && suppressed.has(own));
};

// --- which address, of the ones the crawl holds ----------------------------------------
/*
 * This used to be `emails[0]`, and the next batch of five was going to open with
 * unsubscribe@stoneinjury.com and privacyprogram@www.shookandstone.com. Of the 549 firms whose
 * crawl holds an address, 35 held one that should never receive this message: 14 that are not
 * addresses at all (${email}, email@domain.com, and the masks sites print to defeat scrapers),
 * 9 role or compliance mailboxes, and 12 on another firm's domain, every one of them read off a
 * privacy policy, which is where a template's example address survives a rebrand.
 *
 * So the address is chosen rather than taken. An address on the firm's own domain is preferred,
 * an unreadable one is not an address, a compliance mailbox is not a person, and an address on
 * somebody else's domain found on a policy page is somebody else's address. Where that leaves
 * nothing, the firm is simply not written to and the batch says so.
 */
const SHAPE = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
// Mailboxes that exist for a machine or a lawyer, not for the person who maintains the site.
const ROLE = /^(?:unsubscribe|no-?reply|donotreply|privacy[a-z]*|dpo|abuse|postmaster|webmaster|dmca|opt-?out|compliance|security|removal|remove)@/;
const PLACEHOLDER = /@(?:example|domain|yourdomain|yourorg|email|sentry|wixpress)\./;
const POLICY_PAGE = /privacy|terms|legal-notice|disclaimer|cookie/i;

/** Decode and tidy one value the way crawl_public.py now stores it. */
const normalise = (raw) => {
  if (typeof raw !== 'string') return '';
  // The crawler decodes entities and strips whitespace since this was written, but the 2,510
  // records in .crawl/ were read before that and a re-crawl of every domain takes two hours.
  return raw
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/\s+/g, '')
    .replace(/[.,;:]+$/, '')
    .toLowerCase();
};

/**
 * The best address the crawl holds for this firm, or null.
 * `rejected` says whether something was there and we declined to use it, which is a different
 * sentence to a reader of the batch than holding nothing at all.
 */
const pickAddress = (entries, domain) => {
  const own = (domain || '').toLowerCase().replace(/^www\./, '');
  const onOwnDomain = (host) => host === own || host.endsWith(`.${own}`) || own.endsWith(`.${host}`);
  let rejected = false;
  const ranked = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    const value = normalise(typeof entry === 'string' ? entry : entry?.value);
    const source = (typeof entry === 'string' ? '' : entry?.source_url) || '';
    if (!value) continue;
    if (!SHAPE.test(value) || PLACEHOLDER.test(value) || ROLE.test(value)) { rejected = true; continue; }
    const host = value.split('@')[1];
    if (host.startsWith('www.')) { rejected = true; continue; }
    const mine = onOwnDomain(host);
    if (!mine && POLICY_PAGE.test(source)) { rejected = true; continue; }
    ranked.push({ value, rank: mine ? 0 : 1, source, mine });
  }

  ranked.sort((a, b) => a.rank - b.rank);
  const best = ranked[0];
  // The page it was read from travels with it. An address is checkable only against where the
  // firm published it, and --where prints exactly that for a whole batch before it is sent.
  return {
    email: best?.value ?? null,
    source: best?.source ?? null,
    ownDomain: best ? best.mine : null,
    rejected: rejected && !ranked.length,
  };
};

/*
 * node scripts/send_notice.mjs --self-test
 *
 * Every case here is a real record from .crawl/, because the rule was written from what the
 * crawl actually holds rather than from what an address usually looks like.
 */
if (flag('self-test')) {
  const cases = [
    // [what the crawl holds, the firm's domain, what should come out]
    [[{ value: 'unsubscribe@stoneinjury.com', source_url: 'https://stoneinjury.com/' }], 'stoneinjury.com', null],
    [[{ value: 'privacyprogram@www.shookandstone.com', source_url: 'https://www.shookandstone.com/privacy-policy/' }], 'shookandstone.com', null],
    [[{ value: '${email}', source_url: 'https://accidentjustice.com/' }], 'accidentjustice.com', null],
    [[{ value: 'in**@sh**************.com', source_url: 'https://x.com/' }], 'shirazilaw.com', null],
    [[{ value: 'email@domain.com', source_url: 'https://uvallelawfirm.com/' }], 'uvallelawfirm.com', null],
    [[{ value: 'info@petersenjohnson.com', source_url: 'https://bradjohnsoninjurylaw.com/privacy-policy/' }], 'bradjohnsoninjurylaw.com', null],
    // Entity by entity, and the only thing wrong with it was that nobody decoded it.
    [[{ value: '&#099;&#111;&#110;&#111;&#114;&#064;mu&#108;va&#110;&#101;y&#108;&#097;w.com', source_url: 'https://mulvaneylaw.com/' }], 'mulvaneylaw.com', 'conor@mulvaneylaw.com'],
    [[{ value: 'here 4 u @ cohens law firm . com', source_url: 'https://cohenslawfirm.com/' }], 'cohenslawfirm.com', 'here4u@cohenslawfirm.com'],
    // The firm's own domain wins over a second one, whatever order the crawl found them in.
    [[{ value: 'info@petersenjohnson.com', source_url: 'https://bradjohnsoninjurylaw.com/contact/' },
      { value: 'info@bradjohnsoninjurylaw.com', source_url: 'https://bradjohnsoninjurylaw.com/contact/' }],
      'bradjohnsoninjurylaw.com', 'info@bradjohnsoninjurylaw.com'],
    // A second brand on a contact page is the firm, and is written to.
    [[{ value: 'shane@getgomez.com', source_url: 'https://www.thegomezfirm.com/news/' }], 'thegomezfirm.com', 'shane@getgomez.com'],
    // A compliance mailbox beside a real one costs the firm nothing.
    [[{ value: 'webmaster@baileylawfirmaz.com', source_url: 'https://baileylawfirmaz.com/privacy-policy/' },
      { value: 'info@baileylawfirmaz.com', source_url: 'https://baileylawfirmaz.com/' }],
      'baileylawfirmaz.com', 'info@baileylawfirmaz.com'],
  ];
  let failed = 0;
  for (const [entries, domain, expected] of cases) {
    const got = pickAddress(entries, domain).email;
    if (got !== expected) {
      failed += 1;
      console.log(`  FAIL  ${domain}\n        expected ${expected ?? 'nothing'}\n        got      ${got ?? 'nothing'}`);
    }
  }
  console.log(failed ? `${failed} of ${cases.length} failed.` : `all ${cases.length} cases pass.`);
  process.exit(failed ? 1 : 0);
}

// --- the firms -------------------------------------------------------------------------
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = path.join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
});

const wanted = (value('slugs') || '').split(',').map(s => s.trim()).filter(Boolean);
const candidates = [];
for (const file of walk(path.join(ROOT, 'src', 'data', 'firms'))) {
  const firm = readJson(file, null);
  if (!firm?.slug || firm.status === 'sample') continue;
  if (wanted.length && !wanted.includes(firm.slug)) continue;

  const domain = firm.domain || firm.digital?.domain;
  const staging = domain ? readJson(path.join(ROOT, '.crawl', `${domain}.json`), null) : null;
  const { email, source, ownDomain, rejected } = pickAddress(staging?.emails, domain);
  const score = firm.score ?? {};

  // Only what is true of this firm, read now rather than remembered.
  const excused = new Set([...(score.gates_unavailable ?? []), ...(score.gates_unresolvable ?? [])]);
  const openGates = GATES.filter(g => !(firm.gates?.[g]?.pass) && !excused.has(g)).length;
  const excusedGates = GATES.filter(g => !(firm.gates?.[g]?.pass) && excused.has(g)).length;

  candidates.push({
    slug: firm.slug,
    firm: firm.name,
    domain,
    email,
    source,
    ownDomain,
    rejected,
    tier: score.tier,
    total: score.total,
    city: firm.market?.city,
    state: firm.market?.state,
    openGates,
    excusedGates,
    comparable: score.comparable !== false,
    claimed: Boolean(firm.claimed),
  });
}

const why = (c) =>
  !c.email && c.rejected ? 'the only address we found is not one to write to'
    : !c.email ? 'no public address of theirs that we hold'
    : isSuppressed(c) ? 'on the list of firms not to write to'
    : sent[c.slug] ? `already written to on ${sent[c.slug].at}`
    : c.claimed ? 'already manages this profile'
    : !c.comparable ? 'too little of the scale measured to quote a score'
    : null;

const eligible = candidates.filter(c => !why(c));
// Highest first: a firm that scores well has the most reason to want the page right.
eligible.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
const limit = Number(value('limit') || (wanted.length ? wanted.length : 5));
const batch = eligible.slice(0, limit);

const held = candidates.filter(c => why(c));
console.log(`${candidates.length} firm(s) considered · ${eligible.length} may be written to · `
  + `${batch.length} in this batch`);
if (held.length) {
  const counts = {};
  for (const c of held) counts[why(c)] = (counts[why(c)] ?? 0) + 1;
  for (const [reason, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(5)}  ${reason}`);
  }
}
if (!batch.length) { console.log('\nNothing to send.'); process.exit(0); }

console.log('');
for (const c of batch) {
  console.log(`   ${String(c.total).padStart(3)}  ${String(c.tier).padEnd(14)} `
    + `${c.firm.slice(0, 38).padEnd(38)} ${c.email}`);
}

/*
 * node scripts/send_notice.mjs --limit 25 --where
 *
 * The page each address was read from, which is the only thing an address can be checked
 * against. The batch list above says who would be written to; this says why we believe that
 * mailbox is theirs, and flags the ones that sit on a second domain, where the answer is a
 * judgement rather than a match.
 */
if (flag('where')) {
  console.log('\nwhere each address was published:\n');
  for (const c of batch) {
    console.log(`   ${c.firm.slice(0, 32).padEnd(32)} ${c.email.padEnd(34)}`
      + `${c.ownDomain ? '' : 'second domain · '}${c.source || 'source not recorded'}`);
  }
  const second = batch.filter(c => !c.ownDomain).length;
  console.log(`\n${batch.length - second} of ${batch.length} on the firm's own domain`
    + `${second ? `, ${second} on a second domain worth a look` : ''}.`);
  process.exit(0);
}

// --- the message -----------------------------------------------------------------------
const out = mkdtempSync(path.join(tmpdir(), 'lfl-notice-'));
const bundle = path.join(out, 'bundle.mjs');
await build({
  stdin: {
    contents: `export { listedNoticeBody } from './worker/outbound.ts';
               export { mime } from './worker/mail.ts';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'neutral',
  outfile: bundle, external: ['cloudflare:email'], logLevel: 'warning',
});
const { listedNoticeBody } = await import(pathToFileURL(bundle).href);

const env = { SUBMISSIONS_FROM: 'hello@lawfirmlistings.com', REPLY_TO: 'hello@lawfirmlistings.com' };
const rendered = batch.map(c => ({ c, msg: listedNoticeBody(c, env) }));

if (!flag('send')) {
  console.log(`\n--- what ${batch[0].firm} would receive ---\n`);
  console.log(`Subject: ${rendered[0].msg.subject}\n`);
  console.log(rendered[0].msg.text);
  console.log('\nNothing sent. Add --send to send this batch.');
  process.exit(0);
}

// --- sending ---------------------------------------------------------------------------
const wrangler = (() => {
  const local = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (existsSync(local)) return local;
  const cache = path.join(process.env.LOCALAPPDATA || process.env.HOME || '', 'npm-cache', '_npx');
  for (const dir of (existsSync(cache) ? readdirSync(cache) : [])) {
    const p = path.join(cache, dir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    if (existsSync(p)) return p;
  }
  throw new Error('wrangler not found; cannot send');
})();

let ok = 0;
for (const { c, msg } of rendered) {
  const body = path.join(out, `${c.slug}.txt`);
  writeFileSync(body, msg.text, 'utf8');
  try {
    // Text only. The HTML half is the Worker's to build; this path exists to put a handful of
    // real messages in real inboxes, and a plain letter is the half that always renders.
    execFileSync(process.execPath, [wrangler, 'email', 'sending', 'send',
      '--from', env.SUBMISSIONS_FROM, '--from-name', 'Law Firm Listings',
      '--reply-to', env.REPLY_TO, '--to', c.email,
      '--subject', msg.subject, '--text', readFileSync(body, 'utf8')],
      { encoding: 'utf8', stdio: 'pipe' });
    // Written down the moment it leaves, one firm at a time. A log written after the loop is a
    // log that loses the whole batch when the fourth send throws.
    sent[c.slug] = { at: new Date().toISOString().slice(0, 10), to: c.email, tier: c.tier };
    writeFileSync(SENT, `${JSON.stringify(sent, null, 2)}\n`, 'utf8');
    ok += 1;
    console.log(`  sent   ${c.firm.slice(0, 44).padEnd(44)} ${c.email}`);
  } catch (err) {
    console.error(`  FAILED ${c.firm.slice(0, 44).padEnd(44)} ${String(err.stderr || err.message).trim().slice(0, 90)}`);
  }
}
console.log(`\n${ok} of ${rendered.length} sent. Replies go to ${env.REPLY_TO}.`);
console.log('A REMOVE reply: node scripts/send_notice.mjs --suppress <address or domain>');
