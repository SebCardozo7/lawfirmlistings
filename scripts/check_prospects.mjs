#!/usr/bin/env node
/**
 * Nobody is written to twice, an opt-out is forever, and the letter never sells anything.
 *
 * This guards the only part of the system that contacts people who did not contact us. A bug
 * in the lead desk annoys somebody who already wanted to hear from us. A bug here writes to a
 * law firm that asked to be left alone, which is a breach of CAN-SPAM priced per message, and
 * it writes from the same domain that carries the replies to real leads.
 *
 * What is checked, and why each one would be silent if it broke:
 *
 *   AN OPT-OUT WINS         recorded by address, checked before everything, never expires
 *   NOT TWICE               a firm already written to is refused, whatever its status says
 *   A CLIENT IS NOT A LEAD  the firms that pay us are not sold the thing they bought
 *   NO POSTAL, NO LETTER    CAN-SPAM needs an address in the footer, so a missing one blocks
 *   IT DOES NOT SELL        no price, no pay link, nothing to sign up for, by assertion
 *   THE LINK IS IN IT       every letter carries its own working opt-out
 *   A PREFETCH IS NOT A CLICK   GET shows a button, only POST unsubscribes
 *   order                   most-listed firms first, which is where the letter is strongest
 *
 *   node scripts/check_prospects.mjs
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
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}${pass || detail === undefined ? '' : `  (${detail})`}`);
  if (!pass) failed += 1;
};
const head = n => console.log(`\n${n}`);

const dir = mkdtempSync(path.join(tmpdir(), 'lfl-prospects-'));
const bundle = path.join(dir, 'bundle.mjs');
await build({
  stdin: {
    contents: `export * from './worker/prospects.ts';
               export { verificationLetter, optOutUrl } from './worker/verifyletter.ts';
               export { handleUnsubscribe } from './worker/unsubscribe.ts';
               export { pagesFor, resetPages } from './worker/pages.ts';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'neutral', outfile: bundle, logLevel: 'warning',
});
const {
  canSend, optOut, isOptedOut, getProspect, putProspect, listProspects, nextBatch, tally,
  verificationLetter, optOutUrl, handleUnsubscribe, pagesFor, resetPages,
} = await import(pathToFileURL(bundle).href);

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
          .slice(0, limit ?? 2000).map(name => ({ name })),
      }),
    },
  };
}

const POSTAL = 'Example Studio, 1 Example Street, Montevideo 11300, Uruguay';

const FIRM = {
  s: 'harborline-law', n: 'Harborline Law', st: 'ca', sc: 71, t: 'Certified',
  w: ['A', 10, 25], g: ['Distinguished', 7], o: ['A2', 'Experience', 5],
  // 8.5 unclaimed of the 15 in pillar E, which is close to the real average of 10.4 across
  // the 1,388 published firms. The half point is deliberate: E3 scores 1.5 of 4 on a firm
  // that publishes one language beyond English, and the letter must not round it.
  fr: [
    ['Free consult & fee transparency', 3, 6],
    ['Languages & accessibility', 1.5, 4],
    ['Availability', 2, 5],
  ],
};
const PAGES = [
  'https://lawfirmlistings.com/cities/los-angeles-ca/',
  'https://lawfirmlistings.com/cities/los-angeles-ca/car-accidents/',
  'https://lawfirmlistings.com/certified/',
  'https://lawfirmlistings.com/practice-areas/personal-injury/',
  'https://lawfirmlistings.com/practice-areas/car-accidents/',
];

const make = (over = {}) => ({
  slug: 'harborline-law', name: 'Harborline Law', domain: 'harborline.example',
  state: 'CA', email: 'intake@harborline.example', pages: 12, status: 'new',
  added_at: '2026-11-08', ...over,
});

head('an opt-out beats everything');
{
  const { ns } = kv();
  const env = { FOLLOWUPS: ns };
  const p = make();
  ok('a fresh prospect may be written to', (await canSend(env, p)) === null);

  await optOut(env, 'INTAKE@Harborline.Example  ');
  ok('recorded however it was typed', await isOptedOut(env, 'intake@harborline.example'));
  ok('AND THE LETTER IS REFUSED', (await canSend(env, p)) !== null, String(await canSend(env, p)));

  // The one that matters most: the row still says "new", and the guard does not care.
  ok('EVEN THOUGH THE ROW STILL SAYS NEW', p.status === 'new');
  ok('a different address is unaffected',
     (await canSend(env, make({ email: 'other@elsewhere.example' }))) === null);
  ok('an empty address is refused', (await canSend(env, make({ email: '' }))) !== null);
  ok('and so is one with no @', (await canSend(env, make({ email: 'nope' }))) !== null);
}

head('the opt-out also marks the row, when there is one');
{
  const { ns } = kv();
  const env = { FOLLOWUPS: ns };
  await putProspect(env, make());
  await optOut(env, 'intake@harborline.example');
  ok('the row says unsubscribed', (await getProspect(env, 'harborline-law')).status === 'unsubscribed');
  ok('and says how', (await getProspect(env, 'harborline-law')).note.includes('left alone'));
}

head('nobody is written to twice');
{
  const { ns } = kv();
  const env = { FOLLOWUPS: ns };
  const sent = make({ status: 'sent', sent_at: '2026-11-01T10:00:00.000Z' });
  const why = await canSend(env, sent);
  ok('A FIRM ALREADY WRITTEN TO IS REFUSED', why !== null, String(why));
  ok('and the refusal says when', String(why).includes('2026-11-01'));
  // Status reset by hand, timestamp still there: the timestamp is what counts.
  ok('resetting the status does not reopen it',
     (await canSend(env, { ...sent, status: 'new' })) !== null);
}

head('a client is never a prospect');
{
  const { ns } = kv();
  const env = { FOLLOWUPS: ns };
  ok('A PAYING FIRM IS REFUSED', (await canSend(env, make({ status: 'client' }))) !== null);
  ok('a bounced address is refused', (await canSend(env, make({ status: 'bounced' }))) !== null);
}

head('the letter');
{
  const p = make();
  const { letter, blocked } = verificationLetter(p, PAGES, FIRM, { POSTAL_ADDRESS: POSTAL });
  ok('it builds', Boolean(letter) && blocked === null);

  // The whole premise. If a price ever appears in here, the letter has become the thing it
  // promises not to be, and the firm was told otherwise in its own last paragraph.
  ok('IT NAMES NO PRICE', !/\b\d{3}\s*USD\b|\$\d/.test(letter.text), letter.text.match(/\$\d+|\d+ USD/)?.[0]);
  ok('AND LINKS TO NO PAYMENT', !/paypal|checkout|\/pay\b/i.test(letter.text));
  ok('and says so out loud', /nothing to sign up for/i.test(letter.text));

  ok('it carries the real page count', letter.text.includes('5 pages'));
  ok('it shows four of them', PAGES.slice(0, 4).every(u => letter.text.includes(u)));
  ok('and says how many it left out', letter.text.includes('1 more'));
  ok('it carries the score', letter.text.includes('71 out of 100'));
  ok('it asks the question', /is any of it wrong\?/i.test(letter.text));
  ok('it promises a free correction', /costs nothing/i.test(letter.text));

  /*
   * The free points, which are the reason this letter was rewritten on 2026-11-13.
   *
   * It used to ask one thing, "is any of it wrong?", and the honest answer for most firms is
   * no, which is answered by saying nothing. Fifty-two letters got nothing back. So the letter
   * now leads with the one true thing that is worth the reader's time rather than ours: the
   * points in pillar E they have not claimed, every one of which is read off their own site.
   *
   * The arithmetic is asserted because it is the whole claim. 3 of 6, 1.5 of 4 and 2 of 5
   * leaves 8.5, and a letter that printed 8 or 9 would be telling a firm a number its own
   * profile page contradicts, in a letter whose entire purpose is to invite it to go and check.
   */
  ok('IT NAMES THE FREE POINTS', letter.text.includes('8.5 cost nothing'),
     letter.text.match(/, [\d.]+ cost nothing/)?.[0]);
  ok('and the subject carries the figure too', letter.subject.includes('8.5'), letter.subject);
  ok('and the score, because that is the fact about them',
     letter.subject.includes('scores 71'), letter.subject);
  ok('it lists each one with its own numbers',
     FIRM.fr.every(([label, pts, max]) => letter.text.includes(`${label}: ${pts} of ${max}`)));
  ok('it says they need nothing from us', /need nothing from us/i.test(letter.text));
  ok('and that nobody has to tell us', /do not have to tell\s+us/i.test(letter.text));
  // The old subject was a fact about us, not about them, and it is what went out 52 times.
  ok('the subject no longer leads on the page count', !letter.subject.includes('5 pages'),
     letter.subject);

  ok('THE OPT-OUT LINK IS IN IT', letter.text.includes(optOutUrl(p.email)));
  ok('and the postal address', letter.text.includes(POSTAL));
  ok('no em dash', !/[—]/.test(letter.text));
  ok('it does not introduce the sender first',
     !/^Hello,\n\nI am /.test(letter.text) && !/I run the directory/.test(letter.text));
  const longest = Math.max(...letter.text.split('\n').map(l => l.length));
  ok('it wraps under 95 columns', longest <= 95, `${longest}`);
}

/*
 * No firm in the directory has all fifteen points in pillar E today: all 1,388 of them have
 * something unclaimed, and that is exactly why this branch needs a test. It is the branch
 * nothing exercises, so it is the branch that rots, and the day a firm does claim the lot it
 * must get a letter rather than a sentence about 'undefined of the points you are missing'.
 */
head('a firm with nothing free left still gets a letter');
{
  const { fr, ...full } = FIRM;
  const { letter } = verificationLetter(make(), PAGES, full, { POSTAL_ADDRESS: POSTAL });
  ok('IT STILL BUILDS', Boolean(letter));
  ok('and names no free points', !/cost nothing and need nothing/.test(letter.text));
  ok('it falls back to the weakest pillar', letter.text.includes('A, at 10 of 25'));
  ok('the subject drops the figure', letter.subject === 'Harborline Law scores 71 on our '
     + 'directory', letter.subject);
  ok('and it still asks the question', /is any of it wrong\?/i.test(letter.text));
  ok('no stray undefined or NaN', !/undefined|NaN/.test(letter.text + letter.subject));
}

head('a letter that cannot be lawful is not written');
{
  const p = make();
  const none = verificationLetter(p, PAGES, FIRM, {});
  ok('NO POSTAL ADDRESS, NO LETTER', none.letter === null, 'a letter came out anyway');
  ok('and it says why', String(none.blocked).includes('CAN-SPAM'));

  const noFirm = verificationLetter(p, PAGES, undefined, { POSTAL_ADDRESS: POSTAL });
  ok('no profile, no letter', noFirm.letter === null);
  const noPages = verificationLetter(p, [], FIRM, { POSTAL_ADDRESS: POSTAL });
  ok('on no pages, no letter', noPages.letter === null);
}

head('the batch, most-listed first');
{
  const { ns } = kv();
  const env = { FOLLOWUPS: ns };
  for (const [slug, pages, status] of [
    ['few', 3, 'new'], ['many', 21, 'new'], ['some', 12, 'new'],
    ['done', 19, 'sent'], ['gone', 20, 'unsubscribed'], ['paid', 18, 'client'],
  ]) {
    await putProspect(env, make({
      slug, pages, status, email: `${slug}@example.com`,
      sent_at: status === 'sent' ? '2026-11-01T00:00:00.000Z' : undefined,
    }));
  }
  const { ready, blocked } = await nextBatch(env, 25);
  ok('MOST-LISTED FIRST', ready.map(p => p.slug).join(',') === 'many,some,few',
     ready.map(p => p.slug).join(','));
  ok('the sent, unsubscribed and client rows are not in it', ready.length === 3);
  ok('and are not reported as blocked either, being out of the pool',
     blocked.length === 0, `${blocked.length}`);

  const small = await nextBatch(env, 2);
  ok('the size is respected', small.ready.length === 2);
  ok('and it is still the top two', small.ready.map(p => p.slug).join(',') === 'many,some');

  // An opt-out the row does not know about. optOut() normally marks the row too, and then
  // nextBatch drops it before canSend is ever reached, so this writes the address record on
  // its own: a half-finished opt-out, a row restored from an older copy, a firm added after
  // it unsubscribed. The address record is the one that has to hold, and it is the one the
  // law cares about.
  await ns.put('optout:many@example.com',
               JSON.stringify({ at: 'many@example.com', how: 'a reply', on: '2026-11-02' }));
  const after = await nextBatch(env, 25);
  ok('AN OPT-OUT THE ROW DOES NOT KNOW ABOUT STILL BLOCKS IT',
     !after.ready.some(p => p.slug === 'many'), after.ready.map(p => p.slug).join(','));
  ok('and it is reported as blocked rather than vanishing silently',
     after.blocked.some(b => b.p.slug === 'many'),
     after.blocked.map(b => b.p.slug).join(',') || 'nothing blocked');

  // And the ordinary path, where optOut marks the row as well, takes it out of the pool.
  await optOut(env, 'some@example.com');
  const later = await nextBatch(env, 25);
  ok('a fully recorded opt-out leaves the pool',
     !later.ready.some(p => p.slug === 'some'));

  const counts = tally(await listProspects(env));
  ok('the tally counts every row', counts.total === 6, String(counts.total));
  ok('and splits them by status', counts.sent === 1 && counts.client === 1
     && counts.unsubscribed === 2, JSON.stringify(counts));
}

head('the unsubscribe page');
{
  const { ns } = kv();
  const env = { FOLLOWUPS: ns };
  const at = q => new URL(`https://lawfirmlistings.com/api/unsubscribe${q}`);
  const get = q => handleUnsubscribe(new Request(at(q)), env, at(q));
  const post = q => handleUnsubscribe(
    new Request(at(q), { method: 'POST' }), env, at(q));

  const shown = await get('?e=intake%40harborline.example');
  ok('a GET answers 200', shown.status === 200);
  const html = await shown.text();
  ok('with a button rather than a done message', html.includes('<button'));
  // A scanner that follows every link in an email must not unsubscribe anybody.
  ok('A PREFETCHED GET UNSUBSCRIBES NOBODY',
     (await isOptedOut(env, 'intake@harborline.example')) === false);

  const done = await post('?e=intake%40harborline.example');
  ok('a POST answers 200', done.status === 200);
  ok('AND IT IS RECORDED', await isOptedOut(env, 'intake@harborline.example'));
  ok('the page says so', (await (await get('?e=intake%40harborline.example')).text())
     .includes('Already done'));

  ok('a link with no address is 400', (await get('')).status === 400);
  ok('and one with nonsense too', (await get('?e=nope')).status === 400);
  ok('the page refuses to be indexed',
     (shown.headers.get('x-robots-tag') || '').includes('noindex'));
  ok('an address is escaped, not injected',
     !(await (await get('?e=' + encodeURIComponent('<script>@x.com'))).text()).includes('<script>@'));
}

head('with no namespace bound, nothing throws and nothing is permitted');
{
  const env = {};
  ok('an opt-out cannot be recorded', (await optOut(env, 'a@b.com')) === false);
  ok('listing is empty', (await listProspects(env)).length === 0);
  ok('getting is null', (await getProspect(env, 'x')) === null);
  const { ready } = await nextBatch(env, 10);
  ok('AND THERE IS NOBODY TO WRITE TO', ready.length === 0);
}

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('Nobody is written to twice, an opt-out is forever, and the letter sells nothing.');
