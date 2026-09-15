/**
 * Prints the published title of a guide, given its slug.
 *
 * The announcement workflow needs the headline a reader would recognise, and the obvious place
 * to look is the page itself. That does not work: `what-new-york-injury-firms-publish-about-fees`
 * computes its title from the collection across several lines, and `best-personal-injury-law-firms-nyc`
 * has no `const title` at all. Any regex over `src/pages/guides/*.astro` therefore silently
 * returns nothing for some guides, which is the worst kind of failure for a notifier.
 *
 * `src/data/guides.ts` is the manifest, carries one hand-typed title per slug for every guide
 * including the gated one, and is what the index and the cards already display. It is read as
 * text rather than imported because it is TypeScript, and the entries are plain object literals,
 * so a scan from the slug to its entry's title is sufficient and has no build step.
 *
 * Falls back to the slug rather than failing: a notification with a plain name is worth more
 * than a workflow that exits non-zero on the day someone renames a field.
 *
 * Usage: node scripts/guide_title.mjs <slug>
 */
import { readFileSync } from 'node:fs';

const slug = process.argv[2];
if (!slug) {
  process.stderr.write('usage: node scripts/guide_title.mjs <slug>\n');
  process.exit(2);
}

const fallback = () => {
  process.stdout.write(slug);
  process.exit(0);
};

let src;
try {
  src = readFileSync('src/data/guides.ts', 'utf8');
} catch {
  fallback();
}

// Find this slug's entry, then the first title after it. Quoting is whichever of ' " ` the
// entry happens to use, and an escaped quote inside the string does not end it.
const slugAt = src.search(new RegExp(`slug:\\s*(['"\`])${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`));
if (slugAt === -1) fallback();

const after = src.slice(slugAt);
const m = after.match(/title:\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/);
if (!m) fallback();

// The file is source, so a title may carry an escaped quote. Unescape what the quoting added.
process.stdout.write(m[2].replace(/\\(['"`\\])/g, '$1'));
