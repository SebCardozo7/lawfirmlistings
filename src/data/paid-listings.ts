/**
 * The firms with a current paid listing, by the domain their profile carries.
 *
 * This is the only thing that decides whether a firm's outbound link is followed, and it is a
 * list rather than a date on each profile because a date we do not hold is a date we would have
 * to invent, and nothing in this repository invents a fact about a real firm.
 *
 * The rule it serves is Sebastián's, taken on 2026-11-05 after being shown the audit and the
 * risk, and restated by him in those words: a followed link is a benefit of paying, the way it
 * is at a great many directories, and a firm that does not pay gets `nofollow`. It replaces the
 * rule that stood until today, under which any firm clearing every eligibility gate earned one.
 * That change is why eight pieces of published copy moved in the same commit: the old promise
 * was printed in the panel, in llms.txt, on the badge page, on every profile and in two emails,
 * and leaving any of them saying "earned at no cost" would have made this site lie about itself,
 * which is the one thing it cannot do and still be worth reading.
 *
 * Two things worth knowing before editing this list.
 *
 * It is public, and it cannot be otherwise. The built HTML says which outbound links are
 * followed, so anybody can derive this list from the pages whether or not it exists as a file.
 * Keeping it here means the site states plainly what is true rather than leaving a reader to
 * discover it, and `/list-your-firm/` and the panel both now say that a followed link comes with
 * a paid listing.
 *
 * A domain here is a claim that the firm currently pays. Remove one the day that stops being
 * true, because the alternative is a followed link we are giving to somebody while telling
 * everybody else it is the thing payment buys.
 */
export const PAID_LISTING_DOMAINS: readonly string[] = [
  'lopezandhumphries.com',
  'fieldinglaw.com',
  'nyclawfirm.com',
  'brookslawfirm.com',
  'malloy-law.com',
  'paulsoncoletti.com',
  'sarklawfirm.com',
  'glpa.law',
];

const normalise = (value: string): string =>
  value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

const PAID = new Set(PAID_LISTING_DOMAINS.map(normalise));

/** True where the firm's own domain is on the list above. Accepts a bare domain or a URL. */
export const hasPaidListing = (domain?: string | null): boolean =>
  !!domain && PAID.has(normalise(domain));
