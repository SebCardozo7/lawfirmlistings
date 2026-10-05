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
  cover?: 'results' | 'reviews' | 'speed' | 'fees' | 'statutes' | 'ranking' | 'ladder' | 'roster'
    | 'shield' | 'register' | 'headcount' | 'offices' | 'screens' | 'rates'
    | 'divorce' | 'language' | 'sample' | 'pages' | 'signal' | 'consult' | 'deadline'
    | 'defense';
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
  firms: {
    data: {
      status: string;
      market: { city_slug: string };
      practices: { slug: string; primary?: boolean }[];
    };
  }[],
): Guide[] {
  return GUIDES.filter(g => {
    if (!g.gate) return true;
    // The firm's own practice, not a practice it happens to list. A firm names every area it
    // will take, so counting mentions counts the wrong thing: New York has nine certified firms
    // listing workers' compensation and two whose practice it is, the other seven being injury
    // firms from the injury cohort. A ranking gated on the loose count would publish an injury
    // ranking under a workers' compensation title, which is the sort of page this directory
    // exists to be an alternative to.
    //
    // It changes nothing that is published today: the New York injury ranking counts seventeen
    // either way, and workers' compensation is the only pair in the directory where the two
    // numbers differ at all.
    const certified = firms.filter(f =>
      f.data.status === 'certified' &&
      f.data.market.city_slug === g.gate!.citySlug &&
      f.data.practices.some(pr => pr.slug === g.gate!.practice && pr.primary));
    return certified.length >= g.gate.minCertified;
  });
}

export const GUIDES: Guide[] = [
  // The state statute pages from docs/guides-50.md, family B. Reference pieces: the periods
  // live in src/data/research/statute-of-limitations-<code>.json and the pages compute their
  // headlines from it, so nothing here may carry a figure.
  {
    slug: 'oregon-statute-of-limitations',
    cover: 'deadline',
    kicker: 'Reference',
    title: 'Oregon Statute of Limitations: The Notice, and the Cap on a Child\'s Time',
    summary:
      'Oregon\'s injury deadline is the familiar one. What catches people is beside it: a short ' +
      'notice period against any public body, and a pause for minors that is capped, so a young ' +
      'child\'s claim can end long before adulthood. Every Oregon deadline, read from the ORS.',
    thumb: 't3',
    icon: 'doc',
    meta: 'A child does not get until 18',
  },
  {
    slug: 'florida-statute-of-limitations',
    cover: 'deadline',
    kicker: 'Reference',
    title: 'Florida Statute of Limitations: The Deadline That Was Cut in Half',
    summary:
      'Florida moved negligence claims onto a much shorter clock in 2023, and plenty of what is ' +
      'published about the state still gives the old figure. Every Florida deadline by type of ' +
      'claim, read from the statute, with the transition rule and the narrow ways the clock stops.',
    thumb: 't2',
    icon: 'doc',
    meta: 'Half the time it used to be',
  },
  {
    slug: 'texas-statute-of-limitations',
    cover: 'deadline',
    kicker: 'Reference',
    title: 'Texas Statute of Limitations: The Rule and the Exceptions That Bite',
    summary:
      'Everybody knows the Texas injury deadline. The ones that end cases early are the short ' +
      'periods beside it: the notice against a city, the year for defamation, and a malpractice ' +
      'rule that ignores the usual protection for children. Every one, with its statute.',
    thumb: 't3',
    icon: 'doc',
    meta: 'The short deadlines are the dangerous ones',
  },
  {
    slug: 'new-york-statute-of-limitations',
    cover: 'deadline',
    kicker: 'Reference',
    title: 'New York Statute of Limitations: The Years, and the Days That Matter More',
    summary:
      'A New York injury claim has years. A claim against the City, the MTA or a public hospital ' +
      'has days before the first deadline, and that notice ends more cases than the statute ' +
      'everyone quotes. Every New York deadline by type of claim, read from the CPLR.',
    thumb: '',
    icon: 'doc',
    meta: 'The notice of claim comes first',
  },
  {
    slug: 'how-to-choose-a-criminal-defense-lawyer',
    cover: 'defense',
    kicker: 'Study',
    title: 'New Study: Most Criminal Defense Firms Publish No Case Results',
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts.
    summary:
      'Every guide to hiring a criminal lawyer tells you to check the track record. We counted ' +
      'whether there is one to check, against the injury firms on the same streets. Most of ' +
      'these firms publish no outcome at all, our own score marks them down for it, and their ' +
      'clients rate them the same.',
    thumb: 't3',
    icon: 'scale',
    meta: 'Nothing to check, and nothing wrong with them',
  },
  {
    slug: 'do-lawyers-offer-free-consultations',
    cover: 'consult',
    kicker: 'Study',
    title: 'New Study: A Free Consultation Depends on the Practice, Not the Lawyer',
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts.
    summary:
      'Nearly every page answering this question was written by a firm that offers one. We ' +
      'read the websites of every firm in this directory instead. Across the whole directory ' +
      'the answer is usually yes, and that is an artefact of which practice most of these ' +
      'firms are in: split by the kind of work, it stops being one habit and becomes two.',
    thumb: 't2',
    icon: 'doc',
    meta: 'A billing convention, not a profession\u2019s habit',
  },
  {
    slug: 'what-search-traffic-says-about-a-law-firm',
    cover: 'signal',
    kicker: 'Study',
    title: 'New Study: Search Visibility Brings More Reviews, Not Better Ones',
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts.
    summary:
      'The most visible firm in a search result is the one that invested most in being found ' +
      'there. We measured the organic search traffic of every firm in this directory against ' +
      'what it publishes and what its clients rated it. Almost everything a firm says about ' +
      'itself rises with visibility. The rating its clients gave it does not move.',
    thumb: 't3',
    icon: 'columns',
    meta: 'More reviews, not better ones',
  },
  {
    slug: 'what-law-firm-websites-publish',
    cover: 'pages',
    kicker: 'Method',
    title: 'New Study: The Last Thing a Law Firm Website Publishes Is Its Price',
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts.
    summary:
      'Every page telling a law firm what belongs on its website is written by somebody who ' +
      'sells websites. We counted what is on the firm websites in this directory instead. A ' +
      'blog is the page a firm reaches for first and a page about fees is the one it reaches ' +
      'for last, and the gap between the two is not close.',
    thumb: 't2',
    icon: 'columns',
    meta: 'A blog comes first, the price comes last',
  },
  {
    slug: 'what-injury-firms-publish-about-fees-by-state',
    cover: 'statutes',
    kicker: 'Costs',
    title: 'New Study: A State’s Fee Rules Do Not Change What Its Firms Publish',
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts, and
    // the page's own headline flips if a firm ever publishes its percentage.
    summary:
      'When this directory covered one state, nobody published the contingency percentage and ' +
      'the obvious reading was that the state already fixed it. There are enough states now to ' +
      'test that, and the test comes out the other way: the rules differ, and what firms ' +
      'disclose does not.',
    thumb: 't2',
    icon: 'doc',
    meta: 'The rules change by state and the silence does not',
  },
  {
    slug: 'are-google-reviews-reliable',
    cover: 'sample',
    kicker: 'Method',
    title: 'New Study: The Reviews Google Shows Are Not the Reviews It Counted',
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts.
    summary:
      'Google counts every review on a law firm’s profile and hands back five per listing. ' +
      'We compared the two across the whole directory. Pooled, the two agree almost exactly, ' +
      'so nobody is being flattered on average. Firm by firm is another matter, and that is ' +
      'the situation every client is actually in.',
    thumb: 't3',
    icon: 'star',
    meta: 'The reviews shown are not the reviews counted',
  },
  {
    slug: 'what-law-firms-publish-in-spanish',
    cover: 'language',
    kicker: 'Data',
    title: 'New Study: Law Firms Publish in Spanish for Injury Work, Not Divorce',
    // Nothing in this file is computed, so nothing here may carry a figure. The page counts.
    summary:
      'We read every firm\u2019s website looking for a page published in Spanish. Two things ' +
      'decide whether one is there, the market and the kind of case, and the practice where a ' +
      'client and a lawyer have to talk most is the one that advertises a second language ' +
      'least.',
    thumb: 't2',
    icon: 'doc',
    meta: 'The practice that talks most advertises least',
  },
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
