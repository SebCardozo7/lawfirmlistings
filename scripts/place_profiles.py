#!/usr/bin/env python3
"""
Move a cohort's drafts out of .crawl/profiles and into src/data/firms, with their rosters filled.

build_profiles writes drafts and stops, for two reasons it records in each draft's `_review`:
the About block was assembled rather than written, and `attorneys` is empty because a mis-parsed
name drives G1 and G2 against a state register and is worse than a missing one. Both were right
when nothing downstream could be trusted to tell a lawyer from a page title.

The second one is answerable now. crawl_attorneys rejects places, institutions, section headings,
slogans and location pages, and on the first market crawled after that change it read 1,052 names
across 100 Los Angeles firms with none of them a thing rather than a person. So this fills the
roster from the staging record and runs the same screen again on the way past: a name has to pass
it twice, once where it is read and once where it is published.

The About block stays a person's job. This refuses to place a draft whose About is still the
assembled one unless --about-reviewed says somebody read it, because "it should say nothing the
record does not carry" is a judgement and not a check.

What this does not do is touch a profile that already exists. A published firm has editorial
prose, a FAQ and a pull quote that a draft would overwrite; promote_measurements.py is the script
that refreshes one of those, and it is the one to use.

    python scripts/place_profiles.py --cohort ca-losangeles-personal-injury --dry-run
    python scripts/place_profiles.py --cohort ca-losangeles-personal-injury --about-reviewed
"""
from __future__ import annotations

import argparse
import collections
import io
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from crawl_attorneys import is_a_thing_not_a_person  # noqa: E402


def roster_for(domain: str, staging: pathlib.Path) -> tuple[list, list]:
    """The named attorneys from a staging record, and the ones the screen turned away."""
    path = staging / (domain + ".json")
    if not path.exists():
        return [], []
    try:
        rec = json.load(io.open(path, encoding="utf-8"))
    except (ValueError, OSError):
        return [], []
    if not isinstance(rec, dict):
        return [], []
    found = ((rec.get("attorneys_found") or {}).get("attorneys")) or []
    keep, turned_away = [], []
    for a in found:
        why = is_a_thing_not_a_person(a.get("name") or "")
        (turned_away if why else keep).append((a.get("name"), why))
    # Drop the keys the staging record carries as null. The profile schema makes role and
    # bar_number optional, and optional in zod means the key may be absent, not that it may be
    # null: a null arrives as "expected string, received object" and fails the whole build.
    clean = [{k: v for k, v in a.items() if v is not None}
             for a in found if not is_a_thing_not_a_person(a.get("name") or "")]
    return clean, turned_away


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", required=True, help="cohort id under src/data/cohorts")
    ap.add_argument("--staging", default=".crawl")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--about-reviewed", action="store_true",
                    help="somebody has read the assembled About blocks")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    staging = ROOT / args.staging
    drafts = sorted((staging / "profiles").glob("*.json"))
    placed = skipped = existing = 0
    screened = collections.Counter()
    no_roster = []

    for path in drafts:
        try:
            d = json.load(io.open(path, encoding="utf-8"))
        except (ValueError, OSError):
            continue
        if d.get("cohort_id") != args.cohort:
            continue

        state = ((d.get("market") or {}).get("state") or "").lower()
        slug = d.get("slug") or path.stem
        out = ROOT / "src/data/firms" / state / (slug + ".json")
        if out.exists():
            existing += 1
            continue

        roster, turned_away = roster_for(d.get("domain") or "", staging)
        for _, why in turned_away:
            screened[why] += 1
        d["attorneys"] = roster
        if not roster:
            no_roster.append(slug)

        # The About block is the half a person owns. Without --about-reviewed this stops here
        # rather than publishing an assembled paragraph as editorial prose.
        review = d.get("_review") or {}
        blocking = [b for b in (review.get("blocking") or []) if "about[]" in b]
        if blocking and not args.about_reviewed:
            skipped += 1
            continue

        # The review block is scaffolding for the person doing the placing, not profile data.
        d.pop("_review", None)
        placed += 1
        if not args.dry_run:
            out.parent.mkdir(parents=True, exist_ok=True)
            io.open(out, "w", encoding="utf-8", newline="\n").write(
                json.dumps(d, ensure_ascii=False, indent=2) + "\n")

    print("%d placed, %d already published, %d held for an About review"
          % (placed, existing, skipped))
    if screened:
        print("names the screen turned away on the way past: %s" % dict(screened))
    if no_roster:
        print("%d firm(s) name no attorney, which is what G5 measures: %s"
              % (len(no_roster), ", ".join(no_roster[:5])))
    if args.dry_run:
        print("\nNothing was written.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
