/**
 * The HTML half of an outbound email, rendered from the plain-text half.
 *
 * A firm that gets a bare monospace wall from a directory it has never heard of reads it as
 * somebody's script. The same words under the mark it will see on the site read as a company. So
 * these emails go out as multipart/alternative, and this file is the branded part.
 *
 * It renders the HTML *from* the text rather than beside it. Writing both by hand would put the
 * same sentences in two places, and the two would drift: the day somebody changes the price
 * sentence in one of them, half the recipients get the old one. There is one copy of the words,
 * in outbound.ts, and this turns it into a page.
 *
 * What the text has to look like for that to work is what it already looks like: blank lines
 * between blocks, "1. " for a numbered requirement, two leading spaces for an indented detail,
 * and hard-wrapped prose. The one rule worth stating is how a wrapped line is recognised, because
 * it is the only guess in here: a line is a continuation of the one above it when it starts with
 * a lowercase letter and is not a bare URL. That keeps "Have a great day," / "Sebastián" / "Law
 * Firm Listings" as three lines and joins "...note to confirm" / "it reached us" into one
 * sentence, which is what both of them are.
 *
 * The logo is the site's own favicon, served from the sending domain over HTTPS. No tracking
 * pixel, no second host, nothing that loads unless the reader's client asks for it.
 */

/** The square of the site's gradient, the same file the browser tab shows. */
const MARK = 'https://lawfirmlistings.com/apple-touch-icon.png';

const INK = '#0A0A0C';
const BODY = '#3B3C43';
const MUTED = '#6F7079';
const LINE = '#E7E7E2';
const GROUND = '#F6F6F3';
const LINK = '#4F46E5';
// The aurora, in the three steps a gradient cannot be in an email client.
const AURORA = ['#8B5CF6', '#3B82F6', '#5EEAD4'];

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Turns a bare URL in already-escaped text into a link. */
function autolink(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s<>()]+[^\s<>().,;:]/g, (url) => {
    const href = url.replace(/&amp;/g, '&');
    return `<a href="${href}" style="color:${LINK};text-decoration:underline">${url}</a>`;
  });
}

/**
 * **like this** becomes bold.
 *
 * Asterisks are what people have used for emphasis in plain-text email since before HTML mail
 * existed, so the text part loses nothing by carrying them and the HTML part gets somewhere for
 * a reader's eye to land. Nothing else from Markdown is supported: one convention that survives
 * both halves of the message beats five that only work in one.
 */
const bold = (escaped: string) =>
  escaped.replace(/\*\*(\S(?:[^*]*\S)?)\*\*/g, `<strong style="color:${INK};font-weight:600">$1</strong>`);

/** Everything that happens inside a line, in the order it has to happen. */
const inline = (s: string) => autolink(bold(esc(s)));

/** True for a line that continues the sentence on the line above it. */
const continues = (line: string) =>
  /^[a-z]/.test(line.trim()) && !/^https?:\/\/\S+$/.test(line.trim());

/** Folds hard-wrapped lines back into the units their author wrote. */
function unwrap(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (out.length && continues(line)) out[out.length - 1] += ' ' + line.trim();
    else out.push(line.trim());
  }
  return out;
}

const P = `margin:0 0 16px;font:400 15px/1.62 ${FONT};color:${BODY}`;

function paragraph(lines: string[]): string {
  const units = unwrap(lines).map(inline);
  return `<p style="${P}">${units.join('<br>')}</p>`;
}

function orderedList(lines: string[]): string {
  const items: string[] = [];
  for (const line of lines) {
    const m = /^(\d+)\.\s+(.*)$/.exec(line.trim());
    if (m) items.push(m[2]);
    else if (items.length) items[items.length - 1] += ' ' + line.trim();
  }
  const li = items
    .map((t) => `<li style="margin:0 0 10px;padding:0">${inline(t)}</li>`)
    .join('');
  return `<ol style="margin:0 0 16px;padding:0 0 0 22px;font:400 15px/1.6 ${FONT};`
    + `color:${BODY}">${li}</ol>`;
}

/** The ack's details block: a label, then the value, aligned by the author with spaces. */
function definitions(lines: string[]): string {
  const rows = lines
    .map((line) => /^\s*([A-Za-z][A-Za-z ]{0,24}):\s+(.*)$/.exec(line))
    .filter(Boolean)
    .map((m) => {
      const label = inline(m![1]);
      const value = inline(m![2].trim());
      return `<tr><td style="padding:4px 14px 4px 0;font:400 13px/1.5 ${FONT};color:${MUTED};`
        + `white-space:nowrap;vertical-align:top">${label}</td>`
        + `<td style="padding:4px 0;font:600 14px/1.5 ${FONT};color:${INK}">${value}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"`
    + ` style="margin:0 0 16px;border-collapse:collapse"><tbody>${rows}</tbody></table>`;
}

/** An indented paragraph: what the year includes, one claim at a time. */
function callout(lines: string[]): string {
  const units = unwrap(lines).map(inline);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"`
    + ` style="margin:0 0 14px;border-collapse:collapse"><tbody><tr>`
    + `<td style="padding:0 0 0 15px;border-left:3px solid ${AURORA[1]};`
    + `font:400 15px/1.6 ${FONT};color:${BODY}">${units.join('<br>')}</td>`
    + `</tr></tbody></table>`;
}

/**
 * A label on its own line ending in a colon, with a bare URL under it, becomes a button.
 *
 * It is the shape somebody writes anyway when an email has one thing to click, so the text part
 * reads correctly without a convention and the HTML part gets the button. The URL still appears
 * as the button's href only: a reader who cannot see HTML has it in the text part verbatim.
 */
function button(label: string, url: string): string {
  const href = url.trim();
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"`
    + ` style="margin:4px 0 20px;border-collapse:collapse"><tbody><tr>`
    + `<td style="background:${INK};border-radius:8px">`
    + `<a href="${esc(href)}" style="display:inline-block;padding:14px 26px;`
    + `font:700 13px/1 ${FONT};color:#FFFFFF;text-decoration:none;`
    + `letter-spacing:.07em;text-transform:uppercase">`
    + `${esc(label.replace(/:\s*$/, ''))}</a></td>`
    + `</tr></tbody></table>`;
}

/**
 * A line on its own ending in a colon is a section heading.
 *
 * "What the year includes:" was already written that way before any of this existed, which is
 * the test of the convention: it reads as a heading in the text part without a marker, so the
 * HTML part can set it as one without the text part paying for it. The colon is dropped here
 * because a styled heading does not need it; the text part keeps it.
 */
function heading(line: string): string {
  const label = line.trim().replace(/:\s*$/, '');
  return `<p style="margin:26px 0 12px;font:600 12px/1.4 ${FONT};color:${AURORA[0]};`
    + `letter-spacing:.09em;text-transform:uppercase">${inline(label)}</p>`;
}

/**
 * Lines starting with "| " are a card: the first is its headline, the rest its small print.
 *
 * This is for the one fact a reader is looking for before anything else, which in the pitch is
 * the price. In the text part the pipes read as a boxed aside, which is what it is.
 */
function card(lines: string[]): string {
  const [first, ...rest] = unwrap(lines.map((l) => l.replace(/^\s*\|\s?/, '')));
  const small = rest.length
    ? `<div style="font:400 13px/1.55 ${FONT};color:${MUTED};padding-top:6px">`
      + `${rest.map(inline).join('<br>')}</div>`
    : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"`
    + ` style="margin:2px 0 20px;border-collapse:collapse"><tbody><tr>`
    + `<td style="background:#F5F3FF;border:1px solid #E4DEFF;border-radius:10px;`
    + `padding:16px 18px">`
    + `<div style="font:700 22px/1.2 ${FONT};color:${INK};letter-spacing:-.015em">`
    + `${inline(first)}</div>${small}</td>`
    + `</tr></tbody></table>`;
}

const isCard = (l: string) => /^\s*\|\s/.test(l);
const isIndented = (l: string) => /^ {2,}\S/.test(l);
const isNumbered = (l: string) => /^\d+\.\s/.test(l.trim());
// One space after the colon, not two. The ack aligns its values with padding and the longest
// label ("Practice:") leaves exactly one space, so insisting on two sent the whole block down the
// callout path and the labels rendered as prose.
const isDefinition = (l: string) => /^\s*[A-Za-z][A-Za-z ]{0,24}:\s+\S/.test(l);
const isBareUrl = (l: string) => /^https?:\/\/\S+$/.test(l.trim());

function blockHtml(lines: string[]): string {
  if (lines.every(isCard)) return card(lines);
  if (lines.some(isNumbered)) return orderedList(lines);
  if (lines.length === 2 && /:$/.test(lines[0].trim()) && isBareUrl(lines[1])) {
    return button(lines[0].trim(), lines[1]);
  }
  // Checked after the button, so a label with a URL under it stays a button rather than
  // becoming a heading with an orphaned link.
  if (lines.length === 1 && /:$/.test(lines[0].trim()) && !isIndented(lines[0])) {
    return heading(lines[0]);
  }
  if (lines.every(isIndented)) {
    return lines.every(isDefinition) ? definitions(lines) : callout(lines);
  }
  return paragraph(lines);
}

/** The gradient, as three cells, because no email client renders a CSS one reliably. */
/**
 * The gradient, as three cells, because no email client renders a CSS one reliably.
 *
 * It sits in a table of its own inside a single cell, and that nesting is the whole point. The
 * three cells used to be a row of the outer table, which made that table three columns wide,
 * and every other row held one cell with no colspan. A browser forgives that and renders the
 * single cell full width. Gmail does not: it gave each one the first column, so a 560px message
 * laid its entire body out in 185px and arrived looking like a receipt.
 */
const rule = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
 style="width:100%;border-collapse:collapse"><tbody><tr>${AURORA.map(
    (c) => `<td height="3" width="33.33%" style="background:${c};height:3px;line-height:3px;`
      + `font-size:0">&nbsp;</td>`,
  ).join('')}</tr></tbody></table>`;

export interface HtmlOptions {
  /** Shown under the footer rule, where a recipient looks for who this is. */
  footer?: string;
}

export function htmlFromText(text: string, opts: HtmlOptions = {}): string {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').filter((l) => l.trim() !== ''))
    .filter((b) => b.length > 0);

  const body = blocks.map(blockHtml).join('');
  const footer = opts.footer
    ? `<p style="margin:0;font:400 12px/1.6 ${FONT};color:${MUTED}">`
      + `${inline(opts.footer)}</p>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:${GROUND};-webkit-text-size-adjust:100%">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
 style="background:${GROUND};border-collapse:collapse"><tbody><tr>
<td align="center" style="padding:28px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560"
 style="width:560px;max-width:100%;background:#FFFFFF;border:1px solid ${LINE};
 border-collapse:collapse"><tbody>
<tr><td style="padding:0">${rule}</td></tr>
<tr><td style="padding:24px 28px 18px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
   style="width:100%;border-collapse:collapse"><tbody><tr>
  <td width="40" style="padding:0 12px 0 0">
    <img src="${MARK}" width="40" height="40" alt=""
     style="display:block;width:40px;height:40px;border:0;border-radius:9px"></td>
  <td style="font:600 17px/1.2 ${FONT};color:${INK};letter-spacing:-.01em">Law&nbsp;Firm&nbsp;Listings
    <div style="font:400 12px/1.5 ${FONT};color:${MUTED};letter-spacing:0;padding-top:3px">
    The LFL Certification Score</div></td>
  </tr></tbody></table>
</td></tr>
<tr><td style="padding:4px 28px 26px">${body}</td></tr>
<tr><td style="padding:0 28px 24px">
  <div style="border-top:1px solid ${LINE};padding-top:16px">${footer}
  <p style="margin:8px 0 0;font:400 12px/1.6 ${FONT};color:${MUTED}">
  <a href="https://lawfirmlistings.com/methodology/"
   style="color:${LINK};text-decoration:underline">How the score is measured</a>
  &nbsp;·&nbsp;
  <a href="https://lawfirmlistings.com/" style="color:${LINK};text-decoration:underline">lawfirmlistings.com</a>
  </p></div>
</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body></html>`;
}
