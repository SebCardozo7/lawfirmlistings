#!/usr/bin/env python3
"""Everything a market needs before its profiles can be placed, in one command.

close_market.py exists because the second half of opening a market was remembered from memory
six times in two days. The first half has the same shape and had no such script: the sequence
lived in whoever was running it, and the order is not obvious from the outside. crawl_public
has to go first because every step after it reads the staging record it writes, and
build_profiles has to go last because it reads all of them.

What this is not is a way to publish faster by measuring less. Every step here already ran on
every market; the only thing that changes is that nobody has to remember which, in what order,
or notice afterwards that one was skipped.

It stops where a person is genuinely needed and says so. The About block is assembled from
fields by lib_describe, but somebody still has to read it before it is published as editorial
prose, and place_profiles refuses without --about-reviewed. That is the one judgement in the
first half and this does not pretend to make it.

Two exit codes are treated differently, and the difference is the point:

    the step exited 3        it finished and some firms in it did not. _survive.py reports
                             which. The run carries on, because the next step reads a staging
                             record per firm and the ones that worked are there.
    the step exited anything it broke. Stop, because the next step would be running on top of
    else non-zero            whatever state it left.

Usage:
    python scripts/open_market.py --cohort ca-losangeles-personal-injury --practice personal-injury
    python scripts/open_market.py --cohort az-phoenix-personal-injury --practice personal-injury --dry-run
"""
from __future__ import annotations

import argparse
import io
import json
import pathlib
import subprocess
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _survive import STEP_RAN_SOME_FIRMS_FAILED  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]


def run(label: str, cmd: list[str], dry: bool) -> tuple[int, float]:
    print()
    print("=" * 78)
    print(label)
    print("=" * 78)
    if dry:
        # The domain list is 144 names and printing it five times buries the thing a reader
        # came here for, which is the order and the flags.
        shown = []
        for part in cmd[1:]:
            shown.append(part if len(part) < 60 else
                         "%s ... (%d domains)" % (part[:38], part.count(",") + 1))
        print("  " + " ".join(shown))
        return 0, 0.0
    started = time.time()
    code = subprocess.call(cmd, cwd=str(ROOT))
    return code, time.time() - started


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", required=True, help="the cohort file, without .json")
    ap.add_argument("--practice", required=True,
                    help="the practice this market is opened for, e.g. personal-injury")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--from-step", help="resume at this step, by its first word")
    args = ap.parse_args()

    path = ROOT / "src" / "data" / "cohorts" / f"{args.cohort}.json"
    if not path.exists():
        print(f"no cohort at {path}", file=sys.stderr)
        print("discover_places and vet_candidates come before this and produce it.", file=sys.stderr)
        return 2
    cohort = json.loads(path.read_text(encoding="utf-8"))
    domains = ",".join(f["domain"] for f in cohort["firms"])
    print("%s · %d firm(s) · practice %s" % (args.cohort, len(cohort["firms"]), args.practice))

    py = sys.executable
    steps: list[tuple[str, list[str]]] = [
        # First, and alone in that: everything below reads the staging record this writes.
        ("the firms' own sites",
         [py, "scripts/crawl_public.py", "--cohort", args.cohort]),
        # Does the firm publish this practice, or name it among its practice areas. Several
        # practices can ride one visit, which is the whole saving in that script.
        ("whether each firm publishes this practice",
         [py, "scripts/check_practice.py", "--practice", args.practice, "--domains", domains]),
        # Before the gates. check_operating settles G5 from the published roster, so a market
        # whose rosters are not filled yet is a market scored against an empty list, and that
        # mistake shipped two markets at 100 per cent Listed.
        ("the attorneys each firm names",
         [py, "scripts/crawl_attorneys.py", "--domains", domains]),
        ("what each firm publishes about its own results",
         [py, "scripts/crawl_results.py", "--domains", domains]),
        ("what each firm says about cover and associations",
         [py, "scripts/check_a5.py", "--domains", domains]),
        ("Google listings and reviews",
         [py, "scripts/enrich_places.py", "--domains", domains]),
        ("Core Web Vitals",
         [py, "scripts/enrich_psi.py", "--domains", domains]),
        # Last: it reads every record the steps above wrote.
        ("drafting the profiles",
         [py, "scripts/build_profiles.py", "--cohort", args.cohort]),
    ]

    if args.from_step:
        want = args.from_step.lower()
        keep = [i for i, (label, _) in enumerate(steps) if label.lower().startswith(want)]
        if not keep:
            print("no step starts with %r. They are:" % args.from_step, file=sys.stderr)
            for label, _ in steps:
                print("   " + label, file=sys.stderr)
            return 2
        steps = steps[keep[0]:]

    limped: list[tuple[str, float]] = []
    timings: list[tuple[str, float]] = []
    for label, cmd in steps:
        code, took = run(label, cmd, args.dry_run)
        timings.append((label, took))
        if code == STEP_RAN_SOME_FIRMS_FAILED:
            # The step did its work and named the firms it could not do. Carrying on is right:
            # every step after this one reads a record per firm, and the ones that worked have
            # theirs. Stopping here would be the old behaviour, where one firm ended the run.
            limped.append((label, took))
            continue
        if code != 0:
            print("\n%s exited %d, which means the step itself broke rather than a firm in it."
                  % (label, code), file=sys.stderr)
            print("Stopping, because the next step would read whatever state it left behind.",
                  file=sys.stderr)
            print("Fix it and resume with --from-step %r." % label.split()[0], file=sys.stderr)
            return code

    print()
    print("=" * 78)
    if not args.dry_run:
        print("Measured. %s is ready for a person." % args.cohort)
    else:
        print("Nothing ran. %s" % args.cohort)
    print("=" * 78)
    if limped:
        print()
        print("%d step(s) finished with firms they could not do:" % len(limped))
        for label, _ in limped:
            print("   %s" % label)
        print("Each one named them above. They are measurable later and nothing was written")
        print("for them, so the market can open without them and they can be filled in after.")
    if not args.dry_run:
        print()
        print("Where the time went:")
        for label, took in sorted(timings, key=lambda t: -t[1]):
            print("   %5.1f min  %s" % (took / 60, label))
    print()
    print("Next, and this is the judgement this script does not make: read the About blocks")
    print("build_profiles assembled, then")
    print()
    print("    python scripts/place_profiles.py --cohort %s --dry-run" % args.cohort)
    print("    python scripts/place_profiles.py --cohort %s --about-reviewed" % args.cohort)
    print("    python scripts/close_market.py --cohort %s" % args.cohort)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
