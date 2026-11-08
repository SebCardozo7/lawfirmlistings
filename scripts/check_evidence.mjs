#!/usr/bin/env node
/**
 * A published evidence line may not cite a source that does not cover the firm it is about.
 *
 * This exists because of one sentence repeated 144 times. A2 is the mean years since admission
 * across a firm's attorneys, and the engine wrote "NYS Attorney Registration database" into its
 * evidence for every firm that had the data, including every Californian one. The years
 * themselves were correct, read by scripts/check_ca_register.py from the State Bar, and A6 one
 * factor below said "California register" on the very same page. Only the citation was wrong.
 *
 * That is the worst kind of wrong here. The whole argument of this directory is that a number
 * arrives with the source behind it and anybody may go and check. A California lawyer reading
 * their own profile could disprove that line without leaving the page, and would be right to
 * wonder what else we made up. It is also exactly the kind of error that survives review: the
 * sentence is fluent, the number beside it is real, and nothing reads the two together.
 *
 * So something reads the two together. For each attorney register we are allowed to query, the
 * profiles that may name it are the profiles in that state. Any other profile naming it is a
 * false citation and fails this.
 *
 *   node scripts/check_evidence.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const FIRMS = path.join(ROOT, 'src', 'data', 'firms');

/**
 * Phrases that name one state's attorney register, and the only state whose profiles may carry
 * them. Taken from the DATASET constants in the scripts that read each register and from
 * REGISTER_NAMES in score.py, which is where the evidence line gets its wording.
 *
 * Deliberately not a general "does this profile mention another state" check. Firms have
 * offices in several states and say so, lawyers are admitted in more than one, and a guard
 * that fires on all of that gets switched off. This fires only on a claim about where we
 * looked something up.
 */
const REGISTERS = [
  { phrase: 'NYS Attorney Registration', state: 'NY' },
  { phrase: 'New York register', state: 'NY' },
  { phrase: "State Bar of California's licensee search", state: 'CA' },
  { phrase: 'California register', state: 'CA' },
];

let failed = 0;
const bad = [];
let lines = 0;
let profiles = 0;

for (const state of readdirSync(FIRMS)) {
  const dir = path.join(FIRMS, state);
  if (!statSync(dir).isDirectory()) continue;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    let firm;
    try {
      firm = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      continue;
    }
    profiles += 1;
    const here = state.toUpperCase();

    // Everywhere a profile names where a fact came from. The sub-factors were the obvious
    // place and were the only place this looked at first, which was wrong by exactly the
    // mistake it was written for: poisoning a test profile edited a gate instead, and the
    // guard reported all clear. The gates carry a source field and an evidence string, both
    // published, and a gate citing the wrong register is the same lie in a louder position.
    const claims = [];
    for (const pillar of Object.values(firm.score?.pillars ?? {})) {
      for (const subFactor of pillar.subs ?? []) {
        claims.push({ where: subFactor.code, text: String(subFactor.evidence ?? '') });
      }
    }
    for (const [code, gate] of Object.entries(firm.gates ?? {})) {
      claims.push({ where: `${code} source`, text: String(gate?.source ?? '') });
      claims.push({ where: code, text: String(gate?.evidence ?? '') });
    }

    for (const { where, text } of claims) {
      if (!text) continue;
      lines += 1;
      for (const { phrase, state: owner } of REGISTERS) {
        if (text.includes(phrase) && owner !== here) {
          bad.push({ file: `${state}/${name}`, code: where, phrase, here, owner });
        }
      }
    }
  }
}

console.log('');
console.log(`Read ${lines} evidence lines across ${profiles} profiles.`);
console.log('');

if (bad.length) {
  failed = 1;
  // Grouped, because 144 identical failures scroll the useful line off the screen and the
  // thing worth reading is which factor and which register, not which 144 firms.
  const groups = new Map();
  for (const b of bad) {
    const key = `${b.code} cites the ${b.owner} register on ${b.here} profiles`;
    groups.set(key, [...(groups.get(key) ?? []), b.file]);
  }
  for (const [key, files] of groups) {
    console.log(`  FAIL  ${key}  (${files.length})`);
    for (const f of files.slice(0, 3)) console.log(`          ${f}`);
    if (files.length > 3) console.log(`          and ${files.length - 3} more`);
  }
  console.log('');
  console.error(`${bad.length} evidence line(s) cite a register that does not cover the firm.`);
  process.exit(1);
}

console.log('  ok    every register named in evidence covers the firm it is named on');
console.log('');
console.log('No profile cites a source that cannot have produced its number.');
