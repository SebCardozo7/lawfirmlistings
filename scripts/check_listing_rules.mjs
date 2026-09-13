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

if (problems.length) {
  console.error('Listing rules do not match the engine:\n');
  for (const p of problems) console.error('  ' + p);
  console.error(`\nengine: ${engineGates.join(', ')}\npage:   ${pageGates.join(', ')}`);
  process.exit(1);
}

console.log(`${pageGates.length} listing rule(s) match the engine's gates: ${engineGates.join(', ')}`);
