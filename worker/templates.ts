/**
 * The letters the desk sends, written once and filled from the lead's own dossier.
 *
 * These are the four that were written by hand on 2026-11-08, generalised. Writing them took an
 * afternoon, and almost none of that was writing: it was looking up whether we publish the
 * firm, what we scored it, which pillar it is losing points on and whether we cover its state.
 * All of that now arrives in the dossier, so the letter assembles itself and the person reads
 * it before it goes.
 *
 * The voice is Sebastián's, settled the same day, and it is deliberately not the voice of the
 * automated sequence in outbound.ts. Short. The question in the first three lines. No opening
 * paragraph introducing who is writing, which he called out by name. Benefits in three bullets,
 * the price, the link, and one line making a no an acceptable answer. Every one ends by asking
 * for questions and feedback, because he asked for that in all of them.
 *
 * One rule worth keeping as the set grows: a template may only assert what the dossier knows.
 * `interested` says the profile is live because it is only ever offered for a lead whose firm
 * is in the index; `newState` says we do not publish the state because the index says which
 * states exist. The afternoon that produced these also produced a quote sent to a New Jersey
 * firm for a page that could not exist, and the fix for that is not a careful writer, it is a
 * template that cannot be filled in with a fact nobody checked.
 */
import type { Dossier } from './dossier';
import type { Lead } from './ledger';

export interface TemplateEnv {
  LISTING_PRICE_USD?: string;
  PAYPAL_LINK?: string;
}

export interface Letter {
  subject: string;
  text: string;
}

export interface TemplateSpec {
  id: string;
  /** What the button says. */
  label: string;
  /** One line under it, so the desk picks the right one without opening it. */
  blurb: string;
  /** Why this letter cannot be sent to this lead right now, or null when it can. */
  blocks: (lead: Lead, d: Dossier) => string | null;
  build: (lead: Lead, d: Dossier, price: number, pay: string) => Letter;
}

const SITE = 'https://lawfirmlistings.com';

/** First name where the contact looks like a person, nothing where it looks like a firm. */
function greeting(lead: Lead): string {
  const contact = String(lead.contact ?? '').trim();
  const firm = String(lead.firm ?? '').trim();
  // A contact that simply repeats the firm name is not a person, and "Hello Beninato &
  // Matrafajlo Law," reads like a mail merge because it is one.
  if (!contact || contact.toLowerCase() === firm.toLowerCase()) return 'Hello,';
  if (/\b(law|llp|llc|p\.?c\.?|firm|group|associates|attorneys)\b/i.test(contact)) return 'Hello,';
  const first = contact.split(/\s+/)[0];
  return first.length > 1 ? `${first},` : 'Hello,';
}

/**
 * The firm's name is deliberately not interpolated here.
 *
 * It was, and a Google Business title runs to sixty characters, which put a 118-character line
 * through the middle of the first bullet and wrapped it badly in every client. outbound.ts
 * learned the same lesson on the same sentence. The name is in the subject and the greeting,
 * which is twice already.
 */
const BENEFITS = (): string[] => [
  '',
  '  A dofollow link to your site, from your profile and from every card your firm appears',
  '  in across the directory. Unpaid profiles link out with rel="nofollow".',
  '',
  '  Your own panel, where you maintain offices, phone, practice areas, languages, fee terms',
  '  and logo, and file case results and client reviews for review.',
  '',
  '  Every sub-score, the evidence behind it, and the right to appeal any of it.',
  '',
  'It does not buy points, tiers or a position in any ranking. Those are measured from public',
  'sources and come out the same whether or not you pay.',
];

const SIGN_OFF = [
  '',
  'Sebastian',
  'Law Firm Listings',
  'hello@lawfirmlistings.com',
];

const FEEDBACK_WITH_PROFILE = [
  '',
  'Any questions, or anything on that page that looks wrong to you, just reply. Corrections are',
  'free whether or not you ever pay us, and feedback is welcome.',
];

const FEEDBACK_PLAIN = [
  '',
  'Any questions, or anything you want to push back on, just reply. Feedback is welcome either',
  'way.',
];

const join = (lines: (string | null)[]): string =>
  lines.filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';

/** The sub-factor sentence, which is the part of a letter no competitor can send. */
function headroom(d: Dossier): string[] {
  const f = d.firm;
  if (!f) return [];
  const [code, scored, max] = f.w;
  const lines = [
    '',
    `Worth knowing either way: pillar ${code} is ${scored} of ${max} on your profile.`,
  ];
  if (f.o) {
    const [, label, available] = f.o;
    lines.push(`${label} alone is ${available} points you are not getting, and it is maintained`);
    lines.push('from that panel, so a listing is the quick way to claim it.');
  }
  if (f.g) {
    const [tier, gap] = f.g;
    lines.push(`The gap to LFL ${tier} is ${gap} ${gap === 1 ? 'point' : 'points'}.`);
  }
  return lines;
}

const asked = (lead: Lead): string => {
  const when = lead.arrived_at?.slice(0, 10);
  if (!when) return 'You asked about a listing';
  const [y, m, dd] = when.split('-').map(Number);
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'][m - 1] ?? '';
  return `You asked about a listing on ${dd} ${month}`.replace(/\s+$/, '');
};

export const TEMPLATES: TemplateSpec[] = [
  {
    id: 'interested',
    label: 'Still interested?',
    blurb: 'For a lead that went quiet. Asks the question, repeats the benefits, prices it.',
    blocks: (lead, d) => (d.firm ? null : 'no profile: use the terms or new state letter'),
    build: (lead, d, price, pay) => ({
      subject: `Still interested in listing ${d.firm?.n ?? lead.firm}?`,
      text: join([
        greeting(lead),
        '',
        `${asked(lead)} and then heard nothing from us. That one is on us.`,
        '',
        'Are you still interested?',
        '',
        `Your profile is already live, at ${d.firm!.sc} out of 100, LFL ${d.firm!.t}:`,
        '',
        `  ${d.url}`,
        '',
        `A listing at ${price} USD a year adds three things:`,
        ...BENEFITS(),
        ...headroom(d),
        '',
        `  ${pay}`,
        '',
        'Pay there and I send your sign-in the same day. A no is a fine answer too, and the',
        'profile stays up either way.',
        ...FEEDBACK_WITH_PROFILE,
        ...SIGN_OFF,
      ]),
    }),
  },
  {
    id: 'terms',
    label: 'Send the terms',
    blurb: 'First commercial reply. What a listing is, what it costs, what it does not buy.',
    blocks: (lead, d) => (d.covered ? null : 'we do not publish that state: use the new state letter'),
    build: (lead, d, price, pay) => ({
      subject: 'Your enquiry about listing your firm',
      text: join([
        greeting(lead),
        '',
        'Thanks for getting in touch. Here is everything you need in order to decide.',
        d.firm ? '' : null,
        d.firm ? `Your profile is already live, at ${d.firm.sc} out of 100, LFL ${d.firm.t}:` : null,
        d.firm ? '' : null,
        d.firm ? `  ${d.url}` : null,
        '',
        `${price} USD a year, renewed annually, and we tell you before each renewal.`,
        '',
        'What the year includes:',
        ...BENEFITS(),
        ...headroom(d),
        '',
        'Correcting anything we have wrong about your firm is free, and stays free whether or',
        'not you ever pay us.',
        '',
        `  ${pay}`,
        '',
        'Pay there and I send your sign-in the same day.',
        ...(d.firm ? FEEDBACK_WITH_PROFILE : FEEDBACK_PLAIN),
        ...SIGN_OFF,
      ]),
    }),
  },
  {
    id: 'newstate',
    label: 'We would open your state',
    blurb: 'For a firm in a state we do not publish. Says so plainly, then offers to start it.',
    blocks: (lead, d) => (d.covered ? 'we already publish that state' : null),
    build: (lead, d, price, pay) => ({
      subject: 'Still interested? We would be starting your state with you',
      text: join([
        greeting(lead),
        '',
        `${asked(lead)} and then heard nothing for a while. Sorry about that.`,
        '',
        'Are you still interested?',
        '',
        `One thing to be straight about first. We do not publish ${(d.state ?? '').toUpperCase()} yet.`,
        'Thirteen states so far and yours is not among them, so there is no profile for your',
        'firm today.',
        '',
        'What we can do is start the state with you. Take the listing and we build your profile',
        'first, measured on exactly the same methodology as every other firm here, and open your',
        'market around it. Being the first firm in a state is not a bad place to stand.',
        '',
        `${price} USD a year, and it gets you:`,
        ...BENEFITS(),
        '',
        `  ${pay}`,
        '',
        'Pay there and your profile is live within two weeks, with your sign-in sent the same',
        'day you pay.',
        ...FEEDBACK_PLAIN,
        ...SIGN_OFF,
      ]),
    }),
  },
  {
    id: 'nudge',
    label: 'Short nudge',
    blurb: 'Four lines. For a thread that is already long enough.',
    blocks: () => null,
    build: (lead, d, price, pay) => ({
      subject: `Still interested, or should I close this off?`,
      text: join([
        greeting(lead),
        '',
        'Still interested, or should I close this off? Either answer is fine.',
        d.firm ? '' : null,
        d.firm ? `The profile stays up either way, at ${d.firm.sc} out of 100:` : null,
        d.firm ? '' : null,
        d.firm ? `  ${d.url}` : null,
        '',
        `And the listing is ${price} USD a year if you want to run the page yourself:`,
        '',
        `  ${pay}`,
        '',
        'Any questions, just reply. It is the last you will hear from me on this either way.',
        ...SIGN_OFF,
      ]),
    }),
  },
  {
    id: 'welcome',
    label: 'Paid, welcome',
    blurb: 'After the money lands. Confirms what changed and where to sign in.',
    blocks: (lead, d) => (d.firm ? null : 'no profile yet, so there is nothing to confirm'),
    build: (lead, d, price, pay) => ({
      subject: 'Your listing is live',
      text: join([
        greeting(lead),
        '',
        'Payment received, thank you. Your listing is active for the year.',
        '',
        'What changed, and you can check both in a browser right now:',
        '',
        '  Your profile now links to your site as a followed link:',
        `    ${d.url}`,
        '  Every card your firm appears in across the directory does the same.',
        '',
        'Your sign-in for the panel follows in a separate message. From there you maintain',
        'offices, phone, practice areas, languages, fee terms and logo, and file case results',
        'and client reviews. We review each submission before it is published.',
        ...headroom(d),
        '',
        'The score itself does not move because you paid, and it never will. It moves when the',
        'evidence moves, which is what makes it worth having.',
        '',
        'Anything wrong on the page, reply and it gets fixed. Feedback is welcome.',
        ...SIGN_OFF,
      ]),
    }),
  },
];

export const templateById = (id: string): TemplateSpec | undefined =>
  TEMPLATES.find(t => t.id === id);

/** The price to quote, in whole USD. */
export function priceOf(env: TemplateEnv, override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return Math.round(override);
  }
  const n = Number((env.LISTING_PRICE_USD || '').trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** The pay link with the amount on it, which is the only way a PayPal.me link carries one. */
export function payLinkFor(env: TemplateEnv, price: number): string {
  const link = (env.PAYPAL_LINK || '').trim().replace(/\/+$/, '');
  if (!link || !price) return link;
  const bare = /^https?:\/\/(www\.)?(paypal\.com\/paypalme|paypal\.me)\/[A-Za-z0-9._-]+$/i;
  return bare.test(link) ? `${link}/${price}USD` : link;
}

export function render(
  id: string, lead: Lead, d: Dossier, env: TemplateEnv, override?: number,
): { letter: Letter | null; blocked: string | null } | null {
  const spec = templateById(id);
  if (!spec) return null;
  // Blocked is checked before build runs, and a blocked template produces no letter at all.
  // The first version built first and reported the block afterwards, which read fine and
  // crashed: `interested` dereferences the profile in its first paragraph, and the whole point
  // of its block is that there may not be one. A guard that runs after the thing it guards is
  // decoration, and the test for the New Jersey case is what caught it.
  const blocked = spec.blocks(lead, d);
  if (blocked) return { letter: null, blocked };
  const price = priceOf(env, override);
  return { letter: spec.build(lead, d, price, payLinkFor(env, price)), blocked: null };
}

export { SITE };
