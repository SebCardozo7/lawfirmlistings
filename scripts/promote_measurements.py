#!/usr/bin/env python3
"""
Copy the measured blocks from a staging record into a firm profile that already exists.

build_profiles.py turns a staging record into a whole new draft profile, which is right for a
firm we are seeing for the first time and wrong for one already published: it would overwrite the
editorial prose, the FAQ and the pull quote with generated text. But a published profile still
needs its measurements refreshed when we re-crawl, and one of them had never had any at all - the
seed profile carried a self-reported review count and a hand-written "CWV pass", while the Places
API and PageSpeed had never been pointed at the domain.

So this promotes only what a machine measured, and only the fields build_profiles.py derives, in
the same shape, so there is one convention and not two:

    reviews.google           from the Places aggregate, replacing a firm-reported figure
    digital.places           listing count, summed reviews, count-weighted rating
    digital.psi              Core Web Vitals, when PageSpeed could complete
    digital.trust_pages      which trust pages the crawl actually found
    digital.schema_detected  whether any JSON-LD is present

Everything else in the profile is left exactly as it is. Attorney rosters, gates, scores and all
prose are the business of other scripts or of a person.

Usage:
    python scripts/promote_measurements.py --domains nyclawfirm.com
    python scripts/promote_measurements.py --domains nyclawfirm.com --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
FIRMS = ROOT / "src" / "data" / "firms"


def by_domain(domain: str) -> Path | None:
    want = domain.lower().removeprefix("www.")
    for path in FIRMS.rglob("*.json"):
        firm = json.loads(path.read_text(encoding="utf-8"))
        if (firm.get("domain", "").lower().removeprefix("www.")) == want:
            return path
    return None


def promote(rec: dict, firm: dict) -> list[str]:
    """Mutate `firm` in place; return a line per field changed."""
    changed: list[str] = []
    places = rec.get("places") or {}
    agg = places.get("aggregate") or {}
    digital = firm.setdefault("digital", {})

    if agg.get("rating_weighted") and agg.get("review_count_total"):
        n, listings = agg["review_count_total"], agg["listing_count"]
        before = (firm.get("reviews") or {}).get("google") or {}
        firm.setdefault("reviews", {"quotes": []})["google"] = {
            "rating": agg["rating_weighted"],
            "count_label": f"{n:,}",
            "source": ("Google Business Profile via Places API. %d listing%s, counts summed and "
                       "rating weighted by count" % (listings, "" if listings == 1 else "s")),
            "fetched_at": places.get("measured_at"),
        }
        digital["places"] = {
            "listing_count": listings,
            "review_count_total": n,
            "rating_weighted": agg["rating_weighted"],
            "source": "Google Places API (New) places:searchText",
            "measured_at": places.get("measured_at"),
        }
        was = f"{before.get('rating')} over {before.get('count_label')} ({before.get('source', '?')[:34]})"
        changed.append(f"reviews.google  {was}  ->  {agg['rating_weighted']} over {n:,} across {listings} listings")

    if rec.get("psi"):
        digital["psi"] = rec["psi"]
        changed.append(f"digital.psi     measured: {json.dumps(rec['psi'])[:80]}")

    if rec.get("trust_pages"):
        if digital.get("trust_pages") != rec["trust_pages"]:
            changed.append(f"trust_pages     {digital.get('trust_pages')} -> {rec['trust_pages']}")
        digital["trust_pages"] = rec["trust_pages"]

    detected = bool(rec.get("schema_detected"))
    if digital.get("schema_detected") != detected:
        changed.append(f"schema_detected {digital.get('schema_detected')} -> {detected}")
    digital["schema_detected"] = detected

    return changed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains", required=True, help="comma-separated staging domains")
    ap.add_argument("--staging", default=".crawl")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--attorneys", action="store_true",
                    help="also merge the crawled roster into the profile")
    args = ap.parse_args()

    rc = 0
    for domain in [d.strip() for d in args.domains.split(",") if d.strip()]:
        staging = ROOT / args.staging / f"{domain}.json"
        if not staging.exists():
            print(f"{domain}: no staging record at {staging}", file=sys.stderr)
            rc = 1
            continue
        path = by_domain(domain)
        if not path:
            print(f"{domain}: no published profile — use build_profiles.py for a new firm",
                  file=sys.stderr)
            rc = 1
            continue

        firm = json.loads(path.read_text(encoding="utf-8"))
        rec = json.loads(staging.read_text(encoding="utf-8"))
        changed = promote(rec, firm)
        if args.attorneys:
            changed += promote_attorneys(rec, firm)
        print(f"\n{firm['name']}  ({path.name})")
        if not changed:
            print("  nothing measured to promote")
            continue
        for line in changed:
            print(f"  {line}")
        if args.dry_run:
            print("  (dry run, not written)")
        else:
            path.write_text(json.dumps(firm, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if not args.dry_run:
        print("\nRun scripts/score.py to recompute.")
    return rc


if __name__ == "__main__":
    sys.exit(main())
