#!/usr/bin/env node
/**
 * A name published at three or more unrelated firms is almost never a person.
 *
 * The directory published "Spinal Cord" as an attorney at twenty-one firms, "Frequently Asked
 * Questions" at seventeen and "Giving Back" at thirteen. They are headings the crawler read off
 * pages about an injury, a town or a section of a site, and they survived every filter in the
 * pipeline because they are two capitalised words, which is also what a name is: nothing in the
 * letters of "Del Mar" separates it from "Dallas Bray", who is an attorney in Florida.
 *
 * What does separate them is how often they occur. Across 10,363 published names, 58 strings
 * appeared at three firms or more and 56 of them were page titles. That is the signal this
 * guard watches, and the reason it is a guard rather than a rule: the other two were people.
 * David Altman and Steven Altman are published by Altman & Altman, Altman Nussbaum Shunnarah
 * and Alexander Shunnarah Trial Attorneys, three firms of one family, each at a bio page of its
 * own. A pattern would have deleted them. A build that stops and asks does not.
 *
 * So when a new name reaches three firms the build fails, somebody reads it, and it goes into
 * one of two lists: RECURRING_HEADINGS in scripts/build_profiles.py if it is a page, or REVIEWED
 * below if it is a person. Striking a real attorney off their own firm's roster is the worse of
 * the two mistakes available here, and this is what makes sure a person decides which it is.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/**
 * Names that really do appear at three or more firms, each checked by hand against the bio page
 * the firm publishes. A line here is a statement that somebody looked.
 */
const REVIEWED = new Set([
  // Altman & Altman, Altman Nussbaum Shunnarah and Alexander Shunnarah Trial Attorneys: one
  // family of firms, and both men have a /attorney/ or /lawyers/ bio at each.
  'David Altman',
  'Steven Altman',
]);

const THRESHOLD = 3;

const walk = dir => readdirSync(dir).flatMap(name => {
  const p = path.join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
});

const firmsByName = new Map();
for (const file of walk(path.join(ROOT, 'src', 'data', 'firms'))) {
  let firm;
  try {
    firm = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    continue;
  }
  if (firm.status === 'sample' || firm.status === 'not_eligible') continue;
  for (const attorney of firm.attorneys ?? []) {
    const name = (attorney.name ?? '').trim();
    if (!name) continue;
    if (!firmsByName.has(name)) firmsByName.set(name, new Set());
    firmsByName.get(name).add(firm.slug);
  }
}

const unreviewed = [...firmsByName.entries()]
  .filter(([name, firms]) => firms.size >= THRESHOLD && !REVIEWED.has(name))
  .sort((a, b) => b[1].size - a[1].size);

if (unreviewed.length) {
  console.error(`${unreviewed.length} name(s) are published as an attorney at ${THRESHOLD} or more firms `
    + 'and have not been read by anybody:\n');
  for (const [name, firms] of unreviewed) {
    console.error(`  ${String(firms.size).padStart(3)}  ${name}`);
    console.error(`       ${[...firms].slice(0, 4).join(', ')}${firms.size > 4 ? ' …' : ''}`);
  }
  console.error('\nOpen one of their profiles and look at the page the name came from.');
  console.error('A page title goes in RECURRING_HEADINGS in scripts/build_profiles.py.');
  console.error('A person goes in REVIEWED in this file, with the bio URL that settles it.');
  process.exit(1);
}

const reviewedSeen = [...REVIEWED].filter(n => firmsByName.has(n)).length;
console.log(`${firmsByName.size} distinct attorney names published · none at ${THRESHOLD} firms or more `
  + `except the ${reviewedSeen} already read.`);
