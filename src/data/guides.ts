/**
 * The guides index reads this. One entry per published guide, alongside creating its page.
 *
 * A guide may declare a `gate`: the ranked-post rule from the content plan, where a ranking
 * publishes only once its cohort holds enough certified firms. The index evaluates the gate
 * against the firms collection rather than storing the answer, so a ranking appears here by
 * itself the moment it qualifies and nobody has to remember to add it.
 */
export interface GuideGate {
  /** Certified firms required in the cohort before the guide is listed. */
  minCertified: number;
  citySlug: string;
  practice: string;
}

export interface Guide {
  slug: string;
  kicker: string;
  title: string;
  summary: string;
  /** Which of the .guide .thumb gradients to use: '', 't2' or 't3'. */
  thumb?: string;
  icon?: string;
  /** One line for the compact cards on the home page, where there is no room for the summary. */
  meta?: string;
  gate?: GuideGate;
}

/**
 * Guides whose gate is satisfied, in manifest order. Takes the firms collection rather than
 * reading it, so callers pass whatever filter they already applied and this stays a pure
 * function of the data — the gate is never stored, so a ranking publishes itself the moment its
 * cohort qualifies and nobody has to remember to flip a flag.
 */
export function publishedGuides(
  firms: { data: { status: string; market: { city_slug: string }; practices: { slug: string }[] } }[],
): Guide[] {
  return GUIDES.filter(g => {
    if (!g.gate) return true;
    const certified = firms.filter(f =>
      f.data.status === 'certified' &&
      f.data.market.city_slug === g.gate!.citySlug &&
      f.data.practices.some(pr => pr.slug === g.gate!.practice));
    return certified.length >= g.gate.minCertified;
  });
}

export const GUIDES: Guide[] = [
  {
    slug: 'what-new-york-injury-firms-publish-about-fees',
    kicker: 'Costs',
    title: 'New Study: The Free Consultation Matters Less Than the Unprinted Fee',
    summary:
      'Nearly every New York firm in the directory offers a free consultation, so it differentiates nothing. What none of them publishes is the percentage, or how case expenses are handled, which is where a five-figure difference hides.',
    thumb: 't2',
    icon: 'doc',
    meta: 'The four questions to ask on the free call',
  },
  {
    slug: 'google-reviews-new-york-injury-firms',
    kicker: 'Data',
    title: 'New Study: Office Count Matters More Than Star Rating for Injury Firms',
    summary:
      'We summed every Google review across every business listing these New York firms operate. The ratings span well under a star; the review counts differ by orders of magnitude, mostly because of office count. Why a star rating ranks almost nothing.',
    thumb: 't3',
    icon: 'star',
    meta: 'What to read instead of the number',
  },
  {
    slug: 'core-web-vitals-new-york-injury-firms',
    kicker: 'Technical',
    title: "New Study: Almost Every New York Injury Firm Fails Google's Speed Test",
    // Both lines are hand-typed here rather than computed, so neither may carry a figure: this
    // said "One firm out of thirteen passes" for as long as the cohort has been larger than
    // thirteen. The page itself counts, and the manifest describes.
    summary:
      "We measured every New York firm in the directory against Google's thresholds. Almost none passes. What that means for pillar D of the score, and why it is the cheapest thing on a firm's list to fix.",
    thumb: '',
    icon: 'skyline',
    meta: 'Almost nobody passes, and it is cheap to fix',
  },
  {
    slug: 'what-a-case-results-page-proves',
    kicker: 'Method',
    title: 'New Study: The Court a Firm Names Matters More Than Its Number',
    summary:
      'We read the case results page of every firm in the directory and counted what is on it: how many results, which case types, whether any court is named, whether a disclaimer is there. We publish none of the amounts, and this is why.',
    thumb: 't2',
    icon: 'scale',
    meta: 'What we counted, and what we will not repeat',
  },
  {
    slug: 'best-personal-injury-law-firms-nyc',
    kicker: 'Ranking · New York',
    title: 'Best Personal Injury Law Firms in NYC',
    summary:
      'The highest-scoring personal injury firms in New York City, with the evidence behind each score.',
    thumb: 't3',
    icon: 'sky_sm',
    // Content plan section 5: a ranked post waits until the order can reflect verified
    // evidence rather than whichever firms were measured first.
    gate: { minCertified: 8, citySlug: 'new-york-ny', practice: 'personal-injury' },
  },
];
