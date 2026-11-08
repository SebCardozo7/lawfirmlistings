/**
 * The link in the footer, and the one page on this site that must never fail.
 *
 * Every letter to a firm that did not write to us carries it, because US commercial email
 * requires a working opt-out and because it is what we would want. A page that half works, or
 * that asks the reader to sign in, or that says "we will process your request" and queues it
 * somewhere, is not an opt-out. This writes the record before it answers, and the record is
 * what worker/prospects.ts checks before anything is sent.
 *
 * GET shows a confirmation with one button rather than unsubscribing on sight. A mail client
 * that prefetches links would otherwise unsubscribe people who never clicked, and scanners
 * that follow every URL in a message are common enough that this is a real way to lose a list
 * silently. One click on the page, which is a POST, does it.
 *
 * It takes the address in the URL and nothing else. There is nothing secret in it: the
 * recipient knows their own address, the worst a stranger can do with a guess is stop us from
 * emailing somebody we were probably not going to email anyway, and the alternative, a signed
 * token, means a firm that forwards the email to the colleague who handles this cannot be
 * unsubscribed by that colleague. An opt-out that is hard to use is not one.
 */
import { optOut, isOptedOut } from './prospects';

export interface UnsubEnv {
  FOLLOWUPS?: KVNamespace;
}

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const CSS = ':root{--ink:#0A0A0C;--muted:#6F7079;--line:#E7E7E2;--ground:#F6F6F3;--good:#1C6B4A}'
  + '@media(prefers-color-scheme:dark){:root{--ink:#F4F4F2;--muted:#8E8E88;--line:#2B2B30;'
  + '--ground:#141418;--good:#6FD3A8;color-scheme:dark}}'
  + 'body{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
  + 'background:var(--ground);color:var(--ink);margin:0;'
  + 'display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}'
  + 'main{max-width:30rem}h1{font-size:1.35rem;margin:0 0 10px}'
  + 'p{margin:0 0 14px;color:var(--muted)}strong{color:var(--ink)}'
  + 'button{font:inherit;padding:11px 20px;border-radius:9px;border:1px solid var(--ink);'
  + 'background:var(--ink);color:var(--ground);cursor:pointer}'
  + '.done{color:var(--good);font-weight:600}';

function page(title: string, body: string, status = 200): Response {
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow">'
    + `<title>${esc(title)}</title><style>${CSS}</style><main>${body}</main>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
  );
}

export async function handleUnsubscribe(
  request: Request, env: UnsubEnv, url: URL,
): Promise<Response> {
  const email = (url.searchParams.get('e') || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return page('Nothing to unsubscribe',
      '<h1>Nothing to unsubscribe</h1>'
      + '<p>That link is missing an address. If you were sent it by us and it does not work, '
      + 'reply to the email and it will be dealt with by a person.</p>', 400);
  }

  if (request.method === 'POST') {
    const ok = await optOut(env, email, 'the unsubscribe link');
    if (!ok) {
      return page('That did not work',
        '<h1>That did not work</h1>'
        + '<p>Reply to the email instead and a person will take you off the list the same day. '
        + 'Nothing further will be sent to you in the meantime.</p>', 500);
    }
    return page('Done',
      '<h1 class="done">Done</h1>'
      + `<p>We will not write to <strong>${esc(email)}</strong> again.</p>`
      + '<p>Your firm\'s profile stays published and is measured the same way it always was. '
      + 'That does not depend on hearing from us, and correcting anything we have wrong is '
      + 'still free: reply to the original email any time.</p>');
  }

  if (await isOptedOut(env, email)) {
    return page('Already done',
      '<h1 class="done">Already done</h1>'
      + `<p>We are not writing to <strong>${esc(email)}</strong>.</p>`);
  }

  // A button rather than a link, so a mail client prefetching the URL cannot unsubscribe
  // somebody who never clicked.
  return page('Unsubscribe',
    '<h1>Stop emails to this address?</h1>'
    + `<p>We will not write to <strong>${esc(email)}</strong> again.</p>`
    + `<form method="post"><input type="hidden" name="e" value="${esc(email)}">`
    + '<button>Unsubscribe</button></form>');
}
