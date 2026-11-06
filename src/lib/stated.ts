/**
 * What a profile shows, once a firm has corrected something about itself.
 *
 * The panel lets a firm fix four things that score.py also reads: languages and availability
 * feed E3, availability feeds E4 as well, and free_consultation and fee_model feed E1. Roughly
 * thirteen points of pillar E, reachable by typing into a form that a firm pays to use, on a
 * site that promises in five places that a listing moves no point of a score.
 *
 * So `scripts/apply_claims.py` writes a firm's own version into `firm_stated` and leaves the
 * measured value where it is. This is the other half: the page shows what the firm says,
 * because a firm is the authority on its own opening hours, and the scorer goes on reading what
 * `crawl_public.py` found on the public site, because that is what a score is a measurement of.
 *
 * Wrapping the whole record once, at the point each template binds it, rather than editing the
 * eight places that print one of these four fields. A template that prints a fifth one later is
 * covered without anybody remembering this file exists.
 *
 * The honest sentence this makes available, which the panel now prints: correcting something
 * here changes what this page says, and publishing it on your own site is what moves the score.
 * The second half is free and always will be.
 */
export interface Statable {
  languages?: string[];
  fee_model?: string;
  free_consultation?: boolean;
  availability?: string[];
  firm_stated?: {
    languages?: string[];
    fee_model?: string;
    free_consultation?: boolean;
    availability?: string[];
    stated_at?: string;
  };
}

/**
 * The record as a reader should see it. Absent and empty are different: a firm that clears its
 * language list has said something, and `undefined` is the only value that means it said
 * nothing, so only `undefined` falls through to the measured value.
 */
export function asShown<T extends Statable>(d: T): T {
  const said = d.firm_stated;
  if (!said) return d;
  const pick = <K extends keyof Statable>(k: K) =>
    (said[k as keyof typeof said] === undefined ? d[k] : said[k as keyof typeof said]);
  return {
    ...d,
    languages: pick('languages') as string[] | undefined,
    fee_model: pick('fee_model') as string | undefined,
    free_consultation: pick('free_consultation') as boolean | undefined,
    availability: pick('availability') as string[] | undefined,
  };
}
