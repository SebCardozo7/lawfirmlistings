/**
 * How old is the evidence behind the site?
 *
 * Every measured value in a firm record carries the date it was taken, and every guide computes
 * its figures from those records at build time. That means a guide cannot state a number the data
 * does not support, but it can quietly go stale: a page that says "we read every results page"
 * is a weaker claim each month nobody re-reads them. Nothing in the build notices that, because
 * an old date is still a valid date.
 *
 * This does. It groups every dated field by what produced it, prints the oldest and newest
 * reading in each family, and says which families have not been refreshed inside the window.
 *
 *   node scripts/check_freshness.mjs              # report, always exits 0
 *   node scripts/check_freshness.mjs --strict     # exits 1 if a family is stale
 *   node scripts/check_freshness.mjs --days 35    # window, default 35
 *
 * The monthly refresh (docs/monthly-refresh.md) runs it with --strict at the end, which is what
 * turns "we should update this monthly" into something that fails out loud when we do not.
 *
 * It is deliberately not wired into `npm run build`: a deploy of unchanged prose should not fail
 * because a crawl is a week late, and the person who decides that is not the build.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const days = Number(args[args.indexOf('--days') + 1]) || 35;

const FIRMS = 'src/data/firms';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

// Each family is one measurement run: the script that writes it, and the date it stamps. A field
// that is absent for a firm is not stale, it is unmeasured, and the count says which is which.
const FAMILIES = [
  ['Published results (pillar B)', 'scripts/crawl_results.py', f => f.results_published?.checked_at],
  ['PageSpeed (pillar D)', 'scripts/enrich_psi.py', f => f.digital?.psi?.measured_at],
  ['Google Business Profile (pillar C)', 'scripts/enrich_places.py', f => f.digital?.places?.measured_at],
  ['Accountability (pillar A)', 'scripts/check_operating.py', f => f.accountability?.checked_at],
  ['Operating history', 'scripts/check_operating.py', f => f.operating?.checked_at],
  ['Scores', 'scripts/score.py', f => f.score?.computed_at],
];

const firms = walk(FIRMS)
  .map(p => JSON.parse(readFileSync(p, 'utf8')))
  .filter(f => f.status !== 'sample' && f.status !== 'not_eligible');

const now = Date.now();
const ageDays = iso => Math.floor((now - new Date(iso).getTime()) / 86_400_000);
const stale = [];

console.log(`${firms.length} published firms, window ${days} days\n`);
for (const [label, script, read] of FAMILIES) {
  const dates = firms.map(read).filter(Boolean).sort();
  if (!dates.length) {
    console.log(`${label.padEnd(36)} no readings yet  (${script})`);
    continue;
  }
  const newest = ageDays(dates[dates.length - 1]);
  const oldest = ageDays(dates[0]);
  const missing = firms.length - dates.length;
  const flag = newest > days ? 'STALE' : 'ok';
  console.log(
    `${label.padEnd(36)} ${String(flag).padEnd(6)} newest ${newest}d, oldest ${oldest}d, ` +
    `${dates.length}/${firms.length} firms${missing ? `, ${missing} unmeasured` : ''}`);
  if (newest > days) stale.push([label, newest, script]);
}

if (stale.length) {
  console.error(`\n${stale.length} famil${stale.length === 1 ? 'y has' : 'ies have'} not been refreshed inside the window:`);
  for (const [label, newest, script] of stale) {
    console.error(`  ${label}: newest reading is ${newest} days old — re-run ${script}`);
  }
  console.error('\nSee docs/monthly-refresh.md for the order these run in.');
} else {
  console.log('\nEvery family has at least one reading inside the window.');
}

process.exit(strict && stale.length ? 1 : 0);
