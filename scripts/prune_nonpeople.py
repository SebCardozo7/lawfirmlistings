#!/usr/bin/env python3
"""
Remove names from published rosters that are page titles rather than people.

crawl_attorneys.py checks every name against `looks_like_a_person`, and the check was too narrow
in two ways that a Northwest Indiana firm exposed. "Car Accidents" passed because the vocabulary
list held "accident" and a word boundary does not match its plural, and "Of Counsel" passed
because the role peel takes a title off the end of a name and leaves a bare title alone.

Both are fixed in the crawler, so no new profile can carry one. This is for the profiles that
already do: fifteen published firms between them list twenty-four practice pages as members of
staff, and a reader looking at O'Brien Ford's roster finds a colleague called Boating Accidents.

It removes and reports, and it does not touch the gates. G1, G2 and D1 quote a count of the
firm's attorneys, so a pruned firm needs its registry check run again to make those sentences
true. The run prints that list at the end rather than leaving it to be remembered.

Usage:
    python scripts/prune_nonpeople.py --dry-run
    python scripts/prune_nonpeople.py
"""
from __future__ import annotations

import argparse
import io
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from crawl_attorneys import looks_like_a_person  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"
LF = chr(10)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    touched, removed = [], 0
    for path in sorted(FIRMS.rglob("*.json")):
        firm = json.load(io.open(path, encoding="utf-8"))
        roster = firm.get("attorneys") or []
        keep = [a for a in roster if looks_like_a_person(a.get("name") or "")]
        if len(keep) == len(roster):
            continue
        print("%-46s %d of %d" % (firm["slug"][:46], len(roster) - len(keep), len(roster)))
        for a in roster:
            if a not in keep:
                print("    %s" % (a.get("name") or "")[:70])
        removed += len(roster) - len(keep)
        firm["attorneys"] = keep
        touched.append((firm["slug"], firm.get("market", {}).get("state")))
        if not args.dry_run:
            io.open(path, "w", encoding="utf-8", newline=LF).write(
                json.dumps(firm, ensure_ascii=False, indent=2) + LF)

    print()
    print("%d name(s) removed from %d firm(s)%s"
          % (removed, len(touched), " (dry run, nothing written)" if args.dry_run else ""))
    states = sorted({s for _, s in touched if s})
    if touched:
        print("Their gates now quote a count that has changed. Re-run, per state:")
        for state in states:
            tool = ("check_ny_registry.py" if state == "NY" else
                    "check_discipline.py --state %s" % state)
            print("    python scripts/%s --write --gates" % tool)
        print("    python scripts/score.py --write")
    return 0


if __name__ == "__main__":
    sys.exit(main())
