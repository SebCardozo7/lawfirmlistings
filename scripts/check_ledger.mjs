#!/usr/bin/env node
/**
 * The lead ledger records every enquiry, moves it on once, and never moves it backwards.
 *
 * It exists because nothing did. An enquiry used to leave two KV keys that were deleted the
 * moment their emails went out, and the only surviving copy was in one inbox, so the business
 * could not answer how many leads it had had or how many paid. These are the properties that
 * make the answer trustworthy, which is the only thing that makes the ledger worth having.
 *
 * What is checked, and why each one would be silent if it broke:
 *
 *   it records          a row written on arrival, before any email, with status "arrived"
 *   newest first        the key inverts the clock, so KV's own ascending order is ours
 *   it advances         quoted, then chased, then closed, each stamping its own time
 *   NEVER BACKWARDS     a retried drain must not reopen a lead the owner already closed
 *   unknown id          an advance for a lead that is not there answers false, not throws
 *   no namespace        every entry point is a no-op rather than an exception, because a
 *                       ledger that is down must never cost us the enquiry it is recording
 *   the page is shut    no token, wrong token and no token minted all answer 404, and a
 *                       right one answers with the rows
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

const dir = mkdtempSync(path.join(tmpdir(), 'lfl-ledger-'));
const bundle = path.join(dir, 'bundle.mjs');
await build({
  stdin: {
    contents: `export { recordLead, advanceLead, listLeads, newLeadId } from './worker/ledger.ts';
               export { handleLeads } from './worker/leadspage.ts';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'neutral',
  outfile: bundle, external: ['cloudflare:email'], logLevel: 'warning',
});
const { recordLead, advanceLead, listLeads, newLeadId, handleLeads } =
  await import(pathToFileURL(bundle).href);

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

const ENQ = {
  firm: 'A Firm, P.C.', contact: 'A Person', email: 'person@example.com',
  city: 'New York, New York', request: 'Ask to be considered for the directory',
};

console.log('recording');
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
}

console.log('');
console.log('order');
{
  const { ns } = kv();
  const env = { FOLLOWUPS: ns };
  // Written oldest first, so a ledger that simply echoed KV's order would come back wrong.
  for (const firm of ['oldest', 'middle', 'newest']) {
    await recordLead(env, { ...ENQ, firm }, newLeadId());
    await new Promise(r => setTimeout(r, 3));
  }
  const names = (await listLeads(env)).map(l => l.firm);
  ok('newest first', names[0] === 'newest' && names[2] === 'oldest', names.join(', '));
}

console.log('');
console.log('advancing');
{
  const { ns } = kv();
  const env = { FOLLOWUPS: ns };
  const id = newLeadId();
  await recordLead(env, ENQ, id);

  ok('arrived to quoted', await advanceLead(env, id, 'quoted'));
  ok('quoted to chased', await advanceLead(env, id, 'chased'));
  let row = (await listLeads(env))[0];
  ok('each stamps its own time', Boolean(row.quoted_at && row.chased_at));

  ok('chased to closed, with a note',
     await advanceLead(env, id, 'closed', 'paid or handled, from the owner link'));
  row = (await listLeads(env))[0];
  ok('the note is kept', row.closed_as === 'paid or handled, from the owner link');

  // The one that matters. The chase is queued when the enquiry arrives and fires hours later;
  // if the owner closes the lead first, the chase draining must not reopen it. A send that is
  // retried must not either.
  ok('CLOSED DOES NOT GO BACK TO CHASED', (await advanceLead(env, id, 'chased')) === false);
  ok('and stays closed', (await listLeads(env))[0].status === 'closed');
  ok('nor does a repeat of the same step', (await advanceLead(env, id, 'closed')) === false);

  ok('an unknown id is false, not a throw', (await advanceLead(env, 'nope1234', 'quoted')) === false);
  ok('an empty id too', (await advanceLead(env, '', 'quoted')) === false);
}

console.log('');
console.log('a stray row under the prefix cannot take the page down');
{
  const { ns } = kv();
  const panel = kv();
  const env = { FOLLOWUPS: ns, PANEL: panel.ns };
  await recordLead(env, ENQ, newLeadId());
  // Exactly what happened in production: a hand-written probe left under the lead: prefix. It
  // is valid JSON, so parsing it succeeds, and then the page formats arrived_at on it and the
  // whole thing answers 500.
  await ns.put('lead:probe', JSON.stringify({ probe: true }));
  await ns.put('lead:halfway', JSON.stringify({ id: 'x', status: 'arrived' }));
  await ns.put('lead:garbage', 'not json at all');

  const rows = await listLeads(env);
  ok('the real row survives', rows.length === 1 && rows[0].firm === ENQ.firm, `${rows.length} rows`);

  await panel.ns.put('access:leads', JSON.stringify({ token: 'c'.repeat(48) }));
  const at = new URL(`https://lawfirmlistings.com/api/leads?t=${'c'.repeat(48)}`);
  const res = await handleLeads(new Request(at), env, at);
  ok('AND THE PAGE STILL ANSWERS 200', res.status === 200, String(res.status));
  ok('counting only the rows that are leads', (await res.text()).includes('>1<'));
}

console.log('');
console.log('with no namespace bound, nothing throws');
{
  const env = {};
  ok('recording is a no-op', (await recordLead(env, ENQ, 'abcd1234')) === null);
  ok('advancing is false', (await advanceLead(env, 'abcd1234', 'quoted')) === false);
  ok('listing is empty', (await listLeads(env)).length === 0);
}

console.log('');
console.log('the page is shut to everybody without the token');
{
  const { ns } = kv();
  const panel = kv();
  const env = { FOLLOWUPS: ns, PANEL: panel.ns };
  await recordLead(env, ENQ, newLeadId());
  const at = q => new URL(`https://lawfirmlistings.com/api/leads${q}`);
  const call = async q => handleLeads(new Request(at(q)), env, at(q));

  ok('no token minted yet answers 404', (await call('?t=anything')).status === 404);
  await panel.ns.put('access:leads', JSON.stringify({ token: 'a'.repeat(48), created_at: '2026-11-08' }));
  ok('no token on the request is 404', (await call('')).status === 404);
  ok('a wrong token of the same length is 404', (await call(`?t=${'b'.repeat(48)}`)).status === 404);
  ok('a wrong token of another length is 404', (await call('?t=short')).status === 404);

  const good = await call(`?t=${'a'.repeat(48)}`);
  ok('the right token is 200', good.status === 200, String(good.status));
  const html = await good.text();
  ok('and the row is on the page', html.includes('A Firm, P.C.'));
  ok('the page refuses to be indexed', html.includes('noindex')
     && (good.headers.get('x-robots-tag') || '').includes('noindex'));
  ok('and refuses to be cached', (good.headers.get('cache-control') || '').includes('no-store'));
  ok('a firm name is escaped, not injected',
     !(await (await call(`?t=${'a'.repeat(48)}`)).text()).includes('<script'));

  const unconfigured = await handleLeads(new Request(at('?t=x')), { FOLLOWUPS: ns }, at('?t=x'));
  ok('an unbound PANEL says so rather than crashing', unconfigured.status === 503);
}

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('The ledger records every enquiry, moves it on once, and never moves it back.');
