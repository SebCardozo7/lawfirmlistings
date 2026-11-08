/**
 * Every enquiry this directory has ever received, kept, and everything that has happened to it.
 *
 * Until the ledger existed none of it was. An enquiry arrived, two records went into KV to
 * schedule the two emails, both were deleted the moment they were sent, and what was left was a
 * copy in one inbox. So nobody could answer how many leads there had been this month, how many
 * had paid, or whether moving the follow-up from six hours to one made any difference. The
 * business was being run from a mailbox and measured not at all.
 *
 * The first version fixed the counting. This one fixes the working: a row now carries its own
 * history, the outcome when there is one, and the date somebody meant to come back to it.
 *
 *     arrived   the form was submitted, the acknowledgement went out
 *     quoted    the follow-up drained and the firm has the price and the link
 *     chased    the second message went out
 *     closed    dealt with, without saying how it ended
 *     won       they paid
 *     lost      they said no, or it cannot happen
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
 *
 * On automation versus the person: `advanceLead` is what the cron calls and it only ever moves
 * forward, so a retried drain cannot reopen a lead somebody closed. `setStatus` is what the
 * desk calls and it moves anywhere, because a person correcting a mistake is the one case where
 * going backwards is the right answer. Both write an event, so the history says which it was.
 */
import type { Enquiry } from './outbound';

export type LeadStatus = 'arrived' | 'quoted' | 'chased' | 'closed' | 'won' | 'lost';

export const STATUSES: LeadStatus[] = ['arrived', 'quoted', 'chased', 'closed', 'won', 'lost'];

/** The two that end a lead. Nothing is chased after these and they are what conversion counts. */
export const RESOLVED: LeadStatus[] = ['won', 'lost'];

export interface LeadEnv {
  FOLLOWUPS?: KVNamespace;
}

export interface LeadEvent {
  at: string;
  /** What happened: an email went out, the status moved, somebody wrote a note. */
  kind: 'arrived' | 'email' | 'status' | 'note';
  detail: string;
  /** Who did it. The automation says system; the desk says owner. */
  by: 'system' | 'owner';
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
  /** What the listing sold for, in whole USD, when the answer was yes. */
  amount?: number;
  /** Why it ended the way it did, in the owner's words. */
  reason?: string;
  /** The date somebody meant to come back to this, as YYYY-MM-DD. */
  follow_up_at?: string;
  /** Everything that has happened, oldest first. Absent on rows written before it existed. */
  events?: LeadEvent[];
  /**
   * Where the row came from, when it did not come from the form.
   *
   * The six enquiries that arrived before this ledger existed were reconstructed from the
   * notification emails, which is the only record of them there was. Their status is what the
   * sequence would have done and their outcome is not knowable: nobody was clicking a link
   * that did not exist. A row that says so is worth more than a row that looks measured.
   */
  note?: string;
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

/** Only ever used by the automation, which must not undo the desk. */
const RANK: Record<LeadStatus, number> = {
  arrived: 0, quoted: 1, chased: 2, closed: 3, won: 3, lost: 3,
};

/** Writes the row. Returns its key, or null where there is nothing to write to. */
export async function recordLead(
  env: LeadEnv, e: Enquiry, id: string, origin?: string,
): Promise<string | null> {
  if (!env.FOLLOWUPS) return null;
  const at = new Date();
  const key = keyFor(id, at);
  const lead: Lead = {
    ...e,
    id,
    status: 'arrived',
    arrived_at: at.toISOString(),
    origin,
    events: [{ at: at.toISOString(), kind: 'arrived', detail: 'enquiry received', by: 'system' }],
  };
  await env.FOLLOWUPS.put(key, JSON.stringify(lead));
  return key;
}

/**
 * Reads one lead, hands it to a function, writes back whatever that function returns.
 *
 * A scan rather than a direct get, because the key carries the arrival time and most callers
 * know only the id. The list is small, one row per enquiry ever, and this runs a handful of
 * times per lead across its whole life, so the scan is cheaper than a second index that can
 * disagree with the first.
 */
async function mutate(
  env: LeadEnv, id: string, fn: (lead: Lead) => Lead | null,
): Promise<Lead | null> {
  if (!env.FOLLOWUPS || !id) return null;
  const list = await env.FOLLOWUPS.list({ prefix: 'lead:' });
  const hit = list.keys.find(k => k.name.endsWith(`:${id}`));
  if (!hit) return null;
  const raw = await env.FOLLOWUPS.get(hit.name);
  if (!raw) return null;
  let lead: Lead;
  try {
    lead = JSON.parse(raw) as Lead;
  } catch {
    return null;
  }
  if (!lead || typeof lead.status !== 'string') return null;
  const next = fn(lead);
  if (!next) return null;
  await env.FOLLOWUPS.put(hit.name, JSON.stringify(next));
  return next;
}

const stamp = (lead: Lead, ev: Omit<LeadEvent, 'at'>): Lead => ({
  ...lead,
  events: [...(lead.events ?? []), { at: new Date().toISOString(), ...ev }],
});

/**
 * Moves a lead on, for the automation. Never moves backwards: a drain that retries must not
 * turn a closed lead back into a chased one, and the owner resolving a lead before the chase
 * fires must not be undone when it does.
 */
export async function advanceLead(
  env: LeadEnv, id: string, to: LeadStatus, note?: string,
): Promise<boolean> {
  const next = await mutate(env, id, lead => {
    if (RANK[lead.status] >= RANK[to]) return null;
    const now = new Date().toISOString();
    const moved: Lead = { ...lead, status: to };
    if (to === 'quoted') moved.quoted_at = now;
    if (to === 'chased') moved.chased_at = now;
    if (to === 'closed') {
      moved.closed_at = now;
      if (note) moved.closed_as = note;
    }
    return stamp(moved, { kind: 'status', detail: `${lead.status} to ${to}`, by: 'system' });
  });
  return next !== null;
}

/**
 * Sets the status by hand, from the desk. Goes anywhere, including backwards, because the one
 * person who can see the whole picture is also the one who can mistype.
 */
export async function setStatus(
  env: LeadEnv, id: string, to: LeadStatus,
  extra: { reason?: string; amount?: number } = {},
): Promise<Lead | null> {
  if (!STATUSES.includes(to)) return null;
  return mutate(env, id, lead => {
    const now = new Date().toISOString();
    const moved: Lead = { ...lead, status: to };
    if (to === 'quoted' && !moved.quoted_at) moved.quoted_at = now;
    if (to === 'chased' && !moved.chased_at) moved.chased_at = now;
    if (to === 'closed' || to === 'won' || to === 'lost') moved.closed_at = now;
    if (extra.reason) moved.reason = extra.reason;
    if (typeof extra.amount === 'number' && Number.isFinite(extra.amount)) {
      moved.amount = Math.round(extra.amount);
    }
    // A resolved lead has nothing left to come back to, so the reminder goes with it rather
    // than sitting in the overdue count forever.
    if (RESOLVED.includes(to)) delete moved.follow_up_at;
    const said = extra.reason ? `${lead.status} to ${to}: ${extra.reason}` : `${lead.status} to ${to}`;
    return stamp(moved, { kind: 'status', detail: said, by: 'owner' });
  });
}

/** Writes a note against the lead. The note is the history; nothing else changes. */
export async function addNote(env: LeadEnv, id: string, text: string): Promise<Lead | null> {
  const said = String(text ?? '').trim();
  if (!said) return null;
  return mutate(env, id, lead => stamp(lead, { kind: 'note', detail: said, by: 'owner' }));
}

/** Records that a message went out, which is the half of the history email cannot tell us. */
export async function recordSend(
  env: LeadEnv, id: string, what: string, by: 'system' | 'owner' = 'owner',
): Promise<Lead | null> {
  return mutate(env, id, lead => stamp(lead, { kind: 'email', detail: what, by }));
}

/** Sets or clears the date to come back to this one. An empty value clears it. */
export async function setFollowUp(env: LeadEnv, id: string, date: string): Promise<Lead | null> {
  const when = String(date ?? '').trim();
  if (when && !/^\d{4}-\d{2}-\d{2}$/.test(when)) return null;
  return mutate(env, id, lead => {
    const moved = { ...lead };
    if (when) moved.follow_up_at = when;
    else delete moved.follow_up_at;
    return stamp(moved, {
      kind: 'note',
      detail: when ? `follow up set for ${when}` : 'follow up cleared',
      by: 'owner',
    });
  });
}

/**
 * One lead by id, or null.
 *
 * Not written in terms of mutate(): a reader that returns null to mean "change nothing" is
 * indistinguishable there from "not found", so it would always answer null. Worth saying out
 * loud because the first version of this function did exactly that and the tests caught it.
 */
export async function getLead(env: LeadEnv, id: string): Promise<Lead | null> {
  if (!env.FOLLOWUPS || !id) return null;
  const list = await env.FOLLOWUPS.list({ prefix: 'lead:' });
  const hit = list.keys.find(k => k.name.endsWith(`:${id}`));
  if (!hit) return null;
  const raw = await env.FOLLOWUPS.get(hit.name);
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as Lead;
    return row && typeof row.id === 'string' && typeof row.status === 'string' ? row : null;
  } catch {
    return null;
  }
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
      const row = JSON.parse(raw);
      // Shape-checked, not just parsed. A key under this prefix that is valid JSON and not a
      // lead reaches the page and the page formats arrived_at, so one stray row took the whole
      // thing down with a 500. That row was a probe somebody wrote by hand, which is exactly
      // the kind of thing that ends up in a namespace a person can edit.
      if (row && typeof row.id === 'string' && typeof row.status === 'string'
          && typeof row.arrived_at === 'string' && typeof row.firm === 'string') {
        out.push(row as Lead);
      }
    } catch {
      // A row we cannot parse is a row we do not show, and not a page that fails to load.
    }
  }
  return out;
}
