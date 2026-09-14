#!/usr/bin/env python3
"""
Take the word "Attorney" off every name the firm never called one.

scripts/crawl_attorneys.py recorded two fields for each person it read off a firm's team pages:
the role printed beside the name, and where that role came from. Where the firm printed nothing
it wrote `role: "Attorney"` and `role_source: "not stated by the firm"`, which is contradictory
but at least self-documenting. scripts/promote_measurements.py then copied the role onto the
profile and dropped the source, so the contradiction became a plain assertion: twenty-seven
attorneys at a firm that names twenty-seven people and says what ten of them do.

Both scripts are fixed. This repairs what they already published. The staging records still
carry `role_source`, so for every published profile it reads the record the profile was built
from and clears any role the firm did not actually print.

It also fills in the reverse case: a role the firm did print and the profile lost.

Nothing is deleted. A person the firm names stays on the profile and src/lib/roster.ts decides
what to call them, which for a name with no role and no registration is "also named by the firm".

Usage:
    python scripts/repair_roles.py --dry-run
    python scripts/repair_roles.py
"""
from __future__ import annotations

import argparse
import io
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"
NOT_STATED = "not stated by the firm"


def key(name: str) -> str:
    """Match on a normalised name: the profile spells a middle initial with a full stop and the
    staging record often does not, and the two are the same person."""
    return " ".join((name or "").replace(".", " ").split()).casefold()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--staging", default=".crawl")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    cleared = kept = restored = unknown = 0
    for path in sorted(FIRMS.rglob("*.json")):
        firm = json.load(io.open(path, encoding="utf-8"))
        people = firm.get("attorneys") or []
        if not people:
            continue

        staging = ROOT / args.staging / ((firm.get("domain") or "") + ".json")
        found = {}
        if staging.exists():
            try:
                rec = json.load(io.open(staging, encoding="utf-8"))
                found = {key(a["name"]): a
                         for a in ((rec.get("attorneys_found") or {}).get("attorneys") or [])}
            except (ValueError, OSError):
                found = {}

        changes = []
        for person in people:
            crawled = found.get(key(person["name"]))
            if not crawled:
                # No staging record for this name: it was entered by a person, and a person's
                # judgement is not something a script should overwrite.
                unknown += 1
                continue
            source = crawled.get("role_source")
            if source == NOT_STATED:
                if person.pop("role", None):
                    changes.append("%s: role cleared" % person["name"])
                    cleared += 1
                person["role_source"] = NOT_STATED
            elif source:
                if crawled.get("role") and person.get("role") != crawled["role"]:
                    person["role"] = crawled["role"]
                    changes.append("%s: role restored to %r" % (person["name"], crawled["role"]))
                    restored += 1
                else:
                    kept += 1
                person["role_source"] = source

        if changes:
            print("%s" % path.name)
            for line in changes[:4]:
                print("   %s" % line)
            if len(changes) > 4:
                print("   ... and %d more" % (len(changes) - 4))
            if not args.dry_run:
                io.open(path, "w", encoding="utf-8", newline="\n").write(
                    json.dumps(firm, ensure_ascii=False, indent=2) + "\n")

    print()
    print("%d role(s) cleared, %d restored from the firm's own page, %d already right, "
          "%d left alone with no staging record%s"
          % (cleared, restored, kept, unknown, " (dry run)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
