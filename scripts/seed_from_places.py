#!/usr/bin/env python3
"""
A staging record for a firm whose own site will not let us read it.

Three firms in this directory sit unpublished because their sites answer our crawler with a 403.
That is bot protection, we do not evade it, and until now the consequence was simply no profile.
For most firms that is the right answer. For a firm a reader is actually looking for, publishing
nothing is its own kind of wrong: the firm exists, its offices exist, and hundreds of its clients
have reviewed it in public.

So this builds a record from the sources that never touch the firm's site:

    Google Places      the offices, the phone, the ratings and the review counts, all from
                       listings the firm verified itself
    RDAP               how long the domain has been registered, via scripts/check_operating.py
    CourtListener      discipline, via scripts/check_discipline.py

What it cannot produce is anything that lives on the site: the attorneys, the fee terms, the
languages, the results page, the trust pages. Those stay unmeasured rather than guessed, `site_
blocked` is recorded on the record so every downstream script can see why, and the profile says
plainly that the firm's site declines automated readers.

The honest consequence is a low score, and the reason for it is the firm's own configuration
rather than anything about its practice. The profile says that too, because a reader comparing
seven firms deserves to know which number is about the lawyers and which is about a web server.

Usage:
    python scripts/seed_from_places.py --domain lopezandhumphries.com \\
        --query "Lopez & Humphries P.A. Lakeland FL" --name "Lopez & Humphries, P.A."
"""
from __future__ import annotations

import argparse
import datetime
import io
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
TODAY = datetime.date.today().isoformat()
ENDPOINT = "https://places.googleapis.com/v1/places:searchText"
FIELDS = ("places.displayName,places.formattedAddress,places.rating,places.userRatingCount,"
          "places.websiteUri,places.id,places.nationalPhoneNumber,places.businessStatus,"
          "places.googleMapsUri")


def api_key():
    env = ROOT / ".env"
    if env.exists():
        for line in io.open(env, encoding="utf-8-sig"):
            m = re.match(r"^GOOGLE_API_KEY=(\S+)", line.strip())
            if m:
                return m.group(1)
    return None


def search(query: str, key: str):
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps({"textQuery": query, "languageCode": "en"}).encode(),
        headers={"Content-Type": "application/json", "X-Goog-Api-Key": key,
                 "X-Goog-FieldMask": FIELDS})
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.load(response)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domain", required=True)
    ap.add_argument("--name", required=True, help="the firm's name, as it should be published")
    ap.add_argument("--query", action="append", required=True,
                    help="a Places text query; repeat it to reach offices one query misses")
    ap.add_argument("--staging", default=".crawl")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    key = api_key()
    if not key:
        print("no GOOGLE_API_KEY in .env", file=sys.stderr)
        return 2

    # Only listings whose own name contains the firm's distinctive word. A text query for a firm
    # in a small market returns its competitors too, and a competitor's reviews on this firm's
    # profile would be worse than no profile at all.
    stem = max(re.findall(r"[A-Za-z]{4,}", args.name), key=len).casefold()
    found = {}
    for query in args.query:
        for place in (search(query, key).get("places") or []):
            name = ((place.get("displayName") or {}).get("text") or "")
            if stem not in name.casefold():
                continue
            if (place.get("businessStatus") or "OPERATIONAL") != "OPERATIONAL":
                continue
            found[place["id"]] = place

    if not found:
        print("no listing matched %r" % stem)
        return 1

    listings = [{
        "name": (p.get("displayName") or {}).get("text"),
        "address": p.get("formattedAddress"),
        "website": p.get("websiteUri"),
        "rating": p.get("rating"),
        "review_count": p.get("userRatingCount") or 0,
        "phone": p.get("nationalPhoneNumber"),
        "status": p.get("businessStatus"),
        "maps_uri": p.get("googleMapsUri"),
    } for p in found.values()]
    listings.sort(key=lambda l: -(l["review_count"] or 0))

    total = sum(l["review_count"] or 0 for l in listings)
    weighted = (round(sum((l["rating"] or 0) * (l["review_count"] or 0) for l in listings) / total, 2)
                if total else None)

    record = {
        "domain": args.domain,
        "fetched_at": TODAY,
        # False, and deliberately so: nothing here was read from the firm's site, and every
        # downstream script decides what it can measure from exactly that fact.
        "https_ok": False,
        "site_blocked": {
            "reason": "The firm's site answers our crawler with HTTP 403, which is bot "
                      "protection. We do not work around it.",
            "seen_at": TODAY,
        },
        "name_candidates": [{"value": args.name, "source": "Google Business Profile listing"}],
        "phones": [l["phone"] for l in listings if l.get("phone")],
        "pages_found": {},
        "notes": ["Built from Google Business Profile listings alone. The firm's own site refused "
                  "our crawler, so nothing on this record was read from it."],
        "places": {
            "listings": listings,
            "aggregate": {
                "listing_count": len(listings),
                "review_count_total": total,
                "rating_weighted": weighted,
                "sampled_reviews": 0,
                "method": "counts summed across the firm's verified listings; rating averaged "
                          "weighted by review count",
            },
            "review_sample": [],
            "rejected": [],
            "d3_gbp_present": True,
            "g6_reviews_ok": total >= 10,
            "source": "Google Places API (New), searchText",
            "measured_at": TODAY,
        },
    }

    path = pathlib.Path(args.staging) / (args.domain + ".json")
    if path.exists():
        existing = json.loads(path.read_text(encoding="utf-8"))
        record = {**existing, **record}      # never drop what another script collected
    io.open(path, "w", encoding="utf-8", newline="\n").write(
        json.dumps(record, ensure_ascii=False, indent=2) + "\n")

    print("%s: %d listing(s), %d reviews, weighted %s"
          % (args.domain, len(listings), total, weighted))
    for l in listings:
        print("   %-46s %s (%s)" % ((l["address"] or "")[:46], l["rating"], l["review_count"]))
    print()
    print("Site-derived measurements stay unmeasured: attorneys, fee terms, languages, results.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
