#!/usr/bin/env node
/**
 * The tier thresholds the methodology page publishes must be the ones the engine uses.
 *
 * Two faults found on the same afternoon had the same shape: a constant in scripts/ moved, or
 * failed to move, and the page that tells the public what we do went on saying the old thing.
 * OPEN_REGISTER_STATES stayed at {"NY"} for thirteen days after California became readable and
 * 109 profiles published a sentence about California that had stopped being true. The tier
 * thresholds were 70/85/93 in both places and nobody could reach the top two, which the page
 * advertised anyway.
 *
 * check_listing_rules.mjs already does this for the gates. This is the same idea for the tiers,
 * and it reads both sides rather than holding a third copy of the numbers, because a guard with
 * its own copy of the truth is the thing it is guarding against.
 */
import { readFileSync } from 'node:fs';

const engine = readFileSync('scripts/score.py', 'utf8');
const page = readFileSync('src/pages/methodology.astro', 'utf8');

const tiersLine = engine.match(/^TIERS = \[(.+)\]$/m);
if (!tiersLine) {
  console.error('scripts/score.py: no TIERS line to read.');
  process.exit(1);
}
const engineTiers = {};
for (const [, name, need] of tiersLine[1].matchAll(/\("([A-Za-z]+)",\s*(\d+)/g)) {
  engineTiers[name] = Number(need);
}

const problems = [];

// 1. The summary row near the top of the page.
const row = page.match(
  /Certified from <b>(\d+)<\/b><\/span><span>Distinguished <b>(\d+)<\/b><\/span><span>Elite <b>(\d+)<\/b>/);
if (!row) {
  problems.push('methodology.astro: the summary row of thresholds is not in the shape this reads.');
} else {
  const [, cert, dist, elite] = row.map(Number);
  for (const [name, published] of [['Certified', cert], ['Distinguished', dist], ['Elite', elite]]) {
    if (published !== engineTiers[name]) {
      problems.push(`${name}: the page says ${published}, the engine scores at ${engineTiers[name]}.`);
    }
  }
}

// 2. The bands in the tier cards, which must start where each tier starts and stop one short
//    of the next. A reader comparing their own score against a band is reading this, not the
//    summary row.
const bands = [...page.matchAll(/<div class="range">(\d+)[–-](\d+)/g)].map(m => [Number(m[1]), Number(m[2])]);
const expected = [
  ['Certified', engineTiers.Certified, engineTiers.Distinguished - 1],
  ['Distinguished', engineTiers.Distinguished, engineTiers.Elite - 1],
  ['Elite', engineTiers.Elite, 100],
];
if (bands.length !== expected.length) {
  problems.push(`methodology.astro: found ${bands.length} score bands, expected ${expected.length}.`);
} else {
  expected.forEach(([name, from, to], i) => {
    const [pf, pt] = bands[i];
    if (pf !== from || pt !== to) {
      problems.push(`${name}: the page shows the band ${pf}–${pt}, the engine makes it ${from}–${to}.`);
    }
  });
}

// 3. The number of gates, stated in prose on the same page.
const gates = engine.match(/^GATES = \((.+)\)$/m);
const gateCount = gates ? [...gates[1].matchAll(/"G\d"/g)].length : 0;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
for (const [i, word] of WORDS.entries()) {
  const re = new RegExp(`${word} gates pass`, 'i');
  if (re.test(page) && i !== gateCount) {
    problems.push(`methodology.astro says "${word} gates pass"; GATES holds ${gateCount}.`);
  }
}

if (problems.length) {
  console.error(problems.map(p => `  ${p}`).join('\n'));
  console.error(`\n${problems.length} place(s) where the published method and the engine disagree.`);
  process.exit(1);
}
console.log(`${Object.keys(engineTiers).length} tier threshold(s) and the gate count match the engine: `
  + Object.entries(engineTiers).map(([n, v]) => `${n} ${v}`).join(', ') + `, ${gateCount} gates`);
