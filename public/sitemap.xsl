<?xml version="1.0" encoding="UTF-8"?>
<!--
  A stylesheet for the XML sitemap, the way Yoast and Rank Math do it.

  A sitemap is written for crawlers, and a browser shows it as either a wall of raw XML or, in
  Chrome, a single unreadable line. That makes the one artefact you most want to eyeball before a
  launch the hardest to read. This turns it into a table with a count and a section per URL, and
  changes nothing a crawler sees, since a crawler ignores the stylesheet instruction entirely.

  There is no "last modified" column because we do not publish <lastmod>. A static build does
  not know when a given page last changed, and stamping the build date on all of them would
  say every page changed today. A real per-page date is worth adding later; an invented one
  is not.

  Both shapes are handled in one file: the index that lists child sitemaps, and a urlset that
  lists pages. XSLT 1.0 only, which is all any browser implements.
-->
<xsl:stylesheet version="1.0"
                xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
                xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <xsl:output method="html" encoding="UTF-8" indent="yes"
              doctype-system="about:legacy-compat" />

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,follow" />
        <title>XML sitemap · Law Firm Listings</title>
        <style>
          /* Kept in step with the site's own palette rather than importing it: a stylesheet the
             browser applies to XML cannot rely on the site's CSS being fetched. */
          :root {
            --ink: #14141b; --muted: #5d5d6e; --line: #e6e6ee; --paper: #fff;
            --bg: #fafafc; --accent: #6d28d9; --accent-soft: #f5f3ff;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0; background: var(--bg); color: var(--ink);
            font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
                  "Helvetica Neue", Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
          }
          .wrap { max-width: 1040px; margin: 0 auto; padding: 40px 24px 72px; }
          header { border-bottom: 1px solid var(--line); padding-bottom: 22px; margin-bottom: 26px; }
          .brand {
            display: inline-flex; align-items: center; gap: 9px; text-decoration: none;
            color: var(--ink); font-weight: 640; letter-spacing: -.01em;
          }
          .brand svg { width: 22px; height: 22px; }
          h1 { margin: 18px 0 6px; font-size: 1.6rem; letter-spacing: -.02em; font-weight: 640; }
          .lede { margin: 0; color: var(--muted); max-width: 62ch; }
          .lede code {
            background: var(--accent-soft); color: var(--accent); padding: 1px 5px;
            border-radius: 4px; font-size: .86em;
          }
          .facts { display: flex; flex-wrap: wrap; gap: 10px; margin: 22px 0 0; }
          .fact {
            background: var(--paper); border: 1px solid var(--line); border-radius: 10px;
            padding: 10px 16px; min-width: 116px;
          }
          .fact b { display: block; font-size: 1.35rem; font-variant-numeric: tabular-nums; }
          .fact span { color: var(--muted); font-size: .78rem; text-transform: uppercase;
                       letter-spacing: .07em; }
          .card {
            background: var(--paper); border: 1px solid var(--line); border-radius: 12px;
            overflow: hidden;
          }
          table { width: 100%; border-collapse: collapse; }
          th, td { text-align: left; padding: 11px 18px; border-bottom: 1px solid var(--line); }
          th {
            background: #f7f7fb; font-size: .74rem; text-transform: uppercase;
            letter-spacing: .08em; color: var(--muted); font-weight: 620;
            position: sticky; top: 0;
          }
          tr:last-child td { border-bottom: 0; }
          tr:hover td { background: #fcfcfe; }
          td a { color: var(--accent); text-decoration: none; word-break: break-word; }
          td a:hover { text-decoration: underline; }
          .num { text-align: right; font-variant-numeric: tabular-nums; color: var(--muted);
                 white-space: nowrap; }
          .depth-0 a { font-weight: 600; }
          .kind {
            display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: .72rem;
            font-weight: 600; background: var(--accent-soft); color: var(--accent);
            white-space: nowrap;
          }
          footer { margin-top: 22px; color: var(--muted); font-size: .84rem; }
          footer a { color: var(--accent); }
          @media (max-width: 640px) {
            .wrap { padding: 26px 16px 56px; }
            th:nth-child(2), td:nth-child(2) { display: none; }
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --ink: #f2f2f7; --muted: #a1a1b5; --line: #2a2a36; --paper: #17171f;
              --bg: #0f0f14; --accent: #a78bfa; --accent-soft: #241d3d;
            }
            th { background: #1d1d27; }
            tr:hover td { background: #1b1b24; }
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          <header>
            <a class="brand" href="https://lawfirmlistings.com/">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3l7 2.6v5.2c0 4.6-3 8.8-7 10.2-4-1.4-7-5.6-7-10.2V5.6L12 3z"
                      stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
                <path d="M8.8 12.2l2.2 2.2 4.4-4.8" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span>Law Firm Listings</span>
            </a>
            <xsl:choose>
              <xsl:when test="/s:sitemapindex">
                <h1>XML sitemap index</h1>
                <p class="lede">This file points crawlers at the sitemaps below. Generated on every
                  build from the routes that exist, so a new firm, city or practice area appears
                  here as soon as its page does. A page carrying
                  <code>noindex</code> is left out.</p>
                <div class="facts">
                  <div class="fact">
                    <b><xsl:value-of select="count(/s:sitemapindex/s:sitemap)" /></b>
                    <span>Sitemaps</span>
                  </div>
                </div>
              </xsl:when>
              <xsl:otherwise>
                <h1>XML sitemap</h1>
                <p class="lede">Every page we ask search engines to index. Generated on every build
                  from the routes that exist; a page carrying <code>noindex</code> is left out, so
                  nothing here contradicts itself.</p>
                <div class="facts">
                  <div class="fact">
                    <b><xsl:value-of select="count(/s:urlset/s:url)" /></b>
                    <span>URLs</span>
                  </div>
                  <div class="fact">
                    <b><xsl:value-of select="count(/s:urlset/s:url[contains(s:loc, '/firms/')])" /></b>
                    <span>Firm profiles</span>
                  </div>
                  <div class="fact">
                    <b><xsl:value-of select="count(/s:urlset/s:url[contains(s:loc, '/guides/')])" /></b>
                    <span>Guides</span>
                  </div>
                </div>
              </xsl:otherwise>
            </xsl:choose>
          </header>

          <div class="card">
            <xsl:choose>
              <xsl:when test="/s:sitemapindex">
                <table>
                  <tr><th>Sitemap</th></tr>
                  <xsl:for-each select="/s:sitemapindex/s:sitemap">
                    <tr>
                      <td><a href="{s:loc}"><xsl:value-of select="s:loc" /></a></td>
                    </tr>
                  </xsl:for-each>
                </table>
              </xsl:when>
              <xsl:otherwise>
                <table>
                  <tr>
                    <th>URL</th>
                    <th class="num">Section</th>
                  </tr>
                  <xsl:for-each select="/s:urlset/s:url">
                    <tr>
                      <td>
                        <a href="{s:loc}"><xsl:value-of select="s:loc" /></a>
                      </td>
                      <td class="num">
                        <!-- The section is read off the path, so nothing has to be maintained
                             alongside the routes. -->
                        <span class="kind">
                          <xsl:choose>
                            <xsl:when test="contains(s:loc, '/firms/')">Firm</xsl:when>
                            <xsl:when test="contains(s:loc, '/guides/')">Guide</xsl:when>
                            <xsl:when test="contains(s:loc, '/practice-areas/')">Practice area</xsl:when>
                            <xsl:when test="contains(s:loc, '/cities/')">City</xsl:when>
                            <xsl:when test="contains(s:loc, '/methodology/')">Methodology</xsl:when>
                            <xsl:otherwise>Page</xsl:otherwise>
                          </xsl:choose>
                        </span>
                      </td>
                    </tr>
                  </xsl:for-each>
                </table>
              </xsl:otherwise>
            </xsl:choose>
          </div>

          <footer>
            <p>This view exists for people. Crawlers ignore the stylesheet and read the XML
              underneath it. Read <a href="https://lawfirmlistings.com/methodology/">how firms are
              scored</a>, or <a href="https://lawfirmlistings.com/contact/">tell us something is
              wrong</a>.</p>
          </footer>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
