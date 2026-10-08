/**
 * A plain-text RFC 5322 message, hand-written rather than pulled from a library.
 *
 * This lived inside index.ts while the list-your-firm form was the only thing that sent mail. The
 * panel sends a second kind, so it moved here rather than being written twice.
 *
 * The alternative is a MIME builder dependency for a message that is a subject, two addresses and
 * a body of short lines. Every value is escaped into a header only after the line breaks are
 * stripped out of it, because a newline inside a header is how somebody injects a second header.
 */
export function mime(from: string, to: string, subject: string, body: string): string {
  const header = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();
  return [
    `From: Law Firm Listings <${header(from)}>`,
    `To: <${header(to)}>`,
    `Subject: ${header(subject)}`,
    `Message-ID: <${crypto.randomUUID()}@lawfirmlistings.com>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body.replace(/\r?\n/g, '\r\n'),
  ].join('\r\n');
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' },
  });
