import type { CollectionEntry } from 'astro:content';

/**
 * The order of a ranked list, in one place.
 *
 * /cities/<city>/<practice>/ computes it, and now a badge saying "Ranked 8th of 20" has to agree
 * with the page that puts the firm eighth. Two copies of a sort are two answers waiting to
 * happen, and this one is a number a firm will print on its own website.
 *
 * A firm whose score the engine marks not comparable sorts last, not by its total: a 72 built
 * from 40% of the scale is not the same number as a 72 built from all of it. A firm with no
 * score at all sorts last too, because an absent score is not a zero.
 */
export const rankWeight = (f: CollectionEntry<'firms'>): number =>
  f.data.score && f.data.score.comparable !== false ? -f.data.score.total : 1;

export function rankFirms(firms: CollectionEntry<'firms'>[]): CollectionEntry<'firms'>[] {
  return [...firms].sort((a, b) =>
    rankWeight(a) - rankWeight(b) || a.data.name.localeCompare(b.data.name));
}

/** 1st, 2nd, 3rd, 4th. Written out because a badge says it rather than printing a numeral. */
export function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
