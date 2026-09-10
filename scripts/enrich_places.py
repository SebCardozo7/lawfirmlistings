#!/usr/bin/env python3
"""
Google Places enrichment — pillar C (client experience), gate G6, and pillar D3 (local presence).

For each domain in .crawl/, finds the firm's Google Business Profile listings and writes an
aggregated `places` block into the staging record.

How a listing is accepted
    Only listings whose websiteUri resolves to the firm's own domain are counted. Searching a
    firm name in a big city returns competitors, directories and unrelated businesses; matching
    on the domain is what stops another firm's reviews being attributed to this one. Rejected
    candidates are kept under `places.rejected` so the filter itself can be reviewed.

How reviews are aggregated (Sebastián's call, 2026-09-08)
    A multi-office firm has one listing per office, each with its own review count. Counts are
    summed across the firm's verified listings and the rating is averaged weighted by count.
    That reflects what the firm's clients actually reported and neither rewards nor penalises a
    firm for how it splits its profiles. Every listing is stored individually so the aggregate
    can be recomputed or audited.

    Totals are national, not restricted to the cohort's state — also Sebastián's call, chosen
    for simplicity over a second rule to maintain and explain on every profile. The trade-off,
    recorded here so it is not rediscovered later: pillar C is scored as a percentile inside a
    state x practice cohort, so a firm with out-of-state offices carries review volume from
    markets its cohort peers do not compete in. Measured effect on this batch is small (Parker
    Waichman 1,870 vs 1,758 New York only; Cellino 1,740 vs 1,689) except for the Rothenberg
    Law Firm, whose New York share is 276 of 577. If C1 percentiles ever look inflated for
    multi-state firms, this is the reason and `listings[].address` is where to filter.

Gate G6 needs >= 10 public reviews and >= 1 year in operation. Only the review half is decidable
here, so G6 is reported as `reviews_ok` rather than a pass: the operating-age half needs a
Secretary of State filing date, which is gate G3's source.

Needs GOOGLE_API_KEY in .env, Places API (New) enabled, and an open billing account.

Usage:
    python scripts/enrich_places.py
    python scripts/enrich_places.py --domains perecman.com --verbose
"""
import argparse
import datetime
import glob
import html as html_entities
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
SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
FIELDS = ",".join("places." + f for f in [
    "displayName", "websiteUri", "rating", "userRatingCount", "formattedAddress",
    "nationalPhoneNumber", "businessStatus", "googleMapsUri", "primaryTypeDisplayName",
    # Five reviews per listing, with dates and ratings. A sample, not a census, which is
    # what the evidence on the profile says: eleven listings give fifty-five dated reviews,
    # one listing gives five.
    "reviews",
])
G6_MIN_REVIEWS = 10
DELAY = 0.6


def api_key():
    env = ROOT / ".env"
    if env.exists():
        with io.open(env, encoding="utf-8-sig") as fh:
            for line in fh:
                m = re.match(r"^GOOGLE_API_KEY=(\S+)", line.strip())
                if m:
                    return m.group(1)
    return os.environ.get("GOOGLE_API_KEY")


def registrable(host):
    """www.foo.co.uk -> foo.co.uk. Good enough to tell one firm's site from another's."""
    host = (host or "").lower().split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    return host


def same_site(website_uri, domain):
    if not website_uri:
        return False
    host = registrable(urllib.parse.urlparse(website_uri).netloc)
    target = registrable(domain)
    return host == target or host.endswith("." + target) or target.endswith("." + host)


def search(query, key):
    req = urllib.request.Request(
        SEARCH_URL,
        data=json.dumps({"textQuery": query, "languageCode": "en"}).encode(),
        headers={"Content-Type": "application/json", "X-Goog-Api-Key": key,
                 "X-Goog-FieldMask": FIELDS},
    )
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r).get("places", [])


def firm_name_from(rec):
    """Prefer the name the firm publishes in its own JSON-LD over a page title."""
    def walk(n):
        if isinstance(n, dict):
            yield n
            for g in (n.get("@graph") or []):
                yield from walk(g)
    for blk in rec.get("json_ld", []):
        for n in walk(blk):
            t = n.get("@type")
            t = t if isinstance(t, str) else "+".join(t) if isinstance(t, list) else ""
            if any(k in t for k in ("LegalService", "Attorney", "LocalBusiness", "Organization", "LawFirm")):
                if n.get("name"):
                    return html_entities.unescape(n["name"])
    for c in rec.get("name_candidates", []):
        if c["from"] == "og:site_name":
            return html_entities.unescape(c["value"])
    return rec.get("name_candidates", [{}])[0].get("value", rec["domain"])


def collect(rec, key, verbose=False):
    domain = rec["domain"]
    name = firm_name_from(rec)
    # Two queries: the firm's name, and the name with its market. Between them the office
    # listings of a multi-location firm show up without paging through unrelated results.
    queries = [name, "%s personal injury %s" % (name, "New York")]

    accepted, rejected, seen = [], [], set()
    for q in queries:
        try:
            results = search(q, key)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            raise RuntimeError("HTTP %s %s" % (e.code, body[:160]))
        time.sleep(DELAY)
        for p in results:
            uri = p.get("googleMapsUri") or json.dumps(p, sort_keys=True)
            if uri in seen:
                continue
            seen.add(uri)
            row = {
                "name": p.get("displayName", {}).get("text"),
                "address": p.get("formattedAddress"),
                "website": p.get("websiteUri"),
                "rating": p.get("rating"),
                "review_count": p.get("userRatingCount"),
                "phone": p.get("nationalPhoneNumber"),
                "status": p.get("businessStatus"),
                "maps_uri": p.get("googleMapsUri"),
                "type": p.get("primaryTypeDisplayName", {}).get("text"),
                # Only what the two sub-factors read: when it was left and how it rated. The
                # text is not kept, because nothing on the site quotes it and holding
                # strangers' words about a named business with no use for them is not worth
                # doing.
                "reviews": [
                    {"published_at": rv.get("publishTime"), "rating": rv.get("rating")}
                    for rv in (p.get("reviews") or [])
                    if rv.get("publishTime") or rv.get("rating")
                ],
            }
            if same_site(row["website"], domain):
                accepted.append(row)
            else:
                rejected.append({k: row[k] for k in ("name", "website", "review_count")})

    rated = [a for a in accepted if a["rating"] and a["review_count"]]
    # One flat sample across the firm's listings. A firm with eleven offices contributes
    # eleven times as many sampled reviews, which is right: it has eleven times the surface.
    sample = [rv for a in accepted for rv in (a.get("reviews") or [])]
    total = sum(a["review_count"] for a in rated)
    weighted = (round(sum(a["rating"] * a["review_count"] for a in rated) / total, 2)
                if total else None)

    block = {
        "listings": accepted,
        "rejected": rejected[:12],
        "review_sample": sample,
        "aggregate": {
            "listing_count": len(accepted),
            "review_count_total": total,
            "rating_weighted": weighted,
            "sampled_reviews": len(sample),
            "method": "counts summed across the firm's verified listings; rating averaged "
                      "weighted by review count",
        },
        "g6_reviews_ok": total >= G6_MIN_REVIEWS,
        "d3_gbp_present": len(accepted) > 0,
        "source": "Google Places API (New) places:searchText",
        "measured_at": datetime.date.today().isoformat(),
    }
    if not accepted:
        block["note"] = ("No listing matched this domain. Either the firm has no Google Business "
                         "Profile, or its profile points at a different website; needs a manual "
                         "check before G6 or D3 are decided.")
    if verbose:
        for r in rejected[:6]:
            print("      rejected: %-38s %s" % ((r["name"] or "")[:38], r["website"]))
    return name, block


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains", help="comma-separated; default is every file in .crawl/")
    ap.add_argument("--staging", default=".crawl")
    ap.add_argument("--verbose", action="store_true", help="also show rejected candidates")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            # See enrich_psi.py: without line buffering a multi-minute run looks like a hang.
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    key = api_key()
    if not key:
        print("GOOGLE_API_KEY not found in .env or the environment.", file=sys.stderr)
        return 1

    staging = ROOT / args.staging
    if args.domains:
        files = [staging / (d.strip() + ".json") for d in args.domains.split(",") if d.strip()]
    else:
        files = sorted(pathlib.Path(p) for p in glob.glob(str(staging / "*.json")))

    done = matched = 0
    for path in files:
        if not path.exists():
            continue
        with io.open(path, encoding="utf-8") as fh:
            rec = json.load(fh)
        if not rec.get("https_ok"):
            print("%-24s skipped — site was never reachable" % rec["domain"])
            continue

        try:
            name, block = collect(rec, key, args.verbose)
        except Exception as e:
            print("%-24s FAILED  %s" % (rec["domain"], str(e)[:150]))
            continue

        # Re-read before writing: see write_key in enrich_psi.py. Holding a copy across a long
        # run and writing it back discards whatever another enricher wrote in the meantime.
        with io.open(path, encoding="utf-8") as fh:
            fresh = json.load(fh)
        fresh["places"] = block
        with io.open(path, "w", encoding="utf-8") as fh:
            json.dump(fresh, fh, indent=2, ensure_ascii=False)
            fh.write("\n")

        agg = block["aggregate"]
        print("%-24s %-34s %d listing(s)  %s reviews  rating %s  G6 %s"
              % (rec["domain"], name[:34], agg["listing_count"],
                 agg["review_count_total"], agg["rating_weighted"] or "-",
                 "ok" if block["g6_reviews_ok"] else "NO"))
        done += 1
        matched += 1 if agg["listing_count"] else 0

    print("\n%d enriched · %d with at least one matching listing" % (done, matched))
    print("G6 also needs >= 1 year in operation, which comes from the G3 Secretary of State\n"
          "filing date, so g6_reviews_ok is only the review half of that gate.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
