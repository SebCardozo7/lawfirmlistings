import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const blocked = import.meta.env.LFL_NOINDEX === 'true';
  const body = blocked
    ? 'User-agent: *\nDisallow: /\n'
    // /api/ is the per-firm JSON the panel reads and /claim/ is the panel itself. Neither is a
    // page, neither is in the sitemap, and the JSON duplicates what the profile already publishes.
    // Googlebot came 208 times in thirty days, so none of that budget should go on 1,248 files
    // that say what 1,248 pages already say.
    : `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /claim/\n\n`
      + `Sitemap: ${new URL('sitemap-index.xml', site).href}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
