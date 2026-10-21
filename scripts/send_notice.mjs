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

/** An address is suppressed by itself or by its domain, so one reply can cover a whole firm. */
const isSuppressed = (email) => {
  const e = email.toLowerCase();
  return suppressed.has(e) || suppressed.has(e.split('@')[1] ?? '');
};

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
  const first = Array.isArray(staging?.emails) ? staging.emails[0] : null;
  const email = typeof first === 'string' ? first : first?.value;
  const score = firm.score ?? {};

  // Only what is true of this firm, read now rather than remembered.
  const excused = new Set([...(score.gates_unavailable ?? []), ...(score.gates_unresolvable ?? [])]);
  const openGates = GATES.filter(g => !(firm.gates?.[g]?.pass) && !excused.has(g)).length;
  const excusedGates = GATES.filter(g => !(firm.gates?.[g]?.pass) && excused.has(g)).length;

  candidates.push({
    slug: firm.slug,
    firm: firm.name,
    email,
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
  !c.email ? 'no public address of theirs that we hold'
    : isSuppressed(c.email) ? 'asked not to be written to'
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
