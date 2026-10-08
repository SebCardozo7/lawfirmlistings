/**
 * Renders the Worker's outbound emails to files, so a commercial email to a stranger can be read
 * before it is sent rather than after.
 *
 * It builds the real modules with esbuild and calls the real mime(), so what lands on disk is the
 * message the Worker would hand to Cloudflare: the .eml is byte-for-byte that, and the .txt and
 * .html are its two parts pulled back out, the HTML decoded from base64. Nothing is mocked except
 * the enquiry and the environment.
 *
 *   node scripts/preview_email.mjs            writes to .mail-preview/
 *   node scripts/preview_email.mjs out/dir    writes somewhere else
 *
 * Open the .html files in a browser. That is not the same as a client's renderer, but it catches
 * the things worth catching: a block that lost its paragraph break, a list that did not become a
 * list, a link that did not become a link.
 *
 * To put one in a real inbox, the .body.txt and .subject.txt files beside it exist so the send
 * can be assembled from files rather than from a shell argument the quoting would mangle:
 *
 *   node <npx-cache>/node_modules/wrangler/bin/wrangler.js email sending send \
 *     --from hello@lawfirmlistings.com --from-name "Law Firm Listings" \
 *     --reply-to hello@lawfirmlistings.com --to you@example.com \
 *     --subject "$(cat .mail-preview/pitch.subject.txt)" \
 *     --text "$(cat .mail-preview/pitch.body.txt)" \
 *     --html "$(cat .mail-preview/pitch.html)"
 *
 * Call node on wrangler.js directly rather than through npx. npx is a .cmd, so the command goes
 * through cmd.exe and its limit is 8191 characters: a 9KB HTML body dies there with "the command
 * line is too long", where CreateProcess allows 32767 and it goes through.
 *
 * That send is the CLI assembling its own MIME around our HTML, which is close enough to check a
 * render in a real client but is not the Worker's own message. The Worker's is the .eml.
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const out = path.resolve(process.argv[2] || '.mail-preview');
mkdirSync(out, { recursive: true });

const bundle = path.join(out, '_bundle.mjs');
await build({
  stdin: {
    contents: `export { ackBody, pitchBody } from './worker/outbound.ts';
               export { mime } from './worker/mail.ts';`,
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

const { ackBody, pitchBody, mime } = await import(pathToFileURL(bundle).href);

// One enquiry, filled in the way the form fills it, with the accented name that proves the
// encoding and a long firm name that proves the header folding.
const enquiry = {
  firm: 'Arash Law',
  contact: 'Arash Khorsandi',
  email: 'firm@example.com',
  website: 'https://arashlaw.com',
  city: 'Los Angeles, CA',
  practice: 'Personal injury',
};
const env = {
  SUBMISSIONS_FROM: 'hello@lawfirmlistings.com',
  REPLY_TO: 'hello@lawfirmlistings.com',
  LISTING_PRICE_USD: '350',
  PAYPAL_LINK: 'https://www.paypal.com/paypalme/sebastiancardozo',
};

/** Pulls a part back out of the finished message, which is the only honest way to check it. */
function parts(raw) {
  const m = /boundary="([^"]+)"/.exec(raw);
  if (!m) return { text: raw.split('\r\n\r\n').slice(1).join('\r\n\r\n'), html: '' };
  const chunks = raw.split(`--${m[1]}`).slice(1, -1);
  const result = { text: '', html: '' };
  for (const chunk of chunks) {
    const [head, ...rest] = chunk.split('\r\n\r\n');
    const body = rest.join('\r\n\r\n').replace(/\r\n$/, '');
    if (head.includes('text/html')) {
      result.html = Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8');
    } else if (head.includes('text/plain')) {
      result.text = body;
    }
  }
  return result;
}

// The panel's own notification, in the shape store() in worker/panel.ts assembles: the thing
// Sebastián reads every time a firm sends something, and the one email in the set with a button
// that has to work. The copy lives in panel.ts; this is here to render that shape.
const notification = {
  subject: 'Arash Law: a client review',
  text: [
    'Arash Law sent a client review.', '',
    '  Author:   Maria R.',
    '  Rating:   5',
    '  Quote:    They took the case nobody else would look at.', '',
    'Approve:', 'https://lawfirmlistings.com/claim/approve?t=eyJrZXkiOiJwZW5kaW5nOmFyYXNoLWxhdyI.sig',
    '',
    'Profile: https://lawfirmlistings.com/firms/arash-law/',
    'Submitted 2026-10-08T14:02:11.000Z',
  ].join('\n'),
};

// The same acknowledgement for a firm whose name is not ASCII, which this directory has plenty
// of. It is here for one line of the output: the Subject header has to come out RFC 2047 encoded
// rather than as raw UTF-8 bytes.
const accented = {
  ...enquiry,
  firm: 'López & Humphries, P.A.',
  contact: 'Sebastián Cardozo',
  website: 'https://lopezhumphries.com',
  city: 'Lakeland, FL',
};

const messages = [
  ['ack', ackBody(enquiry)],
  ['pitch', pitchBody(enquiry, env)],
  ['notification', notification],
  ['ack-accented', ackBody(accented)],
];

for (const [name, msg] of messages) {
  const raw = mime(env.SUBMISSIONS_FROM, enquiry.email, msg.subject, msg.text, {
    replyTo: env.REPLY_TO,
    footer: 'Law Firm Listings measures what US law firms publish about themselves and'
      + ' scores it against public records.',
  });
  const { text, html } = parts(raw);
  writeFileSync(path.join(out, `${name}.eml`), raw, 'utf8');
  writeFileSync(path.join(out, `${name}.txt`), `Subject: ${msg.subject}\n\n${text}\n`, 'utf8');
  writeFileSync(path.join(out, `${name}.html`), html, 'utf8');
  // The body and the subject on their own, so a real test send can be assembled from files
  // instead of from a shell argument the quoting would mangle.
  writeFileSync(path.join(out, `${name}.body.txt`), msg.text, 'utf8');
  writeFileSync(path.join(out, `${name}.subject.txt`), msg.subject, 'utf8');

  const blocks = msg.text.split(/\n\s*\n/).length;
  const longest = Math.max(...raw.split('\r\n').map((l) => l.length));
  console.log(`${name.padEnd(6)} ${msg.text.split('\n').length} lines, ${blocks} blocks, `
    + `${html.length} bytes of html, longest message line ${longest}`);
  if (blocks < 2) console.log('       ^ one block: every paragraph break was lost');
  if (longest > 998) console.log('       ^ over the 998-character SMTP line limit');
}

console.log(`\nwritten to ${out}`);
