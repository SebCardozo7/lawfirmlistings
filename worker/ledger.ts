/**
 * Every enquiry this directory has ever received, kept.
 *
 * Until now none was. An enquiry arrived, two records went into KV to schedule the two emails,
 * both were deleted the moment they were sent, and what was left was a copy in one inbox. So
 * nobody could answer how many leads there had been this month, how many had paid, or whether
 * moving the follow-up from six hours to one made any difference. The business was being run
 * from a mailbox and measured not at all.
 *
 * This is the other half of the same KV namespace and it is deliberately dull: one record per
 * enquiry, written the moment it arrives, never deleted, with a status that moves as the
 * sequence does.
 *
 *     arrived   the form was submitted, the acknowledgement went out
 *     quoted    the follow-up drained and the firm has the price and the link
 *     chased    the second and last message went out
 *     closed    the owner said it was paid or dealt with, from the link in his own notice
 *
 * Two rules it follows, both learned from the queue it sits beside.
 *
 * A write here must never cost us an enquiry. Every call is wrapped by its caller and a failure
 * is logged and swallowed: a lead that reached us without a ledger row is worth more than one
 * that never arrived because the ledger was down.
 *
 * It carries no expiry. The queue records expire at ninety days because a message that has been
 * sent is finished; a lead is the opposite, and the only number that matters a year from now is
 * the one nobody thought to keep.
 */
import type { Enquiry } from './outbound';

export type LeadStatus = 'arrived' | 'quoted' | 'chased' | 'closed';

export interface LeadEnv {
  FOLLOWUPS?: KVNamespace;
}

export interface Lead extends Enquiry {
  id: string;
  status: LeadStatus;
  arrived_at: string;
  quoted_at?: string;
  chased_at?: string;
  closed_at?: string;
  /** What the owner said when he closed it, as the link he clicked reported it. */
  closed_as?: string;
  origin?: string;
}

/**
 * The key sorts newest first when KV lists it, which is the order a person wants and saves the
 * page sorting a thousand records to show twenty. KV lists lexicographically ascending, so the
 * timestamp is inverted: a large constant minus the epoch millis, zero padded so it stays the
 * same width until the year 5138.
 */
const keyFor = (id: string, at: Date): string =>
  `lead:${String(1e15 - at.getTime()).padStart(16, '0')}:${id}`;

export const newLeadId = (): string => crypto.randomUUID().slice(0, 8);

/** Writes the row. Returns its key, or null where there is nothing to write to. */
export async function recordLead(
  env: LeadEnv, e: Enquiry, id: string, origin?: string,
): Promise<string | null> {
  if (!env.FOLLOWUPS) return null;
  const at = new Date();
  const key = keyFor(id, at);
  const lead: Lead = {
    ...e, id, status: 'arrived', arrived_at: at.toISOString(), origin,
  };
  await env.FOLLOWUPS.put(key, JSON.stringify(lead));
  return key;
}

/**
 * Moves a lead on, found by its id.
 *
 * A scan rather than a direct get, because the key carries the arrival time and the caller
 * moving the lead on is a cron job hours later that knows only the id. The list is small (one
 * row per enquiry ever) and this runs at most twice per lead, so the scan is cheaper than
 * keeping a second index that can disagree with the first.
 *
 * Never moves backwards: a drain that retries must not turn a closed lead back into a chased
 * one, and the owner closing a lead before the chase fires must not be undone when it does.
 */
const RANK: Record<LeadStatus, number> = { arrived: 0, quoted: 1, chased: 2, closed: 3 };

export async function advanceLead(
  env: LeadEnv, id: string, to: LeadStatus, note?: string,
): Promise<boolean> {
  if (!env.FOLLOWUPS || !id) return false;
  const list = await env.FOLLOWUPS.list({ prefix: 'lead:' });
  const hit = list.keys.find(k => k.name.endsWith(`:${id}`));
  if (!hit) return false;
  const raw = await env.FOLLOWUPS.get(hit.name);
  if (!raw) return false;
  let lead: Lead;
  try {
    lead = JSON.parse(raw);
  } catch {
    return false;
  }
  if (RANK[lead.status] >= RANK[to]) return false;
  lead.status = to;
  const now = new Date().toISOString();
  if (to === 'quoted') lead.quoted_at = now;
  if (to === 'chased') lead.chased_at = now;
  if (to === 'closed') {
    lead.closed_at = now;
    if (note) lead.closed_as = note;
  }
  await env.FOLLOWUPS.put(hit.name, JSON.stringify(lead));
  return true;
}

/** Newest first, which is how the key is built. */
export async function listLeads(env: LeadEnv, limit = 200): Promise<Lead[]> {
  if (!env.FOLLOWUPS) return [];
  const list = await env.FOLLOWUPS.list({ prefix: 'lead:', limit });
  const out: Lead[] = [];
  for (const k of list.keys) {
    const raw = await env.FOLLOWUPS.get(k.name);
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // A row we cannot parse is a row we do not show, and not a page that fails to load.
    }
  }
  return out;
}
