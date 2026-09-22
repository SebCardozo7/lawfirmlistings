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
  /** Which CoverArt scene this guide owns, drawn on its cover and on its card. */
  cover?: 'results' | 'reviews' | 'speed' | 'fees' | 'ranking' | 'ladder' | 'roster'
    | 'shield' | 'register' | 'headcount' | 'offices' | 'screens' | 'rates'
    | 'divorce';
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
    slug: 'how-much-does-a-divorce-cost-in-new-york',
    cover: 'divorce',
    kicker: 'Reference',
    title: 'How Much Does a Divorce Cost in New York?',
    // Nothing in this file is computed, so nothing here may carry a figure. The page reads the
    // statute and prints the amount itself.
    summary:
      'Half of this question has an exact answer and half of it has none. New York sets its ' +
      'court fees by statute, so that part can be quoted to the dollar. The rest is a lawyer’s ' +
      'hours, so we turned the reported totals back into hours, which is the unit a bill is in.',
    thumb: '',
    icon: 'scale',
    meta: 'One statutory fee, and an unknown number of hours',
  },
  {
    slug: 'average-lawyer-hourly-rate',
    cover: 'rates',
    kicker: 'Reference',
    title: 'Average Lawyer Hourly Rate, and the Hours Nobody Pays For',
    // Nothing in this file is computed, so nothing here may carry a figure. The page computes
    // its own headline from the research file, which is why the two are worded differently.
    summary:
      'Every page on this search publishes the same table of rates by state and stops there. ' +
      'The number missing beside it is how much of a working day actually gets paid for, which ' +
      'is published too, and changes what the rate means.',
    thumb: 't3',
    icon: 'doc',
    meta: 'The rate prices a fraction of the day',
  },
  {
    slug: 'best-law-firm-websites',
    cover: 'screens',
    kicker: 'Method',
    title: '20 Best Law Firm Websites, Measured',
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts,
    // and the page's own title carries the count because it derives it.
    summary:
      'Every other list of the best law firm websites is a design agency showing its portfolio. ' +
      'We do not design websites, so we ran the speed test Google publishes on every firm in ' +
      'this directory instead, and kept the screenshot it took while measuring each one.',
    thumb: '',
    icon: 'columns',
    meta: 'Ranked on a measured number, not on taste',
  },
  {
    slug: 'law-firm-statistics-new-york',
    cover: 'offices',
    kicker: 'Reference',
    title: 'Law Firm Statistics in New York: Fewer Offices, More Lawyers',
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts.
    summary:
      'Nobody counts law firms, so we counted what is counted: the offices that report payroll. ' +
      'Over ten years New York has fewer of them, employing more people, paid half again as ' +
      'much. The profession is arranging itself into fewer and larger practices.',
    thumb: 't2',
    icon: 'columns',
    meta: 'Fewer doors, more people behind them',
  },
  {
    slug: 'how-many-lawyers-in-new-york',
    cover: 'headcount',
    // "Reference" rather than "Method": the nine guides before this one measure the firms in
    // this directory, and this one aggregates somebody else's dataset and makes no claim about
    // our firms at all. The kicker is how a reader tells them apart.
    kicker: 'Reference',
    title: 'How Many Lawyers Are in New York? We Counted the State Register',
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts.
    summary:
      'New York publishes every attorney registration it holds as open data. Ask it how many ' +
      'lawyers the state has and it answers four different ways, because that question has ' +
      'four meanings, and the American Bar Association reports a fifth number that matches ' +
      'none of them.',
    thumb: 't3',
    icon: 'columns',
    meta: 'One question, five different numbers',
  },
  {
    slug: 'what-a-business-register-proves-about-a-law-firm',
    cover: 'register',
    kicker: 'Method',
    title: "New Study: A Law Firm's Website Age Is Not How Old the Firm Is",
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts.
    summary:
      'Every guide to hiring a lawyer says to confirm the firm is a registered company. We ' +
      'tried it in every state we publish in, then compared the date the register gives with ' +
      'the age of the firm’s own web address. The two disagree in both directions.',
    thumb: '',
    icon: 'columns',
    meta: 'Two public dates, and neither is the firm’s age',
  },
  {
    slug: 'what-law-firms-publish-about-malpractice-insurance',
    cover: 'shield',
    kicker: 'Method',
    title: 'New Study: Law Firms List Their Bar Memberships, Not Their Insurance',
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts.
    summary:
      'Professional liability cover is what pays a client back when their own lawyer is ' +
      'negligent. We read every page these firms publish about themselves looking for one that ' +
      'says they carry it, including in the one state where carrying it is mandatory.',
    thumb: 't3',
    icon: 'scale',
    meta: 'The credential nobody prints',
  },
  {
    slug: 'what-it-takes-to-check-a-law-firm',
    cover: 'roster',
    kicker: 'Method',
    title: 'New Study: A Law Firm Can Be Highly Rated and Name No Lawyer at All',
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts.
    summary:
      'Every guide to hiring a lawyer says to look the attorney up in the state register. We ' +
      'tried it on every firm in this directory. Two things have to be true before that check ' +
      'runs, and one of them is usually missing.',
    thumb: 't2',
    icon: 'doc',
    meta: 'The check needs a name, and a register',
  },
  {
    slug: 'what-new-york-injury-firms-publish-about-fees',
    cover: 'fees',
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
    cover: 'reviews',
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
    cover: 'speed',
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
    cover: 'results',
    kicker: 'Method',
    title: 'New Study: The Court a Firm Names Matters More Than Its Number',
    summary:
      'We read the case results page of every firm in the directory and counted what is on it: how many results, which case types, whether any court is named, whether a disclaimer is there. We publish none of the amounts, and this is why.',
    thumb: 't2',
    icon: 'scale',
    meta: 'What we counted, and what we will not repeat',
  },
  {
    slug: 'what-a-law-firm-score-cannot-compare',
    cover: 'ladder',
    kicker: 'Method',
    title: 'New Study: Two Firms Can Share a Score and Not Share the Evidence',
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts.
    summary:
      'Our score is earned points over measured points, not over a hundred, so the same number can rest on very different evidence. Which comparisons the data supports, which we refuse to publish, and why the largest gap in the score turns out to be ours rather than any state\'s.',
    thumb: '',
    icon: 'columns',
    meta: 'Read the denominator before the number',
  },
  {
    slug: 'best-personal-injury-law-firms-nyc',
    cover: 'ranking',
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
