import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

/**
 * What the firm panel is allowed to show a firm about itself, emitted at build time.
 *
 * The Worker cannot read src/data/firms: the panel runs at the edge and the firm files only exist
 * in the repository and in the build. So the build writes one of these per firm and the Worker
 * fetches it through the assets binding, which keeps a single source of truth. A field that is
 * not in here cannot be shown and cannot be edited, which is the point: the editable set is
 * declared once, here, rather than implied by whatever the panel's form happens to contain.
 *
 * The set is the one already published on /list-your-firm/ under "Claimed profile": offices,
 * phone, practice areas, languages and fee terms. Nothing that feeds a gate or a score is in it.
 * The score block is included read-only, because the same product promises a firm can see every
 * sub-score and the evidence behind it, and a firm arguing with a number needs to see it first.
 */
export const getStaticPaths = async () => {
  const firms = await getCollection('firms', f =>
    f.data.status !== 'sample' && f.data.status !== 'not_eligible');
  return firms.map(f => ({ params: { slug: f.data.slug }, props: { firm: f } }));
};

export const GET: APIRoute = ({ props }) => {
  const d = (props as any).firm.data;
  const body = {
    slug: d.slug,
    name: d.name,
    domain: d.domain,
    website: d.website,
    market: { city: d.market.city, state: d.market.state },
    status: d.status,
    // The logo as it stands, so the panel can show the firm what it is replacing rather than
    // asking it to guess.
    logo_file: d.logo?.file ?? null,
    // Read-only, and shown on the reviews page so a firm can see which number is measured and
    // which words are quoted. The rating and the count come from verified Google listings and
    // pillar C scores them against the firm's own market; the quotes are what a reader sees.
    google_rating: d.reviews?.google?.rating ?? null,
    google_count: d.reviews?.google?.count_label ?? null,
    quotes: (d.reviews?.quotes ?? []).map((q: any) => ({ text: q.text, author: q.author })),
    subscription: d.subscription
      ? { plan: d.subscription.plan, until: d.subscription.until }
      : null,
    // Editable. Each one is what the firm publishes about itself, which is why it is the firm
    // that should be able to correct it.
    editable: {
      phone: d.phone ?? '',
      languages: d.languages ?? [],
      fee_model: d.fee_model ?? '',
      free_consultation: Boolean(d.free_consultation),
      availability: d.availability ?? [],
      practices: (d.practices ?? []).map((p: any) => p.slug),
      offices: (d.offices ?? []).map((o: any) => ({
        label: o.label ?? '',
        address: o.address ?? '',
        by_appointment: Boolean(o.by_appointment),
        is_hq: Boolean(o.is_hq),
      })),
    },
    // Read-only, and here because the product promises it rather than because the panel needs it.
    score: d.score
      ? {
          total: d.score.total,
          tier: d.score.tier,
          methodology: d.score.methodology,
          computed_at: d.score.computed_at,
          verdict: d.score.verdict,
          pillars: Object.fromEntries(Object.entries(d.score.pillars ?? {}).map(
            ([k, p]: [string, any]) => [k, {
              score: p.score, max: p.max,
              subs: (p.subs ?? []).map((s: any) => ({
                code: s.code, label: s.label, pts: s.pts, max: s.max,
                source: s.source, evidence: s.evidence,
              })),
            }])),
        }
      : null,
    gates: Object.fromEntries(Object.entries(d.gates ?? {}).map(([k, g]: [string, any]) => [k, {
      pass: g?.pass ?? null, source: g?.source ?? null, evidence: g?.evidence ?? null,
    }])),
    // Whether the outbound link on this profile is followed, and why. A firm asks about this more
    // than about anything else, so the panel answers it with the rule rather than with a yes.
    outbound_link: (() => {
      const earned = ['Verified', 'Certified', 'Distinguished', 'Elite']
        .includes(d.score?.tier ?? '');
      const paid = Boolean(d.subscription?.until
        && d.subscription.until >= new Date().toISOString().slice(0, 10));
      return {
        followed: earned || paid,
        // Two ways to get it and the panel should say which one applies, because a firm that
        // earned it should not be told it bought it and a firm that bought it should not be told
        // it earned it. The sentence used to end "it is not for sale", which stopped being true
        // on 2026-10-08.
        rule: earned
          ? 'You have a followed link because you clear every eligibility gate, which is what '
            + 'reaching Verified means. That half is measured and it cannot be bought.'
          : paid
            ? 'You have a followed link as part of your annual listing. It is the one thing on '
              + 'this profile that payment reaches: it buys no points, no gate and no tier.'
            : 'A followed link comes with clearing every eligibility gate, which is what reaching '
              + 'Verified means, or with an annual listing. Nothing buys a point either way.',
      };
    })(),
  };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
