#!/usr/bin/env python3
"""
Put an Ahrefs measurement onto the profiles and the cohorts that score it.

D2 is eight points of search authority and it is a percentile, so it needs the firm measured and
its cohort measured with it. Before this run one cohort of eleven had Ahrefs figures, from a
by-hand run in an earlier phase, and twenty-five of its own firms could not be scored anyway:
the percentile reads `dr` from the cohort file and the firm's own numbers from its profile, and
those two had drifted apart. Every other market had nothing, so D2 read "not yet collected" for
179 firms and eight points sat outside the denominator for most of the directory.

Where the numbers come from. The Ahrefs batch endpoint takes up to a hundred targets and returns
all of these in one request, at twenty-six units a row, which is the whole directory for about
five thousand units. It is run through the Ahrefs connector rather than from a key in this
repository, and its rows are pasted into a CSV that this script reads, because the measurement is
a one-line-per-firm fact and a CSV is reviewable in a diff in a way a JSON blob is not.

    domain,dr,ahrefs_rank,refdomains,refdomains_dofollow,backlinks,org_keywords,org_traffic,paid_keywords

Every row is written with the same `measured_at`, because a percentile across a cohort measured
on two different days is a comparison of two different weeks. The organic figures are United
States only, and the file says so, so nobody later compares them against a global run.

AI citations are not in this endpoint and are not written here. The thirteen profiles that
already carry them keep them: this script touches the fields it measured and leaves the rest,
which is why the ai_citations block is optional in the schema.

Usage:
    python scripts/apply_ahrefs.py --csv .crawl/ahrefs-1.csv,.crawl/ahrefs-2.csv --dry-run
    python scripts/apply_ahrefs.py --csv .crawl/ahrefs-1.csv --measured-at 2026-09-16
"""
from __future__ import annotations

import argparse
import csv
import datetime
import io
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"
COHORTS = ROOT / "src" / "data" / "cohorts"
LF = chr(10)

SOURCE = ("Ahrefs Site Explorer, batch endpoint, subdomains mode, organic figures for the "
          "United States")

FIELDS = ["dr", "ahrefs_rank", "refdomains", "refdomains_dofollow", "backlinks",
          "org_keywords", "org_traffic", "paid_keywords"]
# What the cohort file needs for the percentile, which is a subset: score.py reads these four
# off the peers and everything else off the firm's own profile.
COHORT_FIELDS = ["dr", "refdomains", "org_keywords", "org_traffic"]


def read_rows(paths):
    rows = {}
    for path in paths:
        with io.open(path, encoding="utf-8") as fh:
            for row in csv.reader(fh):
                row = [c.strip() for c in row if c.strip() != ""]
                # The field order is documented at the top of this file, so a file that repeats
                # it as a header row is doing the readable thing and was crashing on int("dr").
                if row and row[0].lower() == "domain":
                    continue
                if len(row) != 9:
                    print("skipped a row with %d fields in %s: %s"
                          % (len(row), pathlib.Path(path).name, row[:2]), file=sys.stderr)
                    continue
                domain = row[0].lower()
                # The domain rating is a float on a small site and an integer on a large one;
                # everything else is a count. Kept as a number either way so the JSON does not
                # carry "43" as a string and sort oddly in a percentile.
                rows[domain] = {
                    "dr": float(row[1]) if "." in row[1] else int(row[1]),
                    "ahrefs_rank": int(row[2]),
                    "refdomains": int(row[3]),
                    "refdomains_dofollow": int(row[4]),
                    "backlinks": int(row[5]),
                    "org_keywords": int(row[6]),
                    "org_traffic": int(row[7]),
                    "paid_keywords": int(row[8]),
                }
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True, help="comma-separated CSV paths")
    ap.add_argument("--measured-at", default=datetime.date.today().isoformat())
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    rows = read_rows([p.strip() for p in args.csv.split(",") if p.strip()])
    print("%d measurement(s) read" % len(rows))

    wrote = missing = 0
    for path in sorted(FIRMS.rglob("*.json")):
        firm = json.load(io.open(path, encoding="utf-8"))
        row = rows.get((firm.get("domain") or "").lower())
        if not row:
            missing += 1
            continue
        digital = firm.setdefault("digital", {})
        before = digital.get("ahrefs") or {}
        block = dict(row)
        # Anything measured elsewhere and not by this endpoint survives untouched.
        if before.get("ai_citations"):
            block["ai_citations"] = before["ai_citations"]
        block["source"] = SOURCE
        block["measured_at"] = args.measured_at
        digital["ahrefs"] = block
        wrote += 1
        if not args.dry_run:
            io.open(path, "w", encoding="utf-8", newline=LF).write(
                json.dumps(firm, ensure_ascii=False, indent=2) + LF)

    touched = 0
    for path in sorted(COHORTS.glob("*.json")):
        cohort = json.load(io.open(path, encoding="utf-8"))
        changed = 0
        for entry in cohort.get("firms") or []:
            row = rows.get((entry.get("domain") or "").lower())
            if not row:
                continue
            for field in COHORT_FIELDS:
                entry[field] = row[field]
            changed += 1
        if changed:
            touched += 1
            print("%-38s %2d of %2d firm(s) measured"
                  % (cohort["id"], changed, len(cohort.get("firms") or [])))
            if not args.dry_run:
                io.open(path, "w", encoding="utf-8", newline=LF).write(
                    json.dumps(cohort, ensure_ascii=False, indent=2) + LF)

    print()
    print("%d profile(s) and %d cohort(s) written%s · %d published firm(s) had no row"
          % (wrote, touched, " (dry run, nothing saved)" if args.dry_run else "", missing))
    print("D2 is a percentile and needs six measured firms in a cohort before it scores.")
    print("Run scripts/score.py --write to recompute.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
