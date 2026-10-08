/**
 * Renders the follow-up pitch for one enquiry, so it can be sent by hand.
 *
 * The Worker does this by itself for every enquiry that arrives through the form. This is for
 * the ones that arrived before it could: the first lead this site ever got came in a day before
 * the autoresponder existed, and answering it meant producing exactly the email the Worker
 * would have produced rather than writing a new one by hand.
 *
 *   node scripts/pitch_for.mjs enquiry.json
 *
 * The JSON is the enquiry, with the field names the form uses:
 *
 *   { "firm": "...", "contact": "...", "email": "...",
 *     "website": "...", "city": "...", "practice": "..." }
 *
 * It writes subject.txt, body.txt and body.html next to the JSON, and prints the recipient, the
 * subject and the greeting so all three can be read before anything is sent. The price and the
 * payment link are read out of wrangler.jsonc rather than restated here, because an email sent
 * by hand quoting a different price from the one the Worker sends is worse than no email.
 *
 * Sending is deliberately a separate command, so nothing goes to a stranger as a side effect of
 * rendering it. scripts/preview_email.mjs documents the send; it is the same one.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * JSONC to JSON. Strips // and /* comments that are not inside a string, which a naive replace
 * cannot do: "https://paypal.me/..." is not a comment and half the values in that file are URLs.
 */
function stripComments(text) {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === '\n') { inLine = false; out += c; }
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') { inBlock = false; i += 1; }
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') { out += next; i += 1; } else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && next === '/') { inLine = true; continue; }
    if (c === '/' && next === '*') { inBlock = true; i += 1; continue; }
    out += c;
  }
  return out;
}

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('usage: node scripts/pitch_for.mjs <enquiry.json>');
  process.exit(2);
}
const enquiry = JSON.parse(readFileSync(jsonPath, 'utf8'));
for (const required of ['firm', 'email']) {
  if (!enquiry[required]) {
    console.error(`the enquiry has no ${required}`);
    process.exit(2);
  }
}

const wrangler = JSON.parse(stripComments(readFileSync('wrangler.jsonc', 'utf8')));
const env = {
  SUBMISSIONS_FROM: wrangler.vars.SUBMISSIONS_FROM,
  REPLY_TO: wrangler.vars.REPLY_TO,
  LISTING_PRICE_USD: wrangler.vars.LISTING_PRICE_USD,
  PAYPAL_LINK: wrangler.vars.PAYPAL_LINK,
};

const dir = path.dirname(path.resolve(jsonPath));
const bundle = path.join(dir, '_pitch_bundle.mjs');
await build({
  stdin: {
    contents: `export { pitchBody } from './worker/outbound.ts';
               export { htmlFromText } from './worker/emailhtml.ts';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: bundle,
  external: ['cloudflare:email'],
  logLevel: 'warning',
});
const { pitchBody, htmlFromText } = await import(pathToFileURL(bundle).href);

const msg = pitchBody(enquiry, env);
const html = htmlFromText(msg.text, {
  footer: 'Law Firm Listings measures what US law firms publish about themselves and'
    + ' scores it against public records.',
});

writeFileSync(path.join(dir, 'subject.txt'), msg.subject, 'utf8');
writeFileSync(path.join(dir, 'body.txt'), msg.text, 'utf8');
writeFileSync(path.join(dir, 'body.html'), html, 'utf8');

console.log(`to:       ${enquiry.email}`);
console.log(`subject:  ${msg.subject}`);
console.log(`greeting: ${msg.text.split('\n')[0]}`);
console.log(`price:    ${env.LISTING_PRICE_USD} USD`);
console.log(`pay:      ${(msg.text.match(/https:\/\/\S*paypal\S*/) || ['none'])[0]}`);
console.log(`\nwritten to ${dir}`);
