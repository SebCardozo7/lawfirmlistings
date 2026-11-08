#!/usr/bin/env node
/**
 * Mints the link to the lead ledger, and prints it once.
 *
 * /api/leads lists every enquiry the directory has received: firm names, the addresses they
 * wrote from, and what became of each. One person should be able to open it and nobody else,
 * and there is no owner account anywhere in this Worker to hang that on. So the page is behind
 * a random token held in KV, and this writes it.
 *
 * A token rather than something signed, for the reason panel_account.mjs issues credentials the
 * way it does: PANEL_SECRET is a Worker secret and cannot be read back, so nothing on a laptop
 * can sign with it, while anything can write a KV key through wrangler. The upside is that
 * revoking is immediate and is a delete rather than waiting out an expiry.
 *
 * Running it again replaces the token, which revokes the previous link. That is the intended
 * way to rotate and the reason the old link stops working is worth knowing before you run it
 * twice and wonder.
 *
 *   node scripts/leads_link.mjs                 mint, write to KV, print the URL
 *   node scripts/leads_link.mjs --show          print the URL for the token already in KV
 *   node scripts/leads_link.mjs --revoke        delete it; the link stops working at once
 *   node scripts/leads_link.mjs --local         the wrangler dev store rather than the real one
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { webcrypto as crypto } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SITE = 'https://lawfirmlistings.com';
const KEY = 'access:leads';

const args = process.argv.slice(2);
const flag = n => args.includes(`--${n}`);
const local = flag('local');

function wrangler(rest) {
  const bin = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!existsSync(bin)) throw new Error('wrangler not found in node_modules');
  return execFileSync(process.execPath,
    [bin, 'kv', ...rest, '--binding', 'PANEL', local ? '--local' : '--remote'],
    { cwd: ROOT, encoding: 'utf8' });
}

function read() {
  try {
    const out = wrangler(['key', 'get', KEY]);
    const start = out.indexOf('{');
    return start < 0 ? null : JSON.parse(out.slice(start));
  } catch {
    return null;
  }
}

if (flag('revoke')) {
  wrangler(['key', 'delete', KEY, '--force']);
  console.log('\n  revocado. El link anterior ya no abre nada.\n');
  process.exit(0);
}

if (flag('show')) {
  const rec = read();
  if (!rec?.token) {
    console.error('no hay token emitido. Corre el script sin --show para emitir uno.');
    process.exit(2);
  }
  console.log(`\n  Emitido   ${rec.created_at}`);
  console.log(`  Link      ${SITE}/api/leads?t=${rec.token}\n`);
  process.exit(0);
}

const previous = read();
const token = [...crypto.getRandomValues(new Uint8Array(24))]
  .map(b => b.toString(16).padStart(2, '0')).join('');
const record = { token, created_at: new Date().toISOString().slice(0, 10) };

// Written through a file rather than as an inline value: a 48 character token on a command line
// lands in the shell history of whoever runs this.
const tmp = join(ROOT, '.crawl', 'leads-access.json');
mkdirSync(dirname(tmp), { recursive: true });
writeFileSync(tmp, JSON.stringify(record), 'utf8');
try {
  wrangler(['key', 'put', KEY, '--path', tmp]);
} finally {
  rmSync(tmp, { force: true });
}

console.log('');
if (previous?.token) {
  console.log(`  El link emitido el ${previous.created_at} queda revocado.`);
}
console.log('  Guardalo donde guardes las credenciales. Se muestra una sola vez:');
console.log('');
console.log(`    ${SITE}/api/leads?t=${token}`);
console.log('');
console.log('  Si se pierde, corre el script de nuevo y emite otro.');
console.log('');
