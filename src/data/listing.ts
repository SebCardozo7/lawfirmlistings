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
 * One product, and one thing that is not for sale because it is not ours to sell.
 *
 * Claiming used to be free and separate: a firm took control of its own page at no charge and
 * the fee added a link, a logo and the quoted reviews. That is no longer the offer. Running
 * your own profile is the product, and it costs what the annual listing costs.
 *
 * Correcting something we got wrong is not part of it and never will be. A firm that finds a
 * page title listed as one of its attorneys, which this directory did to twenty-one firms,
 * should not have to buy anything to have it taken down. We publish these pages unasked and we
 * publish them from the outside, so the cost of being wrong is ours. That line is in the terms
 * as well as here.
 */
export const PRODUCTS: Product[] = [
  {
    name: 'Annual listing',
    price: '350 USD',
    cadence: 'a year',
    summary:
      'For a firm that wants to run its own profile and have its own site linked from it. ' +
      'Renewed once a year, and we write to you before it renews.',
    includes: [
      'Your own panel: offices, phone, practice areas, languages and fee terms',
      'Submit case results with a docket number for verification',
      'See every sub-score and the evidence behind it',
      'A dofollow link to your site, from your profile and from every card you appear in',
      'Your own logo on your profile',
      'The client reviews you want quoted, reviewed by us before they appear',
    ],
    excluded:
      'It buys no points, no gate, no tier and no position in any ranked list. Those are ' +
      'measured from public records and are identical for a firm that pays and a firm that ' +
      'does not.',
  },
];

/**
 * What a firm never pays for, named here so the pages that say it read it from one place.
 * Both of these are about our own accuracy rather than about the firm's presentation.
 */
export const ALWAYS_FREE = [
  'Correcting anything we published about your firm that is wrong',
  'Appealing a sub-score, which is reviewed within 30 days',
];

/**
 * The two answers to "what brings you here" that must never be answered with a price.
 *
 * The form asks a firm what it wants and the Worker queues a follow-up to everybody who sends
 * it, so a firm writing in to say we had named a page title as one of its attorneys was getting
 * a quote and a PayPal link six hours later. The strings are declared once and spread into the
 * form's own options below, so the list the Worker tests against is the list the firm picked
 * from and the two cannot drift apart.
 *
 * worker/index.ts imports this. src/data/listing.ts has no imports of its own and must keep
 * none, because that is what makes it readable from inside the Worker bundle as well as from a
 * page.
 */
export const FREE_REQUESTS = [
  'Correct something on our profile',
  'Appeal a sub-score',
];

export const isFreeRequest = (value?: string | null): boolean =>
  !!value && FREE_REQUESTS.includes(value.trim());

/**
 * The first option on the form, and the one a firm reaches by clicking the call to action on
 * its own profile, so it is the ordinary path rather than an edge case.
 *
 * It needs naming because the follow-up email was written for a stranger and reads wrong to the
 * firm that picks it. A firm already in the directory is told what it has to meet, that we will
 * read its site and report where it stands, and that its profile will go live, when all three
 * already happened. The worst line is the first benefit: a followed link, which a firm at
 * Verified or above already has, for nothing, because clearing the gates earns it. Selling a
 * firm the thing it already owns is the fastest way to be read as a directory that does not
 * know who it is writing to.
 */
export const EXISTING_PROFILE_REQUEST = 'Run the profile we already publish';

export const isExistingProfile = (value?: string | null): boolean =>
  !!value && value.trim() === EXISTING_PROFILE_REQUEST;

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
        options: [EXISTING_PROFILE_REQUEST,
                  'Ask to be considered for the directory',
                  ...FREE_REQUESTS,
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

/**
 * The price, derived rather than retyped.
 *
 * It was restated by hand in four places once and every one of them got the split backwards,
 * which is why anything that needs it reads it from here. A sentence of prose cannot be
 * type-checked, and this has already changed once: claiming stopped being free and the panel
 * moved from the free half to the priced one.
 */
const listing = PRODUCTS.find(p => p.name === 'Annual listing');
export const LISTING_PRICE = listing?.price ?? '';
export const LISTING_CADENCE = listing?.cadence ?? '';
