import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

/**
 * What the directory knows about itself, as one file somebody can quote.
 *
 * This is not the per-firm JSON under /api/. That one is the panel's, it carries a firm's own
 * subscription and it is disallowed in robots.txt for a good reason: 1,388 files that repeat
 * what 1,388 pages already say are a waste of a crawl budget. This file is the opposite case.
 * It says something no page says, because no page can: the shape of all 1,388 firms at once.
 *
 * Every count is three-way, and that is the whole point of publishing it.
 *
 *   yes            the firms where we read the thing
 *   no             the firms where we looked and it was not there
 *   unestablished  the firms where nobody looked, or nobody could
 *
 * A directory that reports two columns turns "we could not check" into "they do not have it",
 * and the number that comes out is wrong in the flattering direction. Scoring here already
 * refuses to do that — a sub-factor with no source stays out of the denominator rather than
 * costing a firm points — and a published statistic has to keep the same promise. "44% of US
 * law firms do not state a fee model" and "44% of the 1,388 firms we could read do not state a
 * fee model" are different claims, and only the second one is ours to make. So `of_those_read`
 * carries the denominator with it, and anybody quoting a percentage from this file is quoting
 * one that already excludes what we did not see.
 *
 * `evidence` is the same honesty pointed at ourselves: it counts every sub-factor in the
 * directory by the kind of source behind it, including the 1,587 that have none because the
 * state publishes no register we may query. That number is a fact about American public records
 * rather than about any law firm, and it belongs in the open next to the scores it holds down.
 */

interface Survey {
  yes: number;
  no: number;
  unestablished: number;
  of_those_read: number | null;
}

/** A three-way count. `null` from the test means nobody established it either way. */
const survey = (firms: any[], test: (d: any) => boolean | null): Survey => {
  let yes = 0;
  let no = 0;
  let unestablished = 0;
  for (const d of firms) {
    const v = test(d);
    if (v === null) unestablished += 1;
    else if (v) yes += 1;
    else no += 1;
  }
  const read = yes + no;
  return {
    yes,
    no,
    unestablished,
    of_those_read: read ? Math.round((1000 * yes) / read) / 10 : null,
  };
};

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

const mean = (xs: number[]): number | null =>
  xs.length ? Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10 : null;

const tally = (xs: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
};

export const GET: APIRoute = async ({ site }) => {
  const firms = (await getCollection('firms', f =>
    f.data.status !== 'sample' && f.data.status !== 'not_eligible')).map(f => f.data as any);

  // Only firms with enough measured to carry a number. score.py sets this, and a directory-wide
  // median that included the incomparable ones would be an average of apples and absences.
  const comparable = firms.filter(d => d.score?.comparable && typeof d.score?.total === 'number');
  const totals = comparable.map(d => d.score.total as number);

  const pillars: Record<string, { average_share_of_max: number; firms: number }> = {};
  for (const code of ['A', 'B', 'C', 'D', 'E']) {
    const got = comparable.map(d => d.score.pillars?.[code]).filter(Boolean);
    const sum = got.reduce((a: number, p: any) => a + p.score, 0);
    const max = got.reduce((a: number, p: any) => a + p.max, 0);
    if (max) {
      pillars[code] = {
        average_share_of_max: Math.round((1000 * sum) / max) / 10,
        firms: got.length,
      };
    }
  }

  // Every sub-factor in the directory by the kind of source behind it. The vocabulary is
  // score.py's own, so 'no queryable source' and 'no roster published' stay distinct from
  // 'pending': the first two are settled answers about why a thing cannot be measured, the
  // third is a measurement we still owe.
  const evidence = tally(comparable.flatMap(d =>
    Object.values(d.score.pillars ?? {}).flatMap((p: any) =>
      (p.subs ?? []).map((s: any) => String(s.source)))));

  const rosters = firms.map(d => (d.attorneys ?? []).length);
  const named = rosters.filter(n => n > 0);

  const body = {
    name: 'Law Firm Listings: directory-wide measurements',
    description:
      'Aggregate measurements across every law firm profile published on lawfirmlistings.com. '
      + 'Counts are three-way: what we read, what we looked for and did not find, and what '
      + 'nobody established. Percentages exclude the third.',
    url: new URL('data/directory.json', site).href,
    publisher: 'Law Firm Listings',
    methodology: new URL('methodology/', site).href,
    methodology_version: comparable[0]?.score?.methodology ?? null,
    generated_at: new Date().toISOString().slice(0, 10),
    license: 'CC BY 4.0. Quote it, cite it, link it.',
    citation:
      'Law Firm Listings, "Directory-wide measurements", https://lawfirmlistings.com/data/directory.json',

    scope: {
      firms: firms.length,
      states: new Set(firms.map(d => d.market.state)).size,
      cities: new Set(firms.map(d => d.market.city_slug)).size,
      practice_areas: new Set(firms.flatMap(d => (d.practices ?? []).map((p: any) => p.slug))).size,
      note:
        'Every published firm has a verified Google Business Profile and a working site, '
        + 'because those are conditions of being listed at all. Statistics here describe the '
        + 'firms that clear that bar, not every law firm in the United States.',
    },

    score: {
      scale: '0 to 100',
      comparable_firms: comparable.length,
      incomparable_firms: firms.length - comparable.length,
      median: median(totals),
      mean: mean(totals),
      lowest: totals.length ? Math.min(...totals) : null,
      highest: totals.length ? Math.max(...totals) : null,
      tiers: tally(comparable.map(d => String(d.score.tier))),
      pillars,
    },

    what_firms_publish: {
      names_at_least_one_attorney: survey(firms, d => (d.attorneys ?? []).length > 0),
      states_a_fee_model: survey(firms, d =>
        Boolean(d.fee_model) && String(d.fee_model).trim().toLowerCase() !== 'not stated'),
      offers_a_free_consultation: survey(firms, d => Boolean(d.free_consultation)),
      publishes_its_own_mark: survey(firms, d => Boolean(d.logo)),
      publishes_a_language_other_than_english: survey(firms, d =>
        (d.languages ?? []).some((l: string) => l.toLowerCase() !== 'english')),
      publishes_a_readable_case_result: survey(firms, d => {
        const r = d.results_published ?? {};
        // The firm has a results page we could not read: that is unestablished, not a zero.
        if (r.readable === false) return null;
        return (r.count ?? 0) > 0;
      }),
      works_from_more_than_one_office: survey(firms, d => (d.offices ?? []).length > 1),
    },

    rosters: {
      attorneys_named: named.reduce((a, b) => a + b, 0),
      firms_naming_nobody: rosters.length - named.length,
      median_roster_where_one_exists: median(named),
      largest_roster: named.length ? Math.max(...named) : null,
      note:
        'A name here is a person the firm names on its own site. It is not a claim that the '
        + 'person is admitted anywhere: most states publish no attorney register we may query.',
    },

    evidence,
  };

  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
