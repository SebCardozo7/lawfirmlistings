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
# Only used by resolves_to, which asks a firm's old domain where it lands. Named the same way the
# crawlers name themselves, because a HEAD request from this repository should be as identifiable
# as a GET from it.
UA = "LawFirmListingsBot/1.0 (+https://lawfirmlistings.com/methodology/)"
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


def resolves_to(host, target):
    """Whether `host` is the same site as `target` after following its redirects.

    A firm that changes domain does not get to update Google's copy of its own listing the same
    afternoon, and often never bothers. Ofshtein Law Firm moved to olf.law and its Business
    Profile still published olf.nyc, which redirects there; comparing the two strings rejected a
    listing carrying 2,659 reviews as belonging to a different firm. That is the largest review
    count in the New York injury market, kept out of the directory by a redirect nobody followed.

    Only ever asked after the plain comparison fails, and only about a host Google already
    published on the listing, so this costs one request per near miss rather than per firm.
    A redirect that leaves the target is not a match, which is the case that matters: a parked
    domain pointing at somebody else must not pull their listing in.

    HEAD first and GET if that is refused. olf.nyc answers HEAD with 405 Method Not Allowed and
    answers GET with a redirect to olf.law, which is the exact firm this exists for, so treating
    a 405 as "does not resolve" would have left the feature not working on its own test case.
    """
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request("https://" + host + "/", method=method,
                                         headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                landed = registrable(urllib.parse.urlparse(r.url).netloc)
            return landed == target or landed.endswith("." + target)
        except urllib.error.HTTPError as e:
            if e.code != 405:
                return False
        except Exception:
            return False
    return False


def same_site(website_uri, domain):
    if not website_uri:
        return False
    host = registrable(urllib.parse.urlparse(website_uri).netloc)
    target = registrable(domain)
    if host == target or host.endswith("." + target) or target.endswith("." + host):
        return True
    return resolves_to(host, target)


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


def market_for(domain):
    """The city this firm belongs to, from the cohort or the profile that carries it.

    This used to be the string "New York", written when New York was the only market, and it
    stayed wrong quietly: a firm's own name usually finds its listing on the first query, so the
    second one rarely mattered. It mattered for Calderaro & Kazmierczak in Merrillville, whose
    site titles itself "Calderaro". A one-word query found nothing, and "Calderaro personal
    injury New York" returned a Manhattan brain-injury firm and an Italian practice, so a
    Merrillville firm with fifty-one reviews came back with none and lost G6.
    """
    for path in sorted((ROOT / "src" / "data" / "cohorts").glob("*.json")):
        try:
            data = json.load(io.open(path, encoding="utf-8"))
        except (ValueError, OSError):
            continue
        if any((f or {}).get("domain") == domain for f in data.get("firms") or []):
            m = data.get("market") or {}
            if m.get("city"):
                return "%s %s" % (m["city"], m.get("state") or "")
    for path in (ROOT / "src" / "data" / "firms").rglob("*.json"):
        try:
            firm = json.load(io.open(path, encoding="utf-8"))
        except (ValueError, OSError):
            continue
        if firm.get("domain") == domain:
            m = firm.get("market") or {}
            if m.get("city"):
                return "%s %s" % (m["city"], m.get("state") or "")
    return None


def practice_for(domain):
    """The practice the cohort puts this firm in, as words a search can use.

    This query used to say "personal injury" for every firm in the directory, written when that
    was the only practice. It is the firm's own name that finds its listing, so the wrong words
    here mostly wasted a query; they stop being harmless once a market's firms are matrimonial
    practices and the second query goes looking for injury lawyers by their names.
    """
    for path in sorted((ROOT / "src" / "data" / "cohorts").glob("*.json")):
        try:
            data = json.load(io.open(path, encoding="utf-8"))
        except (ValueError, OSError):
            continue
        if any((f or {}).get("domain") == domain for f in data.get("firms") or []):
            if data.get("practice"):
                return data["practice"].replace("-", " ")
    return None


def discovered_names(domain):
    """The names Google's own listings carry for this domain, from the discovery run.

    Discovery finds a listing and reads its website, so a candidates file is a record of listings
    that already matched this domain, which is stronger evidence than a name search. This script
    was ignoring it and asking Google for the name the firm's website publishes, and the two are
    often not the same business name.

    Two firms in Buffalo showed what that costs. Frank S. Ieraci's site calls itself "FSI
    Lawyer", his listing is "Frank S Ieraci, Attorney at Law" with fourteen reviews, and the
    search for FSI Lawyer returned a criminal defence firm in another state, so the profile came
    back with no Google presence at all. Bakshi & Leta's search matched a listing Google built
    out of a page title, "About Us | Bakshi & Leta DWI Attorneys", carrying no reviews, while the
    firm's real listing, "Sunil Bakshi Attorney At Law", holds fifty-one. Both would have
    published a review count of zero and failed G6 on it.
    """
    out = []
    for path in sorted((ROOT / ".crawl").glob("candidates-*.json")):
        try:
            data = json.load(io.open(path, encoding="utf-8"))
        except (ValueError, OSError):
            continue
        for cand in data.get("candidates") or []:
            if (cand or {}).get("domain") != domain or not cand.get("name"):
                continue
            if cand["name"] not in out:
                out.append(cand["name"])
    return out


def cohort_name(domain):
    """The name a person wrote in the cohort file, which is checked and sometimes the only one.

    radlawfirm.com publishes "nabasheikh" as its JSON-LD name, which is somebody's login, so the
    search went looking for a firm by that name and came back with four other Dallas practices.
    The cohort file says Rad Law Firm, because a person read the listing before deciding the firm
    belonged in the market. Preferred over the site's own name for that reason: it is the name
    this search is trying to match against.
    """
    for path in sorted((ROOT / "src" / "data" / "cohorts").glob("*.json")):
        try:
            data = json.load(io.open(path, encoding="utf-8"))
        except (ValueError, OSError):
            continue
        for firm in data.get("firms") or []:
            if (firm or {}).get("domain") == domain and firm.get("name"):
                return firm["name"]
    return None


def collect(rec, key, verbose=False):
    domain = rec["domain"]
    name = cohort_name(domain) or firm_name_from(rec)
    # Two queries: the firm's name, and the name with its market. Between them the office
    # listings of a multi-location firm show up without paging through unrelated results. A firm
    # whose market we do not know yet gets the first query only, because a guessed city is worse
    # than no city.
    market = market_for(domain)
    practice = practice_for(domain) or "personal injury"
    queries = [name] + (["%s %s %s" % (name, practice, market)] if market else [])
    # And the name Google's own listing carries, where a discovery run has already matched a
    # listing to this domain. Added last so a firm's own name stays the first question asked.
    for found in discovered_names(domain):
        if found not in queries:
            queries.append(found)

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
