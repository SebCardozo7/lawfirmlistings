#!/usr/bin/env node
/**
 * Everything a firm gets when it pays, in one command.
 *
 * Activating a paying firm used to be two unconnected jobs done by hand: issue a panel
 * credential with panel_account.mjs, and then open the profile JSON and add a subscription
 * block, which is the thing that turns its outbound link from nofollow to followed. Two steps in
 * two places, and forgetting the second one means a firm has paid 350 dollars and not received
 * the main thing it bought, with nothing anywhere saying so.
 *
 * So this does both or neither, and prints the credential at the end.
 *
 *   node scripts/activate_client.mjs --slug beninato-matrafajlo-law
 *   node scripts/activate_client.mjs --slug lopez-humphries-pa --paid 2026-10-16
 *   node scripts/activate_client.mjs --slug lopez-humphries-pa --dry-run
 *
 * --local writes the credential to the wrangler dev store instead of production, which is for
 * looking at the panel rather than for a real firm.
 *
 * What it deliberately does not do is take a payment or check that one arrived. PayPal is read
 * by a person, and this is the step after that: the date you pass is the date you saw the money.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function firmPath(slug) {
  const base = join(ROOT, 'src', 'data', 'firms');
  const walk = dir => readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
  });
  for (const p of walk(base)) {
    try {
      if (JSON.parse(readFileSync(p, 'utf8')).slug === slug) return p;
    } catch { /* a file that is not a profile is not this firm */ }
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
const paid = arg('paid') || new Date().toISOString().slice(0, 10);
const months = Number(arg('months') || 12);

if (!slug) {
  console.error('necesita --slug <el-slug-del-perfil>');
  process.exit(2);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(paid)) {
  console.error(`--paid tiene que ser una fecha YYYY-MM-DD, no "${paid}"`);
  process.exit(2);
}

const path = firmPath(slug);
if (!path) {
  console.error(`no hay una firma publicada con el slug "${slug}".`);
  console.error('es la ultima parte de la direccion del perfil, despues de /firms/.');
  process.exit(2);
}
const firm = JSON.parse(readFileSync(path, 'utf8'));

// The year runs from the day the money was seen, not from today, so a credential issued late
// does not quietly extend what was bought.
const until = new Date(`${paid}T00:00:00Z`);
until.setUTCMonth(until.getUTCMonth() + months);
const untilISO = until.toISOString().slice(0, 10);

const already = firm.subscription?.until;
if (already && already >= paid && !args.includes('--renew')) {
  console.error(`${firm.name} ya tiene una suscripcion vigente hasta ${already}.`);
  console.error('si es una renovacion, agrega --renew.');
  process.exit(2);
}

const EARNED = ['Verified', 'Certified', 'Distinguished', 'Elite'];
const earnsItAnyway = EARNED.includes(firm.score?.tier ?? '');

console.log('');
console.log(`  Firma        ${firm.name}`);
console.log(`  Perfil       /firms/${slug}/`);
console.log(`  Pago visto   ${paid}`);
console.log(`  Vigente a    ${untilISO}  (${months} meses)`);
console.log(`  Enlace       ${earnsItAnyway
  ? `ya seguido por tier ${firm.score.tier}; la suscripcion lo sostiene si el tier baja`
  : 'pasa de nofollow a seguido con esta suscripcion'}`);
console.log('');

if (dryRun) {
  console.log('  nada escrito (--dry-run).');
  process.exit(0);
}

// The subscription first. If the credential step fails, a firm with a followed link and no
// password is a phone call; a firm with a password and a nofollow link is a refund.
firm.subscription = { plan: 'annual-listing', since: paid, until: untilISO };
writeFileSync(path, `${JSON.stringify(firm, null, 2)}\n`, 'utf8');
console.log(`  suscripcion escrita en ${path.replace(ROOT, '')}`);

const account = [join(ROOT, 'scripts', 'panel_account.mjs'), '--slug', slug];
if (local) account.push('--local');
try {
  const out = execFileSync(process.execPath, account, { encoding: 'utf8' });
  process.stdout.write(out);
} catch (err) {
  console.error('');
  console.error('  LA CREDENCIAL NO SE EMITIO. La suscripcion si quedo escrita, asi que el');
  console.error('  enlace ya es seguido y la firma todavia no puede entrar al panel. Corre:');
  console.error(`      node scripts/panel_account.mjs --slug ${slug}${local ? ' --local' : ''}`);
  console.error(String(err.stderr || err.message).trim());
  process.exit(1);
}

console.log('');
console.log('  Falta: hacer commit del perfil para que el enlace seguido se publique.');
