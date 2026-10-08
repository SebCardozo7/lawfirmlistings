/**
 * An RFC 5322 message, hand-written rather than pulled from a library.
 *
 * This lived inside index.ts while the list-your-firm form was the only thing that sent mail. The
 * panel sends a second kind and the autoresponder a third, so it moved here rather than being
 * written three times.
 *
 * The alternative is a MIME builder dependency for a message that is a subject, two addresses and
 * a body of short lines. Every value is escaped into a header only after the line breaks are
 * stripped out of it, because a newline inside a header is how somebody injects a second header.
 *
 * Every message goes out as multipart/alternative, and the HTML half is rendered from the text
 * half by emailhtml.ts rather than written beside it. That is the default rather than an option a
 * caller opts into, because the one thing we know about a caller is that it will forget: a firm
 * reading an email from a directory it has never heard of should see the mark it will see on the
 * site, and that should not depend on which of three call sites sent it. `html: false` turns it
 * off where a message really is machine-to-machine.
 *
 * The HTML part is base64. SMTP allows 998 characters on a line and a generated table blows
 * through that without warning; encoding it removes the whole class of problem rather than
 * leaving a line-length bug to be found by a recipient. The text part stays as it is written,
 * declared 8bit because it holds UTF-8 and the default of 7bit would be a lie about it.
 */
import { htmlFromText } from './emailhtml';

export interface MessageOptions {
  /** Where a reply should land, when it is not the sending address. */
  replyTo?: string;
  /** False sends text only. A string is used as the HTML part verbatim. */
  html?: boolean | string;
  /** A line above the footer links, naming who sent this. */
  footer?: string;
}

/**
 * Keeps the blank lines and drops the absent ones, for a body assembled as an array of lines.
 *
 * Three of those bodies ended in .filter(Boolean), which was there to drop the line for a field
 * nobody filled in. It dropped every paragraph break with it, because a blank line is '' and ''
 * is falsy: the two autoresponder emails went out as one unbroken block of fourteen and
 * twenty-seven lines, and so did the notification for every firm that used the form. An absent
 * line is null now, and a blank line is a blank line.
 */
export const present = (l: string | null): l is string => l !== null;

const header = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();

/** UTF-8 to base64, unwrapped. */
function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** UTF-8 to base64, wrapped at 76 characters as RFC 2045 asks. */
function base64(text: string): string {
  const encoded = b64(text);
  const out: string[] = [];
  for (let i = 0; i < encoded.length; i += 76) out.push(encoded.slice(i, i + 76));
  return out.join('\r\n');
}

/**
 * A header value, RFC 2047 encoded when it is not ASCII.
 *
 * A header is ASCII. "López & Humphries" in a Subject is not, and this directory has Spanish
 * firm names in it, so the subject line of the acknowledgement a firm gets is exactly where a
 * raw UTF-8 byte would end up. Gmail guesses at it and other clients print the bytes.
 *
 * Encoded words are capped at 75 characters each, so a long subject becomes several, split on
 * code point boundaries rather than on bytes: cutting a multi-byte character in half produces a
 * word that decodes to a replacement character, which is the bug this is here to avoid.
 */
function headerValue(raw: string): string {
  const v = header(raw);
  // eslint-disable-next-line no-control-regex
  if (!/[^\u0000-\u007F]/.test(v)) return v;
  const words: string[] = [];
  let chunk = '';
  let bytes = 0;
  for (const ch of v) {
    const size = new TextEncoder().encode(ch).length;
    // 45 bytes encodes to 60 base64 characters, which leaves room for =?UTF-8?B?...?= under 75.
    if (bytes + size > 45) {
      words.push(`=?UTF-8?B?${b64(chunk)}?=`);
      chunk = '';
      bytes = 0;
    }
    chunk += ch;
    bytes += size;
  }
  if (chunk) words.push(`=?UTF-8?B?${b64(chunk)}?=`);
  // Folded, because a run of encoded words is only allowed to be split by whitespace.
  return words.join('\r\n ');
}

export function mime(
  from: string,
  to: string,
  subject: string,
  body: string,
  opts: MessageOptions = {},
): string {
  const text = body.replace(/\r?\n/g, '\r\n');
  const head = [
    `From: Law Firm Listings <${header(from)}>`,
    `To: <${header(to)}>`,
    `Subject: ${headerValue(subject)}`,
    `Message-ID: <${crypto.randomUUID()}@lawfirmlistings.com>`,
    `Date: ${new Date().toUTCString()}`,
  ];
  if (opts.replyTo) head.push(`Reply-To: <${header(opts.replyTo)}>`);
  head.push('MIME-Version: 1.0');

  if (opts.html === false) {
    head.push('Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '');
    return head.concat(text).join('\r\n');
  }

  const html = typeof opts.html === 'string'
    ? opts.html
    : htmlFromText(body, { footer: opts.footer });
  const boundary = `lfl-${crypto.randomUUID()}`;
  head.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, '');
  return head.concat([
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64(html),
    `--${boundary}--`,
    '',
  ]).join('\r\n');
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' },
  });
