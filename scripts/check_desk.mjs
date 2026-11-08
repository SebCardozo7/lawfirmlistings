#!/usr/bin/env node
/**
 * The desk shows the letter it is about to send, and cannot send one it was not shown.
 *
 * It exists because of what the desk used to be. Every outbound message goes out as
 * multipart/alternative, and the part almost every client displays is the HTML one, built from
 * the plain text by worker/emailhtml.ts. The desk showed the plain text and nothing else, so
 * the only document nobody read was the one the firm received. That is how a renderer that
 * turns any line ending in a colon into an uppercase heading shipped three section titles in
 * capitals to law firms, and it was found by rendering the thing by hand in a mock-up rather
 * than by the page whose job it was.
 *
 * So the check that matters most here is the dullest to read: the preview in the page is
 * htmlFromText() of the exact string in the textarea, and the restrained toggle beside it
 * changes what gets sent rather than only what gets shown. A preview that is a sketch of the
 * email is worse than no preview, because it is trusted.
 *
 * Every firm, address, domain and slug below is invented. The repository is public and the
 * real rows carry real firms' names and the addresses their own sites publish, so the
 * fixtures are shaped like the cases that prompted them and are nobody.
 *
 * What is checked, and why each one would be silent if it broke:
 *
 *   the routes          five views, each on its own URL, all shut without the token
 *   old links           /api/leads?id= still reaches the lead it always reached
 *   the sidebar         every page can get to every other, so no view is orphaned
 *   THE PREVIEW IS REAL the iframe holds the rendered email, not a picture of one
 *   it follows the text an edit in the box is an edit in the preview
 *   A PREVIEW SENDS NOTHING  the one POST that answers with a page must not reach a firm
 *   SOBER IS THE DEFAULT     first contact never goes out dressed as an advertisement
 *   the toggle is real  branded in the preview means branded in the message
 *   charts refuse       below the minimum a chart prints the count instead of drawing one
 *   charts are readable every bar carries its own number as text, not only as length
 *   most-listed first   the queue opens with the firms that have most riding on our pages
 *   THE CAP HOLDS       the day's limit is re-checked at the send and not only at the draw
 *   NO SECOND LETTER    a firm already written to cannot be written to again from the page
 *   AN OPT-OUT WINS     recorded by address, and checked at the moment of sending
 *   no postal address   CAN-SPAM's requirement blocks the send and the page says why
 *   a reply is a lead   answering moves the firm to the ledger, with both rows linked
 *
 *   node scripts/check_desk.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

let failed = 0;
const ok = (name, pass, detail) => {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}`
    + `${pass || detail === undefined ? '' : `  (${detail})`}`);
  if (!pass) failed += 1;
};
const head = name => console.log(`\n${name}`);

const dir = mkdtempSync(path.join(tmpdir(), 'lfl-desk-'));

/** cloudflare:email, stubbed rather than external, so the real sendTo runs. */
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

const bundle = path.join(dir, 'bundle.mjs');
await build({
  stdin: {
    contents: `export { handleLeads } from './worker/leadspage.ts';
               export { CAP } from './worker/prospectpage.ts';
               export { recordLead, newLeadId, getLead, listLeads } from './worker/ledger.ts';
               export { putProspect, getProspect, listProspects, isOptedOut }
                 from './worker/prospects.ts';
               export { resetIndex } from './worker/dossier.ts';
               export { resetPages } from './worker/pages.ts';
               export { htmlFromText } from './worker/emailhtml.ts';
               export { columns, rows, stacked } from './worker/charts.ts';
               export { BUILD_HOUR, SEND_FROM, SEND_TO, PER_RUN, capFor, proposeBatch,
                        drainBatch, getBatch, approveBatch, buildBatch, tomorrow, dayOf }
                 from './worker/batch.ts';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'neutral',
  outfile: bundle, plugins: [stubEmail], logLevel: 'warning',
});

const {
  handleLeads, CAP, recordLead, newLeadId, getLead, putProspect, getProspect, listProspects,
  isOptedOut, resetIndex, resetPages, htmlFromText, columns, rows, stacked,
  BUILD_HOUR, SEND_FROM, SEND_TO, PER_RUN, capFor, proposeBatch, drainBatch, getBatch,
  approveBatch, buildBatch, tomorrow, dayOf,
} = await import(pathToFileURL(bundle).href);

function kv() {
  const store = new Map();
  return {
    store,
    ns: {
      put: async (k, v) => { store.set(k, v); },
      get: async k => (store.has(k) ? store.get(k) : null),
      delete: async k => { store.delete(k); },
      // Pages, and refuses an oversized limit, because that is what the real one does. A stub
      // that quietly returns everything is a stub that passes the guard and ships the outage.
      list: async ({ prefix, limit, cursor }) => {
        if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit >= 1000)) {
          throw new Error(`KV GET failed: 400 Invalid key_count_limit of ${limit}.`
            + ' Please specify integer less than 1000.');
        }
        const all = [...store.keys()].filter(k => k.startsWith(prefix)).sort();
        const from = cursor ? Number(cursor) : 0;
        const page = all.slice(from, from + (limit ?? 999));
        const done = from + page.length >= all.length;
        return {
          keys: page.map(name => ({ name })),
          list_complete: done,
          ...(done ? {} : { cursor: String(from + page.length) }),
        };
      },
    },
  };
}

/** Three invented firms in three published states, as the build writes the index. */
const INDEX = {
  generated_at: '2026-11-08',
  states: ['ca', 'ny', 'tx'],
  count: 3,
  firms: {
    'harborline.example': {
      s: 'harborline-law', n: 'Harborline Law', st: 'ca', sc: 71, t: 'Certified',
      w: ['A', 10, 25], g: ['Distinguished', 7], o: ['A2', 'Experience', 5],
    },
    'quietriver.example': {
      s: 'quiet-river-legal', n: 'Quiet River Legal', st: 'ny', sc: 60, t: 'Verified',
      w: ['E', 0, 15], g: ['Certified', 5], o: ['E1', 'Free consult', 6],
    },
    'tallgrass.example': {
      s: 'tallgrass-trial', n: 'Tallgrass Trial Group', st: 'tx', sc: 64, t: 'Certified',
      w: ['D', 8, 25], o: ['D2', 'Search authority', 4],
    },
  },
};

// Ten more, generated, for the batch checks: a batch needs more than a cap's worth of firms
// and each of them needs a profile and a page, or the letter has nothing to ask about and is
// refused before it is sent. All on .example, which cannot resolve.
for (let i = 0; i < 10; i += 1) {
  INDEX.firms[`firm${i}.example`] = {
    s: `firm-${i}`, n: `Firm ${i}`, st: 'ca', sc: 50 + i, t: 'Verified',
    w: ['A', 5, 25], g: ['Certified', 4], o: ['A2', 'Experience', 5], l: 'png',
  };
}
INDEX.count = Object.keys(INDEX.firms).length;

/** Which of our pages carry each of them, as the firmPages() build integration writes it. */
const PAGES = {
  generated_at: '2026-11-08',
  paths: [
    '/cities/los-angeles-ca/car-accidents/', '/cities/los-angeles-ca/personal-injury/',
    '/cities/new-york-ny/criminal-defense/', '/cities/houston-tx/truck-accidents/',
    '/certified/california/', '/practice/personal-injury/',
  ],
  firms: {
    'harborline-law': [0, 1, 4, 5],
    'quiet-river-legal': [2],
    'tallgrass-trial': [3, 5],
    ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`firm-${i}`, [0, 1, 5]])),
  },
};

/** ASSETS, which serves two different files and must not confuse them. */
const assets = () => ({
  fetch: async req => {
    const u = new URL(typeof req === 'string' ? req : req.url);
    const body = u.pathname === '/api/firm-pages.json' ? PAGES : INDEX;
    return new Response(JSON.stringify(body), { status: 200 });
  },
});

function mailbox() {
  const sent = [];
  return { sent, EMAIL: { send: async m => { sent.push(m); return undefined; } } };
}

const TOKEN = 'a'.repeat(48);
const POSTAL = '000 Example Street, Suite 0, Example City, EX 00000';
/** Stands in for the SUBMISSIONS_TO secret: where the batch notice goes. */
const OWNER = 'desk@example.com';

const ENQ = {
  firm: 'A Firm, P.C.', contact: 'A Person', email: 'person@example.com',
  website: 'https://harborline.example/', city: 'Los Angeles, CA',
  request: 'Ask to be considered for the directory',
};

const PROSPECT = {
  slug: 'harborline-law', name: 'Harborline Law', domain: 'harborline.example',
  state: 'ca', email: 'contact@harborline.example', pages: 4, status: 'new',
  added_at: '2026-11-01',
};

/** A whole desk: both namespaces, the two build files, a mailbox, and a token. */
async function desk({ leads = [ENQ], prospects = [], postal = POSTAL } = {}) {
  resetIndex();
  resetPages();
  const followups = kv();
  const panel = kv();
  const box = mailbox();
  const env = {
    FOLLOWUPS: followups.ns, PANEL: panel.ns, ASSETS: assets(), EMAIL: box.EMAIL,
    SUBMISSIONS_FROM: 'hello@lawfirmlistings.com', SUBMISSIONS_TO: OWNER,
    LISTING_PRICE_USD: '500',
    PAYPAL_LINK: 'https://paypal.me/lawfirmlistings',
    ...(postal ? { POSTAL_ADDRESS: postal } : {}),
  };
  await panel.ns.put('access:leads',
    JSON.stringify({ token: TOKEN, created_at: '2026-11-08' }));

  const ids = [];
  for (const l of leads) {
    const id = newLeadId();
    await recordLead(env, l, id, 'https://lawfirmlistings.com');
    ids.push(id);
    await new Promise(r => setTimeout(r, 2));
  }
  for (const p of prospects) await putProspect(env, p);

  const at = q => new URL(`https://lawfirmlistings.com/api/leads${q}`);
  return {
    env, ids, box, store: followups.store,
    get: q => handleLeads(new Request(at(q)), env, at(q)),
    text: async q => (await handleLeads(new Request(at(q)), env, at(q))).text(),
    post: (where, fields, token = TOKEN) => {
      const body = new URLSearchParams({ ...(token ? { t: token } : {}), ...fields });
      return handleLeads(
        new Request(at(where), {
          method: 'POST', body: body.toString(),
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        }),
        env, at(where),
      );
    },
  };
}

/**
 * The HTML half of a message the mailbox recorded.
 *
 * worker/mail.ts base64-encodes that part and wraps it at 76 characters, because SMTP allows
 * 998 on a line and a generated table goes past it. So a plain substring search over the raw
 * message finds nothing and passes nothing, which is how the first version of the branded
 * check reported a failure that was in the check.
 */
const htmlPartOf = (raw) => {
  const at = String(raw ?? '').indexOf('Content-Transfer-Encoding: base64');
  if (at < 0) return '';
  // Walked line by line rather than matched with one expression over the whole message:
  // the part's body starts after the first blank line and ends at the next boundary, and
  // both of those are line events.
  const lines = String(raw).slice(at).split(String.fromCharCode(10))
    .map(l => l.replace(String.fromCharCode(13), ''));
  const body = [];
  for (const line of lines.slice(lines.indexOf('') + 1)) {
    if (line.startsWith('--')) break;
    body.push(line.trim());
  }
  return Buffer.from(body.join(''), 'base64').toString('utf8');
};

/** What a sandboxed iframe is actually holding, unescaped back into HTML. */
const srcdocOf = (page) => {
  const m = /srcdoc="([^"]*)"/.exec(page);
  if (!m) return null;
  return m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
};

/* ------------------------------------------------------------------ the routes */

head('five views, each on its own URL');
{
  const t = await desk({ prospects: [PROSPECT] });
  const id = t.ids[0];
  const paths = [
    ['the overview', `?t=${TOKEN}`],
    ['the leads', `/list?t=${TOKEN}`],
    ['the lead itself', `/lead/${id}?t=${TOKEN}`],
    ['prospecting', `/prospects?t=${TOKEN}`],
    ['one prospect', `/prospect/harborline-law?t=${TOKEN}`],
  ];
  for (const [name, q] of paths) {
    const res = await t.get(q);
    ok(`${name} answers`, res.status === 200, String(res.status));
  }
  for (const [name, q] of paths) {
    const res = await t.get(q.replace(TOKEN, 'b'.repeat(48)));
    ok(`${name} is shut without the token`, res.status === 404, String(res.status));
  }
  ok('a path nobody wrote is 404',
    (await t.get(`/nonsense?t=${TOKEN}`)).status === 404);
  ok('and so is a prospect that does not exist',
    (await t.get(`/prospect/not-a-firm?t=${TOKEN}`)).status === 404);
}

head('every page can reach every other');
{
  const t = await desk({ prospects: [PROSPECT] });
  for (const q of [`?t=${TOKEN}`, `/list?t=${TOKEN}`, `/prospects?t=${TOKEN}`]) {
    const page = await t.text(q);
    const all = page.includes('/api/leads?t=') && page.includes('/api/leads/list?t=')
      && page.includes('/api/leads/prospects?t=');
    ok(`the sidebar is on ${q}`, all);
  }
}

/* -------------------------------------------------------------- the preview */

head('the preview is the email, not a picture of one');
{
  const t = await desk();
  const id = t.ids[0];
  const page = await t.text(`/lead/${id}?t=${TOKEN}&tpl=terms`);
  const shown = srcdocOf(page);
  ok('there is a preview at all', shown !== null);
  ok('and it is a whole HTML document', /^<!doctype html>/i.test(String(shown)));

  // The claim this file exists for. Pull the draft out of the page and put it through the
  // renderer here: the two have to be the same string, or the preview is a different document
  // from the one the firm gets.
  const draft = /<textarea class="body"[^>]*>([\s\S]*?)<\/textarea>/.exec(page)[1]
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const expected = htmlFromText(draft, {
    footer: 'Law Firm Listings measures what US law firms publish about themselves and'
      + ' scores it against public records.',
    restrained: true,
  });
  ok('THE PREVIEW IS htmlFromText OF THE DRAFT', shown === expected,
    shown === expected ? '' : 'the preview and the renderer disagree');

  ok('it is sandboxed, so the email cannot run anything', page.includes('<iframe title=')
    && /<iframe[^>]*\ssandbox/.test(page));
}

head('an edit in the box is an edit in the preview');
{
  const t = await desk();
  const id = t.ids[0];
  const res = await t.post(`/lead/${id}`,
    { id, tpl: 'terms', subject: 'S', body: 'A line nobody templated.', to_refresh: '1' });
  ok('a refresh answers with the page', res.status === 200, String(res.status));
  const shown = srcdocOf(await res.text());
  ok('and the preview holds the edited text',
    String(shown).includes('A line nobody templated.'));
  ok('A PREVIEW SENDS NOTHING', t.box.sent.length === 0, String(t.box.sent.length));
}

head('the fragment the live preview asks for');
{
  const t = await desk();
  const id = t.ids[0];
  const res = await t.post(`/lead/${id}`,
    { id, tpl: 'terms', subject: 'S', body: 'Typed just now.', to_refresh: '1', fragment: '1' });
  const body = await res.text();
  ok('it answers HTML', (res.headers.get('content-type') || '').includes('text/html'));
  ok('it is the email on its own', /^<!doctype html>/i.test(body)
    && body.includes('Typed just now.'));
  ok('and it is never cached', (res.headers.get('cache-control') || '').includes('no-store'));
  ok('AND IT SENDS NOTHING EITHER', t.box.sent.length === 0, String(t.box.sent.length));
}

head('the live preview posts where the form says, and nowhere else');
{
  const t = await desk({ prospects: [PROSPECT] });
  const page = await t.text(`/prospect/harborline-law?t=${TOKEN}`);

  // The address the browser will actually use, taken off the page rather than assumed. The
  // first version of the script read form.action instead of the attribute, and a form exposes
  // its named controls as properties: this one has a button called "action", so every live
  // refresh posted to /api/leads/prospect/[object HTMLButtonElement], 404ed, and the preview
  // quietly stopped following the text.
  const action = /<form method="post" action="([^"]+)" class="compose"/.exec(page)?.[1];
  ok('the form says where it posts', typeof action === 'string', String(action));
  const res = await handleLeads(
    new Request(`https://lawfirmlistings.com${action}`, {
      method: 'POST',
      body: new URLSearchParams({
        t: TOKEN, slug: 'harborline-law', subject: 'S', body: 'Live text.',
        to_refresh: '1', fragment: '1',
      }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }),
    t.env, new URL(`https://lawfirmlistings.com${action}`));
  ok('AND THAT ADDRESS ANSWERS THE FRAGMENT', res.status === 200, String(res.status));
  ok('with the edited text in it', (await res.text()).includes('Live text.'));

  ok('the script never reads form.action', !page.includes('f.action'));
  ok('it reads the attribute instead', page.includes('f.getAttribute("action")'));
}

head('sober by default, and the toggle is not a toggle on the preview only');
{
  const t = await desk();
  const id = t.ids[0];
  const sober = srcdocOf(await t.text(`/lead/${id}?t=${TOKEN}&tpl=terms`));
  ok('SOBER IS THE DEFAULT', !String(sober).includes('apple-touch-icon'));

  const branded = srcdocOf(
    await t.text(`/lead/${id}?t=${TOKEN}&tpl=terms&brand=1`));
  ok('branded puts the mark back', String(branded).includes('apple-touch-icon'));

  // What the preview promised has to be what leaves the building.
  await t.post(`/lead/${id}`,
    { id, action: 'send', tpl: 'terms', subject: 'Terms', body: 'The letter.', brand: '1' });
  ok('one message went out', t.box.sent.length === 1, String(t.box.sent.length));
  const posted = htmlPartOf(t.box.sent[0]?.raw);
  ok('THE SENT MESSAGE IS BRANDED TOO', posted.includes('apple-touch-icon'),
    posted ? 'the HTML part is sober' : 'no HTML part was found at all');
  ok('and it is the same document the preview rendered',
    posted === htmlFromText('The letter.', {
      footer: 'Law Firm Listings measures what US law firms publish about themselves and'
        + ' scores it against public records.',
      restrained: false,
    }));

  const u = await desk();
  const uid = u.ids[0];
  await u.post(`/lead/${uid}`,
    { id: uid, action: 'send', tpl: 'terms', subject: 'Terms', body: 'The letter.' });
  ok('and a default send is sober',
    !htmlPartOf(u.box.sent[0]?.raw).includes('apple-touch-icon'));
}

/* ----------------------------------------------------------------- the charts */

head('a chart refuses rather than implying a trend');
{
  const two = columns({ title: 'Two things', data: [
    { label: 'a', value: 1 }, { label: 'b', value: 9 },
  ], unit: 'things' });
  ok('BELOW THE MINIMUM IT DRAWS NOTHING', !two.includes('<svg'));
  ok('and says how many there are', two.includes('2 things so far'));
  ok('and what it is waiting for', two.includes('starts drawing at 3'));

  const three = columns({ title: 'Three things', data: [
    { label: 'a', value: 1 }, { label: 'b', value: 9 }, { label: 'c', value: 4 },
  ] });
  ok('at the minimum it draws', three.includes('<svg'));
  ok('every bar carries its own number as text',
    ['>1<', '>9<', '>4<'].every(n => three.includes(n)));

  const horizontal = rows({
    title: 'Waits',
    data: [{ label: 'One', value: 2 }, { label: 'Two', value: 6 }, { label: 'Six', value: 14 }],
    mark: { at: 7, label: '7 days' },
  });
  ok('a threshold line is labelled, not just drawn', horizontal.includes('7 days'));

  const split = stacked({ title: 'Split', parts: [
    { label: 'New', value: 540 }, { label: 'Sent', value: 26 },
  ] });
  ok('a stacked bar names every part in the legend',
    split.includes('New') && split.includes('Sent'));
  ok('with the counts beside them', split.includes('540') && split.includes('26'));
  ok('and the percentages', split.includes('%'));
}

/* ------------------------------------------------------------- the prospecting */

head('the queue opens with the firms that have most riding on it');
{
  const t = await desk({
    prospects: [
      { ...PROSPECT, slug: 'quiet-river-legal', name: 'Quiet River Legal',
        domain: 'quietriver.example', state: 'ny', email: 'a@quietriver.example', pages: 1 },
      { ...PROSPECT, slug: 'tallgrass-trial', name: 'Tallgrass Trial Group',
        domain: 'tallgrass.example', state: 'tx', email: 'b@tallgrass.example', pages: 2 },
      { ...PROSPECT, pages: 4 },
    ],
  });
  const page = await t.text(`/prospects?t=${TOKEN}`);
  const order = ['Harborline Law', 'Tallgrass Trial Group', 'Quiet River Legal']
    .map(n => page.indexOf(n));
  ok('MOST-LISTED FIRST', order[0] < order[1] && order[1] < order[2], order.join(','));
  ok('the page says how many are waiting', page.includes('never written to'));
}

head('the cap is re-checked at the send, not only at the draw');
{
  // Filled past the ceiling, so the ramp's answer for the day is whatever capFor says at the
  // top step and the page has to print that number rather than a constant.
  const already = [];
  for (let i = 0; i < CAP; i += 1) {
    already.push({
      ...PROSPECT, slug: `firm-${i}`, name: `Firm ${i}`, domain: `firm${i}.example`,
      email: `x@firm${i}.example`, status: 'sent', sent_at: new Date().toISOString(),
    });
  }
  const t = await desk({ prospects: [...already, PROSPECT] });
  const page = await t.text(`/prospect/harborline-law?t=${TOKEN}`);
  const cap = capFor(CAP);
  ok('the page says the day is done', page.includes(`Today's ${cap} are sent`),
    `expected the ramp's ${cap}`);
  ok('and names what the ramp allows rather than the ceiling', cap !== CAP && cap === 10,
    String(cap));
  ok('and offers no send button', !page.includes('class="send"'));

  const res = await t.post('/prospect/harborline-law',
    { slug: 'harborline-law', action: 'send', subject: 'Hello', body: 'The letter.' });
  ok('THE CAP HOLDS AGAINST A POST ANYWAY', t.box.sent.length === 0, String(t.box.sent.length));
  ok('and it says so',
    (new URL(res.headers.get('location'), 'https://lawfirmlistings.com')
      .searchParams.get('said') || '').includes('already out'),
    res.headers.get('location'));
  ok('the row is untouched', (await getProspect(t.env, 'harborline-law')).status === 'new');
}

head('nobody is written to twice');
{
  const t = await desk({ prospects: [PROSPECT] });
  const first = await t.post('/prospect/harborline-law',
    { slug: 'harborline-law', action: 'send', subject: 'Is this right?', body: 'The letter.' });
  ok('the first letter goes', t.box.sent.length === 1, String(t.box.sent.length));
  ok('it answers a redirect, so a refresh cannot repeat it', first.status === 303);
  ok('and the row records it', (await getProspect(t.env, 'harborline-law')).status === 'sent');

  await t.post('/prospect/harborline-law',
    { slug: 'harborline-law', action: 'send', subject: 'Again?', body: 'The letter.' });
  ok('NO SECOND LETTER', t.box.sent.length === 1, String(t.box.sent.length));

  const page = await t.text(`/prospect/harborline-law?t=${TOKEN}`);
  ok('and the page says why', page.includes('already written to'));
}

head('an opt-out beats everything, including a row that does not know');
{
  const t = await desk({ prospects: [PROSPECT] });
  await t.post('/prospect/harborline-law', { slug: 'harborline-law', action: 'optout' });
  ok('it is recorded by address', await isOptedOut(t.env, PROSPECT.email));
  ok('and the row says so', (await getProspect(t.env, 'harborline-law')).status === 'unsubscribed');

  // The row put back to "new" by hand, which is the case the address-keyed record exists for.
  await putProspect(t.env, { ...PROSPECT });
  await t.post('/prospect/harborline-law',
    { slug: 'harborline-law', action: 'send', subject: 'Hello', body: 'The letter.' });
  ok('AN OPT-OUT THE ROW FORGOT STILL BLOCKS IT', t.box.sent.length === 0,
    String(t.box.sent.length));
}

head('no postal address, no letter');
{
  const t = await desk({ prospects: [PROSPECT], postal: null });
  const page = await t.text(`/prospect/harborline-law?t=${TOKEN}`);
  ok('the page refuses', page.includes('CAN-SPAM requires'));
  ok('and offers no send button', !page.includes('class="send"'));

  await t.post('/prospect/harborline-law',
    { slug: 'harborline-law', action: 'send', subject: 'Hello', body: 'The letter.' });
  ok('AND A POST SENDS NOTHING', t.box.sent.length === 0, String(t.box.sent.length));

  const list = await t.text(`/prospects?t=${TOKEN}`);
  ok('the list says what is blocking everything',
    list.includes('No postal address is configured'));
}

head('a reply stops being prospecting and becomes a lead');
{
  const t = await desk({ leads: [], prospects: [{ ...PROSPECT, status: 'sent',
    sent_at: '2026-11-02T10:00:00.000Z' }] });
  const res = await t.post('/prospect/harborline-law',
    { slug: 'harborline-law', action: 'replied' });
  ok('it lands on the new lead', res.status === 303
    && (res.headers.get('location') || '').includes('/api/leads/lead/'));

  const row = await getProspect(t.env, 'harborline-law');
  ok('the prospect is marked replied', row.status === 'replied');
  ok('AND THE TWO ROWS POINT AT EACH OTHER', typeof row.lead_id === 'string' && !!row.lead_id);

  const lead = await getLead(t.env, row.lead_id);
  ok('the lead exists', !!lead && lead.firm === 'Harborline Law');
  ok('and says where it came from', lead.origin === 'prospecting');
  ok('and nothing was sent to make it', t.box.sent.length === 0);
}

head('with no prospects loaded, the view says so rather than breaking');
{
  const t = await desk();
  const page = await t.text(`/prospects?t=${TOKEN}`);
  ok('it answers', page.includes('Nothing is loaded yet'));
  ok('and says how to load it', page.includes('load_prospects.mjs'));
  ok('the overview still draws', (await t.get(`?t=${TOKEN}`)).status === 200);
  ok('and refuses the prospecting chart rather than drawing an empty one',
    (await t.text(`?t=${TOKEN}`)).includes('This chart starts drawing at'));
}

/* --------------------------------------------------------------- the daily batch */

/** A clock we control, because every rule in worker/batch.ts is about what time it is. */
const at = (day, hour) => new Date(Date.UTC(2026, 10, day, hour, 5, 0));

/** Firms with an address, so a batch has more than a cap's worth to choose from. */
const many = (n, status = 'new') => Array.from({ length: n }, (_, i) => ({
  ...PROSPECT,
  slug: `firm-${i}`, name: `Firm ${i}`, domain: `firm${i}.example`,
  email: `contact@firm${i}.example`, pages: 20 - i, status,
  ...(status === 'sent' ? { sent_at: '2026-11-01T10:00:00.000Z' } : {}),
}));

head('the store is read to the end, because KV answers in pages');
{
  const t = await desk({ prospects: many(1200) });

  // The stub now refuses what production refuses. It used to ignore the limit and hand back
  // everything, so listProspects asked a real namespace for 2,000 rows through fifteen
  // passing guards, got a 400, and every page of the desk answered "Worker threw exception".
  let refused = false;
  try { await t.env.FOLLOWUPS.list({ prefix: 'prospect:', limit: 2000 }); }
  catch { refused = true; }
  ok('KV REFUSES AN OVERSIZED LIMIT RATHER THAN CLAMPING IT', refused);

  const all = await listProspects(t.env);
  ok('EVERY ROW COMES BACK, NOT THE FIRST PAGE', all.length === 1200, String(all.length));
  ok('and they are all distinct', new Set(all.map(p => p.slug)).size === 1200);
  ok('a caller may still cap it', (await listProspects(t.env, 7)).length === 7);
}

head('the daily number ramps with what has gone out, not with the calendar');
{
  ok('the first ten go five a day', capFor(0) === 5 && capFor(9) === 5);
  ok('then ten', capFor(10) === 10 && capFor(39) === 10);
  ok('then fifteen', capFor(40) === 15 && capFor(99) === 15);
  ok('and twenty-five from a hundred', capFor(100) === 25 && capFor(600) === 25);
  ok('THE RAMP CANNOT BE SKIPPED BY WAITING', capFor(0) === 5,
    'it is keyed to history, so a pause does not advance it');
}

head('a batch is proposed in the afternoon and emailed once');
{
  const t = await desk({ prospects: many(10) });

  const early = await proposeBatch(t.env, TOKEN, at(8, BUILD_HOUR - 1));
  ok('NOTHING IS BUILT BEFORE ITS HOUR', early.built === 0 && !early.notified);
  ok('and nothing is in the store', (await getBatch(t.env, tomorrow(at(8, 9)))) === null);

  const made = await proposeBatch(t.env, TOKEN, at(8, BUILD_HOUR));
  ok('it builds at the hour', made.built === 5, String(made.built));
  ok('five, because nothing has gone out yet', made.built === capFor(0));
  ok('THE OWNER IS EMAILED', t.box.sent.length === 1, String(t.box.sent.length));
  ok('at the address the secret names', t.box.sent[0]?.to === OWNER, t.box.sent[0]?.to);

  const note = htmlPartOf(t.box.sent[0]?.raw);
  ok('the email names the firms', note.includes('Firm 0') && note.includes('Firm 4'));
  ok('and carries a link to the list', note.includes('/api/leads/batch'));
  ok('with the day on it', note.includes(tomorrow(at(8, 17))));

  const again = await proposeBatch(t.env, TOKEN, at(8, BUILD_HOUR + 1));
  ok('A SECOND RUN BUILDS NOTHING', again.built === 0);
  ok('AND EMAILS NOTHING', t.box.sent.length === 1, String(t.box.sent.length));

  const batch = await getBatch(t.env, tomorrow(at(8, 17)));
  ok('most-listed first', batch.slugs[0] === 'firm-0' && batch.slugs[4] === 'firm-4');
}

head('silence is a no');
{
  const t = await desk({ prospects: many(10) });
  await proposeBatch(t.env, TOKEN, at(8, BUILD_HOUR));
  t.box.sent.length = 0;

  const out = await drainBatch(t.env, at(9, SEND_FROM + 1));
  ok('NOTHING SENDS WITHOUT AN APPROVAL', out.sent === 0 && t.box.sent.length === 0);
  const rows = await listProspects(t.env);
  ok('and no row says it was written to', rows.every(p => !p.sent_at));
}

head('approved, and only the ticked ones');
{
  const t = await desk({ prospects: many(10) });
  await proposeBatch(t.env, TOKEN, at(8, BUILD_HOUR));
  t.box.sent.length = 0;
  const on = tomorrow(at(8, 17));

  // Two of the five, plus one that was never proposed. A list of addresses to mail is not
  // something a request body gets to add to.
  await approveBatch(t.env, on, ['firm-0', 'firm-2', 'firm-9']);
  const batch = await getBatch(t.env, on);
  ok('A SLUG THAT WAS NOT PROPOSED IS DROPPED', !batch.approved.includes('firm-9'),
    batch.approved.join(','));
  ok('and the two real ones are kept', batch.approved.length === 2);

  const before = await drainBatch(t.env, at(9, SEND_FROM - 1));
  ok('NOTHING GOES OUT BEFORE THE WINDOW', before.sent === 0 && t.box.sent.length === 0);

  const run = await drainBatch(t.env, at(9, SEND_FROM));
  ok('a run sends at most PER_RUN', run.sent <= PER_RUN, String(run.sent));

  let guard = 0;
  while ((await drainBatch(t.env, at(9, SEND_FROM))).sent && guard++ < 10) { /* drain it */ }
  ok('THE APPROVED TWO WENT OUT', t.box.sent.length === 2, String(t.box.sent.length));
  ok('to the two that were ticked',
    t.box.sent.map(m => m.to).sort().join(',')
      === 'contact@firm0.example,contact@firm2.example',
    t.box.sent.map(m => m.to).join(','));
  ok('and the rows say so',
    (await getProspect(t.env, 'firm-0')).status === 'sent'
    && (await getProspect(t.env, 'firm-1')).status === 'new');

  const after = await drainBatch(t.env, at(9, SEND_FROM + 1));
  ok('A SECOND DRAIN SENDS NOTHING', after.sent === 0 && t.box.sent.length === 2);

  const late = await drainBatch(t.env, at(9, SEND_TO));
  ok('and the window closes', late.sent === 0);
}

head('the approval is a permission, not a cached verdict');
{
  const t = await desk({ prospects: many(10) });
  await proposeBatch(t.env, TOKEN, at(8, BUILD_HOUR));
  t.box.sent.length = 0;
  const on = tomorrow(at(8, 17));
  await approveBatch(t.env, on, ['firm-0', 'firm-1']);

  // Overnight, between the approval and the sending.
  await t.post('/prospect/firm-0', { slug: 'firm-0', action: 'optout' });

  let guard = 0;
  while ((await drainBatch(t.env, at(9, SEND_FROM))).sent && guard++ < 10) { /* drain it */ }
  ok('AN OPT-OUT AFTER THE APPROVAL STILL BLOCKS IT',
    !t.box.sent.some(m => m.to === 'contact@firm0.example'),
    t.box.sent.map(m => m.to).join(','));
  ok('and the other one still went', t.box.sent.some(m => m.to === 'contact@firm1.example'));
}

head('send none is a decision and is recorded as one');
{
  const t = await desk({ prospects: many(10) });
  await proposeBatch(t.env, TOKEN, at(8, BUILD_HOUR));
  t.box.sent.length = 0;
  const on = tomorrow(at(8, 17));

  const res = await t.post('/batch', { action: 'approve', on, none: '1' });
  ok('it answers a redirect', res.status === 303, String(res.status));
  const batch = await getBatch(t.env, on);
  ok('the batch records an empty approval',
    Array.isArray(batch.approved) && batch.approved.length === 0);
  ok('which is not the same as never having looked', typeof batch.approved_at === 'string');

  const out = await drainBatch(t.env, at(9, SEND_FROM + 1));
  ok('AND NOTHING IS SENT', out.sent === 0 && t.box.sent.length === 0);
}

head('the approval page opens without doing anything');
{
  const t = await desk({ prospects: many(10) });
  await proposeBatch(t.env, TOKEN, at(8, BUILD_HOUR));
  t.box.sent.length = 0;
  const on = tomorrow(at(8, 17));

  const page = await t.text(`/batch?t=${TOKEN}&on=${on}`);
  ok('it lists the proposed firms', page.includes('Firm 0') && page.includes('Firm 4'));
  ok('every row arrives ticked', (page.match(/ checked/g) || []).length === 5,
    String((page.match(/ checked/g) || []).length));
  ok('and says when they would go out', page.includes(`${SEND_FROM}:00`));
  ok('A GET APPROVES NOTHING', (await getBatch(t.env, on)).approved === undefined);
  ok('AND A GET SENDS NOTHING', t.box.sent.length === 0);
  ok('it is shut without the token',
    (await t.get(`/batch?t=${'b'.repeat(48)}&on=${on}`)).status === 404);
  ok('a day with no batch is 404',
    (await t.get(`/batch?t=${TOKEN}&on=2020-01-01`)).status === 404);
}

head('no postal address, no batch at all');
{
  const t = await desk({ prospects: many(10), postal: null });
  const made = await proposeBatch(t.env, TOKEN, at(8, BUILD_HOUR));
  ok('NOTHING IS EVEN PROPOSED', made.built === 0 && !made.notified);
  ok('and the owner is not emailed about it', t.box.sent.length === 0);
  ok('because a letter that cannot carry one is a letter that does not exist',
    (await getBatch(t.env, tomorrow(at(8, 17)))) === null);
}

head('the desk says when the next letters go out');
{
  const t = await desk({ prospects: many(10) });
  const before = await t.text(`/prospects?t=${TOKEN}`);
  ok('with no batch it says when one is proposed', before.includes(`${BUILD_HOUR}:00 UTC`));

  await proposeBatch(t.env, TOKEN, at(8, BUILD_HOUR));
  const waiting = await t.text(`/prospects?t=${TOKEN}`);
  ok('once proposed it says they are waiting on a person', waiting.includes('waiting on you'));
  ok('and links to the list', waiting.includes('/api/leads/batch?'));

  await approveBatch(t.env, tomorrow(at(8, 17)), ['firm-0']);
  const approved = await t.text(`/prospects?t=${TOKEN}`);
  ok('once approved it says the hours',
    approved.includes(`${SEND_FROM}:00`) && approved.includes(`${SEND_TO}:00`));

  const one = await t.text(`/prospect/firm-0?t=${TOKEN}`);
  ok('AND THE FIRM ITSELF SAYS WHEN ITS LETTER GOES', one.includes('Goes out'));
  const other = await t.text(`/prospect/firm-1?t=${TOKEN}`);
  ok('while one left out says that instead', other.includes('left out of the batch'));
}

console.log(failed
  ? `\n${failed} check(s) failed.\n`
  : '\nEvery check passed.\n');
process.exit(failed ? 1 : 0);
