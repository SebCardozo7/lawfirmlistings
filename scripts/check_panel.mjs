#!/usr/bin/env node
/**
 * The panel's password hashing has to use a number the runtime will actually accept.
 *
 * This exists because the panel could not let anybody in, from the day it was written until the
 * day the first account was issued, and nothing anywhere said so. Both the hasher and the Worker
 * used 210,000 PBKDF2 iterations, which is OWASP's floor for SHA-256 and the right number to
 * want, and the Workers runtime refuses it:
 *
 *     NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported
 *     (requested 210000).
 *
 * So every POST to /claim/login threw. Not 401, a 500, and for an unknown firm as readily as for
 * a real one, because the decoy hash the handler compares against to avoid user enumeration
 * carried the same count. A build cannot catch this: the code is valid, Node hashes at 210,000
 * perfectly well, and only the deployed runtime refuses. It took reading `wrangler tail` while
 * a real login failed.
 *
 * Three numbers now have to agree, and here is where they are checked against each other and
 * against the ceiling:
 *
 *   worker/auth.ts            ITERATIONS, what the Worker verifies with
 *   scripts/panel_account.mjs ITERATIONS, what a new credential is hashed with
 *   worker/panel.ts           the decoy hash for a firm that has no account
 *
 * A mismatch between the first two locks every existing firm out. Either of them above the
 * ceiling breaks every login at once.
 *
 *   node scripts/check_panel.mjs
 */
import { readFileSync } from 'node:fs';

const read = p => readFileSync(p, 'utf8');
const fail = [];
const ok = [];

const num = (s) => Number(String(s).replace(/_/g, ''));

const auth = read('worker/auth.ts');
const CEILING = num(auth.match(/export const MAX_ITERATIONS\s*=\s*([\d_]+)/)?.[1] ?? NaN);
const workerIters = num(auth.match(/export const ITERATIONS\s*=\s*([\d_]+)/)?.[1] ?? NaN);
const scriptIters = num(
  read('scripts/panel_account.mjs').match(/const ITERATIONS\s*=\s*([\d_]+)/)?.[1] ?? NaN);
const decoy = read('worker/panel.ts').match(/'pbkdf2\$(\d+)\$/)?.[1];
const decoyIters = num(decoy ?? NaN);

const check = (name, pass, detail) => (pass ? ok : fail).push(`${name}${detail ? `  ${detail}` : ''}`);

check('the runtime ceiling is stated', Number.isFinite(CEILING), `MAX_ITERATIONS=${CEILING}`);
check('the ceiling is the one Workers enforces', CEILING === 100_000,
      `is ${CEILING}, Workers refuses anything above 100000`);
check('the Worker verifies below the ceiling', workerIters <= CEILING,
      `worker/auth.ts uses ${workerIters}`);
check('new credentials are hashed below the ceiling', scriptIters <= CEILING,
      `scripts/panel_account.mjs uses ${scriptIters}`);
check('both sides agree', workerIters === scriptIters,
      `worker ${workerIters} vs script ${scriptIters}: every existing firm would be locked out`);
check('the decoy hash was found', Number.isFinite(decoyIters), 'worker/panel.ts');
check('the decoy hash is below the ceiling too', decoyIters <= CEILING,
      `decoy uses ${decoyIters}: an unknown firm would throw a 500 where a known one returns 401`);

for (const line of ok) console.log(`  ok    ${line}`);
if (fail.length) {
  console.error('');
  for (const line of fail) console.error(`  FAIL  ${line}`);
  console.error('\nNothing in a build can catch this. Node hashes at any count and only the');
  console.error('deployed runtime refuses, so the panel fails in production and nowhere else.');
  process.exit(1);
}
console.log(`\nThe panel hashes at ${workerIters} on both sides, under the ${CEILING} the runtime allows.`);
