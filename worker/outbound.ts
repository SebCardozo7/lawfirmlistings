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
  return {
    // What a firm gets, before what it pays, with its own name in front of both. The old one
    // was "what a listing needs, and what it includes", which describes the email rather than
    // offering anything, and nothing in it would make a managing partner open it.
    // No figure, no list of benefits, no colon-and-pitch. Gmail read the old one, "a dofollow
    // link, your own panel, and 350 USD a year", as an advertisement and filed the message in
    // Promotions, which is where a subject line built like a banner belongs. This one says what
    // the message is about, which is also what somebody answering an enquiry would write.
    subject: `Your enquiry about listing ${e.firm}`,
    text: [
      greeting(e),
      '',
      `Thank you for your enquiry about ${e.firm}. Everything required to make a decision is`,
      'set out below.',
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
      '  **A dofollow link to your site**, from your profile and from every card your firm',
      '  appears in across the directory.',
      '',
      '  **Your own panel**, where you maintain your offices, phone, practice areas, languages,',
      '  fee terms and logo, submit the client reviews you want quoted, and file case results',
      '  with a docket number. We review every submission before it is published.',
      '',
      '  **Every sub-score, the evidence behind it, and the right to appeal any of it.**',
      '',
      'The fee does not include points, a gate, a tier, or a position in any ranking. Those are',
      'measured from public records and are identical for a firm that pays and a firm that does',
      'not.',
      '',
      'What your firm has to meet:',
      '',
      '1. **A site that names its lawyers**, served over HTTPS, with a working telephone number.',
      '2. **A current licence** for every attorney named on it.',
      '3. **No outstanding public discipline** against anyone named on it.',
      '4. **A registered entity and a physical office.**',
      '5. **A year in practice and ten client reviews.**',
      '',
      'All five are read from public sources, so there is nothing to send us, and only the first',
      'is within your control. Each one is published in full, with every sub-factor and every',
      'weight, at https://lawfirmlistings.com/methodology/#gates',
      '',
      'What happens next:',
      '',
      `1. We read your site and report where ${e.firm} stands against the five, within 12`,
      '   working hours of your enquiry.',
      '2. You settle the year, and we issue the receipt.',
      '3. We provide your sign-in the same day, and your profile goes live with your link.',
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
      'What taking the listing changes:',
      '',
      '  **You maintain the entry instead of writing to us.** Offices, phone, practice areas,',
      '  languages, fee terms and logo, from your own panel. You can submit the client reviews',
      '  you want quoted and file case results with a docket number, and we check each one',
      '  before it is published.',
      '',
      '  **Your link becomes a followed one**, from your profile and from every card your firm',
      '  appears in across the directory.',
      '',
      '  **Nothing about the score changes.** The points, the gates and the tier are measured',
      '  the same way for a firm that pays and a firm that does not, and no part of them is for',
      '  sale. This buys control of the entry, not a better place in it.',
      '',
      'It is an annual fee. Ask and we will send the figure the same day, together with where',
      `${f.firm} stands against each of the five eligibility checks.`,
      '',
      // Label on its own line, URL under it: emailhtml.ts turns exactly that shape into the
      // one button in the message. It points at the form the Worker already answers, so the
      // price arrives through the path that was built for it instead of in a cold email.
      'Claim your profile:',
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
