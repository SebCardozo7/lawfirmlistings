/**
 * The firms we publish and have never spoken to, and the rules for writing to them.
 *
 * Everything outbound here has been a reply until now: a firm writes in, we answer. That caps
 * the business at however many firms happen to find us, which this month was six. We publish
 * 1,388 firms, each on a median of thirteen of our own pages, and 566 of them put a contact
 * address on their own site where scripts/crawl_emails.py could read it. Those 566 have never
 * been told any of it.
 *
 * The opening is not a pitch and must never become one. It is the question we actually need
 * answered: your firm is on these pages of ours, with this score and this evidence, and is any
 * of it wrong. We publish these profiles without asking anybody, so the cost of being wrong
 * about a firm is ours, and a firm that corrects us has done us a favour. Only a firm that
 * writes back hears what a listing costs.
 *
 * Three rules hold this to that, and each is enforced here rather than remembered:
 *
 *   NOBODY IS WRITTEN TO TWICE. One letter per firm, ever, from this side. A second one makes
 *   it a campaign and makes the first one a lie.
 *
 *   AN OPT-OUT IS FOREVER AND BEATS EVERYTHING. A firm that asks to be left alone is recorded
 *   by address, the record never expires, and canSend() refuses before anything else is
 *   considered. US commercial email is governed by CAN-SPAM, which prices a breach per message
 *   sent, and 566 is not a number to be casual with. It is also simply what we would want.
 *
 *   A CLIENT IS NEVER A PROSPECT. The eight firms that pay us are in the directory like
 *   everyone else and must not be sold the thing they already bought.
 *
 * The daily cap is the fourth rule and lives with the queue rather than here: a domain that
 * has sent a few dozen emails in its life does not send 566 in an afternoon without being
 * filed as spam for the next year, and the same domain carries the replies to real leads and
 * the panel credentials.
 */

export type ProspectStatus =
  | 'new'          // we hold an address and have not written
  | 'queued'       // picked for today's batch
  | 'sent'         // the one letter went out
  | 'replied'      // they answered: this becomes a lead
  | 'bounced'      // the address does not exist
  | 'unsubscribed' // they asked to be left alone
  | 'client';      // they pay us, so they are not a prospect

export interface Prospect {
  /** The firm's slug in our own directory, which is also the key. */
  slug: string;
  name: string;
  domain: string;
  state: string;
  email: string;
  /** How many of our pages carry this firm, kept so the queue can be ordered without a fetch. */
  pages: number;
  status: ProspectStatus;
  added_at: string;
  sent_at?: string;
  replied_at?: string;
  /** The ledger row, once a reply turns this into a lead. */
  lead_id?: string;
  /** Why it ended where it did, in whatever words fit. */
  note?: string;
}

export interface ProspectEnv {
  FOLLOWUPS?: KVNamespace;
}

const KEY = (slug: string) => `prospect:${slug}`;

/**
 * An opt-out is keyed by address, lowercased, and never by firm.
 *
 * A firm may appear twice under two domains, and the person who asked to be left alone asked
 * on behalf of an inbox rather than a row in our database. Keyed by address, one request
 * covers every row that would reach them.
 */
const OPTOUT = (email: string) => `optout:${email.trim().toLowerCase()}`;

/**
 * How many keys one KV list call may ask for.
 *
 * 999 and not 1,000 because the two sources disagree: Cloudflare's documentation says 1,000
 * is the maximum, and the 400 a real namespace answers with says "Please specify integer less
 * than 1000". One of them is wrong, and the way to find out which is to put it in production
 * and watch the desk return "Worker threw exception", which is how we got here.
 */
const PAGE = 999;

/**
 * Every key under a prefix, followed to the end.
 *
 * Two different silent failures live in this one call. Ask for more than KV allows and it
 * does not clamp, it refuses the whole request with a 400, which surfaces as an unhandled
 * exception and a 1101 page. Ask for an allowed number and it answers that many and stops,
 * with `list_complete: false` as the only sign that the rest exists.
 *
 * A Map standing in for KV in a test does neither. It ignores the limit and returns
 * everything, so `listProspects` asked for 2,000 rows through fifteen passing guards and took
 * the desk down the first time a real namespace answered it.
 */
async function keysUnder(ns: KVNamespace, prefix: string): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await ns.list({ prefix, limit: PAGE, cursor });
    for (const k of page.keys) names.push(k.name);
    if (page.list_complete) return names;
    cursor = (page as { cursor?: string }).cursor;
    if (!cursor) return names;
  }
}

/** Lowercased and trimmed, because every comparison here depends on it. */
export const normalise = (email: string): string => String(email ?? '').trim().toLowerCase();

export async function isOptedOut(env: ProspectEnv, email: string): Promise<boolean> {
  if (!env.FOLLOWUPS) return false;
  const at = normalise(email);
  if (!at) return true;
  return (await env.FOLLOWUPS.get(OPTOUT(at))) !== null;
}

/**
 * Records an opt-out. No expiry, by design: a list that forgets is a list that writes again.
 */
export async function optOut(
  env: ProspectEnv, email: string, how = 'the link in our email',
): Promise<boolean> {
  if (!env.FOLLOWUPS) return false;
  const at = normalise(email);
  if (!at || !at.includes('@')) return false;
  await env.FOLLOWUPS.put(OPTOUT(at), JSON.stringify({ at, how, on: new Date().toISOString() }));
  // And the prospect row, where there is one, so the desk shows it rather than only the guard
  // knowing. Found by scan because the row is keyed by slug and this is an address.
  for (const name of await keysUnder(env.FOLLOWUPS, 'prospect:')) {
    const raw = await env.FOLLOWUPS.get(name);
    if (!raw) continue;
    try {
      const p = JSON.parse(raw) as Prospect;
      if (normalise(p.email) === at) {
        await env.FOLLOWUPS.put(name, JSON.stringify({
          ...p, status: 'unsubscribed', note: `asked to be left alone via ${how}`,
        }));
      }
    } catch {
      // A row we cannot read is a row we leave alone. The address-keyed record above is the
      // one that actually stops the sending, and it is already written.
    }
  }
  return true;
}

/**
 * The single gate every outbound message to a prospect passes.
 *
 * Returns null when the message may go, or the reason it may not. Called at the moment of
 * sending and not only when a batch is built, because a batch built an hour ago does not know
 * that somebody unsubscribed since.
 */
export async function canSend(env: ProspectEnv, p: Prospect): Promise<string | null> {
  if (!p.email || !p.email.includes('@')) return 'no address';
  if (p.status === 'unsubscribed') return 'they asked to be left alone';
  if (p.status === 'client') return 'they are already a client';
  if (p.status === 'bounced') return 'the address bounced';
  if (p.sent_at) return `already written to on ${p.sent_at.slice(0, 10)}`;
  if (await isOptedOut(env, p.email)) return 'they asked to be left alone';
  return null;
}

export async function getProspect(env: ProspectEnv, slug: string): Promise<Prospect | null> {
  if (!env.FOLLOWUPS || !slug) return null;
  const raw = await env.FOLLOWUPS.get(KEY(slug));
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Prospect;
    return p && typeof p.slug === 'string' && typeof p.email === 'string' ? p : null;
  } catch {
    return null;
  }
}

export async function putProspect(env: ProspectEnv, p: Prospect): Promise<void> {
  if (!env.FOLLOWUPS) return;
  await env.FOLLOWUPS.put(KEY(p.slug), JSON.stringify(p));
}

/** Everyone, shape-checked, newest-irrelevant: the desk sorts them itself. */
export async function listProspects(env: ProspectEnv, limit = Infinity): Promise<Prospect[]> {
  if (!env.FOLLOWUPS) return [];
  const out: Prospect[] = [];
  for (const name of await keysUnder(env.FOLLOWUPS, 'prospect:')) {
    if (out.length >= limit) break;
    const raw = await env.FOLLOWUPS.get(name);
    if (!raw) continue;
    try {
      const p = JSON.parse(raw);
      if (p && typeof p.slug === 'string' && typeof p.email === 'string'
          && typeof p.status === 'string') {
        out.push(p as Prospect);
      }
    } catch {
      // Not a prospect, not shown. The lead desk learned this the hard way.
    }
  }
  return out;
}

/**
 * The next few to write to, most-listed first.
 *
 * Most-listed first because that is where the opening sentence is strongest: a firm on twenty
 * of our pages has more riding on those pages being right than a firm on three, so it is both
 * the likeliest to answer and the one whose answer is worth most. It is also the fastest way
 * to find out whether the letter works at all.
 *
 * This only proposes. Every one of them passes canSend() again at the moment of sending.
 */
export async function nextBatch(
  env: ProspectEnv, size: number,
): Promise<{ ready: Prospect[]; blocked: { p: Prospect; why: string }[] }> {
  const all = await listProspects(env);
  const candidates = all
    .filter(p => p.status === 'new' || p.status === 'queued')
    .sort((a, b) => b.pages - a.pages || a.slug.localeCompare(b.slug));

  const ready: Prospect[] = [];
  const blocked: { p: Prospect; why: string }[] = [];
  for (const p of candidates) {
    if (ready.length >= size) break;
    const why = await canSend(env, p);
    if (why) blocked.push({ p, why });
    else ready.push(p);
  }
  return { ready, blocked };
}

/** What the desk shows at the top of the prospecting view. */
export function tally(all: Prospect[]): Record<ProspectStatus | 'total', number> {
  const out = {
    total: all.length, new: 0, queued: 0, sent: 0, replied: 0,
    bounced: 0, unsubscribed: 0, client: 0,
  } as Record<ProspectStatus | 'total', number>;
  for (const p of all) if (p.status in out) out[p.status] += 1;
  return out;
}
