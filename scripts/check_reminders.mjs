#!/usr/bin/env node
/**
 * The reminder that tells us a firm is still waiting, exercised rather than compiled.
 *
 * The acknowledgement a firm receives promises that a person will read its message and reply
 * within 12 working hours. Nothing watched whether that happened. One firm wrote on 28 October,
 * got the acknowledgement, got the quote six hours later, and waited six days: both automatic
 * messages worked perfectly and the one a person owed it never went.
 *
 * A Worker cannot read a mailbox, so it cannot know whether the reply was sent. It asks instead:
 * a reminder is queued with the enquiry, every email we get about that enquiry carries a link
 * that cancels it, and if nobody cancels and nobody answers, it arrives.
 *
 * That makes three things worth guarding, and none of them is caught by the code compiling:
 *
 *   the reminder must be able to cancel itself   The caller learns the key and the token from
 *     the return value, hours after the record was written. A record that did not keep its own
 *     copy produced a reminder with no way to stop the next one, and this file is how that was
 *     found rather than shipped.
 *
 *   a GET must not cancel anything   The address arrives by email. Outlook's Safe Links fetches
 *     every URL in a message to scan it and antivirus gateways do the same, so a GET that
 *     deleted the reminder would be cancelled by a scanner before the person ever saw it. The
 *     one thing this feature exists to prevent is a reminder that silently does not arrive.
 *
 *   a correction must not be told it has a quote   A correction and an appeal get no quote, by
 *     design. The reminder for one of those is the only thing that was ever going to answer it,
 *     and it says so.
 *
 * Both Worker modules are bundled with the esbuild that already sits in the lock file, because
 * they are TypeScript and they import cloudflare:email, which exists only inside the runtime.
 * It is stubbed. Nothing here sends anything.
 *
 * Usage:
 *   node scripts/check_reminders.mjs
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// esbuild's own API rather than its binary. node_modules/.bin/esbuild is a .cmd on Windows and
// Node has refused to spawn one of those since 20, which fails as EINVAL and looks like a
// missing install rather than a platform rule.
const esbuild = await import('esbuild');

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dir = mkdtempSync(join(tmpdir(), 'lfl-reminders-'));

let failures = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${extra ? `   ${extra}` : ''}`);
  }
};

async function bundle(entry, out) {
  const stub = join(dir, 'cfemail.js');
  writeFileSync(stub, 'export class EmailMessage {\n'
    + '  constructor(from, to, raw) { this.from = from; this.to = to; this.raw = raw; }\n'
    + '}\n');
  await esbuild.build({
    entryPoints: [join(ROOT, entry)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile: join(dir, out),
    alias: { 'cloudflare:email': stub },
    logLevel: 'warning',
  });
  return import(pathToFileURL(join(dir, out)).href);
}

/** An in-memory KV with the three methods the Worker uses, and an EMAIL that records. */
function makeEnv(overrides = {}) {
  const store = new Map();
  const sent = [];
  const env = {
    EMAIL: { send: async m => { sent.push(m); } },
    SUBMISSIONS_TO: 'owner@example.com',
    SUBMISSIONS_FROM: 'hello@example.com',
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
    REMINDER_HOURS: '48',
    FOLLOWUPS: {
      put: async (k, v) => { store.set(k, v); },
      get: async k => (store.has(k) ? store.get(k) : null),
      delete: async k => { store.delete(k); },
      list: async ({ prefix }) => ({
        keys: [...store.keys()].filter(k => k.startsWith(prefix)).sort().map(name => ({ name })),
      }),
    },
    ...overrides,
  };
  return { env, store, sent };
}

const ENQ = {
  firm: 'A Firm, P.C.',
  contact: 'A Person',
  email: 'person@example.com',
  city: 'New York, New York',
  request: 'Run the profile we already publish',
};

try {
  const out = await bundle('worker/outbound.ts', 'outbound.mjs');
  const worker = (await bundle('worker/index.ts', 'index.mjs')).default;
  const { queueReminder, answeredUrl, cancelReminder, drainReminders, reminderBody, SITE } = out;

  console.log('queueing');
  {
    const { env, store } = makeEnv();
    const r = await queueReminder(env, ENQ, SITE);
    ok('returns a key and a token', !!r?.key && !!r?.token);
    ok('due at REMINDER_HOURS', (() => {
      const h = (Date.parse(r.key.split(':').slice(1, -1).join(':')) - Date.now()) / 3600000;
      return h > 47.9 && h < 48.1;
    })());
    ok('the token is not in the key', !r.key.includes(r.token));
    const rec = JSON.parse([...store.values()][0]);
    ok('the record keeps what the firm asked for', rec.request === ENQ.request);
    ok('the record stamps when it was queued', !!rec.queuedAt);
    ok('THE RECORD CAN BUILD ITS OWN CANCEL LINK',
       rec.reminderKey === r.key && rec.reminderToken === r.token);
    ok('no link without a reminder', answeredUrl(ENQ) === null);
  }

  console.log('with no KV bound, which is a deploy that has not finished');
  {
    const { env } = makeEnv({ FOLLOWUPS: undefined });
    ok('queues nothing and does not throw', (await queueReminder(env, ENQ)) === null);
    const d = await drainReminders(env);
    ok('drains nothing', d.sent === 0 && d.failed === 0);
  }

  console.log('cancelling');
  {
    const { env, store } = makeEnv();
    const r = await queueReminder(env, ENQ);
    ok('a wrong token is refused', (await cancelReminder(env, r.key, 'nope')) === 'denied');
    ok('and the reminder survives it', store.size === 1);
    ok('a key outside the prefix is refused',
       (await cancelReminder(env, 'followup:x:y', r.token)) === 'denied');
    ok('the right token cancels', (await cancelReminder(env, r.key, r.token)) === 'cancelled');
    ok('cancelling twice says already gone',
       (await cancelReminder(env, r.key, r.token)) === 'gone');
  }

  console.log('draining');
  {
    const { env, store, sent } = makeEnv();
    await queueReminder(env, ENQ);
    const early = await drainReminders(env);
    ok('nothing due, nothing sent', early.sent === 0 && sent.length === 0 && store.size === 1);

    const key = [...store.keys()][0];
    const rec = JSON.parse(store.get(key));
    const due = new Date(Date.now() - 2 * 3600000).toISOString();
    store.delete(key);
    store.set(`reminder:${due}:aaaaaaaa`, JSON.stringify({
      ...rec, due, queuedAt: new Date(Date.now() - 50 * 3600000).toISOString(),
    }));

    const d = await drainReminders(env);
    ok('one sent', d.sent === 1 && d.failed === 0);
    ok('and deleted, because this one fires once', store.size === 0);
    // Who it reaches is the whole of this change. A priced enquiry is chased at the firm, so
    // the one address this must never be is the owner's.
    ok('addressed to the firm, not to us', sent[0].to === 'person@example.com');
    const raw = String(sent[0].raw);
    ok('counts the real wait rather than the setting', /\b50 hours ago\b/.test(raw),
       raw.match(/\b\d+ hours ago\b/)?.[0] ?? 'no hours line at all');
    // The cancel link is the owner's and belongs in the owner's own notice. Putting it in a
    // message to the firm would hand a stranger the switch that stops our own chasing.
    ok('and carries no cancel link, which is ours and not theirs',
       !raw.includes('/api/answered?k='));
    ok('it says the firm stays published either way',
       raw.includes('stays published whether or not you pay'));
    ok('and that nothing else follows', raw.includes('Nothing further is sent either way'));
    ok('a second drain sends nothing', (await drainReminders(env)).sent === 0 && sent.length === 1);
  }

  console.log('a send that fails is retried rather than lost');
  {
    const { env, store } = makeEnv();
    env.EMAIL.send = async () => { throw new Error('refused'); };
    const due = new Date(Date.now() - 60000).toISOString();
    store.set(`reminder:${due}:bbbbbbbb`, JSON.stringify({ ...ENQ, due, token: 't' }));
    const d = await drainReminders(env);
    ok('counted as failed', d.failed === 1 && d.sent === 0);
    ok('still queued for the next run', store.size === 1);
  }

  console.log('what the reminder says');
  {
    const { env } = makeEnv();
    const priced = reminderBody({ ...ENQ, request: 'Ask about sponsorship' }, env);
    // The second message is the firm's now. It has to read as a letter to them rather than as
    // a note about them, which is the difference a wrong pronoun would give away.
    ok('a priced enquiry is addressed to the firm', priced.to === 'firm');
    ok('and written to them, not about them',
       priced.text.includes('your profile') || priced.text.includes('Your profile'));
    ok('it leads with what does not change',
       priced.text.includes('stays published whether or not you pay'));
    ok('and names the thing that does',
       priced.text.includes('rel="nofollow"'));
    // With no PAYPAL_LINK configured the message must leave the line out rather than print a
    // broken one, which is the same rule the follow-up follows about the price.
    ok('it prints no payment line when none is configured',
       !priced.text.includes('Secure your listing'));
    const withLink = reminderBody({ ...ENQ, request: 'Ask about sponsorship' },
                                  makeEnv({ PAYPAL_LINK: 'https://paypal.me/x' }).env);
    ok('and carries one when there is a link',
       withLink.text.includes('Secure your listing') && withLink.text.includes('paypal.me/x'));
    ok('and closes without asking for a reply',
       priced.text.includes('If the answer is no, you need not reply'));

    // The exception, and the one that matters most. Somebody asking us to fix what we got
    // wrong is never chased for money: that message stays with the owner, where it was.
    const free = reminderBody({ ...ENQ, request: 'Correct something on our profile' }, env);
    ok('A CORRECTION IS NOT CHASED AT ALL', free.to === 'owner');
    ok('and is not told it has a quote',
       free.text.includes('something we do not charge for')
       && !free.text.includes('payment link')
       && !free.text.includes('paypal'));
    ok('the owner keeps the cancel link on that one',
       free.text.includes('say so and this stops'));
    ok('both say it is the only one', priced.text.includes('Nothing further is sent either way')
       && free.text.includes('This is the only reminder'));
    ok('with no link it says so rather than printing a broken one',
       reminderBody({ ...ENQ, request: 'Correct something on our profile' }, env)
         .text.includes('no cancel link'));
  }

  console.log('/api/answered');
  {
    const { env, store } = makeEnv();
    const r = await queueReminder(env, ENQ, SITE);
    const url = answeredUrl({ reminderKey: r.key, reminderToken: r.token }, SITE);
    const hit = (method, u = url) => worker.fetch(
      new Request(u, { method }), env, { waitUntil() {}, passThroughOnException() {} });

    const get = await hit('GET');
    const html = await get.text();
    ok('a GET answers with a page', get.status === 200
       && (get.headers.get('content-type') || '').includes('text/html'));
    ok('it asks rather than acts', html.includes('Mark this enquiry as answered?')
       && html.includes('method="POST"'));
    ok('it keeps itself out of the index', html.includes('content="noindex"'));
    ok('A GET DOES NOT CANCEL THE REMINDER', store.size === 1);

    const wrong = await hit('POST', url.replace(/&t=.*/, `&t=${'f'.repeat(32)}`));
    ok('a POST with the wrong token is refused',
       (await wrong.text()).includes('did not check out') && store.size === 1);

    ok('a POST with the right link cancels',
       (await (await hit('POST')).text()).includes('cancelled') && store.size === 0);
    ok('and again says already done', (await (await hit('POST')).text()).includes('Already done'));
    ok('half a link is told so', (await (await hit(
      'GET', `${SITE}/api/answered?k=reminder:x:y`)).text()).includes('Nothing to cancel'));
    ok('another method is 405', (await hit('DELETE')).status === 405);
    ok('every other address is still a file',
       (await (await hit('GET', `${SITE}/methodology/`)).text()) === 'asset');
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log();
if (failures) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('The reminder queues, cancels, drains once and tells the truth about what it is.');
