#!/usr/bin/env node
/**
 * Every practice slug a firm claims has an entry in the catalogue.
 *
 * check_practice_notes.mjs asks whether each practice area carries every field its page reads.
 * This asks the other direction, which nothing asked until now: whether the areas firms claim
 * are areas the site knows about. A slug invents itself the moment somebody types one into a
 * profile, and src/data/practices.ts never hears about it.
 *
 * Two hand-seeded New York profiles carried ten such slugs between them, from before the
 * sub-practices were opened. They were not inert, which is the part worth remembering. The
 * profile template links an area that has a page and renders one that does not as a plain tag,
 * deliberately, so nine of them showed on Greenstein & Pittari as unlinked chips and all fifteen
 * counted toward the "Practice areas" fact in its hero. The next firm on the site shows six and
 * 1,246 of 1,412 show one, so a reader comparing firms saw a practice two and a half times
 * broader than anything else in the directory, assembled by hand rather than measured. The
 * build passed the whole time. Nothing it ran looked at the slug.
 *
 * So the failure this catches is quiet by construction: no error, no broken link, just a claim
 * the rest of the site cannot see. The other half is the spelling. A firm tagged
 * "motorcycle-accident" would miss the day /practice-areas/motorcycle-accidents/ opens and go on
 * missing it, because the page is built by matching this string exactly. Where a slug is close
 * to a real one the report says so, since that case is a typo and not a decision.
 *
 * The reverse-reverse is a note rather than a problem. A practice described in the catalogue
 * with no firm behind it builds no page at all, which getStaticPaths does on purpose, so it is
 * worth saying out loud and is not a reason to fail.
 *
 * Usage:
 *   node scripts/check_practice_slugs.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// The catalogue's own keys, read from the file rather than listed here, so opening a practice
// area is still a one-file change and this guard cannot drift from what the site renders.
const src = readFileSync(join(ROOT, 'src', 'data', 'practices.ts'), 'utf8');
const body = src.slice(src.indexOf('export const PRACTICES'));
const CATALOGUE = [...body.matchAll(/\n {2}(?:'([a-z-]+)'|([a-zA-Z-]+)): \{/g)]
  .map(m => m[1] ?? m[2]);
const known = new Set(CATALOGUE);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

/** Edit distance, capped: used only to tell a typo apart from an area nobody has opened. */
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1,
                        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

const files = walk(join(ROOT, 'src', 'data', 'firms'));
const claimed = new Map();   // slug -> [{ file, name }]
let claims = 0;

for (const path of files) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(data.practices)) continue;
  for (const pr of data.practices) {
    if (!pr || !pr.slug) continue;
    claims++;
    const where = { file: relative(ROOT, path).split(sep).join('/'), name: data.name };
    claimed.set(pr.slug, [...(claimed.get(pr.slug) ?? []), where]);
  }
}

const problems = [];
const notes = [];

for (const [slug, rows] of [...claimed].sort()) {
  if (known.has(slug)) continue;
  const near = CATALOGUE
    .map(k => [k, distance(slug, k)])
    .filter(([, d]) => d > 0 && d <= 3)
    .sort((a, b) => a[1] - b[1])[0];
  problems.push(`"${slug}" is claimed by ${rows.length} firm(s) and has no entry in `
    + `src/data/practices.ts: ${rows.slice(0, 3).map(r => r.file).join(', ')}`
    + `${rows.length > 3 ? ' and others' : ''}. `
    + (near
      ? `Did you mean "${near[0]}"? The practice pages match this string exactly, so a firm `
        + `spelled this way is left out of that ranking and stays left out.`
      : `The profile renders it as an unlinked tag and counts it in the firm's "Practice areas" `
        + `fact, so it is visible to a reader while no page, ranking or footer link can reach `
        + `it. Open the area in the catalogue or drop the claim from the profile.`));
}

// A practice nobody claims renders no page, which getStaticPaths does deliberately. Said out
// loud so that an area described at length and reachable from nowhere is a thing somebody knows.
const unclaimed = CATALOGUE.filter(slug => !claimed.has(slug));
if (unclaimed.length) {
  notes.push(`${unclaimed.length} practice area(s) have notes but no firms, so no page is built `
    + `for them: ${unclaimed.join(', ')}.`);
}

for (const p of problems) console.log(p);
if (notes.length) {
  if (problems.length) console.log('');
  for (const n of notes) console.log(n);
}
console.log(`\n${files.length} firm file(s) · ${claims} practice claim(s) · `
  + `${claimed.size} distinct slug(s) against a catalogue of ${CATALOGUE.length} · `
  + `${problems.length} problem(s) · ${notes.length} note(s)`);
if (!problems.length) console.log('Every practice a firm claims exists in the catalogue.');
process.exit(problems.length ? 1 : 0);
