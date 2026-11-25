import type { CollectionEntry } from 'astro:content';

/**
 * The towns a market's firms actually have offices in, in one place.
 *
 * /areas/<town>-<st>/ generates the pages and /cities/<city>/ has to link to them, and the two
 * have to agree about which towns exist: a city page linking to a town page that was never built
 * is a 404, and a town page nothing links to is an orphan the crawler has no reason to visit.
 * The SEO audit reported all 78 of them as orphans the first time, in those words.
 *
 * The geography is parsed out of `offices[].address`, which comes from the firm's verified
 * Google Business Profile. There is no neighbourhood field on a profile and this does not invent
 * one: Harlem and the Upper West Side are not in here, because nothing we measured knows about
 * them. Scottsdale, Brooklyn and Coral Gables are, because a firm's own verified listing says so.
 */

/** "5800 W Glenn Dr Suite 130, Glendale, AZ 85301, USA" -> Glendale, AZ */
const TOWN = /,\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s*\d{5}/;

/** Below this a page is not a list, it is one or two firms their own profiles already cover. */
export const AREA_MIN_FIRMS = 5;

export const areaSlug = (town: string, st: string): string =>
  `${town.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${st.toLowerCase()}`;

export interface Area {
  slug: string;
  town: string;
  st: string;
  firms: CollectionEntry<'firms'>[];
}

/**
 * Every town with enough firms to be worth a page, keyed by slug.
 *
 * A town that is already one of our markets is left out: it has a /cities/ page of its own, and
 * two pages listing the same firms under two headings is the duplication the city-by-practice
 * page was built to end.
 */
export function areasFrom(firms: CollectionEntry<'firms'>[]): Map<string, Area> {
  const marketKeys = new Set(firms.map(f =>
    `${f.data.market.city.toLowerCase()}|${f.data.market.state}`));

  const out = new Map<string, Area>();
  for (const f of firms) {
    // One firm with three offices in the same town counts once there.
    const here = new Set<string>();
    for (const office of f.data.offices ?? []) {
      const m = TOWN.exec(office.address ?? '');
      if (!m) continue;
      const town = m[1].trim();
      const st = m[2];
      const key = `${town.toLowerCase()}|${st}`;
      if (marketKeys.has(key) || here.has(key)) continue;
      here.add(key);
      const slug = areaSlug(town, st);
      if (!out.has(slug)) out.set(slug, { slug, town, st, firms: [] });
      out.get(slug)!.firms.push(f);
    }
  }

  for (const [slug, area] of out) {
    if (area.firms.length < AREA_MIN_FIRMS) out.delete(slug);
  }
  return out;
}

/** The towns to link from one market's page, largest first, then alphabetical. */
export function areasOfMarket(
  areas: Map<string, Area>, citySlug: string,
): Area[] {
  return [...areas.values()]
    .filter(a => a.firms.some(f => f.data.market.city_slug === citySlug))
    .sort((a, b) => b.firms.length - a.firms.length || a.town.localeCompare(b.town));
}
