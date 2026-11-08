/**
 * Tomorrow's letters, proposed by the clock and sent only once a person has said yes.
 *
 * Sending 566 letters one click at a time is 566 clicks, and after the third one nobody is
 * reading them any more: the letter is the same letter, varying only in the firm's name, its
 * score and how many of our pages carry it. So the clicking is not where a person is worth
 * having. The place a person is worth having is the list, because the list is where the
 * mistakes are. scripts/crawl_emails.py has already produced a firm's web developer, a
 * file-sharing service and the author of a Google font, and none of those is a law firm that
 * wants to hear from us.
 *
 * So the rhythm is: the cron proposes, a person disposes, and the cron sends.
 *
 *   17:00 UTC   a batch for tomorrow is built and emailed to SUBMISSIONS_TO, with a link
 *   any time    the owner opens the link, unticks anybody wrong, and approves
 *   13:00 UTC   the approved letters start going out, a couple every quarter of an hour
 *   17:00 UTC   the window closes, whatever is left is simply not sent
 *
 * SILENCE IS A NO. A batch nobody approved sends nothing and is not carried forward; tomorrow
 * a fresh one is built from whoever is still waiting. The failure mode of forgetting is that
 * nothing happens, which is the only acceptable failure mode for mail to strangers.
 *
 * The link in that email opens a page. It does not send. Mail scanners follow links in
 * incoming messages to see where they go, so a link that acted on a GET would be a link that
 * approves a day's sending on its own, and worker/unsubscribe.ts already learned this.
 *
 * The daily number ramps with how many have gone out in total rather than with the calendar.
 * A domain that has sent a few dozen emails in its life and then sends 25 a day is a domain
 * that gets filed as spam, and this one also carries the replies to real leads and the panel
 * sign-ins. Keyed to history rather than to dates, the ramp restarts correctly after a pause
 * and cannot be skipped by waiting.
 */
import { firmByDomain } from './dossier';
import { pagesFor } from './pages';
import {
  canSend, getProspect, listProspects, putProspect, type Prospect,
} from './prospects';
import { sendTo } from './outbound';
import { verificationLetter } from './verifyletter';

export interface BatchEnv {
  FOLLOWUPS?: KVNamespace;
  /** Where the desk's access token is kept, so the email can carry a link that works. */
  PANEL?: KVNamespace;
  ASSETS?: Fetcher;
  EMAIL?: { send(message: any): Promise<unknown> };
  SUBMISSIONS_FROM?: string;
  SUBMISSIONS_TO?: string;
  REPLY_TO?: string;
  POSTAL_ADDRESS?: string;
}

export interface Batch {
  /** The day these go out, as YYYY-MM-DD. Also the key. */
  on: string;
  built_at: string;
  /** Who the queue proposed, most-listed first. */
  slugs: string[];
  /** Who the owner left ticked. Absent until somebody has looked. */
  approved?: string[];
  approved_at?: string;
  /** Who has actually gone out, so a re-run of the cron cannot double-send. */
  sent: string[];
  notified_at?: string;
}

const KEY = (on: string) => `batch:${on}`;

const SITE = 'https://lawfirmlistings.com';

/** When the batch for the next day is built and emailed, in UTC. */
export const BUILD_HOUR = 17;
/** The window the approved letters go out in, in UTC. Four hours, business hours in the US. */
export const SEND_FROM = 13;
export const SEND_TO = 17;
/** How many one run of the cron may send. The cron fires every 15 minutes. */
export const PER_RUN = 2;

export const dayOf = (d: Date): string => d.toISOString().slice(0, 10);
export const tomorrow = (now = new Date()): string =>
  dayOf(new Date(now.getTime() + 86400000));

/**
 * How many letters a day, given how many have ever gone out.
 *
 * The steps are deliberately slow at the bottom. The first ten are the ten that decide
 * whether the letter works at all, and a reply rate measured over five is not a measurement;
 * sending the next forty before reading the first five answers is how a bad opening line gets
 * sent to 566 firms instead of to five.
 */
export function capFor(sentEver: number): number {
  if (sentEver < 10) return 5;
  if (sentEver < 40) return 10;
  if (sentEver < 100) return 15;
  return 25;
}

/**
 * The desk's own access token, read out of KV so the email can carry a working link.
 *
 * The cron has no request and therefore no token of its own, and the link in that email has
 * to open the approval page. It is the same bearer value scripts/leads_link.mjs minted and
 * the same one the owner already has in a bookmark, so this puts nothing new in an inbox that
 * was not already there. Revoking it is still one delete, and it revokes the bookmark too.
 */
export async function leadsToken(env: BatchEnv): Promise<string> {
  if (!env.PANEL) return '';
  const raw = await env.PANEL.get('access:leads');
  if (!raw) return '';
  try {
    return (JSON.parse(raw) as { token?: string }).token ?? '';
  } catch {
    return '';
  }
}

export async function getBatch(env: BatchEnv, on: string): Promise<Batch | null> {
  if (!env.FOLLOWUPS) return null;
  const raw = await env.FOLLOWUPS.get(KEY(on));
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as Batch;
    return b && Array.isArray(b.slugs) ? { ...b, sent: b.sent ?? [] } : null;
  } catch {
    return null;
  }
}

export async function putBatch(env: BatchEnv, b: Batch): Promise<void> {
  if (!env.FOLLOWUPS) return;
  await env.FOLLOWUPS.put(KEY(b.on), JSON.stringify(b));
}

/** Everything that was ever sent, which is what the ramp is keyed to. */
const sentEver = (all: Prospect[]): number =>
  all.filter(p => p.sent_at).length;

/**
 * Builds the batch for a day, if there is not one already.
 *
 * Returns null when there is nothing to build, which covers all four reasons: a batch for that
 * day exists, nobody is waiting, no postal address is configured so no letter can legally go
 * out at all, or there is no namespace. None of them is an error and none of them is worth an
 * email saying so every afternoon.
 */
export async function buildBatch(env: BatchEnv, on: string): Promise<Batch | null> {
  if (!env.FOLLOWUPS) return null;
  if (!(env.POSTAL_ADDRESS ?? '').trim()) return null;
  if (await getBatch(env, on)) return null;

  const all = await listProspects(env);
  const cap = capFor(sentEver(all));

  const waiting = all
    .filter(p => p.status === 'new' || p.status === 'queued')
    .sort((a, b) => (b.pages ?? 0) - (a.pages ?? 0) || a.slug.localeCompare(b.slug));

  const slugs: string[] = [];
  for (const p of waiting) {
    if (slugs.length >= cap) break;
    // The gate here as well as at the send. A firm that cannot be written to should not be
    // on a list somebody is asked to read and approve.
    if (await canSend(env, p)) continue;
    slugs.push(p.slug);
  }
  if (!slugs.length) return null;

  const batch: Batch = {
    on,
    built_at: new Date().toISOString(),
    slugs,
    sent: [],
  };
  await putBatch(env, batch);
  return batch;
}

/** The email to the owner: the whole list, and one link that does not send anything. */
export function batchNotice(
  batch: Batch, rows: Prospect[], token: string,
): { subject: string; text: string } {
  const n = batch.slugs.length;
  const lines = [
    `${n} ${n === 1 ? 'letter is' : 'letters are'} proposed for ${batch.on}.`,
    '',
    'Nothing goes out until you approve it. Open the list, untick anybody who should not',
    'hear from us, and approve the rest. If you do nothing, nothing is sent and tomorrow',
    'builds a fresh list.',
    '',
    'Approve the list:',
    `${SITE}/api/leads/batch?t=${encodeURIComponent(token)}&on=${encodeURIComponent(batch.on)}`,
    '',
    'Who is on it, most-listed first:',
    '',
    ...rows.map(p =>
      `  ${p.name}  ${p.pages} ${p.pages === 1 ? 'page' : 'pages'}  ${p.email}`),
    '',
    'What each of them gets is the letter that asks whether what we publish about them is',
    'right. It names no price and offers no listing.',
    '',
    'Sebastian',
    'Law Firm Listings',
  ];
  return {
    subject: `${n} prospecting ${n === 1 ? 'letter' : 'letters'} for ${batch.on}, waiting on you`,
    text: lines.join('\n'),
  };
}

/**
 * Builds tomorrow's batch and tells the owner, once a day.
 *
 * Called from the cron, which fires every fifteen minutes, so it has to be safe to call
 * ninety-six times a day: getBatch stops the second build and notified_at stops the second
 * email. A build that cannot be emailed is left un-notified rather than discarded, so the
 * next run tries again.
 */
export async function proposeBatch(
  env: BatchEnv, token: string, now = new Date(),
): Promise<{ built: number; notified: boolean }> {
  if (now.getUTCHours() < BUILD_HOUR) return { built: 0, notified: false };
  const on = tomorrow(now);
  const made = await buildBatch(env, on);
  const batch = made ?? await getBatch(env, on);
  if (!batch || batch.notified_at) return { built: made ? made.slugs.length : 0, notified: false };
  if (!env.EMAIL || !env.SUBMISSIONS_TO || !token) {
    return { built: made ? made.slugs.length : 0, notified: false };
  }

  const rows: Prospect[] = [];
  for (const slug of batch.slugs) {
    const p = await getProspect(env, slug);
    if (p) rows.push(p);
  }
  const { subject, text } = batchNotice(batch, rows, token);
  try {
    await sendTo(env as any, env.SUBMISSIONS_TO, subject, text, true);
  } catch (err) {
    console.error('batch notice failed', on, err);
    return { built: made ? made.slugs.length : 0, notified: false };
  }
  await putBatch(env, { ...batch, notified_at: new Date().toISOString() });
  return { built: made ? made.slugs.length : 0, notified: true };
}

/** Records what the owner ticked. An empty list is a decision and is recorded as one. */
export async function approveBatch(
  env: BatchEnv, on: string, slugs: string[],
): Promise<Batch | null> {
  const batch = await getBatch(env, on);
  if (!batch) return null;
  // Only slugs that were proposed. The form is the only way in, but a list of addresses to
  // mail should not be something a request body can add to.
  const allowed = slugs.filter(s => batch.slugs.includes(s));
  const next: Batch = {
    ...batch, approved: allowed, approved_at: new Date().toISOString(),
  };
  await putBatch(env, next);
  return next;
}

/** One letter, generated rather than typed, and sent only if every rule still allows it. */
async function sendOne(env: BatchEnv, p: Prospect): Promise<boolean> {
  const [firm, pages] = await Promise.all([firmByDomain(env, p.domain), pagesFor(env, p.slug)]);
  const { letter, blocked } = verificationLetter(p, pages, firm, env);
  if (!letter) {
    console.warn('batch skipped', p.slug, blocked);
    return false;
  }
  await sendTo(env as any, p.email, letter.subject, letter.text, true);
  await putProspect(env, {
    ...p, status: 'sent', sent_at: new Date().toISOString(),
    note: 'asked whether our pages are right, from the approved batch',
  });
  return true;
}

/**
 * Sends a few of today's approved letters, if it is the right time of day.
 *
 * Every rule is checked again here and not trusted from the approval. The list was approved
 * yesterday afternoon; somebody may have unsubscribed overnight, the row may have been
 * written to by hand from the desk, and the postal address may have been unset. The approval
 * is a person's permission, not a cached verdict.
 */
export async function drainBatch(
  env: BatchEnv, now = new Date(),
): Promise<{ sent: number; failed: number; skipped: number }> {
  const out = { sent: 0, failed: 0, skipped: 0 };
  if (!env.FOLLOWUPS || !env.EMAIL) return out;
  if (!(env.POSTAL_ADDRESS ?? '').trim()) return out;

  const hour = now.getUTCHours();
  if (hour < SEND_FROM || hour >= SEND_TO) return out;

  const on = dayOf(now);
  const batch = await getBatch(env, on);
  if (!batch || !batch.approved || !batch.approved.length) return out;

  const left = batch.approved.filter(s => !batch.sent.includes(s));
  if (!left.length) return out;

  const done = [...batch.sent];
  for (const slug of left.slice(0, PER_RUN)) {
    const p = await getProspect(env, slug);
    if (!p) { out.skipped += 1; done.push(slug); continue; }
    const why = await canSend(env, p);
    if (why) {
      console.log(`batch skipped ${slug}: ${why}`);
      out.skipped += 1;
      done.push(slug);
      continue;
    }
    try {
      if (await sendOne(env, p)) out.sent += 1;
      else out.skipped += 1;
      done.push(slug);
    } catch (err) {
      // Left out of `done` on purpose, so the next run tries again. A send that threw is a
      // send we do not know happened, and the alternative to retrying is losing it silently.
      console.error('batch send failed', slug, err);
      out.failed += 1;
    }
  }
  await putBatch(env, { ...batch, sent: done });
  return out;
}

/** What the desk says at the top of the prospecting view, in one sentence and one state. */
export type BatchState =
  | { kind: 'none'; on: string }
  | { kind: 'waiting'; batch: Batch }
  | { kind: 'approved'; batch: Batch; left: number }
  | { kind: 'sending'; batch: Batch; left: number }
  | { kind: 'declined'; batch: Batch }
  | { kind: 'done'; batch: Batch };

export async function batchState(env: BatchEnv, now = new Date()): Promise<BatchState> {
  const today = dayOf(now);
  // Today's batch first: a batch that is sending is the thing a person wants to know about,
  // and tomorrow's is only interesting once today's is finished with.
  for (const on of [today, tomorrow(now)]) {
    const batch = await getBatch(env, on);
    if (!batch) continue;
    if (!batch.approved) return { kind: 'waiting', batch };
    if (!batch.approved.length) return { kind: 'declined', batch };
    const left = batch.approved.filter(s => !batch.sent.includes(s)).length;
    if (!left) return { kind: 'done', batch };
    const hour = now.getUTCHours();
    return on === today && hour >= SEND_FROM && hour < SEND_TO
      ? { kind: 'sending', batch, left }
      : { kind: 'approved', batch, left };
  }
  return { kind: 'none', on: tomorrow(now) };
}
