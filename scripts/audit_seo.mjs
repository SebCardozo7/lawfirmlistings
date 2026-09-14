/**
 * Reads the built site and reports the structural SEO faults a page-by-page check cannot see.
 *
 * check_meta.mjs already enforces what belongs to a single page: description length, house
 * punctuation, a title that is not shared with another page. This walks the whole of dist/ and
 * looks at the graph instead, which is where the faults that cost traffic actually live:
 *
 *   - a broken internal link, which wastes a crawl and dead-ends a reader
 *   - a duplicate title or canonical, which makes two of our own pages compete
 *   - a missing canonical, which lets a parameterised URL index in place of the real one
 *   - an orphan: a page in the sitemap that nothing on the site links to
 *
 * Run it after `npm run build`. Exits non-zero on anything in the first three groups. Orphans are
 * reported and do not fail the run: a page can be legitimately unlinked for a while, and the
 * point of the line is that somebody decided it, not that a script did.
 *
 * Usage: node scripts/audit_seo.mjs [dist]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = process.argv[2] ?? 'dist';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(DIST);
const toUrl = p => ('/' + relative(DIST, p).split(sep).join('/')).replace(/\/index\.html$/, '/');

const pages = files.filter(p => p.endsWith(`${sep}index.html`) || p === join(DIST, 'index.html'))
  .map(p => {
    const html = readFileSync(p, 'utf8');
    return {
      url: toUrl(p),
      html,
      title: (html.match(/<title>([\s\S]*?)<\/title>/) ?? [, ''])[1].trim(),
      canonical: (html.match(/<link rel="canonical" href="([^"]*)"/) ?? [, ''])[1].trim(),
      noindex: /name="robots"[^>]*noindex/.test(html),
      h1: [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)]
        .map(m => m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()),
      jsonld: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .map(m => { try { JSON.parse(m[1]); return true; } catch { return false; } }),
    };
  });

// Every path the built site actually serves, so a link is checked against the files rather than
// against the pages: /robots.txt and /sitemap-index.xml are real targets and are not pages.
const served = new Set(files.map(toUrl));

const problems = [];
const notes = [];
const inbound = new Map(pages.map(p => [p.url, 0]));

const HREF = /<a\b[^>]*\bhref="([^"]+)"[^>]*>/gi;

for (const page of pages) {
  const body = page.html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '');
  for (const [tag, raw] of [...body.matchAll(HREF)].map(m => [m[0], m[1]])) {
    if (/^(https?:|mailto:|tel:|#|data:)/i.test(raw)) continue;
    const href = raw.replace(/[?#].*$/, '');
    if (!href.startsWith('/')) {
      problems.push([page.url, `relative link, which breaks when the page moves: ${href}`]);
      continue;
    }
    if (!served.has(href) && !served.has(href.endsWith('/') ? href : `${href}/`)) {
      problems.push([page.url, `broken internal link: ${href}`]);
      continue;
    }
    // An internal link that is nofollowed is a link we are refusing to pass. Outbound links to
    // firms follow the gate rule and are not our own pages, so only internal ones are checked.
    if (/\brel="[^"]*nofollow/i.test(tag)) {
      problems.push([page.url, `internal link marked nofollow: ${href}`]);
    }
    const target = served.has(href) ? href : `${href}/`;
    if (inbound.has(target) && target !== page.url) inbound.set(target, inbound.get(target) + 1);
  }
}

const seenTitle = new Map();
const seenCanonical = new Map();
for (const page of pages) {
  if (!page.canonical) problems.push([page.url, 'no canonical']);
  if (page.noindex) continue;
  for (const [text, seen, what] of [
    [page.title, seenTitle, 'title'],
    [page.canonical, seenCanonical, 'canonical'],
  ]) {
    if (!text) continue;
    if (seen.has(text)) problems.push([page.url, `duplicate ${what}, same as ${seen.get(text)}`]);
    else seen.set(text, page.url);
  }
}

for (const page of pages) {
  if (page.url === '/' || page.noindex) continue;
  if (inbound.get(page.url) === 0) notes.push([page.url, 'orphan: nothing on the site links to it']);
}

// A missing or repeated h1, and structured data that does not parse, are faults rather than
// judgement calls: a page with two h1 elements is telling a crawler two different things it is
// about, and a JSON-LD block with a syntax error is markup we shipped and nobody can read.
for (const page of pages) {
  if (page.h1.length === 0) problems.push([page.url, 'no h1']);
  else if (page.h1.length > 1)
    problems.push([page.url, `${page.h1.length} h1 elements: ${page.h1.slice(0, 2).join(' / ')}`]);
  if (page.jsonld.some(ok => !ok)) problems.push([page.url, 'a JSON-LD block does not parse']);
}

// Title length is a note, not a problem, because a law firm's name is not editable copy. Where
// the name alone accounts for the length there is nothing to fix short of truncating the firm's
// name on its own page, so the budget asks whether what we wrote around the name pushed it over.
for (const page of pages) {
  if (page.noindex || !page.title) continue;
  const ownName = page.title.split(/ [|:] /)[0];
  const budget = page.url.startsWith('/firms/') ? Math.max(70, ownName.length + 24) : 70;
  if (page.title.length > budget)
    notes.push([page.url, `title is ${page.title.length} characters, ${page.title.length - budget} over`]);
}

for (const [url, problem] of problems) console.error(`${url} — ${problem}`);
for (const [url, note] of notes) console.warn(`${url} — ${note}`);
console.log(`\n${pages.length} pages checked, ${problems.length} problem${problems.length === 1 ? '' : 's'}, ${notes.length} note${notes.length === 1 ? '' : 's'}.`);
process.exit(problems.length ? 1 : 0);
