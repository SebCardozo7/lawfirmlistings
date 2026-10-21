#!/usr/bin/env node
/**
 * A step that walks firms must survive one of them, and must say which it could not do.
 *
 * Opening a market is mostly debugging this pipeline against a new set of websites. In the Los
 * Angeles week twelve pull requests merged and one of them was the market; four were bugs that
 * running it had exposed. Every one of those stopped a run where it stood, and everything
 * behind the failing firm in the list was simply not done: check_ca_register died at firm 153
 * of 252 and the 99 firms after Morgan & Morgan got no register check, crawl_attorneys died on
 * a candidate list and Los Angeles got no rosters at all on its first pass.
 *
 * scripts/_survive.py makes a failure a fact about one firm. This keeps two halves of that
 * honest, and the second half is the one worth guarding:
 *
 *   a step that walks firms creates a Survive
 *   a step that creates one calls report(), because a run that skipped twelve firms and said
 *   nothing is worse than a run that stopped, since the twelve would look measured
 *
 * The list below is the steps that walk firms one at a time. It is written out rather than
 * detected, because a regex over "for ... in" finds loops over practices, offices and
 * attorneys too, and a guard that cries wolf gets switched off.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const WALKS_FIRMS = [
  'crawl_attorneys.py',
  'check_a5.py',
  'check_operating.py',
];

const problems = [];

for (const name of WALKS_FIRMS) {
  const file = path.join('scripts', name);
  if (!existsSync(file)) {
    problems.push(`${name} is in the list of steps that walk firms and does not exist.`);
    continue;
  }
  const src = readFileSync(file, 'utf8');
  if (!/from _survive import Survive/.test(src)) {
    problems.push(`${name} walks firms one at a time and does not import Survive, so the first `
      + 'record that does something unexpected ends the run and every firm behind it is skipped '
      + 'in silence.');
    continue;
  }
  if (!/\brun\s*=\s*Survive\(/.test(src)) {
    problems.push(`${name} imports Survive and never creates one.`);
  }
  if (!/\brun\.report\(\)/.test(src)) {
    problems.push(`${name} creates a Survive and never calls report(), so the firms it could `
      + 'not do are swallowed. That is worse than stopping: they look measured.');
  }
}

// The module itself has to keep failing loudly rather than quietly.
const survive = readFileSync(path.join('scripts', '_survive.py'), 'utf8');
if (!/KeyboardInterrupt|SystemExit/.test(survive)) {
  problems.push('_survive.py no longer lets KeyboardInterrupt through, so a long run can no '
    + 'longer be stopped by hand.');
}
if (!/return 1/.test(survive)) {
  problems.push('_survive.py no longer returns a non-zero code when firms failed, so a run '
    + 'that limped exits as though it had not.');
}

if (problems.length) {
  console.error(problems.map(p => `  ${p}`).join('\n'));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`${WALKS_FIRMS.length} step(s) walk firms, and each one survives a failure and `
  + 'reports it.');
