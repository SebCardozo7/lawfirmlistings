/**
 * The pages of this directory that carry a given firm.
 *
 * Outbound to a firm that has never heard of us opens with one sentence it can check in ten
 * seconds: your firm is on thirteen pages of this directory, here they are, tell us if any of
 * it is wrong. That is the only honest reason to write to somebody who did not ask, and it is
 * also true, because an error on those pages costs us more than it costs them.
 *
 * The list comes from the build, where the firmPages() integration in astro.config.mjs reads
 * the finished HTML and records the links each page actually contains. Not derived from the
 * firm's city and practices here: that would be a second copy of the rule each page applies,
 * and the day a page changes what it lists the letter starts naming pages the firm is not on.
 *
 * Fetched once per isolate, and the promise is cached rather than the result, for the reason
 * worker/dossier.ts has written out at length: the desk builds these for every row at once.
 */
export interface PagesEnv {
  ASSETS?: Fetcher;
}

interface Index {
  generated_at: string;
  paths: string[];
  firms: Record<string, number[]>;
}

const SITE = 'https://lawfirmlistings.com';

let inFlight: Promise<Index | null> | null = null;

export function loadPages(env: PagesEnv): Promise<Index | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (!env.ASSETS) return null;
    try {
      const res = await env.ASSETS.fetch(new Request(`${SITE}/api/firm-pages.json`));
      if (!res.ok) return null;
      const json = await res.json() as Index;
      return json && Array.isArray(json.paths) && json.firms ? json : null;
    } catch {
      return null;
    }
  })();
  return inFlight;
}

export function resetPages(): void {
  inFlight = null;
}

/**
 * The full URLs, newest-looking first: the firm's own markets before the national practice
 * hubs, because "you are on the Los Angeles car accidents page" lands and "you are on the
 * personal injury page" is a page with eleven hundred firms on it.
 */
export async function pagesFor(env: PagesEnv, slug: string): Promise<string[]> {
  const index = await loadPages(env);
  if (!index || !slug) return [];
  const ids = index.firms[slug];
  if (!ids) return [];
  const paths = ids.map(i => index.paths[i]).filter(Boolean);
  const rank = (p: string) => (p.startsWith('/cities/') ? 0 : p.startsWith('/certified') ? 1 : 2);
  return paths
    .sort((a, b) => rank(a) - rank(b) || b.length - a.length)
    .map(p => `${SITE}${p}`);
}
