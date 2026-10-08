#!/usr/bin/env node
/**
 * Issue a firm panel credential, by hand, one firm at a time.
 *
 * There is no signup. A directory of real businesses cannot let whoever arrives first claim a law
 * firm's profile, and the first version of this serves a handful of firms, so the account is
 * created here and the credential is read down a phone or pasted into an email.
 *
 * The hash format is the one worker/auth.ts verifies, character for character:
 *
 *     pbkdf2$<iterations>$<salt b64url>$<hash b64url>
 *
 * The password is printed once and never stored anywhere in readable form. If it is lost, issue
 * another: that is cheaper than a reset flow, which would be a second door into an account that
 * can edit what a public directory says about a law firm.
 *
 * Usage:
 *   node scripts/panel_account.mjs --slug lopez-humphries-pa
 *   node scripts/panel_account.mjs --slug lopez-humphries-pa --dry-run
 *   node scripts/panel_account.mjs --slug lopez-humphries-pa --local   # the wrangler dev store
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { webcrypto as crypto } from 'node:crypto';

const ITERATIONS = 210_000;
const READABLE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const b64url = bytes => Buffer.from(bytes).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2',
                                            false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(new Uint8Array(bits))}`;
}

/** No l, I, 1, O or 0: this is read aloud and typed once, and a lookalike pair costs a message. */
function newPassword(groups = 4, size = 5) {
  const bytes = crypto.getRandomValues(new Uint8Array(groups * size));
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    if (i && i % size === 0) out += '-';
    out += READABLE[bytes[i] % READABLE.length];
  }
  return out;
}

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function findFirm(slug) {
  const base = join(ROOT, 'src', 'data', 'firms');
  const walk = dir => readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
  });
  for (const p of walk(base)) {
    const d = JSON.parse(readFileSync(p, 'utf8'));
    if (d.slug === slug) return d;
  }
  return null;
}

const args = process.argv.slice(2);
const arg = name => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const slug = arg('slug');
const dryRun = args.includes('--dry-run');
const local = args.includes('--local');

if (!slug) {
  console.error('necesita --slug <el-slug-del-perfil>');
  process.exit(2);
}

const firm = findFirm(slug);
if (!firm) {
  console.error(`no hay una firma publicada con el slug "${slug}".`);
  console.error('es la ultima parte de la direccion del perfil, despues de /firms/.');
  process.exit(1);
}
if (firm.status === 'sample' || firm.status === 'not_eligible') {
  console.error(`"${slug}" no esta publicada (status ${firm.status}), asi que no tiene panel.`);
  process.exit(1);
}

const password = newPassword();
const hash = await hashPassword(password);
const record = JSON.stringify({
  slug: firm.slug, name: firm.name, domain: firm.domain, hash,
  created_at: new Date().toISOString().slice(0, 10),
});

console.log(`  firma     ${firm.name}`);
console.log(`  mercado   ${firm.market.city}, ${firm.market.state}`);
console.log(`  tier      ${firm.score?.tier ?? 'sin puntaje'}  (enlace `
  + `${['Verified', 'Certified', 'Distinguished', 'Elite'].includes(firm.score?.tier ?? '')
      ? 'follow, ya ganado' : 'nofollow, se gana al llegar a Verified'})`);
console.log('');
console.log('  Credencial, se muestra una sola vez:');
console.log(`    Firm ID   ${firm.slug}`);
console.log(`    Password  ${password}`);
console.log('');

if (dryRun) {
  console.log('  --dry-run: no se escribio nada en KV.');
  process.exit(0);
}

// Through a file rather than an argument. On Windows the shell strips the quotes out of a JSON
// argument, and the first run of this wrote {slug:lopez-humphries-pa,...} into KV: not JSON, so
// every login against it would have failed with nothing on screen to say why.
const tmp = join(ROOT, '.crawl', `panel-account-${firm.slug}.json`);
mkdirSync(dirname(tmp), { recursive: true });
writeFileSync(tmp, record, 'utf8');
const cmd = ['wrangler', 'kv', 'key', 'put', `account:${firm.slug}`, '--path', tmp,
             '--binding', 'PANEL', ...(local ? ['--local'] : ['--remote'])];
try {
  execFileSync('npx', cmd, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  console.log(`\n  guardada en KV${local ? ' (store local de wrangler dev)' : ''}.`);
} finally {
  rmSync(tmp, { force: true });
}
