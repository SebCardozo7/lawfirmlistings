import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

/**
 * One line per published firm, so the lead desk can answer "do we already publish these people"
 * without a human opening the repository.
 *
 * It exists because of what answering four follow-ups cost on 2026-11-08. Every one of them
 * needed the same five facts before a word could be written: is this firm published, what is
 * its score, where is its page, which pillar is it losing the most on, and do we even cover its
 * state. All five live in src/data/firms, none of them reach the Worker, and all five were
 * looked up by hand. The lead ledger knew the enquiry and knew nothing about the firm, which
 * made it a list rather than a desk.
 *
 * Served from the build rather than kept as a generated module in the repository, because a
 * generated file is a file that goes stale and then lies. This one cannot disagree with the
 * site: it is built from the same collection the profile pages are, in the same run, so a firm
 * that is published is in here and a firm that is not is not.
 *
 * Not reachable from the open web. Nothing in it is private and every number here is already
 * on a public profile page, but a single file that hands over the whole directory is a
 * different thing from 1,388 pages that each hand over one, and there is no reason to invite
 * that. So worker/index.ts answers 404 for this path, and the desk reads it through
 * env.ASSETS.fetch, which goes to the asset store rather than back through the router.
 *
 * robots.txt disallowing /api/ is the belt; the 404 is the braces.
 *
 * Keys are one and two letters on purpose. Spelled out, the file is about three times the size
 * for a reader that is a Worker rather than a person.
 */

interface Sub { code: string; pts: number; max: number }
interface Pillar { score: number; max: number; subs?: Sub[] }

interface Entry {
  /** slug, for the profile URL */
  s: string;
  /** name as published */
  n: string;
  /** two letter state, lowercased */
  st: string;
  /** score out of 100 */
  sc: number;
  /** tier: Distinguished, Certified, Verified, Listed */
  t: string;
  /** weakest pillar: [code, scored, max] */
  w: [string, number, number];
  /** next tier: [name, points needed] */
  g?: [string, number];
  /** the single sub-factor with the most points available: [code, label, available] */
  o?: [string, string, number];
  /**
   * The points in pillar E the firm has not got, as [label, scored, max] per sub-factor.
   *
   * Pillar E is the only one a firm can move by itself in a week, because every sub-factor in
   * it is read off the firm's own website: what it charges, what languages it works in, when
   * it answers. Nothing in here needs a docket, a register, a backlink or a payment to us.
   *
   * It is separate from `o` above, which is the biggest gap anywhere and is usually D2, search
   * authority, a number no firm changes by writing a sentence. A letter that names `o` is
   * accurate and useless to the reader. This is the part they can act on, and across the 1,388
   * published firms it averages 10.4 points of 15 unclaimed, with 832 of them missing 10 or
   * more. Omitted when the firm has already got them all.
   */
  fr?: [string, number, number][];
  /**
   * The firm's own logo, which scripts/fetch_logos.py downloaded and public/logos/ serves.
   *
   * Usually just the extension, because every one of the 1,334 files we hold is named after
   * the domain that is this entry's own key, so repeating the domain here would add 30KB to
   * a file a Worker fetches. A file that ever breaks that convention carries its whole path
   * instead, told apart by the slash, so the shorthand cannot quietly point at the wrong
   * picture.
   */
  l?: string;
}

export const GET: APIRoute = async () => {
  const firms = (await getCollection('firms', f =>
    f.data.status !== 'sample' && f.data.status !== 'not_eligible')).map(f => f.data as any);

  const out: Record<string, Entry> = {};
  const states = new Set<string>();

  for (const f of firms) {
    const domain = String(f.domain || '').trim().toLowerCase();
    if (!domain) continue;
    const state = String(f.market?.state || '').trim().toLowerCase();
    if (state) states.add(state);

    const pillars: Record<string, Pillar> = f.score?.pillars ?? {};

    // The weakest pillar by the share of its own maximum, not by raw points. Pillar D is out of
    // 25 and pillar E out of 15, so "lowest score" would name D almost every time and send the
    // same sentence to every firm. What a letter wants is the pillar where the firm is furthest
    // from what it could have.
    let weakest: [string, number, number] = ['', 0, 0];
    let worstShare = Infinity;
    for (const [code, p] of Object.entries(pillars)) {
      if (!p || typeof p.score !== 'number' || !p.max) continue;
      const share = p.score / p.max;
      if (share < worstShare) {
        worstShare = share;
        weakest = [code, Math.round(p.score * 10) / 10, p.max];
      }
    }

    // And inside it, the one sub-factor with the most points on the table. This is the sentence
    // that makes a follow-up worth reading: not "pillar E is low" but "availability is 0 of 5".
    let best: [string, string, number] | undefined;
    for (const p of Object.values(pillars)) {
      for (const sub of p?.subs ?? []) {
        if (typeof sub.pts !== 'number' || typeof sub.max !== 'number') continue;
        const available = sub.max - sub.pts;
        if (available > (best?.[2] ?? 0)) {
          best = [sub.code, (sub as any).label ?? sub.code, Math.round(available * 10) / 10];
        }
      }
    }

    // The logo, as an extension where the convention holds and as a path where it does not.
    const file = String(f.logo?.file ?? '');
    const dot = file.lastIndexOf('.');
    const ext = dot > 0 ? file.slice(dot + 1) : '';
    const logo = !file ? undefined
      : file === `/logos/${domain}.${ext}` ? ext
      : file;

    // The unclaimed points in pillar E, in the order the pillar declares them, so the letter
    // that prints them is reading the methodology's own sequence rather than one of its own.
    const free = (pillars.E?.subs ?? [])
      .filter(s => typeof s.pts === 'number' && typeof s.max === 'number' && s.pts < s.max)
      .map(s => [(s as any).label ?? s.code, Math.round(s.pts * 10) / 10, s.max] as
        [string, number, number]);

    const next = f.score?.next_tier;
    out[domain] = {
      s: String(f.slug ?? ''),
      n: String(f.name ?? ''),
      st: state,
      sc: Number(f.score?.total ?? 0),
      t: String(f.score?.tier ?? ''),
      w: weakest,
      ...(next?.name && typeof next.gap === 'number' ? { g: [next.name, next.gap] as [string, number] } : {}),
      ...(best ? { o: best } : {}),
      ...(free.length ? { fr: free } : {}),
      ...(logo ? { l: logo } : {}),
    };
  }

  return new Response(JSON.stringify({
    generated_at: new Date().toISOString().slice(0, 10),
    // The states we publish, so the desk can tell "we have no profile for this firm" apart from
    // "we do not cover this firm's state at all". Those are different answers to a firm asking
    // to be listed, and sending the first when the second is true is how we quoted a price to a
    // New Jersey firm for a page that could not exist.
    states: [...states].sort(),
    count: Object.keys(out).length,
    firms: out,
  }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
