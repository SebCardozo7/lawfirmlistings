#!/usr/bin/env node
/**
 * The lead desk, running on this machine, filled with firms that do not exist.
 *
 * Designing a letter by reading the template source is how the uppercase headings shipped. The
 * email is assembled from the plain text by worker/emailhtml.ts and it is the only document
 * the firm sees, so the way to judge it is to look at it, and the way to look at it is to open
 * the page that renders it.
 *
 * This is the whole desk: the real router, the real templates, the real renderer, the real
 * prospecting rules. Only the three things that reach outside are replaced. KV is a Map, the
 * build artefacts are the small invented ones below, and the mail binding records instead of
 * sending, so the send buttons work and nothing leaves the laptop. What is printed in the
 * terminal after a send is the exact message that would have gone out.
 *
 * Every firm, person, address and domain here is invented, which matters because this file is
 * in a public repository. Nothing is read from .crawl/ and nothing is read from the real
 * directory index.
 *
 *   node scripts/preview_desk.mjs
 *   node scripts/preview_desk.mjs --port 8790
 */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

const args = process.argv.slice(2);
const PORT = Number(args[args.indexOf('--port') + 1]) || 8788;
const TOKEN = 'preview'.padEnd(48, '0');

const dir = mkdtempSync(path.join(tmpdir(), 'lfl-preview-'));
const bundle = path.join(dir, 'desk.mjs');

const stubEmail = {
  name: 'stub-cloudflare-email',
  setup(b) {
    b.onResolve({ filter: /^cloudflare:email$/ },
      () => ({ path: 'cloudflare:email', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export class EmailMessage {'
        + ' constructor(from, to, raw) { this.from = from; this.to = to; this.raw = raw; } }',
      loader: 'js',
    }));
  },
};

await build({
  stdin: {
    contents: `export { handleLeads } from './worker/leadspage.ts';
               export { recordLead, newLeadId, setStatus, addNote, recordSend, setFollowUp }
                 from './worker/ledger.ts';
               export { putProspect } from './worker/prospects.ts';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'neutral',
  outfile: bundle, plugins: [stubEmail], logLevel: 'warning',
});

const {
  handleLeads, recordLead, newLeadId, setStatus, addNote, recordSend, setFollowUp, putProspect,
} = await import(pathToFileURL(bundle).href);

const store = new Map();
const KV = {
  put: async (k, v) => { store.set(k, v); },
  get: async k => (store.has(k) ? store.get(k) : null),
  delete: async k => { store.delete(k); },
  list: async ({ prefix, limit }) => ({
    keys: [...store.keys()].filter(k => k.startsWith(prefix)).sort()
      .slice(0, limit ?? 2000).map(name => ({ name })),
  }),
};
const panel = new Map([['access:leads', JSON.stringify({ token: TOKEN, created_at: 'today' })]]);
const PANEL = { ...KV, get: async k => panel.get(k) ?? null, put: async (k, v) => panel.set(k, v) };

/* ------------------------------------------------- the directory, invented end to end */

const NAMES = [
  ['Harborline Injury Attorneys', 'harborline.example', 'ca', 71, 'Certified', ['A', 10, 25], ['Distinguished', 7]],
  ['Quiet River Legal', 'quietriver.example', 'ny', 60, 'Verified', ['E', 0, 15], ['Certified', 5]],
  ['Tallgrass Trial Group', 'tallgrass.example', 'tx', 64, 'Certified', ['D', 8, 25], ['Distinguished', 14]],
  ['Cedar & Vale LLP', 'cedarvale.example', 'il', 52, 'Verified', ['B', 4, 20], ['Certified', 13]],
  ['Northgate Family Law', 'northgate.example', 'ny', 78, 'Distinguished', ['C', 14, 20], null],
  ['Sandpiper Defense', 'sandpiper.example', 'ca', 44, 'Listed', ['A', 5, 25], ['Verified', 6]],
  ['Mill Creek Advocates', 'millcreek.example', 'tx', 67, 'Certified', ['E', 6, 15], ['Distinguished', 11]],
  ['Fairmont Legal Partners', 'fairmont.example', 'ca', 59, 'Verified', ['D', 7, 25], ['Certified', 6]],
  ['Oakhill Compensation Law', 'oakhill.example', 'il', 73, 'Certified', ['B', 12, 20], ['Distinguished', 5]],
  ['Bramble & Shaw', 'brambleshaw.example', 'ny', 48, 'Listed', ['C', 6, 20], ['Verified', 2]],
];

const slugOf = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const INDEX = {
  generated_at: 'today',
  states: ['ca', 'ny', 'tx', 'il'],
  count: NAMES.length,
  firms: Object.fromEntries(NAMES.map(([n, domain, st, sc, t, w, g]) => [domain, {
    s: slugOf(n), n, st, sc, t, w, ...(g ? { g } : {}),
    o: ['A2', 'Experience', 5],
  }])),
};

const PATHS = [
  '/cities/los-angeles-ca/car-accidents/', '/cities/los-angeles-ca/personal-injury/',
  '/cities/new-york-ny/criminal-defense/', '/cities/new-york-ny/family-law/',
  '/cities/houston-tx/truck-accidents/', '/cities/chicago-il/medical-malpractice/',
  '/certified/california/', '/certified/new-york/', '/practice/personal-injury/',
  '/practice/criminal-defense/', '/rankings/most-improved/', '/',
];

// A different number of pages per firm, so the queue's most-listed-first order has something
// to sort and the chart of the spread has a shape.
const PAGES = {
  generated_at: 'today',
  paths: PATHS,
  firms: Object.fromEntries(NAMES.map(([n], i) =>
    [slugOf(n), PATHS.map((_, j) => j).filter(j => (j * 7 + i * 3) % 11 > i % 5).slice(0, 12 - i)])),
};

const ASSETS = {
  fetch: async req => {
    const u = new URL(typeof req === 'string' ? req : req.url);
    const body = u.pathname === '/api/firm-pages.json' ? PAGES : INDEX;
    return new Response(JSON.stringify(body), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  },
};

const outbox = [];
const env = {
  FOLLOWUPS: KV, PANEL, ASSETS,
  EMAIL: { send: async m => { outbox.push(m); return undefined; } },
  SUBMISSIONS_FROM: 'hello@lawfirmlistings.com',
  REPLY_TO: 'hello@lawfirmlistings.com',
  LISTING_PRICE_USD: '500',
  PAYPAL_LINK: 'https://paypal.me/lawfirmlistings',
  POSTAL_ADDRESS: '000 Example Street, Suite 0, Example City, EX 00000',
};

/* ------------------------------------------------------------------ the fixtures */

const DAY = 86400000;
const back = n => new Date(Date.now() - n * DAY);

const ENQUIRIES = [
  ['Pinebrook Law Group', 'Alex Moran', 'alex@pinebrook.example', 'https://pinebrook.example/',
    'East Brunswick, NJ', 'Personal injury', 'Ask to be considered for the directory', 3],
  ['Quiet River Legal', 'Quiet River Legal', 'intake@quietriver.example',
    'https://quietriver.example', 'New York, New York', 'Criminal defense',
    'Claim a profile we already publish', 9],
  ['Harborline Injury Attorneys', 'Dana Reyes', 'dana@harborline.example',
    'https://harborline.example/', 'Los Angeles, CA', 'Personal injury',
    'Ask to be considered for the directory', 19],
  ['Tallgrass Trial Group', 'Sam Okafor', 'sam@tallgrass.example', 'https://tallgrass.example/',
    'Houston, TX', 'Truck accidents', 'Run the profile we already publish', 26],
  ['Cedar & Vale LLP', 'Robin Hale', 'robin@cedarvale.example', 'https://cedarvale.example/',
    'Chicago, IL', 'Medical malpractice', 'Ask to be considered for the directory', 31],
  ['Oakhill Compensation Law', 'Jo Nakamura', 'jo@oakhill.example', 'https://oakhill.example/',
    'Chicago, IL', 'Workers compensation', 'Claim a profile we already publish', 44],
];

// Oldest first, because the key inverts the clock at the moment the row is written: writing
// them newest-first would list them newest-last, which is the one thing this list promises.
const ids = [];
for (const [firm, contact, email, website, city, practice, request, days]
  of [...ENQUIRIES].reverse()) {
  const id = newLeadId();
  ids.push(id);
  await recordLead(env, { firm, contact, email, website, city, practice, request },
    id, 'https://lawfirmlistings.com');
  // The arrival time is backdated so the ages, the monthly chart and the "waiting on a
  // person" flag have something to measure, and the key is rebuilt to match it. The key
  // carries the inverted clock and is what KV sorts by, so leaving it behind would list six
  // rows written in the same millisecond in the order of their random ids.
  const was = [...store.keys()].find(k => k.endsWith(`:${id}`));
  const row = JSON.parse(store.get(was));
  const at = back(days);
  row.arrived_at = at.toISOString();
  row.events[0].at = row.arrived_at;
  store.delete(was);
  store.set(`lead:${String(1e15 - at.getTime()).padStart(16, '0')}:${id}`, JSON.stringify(row));
}

await recordSend(env, ids[4], 'sent "Still interested?" (interested)', 'owner');
await addNote(env, ids[4], 'asked for a week to decide');
await setStatus(env, ids[4], 'quoted');
await setFollowUp(env, ids[4], new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10));

await recordSend(env, ids[2], 'sent "Your enquiry about listing your firm" (terms)', 'owner');
await setStatus(env, ids[2], 'won', { amount: 500, reason: 'paid on the link' });

await recordSend(env, ids[1], 'sent "Your enquiry about listing your firm" (terms)', 'owner');
await setStatus(env, ids[1], 'lost', { reason: 'went with a competitor' });

for (const [n, domain, st] of NAMES) {
  const slug = slugOf(n);
  await putProspect(env, {
    slug, name: n, domain, state: st,
    email: `contact@${domain}`,
    pages: (PAGES.firms[slug] ?? []).length,
    status: 'new',
    added_at: back(4).toISOString().slice(0, 10),
  });
}

/* -------------------------------------------------------------------- the server */

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/') {
    res.writeHead(302, { location: `/api/leads?t=${TOKEN}` });
    return res.end();
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(url.toString(), {
    method: req.method,
    headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
    ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
  });

  let out;
  try {
    out = await handleLeads(request, env, url);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'content-type': 'text/plain' });
    return res.end(String(err && err.stack ? err.stack : err));
  }

  // A redirect here points at the Worker's own origin; rewrite it to this one so following it
  // in a browser stays on the preview.
  const headers = {};
  out.headers.forEach((v, k) => { headers[k] = v; });
  if (headers.location) {
    headers.location = headers.location.replace('https://lawfirmlistings.com', '');
  }
  res.writeHead(out.status, headers);
  res.end(Buffer.from(await out.arrayBuffer()));

  if (outbox.length) {
    for (const m of outbox.splice(0)) {
      console.log(`\n  --- a message that would have been sent to ${m.to} ---\n`);
      console.log(String(m.raw).split('\n').slice(0, 14).map(l => `    ${l}`).join('\n'));
      console.log('    ...\n');
    }
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log(`  The desk is at  http://localhost:${PORT}/api/leads?t=${TOKEN}`);
  console.log('');
  console.log('  Six invented enquiries, ten invented firms to prospect, a mailbox that');
  console.log('  prints instead of sending. Nothing here reaches anybody.');
  console.log('');
});
