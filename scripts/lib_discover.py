"""
Page discovery for the public crawler: read the site's sitemap, and tell a roster page from a
sales page.

Both problems showed up on the same firm. The crawler follows internal links from the home page
and guesses a few fixed paths, so it recorded "no attorney bios" for a firm whose
/meet-our-attorneys/ page is listed in its own sitemap and simply is not linked from the home
page in a form the matcher recognised. That one missing page costs a D1 point, and it also
blocks G1, G5 and A2, all of which need the attorney roster. A shallowly linked site loses most,
which is exactly the small practice we least want to penalise.

So: enumerate URLs from the sitemap, which is the list the site itself publishes for crawlers,
and fall back to link-following when there is no sitemap.

The matching half is subtler than it looks. Widening the attorney pattern to a substring is what
caused an earlier bug, where /car-accident-lawyers/ was recorded as a firm's attorney page. The
segment shape alone cannot separate the two, because both end in "lawyers". What separates them
is the practice-area vocabulary: a firm sells on /car-accident-lawyers/ and lists its people on
/meet-our-attorneys/.
"""
from __future__ import annotations

import re
import urllib.parse

# A segment carrying any of these is a service page, whatever else it says.
PRACTICE_WORDS = re.compile(
    r"accident|injur|malpractice|negligen|compensat|wrongful|death|slip|trip|fall|"
    r"construction|scaffold|truck|car|auto|motorcycle|bicycle|bike|pedestrian|premises|"
    r"product|liabilit|nursing|abuse|dog-bite|burn|brain|spinal|"
    r"discriminat|harass|divorce|custody|immigration|criminal|dui|dwi|"
    r"bankrupt|estate|probate|employment|workers|comp|mesotheli|talc|roundup|camp-lejeune",
    re.I)

TEAM_WORD = (r"(?:attorneys?|lawyers?|team|staff|people|profiles?|professionals|partners|"
             r"associates|bios?)")
# "meet our attorneys", "our-legal-team", "the-firm-attorneys", "attorney-profiles".
ATTORNEY_SEGMENT = re.compile(
    r"^(?:meet[-_])?(?:our[-_]|the[-_])?(?:legal[-_]|firm[-_])?" + TEAM_WORD
    + r"(?:[-_](?:bios?|profiles?|page))?$", re.I)


def is_attorney_path(path: str) -> bool:
    """True when some segment of the path names a roster rather than a practice area."""
    for seg in [s for s in path.split("/") if s]:
        seg = seg.removesuffix(".html").removesuffix(".htm").removesuffix(".php")
        if PRACTICE_WORDS.search(seg):
            continue
        if ATTORNEY_SEGMENT.match(seg):
            return True
    return False


# A sitemap document named for the firm's people. This turned out to be a better signal than
# any URL shape: one firm publishes staff-sitemap.xml listing nine bios that live at the root
# of the site, /david-perecman/ and so on, nowhere near its /attorneys/ index. Path-based
# detection cannot find those, and a name-based sitemap can. WordPress emits one of these per
# custom post type, which is most law firm sites.
#
# "author" is deliberately not here: an author sitemap lists blog archive pages, and treating
# a byline archive as an attorney bio would put the wrong people on a roster.
ROSTER_SITEMAP = re.compile(r"(?:staff|attorney|lawyer|team|people|profile)s?[-_]?sitemap",
                            re.I)


def sitemap_locations(origin: str, robots_body: str | None) -> list[str]:
    """Sitemaps the site declares, then the conventional locations, de-duplicated in order."""
    found = [m.group(1).strip() for m in
             re.finditer(r"(?im)^\s*sitemap:\s*(\S+)", robots_body or "")]
    found += [origin + p for p in ("/sitemap_index.xml", "/sitemap.xml", "/wp-sitemap.xml",
                                   "/sitemap-index.xml")]
    seen, out = set(), []
    for url in found:
        if url.startswith(origin) and url not in seen:
            seen.add(url)
            out.append(url)
    return out


def parse_sitemap(xml: str) -> tuple[list[str], list[str]]:
    """(child sitemap URLs, page URLs). A sitemap index nests, so the two are kept apart."""
    if not xml:
        return [], []
    locs = [m.group(1).strip() for m in
            re.finditer(r"<loc>\s*([^<\s]+)\s*</loc>", xml, re.I)]
    # <sitemapindex> lists sitemaps; <urlset> lists pages. Anything else is treated as pages.
    if re.search(r"<sitemapindex", xml, re.I):
        return locs, []
    return [], locs


def crawl_sitemap(origin: str, fetch, can_fetch, robots_body: str | None,
                  max_documents: int = 12, max_urls: int = 6000) -> tuple[list[str], list[str]]:
    """(every page URL the site publishes, the subset that came from a roster sitemap).

    Breadth-first across sitemap indexes. `fetch` and `can_fetch` are injected so this shares
    the caller's timeout, user agent, rate limit and robots handling rather than opening a
    second, differently behaved crawler.
    """
    queue = sitemap_locations(origin, robots_body)
    pages: list[str] = []
    roster: list[str] = []
    seen_docs: set[str] = set()
    fetched = 0

    while queue and fetched < max_documents and len(pages) < max_urls:
        doc = queue.pop(0)
        if doc in seen_docs or not can_fetch(doc):
            continue
        seen_docs.add(doc)
        status, body, _ = fetch(doc)
        fetched += 1
        if status != 200 or not body:
            continue
        children, urls = parse_sitemap(body)
        if ROSTER_SITEMAP.search(doc):
            roster.extend(u.split("?")[0] for u in urls if u.startswith(origin))
        # Prefer child sitemaps whose name suggests pages over ones full of blog posts, so the
        # document budget is not spent on a thousand articles before reaching /attorneys/.
        children.sort(key=lambda u: 0 if re.search(r"page|attorney|team|staff", u, re.I) else 1)
        queue.extend(c for c in children if c.startswith(origin))
        pages.extend(u.split("?")[0] for u in urls if u.startswith(origin))

    def unique(xs):
        seen, out = set(), []
        for url in xs:
            if url not in seen:
                seen.add(url)
                out.append(url)
        return out

    return unique(pages)[:max_urls], unique(roster)


def pick_by_kind(urls: list[str], link_kinds: list[tuple[str, str]]) -> dict[str, str]:
    """Shallowest matching URL per kind, so an index page wins over a page beneath it."""
    best: dict[str, tuple[int, str]] = {}
    for url in urls:
        path = urllib.parse.urlparse(url).path.lower()
        if path in ("", "/"):
            continue
        depth = len([s for s in path.split("/") if s])
        kind = "attorneys" if is_attorney_path(path) else None
        if kind is None:
            for name, pattern in link_kinds:
                if re.search(pattern, path):
                    kind = name
                    break
        if kind is None:
            continue
        if kind not in best or depth < best[kind][0]:
            best[kind] = (depth, url)
    return {k: v[1] for k, v in best.items()}


def attorney_bio_urls(urls: list[str], index_url: str | None,
                      roster: list[str] | None = None) -> list[str]:
    """Individual bio pages.

    Two sources, because firms organise this two ways. A dedicated roster sitemap is the
    stronger signal and is used whole. Otherwise the bios sit one segment below the roster
    index and are picked out by depth.

    Either way they come from the sitemap rather than from links on the index page, because
    several of these firms render their team grid in JavaScript and the index's server-side
    HTML lists nobody at all.
    """
    if roster:
        return [u.rstrip("/") for u in roster]
    if not index_url:
        return []
    index_path = urllib.parse.urlparse(index_url).path.rstrip("/")
    depth = len([s for s in index_path.split("/") if s])
    prefix = index_path + "/"
    out = []
    for url in urls:
        path = urllib.parse.urlparse(url).path
        if not path.startswith(prefix):
            continue
        if len([s for s in path.split("/") if s]) != depth + 1:
            continue
        clean = url.rstrip("/")
        if clean != index_url.rstrip("/"):
            out.append(clean)
    return out
