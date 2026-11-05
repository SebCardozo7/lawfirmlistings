#!/usr/bin/env node
/**
 * No firm gets a followed link to its own site unless it pays for one.
 *
 * The rule itself lives in src/lib/outbound.ts and every template now reads it from there. This
 * exists because that was not enough on the day the rule changed: four templates asked the
 * shared helper and a fifth, the best-law-firm-websites guide, carried its own copy of the old
 * rule and kept handing followed links to fourteen firms that had not paid. The build was green,
 * every other guard passed, and the only thing that found it was reading the built HTML.
 *
 * So this reads the built HTML. A rule enforced by everybody remembering to call one function is
 * a rule that holds until somebody writes a sixth template, and the next person writing a page
 * that links out to a firm should be stopped by a failing check rather than by their memory.
 *
 * What it allows, and the two categories are different in kind:
 *
 *   A firm on the paid list        src/data/paid-listings.ts. The one thing payment reaches.
 *   A domain that is not a firm    a statute, a register, a court, a source a guide cites. The
 *                                  research pages link to the law they quote and those links
 *                                  are editorial. Nofollowing a citation to a state's own code
 *                                  would be a strange thing for a directory that is trying to
 *                                  be quotable to do.
 *
 * Anything else is a failure: a domain this directory publishes a profile for, receiving a
 * followed link, without being on the paid list.
 *
 *   node scripts/check_outbound.mjs            after npm run build
 *   node scripts/check_outbound.mjs --list     print every followed link and its page
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const FIRMS = join('src', 'data', 'firms');

const norm = (d) => d.trim().toLowerCase().replace(/^www\./, '');

// Read the paid list out of the TypeScript rather than importing it, so this script needs no
// bundler and cannot drift from the file the templates read.
const paidSource = readFileSync(join('src', 'data', 'paid-listings.ts'), 'utf8');
const block = paidSource.match(/PAID_LISTING_DOMAINS[^=]*=\s*\[([^\]]*)\]/);
if (!block) {
  console.error('could not read PAID_LISTING_DOMAINS from src/data/paid-listings.ts');
  process.exit(2);
}
// Commented-out entries are not on the list. The first version of this read the quoted strings
// straight out of the block, so commenting a domain out left it counted as paid, and the test
// that was supposed to prove this check works reported a pass instead. A check that cannot be
// made to fail has not been shown to do anything.
const paid = new Set(
  block[1]
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n')
    .match(/'([^']+)'/g)
    ?.map(q => norm(q.slice(1, -1))) ?? [],
);

const firmDomains = new Set();
for (const state of readdirSync(FIRMS)) {
  const dir = join(FIRMS, state);
  if (!statSync(dir).isDirectory()) continue;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const d = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    if (d.domain) firmDomains.add(norm(d.domain));
  }
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name === 'index.html') out.push(p);
  }
  return out;
}

const ANCHOR = /<a\b[^>]*>/g;
const HREF = /href="(https?:\/\/[^"]+)"/;
const REL = /rel="([^"]*)"/;
const OURS = /(^|\.)lawfirmlistings\.com$/;

const bad = [];
let followed = 0;
let pages = 0;
const listed = [];

for (const file of walk(DIST)) {
  pages += 1;
  const url = ('/' + relative(DIST, file).split(sep).join('/')).replace(/index\.html$/, '');
  const html = readFileSync(file, 'utf8');
  for (const [tag] of html.matchAll(ANCHOR)) {
    const href = tag.match(HREF);
    if (!href) continue;
    let host;
    try { host = norm(new URL(href[1]).hostname); } catch { continue; }
    if (!host || OURS.test(host)) continue;
    const rel = tag.match(REL);
    if (rel && /\bnofollow\b/.test(rel[1])) continue;
    followed += 1;
    listed.push(`${url}  ->  ${host}`);
    if (firmDomains.has(host) && !paid.has(host)) bad.push({ url, host });
  }
}

if (process.argv.includes('--list')) {
  for (const row of listed.sort()) console.log(row);
  console.log('');
}

console.log(`${pages} pages, ${followed} followed outbound link(s)`);
console.log(`   ${paid.size} domain(s) on the paid list, ${firmDomains.size} firm domain(s) published`);

if (bad.length) {
  const byHost = new Map();
  for (const b of bad) {
    if (!byHost.has(b.host)) byHost.set(b.host, []);
    byHost.get(b.host).push(b.url);
  }
  console.error(`\n${byHost.size} firm(s) receive a followed link without a paid listing:\n`);
  for (const [host, urls] of [...byHost].sort()) {
    console.error(`   ${host}  (${urls.length} link(s))`);
    for (const u of urls.slice(0, 3)) console.error(`      ${u}`);
    if (urls.length > 3) console.error(`      ... and ${urls.length - 3} more`);
  }
  console.error('\nEvery template that links to a firm must take its rel from firmLinkRel()');
  console.error('in src/lib/outbound.ts. Run with --list to see every followed link.');
  process.exit(1);
}

console.log('\nNo firm receives a followed link without a paid listing.');
