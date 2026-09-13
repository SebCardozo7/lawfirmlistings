/**
 * Read the built site the way a crawler does, and report what it would find wrong.
 *
 * scripts/check_meta.mjs already guards description length at build time, one page at a time.
 * This asks the questions that only exist across pages: two URLs claiming the same title, a
 * heading a page does not have, a link into nothing, an orphan nobody links to. Those are
 * invisible from inside a single template, which is why they accumulate.
 *
 * It reads dist/, so run a build first. Nothing here fails a build: it prints a list for a
 * person to act on, in the same spirit as scripts/audit_published.py.
 *
 *     npm run build && node scripts/audit_seo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
const SITE = 'https://lawfirmlistings.com';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const urlOf = file =>
  '/' + path.relative(DIST, file).split(path.sep).join('/').replace(/index\.html$/, '');

const text = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

if (!fs.existsSync(DIST)) {
  console.error('no dist/ — run npm run build first');
  process.exit(2);
}

const files = walk(DIST);
const pages = files.map(file => {
  const html = fs.readFileSync(file, 'utf8');
  return {
    url: urlOf(file),
    html,
    title: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]?.trim() ?? '',
    description: (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] ?? '',
    canonical: (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] ?? '',
    robots: (html.match(/<meta name="robots" content="([^"]*)"/) || [])[1] ?? '',
    h1: [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(m => text(m[1])),
    jsonld: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map(m => { try { return JSON.parse(m[1]); } catch { return null; } }),
    links: [...html.matchAll(/<a[^>]+href="([^"]+)"/g)].map(m => m[1]),
    words: text(html.replace(/<(header|footer|nav|script|style)[\s\S]*?<\/\1>/g, '')).split(' ').length,
  };
});

const findings = [];
const add = (kind, url, note) => findings.push({ kind, url, note });

// ---- per page -------------------------------------------------------------------------------
for (const p of pages) {
  // A firm's name is not editable copy. Where the name alone accounts for the length there is
  // nothing to fix short of truncating a law firm's name on its own page, so the check asks
  // whether what we wrote around the name is what pushed it over.
  const ownName = p.title.split(/ [|:] /)[0];
  const budget = p.url.startsWith('/firms/') ? Math.max(70, ownName.length + 24) : 70;
  if (!p.title) add('title', p.url, 'no <title>');
  else if (p.title.length > budget)
    add('title', p.url, `title is ${p.title.length} characters, ${p.title.length - budget} over`);
  if (!p.description) add('description', p.url, 'no meta description');
  else if (p.description.length > 160) add('description', p.url, `description is ${p.description.length} characters`);
  if (!p.canonical) add('canonical', p.url, 'no canonical link');
  else if (p.canonical !== SITE + p.url) add('canonical', p.url, `canonical points at ${p.canonical}`);
  if (p.h1.length === 0) add('heading', p.url, 'no h1');
  else if (p.h1.length > 1) add('heading', p.url, `${p.h1.length} h1 elements: ${p.h1.slice(0, 2).join(' / ')}`);
  if (p.jsonld.some(x => x === null)) add('schema', p.url, 'a JSON-LD block does not parse');
  if (p.words < 120) add('thin', p.url, `${p.words} words outside the chrome`);
}

// ---- across pages ---------------------------------------------------------------------------
const group = (key) => {
  const map = new Map();
  for (const p of pages) {
    const value = p[key];
    if (!value) continue;
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(p.url);
  }
  return [...map.entries()].filter(([, urls]) => urls.length > 1);
};

for (const [title, urls] of group('title'))
  add('duplicate-title', urls[0], `${urls.length} pages share this title: ${urls.slice(0, 4).join(', ')}`);
for (const [, urls] of group('description'))
  add('duplicate-description', urls[0], `${urls.length} pages share one description: ${urls.slice(0, 4).join(', ')}`);

// ---- internal links -------------------------------------------------------------------------
const known = new Set(pages.map(p => p.url));
const assets = new Set(walk(DIST, []).map(urlOf));
const inbound = new Map(pages.map(p => [p.url, 0]));
const broken = new Map();

for (const p of pages) {
  for (const href of p.links) {
    if (/^(https?:|mailto:|tel:|#)/.test(href)) continue;
    const clean = href.split('#')[0].split('?')[0];
    if (!clean) continue;
    const target = clean.startsWith('/') ? clean : path.posix.join(p.url, clean);
    if (known.has(target)) {
      if (target !== p.url) inbound.set(target, inbound.get(target) + 1);
      continue;
    }
    // A file on disk (a PNG, the sitemap) is fine; anything else is a link into nothing.
    if (fs.existsSync(path.join(DIST, target.replace(/^\//, '')))) continue;
    if (!broken.has(target)) broken.set(target, []);
    broken.get(target).push(p.url);
  }
}
for (const [target, from] of broken)
  add('broken-link', from[0], `${from.length} page(s) link to ${target}, which is not built`);
for (const [url, n] of inbound)
  if (n === 0 && url !== '/') add('orphan', url, 'no other page links to it');

// ---- sitemap --------------------------------------------------------------------------------
const sitemapFiles = fs.readdirSync(DIST).filter(f => f.startsWith('sitemap'));
const sitemapUrls = new Set();
for (const f of sitemapFiles) {
  const body = fs.readFileSync(path.join(DIST, f), 'utf8');
  for (const m of body.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapUrls.add(m[1]);
}
for (const p of pages) {
  if (p.robots.includes('noindex')) continue;
  if (!sitemapUrls.has(SITE + p.url) && !sitemapUrls.has(SITE + p.url + '/'))
    add('sitemap', p.url, 'indexable but not in the sitemap');
}

// ---- report ---------------------------------------------------------------------------------
const kinds = [...new Set(findings.map(f => f.kind))].sort();
for (const kind of kinds) {
  const rows = findings.filter(f => f.kind === kind);
  console.log(`\n== ${kind} (${rows.length})`);
  for (const r of rows.slice(0, 14)) console.log(`   ${r.url.padEnd(52)} ${r.note}`);
  if (rows.length > 14) console.log(`   ... and ${rows.length - 14} more`);
}
console.log(`\n${findings.length} finding(s) across ${pages.length} built page(s)`);
