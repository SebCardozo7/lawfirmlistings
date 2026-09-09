import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, existsSync } from 'node:fs';

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

export default defineConfig({
  site: 'https://lawfirmlistings.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap({ filter: isIndexable })],
});
