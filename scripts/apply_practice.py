#!/usr/bin/env python3
"""
Add a practice area to a firm that is already published.

build_profiles.py writes a whole new draft, which is right for a firm we are seeing for the first
time and wrong for one already in the directory: it would overwrite the prose, the FAQ and the
quote with generated text. But a published firm turning up in a second practice is ordinary.
Fourteen of the New York injury firms publish a workers' compensation practice page, and leaving
them out of that ranking would mean a reader comparing comp firms never sees the ones they are
most likely to have heard of.

So this adds one line to an existing profile and touches nothing else: the practice, with the URL
of the page the firm publishes about it. The evidence travels with the claim, the same rule every
measured value on this site follows, and it is what separates this from typing an area of law
into a profile because the firm probably does it.

Primary stays false. A firm's primary practice is the one it leads with, and a page in a menu of
practice areas is evidence that the firm does the work, not that the work is what it is for. The
one firm here whose comp practice is primary says so in its own name.

Reads the `practice_evidence` block scripts/check_practice.py writes into the staging record.

Usage:
    python scripts/apply_practice.py --practice workers-compensation --dry-run
    python scripts/apply_practice.py --practice workers-compensation --domains workerslaw.com
"""
from __future__ import annotations

import argparse
import glob
import io
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"

NAMES = {
    "workers-compensation": "Workers' Compensation",
    "personal-injury": "Personal Injury",
}


def profile_for(domain: str):
    for path in FIRMS.rglob("*.json"):
        try:
            data = json.load(io.open(path, encoding="utf-8"))
        except ValueError:
            continue
        if data.get("domain") == domain:
            return path, data
    return None, None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--practice", required=True, choices=sorted(NAMES))
    ap.add_argument("--domains", help="comma-separated; default is every staging record")
    ap.add_argument("--staging", default=".crawl")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    if args.domains:
        paths = [ROOT / args.staging / (d.strip() + ".json")
                 for d in args.domains.split(",") if d.strip()]
    else:
        paths = [pathlib.Path(p) for p in
                 sorted(glob.glob(str(ROOT / args.staging / "*.json")))]

    added = skipped = 0
    for path in paths:
        if not path.exists() or path.parent.name == "profiles":
            continue
        try:
            rec = json.load(io.open(path, encoding="utf-8"))
        except ValueError:
            continue
        evidence = (rec.get("practice_evidence") or {}).get(args.practice)
        if not evidence or not evidence.get("url"):
            continue

        domain = rec.get("domain") or path.stem
        profile_path, profile = profile_for(domain)
        if not profile:
            continue                      # not published yet; build_profiles.py will handle it

        practices = profile.setdefault("practices", [])
        listed = next((p for p in practices if p.get("slug") == args.practice), None)
        if listed:
            # A practice that is already listed but carries no link to the page behind it. The
            # first cohorts were published before check_practice.py existed, so their practices
            # were read off the firm's menu by a person and the evidence never travelled with the
            # claim: 132 of them by the time the audit started reporting it. This fills in the
            # link, and only the link, because the practice itself was already right.
            if not listed.get("source_url"):
                listed["source_url"] = evidence["url"]
                listed["checked_at"] = evidence.get("checked_at")
                print("%-30s evidence %s" % (domain[:30], evidence["url"][:60]))
                added += 1
                if not args.dry_run:
                    io.open(profile_path, "w", encoding="utf-8", newline="\n").write(
                        json.dumps(profile, ensure_ascii=False, indent=2) + "\n")
            else:
                print("%-30s already lists it, with evidence" % domain[:30])
                skipped += 1
            continue

        practices.append({
            "slug": args.practice,
            "name": NAMES[args.practice],
            "primary": False,
            "source_url": evidence["url"],
            "checked_at": evidence.get("checked_at"),
        })
        print("%-30s + %s" % (domain[:30], evidence["url"][:64]))
        added += 1
        if not args.dry_run:
            io.open(profile_path, "w", encoding="utf-8", newline="\n").write(
                json.dumps(profile, ensure_ascii=False, indent=2) + "\n")

    print()
    print("%d profile(s) gained %s, %d already had it%s"
          % (added, args.practice, skipped, " (dry run, nothing written)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
