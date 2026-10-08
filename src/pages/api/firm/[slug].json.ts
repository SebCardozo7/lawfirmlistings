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
    outbound_link: {
      followed: ['Verified', 'Certified', 'Distinguished', 'Elite'].includes(d.score?.tier ?? ''),
      rule: 'A followed link is earned by clearing every eligibility gate, which is what reaching '
        + 'Verified means. It is not for sale and claiming a profile does not change it.',
    },
  };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
