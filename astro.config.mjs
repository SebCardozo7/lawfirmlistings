import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

// The sitemap is generated from the routes on every build, so a new firm, city or practice area
// appears in it as soon as its page exists. Nothing to maintain by hand.
//
// What it must not do is invite Google to a page that tells Google not to index it. Rather than
// keep a hand-written exclusion list that the next person has to remember, this reads the built
// HTML and drops any page carrying <meta name="robots" content="noindex">. A page joins the
// sitemap by dropping its own noindex — one decision, in one place. Today that excludes the
// gated ranking, which stays noindex until its cohort has eight certified firms.
//
// It also means that while the LFL_NOINDEX build variable is set, every page carries noindex and
// the sitemap comes out empty. That is right for a pre-launch site: an empty sitemap says
// nothing, whereas a full one alongside a site-wide Disallow says two contradictory things.
const NOINDEX = /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i;

function isIndexable(url) {
  const path = new URL(url).pathname;
  for (const candidate of [`dist${path}index.html`, `dist${path.replace(/\/$/, '')}.html`]) {
    if (existsSync(candidate)) {
      return !NOINDEX.test(readFileSync(candidate, 'utf8'));
    }
  }
  // A route with no HTML file of its own — an XML endpoint, say — is left alone.
  return true;
}

// When a firm's page last changed, which for these pages means when the firm was last measured.
//
// The sitemap carried no lastmod at all, and for a directory whose value is the freshness of a
// measurement that is the one field worth filling: it tells a crawler which of two hundred and
// fifty-four pages moved. The date is taken from the measurements in the firm's own record, the
// measured_at and checked_at stamps the crawlers and register checks write, and never from
// score.computed_at or the build clock. A score recomputes on every run whether or not anything
// about the firm changed, and a lastmod that moves when nothing moved is the reason crawlers
// learn to ignore the field.
//
// Pages without a date of their own get none. A guide recomputes its figures from every firm at
// build time, so its honest lastmod is the newest measurement in the directory, and claiming
// that for it would mark it modified every time any firm anywhere was re-crawled. A missing
// lastmod says nothing; a wrong one says something false.
const DATE_KEYS = new Set(['measured_at', 'checked_at', 'fetched_at']);

function newestDate(node, best = '') {
  if (Array.isArray(node)) {
    for (const item of node) best = newestDate(item, best);
    return best;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (DATE_KEYS.has(key) && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        const date = value.slice(0, 10);
        if (date > best) best = date;
      } else {
        best = newestDate(value, best);
      }
    }
  }
  return best;
}

function firmDates() {
  const out = new Map();
  const root = 'src/data/firms';
  if (!existsSync(root)) return out;
  for (const state of readdirSync(root)) {
    for (const file of readdirSync(`${root}/${state}`)) {
      if (!file.endsWith('.json')) continue;
      const firm = JSON.parse(readFileSync(`${root}/${state}/${file}`, 'utf8'));
      const date = newestDate(firm);
      if (firm.slug && date) out.set(`/firms/${firm.slug}/`, date);
    }
  }
  return out;
}

const LASTMOD = firmDates();

function withLastmod(item) {
  const lastmod = LASTMOD.get(new URL(item.url).pathname);
  return lastmod ? { ...item, lastmod } : item;
}

export default defineConfig({
  site: 'https://lawfirmlistings.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // xslURL adds the <?xml-stylesheet?> instruction to both the index and the urlset, so a
  // browser renders public/sitemap.xsl instead of raw XML. A crawler ignores it entirely,
  // which is the point: the file a crawler reads is unchanged, and the file a person opens
  // before a launch is legible.
  integrations: [sitemap({ filter: isIndexable, serialize: withLastmod, xslURL: '/sitemap.xsl' })],
});
