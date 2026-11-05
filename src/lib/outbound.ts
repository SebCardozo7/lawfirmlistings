import { hasPaidListing } from '../data/paid-listings';

/**
 * Whether a firm's outbound link is followed, in one place.
 *
 * The rule used to live twice, as `gatesPassed || subscribed` in both `FirmCard.astro` and
 * `firms/[slug].astro`, with a third copy of its wording in the panel endpoint. Two of those
 * three had to be edited by hand every time the rule moved, which is how a profile and the card
 * for the same firm could have disagreed. They now ask this.
 *
 * The rule itself, from 2026-11-05: a followed link comes with a paid listing and with nothing
 * else. It is not earned by clearing the gates, it is not earned by a tier, and no score, gate
 * or ranking position moves with it in either direction. See `src/data/paid-listings.ts` for who
 * is on the list and for the history of what this replaced.
 */
export interface LinkableFirm {
  domain?: string | null;
  subscription?: { until?: string } | null;
}

/**
 * A firm pays if it is on the list, or if its own record carries a subscription that has not
 * run out. The second half is kept because the panel writes it and a record is a stronger
 * statement than a list somebody has to remember to edit; where both exist they agree.
 */
export const paysForListing = (d: LinkableFirm, today = new Date().toISOString().slice(0, 10)):
  boolean => hasPaidListing(d.domain) || Boolean(d.subscription?.until && d.subscription.until >= today);

/** `rel` for a link to the firm's own site, from a profile or from a card. */
export const firmLinkRel = (d: LinkableFirm, today?: string): string =>
  paysForListing(d, today) ? 'noopener' : 'nofollow noopener';
