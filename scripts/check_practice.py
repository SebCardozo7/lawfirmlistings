#!/usr/bin/env python3
"""
Does this firm actually practise this area, by its own account?

Discovery returns whoever the map returns, and a text search for "workers compensation lawyer New
York" hands back sixty personal injury firms along with the ten that do the work. Ranking a firm
in a practice it does not hold itself out for would be a fabrication, and the first six results
for that query on Places contain several.

The evidence a directory is entitled to use is the firm's own page about the practice. Not a
mention in a footer link list, where every firm in the state lists every area of law that exists,
and not a phrase in a blog post. A page, with the practice in its title or its first heading.

So this reads the site the way a person would. It asks for the sitemap first, because that is the
list the site itself publishes for crawlers, falls back to the links on the home page, and
follows the best candidate to confirm what the page is actually about. Robots.txt is honoured, a
403 is recorded as a 403 rather than worked around, and nothing here retries a refusal.

The result is written back into the firm's staging record as `practice_evidence`, so the cohort
is assembled from something checkable rather than from a domain name that happened to contain the
words. It is also why a firm already published in another practice can be added to this one
later: the evidence is per practice, not per firm.

Usage:
    python scripts/check_practice.py --practice workers-compensation \\
        --candidates .crawl/candidates-ny-workers-compensation.json --top 40
    python scripts/check_practice.py --practice workers-compensation --domains workerslaw.com
"""
from __future__ import annotations

import argparse
import datetime
import io
import json
import pathlib
import re
import sys
import time
import urllib.parse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from crawl_public import DELAY, fetch, robots_body, robots_for, strip_tags, unescape  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
TODAY = datetime.date.today().isoformat()

# Per practice: what the URL of such a page looks like, and what its title has to say. The two
# are deliberately different. A slug is abbreviated ("workers-comp", "work-injury") where a
# heading is written out, and requiring both to match the same pattern rejected real pages.
PRACTICES = {
    "workers-compensation": {
        "slug": re.compile(r"work(?:ers?|place)?[-_]?(?:comp\b|compensation|injur)|"
                           r"injured[-_]?(?:at[-_])?work|on[-_]the[-_]job", re.I),
        "title": re.compile(r"workers?'?s?\s+comp(?:ensation)?\b|work(?:place)?\s+injur|"
                            r"injured\s+(?:at|on\s+the)\s+(?:work|job)", re.I),
        # Present on a page about the practice and absent from one that only mentions it.
        "corroborating": re.compile(
            r"workers'?\s*compensation\s*board|\bWCB\b|form\s*C-3|schedule\s*loss|"
            r"lost\s*wages|third[-\s]party\s*(?:claim|case|action)|light\s*duty|"
            r"independent\s*medical\s*exam", re.I),
    },
    "personal-injury": {
        "slug": re.compile(r"personal[-_]?injur|injury[-_]lawyer|accident[-_]lawyer", re.I),
        "title": re.compile(r"personal\s+injury", re.I),
        "corroborating": re.compile(r"negligen|statute\s+of\s+limitations|pain\s+and\s+suffering|"
                                    r"contingen", re.I),
    },
}

# A link in a page-wide list of every area of law the firm might take. Those lists are the reason
# a footer cannot be evidence: they are marketing surface, not a statement of practice.
MENU_DENSITY = 12

# Words that may appear in the address of the practice page itself without making it a different
# page. Anything else in the final segment is a variant: a borough, a glossary, a blog post. The
# ranking below prefers the page with the fewest of those, which is the practice page.
CORE_WORDS = {
    "law", "lawyer", "lawyers", "attorney", "attorneys", "firm", "practice", "areas",
    "new", "york", "nyc", "ny", "manhattan", "our", "the", "a", "and", "of", "in",
}


def sitemap_urls(origin, robots, rp):
    """URLs from the sitemaps robots.txt declares, plus the conventional location."""
    seen, out = set(), []
    todo = re.findall(r"(?im)^\s*sitemap:\s*(\S+)", robots or "") or [origin + "/sitemap.xml"]
    while todo and len(out) < 4000:
        url = todo.pop(0)
        if url in seen or len(seen) > 12:
            continue
        seen.add(url)
        if not rp.can_fetch("*", url):
            continue
        status, body, _ = fetch(url)
        time.sleep(DELAY)
        if status != 200 or not body:
            continue
        # A sitemap index points at more sitemaps; both are <loc> lists.
        locs = [unescape(m) for m in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body, re.I)]
        for loc in locs:
            (todo if loc.lower().endswith(".xml") or "sitemap" in loc.lower() else out).append(loc)
    return out


def home_links(origin, rp):
    if not rp.can_fetch("*", origin + "/"):
        return []
    status, html, _ = fetch(origin + "/")
    time.sleep(DELAY)
    if status != 200 or not html:
        return []
    return [urllib.parse.urljoin(origin + "/", unescape(h))
            for h in re.findall(r'<a[^>]+href=["\']([^"\'#]+)', html, re.I)]


def confirm(url, spec, rp):
    """Fetch a candidate page and decide whether it is about the practice."""
    if not rp.can_fetch("*", url):
        return None, "robots.txt disallows it"
    status, html, final = fetch(url)
    time.sleep(DELAY)
    if status != 200 or not html:
        return None, "HTTP %s" % (status if status else "unreachable")

    head = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.I | re.S)
    title = unescape(strip_tags(head.group(1))).strip() if head else ""
    heading = unescape(strip_tags(h1.group(1))).strip() if h1 else ""

    if not (spec["title"].search(title) or spec["title"].search(heading)):
        return None, "page is not titled for the practice"

    text = strip_tags(html)
    if not spec["corroborating"].search(text):
        return None, "titled for the practice but says nothing specific to it"

    return {
        "url": final,
        "title": title or heading,
        "heading": heading or None,
        "checked_at": TODAY,
        "source": "the firm's own practice page",
    }, None


def examine(domain, spec):
    origin = "https://" + domain
    rp = robots_for(origin)
    robots = robots_body(origin)

    urls = sitemap_urls(origin, robots, rp)
    where = "sitemap"
    if not urls:
        urls = home_links(origin, rp)
        where = "home page links"

    candidates, seen = [], set()
    for url in urls:
        if urllib.parse.urlparse(url).netloc.split(":")[0].removeprefix("www.") != domain:
            continue
        path = urllib.parse.urlparse(url).path
        if not spec["slug"].search(path) or url in seen:
            continue
        seen.add(url)
        candidates.append(url)

    if not candidates:
        return None, "no page whose address names the practice (%s)" % where

    # A site with dozens of matching URLs has a page per borough and per injury type as well as
    # the practice page. Rank by how much of the final segment is not the practice itself, then
    # by depth: /workers-compensation beats /workers-comp-glossary beats /bronx/workers-comp.
    def rank(url):
        parts = [p for p in urllib.parse.urlparse(url).path.strip("/").split("/") if p]
        # Every segment, not only the last: /bronx/workers-compensation is a borough variant
        # and its final segment alone looks like the practice page itself.
        tokens = [t for t in re.split(r"[-_./]+", "/".join(parts).lower()) if t]
        extra = [t for t in tokens
                 if t not in CORE_WORDS and not spec["slug"].search(t) and not t.isdigit()]
        return (len(extra), len(parts), len(url))

    candidates.sort(key=rank)
    if len(candidates) > MENU_DENSITY:
        candidates = candidates[:MENU_DENSITY]

    last = "no candidate page confirmed"
    for url in candidates[:8]:
        found, why = confirm(url, spec, rp)
        if found:
            found["candidates_seen"] = len(seen)
            return found, None
        last = why
    return None, last


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--practice", required=True, choices=sorted(PRACTICES))
    ap.add_argument("--candidates", help="a file written by scripts/discover_places.py")
    ap.add_argument("--domains", help="comma-separated domains instead")
    ap.add_argument("--top", type=int, default=40, help="how many candidates to examine")
    ap.add_argument("--staging", default=".crawl")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    if args.domains:
        domains = [d.strip() for d in args.domains.split(",") if d.strip()]
        names = {}
    elif args.candidates:
        data = json.load(io.open(args.candidates, encoding="utf-8"))
        rows = data["candidates"][:args.top]
        domains = [r["domain"] for r in rows]
        names = {r["domain"]: r.get("name", "") for r in rows}
    else:
        print("give --candidates or --domains", file=sys.stderr)
        return 2

    spec = PRACTICES[args.practice]
    staging = ROOT / args.staging
    staging.mkdir(parents=True, exist_ok=True)
    holds, misses = [], []

    for i, domain in enumerate(domains, 1):
        try:
            found, why = examine(domain, spec)
        except Exception as err:                      # a site can fail in ways urllib does not
            found, why = None, "error: %s" % err
        label = (names.get(domain) or "")[:34]
        print("%3d/%d %-34s %-34s %s"
              % (i, len(domains), domain[:34], label,
                 found["url"][:60] if found else "no  (%s)" % why))

        path = staging / (domain + ".json")
        rec = {}
        if path.exists():
            try:
                rec = json.load(io.open(path, encoding="utf-8"))
            except (ValueError, OSError):
                rec = {}
        rec.setdefault("domain", domain)
        evidence = rec.setdefault("practice_evidence", {})
        evidence[args.practice] = found or {"held": False, "why": why, "checked_at": TODAY}
        io.open(path, "w", encoding="utf-8", newline="\n").write(
            json.dumps(rec, ensure_ascii=False, indent=2) + "\n")

        (holds if found else misses).append(domain)

    print()
    print("%d of %d publish a %s practice page" % (len(holds), len(domains), args.practice))
    print()
    for d in holds:
        print("   %s" % d)
    return 0


if __name__ == "__main__":
    sys.exit(main())
