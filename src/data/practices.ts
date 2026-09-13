/**
 * Editorial notes for a practice area, kept apart from the page that renders them.
 *
 * The same lesson the cities learned. /practice-areas/personal-injury/ was a hand-written page,
 * and the practice itself was hardcoded in four more places: the profile builder, the city page's
 * icon map, the city × practice route guard and the footer. Opening a second area meant either
 * copying all of that or making the set of practices a thing the code reads. This is that thing.
 *
 * What lives here is only what cannot be derived. The firm counts, the certified counts, the
 * cities, the ranked lists and the "updated" date all come off the collection, and a practice
 * added to this file with no firms behind it renders no page at all: `getStaticPaths` builds
 * from the firms, not from these keys. So this file cannot invent an area, only describe one.
 *
 * A word on the legal detail below. Every deadline, statute and fee rule is New York's unless it
 * says otherwise, because New York is where these firms are. Where a rule is federal or general
 * the sentence says so. Nothing here is advice, and the pages say that too.
 */

export interface PracticeNotes {
  /** As it appears in headings and breadcrumbs. */
  name: string;
  /** For the hero fact grid, where "Certified personal injury firms" will not fit. */
  abbr: string;
  icon: string;
  title: string;
  description: string;
  /** The hero paragraph. The page appends the sentence about which cities are covered. */
  lede: string;
  /** Scope of the area, shown as chips. None is a link: they describe, they do not navigate. */
  subtopics: string[];
  /** What the fee share measures in this area, which is not the same sentence in each. */
  feeFactLabel: string;
  guide: {
    heading: string;
    intro: string;
    sections: { heading: string; paragraphs: string[] }[];
    callout?: { title: string; text: string };
  };
  faq: { q: string; a: string }[];
  /** Guides we intend to write. Rendered unlinked, as a roadmap rather than as navigation. */
  plannedGuides: string[];
}

/**
 * Asked of every practice area, and answered the same way in each, so a correction to how
 * certification works is made once rather than in as many places as there are areas.
 */
export const SHARED_FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I know if a firm is "certified"?',
    a: 'Certification requires clearing five eligibility gates: active licensure, clean public ' +
       'discipline, a verified entity and physical office, an honest website baseline and a ' +
       'minimum public footprint. Then scoring 70 or above out of 100 across five pillars, with ' +
       'a floor on the three that cover professional standing, verified results and client ' +
       'experience. <a href="/methodology/">The methodology</a> gives every gate and sub-factor. ' +
       'A firm that has not cleared all five is shown as <b>under review</b>, not as failed, and ' +
       'its profile says which gate is still open.',
  },
  {
    q: 'Can law firms pay to rank higher on this page?',
    a: 'No. The order comes from the Certification Score, and the score, the eligibility gates ' +
       'and the tier cannot be bought or edited, not even by a firm that manages its own ' +
       'profile. Claiming a profile is free and lets a firm keep its offices, fees and practice ' +
       'areas current. Sponsored placements are always labeled and never appear inside this list.',
  },
];

export const PRACTICES: Record<string, PracticeNotes> = {
  'personal-injury': {
    name: 'Personal Injury',
    abbr: 'PI',
    icon: 'car',
    title: 'Personal Injury Law Firms: Rankings and Hiring Guide',
    description:
      'How to choose a personal injury law firm: trial record, case focus, contingency fees and ' +
      'what to ask on the free consultation. Plus our city rankings.',
    lede:
      'Personal injury firms handling car accidents, slip and fall, medical malpractice, ' +
      'construction injuries and wrongful death. Every firm is checked for active licensure, ' +
      'clean disciplinary history and verified case results. Rankings are published per city, ' +
      'because a firm is worth comparing against the firms someone could actually hire instead ' +
      'of it.',
    subtopics: ['Car accidents', 'Truck accidents', 'Slip & fall', 'Medical malpractice',
                'Construction injuries', 'Wrongful death', 'Product liability'],
    feeFactLabel: 'Work on contingency',
    guide: {
      heading: 'How to choose a personal injury law firm',
      intro:
        'Personal injury is one of the few areas of law where the firm you choose can change the ' +
        'outcome by hundreds of thousands of dollars. Insurance carriers track which firms ' +
        'actually try cases, and they make higher offers to the ones that do. When comparing ' +
        'firms on this page, weigh the following.',
      sections: [
        {
          heading: 'A trial record, not just a settlement history',
          paragraphs: [
            'Most injury cases settle, but the firms that settle for the most are the ones ' +
            'prepared to go to verdict. Look for recent jury verdicts in your county, not just ' +
            'cumulative "recovered" totals.',
          ],
        },
        {
          heading: 'Focus on your type of injury',
          paragraphs: [
            'A firm that handles hundreds of rear-end collisions may not be the right choice for ' +
            'a birth-injury or trucking case, which require specialized experts and much larger ' +
            'case budgets. Our tags show each firm\'s verified focus areas.',
          ],
        },
        {
          heading: 'Direct access to a senior attorney',
          paragraphs: [
            'Ask who will actually handle your case. In high-volume firms, it may be a case ' +
            'manager. The firms ranked highest here commit to a named attorney returning calls ' +
            'within one business day.',
          ],
        },
        {
          heading: 'Contingency fees, and what they leave out',
          paragraphs: [
            'New York regulates contingency fees in injury matters, and one third of the ' +
            'recovery is the ordinary arrangement, with a statutory sliding scale in medical ' +
            'malpractice. We can tell you that much from the rules, though not from the firms, ' +
            'because <a href="/guides/what-new-york-injury-firms-publish-about-fees/">none of ' +
            'the firms in this directory publishes its percentage</a>. Nor does any of them say ' +
            'whether case expenses come out before or after the fee is calculated, which is ' +
            'worth five figures on a mid-size settlement. Ask both questions on the free call.',
          ],
        },
      ],
      callout: {
        title: 'Deadline warning.',
        text: 'Statutes of limitations for injury claims range from one year (Tennessee, ' +
              'Louisiana) to six (Maine). Claims against government entities often require a ' +
              'notice within 90 days. Consult a firm as early as possible.',
      },
    },
    faq: [
      {
        q: 'How much does a personal injury lawyer cost?',
        a: 'Personal injury work is done on contingency: you pay nothing up front, and the fee ' +
           'is a share of the recovery. In New York one third is the ordinary share, and medical ' +
           'malpractice follows a statutory sliding scale. We report what firms publish rather ' +
           'than what they charge, and no firm here publishes its percentage. So ask, and ask ' +
           'whether case expenses come out before or after the fee is worked out.',
      },
      {
        q: 'What is my personal injury case worth?',
        a: 'It depends on medical costs, lost income, the severity and permanence of your ' +
           'injuries, and the insurance coverage available. Most firms listed here offer a free ' +
           'case evaluation that will give you a realistic range within a few days.',
      },
      {
        q: 'How long do I have to file a personal injury claim?',
        a: 'Statutes of limitations range from one to six years depending on the state and the ' +
           'type of claim. Claims against a city, state or federal agency often have much ' +
           'shorter notice requirements, sometimes as little as 90 days.',
      },
    ],
    plannedGuides: ['Best personal injury firms in NYC', 'How contingency fees work',
                    'What is my injury case worth?', 'Statute of limitations by state'],
  },

  'workers-compensation': {
    name: "Workers' Compensation",
    abbr: 'comp',
    icon: 'briefcase',
    title: "Workers' Compensation Law Firms: Rankings and Hiring Guide",
    description:
      "How to choose a workers' compensation firm: what the system pays for, why a judge sets " +
      "the fee, and the second case most people never hear about.",
    lede:
      "Workers' compensation firms handling construction accidents, repetitive strain, " +
      'occupational illness and benefits that were denied or stopped. Every firm is checked for ' +
      'active licensure, clean disciplinary history and verified case results. Rankings are ' +
      'published per city, because a firm is worth comparing against the firms someone could ' +
      'actually hire instead of it.',
    subtopics: ['Construction accidents', 'Repetitive strain', 'Occupational illness',
                'Back and neck injuries', 'Denied or stopped benefits', 'Permanent disability',
                'Third-party claims', 'Section 32 settlements'],
    feeFactLabel: 'Paid from the award',
    guide: {
      heading: "How to choose a workers' compensation law firm",
      intro:
        'A workers\' compensation claim is not a lawsuit, and comparing these firms the way you ' +
        'would compare injury firms will point you at the wrong things. Nobody has to prove the ' +
        'employer was at fault, and in exchange you ordinarily cannot sue the employer at all. ' +
        'What the system pays for is medical treatment and a share of lost wages. It does not ' +
        'pay for pain and suffering, however badly you were hurt. Four things are worth weighing ' +
        'instead, and the first is the one most people expect to matter and does not.',
      sections: [
        {
          heading: 'The fee is approved by a judge, not negotiated with you',
          paragraphs: [
            'In New York no fee in a compensation case is enforceable unless the Workers\' ' +
            'Compensation Board approves it, under section 24 of the Workers\' Compensation Law. ' +
            'It comes out of the award rather than out of your pocket, the carrier pays it ' +
            'directly to the attorney, and anything above one thousand dollars needs a written ' +
            'application on the Board\'s own form. A firm that quotes you a percentage is ' +
            'describing a decision that is not its to make.',
            'That removes price from the comparison almost entirely, which is why the rest of ' +
            'this page is about hearings, communication and whether the firm sees the second ' +
            'case described below.',
          ],
        },
        {
          heading: 'Ask whether they bring the third-party case',
          paragraphs: [
            'Compensation pays medical bills and part of your wages. Where somebody other than ' +
            'your employer contributed to the accident, a driver, a property owner, a general ' +
            'contractor, the maker of a machine that had no guard on it, a separate negligence ' +
            'action can be brought against them, and that one does pay for pain and suffering. ' +
            'On a New York construction site sections 240 and 241 of the Labor Law put specific ' +
            'duties on owners and contractors, which is why falls from height and scaffold ' +
            'collapses are so often two cases rather than one.',
            'Not every compensation practice brings those, and not every injury practice handles ' +
            'the compensation claim alongside them. Ask directly which of the two the firm does, ' +
            'and who handles the other if it does not.',
          ],
        },
        {
          heading: 'Your doctor, their doctor, and the hearing',
          paragraphs: [
            'You choose who treats you, but only from providers the Board has authorised to ' +
            'treat injured workers, with emergencies the exception. The insurer is entitled to ' +
            'send you for an examination of its own, and a report from that examination is the ' +
            'ordinary reason benefits are reduced or stopped. What happens next is a hearing ' +
            'before a law judge, so a firm\'s real skill in this area is how it handles medical ' +
            'evidence and how often it is in that room. Ask.',
          ],
        },
        {
          heading: 'Being fired for filing is a separate claim',
          paragraphs: [
            'Section 120 makes it unlawful for an employer to fire you, refuse to reinstate you ' +
            'or otherwise discriminate against you because you claimed compensation or testified ' +
            'in someone else\'s case. It is filed separately, on form DC-120, within two years, ' +
            'and the Board can order your job back with the pay you lost. It is worth knowing ' +
            'this exists before you decide whether to file at all.',
          ],
        },
      ],
      callout: {
        title: 'Two deadlines, and the first is short.',
        text: 'In New York, tell your employer in writing within 30 days of the accident, and ' +
              'file form C-3 with the Board within two years. For an illness caused by the work ' +
              'itself, the two years run from when you knew, or should have known, that the work ' +
              'caused it.',
      },
    },
    faq: [
      {
        q: "How much does a workers' compensation lawyer cost?",
        a: 'Nothing up front, and not out of your own money. In New York the fee comes out of ' +
           'the award, the insurance carrier pays it directly to the attorney, and the Workers\' ' +
           'Compensation Board has to approve it before it is enforceable at all. If there is no ' +
           'award there is ordinarily no fee. You can read the rule yourself at ' +
           '<a href="https://www.wcb.ny.gov/" rel="nofollow noopener" target="_blank">wcb.ny.gov' +
           '</a>.',
      },
      {
        q: 'Can I sue my employer for my injury?',
        a: 'Ordinarily no, and that is the bargain the system is built on: you do not have to ' +
           'prove your employer did anything wrong, and in exchange compensation is your only ' +
           'claim against them. Anyone else who contributed is a different matter. A negligent ' +
           'driver, a property owner or the manufacturer of the equipment can be sued in the ' +
           'ordinary way, and that case can include the pain and suffering compensation leaves out.',
      },
      {
        q: 'Does it matter that the accident was my own fault?',
        a: 'Generally not. Compensation is a no-fault system, so carelessness on your part does ' +
           'not bar the claim the way it can bar an injury lawsuit. The narrow exceptions in New ' +
           'York are an injury caused solely by intoxication and one you inflicted on yourself ' +
           'deliberately.',
      },
      {
        q: 'How long do I have to file?',
        a: 'In New York, notice to your employer within 30 days of the accident, in writing, and ' +
           'form C-3 filed with the Board within two years. An occupational illness runs from ' +
           'when you knew or should have known the work caused it. Other states set their own ' +
           'periods, and several are shorter than this.',
      },
      {
        q: 'Can I be fired for filing a claim?',
        a: 'Not lawfully. Section 120 of the Workers\' Compensation Law covers being discharged, ' +
           'not reinstated or otherwise discriminated against for claiming, for asking for a ' +
           'claim form, or for testifying. The complaint goes to the Board on form DC-120 within ' +
           'two years of what happened, and the Board can order reinstatement and the pay you ' +
           'lost, plus a penalty on the employer.',
      },
      {
        q: 'Do I have to see the insurance company\'s doctor?',
        a: 'You can be required to attend an examination the carrier arranges, yes. It is not ' +
           'the same thing as treatment, and it is not your doctor: the report from it is the ' +
           'usual basis for an insurer arguing that your benefits should be reduced or stopped. ' +
           'Your own treatment stays with a provider you choose, from those the Board authorises.',
      },
    ],
    plannedGuides: ["What workers' comp actually pays", 'Section 32 settlements explained',
                    'The third-party case after a construction injury',
                    'When benefits stop: the IME report'],
  },
};

/** Slugs with a hub page, in the order the site lists them. */
export const PRACTICE_SLUGS = Object.keys(PRACTICES);

export const hasPractice = (slug: string): boolean => slug in PRACTICES;
