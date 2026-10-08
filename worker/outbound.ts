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
  SUBMISSIONS_FROM?: string;
  /** Where a firm's reply should land. Falls back to the sender. */
  REPLY_TO?: string;
  /** The annual listing fee, as it should read: "299". Unset means the email promises a figure. */
  LISTING_PRICE_USD?: string;
  /** A PayPal link. Unset means the email says we will send one. */
  PAYPAL_LINK?: string;
  /** Hours before the second email. Unset is 6. */
  FOLLOWUP_HOURS?: string;
}

export interface Enquiry {
  firm: string;
  contact: string;
  email: string;
  website?: string;
  city?: string;
  practice?: string;
}

const hours = (env: OutboundEnv) => {
  const n = Number(env.FOLLOWUP_HOURS);
  return Number.isFinite(n) && n > 0 && n < 24 * 30 ? n : 6;
};

/** The sender's own name, so a reply does not go to a no-reply nobody reads. */
function from(env: OutboundEnv): string {
  return env.SUBMISSIONS_FROM || 'hello@lawfirmlistings.com';
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
      `Hello ${e.contact},`,
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
  const link = (env.PAYPAL_LINK || '').trim();
  const money = price
    ? `A listing on lawfirmlistings.com is ${price} USD a year (payment through PayPal)`
      + ' and a firm has to meet these:'
    : 'A listing on lawfirmlistings.com runs on a yearly fee, which we will confirm in our reply,'
      + ' and a firm has to meet these:';
  const first = (e.contact || '').trim().split(/\s+/)[0] || 'there';
  return {
    subject: `${e.firm}: what a listing needs, and what it includes`,
    text: [
      `Hey ${first}! How are you?`,
      '',
      `Thanks for writing about ${e.firm}. Here is the whole of it so you can decide without a`,
      'call.',
      '',
      money,
      '',
      '1. A site that names its lawyers, over HTTPS, with a working phone number. This is the',
      '   one most firms fail and the only one entirely in your hands.',
      '2. Every attorney you name holds a current licence, which we read from the state register',
      '   where the state publishes one we are allowed to query.',
      '3. No attorney carrying a disbarment, a suspension or a disciplinary resignation.',
      '4. A registered entity and at least one office somebody can walk into.',
      '',
      'What the year includes:',
      '',
      '  Your own panel, where you correct your offices, phone, practice areas, languages and',
      '  fee terms, upload your logo, offer the client reviews you want quoted and submit case',
      '  results with a docket number. We review anything you send before it appears.',
      '',
      '  A do-follow link to your site from your profile and from every card you appear in.',
      '',
      '  Every sub-score and the evidence behind it, and the right to appeal any of it.',
      '',
      'What it does not include, and I would rather say it now than later: points, a gate, a tier',
      'or a place in any ranking. Those are measured and they are the same for a firm that pays',
      'and a firm that does not. The full method is at https://lawfirmlistings.com/methodology/',
      '',
      'We are reading your site now and will tell you exactly where you stand against the four',
      'above. If something is missing it is usually a text edit on your end rather than a problem.',
      '',
      // A label on its own line and the URL under it. In the text part that reads the way
      // anybody writes a link in an email; in the HTML part emailhtml.ts turns exactly that
      // shape into a button, which is the one thing in this message somebody has to click.
      link ? 'Payment, when you are ready:' : null,
      link || null,
      link ? '' : null,
      'It renews once a year and we remind you before it does.',
      '',
      'Let me know if you are interested.',
      '',
      'Have a great day,',
      'Sebastián',
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
export async function sendTo(env: OutboundEnv, to: string, subject: string, text: string) {
  const sender = from(env);
  // Reply-To used to be spliced into the finished message with a string replace on the
  // MIME-Version line. That worked only as long as mime() emitted exactly that line in exactly
  // that place, which stopped being true the moment the message grew a second part. It is a
  // parameter now.
  const raw = mime(sender, to, subject, text, {
    replyTo: env.REPLY_TO,
    footer: 'Law Firm Listings measures what US law firms publish about themselves and'
      + ' scores it against public records.',
  });
  const { EmailMessage } = await import('cloudflare:email');
  await env.EMAIL.send(new EmailMessage(sender, to, raw));
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
 * Drains what has come due. Called by the cron trigger.
 *
 * The key sorts by ISO date, so "everything due" is every key that sorts at or before now, and no
 * record has to be read to know whether it is time. A send that throws leaves the key in place,
 * so the next run tries again rather than losing the message.
 */
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
    const { subject, text } = pitchBody(e, env);
    try {
      await sendTo(env, e.email, subject, text);
      await env.FOLLOWUPS.delete(k.name);
      sent += 1;
    } catch (err) {
      // Left in place on purpose: the next run retries. A lost follow-up is a lost lead.
      console.error('follow-up failed', k.name, err);
      failed += 1;
    }
  }
  return { sent, failed };
}
