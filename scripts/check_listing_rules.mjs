/**
 * The rules on /list-your-firm/ are a restatement of the eligibility gates, and a restatement
 * drifts. This fails the build when it has.
 *
 * Two directions, both of which matter and for different reasons.
 *
 * A rule naming a gate the engine does not have is a promise to firms about a check nobody runs.
 * G4 is the cautionary tale: it was retired at v2.0 because no search can establish the absence
 * of a consumer-protection action anywhere in the country, and for a while afterwards the
 * methodology page still described six gates and listed five.
 *
 * A gate the page does not mention is worse in the other direction: a firm reads the page, meets
 * everything on it, and is then held back by a requirement it was never told about. The page is
 * the firm's copy of the rules, so it has to carry all of them.
 *
 * Usage: node scripts/check_listing_rules.mjs
 */
import { readFileSync } from 'node:fs';

const engine = readFileSync('scripts/score.py', 'utf8');
const page = readFileSync('src/data/listing.ts', 'utf8');

const gatesLine = engine.match(/^GATES\s*=\s*\(([^)]*)\)/m);
if (!gatesLine) {
  console.error('Could not find GATES in scripts/score.py. If the engine moved it, move this too.');
  process.exit(2);
}
const engineGates = [...gatesLine[1].matchAll(/"([A-Z]\d)"/g)].map(m => m[1]);
const pageGates = [...page.matchAll(/^\s*gate:\s*'([A-Z]\d)'/gm)].map(m => m[1]);

const invented = pageGates.filter(g => !engineGates.includes(g));
const unmentioned = engineGates.filter(g => !pageGates.includes(g));

const problems = [];
for (const g of invented) {
  problems.push(`${g} is described to firms on /list-your-firm/ and is not a gate the engine runs.`);
}
for (const g of unmentioned) {
  problems.push(`${g} is a gate the engine runs and /list-your-firm/ never tells a firm about it.`);
}

const dupes = pageGates.filter((g, i) => pageGates.indexOf(g) !== i);
for (const g of new Set(dupes)) {
  problems.push(`${g} is described twice on /list-your-firm/.`);
}

/*
 * The price is written in two files and a firm can see both.
 *
 * `price` on the Annual listing prints on every page: /list-your-firm/, every profile, every
 * city ranking. LISTING_PRICE_USD in wrangler.jsonc prints in the follow-up and the chase, and
 * payLink() puts it on the end of the PayPal URL, so it is also the figure PayPal opens showing.
 *
 * They drifted between 2026-11-06 and 2026-11-08: a Houston firm was quoted 500 by email while
 * the ranking page it had asked about still said 350. Nobody noticed from inside, because each
 * file was correct on its own. A price a reader can check in one click has to be one number.
 */
const worker = readFileSync('wrangler.jsonc', 'utf8');
const pagePrice = page.match(/name: 'Annual listing',[\s\S]{0,900}?price: '(\d[\d,]*)\s*USD'/)?.[1];
const mailPrice = worker.match(/"LISTING_PRICE_USD":\s*"(\d[\d,]*)"/)?.[1];
const clean = v => (v ?? '').replace(/,/g, '');

if (!pagePrice) problems.push("could not read the Annual listing price from src/data/listing.ts.");
if (!mailPrice) problems.push('could not read LISTING_PRICE_USD from wrangler.jsonc.');
if (pagePrice && mailPrice && clean(pagePrice) !== clean(mailPrice)) {
  problems.push(`the pages say ${pagePrice} USD a year and the emails say ${mailPrice}. `
    + 'A firm quoted one figure can open a ranking page and read the other.');
}

if (problems.length) {
  console.error('Listing rules do not match the engine:\n');
  for (const p of problems) console.error('  ' + p);
  console.error(`\nengine: ${engineGates.join(', ')}\npage:   ${pageGates.join(', ')}`);
  process.exit(1);
}

console.log(`${pageGates.length} listing rule(s) match the engine's gates: ${engineGates.join(', ')}`);
console.log(`the pages and the emails both say ${pagePrice} USD a year.`);
