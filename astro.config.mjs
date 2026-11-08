import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

// A ranked page's own date is the newest measurement among the firms it ranks, and nothing else.
//
// Search Console on 28 October: 883 pages indexed, 717 discovered and never crawled, 25 of them
// city-and-practice rankings. Those are the pages somebody searching "car accident lawyer
// houston" would land on, and the only thing in the sitemap that tells a crawler one of them
// moved is a lastmod they did not have. The profiles had one; these did not.
//
// It is derivable here and honest because the set is bounded: /cities/houston-tx/car-accidents/
// lists the Houston firms that practise car accidents, so the newest measurement among exactly
// those firms is the newest thing on the page. That is the test a practice hub fails, which is
// why it is left out: /practice-areas/personal-injury/ carries 1,113 of the 1,388 firms, so its
// "newest measurement" is the directory's clock rather than the page's, and a lastmod that moves
// when nothing on the page moved is how a crawler learns to ignore the field. Guides are left
// out for the reason already written above them.
function pageDates() {
  const out = new Map();
  const newer = (key, date) => {
    if (date && (!out.has(key) || date > out.get(key))) out.set(key, date);
  };
  const root = 'src/data/firms';
  if (!existsSync(root)) return out;
  for (const state of readdirSync(root)) {
    for (const file of readdirSync(`${root}/${state}`)) {
      if (!file.endsWith('.json')) continue;
      const firm = JSON.parse(readFileSync(`${root}/${state}/${file}`, 'utf8'));
      const date = newestDate(firm);
      if (!firm.slug || !date) continue;
      out.set(`/firms/${firm.slug}/`, date);
      // The pages that rank this firm carry the same rule the ranking does: a firm that is not
      // published is not on them, so its measurements are not theirs either.
      if (firm.status === 'sample' || firm.status === 'not_eligible') continue;
      const city = firm.market?.city_slug;
      if (!city) continue;
      newer(`/cities/${city}/`, date);
      for (const practice of firm.practices ?? []) {
        if (practice.slug) newer(`/cities/${city}/${practice.slug}/`, date);
      }
    }
  }
  return out;
}

const LASTMOD = pageDates();

function withLastmod(item) {
  const lastmod = LASTMOD.get(new URL(item.url).pathname);
  return lastmod ? { ...item, lastmod } : item;
}

/**
 * Which of our pages carry each firm, read off the built HTML.
 *
 * The outbound desk opens with a true sentence a firm can check in ten seconds: your firm is on
 * thirteen pages of this directory, here they are, is any of it wrong. That sentence needs the
 * list, and the list has to be the real one. Deriving it from the data instead, by asking which
 * city and practice a firm belongs to, means writing a second copy of the rule each page already
 * applies, and the day a page changes what it lists the letter starts naming pages the firm is
 * not on. So this reads the finished HTML and records the links it actually contains.
 *
 * It runs on astro:build:done, which means an ordinary `npm run build` produces it and no deploy
 * can forget a separate step.
 *
 * Stored as a table of paths plus indexes into it rather than a path per firm per row: the same
 * fifteen hundred paths repeat across 1,388 firms, and spelling each one out turns 150 KB into
 * about 700 KB for nothing.
 *
 * Like the firms index beside it, worker/index.ts answers 404 for this path. It is for the desk,
 * not for the web.
 */
function firmPages() {
  const LINK = /\/firms\/([a-z0-9-]+)\//g;
  return {
    name: 'lfl-firm-pages',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const paths = [];
        const index = new Map();
        const firms = new Map();

        const idFor = (p) => {
          if (!index.has(p)) {
            index.set(p, paths.length);
            paths.push(p);
          }
          return index.get(p);
        };

        const walk = (folder) => {
          for (const entry of readdirSync(folder, { withFileTypes: true })) {
            const full = path.join(folder, entry.name);
            if (entry.isDirectory()) {
              if (entry.name === '_astro' || entry.name === 'api') continue;
              walk(full);
            } else if (entry.name.endsWith('.html')) {
              const url = '/' + path.relative(root, full).split(path.sep).join('/')
                .replace(/index\.html$/, '').replace(/\.html$/, '/');
              // A profile linking to itself is not a page that lists the firm.
              const own = url.startsWith('/firms/') ? url.split('/')[2] : null;
              const html = readFileSync(full, 'utf8');
              const here = new Set();
              for (const [, slug] of html.matchAll(LINK)) {
                if (slug !== own) here.add(slug);
              }
              if (!here.size) continue;
              const id = idFor(url);
              for (const slug of here) {
                if (!firms.has(slug)) firms.set(slug, []);
                firms.get(slug).push(id);
              }
            }
          }
        };

        walk(root);
        const out = {
          generated_at: new Date().toISOString().slice(0, 10),
          paths,
          firms: Object.fromEntries([...firms].map(([k, v]) => [k, v.sort((a, b) => a - b)])),
        };
        mkdirSync(path.join(root, 'api'), { recursive: true });
        writeFileSync(path.join(root, 'api', 'firm-pages.json'), JSON.stringify(out), 'utf8');
        logger.info(`firm-pages.json: ${firms.size} firms across ${paths.length} pages`);
      },
    },
  };
}

export default defineConfig({
  site: 'https://lawfirmlistings.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // xslURL adds the <?xml-stylesheet?> instruction to both the index and the urlset, so a
  // browser renders public/sitemap.xsl instead of raw XML. A crawler ignores it entirely,
  // which is the point: the file a crawler reads is unchanged, and the file a person opens
  // before a launch is legible.
  integrations: [
    sitemap({ filter: isIndexable, serialize: withLastmod, xslURL: '/sitemap.xsl' }),
    firmPages(),
  ],
});
