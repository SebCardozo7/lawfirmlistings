#!/usr/bin/env node
/**
 * No firm is published twice, and no published firm is missing what the pages read from it.
 *
 * A profile's filename comes from its slug, which comes from its name. Change how a name is
 * derived and the slug changes with it, and build_profiles writes the new file beside the old one
 * rather than over it. Nothing errors. The directory simply has the same firm in it twice, once
 * with the measurements and once without, and the ranked lists count it twice.
 *
 * That happened the day a name cleaner was added: "Ozols Law Firm Car Accident & Injury
 * Attorneys" and "Ozols Law Firm" are one firm at findlegaladvice.org. It surfaced three days
 * later as a TypeError in an unrelated guide, which is a long way from the cause.
 *
 * The second check is the other half of the same morning. A guide asserted that every firm has a
 * Places block because every firm did when it was written, and one that did not took the whole
 * build down. A page can guard itself, and this says which firms it would have to guard against.
 *
 * Usage:
 *   node scripts/check_duplicates.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, 'src', 'data', 'firms'));
const firms = files.map(p => ({ file: basename(p), data: JSON.parse(readFileSync(p, 'utf8')) }));

const problems = [];
const notes = [];

// One domain, one profile. A firm with two offices is one firm; a firm with two files is a bug.
const byDomain = new Map();
for (const f of firms) {
  const d = (f.data.domain || '').toLowerCase();
  if (!d) continue;
  byDomain.set(d, [...(byDomain.get(d) ?? []), f]);
}
for (const [domain, rows] of byDomain) {
  if (rows.length > 1) {
    problems.push(`${domain} is published ${rows.length} times: ${rows.map(r => r.file).join(', ')}. `
      + `A slug changed and the old file stayed beside the new one, so the ranked lists count `
      + `this firm more than once.`);
  }
}

// One slug, one firm. Two different firms whose names reduce to the same slug would overwrite
// each other, which loses one of them silently.
const bySlug = new Map();
for (const f of firms) {
  const s = f.data.slug;
  if (!s) continue;
  bySlug.set(s, [...(bySlug.get(s) ?? []), f]);
}
for (const [slug, rows] of bySlug) {
  if (rows.length > 1) {
    problems.push(`slug "${slug}" belongs to ${rows.length} firms: `
      + `${rows.map(r => r.data.domain).join(', ')}. One of them is reachable at that URL and the `
      + `others are not.`);
  }
}

// What the pages read. Absent on a published firm is not an error here, because a firm whose
// Places lookup found nothing is a real thing. It is reported so that a page asserting it exists
// is a decision somebody made rather than a build that happens to pass today.
const FIELDS = [
  ['digital.places', f => f.data.digital?.places],
  ['score', f => f.data.score],
  ['offices', f => (f.data.offices ?? []).length > 0],
];
const live = firms.filter(f => f.data.status !== 'sample' && f.data.status !== 'not_eligible');
for (const [label, has] of FIELDS) {
  const missing = live.filter(f => !has(f));
  if (missing.length) {
    notes.push(`${missing.length} published firm(s) have no ${label}: `
      + `${missing.slice(0, 3).map(f => f.data.domain).join(', ')}`
      + `${missing.length > 3 ? ' and others' : ''}. A page that reads it must filter for it.`);
  }
}

for (const p of problems) console.log(p);
if (notes.length) {
  if (problems.length) console.log('');
  for (const n of notes) console.log(n);
}
console.log(`\n${firms.length} firm file(s) · ${byDomain.size} distinct domain(s) · `
  + `${problems.length} problem(s) · ${notes.length} note(s)`);
if (!problems.length && !notes.length) console.log('Every firm is published once and carries what the pages read.');
process.exit(problems.length ? 1 : 0);
