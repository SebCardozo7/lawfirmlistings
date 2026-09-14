#!/usr/bin/env python3
"""
Find the firms that make up a market, without Ahrefs.

Every cohort so far was assembled from Ahrefs: take the domains ranking for the practice in the
state, measure them against each other, publish. That has two problems and the second is the one
that matters.

The small problem is supply. The Ahrefs subscription runs out of units, and when it does the
whole directory stops opening new markets until the reset date. Nothing else in the pipeline has
that property.

The real problem is what an SEO-derived cohort is. A list of the domains that rank is a list of
who invested in ranking, which is a fact about marketing budgets, and using it to decide who gets
measured means the firms a reader would actually find on a map never enter the directory at all.
Workers' compensation makes that visible: it is a practice full of small offices that take
referrals and run no content operation whatsoever.

So this asks the question a reader asks. It runs the search terms somebody would type, across the
city and each of its boroughs, and keeps what the map returns: a firm, its site, its offices and
the review count its own clients left. Prominence on a map is not merit either, and nothing here
scores anything. It decides who gets measured, and the measuring is the rest of the pipeline.

Three filters keep the list honest, and each exists because of something it caught:

    a business status that is not OPERATIONAL       a closed office is not a firm
    no website                                     nothing to measure, so nothing to publish
    a directory, not a practice                    avvo, findlaw and justia outrank real firms

The output is a candidate file, deliberately not a cohort. A human reads it, drops what is not a
firm, and writes the cohort. That step is not automation waiting to happen: it is where a solo
practitioner's personal page, a franchise's regional landing page and an out-of-state firm's
satellite get told apart, and none of those is a judgement an address string supports.

Usage:
    python scripts/discover_places.py --id ny-workers-compensation \\
        --query "workers compensation lawyer New York NY" \\
        --area Manhattan --area Brooklyn --area Queens --area Bronx --area "Staten Island"
"""
from __future__ import annotations

import argparse
import datetime
import io
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
TODAY = datetime.date.today().isoformat()
ENDPOINT = "https://places.googleapis.com/v1/places:searchText"
FIELDS = ("places.displayName,places.formattedAddress,places.rating,places.userRatingCount,"
          "places.websiteUri,places.id,places.businessStatus,places.primaryTypeDisplayName,"
          "nextPageToken")

# Aggregators that rank for every legal query in the country. None of them is a law firm.
DIRECTORIES = re.compile(
    r"(^|\.)(avvo|findlaw|justia|lawyers|martindale|superlawyers|nolo|legalmatch|yelp|"
    r"thumbtack|expertise|bbb|yellowpages|mapquest|birdeye|lawinfo|attorneys|hg|"
    r"linkedin|facebook|instagram|x|twitter|youtube|google|bing)\.(com|org|net)$", re.I)

# A display name that is a search phrase rather than a firm. Somebody typed it into their own
# Google Business Profile to rank, and it must not become a firm's name in this directory.
NOT_A_NAME = re.compile(
    r"^(best|top|nyc|new york|workers?|injury|accident|compensation|free|24|cheap|affordable)\b",
    re.I)


def api_key():
    env = ROOT / ".env"
    if env.exists():
        for line in io.open(env, encoding="utf-8-sig"):
            m = re.match(r"^GOOGLE_API_KEY=(\S+)", line.strip())
            if m:
                return m.group(1)
    # The environment is the fallback, so a CI run passes the key as a secret rather than
    # writing .env to the runner's disk.
    return os.environ.get("GOOGLE_API_KEY")


def registrable(url: str) -> str | None:
    """The domain a firm is known by, with www and any path dropped."""
    try:
        host = urllib.parse.urlparse(url).netloc.lower()
    except ValueError:
        return None
    host = host.split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    return host or None


def search(query: str, key: str, token: str | None = None):
    body = {"textQuery": query, "languageCode": "en", "pageSize": 20}
    if token:
        body["pageToken"] = token
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-Goog-Api-Key": key,
                 "X-Goog-FieldMask": FIELDS})
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.load(response)


def pages(query: str, key: str, limit: int):
    """Every page the API will give for one query, up to `limit` results."""
    token, seen = None, 0
    while seen < limit:
        try:
            data = search(query, key, token)
        except urllib.error.HTTPError as err:
            print("   query failed (%s): %s" % (err.code, query), file=sys.stderr)
            return
        for place in (data.get("places") or []):
            yield place
            seen += 1
        token = data.get("nextPageToken")
        if not token:
            return
        # The API needs a moment before a page token is valid.
        time.sleep(2.0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, help="cohort id the candidates are for")
    ap.add_argument("--query", required=True, help="the search somebody would actually type")
    ap.add_argument("--area", action="append", default=[],
                    help="a borough or neighbourhood; the query is repeated for each")
    ap.add_argument("--state", default="NY", help="two-letter code the address must contain")
    ap.add_argument("--limit", type=int, default=60, help="results per query")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    key = api_key()
    if not key:
        print("no GOOGLE_API_KEY in .env", file=sys.stderr)
        return 2

    queries = [args.query] + ["%s %s" % (args.query, area) for area in args.area]
    firms: dict[str, dict] = {}
    rejected: list[dict] = []
    state_token = re.compile(r",\s*%s\s+\d" % re.escape(args.state), re.I)

    for query in queries:
        found = 0
        for place in pages(query, key, args.limit):
            name = ((place.get("displayName") or {}).get("text") or "").strip()
            website = place.get("websiteUri") or ""
            address = place.get("formattedAddress") or ""
            domain = registrable(website)

            def drop(why):
                rejected.append({"name": name, "why": why, "address": address,
                                 "website": website or None})

            if (place.get("businessStatus") or "OPERATIONAL") != "OPERATIONAL":
                drop("not operational"); continue
            if not domain:
                drop("no website"); continue
            if DIRECTORIES.search(domain):
                drop("directory, not a firm"); continue
            if NOT_A_NAME.match(name):
                drop("display name is a search phrase"); continue
            if not state_token.search(address):
                drop("office outside %s" % args.state); continue

            found += 1
            row = firms.setdefault(domain, {
                "domain": domain, "name": name, "offices": [], "review_count_total": 0,
                "queries": [],
            })
            if not any(o["address"] == address for o in row["offices"]):
                row["offices"].append({
                    "address": address, "rating": place.get("rating"),
                    "review_count": place.get("userRatingCount") or 0,
                    "place_id": place.get("id"),
                })
                row["review_count_total"] += place.get("userRatingCount") or 0
            if query not in row["queries"]:
                row["queries"].append(query)
        print("%-62s %3d kept" % (query[:62], found))

    ranked = sorted(firms.values(),
                    key=lambda f: (-len(f["queries"]), -f["review_count_total"]))
    out = {
        "cohort_id": args.id,
        "discovered_at": TODAY,
        "source": "Google Places API (New), searchText, %d queries" % len(queries),
        "queries": queries,
        "candidates": ranked,
        "rejected": rejected,
    }
    path = ROOT / ".crawl" / ("candidates-%s.json" % args.id)
    path.parent.mkdir(parents=True, exist_ok=True)
    io.open(path, "w", encoding="utf-8", newline="\n").write(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n")

    print()
    print("%d candidate domains, %d rejected → %s"
          % (len(ranked), len(rejected), path.relative_to(ROOT)))
    print()
    for f in ranked[:40]:
        print("   %-34s %-40s %2d office(s) %6d reviews  %d/%d queries"
              % (f["domain"][:34], f["name"][:40], len(f["offices"]),
                 f["review_count_total"], len(f["queries"]), len(queries)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
