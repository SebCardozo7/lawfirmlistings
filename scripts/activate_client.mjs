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
 *
 * It does check one thing, and refuses without it: who the firm says you are talking to.
 *
 *   node scripts/activate_client.mjs --slug glk-law --confirmed-by partner@lawyertime.com
 *
 * The address has to sit on the firm's own domain, which is the rule the listing form already
 * states: "a claim is only granted to an address at the firm's own domain". It is not
 * bureaucracy. On 23 October an enquiry arrived for Gersowitz Libo & Korek, a real firm in
 * Manhattan, naming the firm itself as the contact, from a Gmail address, from a residential
 * connection in Chandigarh. The quote that went back carries a payment link, and what it buys
 * is control of a published page about somebody else's law firm. Money establishes that
 * somebody paid. It establishes nothing about who they are.
 *
 * Where identity was established some other way, --identity says how, in a sentence, and that
 * sentence is written to the activation ledger instead of the address. The ledger is
 * .panel-activations.json, kept out of git with the rest of the real addresses.
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

/*
 * Who the firm says you are talking to, before anybody is handed the keys to its page.
 *
 * The test is the one the form already promises: an address on the firm's own domain. A second
 * domain the firm publishes on its own site counts, because plenty of firms run two, and that
 * is why the comparison is against every domain this profile carries rather than one.
 */
const firmDomains = [...new Set([firm.domain, firm.digital?.domain, (() => {
  try { return new URL(firm.website).hostname; } catch { return null; }
})()].filter(Boolean).map(d => d.toLowerCase().replace(/^www\./, '')))];

const confirmedBy = (arg('confirmed-by') || '').trim().toLowerCase();
const identity = (arg('identity') || '').trim();

if (!confirmedBy && !identity) {
  console.error('necesita --confirmed-by <direccion en el dominio de la firma>.');
  console.error(`para ${firm.name} eso es una direccion en ${firmDomains.join(' o ') || 'su dominio'}.`);
  console.error('si la identidad se establecio de otra forma, --identity "como fue" lo deja asentado.');
  process.exit(2);
}
if (confirmedBy) {
  const host = confirmedBy.split('@')[1] || '';
  const onFirmDomain = firmDomains.some(d => host === d || host.endsWith(`.${d}`) || d.endsWith(`.${host}`));
  if (!onFirmDomain && !identity) {
    console.error(`${confirmedBy} no esta en el dominio de ${firm.name}.`);
    console.error(`el perfil publica ${firmDomains.join(', ')}.`);
    console.error('pedile que escriba desde ahi, o explica con --identity "como fue" si ya lo verificaste de otra forma.');
    process.exit(2);
  }
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
console.log(`  Identidad    ${confirmedBy || '(sin direccion)'}${identity ? ` · ${identity}` : ''}`);
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

/*
 * The ledger. Who was handed this page, on whose say-so, and when.
 *
 * It lives beside the outreach files and out of git for the same reason they do: this
 * repository is public and the address belongs to a person at a law firm. The profile JSON
 * gets none of it, so nothing here is ever published.
 */
const LEDGER = join(ROOT, '.panel-activations.json');
let ledger = {};
try { ledger = JSON.parse(readFileSync(LEDGER, 'utf8')); } catch { /* first one */ }
ledger[slug] = {
  at: new Date().toISOString().slice(0, 10),
  paid,
  until: untilISO,
  confirmed_by: confirmedBy || null,
  identity: identity || null,
};
writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');

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
