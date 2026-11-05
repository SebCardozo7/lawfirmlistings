/**
 * The two emails a firm gets after it asks to be listed, and the queue that delays the second.
 *
 * Both go out natively. Cloudflare's own docs settle the question that decided this: "Before you
 * onboard a sending domain, you can send emails only to verified destination addresses in your
 * account. After you onboard a sending domain, you can send to any recipient immediately." So
 * once lawfirmlistings.com is onboarded as a sending domain there is no Resend, no SendGrid, no
 * API key and no monthly bill in the path, which matters on a site whose whole pitch is that
 * nobody else is in the path either.
 *
 * The first email goes out inside the request. The second is due hours later, and a Worker cannot
 * sleep, so it is written into KV under a key that sorts by when it is due and a cron trigger
 * drains what has come due. KV plus cron rather than Queues, because Queues bills and this is a
 * handful of messages a week.
 *
 * Two things this is careful about.
 *
 *   It never invents a price. The annual figure and the payment link come from Worker vars, and
 *   where they are not set the pitch email says a price will follow rather than making one up.
 *   An outbound commercial email with a guessed number in it is worse than no email.
 *
 *   It never promises a listing. Our own /list-your-firm/ page says eligibility is measured and
 *   not sold, so the follow-up states the requirements and what the fee does buy, which is the
 *   panel and a followed link, and says plainly that the score is not part of it.
 */
import { mime, present } from './mail';

export interface OutboundEnv {
  EMAIL: { send(message: any): Promise<unknown> };
  FOLLOWUPS?: KVNamespace;
  /** Where the owner's own copy goes. Unset means the follow-up goes out unannounced. */
  SUBMISSIONS_TO?: string;
  SUBMISSIONS_FROM?: string;
  /** Where a firm's reply should land. Falls back to the sender. */
  REPLY_TO?: string;
  /** The annual listing fee, as it should read: "299". Unset means the email promises a figure. */
  LISTING_PRICE_USD?: string;
  /** A PayPal link. Unset means the email says we will send one. */
  PAYPAL_LINK?: string;
  /** Hours before the second email. Unset is 6. */
  FOLLOWUP_HOURS?: string;
  /** Hours before the owner is reminded that nobody has answered. Unset is 48. */
  REMINDER_HOURS?: string;
}

import { isFreeRequest } from '../src/data/listing';

export interface Enquiry {
  firm: string;
  contact: string;
  email: string;
  website?: string;
  city?: string;
  practice?: string;
  /** What the firm said it came for. Absent on a follow-up queued before this field existed. */
  request?: string;
  /** The reminder this enquiry queued, so the owner's emails can all carry the same link. */
  reminderKey?: string;
  reminderToken?: string;
}

const hours = (env: OutboundEnv) => {
  const n = Number(env.FOLLOWUP_HOURS);
  return Number.isFinite(n) && n > 0 && n < 24 * 30 ? n : 6;
};

const reminderHours = (env: OutboundEnv) => {
  const n = Number(env.REMINDER_HOURS);
  return Number.isFinite(n) && n > 0 && n < 24 * 30 ? n : 48;
};

/**
 * Where the "I have answered them" link points when nothing better is known. The Worker knows
 * its own origin at submit time and stores it, so this is only the fallback for a record queued
 * without one.
 *
 * The apex, not www: index.ts 301s www to the apex, and this address is posted to rather than
 * read. A browser is not required to repeat a POST to the address a redirect names, and some
 * turn it into a GET, which here is the method that deliberately does nothing.
 */
export const SITE = 'https://lawfirmlistings.com';

/** The sender's own name, so a reply does not go to a no-reply nobody reads. */
/**
 * The payment link, with the amount already in it.
 *
 * A bare PayPal.me profile opens a box and asks the payer to type a figure, which on an invoice
 * for a stranger reads like a tip jar and invites a typo in the one number that matters.
 * PayPal.me takes the amount as the last path segment with the currency code after it, so
 * /sebastiancardozo/350USD opens showing 350.00 USD.
 *
 * The figure comes from LISTING_PRICE_USD, the same variable the email prints, so the price in
 * the sentence and the price in the link cannot disagree. Changing the var changes both.
 *
 * Only a bare profile is touched. A PayPal payment link or an invoice already carries its own
 * fixed amount and appending to it would break the URL, so anything with a path, a query or a
 * different host is passed through exactly as configured. That is also the upgrade path: the
 * amount here is pre-filled rather than locked, and a payer can still edit it, where a payment
 * link created in PayPal cannot be edited. Set PAYPAL_LINK to one of those and this leaves it
 * alone.
 */
export function payLink(env: OutboundEnv): string {
  const link = (env.PAYPAL_LINK || '').trim().replace(/\/+$/, '');
  const price = (env.LISTING_PRICE_USD || '').trim();
  if (!link || !/^\d+(\.\d{1,2})?$/.test(price)) return link;
  const bare = /^https?:\/\/(www\.)?(paypal\.com\/paypalme|paypal\.me)\/[A-Za-z0-9._-]+$/i;
  return bare.test(link) ? `${link}/${price}USD` : link;
}

function from(env: OutboundEnv): string {
  return env.SUBMISSIONS_FROM || 'hello@lawfirmlistings.com';
}

/**
 * Who to greet, without inventing a person.
 *
 * The form's contact field is filled in by hand, and the hand often types the firm's name into
 * it. The first enquiry this site ever received did exactly that: contact "Arash Law", firm
 * "Arash Law", and an office address rather than anybody's own. Greeting that as "Dear Arash"
 * guesses a first name out of a company name and addresses somebody who may not exist, and the
 * person who opens an office mailbox is usually not the founder whose name is on the door.
 *
 * Where the contact is the firm, or absent, the email greets the firm. Only a contact that is
 * actually a different name gets a first name.
 */
function greeting(e: Enquiry): string {
  const contact = (e.contact || '').trim();
  const firm = (e.firm || '').trim();
  const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!contact || (firm && squash(contact) === squash(firm))) {
    return firm ? `Dear ${firm} team,` : 'Hello,';
  }
  return `Dear ${contact.split(/\s+/)[0]},`;
}

/**
 * The instant acknowledgement.
 *
 * It exists so a firm knows the form worked, and it is the one email that must never say anything
 * we might have to take back: no eligibility, no price, no timeline we cannot hold. Twelve working
 * hours is the promise Sebastián set, and it is the only commitment in here.
 */
export function ackBody(e: Enquiry): { subject: string; text: string } {
  return {
    subject: `We have your enquiry, ${e.firm}`,
    text: [
      greeting(e),
      '',
      `Thank you for asking about a listing for ${e.firm}. This is an automatic note to confirm`,
      'it reached us, with the details you sent:',
      '',
      `  Firm:     ${e.firm}`,
      e.website ? `  Website:  ${e.website}` : null,
      e.city ? `  Market:   ${e.city}` : null,
      e.practice ? `  Practice: ${e.practice}` : null,
      '',
      'A person will read it and reply within 12 working hours.',
      '',
      'One thing worth saying now, because it is the question most firms ask first: a listing',
      'here is not sold. Eligibility is measured against public records and against what your',
      'own site publishes, and no payment changes a score, a gate or a tier. What we will do',
      'next is read your site and tell you where you stand.',
      '',
      'Law Firm Listings',
      'https://lawfirmlistings.com/methodology/',
    ].filter(present).join('\n'),
  };
}

/**
 * The follow-up, hours later, in the register Sebastián already sells in: short, first name,
 * numbered requirements, the price, the sign-off.
 *
 * One line of his own template is deliberately absent. His reads "In this case, BESAP applies
 * perfectly", and he wrote that to a company he had already looked at. This goes to everyone who
 * fills the form, including firms that fail the first requirement, so it says we are reading the
 * site and will tell them where they stand. Telling a firm it qualifies before anybody has looked
 * is the one sentence here that would have to be taken back.
 *
 * The price and the link are read from the environment. Where either is missing the sentence
 * changes rather than the number being guessed at.
 */

export function pitchBody(e: Enquiry, env: OutboundEnv): { subject: string; text: string } {
  const price = (env.LISTING_PRICE_USD || '').trim();
  const link = payLink(env);
  // One letter, whether or not the firm is already in the directory.
  //
  // It branched for a day, on the request the firm picked, and Sebastián removed the branch:
  // two letters is two things to keep true, and every sentence that needed the branch turned
  // out to be a sentence worth cutting. What is left never asserts whether this firm is
  // published yet, which is the only fact the two readers do not share, and says instead what
  // a listing does and what it does not reach.
  return {
    // What a firm gets, before what it pays, with its own name in front of both. The old one
    // was "what a listing needs, and what it includes", which describes the email rather than
    // offering anything, and nothing in it would make a managing partner open it.
    // No figure, no list of benefits, no colon-and-pitch. Gmail read the old one, "a dofollow
    // link, your own panel, and 350 USD a year", as an advertisement and filed the message in
    // Promotions, which is where a subject line built like a banner belongs. This one says what
    // the message is about, which is also what somebody answering an enquiry would write.
    // Plain on purpose, and Sebastián's call after reading the alternative. A subject that
    // states the message's argument reads as an opening move; this one reads as the reply to
    // something the firm sent, which is what it is. It also keeps the shape of the
    // acknowledgement that went out an hour earlier, so the two sit together in a thread view.
    //
    // What changed from the version this replaces is only the firm's name: interpolating it
    // pushed the line past 90 characters on a Google Business title and the end was cut off in
    // every client. The name is in the greeting a line later.
    subject: 'Your enquiry about listing your firm',
    text: [
      greeting(e),
      '',
      // The firm's name is not interpolated here. It is in the greeting and in the subject
      // already, and a Google Business title runs to sixty characters, which put a
      // 134-character line through the middle of this paragraph on the firm that prompted it.
      'Thank you for your enquiry. Everything you need in order to decide is below, and so is',
      'what a listing does not change.',
      '',
      // The price is the first thing a reader looks for, so it is the first thing they get, in
      // the one block built to be looked at rather than read. Where no figure is configured the
      // card says a figure is coming instead of inventing one.
      price ? `| ${price} USD a year` : '| A yearly fee',
      price
        ? '| Renewed annually. We notify you before each renewal.'
        : '| We will confirm the figure in our reply. It renews annually.',
      '',
      'What the year includes:',
      '',
      // True for both readers under the rule of 2026-11-05, and worth stating first to each:
      // an unpaid profile carries rel="nofollow" whether or not it is already published, so
      // this is a benefit rather than something either firm already has.
      '  **A dofollow link to your site**, from your profile and from every card your firm',
      '  appears in across the directory. Without a listing a profile links out with',
      '  rel="nofollow", which is how every unpaid profile in this directory links.',
      '',
      '  **Your own panel**, where you maintain your offices, phone, practice areas, languages,',
      '  fee terms and logo, submit the client reviews you want quoted, and file case results',
      '  with a docket number. We review every submission before it is published.',
      '',
      '  **Every sub-score, the evidence behind it, and the right to appeal any of it.**',
      '',
      'What it does not include, and what no amount of money reaches here: a point, a gate, a',
      'tier, or a position in any ranking. Those are measured from public sources and come out',
      'the same for a firm that pays and a firm that does not. Correcting anything we have',
      'wrong about your firm is free and always will be, whether or not you ever pay us.',
      '',
      // The old letter listed the five gates to a stranger and told a published firm it had
      // met them already. Saying how the measurement works, without saying where this firm sits
      // inside it, is true for either reader and is the half somebody wants before paying.
      'How a firm is measured here, paying or not:',
      '',
      '  We read the website the firm publishes, its verified Google listings, and the state',
      '  register where the state publishes one we may query. Five eligibility gates and five',
      '  scoring pillars, with every sub-factor and every weight published in full at',
      '  https://lawfirmlistings.com/methodology/',
      '',
      '  Nothing is sent to us and nothing is filled in. A firm is listed whether it asks to be',
      '  or not, and it is read from the outside either way.',
      '',
      'What happens next:',
      '',
      '1. We reply with where your firm stands today and what is holding it back, within 12',
      '   working hours of your enquiry.',
      '2. You settle the year, and we issue the receipt.',
      '3. We send your sign-in the same day, and the profile becomes yours to maintain.',
      '',
      // A label on its own line and the URL under it. In the text part that reads the way
      // anybody writes a link in an email; in the HTML part emailhtml.ts turns exactly that
      // shape into the one button in this message, set in caps.
      link ? 'Secure your profile:' : null,
      link || null,
      '',
      'We are glad to answer any question before you decide.',
      '',
      'Kind regards,',
      'Sebastián Cardozo',
      'Law Firm Listings',
    ].filter(present).join('\n'),
  };
}

/**
 * One way to send, the one the rest of this Worker already uses.
 *
 * Cloudflare's newer structured builder would be tidier, and the raw EmailMessage is what the
 * list-your-firm form has been delivering through since it was written. Using the proven path for
 * a commercial email to a stranger is worth more than using the newer one, and switching later is
 * one function.
 */
export async function sendTo(env: OutboundEnv, to: string, subject: string, text: string,
                             restrained = false) {
  const sender = from(env);
  // Reply-To used to be spliced into the finished message with a string replace on the
  // MIME-Version line. That worked only as long as mime() emitted exactly that line in exactly
  // that place, which stopped being true the moment the message grew a second part. It is a
  // parameter now.
  const raw = mime(sender, to, subject, text, {
    replyTo: env.REPLY_TO,
    footer: 'Law Firm Listings measures what US law firms publish about themselves and'
      + ' scores it against public records.',
    restrained,
  });
  const { EmailMessage } = await import('cloudflare:email');
  await env.EMAIL.send(new EmailMessage(sender, to, raw));
}

/**
 * The reminder, which is the only thing here addressed to us rather than to a firm.
 *
 * The acknowledgement promises the firm that a person will read its message and reply within 12
 * working hours. Nothing watched whether that happened. One firm wrote on 28 October, got the
 * acknowledgement, got the quote six hours later, and waited six days: both automatic messages
 * worked perfectly and the one a person owed it never went.
 *
 * A Worker cannot read a mailbox, so it cannot know whether the reply was sent. What it can do
 * is ask. This fires once, hours later, to us, and every email we get about the enquiry carries
 * a link that cancels it. Answer the firm, click the link, and the reminder never arrives;
 * ignore both and it does.
 *
 * Queued for every enquiry, including the corrections and appeals that get no quote. Those are
 * the ones that most need a person, and they are the ones with nothing else scheduled behind
 * them.
 */
export async function queueReminder(
  env: OutboundEnv, e: Enquiry, origin = SITE,
): Promise<{ key: string; token: string } | null> {
  if (!env.FOLLOWUPS) return null;
  const due = new Date(Date.now() + reminderHours(env) * 60 * 60 * 1000);
  const key = `reminder:${due.toISOString()}:${crypto.randomUUID().slice(0, 8)}`;
  const token = crypto.randomUUID().replace(/-/g, '');
  await env.FOLLOWUPS.put(key, JSON.stringify({
    ...e, due: due.toISOString(), queuedAt: new Date().toISOString(), token, origin,
    // The record carries its own key and token, because the reminder is the one email that
    // builds the cancel link from the stored copy rather than from the caller's. The caller
    // learns them from the return value below, hours after this record was written, so a
    // record that did not keep them produced a reminder with no way to stop the next one.
    reminderKey: key, reminderToken: token,
  }), { expirationTtl: 90 * 24 * 60 * 60 });
  return { key, token };
}

/** The address that cancels a reminder, for the owner's own emails. */
export function answeredUrl(e: Enquiry, origin = SITE): string | null {
  if (!e.reminderKey || !e.reminderToken) return null;
  return `${origin}/api/answered?k=${encodeURIComponent(e.reminderKey)}`
    + `&t=${encodeURIComponent(e.reminderToken)}`;
}

/**
 * Cancels one reminder. Returns what happened, because the page says it back.
 *
 * The token is checked as well as the key. The key is in the address of a link sent by email,
 * and an address in an email is not a secret: it travels through our mail provider, the
 * recipient's, and whatever scans either of them.
 */
export async function cancelReminder(
  env: OutboundEnv, key: string, token: string,
): Promise<'cancelled' | 'gone' | 'denied'> {
  if (!env.FOLLOWUPS || !key.startsWith('reminder:')) return 'denied';
  const raw = await env.FOLLOWUPS.get(key);
  if (!raw) return 'gone';
  try {
    const rec = JSON.parse(raw) as { token?: string };
    if (!rec.token || rec.token !== token) return 'denied';
  } catch {
    return 'denied';
  }
  await env.FOLLOWUPS.delete(key);
  return 'cancelled';
}

/**
 * The second and last message, and who it goes to depends on what was asked.
 *
 * It used to go to the owner in every case, saying a lead was unanswered. Sebastián changed
 * that on 2026-11-05: PayPal tells him when a firm pays, so a reminder aimed at him is a
 * reminder he does not need, and the message worth sending is the one that reaches the firm.
 *
 * A correction or an appeal is the exception and it matters. That sender was never quoted and
 * never will be, so chasing it would be selling to somebody who asked us to fix something we
 * got wrong, which is the one thing this directory promises is free. Those still go to the
 * owner, because a correction nobody answered is a person's job and always was.
 */
export function reminderBody(
  e: Enquiry & { queuedAt?: string }, env: OutboundEnv, origin = SITE,
): { to: 'firm' | 'owner'; subject: string; text: string } {
  const price = (env.LISTING_PRICE_USD || '').trim();
  const link = payLink(env);
  const url = answeredUrl(e, origin);
  // Measured rather than assumed. A send that fails stays queued and is retried, so by the time
  // one of these actually arrives it may be a good deal older than REMINDER_HOURS, and an email
  // that opens with a wrong number about its own lateness is not worth reading.
  const since = e.queuedAt ? Date.parse(e.queuedAt) : NaN;
  const waited = Number.isFinite(since)
    ? Math.max(1, Math.round((Date.now() - since) / 3600000))
    : reminderHours(env);

  if (isFreeRequest(e.request)) {
    return {
      to: 'owner',
      subject: `Still unanswered: ${e.firm}`,
      text: [
        `${waited} hours ago this firm wrote in, and nothing here says a person has replied.`,
        'It asked for something we do not charge for, so no second message went after it and',
        'none will. A person is the only thing that was ever going to answer it.',
        '',
        `  Firm:     ${e.firm}`,
        `  Contact:  ${e.contact}`,
        `  Reply to: ${e.email}`,
        e.website ? `  Website:  ${e.website}` : null,
        e.city ? `  Market:   ${e.city}` : null,
        e.request ? `  Asked:    ${e.request}` : null,
        '',
        'If you have already written to them, say so and this stops:',
        url || '  (no cancel link: this reminder was queued before the link existed)',
        '',
        'This is the only reminder. Nothing else will chase it.',
      ].filter(present).join('\n'),
    };
  }

  return {
    to: 'firm',
    // Specific and true, and it is the sentence the firm has the strongest reason to open.
    // Not a banner: no figure, no offer, no exclamation. The thing it names is a fact about
    // their own page that they can check in ten seconds.
    subject: 'Your profile stays up. Your link is what changes.',
    text: [
      greeting(e),
      '',
      `You asked about a listing ${waited} hours ago and we sent the terms. Nothing has`,
      'happened since, which is a fine answer, and this is the only time we will ask.',
      '',
      'The part worth repeating, because it is the part firms misread:',
      '',
      '  **Your profile stays published whether or not you pay.** We publish it without',
      '  asking and we measure it from the outside, and that does not change.',
      '',
      '  **Your outbound link is what changes.** Without a listing your profile links to',
      '  your site with rel="nofollow", which passes nothing. With one it is followed, from',
      '  your profile and from every card your firm appears in across the directory.',
      '',
      '  **And the panel**, where you maintain your offices, phone, practice areas, fee',
      '  terms and logo, file case results with a docket number, and see every sub-score',
      '  with the evidence under it.',
      '',
      price
        ? `It is ${price} USD a year, and it moves no point of your score in either direction.`
        : 'It moves no point of your score in either direction.',
      'The score, the gates, the tier and your position in every ranking are measured from',
      'public sources and come out the same whether you pay us or never speak to us again.',
      '',
      'If anything we publish about your firm is wrong, tell us and we will fix it. That is',
      'free, it has always been free, and it does not depend on this.',
      '',
      link ? 'Secure your listing:' : null,
      link || null,
      '',
      'If the answer is no, you need not reply. Nothing further is sent either way.',
      '',
      'Kind regards,',
      'Sebastián Cardozo',
      'Law Firm Listings',
    ].filter(present).join('\n'),
  };
}
/** Queued under the minute it is due, so the cron can ask for everything up to now. */
export async function queueFollowUp(env: OutboundEnv, e: Enquiry): Promise<string | null> {
  if (!env.FOLLOWUPS) return null;
  const due = new Date(Date.now() + hours(env) * 60 * 60 * 1000);
  const key = `followup:${due.toISOString()}:${crypto.randomUUID().slice(0, 8)}`;
  await env.FOLLOWUPS.put(key, JSON.stringify({ ...e, due: due.toISOString() }), {
    // Three months, so a message nobody ever drained does not live in the store forever.
    expirationTtl: 90 * 24 * 60 * 60,
  });
  return key;
}

/**
 * Tells the owner that the quote went out.
 *
 * The acknowledgement and the quote are both sent to the firm with nobody watching, and the
 * second one goes hours later, from a cron, naming a price. Knowing it happened is what turns
 * "an automation runs somewhere" into a pipeline somebody can work: the moment this arrives is
 * the moment to expect a reply, and if no reply comes it is the moment to follow up by hand.
 *
 * It repeats the firm's own details rather than only its name, because the useful version of
 * this notice is one that can be acted on without opening anything else.
 */
export function ownerNoticeBody(e: Enquiry, env: OutboundEnv): { subject: string; text: string } {
  const price = (env.LISTING_PRICE_USD || '').trim();
  const text = [
    `The quote went out to ${e.firm}.`,
    '',
    `  Firm:     ${e.firm}`,
    `  Sent to:  ${e.email}`,
    e.website ? `  Website:  ${e.website}` : null,
    e.city ? `  Market:   ${e.city}` : null,
    e.practice ? `  Practice: ${e.practice}` : null,
    price ? `  Quoted:   ${price} USD a year` : null,
    '',
    'They have the requirements, what the year includes, and the payment link. Nothing else',
    'goes out automatically, so the next move is theirs or yours.',
    '',
    `Their enquiry came in ${hours(env)} hours ago.`,
    '',
    // The same link the reminder carries. A notice that only reports is a notice you learn to
    // skim; this one can be acted on from the preview line.
    ...(answeredUrl(e) ? [
      // The link stops a message to the firm now, not a message to you, so the line has to say
      // whose inbox is at stake. Clicking it after they have paid is the difference between a
      // new customer and a new customer being asked whether they are still interested.
      isFreeRequest(e.request)
        ? `You will be reminded at ${reminderHours(env)} hours unless you say you have answered:`
        : `At ${reminderHours(env)} hours we send them one more email, asking once whether they`
          + ' still want it. If they have paid, or you would rather we did not, stop it here:',
      answeredUrl(e) as string,
    ] : []),
  ].filter(present).join('\n');
  return { subject: `Quote sent: ${e.firm}`, text };
}

async function notifyOwner(env: OutboundEnv, e: Enquiry): Promise<void> {
  if (!env.SUBMISSIONS_TO) return;
  const { subject, text } = ownerNoticeBody(e, env);
  await sendTo(env, env.SUBMISSIONS_TO, subject, text);
}

/**
 * Drains what has come due. Called by the cron trigger.
 *
 * The key sorts by ISO date, so "everything due" is every key that sorts at or before now, and no
 * record has to be read to know whether it is time. A send that throws leaves the key in place,
 * so the next run tries again rather than losing the message.
 */
export async function drainReminders(
  env: OutboundEnv,
): Promise<{ sent: number; failed: number }> {
  if (!env.FOLLOWUPS || !env.SUBMISSIONS_TO) return { sent: 0, failed: 0 };
  const now = new Date().toISOString();
  let sent = 0;
  let failed = 0;
  const list = await env.FOLLOWUPS.list({ prefix: 'reminder:' });
  for (const k of list.keys) {
    const dueAt = k.name.split(':').slice(1, -1).join(':');
    if (dueAt > now) continue;
    const raw = await env.FOLLOWUPS.get(k.name);
    if (!raw) continue;
    let rec: Enquiry & { origin?: string };
    try {
      rec = JSON.parse(raw);
    } catch {
      await env.FOLLOWUPS.delete(k.name);
      continue;
    }
    const { to, subject, text } = reminderBody(rec, env, rec.origin || SITE);
    // Where it goes is the message's own answer, not this loop's. A priced enquiry is chased at
    // the firm; a correction or an appeal is raised with the owner, because nobody should be
    // sold anything for asking us to fix what we got wrong. `restrained` for the firm, the same
    // as the follow-up, because that is an unsolicited commercial message and the owner's own
    // mail is not.
    const address = to === 'firm' ? rec.email : env.SUBMISSIONS_TO;
    if (!address) {
      await env.FOLLOWUPS.delete(k.name);
      continue;
    }
    try {
      await sendTo(env, address, subject, text, to === 'firm');
      await env.FOLLOWUPS.delete(k.name);
      sent += 1;
    } catch (err) {
      console.error('reminder failed', k.name, err);
      failed += 1;
    }
  }
  return { sent, failed };
}

export async function drainFollowUps(env: OutboundEnv): Promise<{ sent: number; failed: number }> {
  if (!env.FOLLOWUPS) return { sent: 0, failed: 0 };
  const now = new Date().toISOString();
  let sent = 0;
  let failed = 0;
  const list = await env.FOLLOWUPS.list({ prefix: 'followup:' });
  for (const k of list.keys) {
    const dueAt = k.name.split(':').slice(1, -1).join(':');
    if (dueAt > now) continue;
    const raw = await env.FOLLOWUPS.get(k.name);
    if (!raw) continue;
    let e: Enquiry;
    try {
      e = JSON.parse(raw);
    } catch {
      await env.FOLLOWUPS.delete(k.name);
      continue;
    }
    // Checked again on the way out, not only on the way in. submit() stopped queueing these,
    // and a queue is a place where yesterday's decisions wait: anything already sitting here
    // when that shipped was written by the old rule.
    if (isFreeRequest(e.request)) {
      await env.FOLLOWUPS.delete(k.name);
      console.log(`follow-up dropped for ${e.firm}: ${e.request}`);
      continue;
    }
    const { subject, text } = pitchBody(e, env);
    try {
      await sendTo(env, e.email, subject, text, true);
      await env.FOLLOWUPS.delete(k.name);
      sent += 1;
      // The quote went out hours after the enquiry did, with nobody watching. Say so, so the
      // next thing that happens is somebody waiting for a reply rather than somebody finding
      // out a week later that one was promised. This cannot fail the send: the firm has its
      // quote either way, and a notification that did not arrive is ours to notice.
      try {
        await notifyOwner(env, e);
      } catch (err) {
        console.error('follow-up notice failed', k.name, err);
      }
    } catch (err) {
      // Left in place on purpose: the next run retries. A lost follow-up is a lost lead.
      console.error('follow-up failed', k.name, err);
      failed += 1;
    }
  }
  return { sent, failed };
}

/** A listed firm, as the notice needs it. Nothing here is asked of the firm; it is all measured. */
export interface Listed {
  firm: string;
  slug: string;
  tier: string;
  total: number;
  city?: string;
  state?: string;
  openGates?: number;
}

/**
 * The one email we would send to a firm that never wrote to us.
 *
 * Everything else here answers an enquiry. This does not, and that difference is the whole
 * design. We published a page about somebody's business without asking them, which is ordinary
 * for a directory and is still a thing they are entitled to be told. So the message is the
 * telling: your profile exists, here is what it says, here is where you correct it.
 *
 * What it deliberately does not do is sell. There is no price in it, no payment link and no
 * list of benefits, because the first message to a stranger that opens with a figure is an
 * advertisement wearing a notice's clothes, and this directory's whole argument is that it is
 * not for sale. The paid listing is one plain sentence near the end with a link to the page
 * that explains it, which is disclosure rather than a pitch.
 *
 * Two things it carries that the enquiry emails do not need, because this one is unsolicited:
 * the postal address of the company, and a way to be left alone that works. Both are required
 * of a commercial email in the United States and both are cheap, so they are here whether or
 * not a regulator would call this message commercial.
 */
export function listedNoticeBody(f: Listed, env: OutboundEnv): { subject: string; text: string } {
  const profile = `https://lawfirmlistings.com/firms/${f.slug}/`;
  const where = [f.city, f.state].filter(Boolean).join(', ');
  const certified = ['Certified', 'Distinguished', 'Elite'].includes(f.tier);
  return {
    // Says what the message is about and nothing else. Not "congratulations", which this is
    // not, and not the score, which belongs in the message rather than in a subject line that
    // would read as a banner and land in Promotions the way the old pitch did.
    subject: `Your firm's profile on Law Firm Listings`,
    text: [
      `Dear ${f.firm} team,`,
      '',
      'We publish a directory of US law firms and we have a profile for your firm. You did not',
      'ask us to, and we did not ask you: everything on it is read from your own website and',
      'from public records, the way a directory entry is written. We are writing because a',
      'public page about your practice exists and you should be able to see it and correct it.',
      '',
      'Your profile:',
      profile,
      '',
      certified
        ? `| ${f.firm} is LFL ${f.tier}`
        : `| ${f.firm} is listed${where ? ` in ${where}` : ''}`,
      certified
        ? `| ${f.total} of 100${where ? `, ${where}` : ''}, read from public records`
        : `| Scored ${f.total} of 100, read from public records`,
      '',
      certified
        ? 'That tier is not something you bought or applied for, and it is not something we can'
        : 'The score is not something you bought or applied for, and it is not something we can',
      'sell you. Every gate and every weight behind it is published in full at',
      'https://lawfirmlistings.com/methodology/',
      '',
      // Wrapped by hand like every other block here, because the text half is read in a
      // monospaced window by somebody's mail client and a 123-character line is a scroll bar.
      f.openGates === 1
        ? 'There is one check we could not complete for your firm. The profile says which,'
        : f.openGates ? `There are ${f.openGates} checks we could not complete for your firm.`
        : null,
      f.openGates === 1
        ? 'and why, and it is not counted against you.'
        : f.openGates ? 'The profile says which, and why, and none of them is counted against you.'
        : null,
      f.openGates ? '' : null,
      'If anything on it is wrong:',
      '',
      '  **Write back and tell us.** We read every correction and we publish them. There is no',
      '  charge for a correction and never will be, including a correction that raises your',
      '  score.',
      '',
      '  **We are most often wrong about your roster**, because we can only count the lawyers',
      '  your own site names. If your attorneys are listed somewhere we did not find, point us',
      '  at the page.',
      '',
      'What the annual listing gives you:',
      '',
      // Taken from PRODUCTS and ALWAYS_FREE in src/data/listing.ts, which is the authority on
      // what is free and what is not. The split moved once: running your own profile used to
      // be free and is now the product. What stays free is the half about our accuracy rather
      // than about your presentation, because charging for that would be charging a firm to
      // correct us.
      '  **You edit your own details.** Your phone number, up to four office addresses, the',
      '  languages your firm works in, how you charge, whether the first consultation is free,',
      '  and your availability: a 24/7 intake line, hospital visits, home visits.',
      '',
      '  **You file case results with their docket or index number**, which is the only kind',
      '  this directory marks verified, and we look each one up.',
      '',
      '  **You see every sub-score with the evidence under it.**',
      '',
      '  **A followed link to your site**, from your profile and from every card your firm',
      '  appears in across the directory.',
      '',
      '  **Your own logo**, in place of your initials.',
      '',
      '  **The client reviews you want quoted**, read by us before they appear.',
      '',
      'It moves no part of the score. The points, the gates and the tier are measured the same',
      'way for a firm that pays and a firm that does not, and no part of them is for sale.',
      '',
      'Every change is read by a person before it goes live, usually the same day.',
      '',
      // Two separate asks, in the order that costs the firm least. A correction is free and is
      // the thing we actually need; the listing is offered rather than pushed.
      'Correcting us takes one reply and costs nothing. If you would rather run the page',
      'yourself, write back and we will send the annual figure and your sign-in the same day,',
      'along with where your firm stands against each of the five eligibility checks.',
      '',
      'What the listing covers:',
      'https://lawfirmlistings.com/list-your-firm/#form',
      '',
      'Kind regards,',
      'Sebastián Cardozo',
      'Law Firm Listings',
      '',
      'CASICIEN SRL, Víctor Soliño 349, 11300 Montevideo, Uruguay.',
      'We wrote to you once because we publish a profile about your firm. Reply with the word',
      'REMOVE and we will not write to you again.',
    ].filter(present).join('\n'),
  };
}
