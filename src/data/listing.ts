/**
 * What a firm has to meet to be listed, and what anything costs.
 *
 * Two things live here rather than in the page that renders them, for two different reasons.
 *
 * The requirements are the eligibility gates, restated for somebody who runs a law firm rather
 * than somebody reading a methodology. Each one names the gate it comes from, so a reader can go
 * and check, and so the next person to change a gate can grep for its code and find this file.
 * scripts/check_listing_rules.mjs fails the build if a code named here is not in score.py's gate
 * set, or if a gate the engine runs is missing from this page, which is the only way a
 * restatement stays true to the thing it restates.
 *
 * The prices are here because a price on this site is a claim, and claims belong in data next to
 * the thing that checks them. A product with `price: null` does not render at all: the page would
 * rather show nothing than "contact us for pricing", which on a directory promising that no firm
 * can buy a point is the exact sentence that undermines it.
 */

export interface Requirement {
  /** The eligibility gate this restates, checked against the engine at build time. */
  gate: string;
  title: string;
  detail: string;
  /** What a firm actually does about it, in the imperative. */
  todo: string;
}

/**
 * The gates, in the order a firm can act on them rather than the order they are numbered.
 * G5 first because it is the one entirely within a firm's control and the one most often failed.
 */
export const REQUIREMENTS: Requirement[] = [
  {
    gate: 'G5',
    title: 'A site that names its lawyers',
    detail:
      'Served over HTTPS, with a working phone number and the attorneys named on pages we can ' +
      'read. No guaranteed-results language and no invented badges. Three firms in the ' +
      'directory publish no attorney at all, and it is the single most common reason a profile ' +
      'stalls: with no names there is no roster to check, so licensure and discipline cannot be ' +
      'looked up either.',
    todo: 'Publish a page that names your attorneys, one page each where you can.',
  },
  {
    gate: 'G1',
    title: 'Attorneys licensed where they practise',
    detail:
      'Every attorney the firm names holds a current licence. We read the state register where ' +
      'the state publishes one we are allowed to query. An attorney we cannot find is not held ' +
      'against the firm; a disbarment or a suspension is.',
    todo: 'Publish bar admission numbers on the bios. It takes a text edit and it is worth points.',
  },
  {
    gate: 'G2',
    title: 'No public discipline outstanding',
    detail:
      'No attorney the firm names carries a disbarment, a suspension or a disciplinary ' +
      'resignation on the public record. Where a state publishes no register we may query, we ' +
      'read the published decisions of its grievance body instead.',
    todo: 'Nothing, if the record is clean. This one we check rather than ask about.',
  },
  {
    gate: 'G3',
    title: 'A real entity and a real office',
    detail:
      'A registered legal entity and at least one office somebody can walk into. A verified ' +
      'Google Business Profile with a postal address establishes the office anywhere in the ' +
      'country. The entity half needs a business register the state lets us query, and several ' +
      'do not.',
    todo: 'Keep the Google listings current, with the address and hours the firm actually keeps.',
  },
  {
    gate: 'G6',
    title: 'A year in practice and ten client reviews',
    detail:
      'Ten or more reviews across the firm\'s verified Google listings, and at least a year in ' +
      'operation. We take the year from the registration date of the firm\'s own domain, which ' +
      'is a floor rather than a founding date and is never published as the firm\'s age.',
    todo: 'Nothing to send. Both halves are already public.',
  },
];

export interface Product {
  name: string;
  /**
   * The price, exactly as it should read. `null` means not published yet, and the product is
   * hidden until it is: a price that is not ready is not a price to hint at.
   */
  price: string | null;
  cadence?: string;
  summary: string;
  includes: string[];
  /** Stated on every product, because it is the thing a buyer most needs to hear. */
  excluded?: string;
}

/**
 * Claiming is free, and that is not a promotion but a published commitment: the methodology FAQ
 * says a firm may claim its profile at no cost and the contact page says it again. It is listed
 * here as a product priced "Free" so the page can set it beside anything paid, which is where the
 * comparison does its work.
 */
export const PRODUCTS: Product[] = [
  {
    name: 'Claimed profile',
    price: 'Free',
    summary:
      'For a firm that wants its own profile to be right, and to stay right. There is no ' +
      'upgrade path attached to this and no expiry.',
    includes: [
      'Correct your offices, phone, practice areas, languages and fee terms',
      'Submit case results with a docket number for verification',
      'Appeal any sub-factor, reviewed within 30 days',
      'See every sub-score and the evidence behind it',
    ],
    excluded:
      'Claiming changes nothing about the score, the eligibility gates or the tier. Those are ' +
      'measured, and a claimed profile is measured exactly the same way an unclaimed one is.',
  },
];

/**
 * The form. Kept as data so the page renders it, the mailto builder serialises it and the
 * validator checks it from one definition, rather than three lists that drift apart.
 */
export interface Field {
  name: string;
  label: string;
  type: 'text' | 'email' | 'url' | 'tel' | 'textarea' | 'select' | 'checkbox';
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: string[];
  /**
   * How this field reads in the email the form builds. A consent checkbox needs a whole sentence
   * on screen and one clause in a message: without this the body carried "I understand that
   * nothing here changes the Certification Score, the eligibility gates or the tier, and that
   * submitting this does not guarantee a listing.: Confirmed".
   */
  short?: string;
}

export interface Step {
  title: string;
  intro: string;
  fields: Field[];
}

export const STEPS: Step[] = [
  {
    title: 'The firm',
    intro:
      'Enough to find you and to read your own pages. Everything we publish about a firm comes ' +
      'from its own site and from public records, so the website is the part that matters most.',
    fields: [
      { name: 'firm', label: 'Firm name', type: 'text', required: true,
        placeholder: 'As it appears on your letterhead' },
      { name: 'website', label: 'Website', type: 'url', required: true,
        placeholder: 'https://',
        help: 'We read this, and the pages it links to. Nothing else.' },
      { name: 'city', label: 'City and state', type: 'text', required: true,
        placeholder: 'Baltimore, MD' },
      { name: 'practice', label: 'Primary practice area', type: 'select', required: true,
        options: ['Personal injury', 'Medical malpractice', 'Workers compensation',
                  'Employment', 'Criminal defense', 'Immigration', 'Family', 'Other'],
        help: 'We publish one practice area today and open others as cohorts fill.' },
    ],
  },
  {
    title: 'Who to talk to',
    intro:
      'One person at the firm. Write from an address at the firm\'s own domain: it is how we ' +
      'tell that a claim comes from the firm rather than from somebody who would like it to.',
    fields: [
      { name: 'contact', label: 'Your name', type: 'text', required: true },
      { name: 'role', label: 'Your role', type: 'text', required: true,
        placeholder: 'Managing partner, marketing director' },
      { name: 'email', label: 'Email at the firm\'s domain', type: 'email', required: true,
        help: 'A free webmail address is fine to start a conversation, but a claim is only ' +
              'granted to an address at the firm\'s own domain.' },
      { name: 'phone', label: 'Phone', type: 'tel', required: false },
    ],
  },
  {
    title: 'What you are asking for',
    intro:
      'Being listed is not something a firm buys, so this is not an order form. Tell us which ' +
      'of these it is and we will tell you where your firm actually stands.',
    fields: [
      { name: 'request', label: 'What brings you here', type: 'select', required: true,
        options: ['Claim a profile we already publish',
                  'Ask to be considered for the directory',
                  'Correct something on our profile',
                  'Appeal a sub-score',
                  'Ask about sponsorship'],
      },
      { name: 'attorneys', label: 'Page that names your attorneys', type: 'url', required: false,
        placeholder: 'https://',
        help: 'If you have one. If you do not, that is the first thing worth fixing and it is ' +
              'worth more to you than anything on this page.' },
      { name: 'notes', label: 'Anything else', type: 'textarea', required: false,
        help: 'If you are appealing, name the sub-factor and the evidence you want weighed.' },
      { name: 'understood', label:
        'I understand that nothing here changes the Certification Score, the eligibility gates ' +
        'or the tier, and that submitting this does not guarantee a listing.',
        type: 'checkbox', required: true,
        short: 'Acknowledged that nothing here changes the score' },
    ],
  },
];
