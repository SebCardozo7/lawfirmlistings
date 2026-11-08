#!/usr/bin/env node
/**
 * The lead desk records every enquiry, knows what we publish about the firm, and cannot mail
 * anybody by accident.
 *
 * It exists because nothing did. An enquiry used to leave two KV keys that were deleted the
 * moment their emails went out, and the only surviving copy was in one inbox, so the business
 * could not answer how many leads it had had or how many paid. Then the page learned to send,
 * which is a different kind of risk: a list that is wrong is annoying, and a page that mails
 * the wrong firm is not.
 *
 * Every firm, address and domain below is invented. The repository is public and the real
 * enquiries carry real people's names and addresses, so the fixtures are shaped like the cases
 * that prompted them and are nobody.
 *
 * What is checked, and why each one would be silent if it broke:
 *
 *   it records          a row written on arrival, before any email, with status "arrived"
 *   newest first        the key inverts the clock, so KV's own ascending order is ours
 *   it advances         quoted, then chased, each stamping its own time
 *   NEVER BACKWARDS     a retried drain must not reopen a lead the owner already resolved
 *   the desk may        a person correcting a mistake is the one case that goes backwards
 *   history             every send, status change and note is on the row, with who did it
 *   the dossier         the lead is matched to the firm we publish, by site and by email
 *   not covered         a state we do not publish is a different answer from "no match"
 *   TEMPLATES BLOCK     the letter for an unpublished state cannot go to a published one
 *   NO TOKEN NO MAIL    a POST without the token sends nothing and answers 404
 *   RE-CHECKED ON SEND  a blocked template posted anyway still does not send
 *   no namespace        every entry point is a no-op rather than an exception
 *   the page is shut    no token, wrong token and no token minted all answer 404
 *
 *   node scripts/check_ledger.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

let failed = 0;
const ok = (name, pass, detail) => {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}${pass || detail === undefined ? '' : `  (${detail})`}`);
  if (!pass) failed += 1;
};
const head = name => console.log(`\n${name}`);

const dir = mkdtempSync(path.join(tmpdir(), 'lfl-ledger-'));
const bundle = path.join(dir, 'bundle.mjs');

/**
 * cloudflare:email, stubbed rather than marked external.
 *
 * sendTo() reaches it with a dynamic import, so leaving it external means every send in this
 * file dies on an unsupported URL scheme and seven checks fail for a reason that has nothing
 * to do with the code under test. Stubbing it instead runs the real sendTo, the real MIME
 * assembly and the real binding call, and leaves the recorded message inspectable.
 */
const stubEmail = {
  name: 'stub-cloudflare-email',
  setup(b) {
    b.onResolve({ filter: /^cloudflare:email$/ }, () => ({ path: 'cloudflare:email', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export class EmailMessage {'
        + ' constructor(from, to, raw) { this.from = from; this.to = to; this.raw = raw; } }',
      loader: 'js',
    }));
  },
};

await build({
  stdin: {
    contents: `export * from './worker/ledger.ts';
               export { handleLeads } from './worker/leadspage.ts';
               export { dossierFor, resetIndex, stateOf, domainOf } from './worker/dossier.ts';
               export { TEMPLATES, render, templateById } from './worker/templates.ts';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'neutral',
  outfile: bundle, plugins: [stubEmail], logLevel: 'warning',
});
// The whole Worker, separately, so the router can be asked for a path rather than only the
// module behind it. Bundling the default export alongside the named ones would have the page
// and the router share module state, which is fine, but the entry point only exports default.
const workerBundle = path.join(dir, 'worker.mjs');
await build({
  stdin: {
    contents: "export { default as handle } from './worker/index.ts';",
    resolveDir: ROOT, loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'neutral',
  outfile: workerBundle, plugins: [stubEmail], logLevel: 'warning',
});

const M = await import(pathToFileURL(bundle).href);
const {
  recordLead, advanceLead, setStatus, addNote, setFollowUp, recordSend, getLead, listLeads,
  newLeadId, handleLeads, dossierFor, resetIndex, stateOf, domainOf, TEMPLATES, render,
} = M;

function kv() {
  const store = new Map();
  return {
    store,
    ns: {
      put: async (k, v) => { store.set(k, v); },
      get: async k => (store.has(k) ? store.get(k) : null),
      delete: async k => { store.delete(k); },
      list: async ({ prefix, limit }) => ({
        keys: [...store.keys()].filter(k => k.startsWith(prefix)).sort()
          .slice(0, limit ?? 1000).map(name => ({ name })),
      }),
    },
  };
}

/** The firms index as ASSETS would serve it. Three invented firms in three published states. */
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
      w: ['E', 0, 15], g: ['Certified', 5], o: ['E1', 'Free consult & fee transparency', 6],
    },
    'tallgrass.example': {
      s: 'tallgrass-trial', n: 'Tallgrass Trial Group', st: 'tx', sc: 64, t: 'Certified',
      w: ['D', 8, 25], o: ['D2', 'Search authority', 4],
    },
  },
};

const assets = (body = INDEX, status = 200) => ({
  fetch: async () => new Response(JSON.stringify(body), { status }),
});

/** A mail binding that records instead of sending, so a bug here is visible rather than sent. */
function mailbox() {
  const sent = [];
  return { sent, EMAIL: { send: async m => { sent.push(m); return undefined; } } };
}

const ENQ = {
  firm: 'A Firm, P.C.', contact: 'A Person', email: 'person@example.com',
  city: 'New York, New York', request: 'Ask to be considered for the directory',
};

const TOKEN = 'a'.repeat(48);

/** A whole desk: KV for leads, KV for the token, the index, and a mailbox. */
async function desk(leads = [ENQ]) {
  resetIndex();
  const followups = kv();
  const panel = kv();
  const box = mailbox();
  const env = {
    FOLLOWUPS: followups.ns, PANEL: panel.ns, ASSETS: assets(), EMAIL: box.EMAIL,
    SUBMISSIONS_FROM: 'hello@lawfirmlistings.com', LISTING_PRICE_USD: '500',
    PAYPAL_LINK: 'https://paypal.me/lawfirmlistings',
  };
  await panel.ns.put('access:leads', JSON.stringify({ token: TOKEN, created_at: '2026-11-08' }));
  const ids = [];
  for (const l of leads) {
    const id = newLeadId();
    await recordLead(env, l, id, 'https://lawfirmlistings.com');
    ids.push(id);
    await new Promise(r => setTimeout(r, 2));
  }
  const at = q => new URL(`https://lawfirmlistings.com/api/leads${q}`);
  return {
    env, ids, box, store: followups.store,
    get: q => handleLeads(new Request(at(q)), env, at(q)),
    post: (fields, token = TOKEN) => {
      const body = new URLSearchParams({ ...(token ? { t: token } : {}), ...fields });
      return handleLeads(
        new Request(at(''), {
          method: 'POST', body: body.toString(),
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        }),
        env, at(''),
      );
    },
  };
}

head('recording');
{
  const { ns, store } = kv();
  const env = { FOLLOWUPS: ns };
  const id = newLeadId();
  const key = await recordLead(env, ENQ, id, 'https://example.com');
  ok('a row is written', typeof key === 'string' && store.size === 1);
  ok('under a lead: prefix', String(key).startsWith('lead:'));
  const [row] = await listLeads(env);
  ok('it starts as arrived', row.status === 'arrived', row.status);
  ok('it stamps its arrival', typeof row.arrived_at === 'string' && row.arrived_at.length > 10);
  ok('it keeps what the firm sent', row.firm === ENQ.firm && row.email === ENQ.email);
  ok('and the id it was given', row.id === id);
  ok('the history opens with the arrival', row.events?.[0]?.kind === 'arrived');
  ok('getLead finds it by id', (await getLead(env, id))?.id === id);
  ok('and answers null for a stranger', (await getLead(env, 'nope1234')) === null);
}

head('order');
{
  const { ns } = kv();
  const env = { FOLLOWUPS: ns };
  for (const firm of ['oldest', 'middle', 'newest']) {
    await recordLead(env, { ...ENQ, firm }, newLeadId());
    await new Promise(r => setTimeout(r, 3));
  }
  const names = (await listLeads(env)).map(l => l.firm);
  ok('newest first', names[0] === 'newest' && names[2] === 'oldest', names.join(', '));
}

head('advancing, which only the automation does');
{
  const { ns } = kv();
  const env = { FOLLOWUPS: ns };
  const id = newLeadId();
  await recordLead(env, ENQ, id);

  ok('arrived to quoted', await advanceLead(env, id, 'quoted'));
  ok('quoted to chased', await advanceLead(env, id, 'chased'));
  let row = (await listLeads(env))[0];
  ok('each stamps its own time', Boolean(row.quoted_at && row.chased_at));
  ok('and writes itself into the history',
     row.events.filter(e => e.kind === 'status' && e.by === 'system').length === 2);

  ok('chased to closed', await advanceLead(env, id, 'closed', 'paid or handled'));
  row = (await listLeads(env))[0];
  ok('the note is kept', row.closed_as === 'paid or handled');

  // The one that matters. The chase is queued when the enquiry arrives and fires hours later;
  // if the lead is resolved first, the chase draining must not reopen it.
  ok('CLOSED DOES NOT GO BACK TO CHASED', (await advanceLead(env, id, 'chased')) === false);
  ok('and stays closed', (await listLeads(env))[0].status === 'closed');
  ok('nor does a repeat of the same step', (await advanceLead(env, id, 'closed')) === false);

  ok('an unknown id is false, not a throw', (await advanceLead(env, 'nope1234', 'quoted')) === false);
  ok('an empty id too', (await advanceLead(env, '', 'quoted')) === false);
}

head('a won lead is never chased again by the cron');
{
  const { ns } = kv();
  const env = { FOLLOWUPS: ns };
  const id = newLeadId();
  await recordLead(env, ENQ, id);
  await setStatus(env, id, 'won', { amount: 500, reason: 'paid' });
  ok('won records the money', (await getLead(env, id)).amount === 500);
  ok('and the reason', (await getLead(env, id)).reason === 'paid');
  ok('THE CRON CANNOT CHASE IT', (await advanceLead(env, id, 'chased')) === false);
  ok('nor quote it', (await advanceLead(env, id, 'quoted')) === false);
}

head('the desk, unlike the cron, may go backwards');
{
  const { ns } = kv();
  const env = { FOLLOWUPS: ns };
  const id = newLeadId();
  await recordLead(env, ENQ, id);
  await setStatus(env, id, 'lost', { reason: 'mistyped' });
  const back = await setStatus(env, id, 'quoted');
  ok('lost back to quoted, because a person can mistype', back?.status === 'quoted');
  ok('and the history says a person did it',
     back.events.at(-1).by === 'owner' && back.events.at(-1).detail.includes('lost to quoted'));
  ok('an invented status is refused', (await setStatus(env, id, 'banana')) === null);

  await setFollowUp(env, id, '2026-12-01');
  ok('a follow-up date is kept', (await getLead(env, id)).follow_up_at === '2026-12-01');
  ok('a malformed date is refused', (await setFollowUp(env, id, '1 December')) === null);
  await setFollowUp(env, id, '');
  ok('and an empty one clears it', (await getLead(env, id)).follow_up_at === undefined);

  await setFollowUp(env, id, '2026-12-01');
  await setStatus(env, id, 'won', { amount: 500 });
  ok('RESOLVING DROPS THE REMINDER', (await getLead(env, id)).follow_up_at === undefined);

  await addNote(env, id, 'rang them, no answer');
  ok('a note lands in the history',
     (await getLead(env, id)).events.at(-1).detail === 'rang them, no answer');
  ok('an empty note is refused', (await addNote(env, id, '   ')) === null);
}

head('the dossier: what we already publish about the firm');
{
  resetIndex();
  const env = { ASSETS: assets() };
  const bySite = await dossierFor(env, {
    website: 'https://harborline.example/los-angeles/', city: 'Los Angeles, CA',
  });
  ok('matched on the website, ignoring path and www', bySite.firm?.s === 'harborline-law');
  ok('and it carries the score', bySite.firm?.sc === 71);
  ok('and the page', bySite.url === 'https://lawfirmlistings.com/firms/harborline-law/');

  // A real enquiry wrote from one domain about a site on another. The reverse happens just as
  // often, so neither field alone finds everybody.
  const byMail = await dossierFor(env, {
    website: '', email: 'partner@tallgrass.example', city: 'Houston, TX',
  });
  ok('matched on the email domain when the site is blank', byMail.firm?.s === 'tallgrass-trial');

  const miss = await dossierFor(env, {
    website: 'https://nowhere.example/', city: 'East Brunswick, NJ',
  });
  ok('an unknown firm has no profile', miss.firm === undefined);
  ok('AND SAYS THE STATE IS NOT PUBLISHED', miss.covered === false, String(miss.covered));

  const known = await dossierFor(env, { website: 'https://nobody.example/', city: 'Albany, NY' });
  ok('a state we do publish stays covered', known.covered === true && known.firm === undefined);

  ok('state from a two letter code', stateOf('Houston, Tx') === 'tx');
  ok('state spelled out in full', stateOf('New York, New York') === 'ny');
  ok('no state from a blank field', stateOf('') === undefined);
  ok('domain without the scheme or www', domainOf('https://www.Foo.com/bar?x=1') === 'foo.com');
  ok('and nothing from a non-domain', domainOf('not a url') === undefined);
}

head('the index is for the desk, not for the web');
{
  // One file carrying every published firm. The desk reads it through ASSETS, which does not
  // come back through the router, so the path itself can be shut without the desk noticing.
  const { handle } = await import(pathToFileURL(workerBundle).href);
  const res = await handle.fetch(
    new Request('https://lawfirmlistings.com/api/firms-index.json'),
    { ASSETS: assets() }, { waitUntil() {} });
  ok('ASKING FOR IT DIRECTLY IS A 404', res.status === 404, String(res.status));
  const pagesRes = await handle.fetch(
    new Request('https://lawfirmlistings.com/api/firm-pages.json'),
    { ASSETS: assets() }, { waitUntil() {} });
  ok('and so is the page index beside it', pagesRes.status === 404, String(pagesRes.status));
  resetIndex();
  const d = await dossierFor({ ASSETS: assets() }, { website: 'https://harborline.example/' });
  ok('and the desk still reads it', d.firm?.s === 'harborline-law');
}

head('the dossier survives every lead asking for it at once');
{
  resetIndex();
  // The page does exactly this, and the first version failed it: one call set the "already
  // tried" flag, and every other call read the still-empty cache and reported the index
  // unavailable. A browser showed one row matched and two rows blank from one request.
  let fetches = 0;
  const counting = {
    ASSETS: {
      fetch: async () => {
        fetches += 1;
        await new Promise(r => setTimeout(r, 5));
        return new Response(JSON.stringify(INDEX));
      },
    },
  };
  const all = await Promise.all([
    dossierFor(counting, { website: 'https://harborline.example/' }),
    dossierFor(counting, { website: 'https://quietriver.example/' }),
    dossierFor(counting, { website: 'https://tallgrass.example/' }),
  ]);
  ok('EVERY CONCURRENT LOOKUP SEES THE INDEX',
     all.every(d => d.unknown === false), all.map(d => d.unknown).join(','));
  ok('and every one of them matched', all.every(d => Boolean(d.firm)),
     all.map(d => d.firm?.s ?? 'none').join(','));
  ok('with one fetch between them', fetches === 1, `${fetches} fetches`);
}

head('the dossier never takes the desk down');
{
  resetIndex();
  const broken = await dossierFor({ ASSETS: assets('<html>nope</html>', 500) }, { city: 'Houston, TX' });
  ok('a failed fetch says unknown rather than throwing', broken.unknown === true);
  ok('AND DOES NOT CLAIM THE STATE IS UNCOVERED', broken.covered === true);
  resetIndex();
  const none = await dossierFor({}, { city: 'Houston, TX' });
  ok('no ASSETS binding is the same', none.unknown === true && none.covered === true);
}

head('templates say what the dossier knows, and refuse what it does not');
{
  resetIndex();
  const env = {
    ASSETS: assets(), LISTING_PRICE_USD: '500', PAYPAL_LINK: 'https://paypal.me/lawfirmlistings',
  };
  const lead = {
    id: 'x', status: 'arrived', arrived_at: '2026-10-07T17:50:09.019Z',
    firm: 'Harborline Law', contact: 'Harborline Law', email: 'intake@harborline.example',
    website: 'https://harborline.example/los-angeles/', city: 'Los Angeles, CA',
  };
  const d = await dossierFor(env, lead);

  const interested = render('interested', lead, d, env);
  ok('the letter carries the real score', interested.letter.text.includes('71 out of 100'));
  ok('and the real page', interested.letter.text.includes('/firms/harborline-law/'));
  ok('and the pillar it is losing on', interested.letter.text.includes('pillar A is 10 of 25'));
  ok('and the gap to the next tier', interested.letter.text.includes('7 points'));
  ok('the price comes from the environment', interested.letter.text.includes('500 USD a year'));
  ok('and the pay link carries the amount',
     interested.letter.text.includes('paypal.me/lawfirmlistings/500USD'));
  ok('it asks the question in the first lines',
     interested.letter.text.split('\n').slice(0, 6).join(' ').includes('still interested'));
  ok('it asks for feedback', /feedback is welcome/i.test(interested.letter.text));
  ok('NO EM DASH ANYWHERE', !/[—]/.test(interested.letter.text));
  ok('it does not introduce the sender', !/I run the directory|I am Sebast/i.test(interested.letter.text));

  // The mistake this whole guard exists for: a price quoted into a state with no directory.
  const elsewhere = {
    ...lead, firm: 'Nowhere Legal', website: 'https://nowhere.example/',
    city: 'East Brunswick, NJ', email: 'clerk@nowhere.example',
  };
  const ed = await dossierFor(env, elsewhere);
  ok('THE TERMS LETTER IS BLOCKED FOR AN UNPUBLISHED STATE',
     render('terms', elsewhere, ed, env).blocked !== null);
  ok('and so is the one that claims a live profile',
     render('interested', elsewhere, ed, env).blocked !== null);
  ok('the new-state letter is the one that is allowed',
     render('newstate', elsewhere, ed, env).blocked === null);
  ok('and it names the state',
     render('newstate', elsewhere, ed, env).letter.text.includes('NJ'));

  ok('the new-state letter is blocked where we DO publish',
     render('newstate', lead, d, env).blocked !== null);

  // The crash this found, worth keeping named: `interested` reads the profile in its first
  // paragraph, so building it for a lead with no profile throws. Blocking has to happen before
  // building, not after.
  ok('A BLOCKED TEMPLATE PRODUCES NO LETTER AT ALL',
     render('interested', elsewhere, ed, env).letter === null);

  ok('an unknown template id is null', render('nope', lead, d, env) === null);
  for (const t of TEMPLATES) {
    const made = render(t.id, lead, d, env);
    if (made.blocked) { ok(`${t.id} is blocked for this lead, as designed`, true); continue; }
    ok(`${t.id} builds with a subject and a body`,
       Boolean(made?.letter.subject && made.letter.text.length > 80));
    ok(`${t.id} has no em dash`, !/[—]/.test(made.letter.text));
  }
  // A Google Business title runs to sixty characters and a slug follows it into the URL, so
  // the letters are measured against the longest realistic pair rather than the fixture's.
  // outbound.ts already had a 134-character line through the middle of a paragraph from
  // exactly this; two of these had 107 and 114 before the URLs were put on their own lines.
  {
    const long = {
      firm: {
        s: 'a-very-long-firm-slug-for-measuring', st: 'ny', sc: 60, t: 'Verified',
        n: 'A Firm With A Really Quite Long Google Business Title, P.C.',
        w: ['E', 0, 15], g: ['Certified', 5], o: ['E1', 'Free consult & fee transparency', 6],
      },
      url: 'https://lawfirmlistings.com/firms/a-very-long-firm-slug-for-measuring/',
      state: 'ny', covered: true, unknown: false,
    };
    const wide = { ...lead, firm: long.firm.n, contact: 'Dana Reyes' };
    for (const t of TEMPLATES) {
      const made = render(t.id, wide, long, env);
      if (made.blocked) continue;
      const longest = Math.max(...made.letter.text.split('\n').map(l => l.length));
      ok(`${t.id} WRAPS UNDER 95 COLUMNS even with a long name`, longest <= 95, `${longest} chars`);
    }
  }

  ok('a firm-shaped contact gets no first name',
     !/^Harborline,/.test(render('nudge', lead, d, env).letter.text));
  ok('a person-shaped one does',
     render('nudge', { ...lead, contact: 'Dana Reyes' }, d, env).letter.text.startsWith('Dana,'));
}

head('the page is shut to everybody without the token');
{
  const t = await desk();
  ok('no token on the request is 404', (await t.get('')).status === 404);
  ok('a wrong token of the same length is 404', (await t.get(`?t=${'b'.repeat(48)}`)).status === 404);
  ok('a wrong token of another length is 404', (await t.get('?t=short')).status === 404);

  const good = await t.get(`?t=${TOKEN}`);
  ok('the right token is 200', good.status === 200, String(good.status));
  const html = await good.text();
  ok('and the row is on the page', html.includes('A Firm, P.C.'));
  ok('the page refuses to be indexed', html.includes('noindex')
     && (good.headers.get('x-robots-tag') || '').includes('noindex'));
  ok('and refuses to be cached', (good.headers.get('cache-control') || '').includes('no-store'));
  ok('AND LEAKS NO TOKEN IN A REFERER',
     (good.headers.get('referrer-policy') || '').includes('no-referrer'));
  ok('a firm name is escaped, not injected',
     !(await (await t.get(`?t=${TOKEN}`)).text()).includes('<script'));

  const unconfigured = await handleLeads(
    new Request('https://x/api/leads?t=x'), { FOLLOWUPS: t.env.FOLLOWUPS },
    new URL('https://x/api/leads?t=x'));
  ok('an unbound PANEL says so rather than crashing', unconfigured.status === 503);
}

head('nothing is sent without the token');
{
  const t = await desk();
  const res = await t.post(
    { id: t.ids[0], action: 'send', subject: 'Hello', body: 'Buy this' }, '');
  ok('A POST WITH NO TOKEN IS 404', res.status === 404, String(res.status));
  ok('AND NO MAIL WENT OUT', t.box.sent.length === 0, `${t.box.sent.length} sent`);

  const wrong = await t.post(
    { id: t.ids[0], action: 'send', subject: 'Hello', body: 'Buy this' }, 'c'.repeat(48));
  ok('a POST with the wrong token is 404', wrong.status === 404);
  ok('and still nothing went out', t.box.sent.length === 0);

  const changed = await t.post({ id: t.ids[0], action: 'status', to: 'won' }, '');
  ok('nor can an untokened POST change a status', changed.status === 404);
  ok('and the lead is untouched', (await getLead(t.env, t.ids[0])).status === 'arrived');
}

head('sending, with the token');
{
  const t = await desk([{ ...ENQ, website: 'https://harborline.example', city: 'Los Angeles, CA' }]);
  const id = t.ids[0];
  const res = await t.post({
    id, action: 'send', tpl: 'interested', subject: 'Still interested?', body: 'The letter.',
  });
  ok('it answers a redirect, not a page', res.status === 303, String(res.status));
  ok('SO A REFRESH CANNOT SEND IT TWICE',
     (res.headers.get('location') || '').includes(`open=${id}`),
     res.headers.get('location'));
  ok('one message went out', t.box.sent.length === 1, `${t.box.sent.length}`);
  ok('to the firm that asked', t.box.sent[0]?.to === ENQ.email, t.box.sent[0]?.to);

  const lead = await getLead(t.env, id);
  ok('the history records the send', lead.events.some(e => e.kind === 'email' && e.by === 'owner'));
  // Not events.at(-1): the status change to quoted is written after the send, so the last
  // event is that, which is correct and is why this looks for the email rather than the end.
  ok('and names the template',
     lead.events.find(e => e.kind === 'email').detail.includes('interested'));
  ok('an arrived lead becomes quoted', lead.status === 'quoted', lead.status);

  await t.post({ id, action: 'send', subject: '', body: '' });
  ok('AN EMPTY LETTER SENDS NOTHING', t.box.sent.length === 1, `${t.box.sent.length}`);
}

head('a blocked template cannot be forced through the POST');
{
  const t = await desk([{
    ...ENQ, firm: 'Nowhere Legal', website: 'https://nowhere.example/',
    city: 'East Brunswick, NJ',
  }]);
  const id = t.ids[0];
  // The page would never draw this button enabled. The request is what a stale tab, or a
  // person with the URL, can still post.
  const res = await t.post({
    id, action: 'send', tpl: 'terms',
    subject: 'Your enquiry', body: 'Here are the terms, 500 USD a year.',
  });
  ok('it redirects rather than sending', res.status === 303);
  ok('IT SAYS WHY', decodeURIComponent(res.headers.get('location') || '').includes('Nothing sent'));
  ok('AND NO MAIL REACHED THE UNPUBLISHED STATE', t.box.sent.length === 0, `${t.box.sent.length} sent`);
  ok('the lead did not move', (await getLead(t.env, id)).status === 'arrived');

  const allowed = await t.post({
    id, action: 'send', tpl: 'newstate', subject: 'Your state', body: 'We would start it with you.',
  });
  ok('the letter that fits this lead does go', t.box.sent.length === 1 && allowed.status === 303);
}

head('a failed send records nothing');
{
  const t = await desk();
  t.env.EMAIL = { send: async () => { throw new Error('upstream down'); } };
  const res = await t.post({ id: t.ids[0], action: 'send', subject: 'Hi', body: 'There.' });
  ok('it redirects with the failure', res.status === 303
     && decodeURIComponent(res.headers.get('location') || '').includes('Send failed'));
  const lead = await getLead(t.env, t.ids[0]);
  ok('NO SEND IS WRITTEN TO THE HISTORY', !lead.events.some(e => e.kind === 'email'));
  ok('and the status did not move', lead.status === 'arrived');
}

head('the desk actions, end to end');
{
  const t = await desk();
  const id = t.ids[0];

  await t.post({ id, action: 'status', to: 'won', amount: '500', reason: 'paid on the link' });
  let lead = await getLead(t.env, id);
  ok('status posts through', lead.status === 'won');
  ok('with the amount', lead.amount === 500);
  ok('and the reason', lead.reason === 'paid on the link');

  await t.post({ id, action: 'note', text: 'invoice sent' });
  ok('notes post through', (await getLead(t.env, id)).events.at(-1).detail === 'invoice sent');

  await t.post({ id, action: 'followup', date: '2027-01-15' });
  ok('a follow-up date posts through', (await getLead(t.env, id)).follow_up_at === '2027-01-15');

  const page = await (await t.get(`/lead/${id}?t=${TOKEN}`)).text();
  ok('the lead has a page of its own', page.includes('invoice sent'));
  ok('and the money', page.includes('500'));
  ok('an unknown id is 404 there', (await t.get(`/lead/nope1234?t=${TOKEN}`)).status === 404);

  // The desk was one page with ?id= on it until the sidebar existed, and that address is in
  // sent email and in somebody's bookmarks. It has to keep arriving somewhere.
  const old = await t.get(`?t=${TOKEN}&id=${id}`);
  ok('THE OLD ?id= LINK STILL LANDS ON THE LEAD', old.status === 302, String(old.status));
  ok('and lands on its own page',
     (old.headers.get('location') || '').includes(`/api/leads/lead/${id}`),
     old.headers.get('location'));

  // The row unfolds in the list as well, and the two must show the same thing: a control that
  // exists on one and not the other is how a desk grows two ways of doing the same job.
  const unfolded = await (await t.get(`/list?t=${TOKEN}&open=${id}`)).text();
  ok('the list unfolds the same lead in place', unfolded.includes('invoice sent'));
  ok('and both offer the same letters',
     TEMPLATES.every(x => unfolded.includes(`value="${x.id}"`) && page.includes(`value="${x.id}"`)));
}

head('the numbers on the front page');
{
  const t = await desk([
    { ...ENQ, firm: 'One' }, { ...ENQ, firm: 'Two' }, { ...ENQ, firm: 'Three' },
  ]);
  await setStatus(t.env, t.ids[0], 'won', { amount: 500 });
  await setStatus(t.env, t.ids[1], 'lost', { reason: 'went elsewhere' });
  const html = await (await t.get(`?t=${TOKEN}`)).text();
  ok('it counts every enquiry', html.includes('<b>3</b>'));
  ok('it counts the open one', /<b>1<\/b><span>still open/.test(html));
  ok('it reports the win rate over resolved only', html.includes('<b>50%</b>'));
  ok('and the money booked', html.includes('$500'));
}

head('a lead nobody answered is shouted about');
{
  const t = await desk();
  const id = t.ids[0];
  // Backdate the arrival, which is what a fortnight of silence looks like to the page.
  const key = [...t.store.keys()].find(k => k.startsWith('lead:'));
  const row = JSON.parse(t.store.get(key));
  row.arrived_at = new Date(Date.now() - 14 * 86400000).toISOString();
  t.store.set(key, JSON.stringify(row));

  let html = await (await t.get(`?t=${TOKEN}`)).text();
  ok('THE PAGE SAYS SOMEBODY IS WAITING', html.includes('waiting on a person'));
  ok('and names it', html.includes('A Firm, P.C.'));

  await recordSend(t.env, id, 'wrote to them', 'owner');
  html = await (await t.get(`?t=${TOKEN}`)).text();
  ok('and stops once a person has written', !html.includes('waiting on a person'));

  await setFollowUp(t.env, id, '2020-01-01');
  html = await (await t.get(`?t=${TOKEN}`)).text();
  ok('an overdue follow-up is shouted about too', html.includes('follow-up') && html.includes('due'));
}

head('a stray row under the prefix cannot take the page down');
{
  const t = await desk();
  const ns = t.env.FOLLOWUPS;
  // Exactly what happened in production: a hand-written probe left under the lead: prefix. It
  // is valid JSON, so parsing it succeeds, and then the page formats arrived_at on it and the
  // whole thing answers 500.
  await ns.put('lead:probe', JSON.stringify({ probe: true }));
  await ns.put('lead:halfway', JSON.stringify({ id: 'x', status: 'arrived' }));
  await ns.put('lead:garbage', 'not json at all');

  const rows = await listLeads(t.env);
  ok('the real row survives', rows.length === 1 && rows[0].firm === ENQ.firm, `${rows.length} rows`);
  const res = await t.get(`?t=${TOKEN}`);
  ok('AND THE PAGE STILL ANSWERS 200', res.status === 200, String(res.status));
  ok('counting only the rows that are leads', (await res.text()).includes('<b>1</b>'));
}

head('with no namespace bound, nothing throws');
{
  const env = {};
  ok('recording is a no-op', (await recordLead(env, ENQ, 'abcd1234')) === null);
  ok('advancing is false', (await advanceLead(env, 'abcd1234', 'quoted')) === false);
  ok('setting a status is null', (await setStatus(env, 'abcd1234', 'won')) === null);
  ok('a note is null', (await addNote(env, 'abcd1234', 'hi')) === null);
  ok('getting is null', (await getLead(env, 'abcd1234')) === null);
  ok('listing is empty', (await listLeads(env)).length === 0);
}

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('The desk records every enquiry, knows the firm, and sends nothing by accident.');
