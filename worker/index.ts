/**
 * The only server this site has.
 *
 * Everything else here is static: Astro builds `dist` and Cloudflare serves it. That is the right
 * shape for a directory whose pages are computed from committed data, and it left one thing
 * impossible, which was receiving anything. The list-your-firm form opened the visitor's mail
 * program with a pre-written message, and a mailto asks somebody to have a mail client, to
 * recognise what just happened, and to press send in a second application. Firms did not.
 *
 * So there is a Worker now, and it does exactly one thing besides handing back files: it accepts
 * a form submission and posts it to the inbox. No third party is involved. Cloudflare's own
 * `send_email` binding delivers to a destination address verified in the account, which means no
 * API key to leak, no vendor to sign up with, and no bill.
 *
 * The address is deliberately not in this file. It arrives as the SUBMISSIONS_TO secret, because
 * this repository is public and a working address in a public repo is a gift to a scraper.
 */
import { EmailMessage } from 'cloudflare:email';
import { mime, json, present } from './mail';
import { handlePanel } from './panel';
import { ackBody, drainFollowUps, queueFollowUp, sendTo } from './outbound';

interface Env {
  ASSETS: Fetcher;
  EMAIL: { send(message: EmailMessage): Promise<void> };
  /** Where submissions go. A Worker secret, never a file in this repository. */
  SUBMISSIONS_TO?: string;
  /** The address the message is sent from. Must be on a domain this account holds. */
  SUBMISSIONS_FROM?: string;
  /** Firm panel: accounts and pending change-sets. One namespace, two key prefixes. */
  PANEL?: KVNamespace;
  /** Firm panel: signs the session cookie and the one-click approval link. */
  PANEL_SECRET?: string;
  /** Delayed follow-up emails, keyed by the minute they are due. */
  FOLLOWUPS?: KVNamespace;
  /** Where a firm's reply should land, if not the sending address. */
  REPLY_TO?: string;
  LISTING_PRICE_USD?: string;
  PAYPAL_LINK?: string;
  FOLLOWUP_HOURS?: string;
}

/** What the form may send, and the longest each field may be. Anything else is dropped. */
const FIELDS: Record<string, number> = {
  firm: 120, website: 200, city: 80, practice: 80,
  contact: 120, role: 80, email: 160, phone: 40,
  request: 80, attorneys: 200, notes: 4000, understood: 20,
};

const LABELS: Record<string, string> = {
  firm: 'Firm', website: 'Website', city: 'City and state', practice: 'Primary practice area',
  contact: 'Contact', role: 'Role', email: 'Email', phone: 'Phone',
  request: 'What they are asking for', attorneys: 'Page naming their attorneys',
  notes: 'Anything else', understood: 'Confirmed the score is not for sale',
};



async function submit(request: Request, env: Env): Promise<Response> {
  // Say which half is missing rather than "not connected". The first version said only that,
  // and the two halves fail for different reasons and are fixed in different places: the
  // destination is a secret plus a verified address in Email Routing, the sender is a line in
  // wrangler.jsonc. Naming them reveals no value and no address, only whether a setting exists,
  // and it is the difference between a diagnosis and a guess.
  if (!env.SUBMISSIONS_TO) {
    return json(503, {
      error: 'No destination is configured. SUBMISSIONS_TO is missing from this Worker, '
        + 'or the deploy has not picked it up yet.',
    });
  }
  if (!env.SUBMISSIONS_FROM) {
    return json(503, {
      error: 'No sender is configured. SUBMISSIONS_FROM is missing from this Worker.',
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: 'That submission could not be read.' });
  }

  // A field no human can see and a bot fills in anyway. Silent success: telling a bot it failed
  // is telling it how to succeed.
  if (String(form.get('company') ?? '').trim()) return json(200, { ok: true });

  const values: Record<string, string> = {};
  for (const [name, limit] of Object.entries(FIELDS)) {
    const raw = String(form.get(name) ?? '').trim();
    if (raw) values[name] = raw.slice(0, limit);
  }

  const missing = ['firm', 'contact', 'email'].filter(k => !values[k]);
  if (missing.length) {
    return json(400, { error: `Missing: ${missing.join(', ')}.` });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) {
    return json(400, { error: 'That email address does not look right.' });
  }

  const body = [
    `${values.firm} has asked to be listed.`,
    '',
    ...Object.keys(FIELDS)
      .filter(k => values[k])
      .map(k => `${LABELS[k]}: ${values[k]}`),
    '',
    `Sent from ${new URL(request.url).origin}/list-your-firm/`,
    `Received ${new Date().toISOString()}`,
    request.headers.get('cf-connecting-ip') ? `From IP ${request.headers.get('cf-connecting-ip')}` : null,
  ].filter(present).join('\n');

  try {
    await env.EMAIL.send(new EmailMessage(
      env.SUBMISSIONS_FROM,
      env.SUBMISSIONS_TO,
      mime(env.SUBMISSIONS_FROM, env.SUBMISSIONS_TO,
           `List your firm: ${values.firm}`, body),
    ));
  } catch (err) {
    console.error('send failed', err);
    return json(502, { error: 'We could not deliver that. Please email us directly.' });
  }

  // Everything from here is for the firm rather than for us, and none of it may turn a
  // successful submission into a failed one. A form that worked has worked, whatever happens to
  // the autoresponder, so each piece catches its own error and the response is still 200.
  const enquiry = {
    firm: values.firm, contact: values.contact, email: values.email,
    website: values.website, city: values.city, practice: values.practice,
  };
  // Each of these says what it did, because an automation nobody can watch is one nobody
  // trusts. The firm's name goes in the line and its email address does not: the log answers
  // "did the second email get scheduled, and for when", which needs neither.
  try {
    const ack = ackBody(enquiry);
    await sendTo(env, values.email, ack.subject, ack.text);
    console.log(`ack sent to ${values.firm}`);
  } catch (err) {
    // Sending to an address we have not onboarded a domain for fails here, which is exactly the
    // state of this Worker until lawfirmlistings.com is onboarded as a sending domain.
    console.error('ack failed', err);
  }
  try {
    const key = await queueFollowUp(env, enquiry);
    if (key) console.log(`follow-up for ${values.firm} due ${key.split(':').slice(1, -1).join(':')}`);
    else console.warn('follow-up not queued: no FOLLOWUPS namespace bound');
  } catch (err) {
    console.error('follow-up queue failed', err);
  }

  return json(200, { ok: true });
}

/**
 * One site, one hostname.
 *
 * Both lawfirmlistings.com and www.lawfirmlistings.com were routed here and both answered 200
 * with the whole site, so every page existed at two addresses. Cloudflare counted 17.01k requests
 * on the apex and 6.51k on the www over thirty days, which is a quarter of the crawling spent on
 * copies.
 *
 * Every page already declares the apex as its canonical, so a crawler reaching the www copy is
 * handed a page telling it to go somewhere else. Search Console files that as "alternate page
 * with proper canonical tag", which is not indexed, and a property verified on the www prefix
 * reports the whole site as one page.
 *
 * A canonical tag is a hint. A 301 is not.
 */
const CANONICAL_HOST = 'lawfirmlistings.com';

function canonicalRedirect(url: URL): Response | null {
  if (url.hostname !== `www.${CANONICAL_HOST}`) return null;
  const to = new URL(url.toString());
  to.hostname = CANONICAL_HOST;
  // 301 rather than 302: a crawler only drops the old address from its index for a permanent one.
  return Response.redirect(to.toString(), 301);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const redirect = canonicalRedirect(url);
    if (redirect) return redirect;
    // The firm panel, which is the only part of this site that is not a file.
    if (url.pathname === '/claim' || url.pathname.startsWith('/claim/')) {
      return handlePanel(request, env);
    }
    if (url.pathname === '/api/list-your-firm') {
      if (request.method !== 'POST') {
        return json(405, { error: 'POST only.' });
      }
      return submit(request, env);
    }
    // Everything else is a file. The assets binding keeps the 404 page and the trailing-slash
    // handling the site was already configured for.
    return env.ASSETS.fetch(request);
  },

  /**
   * The cron trigger, which exists because a Worker cannot wait six hours.
   *
   * Follow-ups are stored under a key that sorts by the minute they are due, so "everything due"
   * is every key at or before now and no record has to be read to know whether it is time. A send
   * that throws leaves its key in place and the next run retries it, because a lost follow-up is
   * a lost lead.
   */
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const { sent, failed } = await drainFollowUps(env);
    if (sent || failed) console.log(`follow-ups sent ${sent}, failed ${failed}`);
  },
};
