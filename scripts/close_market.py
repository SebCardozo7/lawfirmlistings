#!/usr/bin/env python3
"""The steps every market needs after its profiles are placed, in one command.

A market opens in two halves. The first is measured by the crawl and the Places pass, and it is
the half everybody remembers because nothing publishes without it. The second is this one, and it
was remembered from memory six times in two days: logos, the state's business register, the
state's attorney discipline, and the gates that depend on the roster being filled first.

Every one of those six times the coverage guard found the gap afterwards, which is the guard
working and is also the wrong way round. A step that always has to run should not depend on
anybody recalling it between two other things.

What this cannot do is the Ahrefs pass. Those rows come through a connector rather than a key in
this repository, so a person fetches them and runs apply_ahrefs. This prints that as the one thing
left rather than finishing quietly and letting the guard say it tomorrow.

Order matters and is the reason this is a script rather than a list in a document:

    attorneys before gates      check_operating settles G5 from the published roster, so running
                                it first decides the gate against an empty list. That mistake
                                shipped two markets at 100 per cent Listed.
    register before score       G3 blocks a tier, so scoring before it reports a market that
                                does not exist.

Usage:
    python scripts/close_market.py --cohort az-phoenix-personal-injury
    python scripts/close_market.py --cohort tx-sanantonio-personal-injury --dry-run
"""
from __future__ import annotations

import argparse
import io
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_profiles import ENTITY_REGISTER_STATES  # noqa: E402
from check_discipline import REGISTERS as DISCIPLINE_STATES  # noqa: E402

# The state register readers, by state. A state absent here has none this repo can read, which is
# a fact about the state and is already said on every profile in it.
REGISTER_SCRIPT = {
    "TX": "check_tx_register.py",
    "FL": "check_fl_register.py",
    "NY": "check_ny_dos.py",
}


def run(label: str, cmd: list[str], dry: bool) -> int:
    print()
    print("=" * 72)
    print(label)
    print("=" * 72)
    sys.stdout.flush()
    if dry:
        print("   would run: %s" % " ".join(cmd[1:]))
        return 0
    return subprocess.call(cmd)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", required=True, help="cohort id under src/data/cohorts")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    path = ROOT / "src" / "data" / "cohorts" / (args.cohort + ".json")
    if not path.exists():
        print("no cohort at %s" % path, file=sys.stderr)
        return 2
    cohort = json.loads(path.read_text(encoding="utf-8"))
    state = cohort["state"]

    # Only the firms that actually have a profile. A cohort names everything the vetting kept,
    # and a few of those never reach publication: a site that will not answer has nothing to
    # build a profile from, and one whose Google listing cannot be matched has no verified
    # office, which G3 asks for.
    #
    # promote_measurements exits 1 when it is handed a domain with no profile, which is right of
    # it and was wrong of this script: the first run stopped the whole close on one unreachable
    # San Diego firm, reporting a failure where the only thing that happened is that a firm we
    # never published stayed unpublished.
    published = set()
    for p in (ROOT / "src" / "data" / "firms").rglob("*.json"):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if d.get("domain"):
            published.add(d["domain"].lower())

    named = [f["domain"] for f in cohort["firms"]]
    have = [d for d in named if d.lower() in published]
    absent = [d for d in named if d.lower() not in published]
    domains = ",".join(have)
    print("%s · %s · %d in the cohort, %d published" % (args.cohort, state, len(named), len(have)))
    if absent:
        print("   %d never published, so nothing here applies to them: %s"
              % (len(absent), ", ".join(absent[:4]) + (" ..." if len(absent) > 4 else "")))
    if not have:
        print("nothing published from this cohort yet: run build_profiles first", file=sys.stderr)
        return 2

    steps: list[tuple[str, list[str]]] = [
        ("logos the firms publish themselves",
         [sys.executable, "scripts/fetch_logos.py", "--domains", domains]),
        ("carrying the logos onto the profiles",
         [sys.executable, "scripts/promote_measurements.py", "--domains", domains]),
    ]

    if state in ENTITY_REGISTER_STATES and state in REGISTER_SCRIPT:
        steps.append(("%s business register, which settles G3" % state,
                      [sys.executable, "scripts/" + REGISTER_SCRIPT[state], "--write"]))
    else:
        print("   %s publishes no business register this repo can read, so G3 stays excused "
              "rather than owed" % state)

    if state in DISCIPLINE_STATES:
        steps.append(("%s attorney discipline, which settles G2" % state,
                      [sys.executable, "scripts/check_discipline.py",
                       "--state", state, "--write", "--gates"]))
    else:
        print("   %s publishes no attorney discipline this repo can read, so G2 stays excused"
              % state)

    steps.append(("G5 and G6, now that the rosters are filled",
                  [sys.executable, "scripts/check_operating.py", "--gates-only"]))
    steps.append(("rescoring", [sys.executable, "scripts/score.py"]))

    for label, cmd in steps:
        code = run(label, cmd, args.dry_run)
        if code != 0:
            print("\n%s exited %d. Stopping here rather than running the next step on top of it."
                  % (label, code), file=sys.stderr)
            return code

    print()
    print("=" * 72)
    print("%s is closed except for one thing." % args.cohort)
    print("=" * 72)
    print("Search authority is still owed. Those rows come through the Ahrefs connector rather")
    print("than a key in this repository, so they are fetched by a person and applied with:")
    print()
    print("    python scripts/apply_ahrefs.py --csv .crawl/ahrefs-<market>.csv")
    print()
    print("Until that runs, scripts/check_coverage.mjs will report this market at zero on search")
    print("authority, and it will be right.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
