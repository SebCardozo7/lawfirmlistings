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

interface Env {
  ASSETS: Fetcher;
  EMAIL: { send(message: EmailMessage): Promise<void> };
  /** Where submissions go. A Worker secret, never a file in this repository. */
  SUBMISSIONS_TO?: string;
  /** The address the message is sent from. Must be on a domain this account holds. */
  SUBMISSIONS_FROM?: string;
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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' },
  });

/**
 * A plain-text RFC 5322 message, hand-written rather than pulled from a library.
 *
 * The alternative is a MIME builder dependency for a message that is a subject, two addresses
 * and a body of short lines. Every value is escaped into a header only after the line breaks are
 * stripped out of it, because a newline inside a header is how somebody injects a second header.
 */
function mime(from: string, to: string, subject: string, body: string): string {
  const header = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();
  const lines = [
    `From: Law Firm Listings <${header(from)}>`,
    `To: <${header(to)}>`,
    `Subject: ${header(subject)}`,
    `Message-ID: <${crypto.randomUUID()}@lawfirmlistings.com>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body.replace(/\r?\n/g, '\r\n'),
  ];
  return lines.join('\r\n');
}

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
    request.headers.get('cf-connecting-ip') ? `From IP ${request.headers.get('cf-connecting-ip')}` : '',
  ].filter(Boolean).join('\n');

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

  return json(200, { ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
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
};
