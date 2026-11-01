import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { badgesFor, type Skin } from '../../../lib/badge';

/**
 * The badge files themselves, one per firm per badge per skin.
 *
 * Static, so a law firm's page embeds a file from our origin and nothing of ours runs on their
 * site. Rebuilt on every deploy, which is the whole promise: a firm that drops a tier sees the
 * badge on its own website change, where the rest of this industry hands out a JPEG that says
 * the same thing for ever.
 *
 * Two skins because a badge has to sit on somebody else's design. The dark pill is for a dark
 * footer and the light one for a white sidebar, and a firm that gets the choice wrong just
 * hotlinks the other address.
 */
export const getStaticPaths = async () => {
  const all = await getCollection('firms', f =>
    f.data.status !== 'sample' && f.data.status !== 'not_eligible');

  const paths: { params: { slug: string; kind: string }; props: { svg: string } }[] = [];
  for (const firm of all) {
    for (const badge of badgesFor(firm, all)) {
      for (const skin of ['dark', 'light'] as Skin[]) {
        paths.push({
          params: {
            slug: firm.data.slug,
            kind: skin === 'dark' ? badge.kind : `${badge.kind}-light`,
          },
          props: { svg: badge.svg(skin) },
        });
      }
    }
  }
  return paths;
};

export const GET: APIRoute = ({ props }) =>
  new Response((props as { svg: string }).svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // An hour, not a year. The file is a live statement about a firm's standing and a deploy
      // can change it, so a stale copy on somebody's page is the one failure worth avoiding.
      'Cache-Control': 'public, max-age=3600',
    },
  });
