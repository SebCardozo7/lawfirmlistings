/**
 * Reads the built site and enforces the meta rules that a build warning can only mention.
 *
 * Base.astro warns while rendering, which is easy to miss in a long build log and impossible to
 * gate a deploy on. This walks dist/ afterwards and exits non-zero, so `npm run check:meta` is
 * usable in CI or before a push.
 *
 * Checks, in order of how badly each one costs us:
 *   - description length outside 70-155, the range where a snippet is neither truncated nor thin
 *   - description or title missing entirely
 *   - a duplicate title or description, which makes two pages compete for the same result
 *   - a volatile figure in either: a count that changes whenever a firm is added means the
 *     snippet Google has indexed is wrong more often than it is right
 *   - an em dash anywhere in the rendered copy, which is a house rule: it is the clearest tell
 *     of machine-written prose, and this site's whole proposition is that a person is
 *     accountable for what it publishes. En dashes in numeric ranges (70-84) are correct
 *     typography and are left alone, as is text inside a blockquote, since altering the
 *     punctuation of words attributed to a named person is not ours to do.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const MIN = 70;
const MAX = 155;

// Digits that legitimately belong in a description: a statute, a methodology version, a score
// scale. Anything else numeric on a directory page is almost always a live count.
const ALLOWED = [/\bv\d+(\.\d+)?\b/gi, /\b0-100\b/g, /\b0–100\b/g, /\b33⅓\b/g, /\b20\d\d\b/g];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name === 'index.html') out.push(p);
  }
  return out;
}

const attr = (html, re) => {
  const m = html.match(re);
  return m ? m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim() : '';
};

const pages = walk(DIST).map(p => {
  const html = readFileSync(p, 'utf8');
  return {
    path: p,
    url: ('/' + relative(DIST, p).split(sep).join('/')).replace(/\/index\.html$/, '/'),
    title: attr(html, /<title>([\s\S]*?)<\/title>/),
    description: attr(html, /<meta name="description" content="([\s\S]*?)"/),
    noindex: /name="robots"[^>]*noindex/.test(html),
  };
});

const problems = [];
const seenTitle = new Map();
const seenDesc = new Map();

// Em dashes in rendered copy. Blockquotes are exempt: a pull quote is someone else's sentence.
for (const { url, path } of pages) {
  const html = readFileSync(path, 'utf8')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/g, '');
  const dashes = (html.match(/—/g) || []).length;
  if (dashes) {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const where = [...text.matchAll(/—/g)].slice(0, 3)
      .map(m => text.slice(Math.max(0, m.index - 45), m.index + 45).trim());
    problems.push([url, `${dashes} em dash${dashes === 1 ? '' : 'es'} in copy: ${where.join(' | ')}`]);
  }
}

for (const { url, title, description, noindex } of pages) {
  if (!title) problems.push([url, 'no title']);
  if (!description) {
    problems.push([url, 'no description']);
  } else {
    const n = description.length;
    if (n > MAX) problems.push([url, `description ${n} chars, ${n - MAX} over ${MAX}`]);
    else if (n < MIN) problems.push([url, `description ${n} chars, ${MIN - n} under ${MIN}`]);
  }

  // A noindexed page cannot compete with anything, so duplicates and stale figures there are
  // not worth failing a build over.
  if (noindex) continue;

  for (const [text, seen, what] of [[title, seenTitle, 'title'], [description, seenDesc, 'description']]) {
    if (!text) continue;
    if (seen.has(text)) problems.push([url, `duplicate ${what}, same as ${seen.get(text)}`]);
    else seen.set(text, url);
  }

  for (const [text, what] of [[title, 'title'], [description, 'description']]) {
    let stripped = text;
    for (const re of ALLOWED) stripped = stripped.replace(re, '');
    const nums = stripped.match(/\d[\d,]*/g);
    if (nums) problems.push([url, `${what} contains a figure that will drift: ${nums.join(', ')}`]);
  }
}

for (const [url, problem] of problems) console.error(`${url} — ${problem}`);
console.log(`\n${pages.length} pages checked, ${problems.length} problem${problems.length === 1 ? '' : 's'}.`);
process.exit(problems.length ? 1 : 0);
