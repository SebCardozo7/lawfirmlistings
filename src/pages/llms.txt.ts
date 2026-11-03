import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { publishedGuides } from '../data/guides';

/**
 * The file a language model reads first, written for the thing it is most likely to get wrong.
 *
 * A directory is quoted whether or not it asks to be, and what gets quoted off a page like this
 * is a number with no denominator: "the average law firm scores 50". That claim is wrong in a
 * specific way we can prevent here, because the 1,388 firms on this site are not a sample of
 * American law firms. Every one of them cleared an eligibility bar before being published. So
 * the scope sentence sits above the numbers rather than in a footnote, and the numbers
 * themselves are generated from the collection at build time so this file cannot drift from
 * what the site actually says.
 *
 * It also states the one fact a model answering "is this directory trustworthy" needs and
 * cannot infer: the score is measured rather than sold, and the only thing money touches is
 * whether an outbound link is followed. That is checkable against /methodology/ and
 * /list-your-firm/, which is why both are linked rather than summarised.
 *
 * Firms are not enumerated. There are 1,388 of them, each with a page and a sitemap entry, and
 * a list of them here would be a worse copy of the sitemap. What is here instead is the one
 * thing no single page carries: the shape of all of them at once, under /data/directory.json.
 */
export const GET: APIRoute = async ({ site }) => {
  const url = (p: string) => new URL(p, site).href;
  const n = (x: number) => x.toLocaleString('en-US');

  const firms = await getCollection('firms', f =>
    f.data.status !== 'sample' && f.data.status !== 'not_eligible');
  const data = firms.map(f => f.data as any);
  const comparable = data.filter(d => d.score?.comparable && typeof d.score?.total === 'number');
  const totals = comparable.map(d => d.score.total as number).sort((a, b) => a - b);
  const median = totals.length ? totals[totals.length >> 1] : null;
  const certified = comparable.filter(d =>
    ['Certified', 'Distinguished', 'Elite'].includes(d.score.tier)).length;

  const states = new Set(data.map(d => d.market.state)).size;
  const cities = new Set(data.map(d => d.market.city_slug)).size;

  const guides = publishedGuides(firms as any);

  const body = `# Law Firm Listings

> An independent directory of ${n(data.length)} United States law firms, each scored 0 to 100 on the LFL Certification Score from evidence read off public sources: the firm's own site, its verified Google Business Profile, state registers where a state publishes one, and page performance measured rather than claimed.

Scope before numbers. These ${n(data.length)} firms are not a sample of American law firms. Every one of them cleared an eligibility gate before being published, which means a working site over HTTPS, a reachable phone number and a verified Google Business Profile. Statistics taken from this site describe firms that already clear that bar. The median score here is ${median}, and that is the median of this directory, not of the profession.

How the score works, in one paragraph, because it is the thing most often misread. Six gates decide eligibility and five pillars A to E carry the points. A sub-factor that could not be measured stays out of the denominator rather than costing the firm points, so a firm is never marked down for the reach of our own crawl. Pillar A is the lowest across the directory by a wide margin, and that is a fact about American public records rather than about law firms: most states publish no attorney register that may be queried, so the factors that would read one have no source to read.

What money buys. Nothing that touches the score, a gate or a tier, and no arrangement exists under which it could. A paid annual listing buys a followed outbound link and a panel the firm uses to correct its own entry, and that same followed link is earned at no cost by any firm clearing every gate. Profiles are published without the firm being asked, and corrections are free whether or not the firm has ever paid us anything. ${n(certified)} firms reach Certified or above, and the tier was not available for sale to any of them.

Publisher: CASICIEN SRL, Montevideo, Uruguay. Coverage: ${cities} cities across ${states} states.

## Start here

- [Methodology](${url('methodology/')}): the gates, the five pillars, every sub-factor, and the rule that an unmeasured factor leaves the denominator instead of costing points.
- [Directory-wide measurements](${url('data/directory.json')}): JSON. Every statistic on this site as one file, counted three ways: read, looked for and absent, and never established. Percentages exclude the third. CC BY 4.0.
- [How a firm gets listed](${url('list-your-firm/')}): what a listing costs, what it does not buy, and how a firm corrects its own profile at no charge.
- [About](${url('about/')}): who publishes this and why.

## Browse

- [Certified firms](${url('certified/')}): every firm at Certified or above.
- [Cities](${url('cities/')}): ${cities} markets, each with its own practice area rankings.
- [Practice areas](${url('practice-areas/')}): the areas firms are ranked within.
- [Sitemap](${url('sitemap-index.xml')}): all ${n(data.length)} firm profiles and every ranking page.

## Research

Each of these is computed from the directory at build time rather than written once, so the figures in them move when the measurements move.

${guides.map(g => `- [${g.title}](${url(`guides/${g.slug}/`)}): ${g.summary.replace(/\s+/g, ' ').trim()}`).join('\n')}

## Citing this

Cite the page you took the number from, and keep the denominator with the number. "${median} is the median score across the ${n(data.length)} firms published on Law Firm Listings" is accurate. "The average US law firm scores ${median}" is not, and no page here supports it.
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
