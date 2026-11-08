#!/usr/bin/env node
/**
 * Puts the firms we may write to into KV, once.
 *
 * Three files meet here. scripts/crawl_emails.py found a contact address on the firm's own
 * site and wrote .crawl/emails.json. The build wrote dist/api/firm-pages.json, which says
 * which of our pages carry each firm, and that count is what orders the queue. And
 * src/data/paid-listings.ts says who already pays us, because a client must never be sold
 * the thing it bought.
 *
 * It only ever adds. A row that already exists is left exactly as it is, so a firm that was
 * written to, replied, or unsubscribed keeps that fact through any number of re-runs. The one
 * thing a re-run may do is add somebody new, which is what happens when the crawl finds an
 * address it did not have before.
 *
 * .crawl/emails.json holds real firms' contact addresses and stays out of the repository,
 * which is public. This script is the only thing that reads it.
 *
 *   node scripts/load_prospects.mjs --dry-run
 *   node scripts/load_prospects.mjs
 *   node scripts/load_prospects.mjs --local
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const local = args.includes('--local');

const EMAILS = path.join(ROOT, '.crawl', 'emails.json');
const PAGES = path.join(ROOT, 'dist', 'api', 'firm-pages.json');
const PAID = path.join(ROOT, 'src', 'data', 'paid-listings.ts');

for (const [file, how] of [[EMAILS, 'python scripts/crawl_emails.py'], [PAGES, 'npm run build']]) {
  if (!existsSync(file)) {
    console.error(`\n  ${path.relative(ROOT, file)} is missing. Run: ${how}\n`);
    process.exit(2);
  }
}

function wrangler(rest) {
  const bin = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!existsSync(bin)) throw new Error('wrangler not found in node_modules');
  return execFileSync(process.execPath,
    [bin, 'kv', ...rest, '--binding', 'FOLLOWUPS', local ? '--local' : '--remote'],
    { cwd: ROOT, encoding: 'utf8' });
}

const rows = JSON.parse(readFileSync(EMAILS, 'utf8')).filter(r => r.email);
const pages = JSON.parse(readFileSync(PAGES, 'utf8'));
const paid = new Set(
  [...readFileSync(PAID, 'utf8').matchAll(/'([a-z0-9.-]+\.[a-z]{2,})'/g)].map(m => m[1]));

/**
 * Which keys are already there, so an existing row is never overwritten. One list call beats
 * one get per firm, and a key we hold is a row we leave alone whatever is in it.
 *
 * A dry run tolerates not reaching KV and says so, because the useful half of a dry run is the
 * arithmetic over the three local files. A real run does not: writing without knowing what is
 * already there is how a firm that unsubscribed gets reset to "new" and written to again.
 */
let have = new Set();
try {
  const listed = wrangler(['key', 'list', '--prefix', 'prospect:']);
  have = new Set(
    JSON.parse(listed.slice(listed.indexOf('['))).map(k => k.name.replace('prospect:', '')));
} catch (err) {
  const auth = /Authentication error|10000|not logged in/i.test(String(err.stderr || err));
  console.error('');
  console.error(auth
    ? '  Wrangler is not authenticated against Cloudflare. Run: npx wrangler login'
    : `  Could not read the existing rows: ${String(err.message || err).split('\n')[0]}`);
  if (!dryRun) {
    console.error('');
    console.error('  Refusing to write. Overwriting a row that already says "unsubscribed"');
    console.error('  or "sent" would put that firm back in the queue.');
    console.error('');
    process.exit(3);
  }
  console.error('  Dry run continues, counting every row as new.');
  console.error('');
}

const today = new Date().toISOString().slice(0, 10);
let added = 0;
let skipped = 0;
let clients = 0;
let unlisted = 0;

/**
 * Everything to write, worked out before anything is written.
 *
 * The first version wrote each row with its own `kv key put`, which is its own wrangler
 * process: 569 of them took half an hour, and the crawl will find more addresses every time
 * it runs, so that cost comes back. `kv bulk put` takes a file of key/value pairs and does
 * the lot in one call, which is the same half hour in about four seconds.
 */
const writes = [];
for (const r of rows) {
  if (have.has(r.slug)) { skipped += 1; continue; }
  const on = pages.firms[r.slug];
  if (!on || !on.length) { unlisted += 1; continue; }
  const isClient = paid.has(String(r.domain).toLowerCase());
  if (isClient) clients += 1;

  const prospect = {
    slug: r.slug,
    name: r.name,
    domain: r.domain,
    state: r.state,
    email: r.email,
    pages: on.length,
    status: isClient ? 'client' : 'new',
    added_at: today,
    ...(isClient ? { note: 'already a client, never written to as a prospect' } : {}),
  };

  added += 1;
  writes.push({ key: `prospect:${r.slug}`, value: JSON.stringify(prospect) });
}

console.log('');

/**
 * In chunks, and the file goes in .crawl/ rather than the system temp directory.
 *
 * .crawl/ is gitignored and already holds the addresses these rows carry, so a chunk file
 * that somehow survives a crash is beside the data it came from and out of the repository,
 * which is public. It is deleted in a finally either way.
 */
const CHUNK = 1000;
for (let i = 0; !dryRun && i < writes.length; i += CHUNK) {
  const slice = writes.slice(i, i + CHUNK);
  const tmp = path.join(ROOT, '.crawl', `prospects-bulk-${i}.json`);
  mkdirSync(path.dirname(tmp), { recursive: true });
  writeFileSync(tmp, JSON.stringify(slice), 'utf8');
  try {
    wrangler(['bulk', 'put', tmp]);
    console.log(`  ${Math.min(i + CHUNK, writes.length)} of ${writes.length} written...`);
  } finally {
    rmSync(tmp, { force: true });
  }
}

const writable = added - clients;
console.log('');
console.log(`  ${added} rows ${dryRun ? 'would be added' : 'added'}`);
console.log(`     of which clients, marked and never written to:  ${clients}`);
console.log(`     writable prospects:                             ${writable}`);
console.log(`  ${skipped} already in KV, left exactly as they are`);
console.log(`  ${unlisted} skipped: on no directory page, so the letter has no subject`);
console.log('');
console.log(dryRun ? '  Dry run. Nothing was written.' : '  Done.');
console.log('');
