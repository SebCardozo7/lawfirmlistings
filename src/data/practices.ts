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
  /**
   * What counts as the fee arrangement worth counting, as a regular expression over the firm's
   * published fee model. Injury work is contingent and transactional work is not, so counting
   * contingency in a real estate ranking would report zero for every firm and mean nothing.
   * Defaults to contingency, which is what the injury practices want.
   */
  feePattern?: string;
  guide: {
    heading: string;
    intro: string;
    /** A section may end in a checklist. The questions to ask a firm are a list of
     *  questions, and running them together as prose helps nobody read them. */
    sections: { heading: string; paragraphs: string[]; list?: string[] }[];
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

  // The first practice here that is not an injury, and it changes what the score can honestly
  // measure. Pillar B reads published settlements and verdicts, and a firm that closes property
  // transactions has none: not because it is worse but because the work has no verdicts. Scoring
  // that zero would publish our own inability as a finding about the firm, which is the mistake
  // the gates have already had to unlearn twice. scripts/score.py scores pillar B for this
  // practice on what the firm publishes about the deal instead.
  //
  // Title and escrow live inside this practice rather than beside it. Somebody buying a house
  // searches for a real estate attorney; the title work is how the job gets done, the same way a
  // car accident page lives inside personal injury.
  // The first practice here where the price cannot be contingent, by rule of the court rather
  // than by custom. That one fact reorganises the whole comparison: there are no settlements to
  // weigh, the biggest number in the case is set by a statutory formula, and what a client can
  // actually shop for is the hourly rate and the retainer.
  'family-law': {
    name: 'Family Law',
    abbr: 'family law',
    icon: 'heart',
    title: 'Family Law Firms: Rankings and Hiring Guide',
    description:
      'How to choose a divorce or custody lawyer: why the fee can never be contingent, ' +
      'what the retainer must tell you, and which number is set by formula.',
    lede:
      'Family law firms handling divorce, custody and parenting time, child support and ' +
      'spousal maintenance, prenuptial agreements and orders of protection. Every firm is ' +
      'checked for active licensure, a clean disciplinary record and a registered entity, and ' +
      'ranked on what it publishes about the cost and the process rather than on outcomes that ' +
      'belong to somebody\'s children.',
    subtopics: ['Divorce, contested and uncontested', 'Child custody and parenting time',
                'Child support', 'Spousal maintenance', 'Equitable distribution',
                'Prenuptial and postnuptial agreements', 'Separation agreements',
                'Orders of protection', 'Modification and enforcement', 'Paternity',
                'Divorce mediation and collaborative divorce'],
    feeFactLabel: 'Publish an hourly rate',
    feePattern: 'hourly',
    guide: {
      heading: 'How to choose a family law firm',
      intro:
        'Every other practice in this directory can be compared on outcomes. This one cannot, ' +
        'and not because the data is missing. A custody file is about somebody\'s children, a ' +
        'divorce judgment divides two people\'s property, and the one number everybody wants ' +
        'to know is set by a formula that no lawyer can argue down. What is left to compare is ' +
        'narrower, harder to find and far more useful: what the firm charges, what it will tell ' +
        'you before you hire it, and which of the several ways through this it actually does.',
      sections: [
        {
          heading: 'The fee cannot be contingent, so nobody here says "no fee unless we win"',
          paragraphs: [
            'Two hundred and fifty firms in this directory make some version of that promise. ' +
            'A matrimonial firm in New York cannot. Rule 1.5(d)(5)(i) of the Rules of ' +
            'Professional Conduct forbids any fee in a domestic relations matter where "the ' +
            'payment or amount of the fee is contingent upon the securing of a divorce or of ' +
            'obtaining child custody or visitation or is in any way determined by reference to ' +
            'the amount of maintenance, support, equitable distribution, or property ' +
            'settlement". A firm advertising a contingency here would be advertising something ' +
            'the rule prohibits.',
            'What you pay instead is an hourly rate drawn against a retainer paid in advance. ' +
            'That makes the rate and the retainer the only prices there are, which is why this ' +
            'ranking counts whether a firm publishes them.',
          ],
        },
        {
          heading: 'The court already guarantees you the price, at the moment you hire',
          paragraphs: [
            'Part 1400 of the court rules applies to every attorney taking a divorce, ' +
            'separation, custody, support or maintenance matter. Section 1400.3 requires a ' +
            'written agreement, signed by both of you before the work starts, and it has to set ' +
            'out the amount of the advance retainer and what it covers, the hourly rate of each ' +
            'person whose time may be charged to you, how the fee is determined if you ' +
            'discharge the firm, and the frequency of itemized billing, "which shall be at ' +
            'least every 60 days". Section 1400.2 adds the statement of client\'s rights: you ' +
            'are entitled to understand the rates and the retainer before you sign, an ' +
            'attorney "may not request a retainer fee that is non-refundable", the unused ' +
            'balance comes back to you, and a fee dispute between one and fifty thousand ' +
            'dollars can go to arbitration under Part 137.',
            'So the law already makes sure you learn the price. It makes sure of it in the room ' +
            'where you are signing, after you have chosen. Nothing requires a firm to publish ' +
            'any of it beforehand, which is the moment you are comparing three firms and ' +
            'deciding which one to call. That gap is what pillar B measures in this practice: ' +
            'not results, but whether the firm will tell you the rate, the retainer or a flat ' +
            'fee for an uncontested case while you are still a stranger reading its website.',
          ],
        },
        {
          heading: 'Child support is arithmetic, and the arithmetic is published',
          paragraphs: [
            'Section 413 of the Family Court Act sets the basic obligation as a share of ' +
            'combined parental income: seventeen percent for one child, twenty-five for two, ' +
            'twenty-nine for three, thirty-one for four and no less than thirty-five percent ' +
            'for five or more. The percentage applies up to a cap the state adjusts every two ' +
            'years, published at $193,000 in the March 2026 chart, and a court may apply it to ' +
            'income above that or not. A firm cannot win you a better percentage; the fight, ' +
            'where there is one, is about what counts as income and what happens above the cap.',
            'Maintenance works the same way, on its own statutory formula with its own cap. ' +
            'Between them, they take the two largest numbers in most divorces out of the ' +
            'category of things a lawyer can promise you, which is worth knowing before you ' +
            'read anybody\'s marketing.',
          ],
        },
        {
          heading: 'Fault stopped being the argument in 2010',
          paragraphs: [
            'Since section 170(7) of the Domestic Relations Law took effect, one spouse stating ' +
            'under oath that "the relationship between husband and wife has broken down ' +
            'irretrievably for a period of at least six months" is a ground for divorce on its ' +
            'own. No cruelty to prove, no abandonment, no consent required from the other side.',
            'The same subdivision carries the condition that matters to how long your case ' +
            'takes: no judgment is granted until the economics and the arrangements for the ' +
            'children are settled, by agreement or by the court. The divorce is not what takes ' +
            'a year. Property, support and custody are.',
          ],
        },
        {
          heading: 'Why this ranking publishes no case results',
          paragraphs: [
            'In every other practice here, pillar B reads the firm\'s own results page and ' +
            'counts what it publishes. In this one there is nothing we would want a firm to ' +
            'publish. Custody proceedings concern children, matrimonial files are routinely ' +
            'sealed, and a firm advertising the custody arrangement it obtained is advertising ' +
            'a real family\'s private arrangement as a sales aid.',
            'So the pillar asks different questions in this practice, and a firm that publishes ' +
            'no results is not marked down for it. What it is marked on is the cost, the ' +
            'process and the paths: whether it explains what actually happens between filing ' +
            'and judgment, and whether it says which of mediation, collaborative divorce and ' +
            'litigation it does.',
          ],
        },
        {
          heading: 'What to ask before you pay a retainer',
          paragraphs: [
            'The retainer agreement is going to answer all of this in writing, because the rule ' +
            'requires it. Asking first tells you what the answers are while you can still walk ' +
            'to the next firm on the list.',
          ],
          list: [
            'What is the retainer, and what does it cover.',
            'What is the hourly rate of everybody whose time can be billed to me, including ' +
            'the paralegal.',
            'How often will I get an itemized bill.',
            'What happens to the part of the retainer you do not use.',
            'Is any part of my case something you would send to mediation instead.',
            'Who will actually be at the courthouse, you or somebody I have not met.',
          ],
        },
      ],
    },
    faq: [
        {
          q: 'Can a divorce lawyer work on contingency?',
          a: 'Not in New York. Rule 1.5(d)(5)(i) prohibits a fee in a domestic relations ' +
             'matter that is contingent on securing a divorce or custody, or determined by ' +
             'reference to the maintenance, support, equitable distribution or property ' +
             'settlement. Expect an hourly rate against a retainer paid in advance.',
        },
        {
          q: 'Is a non-refundable retainer allowed?',
          a: 'No. The statement of client\'s rights in section 1400.2 of the court rules says ' +
             'an attorney "may not request a retainer fee that is non-refundable", and the ' +
             'unused balance is yours. A firm that describes its retainer as non-refundable is ' +
             'describing something the rules do not permit.',
        },
        {
          q: 'How long does a divorce take in New York?',
          a: 'The ground is the fast part: six months of irretrievable breakdown, stated under ' +
             'oath by one spouse. Section 170(7) then bars the judgment until property, ' +
             'support and the arrangements for any children are resolved, which is where the ' +
             'time goes. An uncontested case with an agreement already signed is measured in ' +
             'months; a contested custody case is measured in years.',
        },
        {
          q: 'Will the firm publish its hourly rate?',
          a: 'Most do not. The rule guarantees you the rate in a signed agreement before the ' +
             'work starts, and nothing requires publishing it beforehand, so the firms that do ' +
             'are unusual and are marked here.',
        },
      ],
    plannedGuides: ['What a divorce lawyer costs in New York City, firm by firm',
                    'Reading a matrimonial retainer agreement',
                    'The income cap and what courts do above it',
                    'Mediation, collaborative divorce and litigation compared'],
  },

  'criminal-defense': {
    name: 'Criminal Defense',
    abbr: 'criminal defense',
    icon: 'gavel',
    title: 'Criminal Defense Law Firms: Rankings and Hiring Guide',
    description:
      'How to choose a criminal defense firm: why nobody may charge you a contingency fee, '
      + 'what to ask about who actually appears, and what a disposition is not.',
    lede:
      'Criminal defense firms handling arrests and charges in state and federal court, from '
      + 'driving offenses and drug charges to white-collar investigations and appeals. Every '
      + 'firm is checked for a registered entity, a confirmed office and a clean disciplinary '
      + 'record, and ranked on what it publishes rather than on outcomes nobody can verify.',
    subtopics: ['DUI and DWI', 'Drug charges', 'Assault', 'Theft and larceny',
                'Weapons charges', 'White-collar and fraud', 'Federal charges',
                'Sex offenses', 'Appeals and post-conviction', 'Record sealing'],
    feeFactLabel: 'Publish a flat fee',
    feePattern: 'flat fee',
    guide: {
      heading: 'How to choose a criminal defense firm',
      intro:
        'Every other area in this directory is chosen at leisure. This one is usually chosen '
        + 'within a day of an arrest, by somebody who has never needed a lawyer before, from a '
        + 'list of search results. The three things below are the ones most likely to be '
        + 'misunderstood in that first day, and the first of them changes what every fee page '
        + 'you are about to read can legally say.',
      sections: [
        {
          heading: 'Nobody may charge you a contingency fee for a criminal case',
          paragraphs: [
            'In injury work the fee is a share of what the case recovers, and a firm that '
            + 'recovers nothing is paid nothing. That arrangement is prohibited in a criminal '
            + 'matter. Rule 1.5(d) of the rules of professional conduct, adopted in '
            + 'substantially this form in every state, forbids a lawyer from entering into a '
            + 'fee contingent on the outcome of a criminal case. There is no "no fee unless we '
            + 'win" here, and a firm offering one is offering something it is not allowed to.',
            'So the fee is a flat fee, an hourly rate, or a flat fee per stage: one amount '
            + 'through arraignment and pretrial, another if the case goes to trial. That second '
            + 'structure is the one that surprises people, because the number quoted on the '
            + 'phone is often the first stage only. Ask what the quoted figure covers, what '
            + 'happens to it if the case resolves early, and what the trial fee would be.',
            'This is also why the fee column on these rankings reads differently from the '
            + 'injury ones. We count firms that publish a flat fee, and most publish no figure '
            + 'at all. An absence is recorded as an absence rather than filled in.',
          ],
          list: [
            'What does the quoted fee cover, and where does it stop?',
            'Is there a separate trial fee, and how much is it?',
            'Are investigators, experts and transcripts inside the fee or billed on top?',
            'What happens to the fee if the case is dismissed at the first appearance?',
          ],
        },
        {
          heading: 'Ask who will stand up at the arraignment, by name',
          paragraphs: [
            'Criminal defense includes some of the highest volume practices in law. A firm '
            + 'whose name is on the door may send a different lawyer to each appearance, and in '
            + 'a high volume practice that is not necessarily bad: the lawyer who is in that '
            + 'courthouse every week knows the judge and the assistant district attorney in a '
            + 'way the named partner may not. What is bad is not being told.',
            'The roster on each profile here is the firm’s own published list of attorneys, '
            + 'read from its site, and where the state publishes a register we check each name '
            + 'against it and say how many matched. That tells you how many lawyers the firm '
            + 'has. It cannot tell you which of them is assigned to you, and that is the '
            + 'question to ask before you pay anything.',
          ],
        },
        {
          heading: 'A public defender is not a worse lawyer, and a disposition is not an acquittal',
          paragraphs: [
            'Two things a directory with an incentive to sell you a private lawyer would not '
            + 'say. The first: public defenders are specialists who do this work and nothing '
            + 'else, in the courthouse they appear in daily, and in many places they are the '
            + 'most experienced trial lawyers in the room. The real difference is caseload, not '
            + 'ability. If you are assigned one, the question is how much time your case will '
            + 'get, not whether the lawyer is any good.',
            'The second: most criminal cases end without a trial, so "results" in this area '
            + 'mostly means dispositions. A charge reduced, a case adjourned in contemplation of '
            + 'dismissal, a plea to a violation rather than a crime, a record sealed afterwards. '
            + 'Those are real outcomes and they are worth asking about, and none of them is an '
            + 'acquittal. Where a firm publishes case results on its own site we count them and '
            + 'say on the profile that the figures are the firm’s and that we did not confirm '
            + 'them. In this practice that caveat does more work than in any other.',
          ],
        },
      ],
      callout: {
        title: 'Before the first appearance',
        text: 'Whoever represents you, the two things to establish on day one are what you are '
            + 'actually charged with, by statute and degree, and whether anything you say to '
            + 'anyone other than your lawyer can be used. Everything else can wait a day. That '
            + 'cannot.',
      },
    },
    faq: [
      {
        q: 'Can a criminal defense lawyer take my case on a no win, no fee basis?',
        a: 'No. Rule 1.5(d) of the rules of professional conduct prohibits a fee contingent on '
           + 'the outcome of a criminal case, and it is adopted in substantially that form '
           + 'everywhere in the United States. A firm advertising "no fee unless we win" for a '
           + 'criminal matter is advertising an arrangement it may not enter into. Expect a '
           + 'flat fee, an hourly rate, or a flat fee per stage of the case.',
      },
      {
        q: 'Why do so few firms here publish what they charge?',
        a: 'Because most do not, and we record that rather than estimating it. A criminal fee '
           + 'depends on the charge, the court and whether the case is likely to be tried, which '
           + 'is a real reason not to print a number. It is still worth asking for the figure in '
           + 'writing before you pay, together with what it covers and where it stops. The fee '
           + 'row on each profile says exactly what we were able to read on that firm’s own '
           + 'pages, and says so when the answer was nothing.',
      },
      {
        q: 'Does it matter that the firm is in my city?',
        a: 'More here than almost anywhere else in this directory. Criminal practice is '
           + 'courthouse practice: the assistant district attorneys, the judges, the local '
           + 'diversion programmes and what a particular bench will accept on a plea are all '
           + 'local knowledge, and they change from county to county inside one state. Rankings '
           + 'on this site are built city by city for that reason. Ask how often the firm '
           + 'appears in the specific court where your case is listed.',
      },
      {
        q: 'What does Law Firm Listings actually check in this practice area?',
        a: 'The same things it checks everywhere, and the profile says which of them the state '
           + 'allowed. Every named attorney is matched against the state attorney register where '
           + 'one is published and queryable, and checked for an adverse disciplinary status. '
           + 'The entity is looked up on the state business register where one exists. Reviews '
           + 'come from Google Business Profiles and are weighted against the firm’s own market. '
           + 'What we do not check is whether a published case result is accurate, because the '
           + 'figures are the firm’s. Every row names its source and its date.',
      },
    ],
    plannedGuides: [
      'What happens at an arraignment, step by step',
      'DWI in New York: the criminal case and the DMV case are two cases',
      'Sealing a conviction: who qualifies and what it does not erase',
      'What a desk appearance ticket is, and why it is not a dismissal',
    ],
  },
  immigration: {
    name: 'Immigration',
    abbr: 'immigration',
    icon: 'globe',
    title: 'Immigration Law Firms: Rankings and Hiring Guide',
    description:
      'How to choose an immigration law firm: why the state on the licence matters least '
      + 'here, what a notario is not, and which fee the quote leaves out.',
    lede:
      'Immigration firms handling family and employment petitions, asylum, removal defense, '
      + 'naturalization and waivers. Every firm is checked for a registered entity, a confirmed '
      + 'office and a clean disciplinary record, and ranked on what it publishes rather than on '
      + 'outcomes nobody can verify.',
    subtopics: ['Family petitions', 'Employment visas', 'Green cards and adjustment',
                'Naturalization', 'Asylum', 'Removal defense', 'DACA and TPS',
                'Waivers', 'Consular processing', 'U visas and VAWA'],
    feeFactLabel: 'Publish a flat fee',
    feePattern: 'flat fee',
    guide: {
      heading: 'How to choose an immigration law firm',
      intro:
        'Two things make this different from every other area in this directory. The lawyer does '
        + 'not have to be licensed in your state, which changes what "local" is worth. And this '
        + 'is the one area where the person who takes your money may not be a lawyer at all.',
      sections: [
        {
          heading: 'A notario is not a lawyer, and that is not a translation problem',
          paragraphs: [
            'In most of Latin America a <i>notario público</i> is a senior legal professional '
            + 'with authority the job simply does not carry in the United States. Here a notary '
            + 'public witnesses signatures. The two words look identical and the roles are not '
            + 'related.',
            'Immigration is the area where that gap does the most damage, because the filings '
            + 'look like paperwork. Someone who is not a lawyer can fill in a form, charge for '
            + 'it, get it wrong, and the consequence lands on the applicant years later as a '
            + 'denial or a removal order rather than on the person who took the fee.',
            'Only two kinds of people may represent you before the immigration agencies: a '
            + 'lawyer in good standing with a state bar, and a representative accredited by the '
            + 'Department of Justice working for a recognised organisation. Everyone else may '
            + 'type. Ask which of the two you are speaking to and ask it plainly.',
          ],
          checklist: [
            'Ask for the bar number and the state, then check it on that state bar’s own site.',
            'If the answer is "accredited representative", ask which recognised organisation '
            + 'accredits them, and confirm it on the Department of Justice list.',
            'A business that advertises as a notario, a <i>consultor de inmigración</i> or a '
            + 'typing service and offers advice on which form to file is doing something it may '
            + 'not do.',
          ],
        },
        {
          heading: 'The state on the licence matters less here than anywhere else',
          paragraphs: [
            'Immigration is federal. A lawyer admitted in any single state and in good standing '
            + 'may represent you before the immigration agencies and the immigration courts '
            + 'anywhere in the country.',
            'So a firm three time zones away is not the compromise it would be in an injury case '
            + 'or a divorce, and the directory’s market pages matter less in this area than '
            + 'in any other we publish.',
            'What does stay local is the immigration court. If your case is in removal '
            + 'proceedings it is heard in a specific court with its own backlog and its own '
            + 'judges, and a firm that appears there constantly knows things about it that do '
            + 'not appear in any filing.',
          ],
        },
        {
          heading: 'The quote and the cost are two different numbers',
          paragraphs: [
            'Most immigration work is quoted as a flat fee per petition, which is genuinely '
            + 'easier to compare than an hourly rate. The catch is what the flat fee covers.',
            'Government filing fees are paid to the agency and are separate from anything the '
            + 'firm charges. A family petition and the adjustment application behind it carry '
            + 'their own fees, and on a household filing for several people the government side '
            + 'alone runs into thousands.',
            '<b>The question that separates two quotes is not the number, it is the scope.</b> '
            + 'A case that starts as one petition frequently becomes a request for evidence, a '
            + 'waiver, an interview and sometimes an appeal, and each of those is either inside '
            + 'the quoted fee or it is not.',
          ],
          checklist: [
            'Does the flat fee include a response to a request for evidence?',
            'Does it include the interview, and does a lawyer attend it or only prepare you?',
            'Which government filing fees apply, and are they paid by you directly?',
            'If the petition is denied, what is the fee to appeal or to refile?',
          ],
        },
        {
          heading: 'What this directory can and cannot tell you here',
          paragraphs: [
            'We check that the firm is a registered business where the state lets us read one, '
            + 'that its offices exist, that the attorneys it names are real people, and that '
            + 'nobody it names has been disciplined where the state publishes discipline. Those '
            + 'checks are the same in every practice area and they are worth the same here.',
            '<b>We publish no success rates, and you should be careful with anyone who does.</b> '
            + 'Approval depends on the facts of a case, the service centre, the officer and the '
            + 'year, and a percentage without a denominator is a marketing number.',
            'What we can compare is what each firm publishes about itself: whether it names its '
            + 'lawyers, whether it states a fee, whether it publishes in the language its '
            + 'clients read. That last one is not a small thing in this area.',
          ],
        },
      ],
    },
    faq: [
      {
        q: 'Does my immigration lawyer have to be licensed in my state?',
        a: 'No. Immigration is federal, and a lawyer admitted in any one state and in good ' +
           'standing there may represent you before the immigration agencies and the ' +
           'immigration courts anywhere in the country. This is the one area in this directory ' +
           'where the city a firm sits in matters least. What stays local is the immigration ' +
           'court itself, so if your case is in removal proceedings, ask how often the firm ' +
           'appears in the court that will hear it.',
      },
      {
        q: 'Someone offered to do my paperwork for much less. Is that allowed?',
        a: 'It depends entirely on who they are, and this is the area where that question ' +
           'matters most. Only a lawyer in good standing with a state bar, or a representative ' +
           'accredited by the Department of Justice at a recognised organisation, may advise ' +
           'you on an immigration matter or represent you. In much of Latin America a ' +
           '<i>notario público</i> is a senior legal professional; in the United States a ' +
           'notary public is not, and the two roles are unrelated. Ask for a bar number and the ' +
           'state, then check it yourself on that state bar’s own site.',
      },
      {
        q: 'Why does no firm here publish an approval rate?',
        a: 'Because we do not publish one, and you should be careful with anyone who does. ' +
           'Whether a petition is approved turns on the facts, the service centre, the officer ' +
           'and the year, and a percentage with no denominator behind it is a marketing figure ' +
           'rather than a measurement. What this directory compares is what each firm publishes ' +
           'about itself and what a public record can confirm.',
      },
    ],
    plannedGuides: ['What a notario cannot do, and what it costs when they try',
                    'How long each USCIS form is actually taking',
                    'What an immigration court backlog means for your case',
                    'Which firms publish in the language their clients read'],
  },

  'real-estate': {
    name: 'Real Estate',
    abbr: 'real estate',
    icon: 'home',
    title: 'Real Estate Law Firms: Rankings and Hiring Guide',
    description:
      'How to choose a real estate law firm: why the title premium is fixed, which fee ' +
      'varies, and what a closing attorney does that a title company cannot.',
    lede:
      'Real estate firms handling residential and commercial closings, title insurance and ' +
      'escrow, title defects, condominium and association disputes, and land use. Every firm is ' +
      'checked for a registered entity, a confirmed office and a clean disciplinary record, and ' +
      'ranked on what it publishes about the transaction rather than on outcomes it never has.',
    subtopics: ['Residential closings', 'Commercial purchases', 'Title insurance and escrow',
                'Title defects and quiet title', 'Condominium and association law',
                'Land use and zoning', 'Landlord and tenant', 'Construction liens',
                '1031 exchanges'],
    feeFactLabel: 'Publish a flat fee',
    feePattern: 'flat fee',
    guide: {
      heading: 'How to choose a real estate law firm',
      intro:
        'Comparing these firms the way you would compare injury firms will point you at the ' +
        'wrong things. There are no verdicts to weigh, no settlements to add up, and the number ' +
        'most people try to shop on is fixed by the state. What is left is narrower and more ' +
        'useful: what the firm will charge you, what it will do that a title company cannot, ' +
        'and who answers when the closing goes wrong.',
      sections: [
        {
          heading: 'The title premium is the same everywhere, so stop shopping it',
          paragraphs: [
            'Florida is one of a small number of states where the premium for title insurance ' +
            'is set by the state rather than by the company selling it. Section 627.782 of the ' +
            'Florida Statutes requires the Financial Services Commission to adopt a rule ' +
            '"specifying the premium to be charged in this state by title insurers", and every ' +
            'agency charges it. A firm advertising a better price on the policy is either ' +
            'describing something that is not the policy, or describing something it cannot do.',
            'What does vary, and by a lot, is the settlement or closing fee: the charge for ' +
            'handling the file, running the searches, holding the money and clearing the title. ' +
            'That figure is negotiable, it is rarely published, and it is the number to ask for ' +
            'in writing before anybody signs anything. The firms in this directory that publish ' +
            'a flat fee are marked, because publishing it at all is unusual.',
          ],
        },
        {
          heading: 'Why a law firm may not appear in the title agency register',
          paragraphs: [
            'Florida licenses title insurance agencies and publishes the register, and a law ' +
            'firm doing title work often is not in it. That is what the statute intends rather ' +
            'than a gap: section 626.8417(4) exempts "attorneys duly admitted to practice law ' +
            'in this state and in good standing with The Florida Bar" from the licensing and ' +
            'appointment requirements that apply to an agency.',
            'So the register can confirm that a firm holds an agency licence and can never ' +
            'establish that one should, and the numbers bear that out. We read the state’s ' +
            'list of every valid business licence in Florida, 2,643 of them held by title ' +
            'agencies, and not one of the twenty firms ranked here appears in it under its own ' +
            'name. That is the exemption working rather than twenty firms cutting a corner, and ' +
            'it is why the licence is published as a fact where we find one and never scored: a ' +
            'test that separates nobody is not a test.',
          ],
        },
        {
          heading: 'What the closing attorney does that a title company does not',
          paragraphs: [
            'Both can run a title search, issue a commitment, hold the deposit and record the ' +
            'deed. Only one of them can tell you what the contract you signed obliges you to ' +
            'do, negotiate a repair after an inspection, argue about a defect the search turned ' +
            'up, or represent you if the other side walks away. A title company handling a ' +
            'dispute is practising law without a licence, and the moment a file stops being ' +
            'routine is the moment that distinction starts to matter.',
            'It is also why this directory lists law firms and not title companies, even where ' +
            'the title company has more reviews and a nicer office. Several of the highest ' +
            'rated businesses a search for a real estate lawyer returns in these markets are ' +
            'title agencies, and every one of them was left out.',
          ],
        },
        {
          heading: 'What to ask before you engage anybody',
          paragraphs: [
            'Four questions, and the answers are short. What is your fee for this closing, in ' +
            'dollars, in writing. Who holds the escrow, and at which bank. Which underwriter ' +
            'will issue the policy. And who calls me if the survey, the lien search or the ' +
            'association estoppel comes back wrong, which is the question that separates a firm ' +
            'from a file number.',
          ],
        },
      ],
      callout: {
        title: 'No ranking here is about outcomes.',
        text: 'A transaction that went well produces no verdict and no settlement, so pillar B ' +
              'scores what the firm publishes about the deal instead: its fee terms, its escrow ' +
              'arrangements, the underwriters it works with, and what it tells you about the ' +
              'process. The methodology page sets out the weighting.',
      },
    },
    faq: [
      {
        q: 'Do I need a lawyer to buy a house in Florida?',
        a: 'No. Florida allows a title company to handle a closing, and most closings are done ' +
           'that way. What a lawyer adds is advice about the contract and somebody who can act ' +
           'for you when the transaction stops being routine. Whether that is worth the fee ' +
           'depends on the deal, and nothing on this page is legal advice.',
      },
      {
        q: 'Why is the title insurance quote identical everywhere I ask?',
        a: 'Because it is set by rule under section 627.782 of the Florida Statutes rather than ' +
           'by the agency quoting it. The premium is the same at every firm and every title ' +
           'company in the state for the same policy amount. The closing fee beside it is not, ' +
           'and that is the figure worth comparing.',
      },
      {
        q: 'The firm is not in the state title agency register. Is that a problem?',
        a: 'Ordinarily not, and it is the normal case rather than the exception. Section ' +
           '626.8417(4) exempts attorneys in good standing with The Florida Bar from the agency ' +
           'licensing requirements, and when we read the state register of 2,643 licensed title ' +
           'agencies, none of the firms ranked here was in it. Where a firm does hold a licence ' +
           'we publish the number.',
      },
      {
        q: 'Who pays for the title policy?',
        a: 'It is local custom rather than law, it is not the same in every Florida county, and ' +
           'it is written into the purchase contract, which means it can be negotiated. Ask ' +
           'which way it runs where you are buying before you sign, and ask for the figure ' +
           'rather than for the practice.',
      },
    ],
    plannedGuides: ['What a closing actually costs, firm by firm',
                    'Who pays for title insurance, by county',
                    'The milestone inspection deadline and what it did to condo sales',
                    'Reading a title commitment'],
  },
  'car-accidents': {
    name: 'Car Accidents',
    abbr: 'car',
    icon: 'car',
    title: 'Car Accident Lawyers: Rankings and Hiring Guide',
    description:
      'How to choose a car accident lawyer: what your own insurer owes you, why the first ' +
      'offer arrives before the injury is understood, and the deadline that is not the one ' +
      'everybody quotes.',
    lede:
      'Car accident lawyers handling rear-end and intersection collisions, uninsured and ' +
      'underinsured motorist claims, hit and run, and crashes involving a rideshare or a ' +
      'company vehicle. Every firm is checked for active licensure, clean disciplinary history ' +
      'and verified case results. Rankings are published per city, because a firm is worth ' +
      'comparing against the firms someone could actually hire instead of it.',
    subtopics: ['Rear-end collisions', 'Intersection and left-turn crashes',
                'Uninsured and underinsured motorist', 'Hit and run',
                'Rideshare and delivery drivers', 'Multi-vehicle pileups',
                'Passenger claims', 'Comparative fault disputes'],
    feeFactLabel: 'No fee unless they win',
    guide: {
      heading: 'How to choose a car accident lawyer',
      intro:
        'Almost every firm in this practice area says the same four things on its home page, ' +
        'and none of the four separates a good car accident lawyer from a bad one. What ' +
        'separates them is how they handle three specific moments, and all three happen in the ' +
        'first month, usually before anybody has decided whether to hire a lawyer at all.',
      sections: [
        {
          heading: 'The first offer arrives before anybody knows what is wrong with you',
          paragraphs: [
            'An adjuster can offer to settle within days, and the offer is real money at a ' +
            'moment when the medical picture is not finished. A soft tissue injury that turns ' +
            'into a herniated disc, a concussion that is diagnosed weeks later, a shoulder that ' +
            'needs surgery after physiotherapy fails: none of that is known yet. A settlement ' +
            'signs away the claim for all of it.',
            'What to listen for is not whether a firm will "fight for you". It is whether it ' +
            'will say, in plain terms, that it does not value a case until treatment has ' +
            'plateaued, and what it does for a client who cannot pay rent while waiting.',
          ],
        },
        {
          heading: 'The claim against your own insurer is the one that gets forgotten',
          paragraphs: [
            'When the other driver has no insurance, or has the state minimum against an injury ' +
            'worth many times that, the money comes from the uninsured and underinsured ' +
            'motorist coverage on your own policy. It is a claim against your own insurer, it ' +
            'is governed by the policy rather than by the crash, and it usually has its own ' +
            'notice deadline written into that policy, shorter than the one for suing the ' +
            'driver.',
            'This is the single most common thing a client never hears about, and it is worth ' +
            'asking about by name at the first call. A firm that handles it routinely will tell ' +
            'you what your own declarations page needs to say; one that does not will change ' +
            'the subject back to the other driver.',
          ],
        },
        {
          heading: 'Fault is apportioned, and the share is argued over',
          paragraphs: [
            'Most states reduce what you recover by the share of fault assigned to you, and in ' +
            'several a large enough share bars recovery entirely. That share is not decided by ' +
            'the police report, which is an officer\'s opinion and is often not admissible at ' +
            'trial. It is argued from the physical evidence, the vehicle data recorder, the ' +
            'scene photographs and the witnesses, and most of that evidence degrades or ' +
            'disappears within weeks.',
            'Ask what the firm does in the first fortnight. A specific answer names things: a ' +
            'spoliation letter so the other vehicle is not repaired or scrapped, a request for ' +
            'the event data recorder download, canvassing for cameras on the businesses facing ' +
            'the intersection.',
          ],
          list: [
            'What is your view on settling before treatment has plateaued?',
            'Have you made a claim on a client\'s own underinsured motorist coverage this year?',
            'What do you do in the first two weeks to preserve evidence?',
            'Who handles my file day to day, and will I have their direct line?',
            'If this does not settle, do you try cases yourselves or refer them out?',
          ],
        },
      ],
      callout: {
        title: 'The deadline people quote is usually the wrong one',
        text:
          'The limitation period for suing the driver is the number everybody knows. It is not ' +
          'the only clock. A claim against a city or a transit authority can require formal ' +
          'notice within months rather than years, and an underinsured motorist claim runs on ' +
          'the policy\'s own terms. Each city page here states the deadline that applies where ' +
          'the firms practise.',
      },
    },
    faq: [
      {
        q: 'Do I need a lawyer for a car accident?',
        a: 'Not for every one. Where the damage is to the vehicle alone and nobody was hurt, a ' +
           'firm has little to add and will usually say so. The question changes once there is ' +
           'an injury with ongoing treatment, a dispute about who was at fault, or a driver who ' +
           'is uninsured or underinsured, because each of those turns the claim into an ' +
           'argument rather than a calculation.',
      },
      {
        q: 'What does a car accident lawyer cost?',
        a: 'This work is almost always taken on contingency: the fee is a share of what is ' +
           'recovered and there is nothing to pay if nothing is. What varies, and what is worth ' +
           'asking about in writing, is whether the share rises if the case is filed or tried, ' +
           'and whether case costs are deducted before or after the fee is calculated. The ' +
           'second question changes the number you take home and is rarely volunteered.',
      },
      {
        q: 'How long does a car accident claim take?',
        a: 'The honest answer is that it is paced by the medicine rather than by the lawyer. A ' +
           'claim is not ready to value until treatment has plateaued and the long-term picture ' +
           'is known, which can be months. A firm that promises a figure or a date at the first ' +
           'call is promising something it cannot know.',
      },
      {
        q: 'What if the other driver had no insurance?',
        a: 'Then the claim is usually against your own uninsured or underinsured motorist ' +
           'coverage, which is a different claim with its own notice requirements under your ' +
           'policy rather than under the crash. Ask the firm about it by name on the first call.',
      },
    ],
    plannedGuides: ['What the first offer is worth, by state',
                    'Underinsured motorist claims: the coverage nobody checks',
                    'What a police report can and cannot be used for',
                    'Event data recorders and who owns the download'],
  },
  'truck-accidents': {
    name: 'Truck Accidents',
    abbr: 'truck',
    icon: 'shield',
    title: 'Truck Accident Lawyers: Rankings and Hiring Guide',
    description:
      'How to choose a truck accident lawyer: the federal rules that govern the driver, the ' +
      'evidence that is destroyed on a schedule, and why the defendant is usually a company ' +
      'rather than a person.',
    lede:
      'Truck accident lawyers handling collisions with tractor-trailers, delivery vehicles and ' +
      'commercial fleets, including cases against the carrier, the broker and the shipper. ' +
      'Every firm is checked for active licensure, clean disciplinary history and verified case ' +
      'results. Rankings are published per city, because a firm is worth comparing against the ' +
      'firms someone could actually hire instead of it.',
    subtopics: ['Tractor-trailer collisions', 'Delivery and box trucks', 'Driver fatigue',
                'Improperly secured cargo', 'Negligent hiring and retention',
                'Broker and shipper liability', 'Underride collisions',
                'Fleet and employer claims'],
    feeFactLabel: 'No fee unless they win',
    guide: {
      heading: 'How to choose a truck accident lawyer',
      intro:
        'A truck case is not a bigger car case. It runs on a federal rulebook that does not ' +
        'apply to ordinary drivers, the evidence that decides it is held by the company being ' +
        'sued, and that company is allowed to destroy most of it on a schedule. Those three ' +
        'facts set what to ask about, and none of them is how much the firm has recovered.',
      sections: [
        {
          heading: 'The rulebook is federal, and breaking it is the case',
          paragraphs: [
            'Interstate carriers and their drivers are governed by the Federal Motor Carrier ' +
            'Safety Regulations, which set how long a driver may be at the wheel, what rest is ' +
            'required, how a vehicle must be inspected and maintained, and what the company ' +
            'must do before putting somebody in the cab. A violation of those rules is often ' +
            'the whole liability argument, and it is an argument about the company rather than ' +
            'about the moment of impact.',
            'A firm that does this work talks about hours of service, the driver qualification ' +
            'file and the maintenance records without being prompted. One that does not will ' +
            'describe the crash and stop there.',
          ],
        },
        {
          heading: 'The evidence is on a deletion schedule',
          paragraphs: [
            'Electronic logging records, the engine control module download, dash and lot ' +
            'camera footage, dispatch messages and driver qualification files all sit with the ' +
            'carrier, and the retention periods for several of them are measured in months. ' +
            'Nothing stops the clock except a letter telling the company, in writing, that ' +
            'litigation is anticipated and the material must be preserved.',
            'That letter is the single most time-sensitive thing in this practice area. Ask ' +
            'when the firm sends one, what it lists, and whether it has ever moved for ' +
            'sanctions when a carrier destroyed something anyway.',
          ],
          list: [
            'When do you send a spoliation letter, and what does it ask to be preserved?',
            'Have you deposed a safety director or a dispatcher?',
            'Do you work with a reconstruction engineer, and at what point?',
            'Do you look past the driver to the carrier, the broker and the shipper?',
            'If the carrier is out of state, where would this case be filed and why?',
          ],
        },
        {
          heading: 'The defendant is a company with a legal department',
          paragraphs: [
            'Large carriers run rapid response teams that are at the scene within hours, ' +
            'sometimes before the vehicles are moved, taking measurements and statements. The ' +
            'insurance behind them is layered and the policy limits are large enough that the ' +
            'company will litigate rather than pay to be rid of a case.',
            'This is the practical difference for a client. Firms that settle volume will take ' +
            'the first reasonable number; the question worth asking is which trucking cases the ' +
            'firm has actually tried, and against which carriers.',
          ],
        },
      ],
      callout: {
        title: 'The company can be liable for the hiring, not just the crash',
        text:
          'Negligent hiring, training, supervision and retention are claims against the ' +
          'carrier in its own right. They turn on what the company knew when it put that ' +
          'driver on the road, which is why the driver qualification file matters as much as ' +
          'the skid marks.',
      },
    },
    faq: [
      {
        q: 'Is a truck accident case different from a car accident case?',
        a: 'Materially, yes. The driver and the carrier are bound by federal safety rules that ' +
           'do not apply to ordinary motorists, several defendants can be liable at once, and ' +
           'most of the decisive evidence is held by the company and kept only for a set ' +
           'period. The practical consequence is that the first fortnight matters more than it ' +
           'does in a car case.',
      },
      {
        q: 'Who can be sued besides the driver?',
        a: 'Depending on the facts: the motor carrier that employed or contracted the driver, ' +
           'the broker that arranged the load, the shipper that loaded it, a maintenance ' +
           'contractor, and in some cases a parts manufacturer. Each has its own insurance, ' +
           'which is why identifying them early changes what a claim is worth.',
      },
      {
        q: 'What is a spoliation letter?',
        a: 'A written notice telling a company that litigation is anticipated and that specific ' +
           'records must be preserved rather than deleted on their usual schedule. Without one, ' +
           'logs and camera footage can be destroyed lawfully before anybody asks for them.',
      },
      {
        q: 'How long do these cases take?',
        a: 'Longer than car cases, as a rule, because carriers defend them and because the ' +
           'evidence has to be prised out through discovery rather than handed over. A firm ' +
           'that quotes a timeline at the first call is guessing.',
      },
    ],
    plannedGuides: ['Hours of service, and what the logs actually show',
                    'Who is liable when the driver is an owner-operator',
                    'What a rapid response team does in the first six hours',
                    'Underride guards and the standard that did not change'],
  },
  'medical-malpractice': {
    name: 'Medical Malpractice',
    abbr: 'med mal',
    icon: 'scale',
    title: 'Medical Malpractice Lawyers: Rankings and Hiring Guide',
    description:
      'How to choose a medical malpractice lawyer: why most firms decline these cases, what ' +
      'an expert has to say before one can be filed, and the deadline that starts when you ' +
      'found out rather than when it happened.',
    lede:
      'Medical malpractice lawyers handling surgical error, misdiagnosis and delayed diagnosis, ' +
      'birth injury, medication error and hospital negligence. Every firm is checked for active ' +
      'licensure, clean disciplinary history and verified case results. Rankings are published ' +
      'per city, because a firm is worth comparing against the firms someone could actually ' +
      'hire instead of it.',
    subtopics: ['Surgical error', 'Misdiagnosis and delayed diagnosis', 'Birth injury',
                'Medication and anaesthesia error', 'Hospital-acquired infection',
                'Failure to obtain informed consent', 'Emergency room negligence',
                'Nursing home neglect'],
    feeFactLabel: 'No fee unless they win',
    guide: {
      heading: 'How to choose a medical malpractice lawyer',
      intro:
        'This is the practice area where the most firms advertise and the fewest take cases. A ' +
        'bad outcome is not negligence, proving the difference requires a doctor willing to say ' +
        'so under oath, and the case has to be funded for years before anybody is paid. Knowing ' +
        'why firms say no is the best preparation for choosing one that says yes.',
      sections: [
        {
          heading: 'The question is the standard of care, not the outcome',
          paragraphs: [
            'Medicine carries risk that nobody caused. The legal question is not whether the ' +
            'result was terrible but whether the care fell below what a reasonably competent ' +
            'practitioner in that specialty would have done, and whether that failure caused ' +
            'the harm. Both halves have to hold: care below the standard that changed nothing, ' +
            'and a devastating outcome from competent care, are each a case that loses.',
            'A firm worth hiring will explain which half it doubts, specifically, rather than ' +
            'telling you the case is "hard".',
          ],
        },
        {
          heading: 'A doctor has to sign before the case exists',
          paragraphs: [
            'Most states require a certificate of merit or an expert affidavit filed with or ' +
            'before the complaint: a qualified practitioner, usually in the same specialty, ' +
            'stating that the care breached the standard. That review is paid work and happens ' +
            'before a firm knows whether it has a case, which is why the screening is slow and ' +
            'why so many enquiries end in a decline.',
            'Ask who reviews the records, in what specialty, and whether the firm pays for that ' +
            'review itself. The answer tells you whether you are talking to a firm that files ' +
            'these cases or one that refers them to somebody who does.',
          ],
          list: [
            'How many of these cases did you file last year, and in what specialties?',
            'Who reviews my records before you decide, and do you pay for that review?',
            'Do you try these cases, or do you refer them out once they are filed?',
            'What are the case costs likely to be, and what happens to them if we lose?',
            'Is there a damages cap in this state, and does it apply to my claim?',
          ],
        },
        {
          heading: 'The clock may have started before you knew',
          paragraphs: [
            'These deadlines are their own subject. Many states run the period from when the ' +
            'injury was discovered or reasonably should have been, which helps a patient who ' +
            'learns years later; several then cap that with an outer limit measured from the ' +
            'treatment itself, which does not. Claims involving children, and claims against ' +
            'public hospitals, often run on different clocks again.',
            'Every city page here states the deadline that applies where the firms practise, ' +
            'read from the statute rather than summarised from another directory.',
          ],
        },
      ],
      callout: {
        title: 'Several states cap what these cases can pay',
        text:
          'Where a cap on non-economic damages applies, it sets a ceiling on compensation for ' +
          'pain and loss of function regardless of what a jury decides, and it shapes which ' +
          'cases a firm can afford to bring at all. Ask whether one applies to your claim ' +
          'before you ask what the claim is worth.',
      },
    },
    faq: [
      {
        q: 'Why did several firms turn down my case?',
        a: 'Usually one of three reasons: the care was within the standard even though the ' +
           'outcome was bad, the breach did not cause the harm, or the likely recovery does not ' +
           'cover what the case costs to bring. A firm should tell you which of the three, and ' +
           'it is worth asking directly.',
      },
      {
        q: 'What does a medical malpractice case cost to bring?',
        a: 'The fee is contingent, but the case costs are not trivial: expert review and ' +
           'testimony are the largest item and are incurred before any recovery. Ask whether ' +
           'the firm advances those costs, and what happens to them if the case is lost, in ' +
           'writing and before you sign.',
      },
      {
        q: 'How long do I have to file?',
        a: 'It depends on the state and on when the injury was discovered, and several states ' +
           'add an outer limit that runs from the treatment itself. Children and claims against ' +
           'public hospitals are often on different timetables. The deadline for each city is ' +
           'stated on that city\'s page.',
      },
      {
        q: 'Is a bad result the same as malpractice?',
        a: 'No, and this is the distinction the whole area turns on. The question is whether ' +
           'the care met the standard a reasonably competent practitioner would have provided, ' +
           'not whether the outcome was what anybody hoped for.',
      },
    ],
    plannedGuides: ['Certificates of merit, state by state',
                    'What a damages cap does to a case nobody will take',
                    'Discovery rules and repose: the two clocks',
                    'Reading your own medical records before you call anybody'],
  },
  'wrongful-death': {
    name: 'Wrongful Death',
    abbr: 'wrongful death',
    icon: 'columns',
    title: 'Wrongful Death Lawyers: Rankings and Hiring Guide',
    description:
      'How to choose a wrongful death lawyer: who is allowed to bring the claim, the second ' +
      'claim that belongs to the estate, and why the probate court is involved before the ' +
      'civil one.',
    lede:
      'Wrongful death lawyers handling fatal collisions, workplace deaths, fatal medical ' +
      'negligence and deaths caused by a defective product. Every firm is checked for active ' +
      'licensure, clean disciplinary history and verified case results. Rankings are published ' +
      'per city, because a firm is worth comparing against the firms someone could actually ' +
      'hire instead of it.',
    subtopics: ['Fatal collisions', 'Workplace fatalities', 'Fatal medical negligence',
                'Defective products', 'Survival actions', 'Loss of consortium',
                'Claims on behalf of children', 'Estate and probate coordination'],
    feeFactLabel: 'No fee unless they win',
    guide: {
      heading: 'How to choose a wrongful death lawyer',
      intro:
        'This claim is unlike the others on this site in a way that is easy to miss: it does ' +
        'not belong to the family in the ordinary sense. Statutes decide who may bring it, who ' +
        'the money is for, and what may be claimed, and those answers differ by state. ' +
        'Understanding that first makes the rest of the choice straightforward.',
      sections: [
        {
          heading: 'Who is allowed to sue is set by statute',
          paragraphs: [
            'In many states the action is brought by the personal representative of the estate ' +
            'rather than by relatives directly, and the recovery is distributed to statutory ' +
            'beneficiaries in an order the law sets. Where no representative has been ' +
            'appointed, that appointment has to happen in probate before the civil claim can be ' +
            'filed properly, which is a step families rarely expect.',
            'A firm that does this work will raise probate on the first call. If nobody ' +
            'mentions it, that is worth noticing.',
          ],
        },
        {
          heading: 'There are usually two claims, not one',
          paragraphs: [
            'The wrongful death claim compensates the family for what they lost: support, ' +
            'services, guidance, companionship, and funeral and burial expenses. A separate ' +
            'survival action belongs to the estate and covers what the person themselves ' +
            'suffered between the injury and death, including conscious pain and lost earnings ' +
            'in that interval.',
            'They are governed by different rules and sometimes different deadlines. Both are ' +
            'routinely available and one is routinely forgotten, so ask whether the firm is ' +
            'bringing both and why if not.',
          ],
          list: [
            'Does a personal representative need to be appointed, and will you handle that?',
            'Are you bringing a survival action alongside the wrongful death claim?',
            'Who are the statutory beneficiaries here, and how is a recovery divided?',
            'Does a settlement need court approval, and how long does that add?',
            'Have you tried a case like this, and when?',
          ],
        },
        {
          heading: 'Approval and division are part of the work',
          paragraphs: [
            'Where minors are beneficiaries, or where the estate is involved, a settlement ' +
            'commonly requires court approval and the division among beneficiaries can itself ' +
            'be contested. That is work a firm does after the number is agreed, and it is work ' +
            'that keeps families out of a second dispute with each other.',
            'It is a fair question to ask how the firm handles a family that does not agree, ' +
            'because the answer says more about the next year than any recovery figure does.',
          ],
        },
      ],
      callout: {
        title: 'Funeral expenses are usually recoverable, and usually overlooked',
        text:
          'Most wrongful death statutes allow funeral and burial costs as an item of damages. ' +
          'Keep the invoices. It is a small part of a claim and the part most often left out ' +
          'because nobody thought to ask for the receipts.',
      },
    },
    faq: [
      {
        q: 'Who can file a wrongful death claim?',
        a: 'That is set by state statute. In many states it is the personal representative of ' +
           'the estate acting for statutory beneficiaries, rather than any relative who wishes ' +
           'to sue. Which relatives count, and in what order, also comes from the statute.',
      },
      {
        q: 'What is a survival action?',
        a: 'A separate claim belonging to the estate for what the person suffered between the ' +
           'injury and their death, including conscious pain and earnings lost in that period. ' +
           'It is usually brought alongside the wrongful death claim and is the one most often ' +
           'left out.',
      },
      {
        q: 'Does a criminal case have to finish first?',
        a: 'No. A civil claim can proceed in parallel, and the standard of proof is lower, so a ' +
           'civil claim can succeed where a prosecution does not. Timing is often coordinated ' +
           'in practice, and a firm should explain how it intends to handle that.',
      },
      {
        q: 'How is the money divided?',
        a: 'By the statute and, where minors or an estate are involved, with court approval. ' +
           'Ask early how division works in your state, because it is a frequent source of ' +
           'conflict within families and it is better understood before a recovery than after.',
      },
    ],
    plannedGuides: ['Who the statute names, state by state',
                    'Survival actions and the claim that dies with the person',
                    'Court approval of a settlement when a child is a beneficiary',
                    'What funeral expenses are recoverable'],
  },
  'slip-and-fall': {
    name: 'Slip and Fall',
    abbr: 'premises',
    icon: 'pin',
    title: 'Slip and Fall Lawyers: Rankings and Hiring Guide',
    description:
      'How to choose a slip and fall lawyer: why notice decides these cases, what the ' +
      'defence will argue about why you were there, and the footage that is overwritten in ' +
      'days.',
    lede:
      'Slip and fall lawyers handling premises liability claims against shops, restaurants, ' +
      'landlords, supermarkets and public authorities. Every firm is checked for active ' +
      'licensure, clean disciplinary history and verified case results. Rankings are published ' +
      'per city, because a firm is worth comparing against the firms someone could actually ' +
      'hire instead of it.',
    subtopics: ['Wet floors and spills', 'Snow and ice', 'Broken stairs and handrails',
                'Inadequate lighting', 'Supermarket and retail falls',
                'Landlord and common area claims', 'Construction site falls',
                'Claims against a public authority'],
    feeFactLabel: 'No fee unless they win',
    guide: {
      heading: 'How to choose a slip and fall lawyer',
      intro:
        'These cases have a reputation for being easy and they are the opposite. Falling on ' +
        'somebody\'s property proves nothing on its own: the owner has to have known about the ' +
        'hazard, or to have had it there long enough that they should have, and proving that ' +
        'depends on records the owner holds and footage that erases itself. Everything below ' +
        'follows from that.',
      sections: [
        {
          heading: 'Notice is the case',
          paragraphs: [
            'Actual notice means somebody told them, or they created the hazard. Constructive ' +
            'notice means it was there long enough that a reasonable inspection would have ' +
            'found it, which turns on inspection logs, cleaning schedules and how often staff ' +
            'walked that aisle. A spill that happened ninety seconds before the fall is usually ' +
            'not a case; the same spill two hours old usually is.',
            'Which means the first thing worth asking a firm is how it establishes how long the ' +
            'hazard had been there, because that is the entire argument.',
          ],
        },
        {
          heading: 'The footage is overwritten on a loop',
          paragraphs: [
            'Most retail and commercial camera systems overwrite on a cycle measured in days ' +
            'or a few weeks. Incident reports, inspection sheets and staffing records are ' +
            'equally routine to discard. A preservation letter sent in the first week is often ' +
            'the difference between a provable case and one that rests on the client\'s word.',
            'Ask what the firm sends, when, and whether it has had to move against a defendant ' +
            'who let footage be erased after being asked to keep it.',
          ],
          list: [
            'How soon do you send a preservation letter, and what does it cover?',
            'How will you show how long the hazard had been there?',
            'Do you get the inspection and cleaning logs, and how?',
            'How do you handle an argument that the danger was open and obvious?',
            'Is this property owned by a public authority, and does that change the deadline?',
          ],
        },
        {
          heading: 'The defence is about you, and about why you were there',
          paragraphs: [
            'Expect two arguments. The first is comparative fault: that you were distracted, ' +
            'wearing the wrong shoes, or ignoring a sign, which in most states reduces recovery ' +
            'by your share and in some bars it. The second is that the hazard was open and ' +
            'obvious, so no warning was owed.',
            'Why you were on the property matters too. Many states still owe a different duty ' +
            'to an invited customer than to a social guest or a trespasser, and that category ' +
            'can decide the claim before anybody discusses the floor.',
          ],
        },
      ],
      callout: {
        title: 'A fall on public property can have a deadline measured in months',
        text:
          'Where the owner is a city, a transit authority or a school district, a formal notice ' +
          'of claim is often required long before any lawsuit, sometimes within ninety days. ' +
          'Missing it ends the claim regardless of its merits. Each city page here states the ' +
          'rule that applies where the firms practise.',
      },
    },
    faq: [
      {
        q: 'Do I have a case just because I fell?',
        a: 'No. The property owner has to have known about the hazard or to have had it there ' +
           'long enough that a reasonable inspection would have found it. How long the ' +
           'condition existed is usually the decisive question, and it is proved from the ' +
           'owner\'s own records rather than from the fall itself.',
      },
      {
        q: 'What should I do in the first week?',
        a: 'Report it to the business and ask for a copy of the incident report, photograph the ' +
           'condition and the footwear you were wearing, get names of anybody who saw it, and ' +
           'get medical attention on record. Then contact a firm quickly, because camera ' +
           'footage is commonly overwritten within days.',
      },
      {
        q: 'What if I was partly at fault?',
        a: 'In most states that reduces your recovery by your share rather than ending the ' +
           'claim, though a few bar recovery once your share passes a threshold. It is one of ' +
           'the first things a firm should price into its assessment, and one of the first a ' +
           'defence will raise.',
      },
      {
        q: 'Is a fall in a shop different from a fall on a public pavement?',
        a: 'Often very different. A claim against a city or transit authority can require ' +
           'formal notice within months rather than years, and the immunities available are ' +
           'not the ones a private shop has. Ask about this on the first call if the property ' +
           'is public.',
      },
    ],
    plannedGuides: ['Constructive notice: how long is long enough',
                    'What a notice of claim deadline does to a public-property fall',
                    'Open and obvious, and where it still wins',
                    'Camera retention periods by type of business'],
  },
};

/** Slugs with a hub page, in the order the site lists them. */
export const PRACTICE_SLUGS = Object.keys(PRACTICES);

export const hasPractice = (slug: string): boolean => slug in PRACTICES;
