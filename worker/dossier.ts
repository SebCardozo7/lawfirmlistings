/**
 * What we already know about the firm behind an enquiry, fetched once per isolate.
 *
 * A lead arrives with a name, an address and a website. Everything that makes it answerable
 * lives somewhere else: whether we publish this firm, what we scored it, which pillar it is
 * losing points on, whether we cover its state at all. On 2026-11-08 four follow-ups were
 * written and every one of those five facts was looked up by hand, in the repository, one firm
 * at a time. This turns that into a lookup.
 *
 * The index is a build artefact served by ASSETS, so it cannot disagree with the site. It is
 * about 250 KB, which is why it is cached in module scope: an isolate fetches it once and every
 * request it serves afterwards reads it from memory. A cold isolate pays one subrequest.
 *
 * Nothing here throws. A desk that cannot load the index should still list the leads, because
 * the enquiry is the thing that matters and the dossier is the garnish.
 */

export interface FirmEntry {
  s: string;
  n: string;
  st: string;
  sc: number;
  t: string;
  w: [string, number, number];
  g?: [string, number];
  o?: [string, string, number];
}

interface Index {
  generated_at: string;
  states: string[];
  count: number;
  firms: Record<string, FirmEntry>;
}

export interface Dossier {
  /** The profile, when we publish this firm. */
  firm?: FirmEntry;
  /** Its page, when there is one. */
  url?: string;
  /** The state read off the lead's own "city, state" field, when it could be read. */
  state?: string;
  /** False when we publish nothing in that state, which is a different answer from "no match". */
  covered: boolean;
  /** True when the index itself could not be read, so absence proves nothing. */
  unknown: boolean;
}

export interface DossierEnv {
  ASSETS?: Fetcher;
}

const SITE = 'https://lawfirmlistings.com';

/**
 * The in-flight fetch, not its result.
 *
 * Caching the result and a separate "already tried" flag looks equivalent and is not. The page
 * builds a dossier for every lead at once with Promise.all, so the first call sets the flag,
 * awaits the fetch, and every other call arrives while the flag is set and the result is still
 * empty, reads null, and reports the index as unavailable. The desk showed one row matched and
 * two rows saying "index unavailable" from a single request, which is how this was found: the
 * tests called dossierFor one at a time and never raced it.
 *
 * Holding the promise means the first caller starts the fetch and everybody else awaits the
 * same one. A failure resolves to null and stays cached as null, so a broken index is still
 * fetched once per isolate rather than once per lead.
 */
let inFlight: Promise<Index | null> | null = null;

/** The index, or null. Fetched at most once per isolate, failure included. */
export function loadIndex(env: DossierEnv): Promise<Index | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (!env.ASSETS) return null;
    try {
      const res = await env.ASSETS.fetch(new Request(`${SITE}/api/firms-index.json`));
      if (!res.ok) return null;
      const json = await res.json() as Index;
      if (!json || typeof json !== 'object' || !json.firms) return null;
      return json;
    } catch {
      return null;
    }
  })();
  return inFlight;
}

/** For the tests, which need a cold start between cases. */
export function resetIndex(): void {
  inFlight = null;
}

const STATES: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks',
  kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md', massachusetts: 'ma',
  michigan: 'mi', minnesota: 'mn', mississippi: 'ms', missouri: 'mo', montana: 'mt',
  nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh', 'new jersey': 'nj',
  'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd',
  ohio: 'oh', oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri',
  'south carolina': 'sc', 'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut',
  vermont: 'vt', virginia: 'va', washington: 'wa', 'west virginia': 'wv',
  wisconsin: 'wi', wyoming: 'wy', 'district of columbia': 'dc',
};

/**
 * The state from whatever the firm typed into one free-text box. "Houston, Tx", "New York,
 * New York" and "East Brunswick, NJ" are all real values from the form, which is why this
 * accepts both the code and the spelled-out name and lowercases everything first.
 */
export function stateOf(city?: string): string | undefined {
  const tail = String(city ?? '').split(',').pop()?.trim().toLowerCase();
  if (!tail) return undefined;
  if (/^[a-z]{2}$/.test(tail)) return tail;
  return STATES[tail];
}

/** The registrable part of whatever the firm gave as a website. */
export function domainOf(website?: string): string | undefined {
  const raw = String(website ?? '').trim().toLowerCase();
  if (!raw) return undefined;
  const host = raw.replace(/^[a-z]+:\/\//, '').split('/')[0].split('?')[0].replace(/^www\./, '');
  return host.includes('.') ? host : undefined;
}

/**
 * One firm, straight off the index by its domain.
 *
 * dossierFor() exists because a lead gives us a website and an address and we have to work out
 * who that is. A prospect does not need any of that: it came out of the directory, so it
 * already carries the domain the index is keyed by, and guessing at a firm we have the key for
 * would be a second answer to a question with one.
 */
export async function firmByDomain(
  env: DossierEnv, domain?: string,
): Promise<FirmEntry | undefined> {
  const index = await loadIndex(env);
  const key = domainOf(domain) ?? String(domain ?? '').trim().toLowerCase();
  if (!index || !key) return undefined;
  return index.firms[key];
}

export async function dossierFor(
  env: DossierEnv, lead: { website?: string; city?: string; email?: string },
): Promise<Dossier> {
  const index = await loadIndex(env);
  const state = stateOf(lead.city);
  if (!index) return { state, covered: true, unknown: true };

  // The website first, then the email's domain. One enquiry gave a website on one domain and
  // wrote from an address on another, which is common enough among firms that run a separate
  // marketing site, and it happens in both directions. Neither field alone finds everybody.
  const candidates = [domainOf(lead.website), domainOf(lead.email?.split('@')[1])];
  let firm: FirmEntry | undefined;
  for (const d of candidates) {
    if (d && index.firms[d]) { firm = index.firms[d]; break; }
  }

  return {
    firm,
    url: firm ? `${SITE}/firms/${firm.s}/` : undefined,
    state,
    // Unknown states count as covered: the point of this flag is to stop us quoting a price
    // into a state we demonstrably do not publish, not to guess at a blank field.
    covered: !state || index.states.includes(state),
    unknown: false,
  };
}
