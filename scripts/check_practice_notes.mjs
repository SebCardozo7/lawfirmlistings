#!/usr/bin/env node
/**
 * Every practice area carries every field the template reads.
 *
 * PracticeNotes declares eleven required fields and TypeScript is not run at build time, so an
 * entry missing one compiles and then throws while rendering, with a message that names a method
 * rather than a field: "Cannot read properties of undefined (reading 'slice')".
 *
 * Opening immigration cost three failed builds to find three missing fields, one at a time, each
 * discovered only by reading a stack trace. Four practice areas are still unopened and each of
 * them would repeat it.
 *
 * The alternative was `astro check`, which wants @astrojs/check and typescript installed. That is
 * two dependencies to catch one class of mistake in one file, in a repository whose Python side
 * runs on the standard library. This is the same check without them.
 *
 * Optional by design: feePattern defaults to contingency, which is what the injury practices want,
 * and callout is a flourish. Everything else is read unguarded by the template and must be there.
 *
 * Usage:
 *   node scripts/check_practice_notes.mjs
 */
import { readFileSync } from 'node:fs';

const SOURCE = new URL('../src/data/practices.ts', import.meta.url);
const src = readFileSync(SOURCE, 'utf8');

// Read the interface rather than a list typed here, so a field added to PracticeNotes is checked
// from the moment it is added and nobody has to remember this file exists.
const iface = src.slice(src.indexOf('export interface PracticeNotes'),
                        src.indexOf('export const SHARED_FAQ'));
const REQUIRED = [...iface.matchAll(/^  ([a-zA-Z]+)(\??):/gm)]
  .filter(m => m[2] !== '?')
  .map(m => m[1]);

// Each practice's own block, from its key to the start of the next one at the same depth.
const body = src.slice(src.indexOf('export const PRACTICES'));
const heads = [...body.matchAll(/\n {2}(?:'([a-z-]+)'|([a-zA-Z-]+)): \{/g)];

const problems = [];
heads.forEach((head, i) => {
  const name = head[1] ?? head[2];
  const from = head.index + head[0].length;
  const to = i + 1 < heads.length ? heads[i + 1].index : body.length;
  const block = body.slice(from, to);
  // Fields of this practice, which sit at four spaces. Anything deeper belongs to guide or faq.
  const present = new Set([...block.matchAll(/^ {4}([a-zA-Z]+):/gm)].map(m => m[1]));
  for (const field of REQUIRED) {
    if (!present.has(field)) {
      problems.push(`${name}: no ${field}. The practice page reads it unguarded and will throw `
        + `while rendering, naming a method rather than this field.`);
    }
  }
});

for (const p of problems) console.log(p);
console.log(`\n${heads.length} practice area(s) checked against ${REQUIRED.length} required `
  + `field(s) · ${problems.length} problem(s)`);
if (!problems.length) console.log('Every practice area carries every field its page reads.');
process.exit(problems.length ? 1 : 0);
