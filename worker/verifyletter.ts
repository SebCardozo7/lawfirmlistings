/**
 * The one letter we send to a firm that never wrote to us.
 *
 * It does not sell anything, and the day it starts to it stops working. We publish a profile
 * of this firm without having asked, scored from public sources, and it sits on a median of
 * thirteen of our pages. The firm has never been told. The honest first contact is to show
 * them and ask whether any of it is wrong, because an error on those pages costs us more than
 * it costs them: the directory's only asset is that its numbers hold up.
 *
 * So there is no price in here, no listing, no panel and no link to pay. A firm that answers
 * hears about all of that from a person, in a reply, once there is a conversation to have.
 * A firm that does not answer is left alone; worker/prospects.ts refuses a second letter.
 *
 * Two things in the footer are not optional and the builder refuses without them. US
 * commercial email is governed by CAN-SPAM, which requires a physical postal address and a
 * working opt-out in every message and prices a breach per message sent. A letter that cannot
 * carry both is a letter that does not go out, which is why POSTAL_ADDRESS missing returns an
 * error rather than a letter with a hole in it.
 */
import type { FirmEntry } from './dossier';
import type { Prospect } from './prospects';

export interface VerifyEnv {
  /** The physical address CAN-SPAM requires in the footer. No address, no letter. */
  POSTAL_ADDRESS?: string;
}

export interface Letter {
  subject: string;
  text: string;
}

const SITE = 'https://lawfirmlistings.com';

/** How many of the firm's pages to actually list. Thirteen URLs is a wall; four is an invitation. */
const SHOW = 4;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Half points are real: E3 scores 1.5 of 4 on firms that publish one language beyond English.
 * A letter that rounded that to 2 would print a number the profile page contradicts, and the
 * whole letter is an invitation to go and check the numbers.
 */
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * The unsubscribe link. The token is the address itself, URL-encoded: there is nothing secret
 * in it, the recipient already knows their own address, and a signed token would mean a firm
 * that forwards the mail to a colleague cannot be unsubscribed by the colleague, which is the
 * opposite of what an opt-out is for.
 */
export const optOutUrl = (email: string): string =>
  `${SITE}/api/unsubscribe?e=${encodeURIComponent(email.trim().toLowerCase())}`;

export function verificationLetter(
  p: Prospect, pages: string[], firm: FirmEntry | undefined, env: VerifyEnv,
): { letter: Letter | null; blocked: string | null } {
  const postal = (env.POSTAL_ADDRESS || '').trim();
  if (!postal) {
    return { letter: null, blocked: 'no POSTAL_ADDRESS is set, and CAN-SPAM requires one' };
  }
  if (!firm) {
    return { letter: null, blocked: 'we publish no profile for this firm, so there is nothing to check' };
  }
  if (!pages.length) {
    return { letter: null, blocked: 'this firm is on no directory page, so the letter has no subject' };
  }

  const shown = pages.slice(0, SHOW);
  const rest = pages.length - shown.length;
  const [code, scored, max] = firm.w;

  // The points in pillar E the firm has not claimed. See FirmEntry.fr in worker/dossier.ts.
  const free = firm.fr ?? [];
  const freeTotal = free.reduce((n, [, pts, mx]) => n + (mx - pts), 0);

  const lines: (string | null)[] = [
    'Hello,',
    '',
    // The claim, the number, and the way to check it, in the first three lines. No
    // introduction: who we are is answered by the link better than by a paragraph.
    `We publish a profile of ${firm.n}, and it appears on ${plural(pages.length, 'page', 'pages')}`,
    'of our directory. You never asked us to, and I would rather you checked it than came',
    'across it later.',
    '',
    'The profile:',
    `${SITE}/firms/${firm.s}/`,
    '',
    rest > 0
      ? `Some of the pages it appears on, and there are ${rest} more:`
      : 'The pages it appears on:',
    ...shown.map(u => `  ${u}`),
    '',
    `We scored it ${firm.sc} out of 100, LFL ${firm.t}, from the firm's own site, its verified`,
    'Google listings and the state attorney register. Every sub-score on that page shows the',
    'evidence behind it.',
    '',
    // What the firm gets, before what we want. The old letter's only ask was "is any of it
    // wrong?", and the honest answer for most firms is no, which is answered by saying
    // nothing. Fifty-two letters got nothing back. This names the one thing that is both true
    // and worth the reader's time, and it is worth it to them rather than to us.
    ...(free.length ? [
      // Never opens on the figure: freeTotal is a numeral and a sentence that starts with one
      // reads like a subject line rather than a letter.
      `Of the points you are missing, ${fmt(freeTotal)} cost nothing and need nothing from us.`,
      'They are read off your own website, and they are these:',
      '',
      ...free.map(([label, pts, mx]) => `  ${label}: ${fmt(pts)} of ${mx}`),
      '',
      'Publish what is missing and the next monthly read picks it up. You do not have to tell',
      'us and we do not have to be told. The profile page shows exactly what we looked for and',
      'what we found, under each line above.',
      '',
    ] : [
      `The weakest pillar right now is ${code}, at ${fmt(scored)} of ${max}, and the profile`,
      'page shows what sits behind it.',
      '',
    ]),
    // And then the question, which is still the one we most want answered.
    'The other thing: is any of it wrong?',
    '',
    'If it is, reply and tell me what. A correction that holds up is applied to the profile and',
    'to every page above, and it costs nothing, now or ever, whether or not you ever buy',
    'anything from us. We put these pages up without asking, so getting them right is our job',
    'rather than a favour you owe us.',
    '',
    'There is nothing to sign up for in this message.',
    '',
    'Sebastian Cardozo',
    'Law Firm Listings',
    'hello@lawfirmlistings.com',
    '',
    // The footer. Plain, and under the signature where a reader expects it.
    postal,
    '',
    'If you would rather not hear from us again, this stops it for good:',
    optOutUrl(p.email),
  ];

  return {
    letter: {
      // Specific, checkable, and not a banner. It names a fact about their own firm that they
      // can verify by opening one link, which is the only reason a stranger opens an email.
      //
      // It used to name only the page count, which is a fact about us: we are on a lot of
      // pages, well done us. The score is a fact about them and it is the one they will want
      // to argue with, and arguing with it is the reply we are asking for.
      subject: free.length
        ? `${firm.n} scores ${firm.sc} on our directory, and ${fmt(freeTotal)} of the `
          + 'missing points are free'
        : `${firm.n} scores ${firm.sc} on our directory`,
      text: lines.filter((l): l is string => l !== null).join('\n').replace(/\n{3,}/g, '\n\n') + '\n',
    },
    blocked: null,
  };
}
