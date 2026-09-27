#!/usr/bin/env node
/**
 * Per-market coverage of every measurement, so a pipeline step nobody ran is visible.
 *
 * Three steps were skipped for a whole market this week and none of them failed. enrich_places
 * ran against staging the crawl had not written yet and reported "0 enriched". check_fl_register
 * ran before the Miami profiles were moved into the directory and quietly did Naples and Lakeland
 * instead. And fetch_logos was never run for Miami, Houston or Atlanta at all, so 227 firms
 * carried a monogram where a logo existed. The first two were caught by looking at a number that
 * seemed wrong. The third was caught by the owner, days later, looking at the site.
 *
 * What they have in common is that a step which does nothing exits 0 and prints a small number,
 * and a small number reads exactly like "there was not much to do". The guard added to
 * enrich_places covers running too early. Nothing covered never running at all.
 *
 * So this asks a different question: not "did the script work" but "does this market look like
 * the others". A field that 95% of firms in one city carry and 0% carry in another is a step that
 * did not run there, and that comparison needs no knowledge of what any script does.
 *
 * Exits 1 when a market is at zero on something another market has, because that is never a fact
 * about the market. A low share is reported and does not fail: small firms really do lack logos,
 * and some states really do publish nothing.
 *
 * Usage:
 *   node scripts/check_coverage.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const FIRMS = join(ROOT, 'src', 'data', 'firms');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

const firms = walk(FIRMS)
  .map(p => JSON.parse(readFileSync(p, 'utf8')))
  .filter(f => f.status !== 'sample');

// Each one is a thing some script is supposed to write. The test is presence, not quality: this
// is asking whether the step ran, and a firm that legitimately has nothing shows up as a low
// share rather than a zero across the whole market.
const FIELDS = [
  ['logo', f => Boolean(f.logo), 'fetch_logos.py'],
  ['Google listing', f => Boolean(f.digital?.places?.listing_count), 'enrich_places.py'],
  ['profile completeness', f => Boolean(f.digital?.places?.completeness), 'enrich_places.py'],
  ['PageSpeed', f => f.digital?.psi?.value?.performance != null, 'enrich_psi.py'],
  ['operating history', f => Boolean(f.operating?.registered), 'check_operating.py'],
  ['accountability', f => Boolean(f.accountability?.evidence), 'check_a5.py'],
  ['results reading', f => Boolean(f.results_published), 'crawl_results.py'],
  ['search authority', f => Boolean(f.digital?.ahrefs?.dr != null), 'apply_ahrefs.py'],
];

const markets = [...new Set(firms.map(f => f.market.city))].sort();
const problems = [];
const notes = [];

for (const [label, has, script] of FIELDS) {
  const shares = markets.map(city => {
    const m = firms.filter(f => f.market.city === city);
    return { city, n: m.length, got: m.filter(has).length };
  });
  const best = Math.max(...shares.map(s => s.got / s.n));
  if (best === 0) continue;   // nothing anywhere: not yet a step this directory runs
  for (const s of shares) {
    const share = s.got / s.n;
    if (s.got === 0) {
      problems.push(`${s.city}: no firm has a ${label}, and other markets reach `
        + `${Math.round(best * 100)}%. ${script} looks like it never ran here.`);
    } else if (share < 0.5 && best > 0.8) {
      notes.push(`${s.city}: ${s.got} of ${s.n} have a ${label} (${Math.round(share * 100)}%), `
        + `against ${Math.round(best * 100)}% elsewhere.`);
    }
  }
}

// A market can carry every measurement and still be wrong, and Houston was: all eight fields
// present on all seventy five firms, and all seventy five at Listed, because G3 said "Secretary
// of State registration still to confirm" and a gate we owe holds a firm at the bottom tier. The
// field checks above passed it without a word for a week.
//
// So this asks the same comparative question about the outcome rather than the inputs. Nothing
// here says what a tier should be: it says that a market where nobody at all clears the bottom
// rung, in a directory where four out of five firms elsewhere do, is a finding about the pipeline
// and not about the firms. A low share is a market, and only a zero is reported.
const tiers = markets.map(city => {
  const m = firms.filter(f => f.market.city === city);
  return { city, n: m.length, got: m.filter(f => f.status !== 'listed').length };
});
const bestTier = Math.max(...tiers.map(t => t.got / t.n));
for (const t of tiers) {
  if (t.got === 0 && bestTier > 0.5) {
    problems.push(`${t.city}: not one of ${t.n} firms is above Listed, and other markets reach `
      + `${Math.round(bestTier * 100)}%. That is a gate nobody has answered rather than a market `
      + `of weak firms: read the G3 and G5 rows on any profile there.`);
  }
}

for (const p of problems) console.log(p);
if (notes.length) {
  if (problems.length) console.log('');
  for (const n of notes) console.log(n);
}
console.log(`\n${firms.length} firms across ${markets.length} markets · `
  + `${problems.length} market(s) at zero on something · ${notes.length} note(s)`);
if (!problems.length && !notes.length) {
  console.log('Every market carries every measurement another market carries.');
}
process.exit(problems.length ? 1 : 0);
