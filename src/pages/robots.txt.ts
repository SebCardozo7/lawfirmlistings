import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const blocked = import.meta.env.LFL_NOINDEX === 'true';
  const body = blocked
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site).href}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
