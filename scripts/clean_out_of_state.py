#!/usr/bin/env python3
"""
Undo New York findings written onto firms that are not in New York.

check_ny_registry.py and check_ny_dos.py ran over every profile in the directory rather than the
New York ones, and Malloy Law, a Maryland firm, came back with:

    G1  sourced to the NYS attorney register, "2 of 7 attorneys currently registered,
        1 not currently registered"
    G2  sourced to the same register, failed for coverage
    G3  "No matching entity found in the active corporations register", which is New York's
    G6  time in operation not established, from that same New York filing date
    A6  "2 of 7 named attorneys matched to the Maryland register", which is not the register it
        was matched against

Two of seven names appeared in a register of 432,910 people, which is what matching common names
gets you, and the profile then published that one of a Maryland firm's attorneys was not currently
registered. A New York register has no authority over a Maryland admission, and Maryland publishes
no register we are permitted to query: mdcourts.gov/robots.txt carries Disallow: /attysearch. So a
Maryland profile carries no licence finding at all, which is what the cohort file already says.

The checkers are guarded now. This repairs what they already wrote: the four gates go back to the
wording build_profiles.py uses for a state with no queryable register, the New York annotations
come off the attorneys, and anything the registry derived is cleared so score.py leaves those
sub-factors out of the scale instead of scoring them against the firm.

Usage:
    python scripts/clean_out_of_state.py            # report
    python scripts/clean_out_of_state.py --write
"""
from __future__ import annotations

import argparse
import io
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from build_profiles import discipline_wording, registry_wording  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"

# The gates a New York source can speak to, and what they say where there is no source at all.
NY_SOURCED = ("G1", "G2", "G3", "G6")
REGISTRY_KEYS = ("registry_status", "registry_basis", "registry_note", "bar_number",
                 "admitted_year", "checked_at")


def entity_wording(market, firm=None):
    """G3 wants a registered entity and a confirmed office. One half is answerable anywhere.

    Saying only "no business register" threw away the half we did establish. The offices are
    verified Google Business Profile listings with postal addresses, which is the part a client
    uses to work out whether anyone is actually there, so the evidence says so and then names the
    half the state does not publish.
    """
    listings = (((firm or {}).get("digital") or {}).get("places") or {}).get("listing_count") or 0
    confirmed = ("%d physical office%s confirmed through verified Google Business Profile "
                 "listings, but " % (listings, "" if listings == 1 else "s")) if listings else ""
    return (f"{confirmed}{market['state_name']} does not publish a business register we can "
            "query, so the registered entity behind this firm is not verified here.",
            "no queryable source")


def footprint_wording(market):
    return ("Time in operation needs an entity filing date, and "
            f"{market['state_name']} does not publish a register we can query.",
            "no queryable source")


def clean(firm):
    market = firm["market"]
    changes = []

    wording = {
        "G1": registry_wording(market),
        "G2": discipline_wording(market),
        "G3": entity_wording(market, firm),
        "G6": footprint_wording(market),
    }
    for code in NY_SOURCED:
        gate = (firm.get("gates") or {}).get(code)
        if not gate:
            continue
        source_now = (gate.get("source") or "")
        was_ny = "data.ny.gov" in source_now or "New York" in source_now
        # Also rewrite a gate this script has already reset, so improving the wording does not
        # need the damage to still be there. What it must never touch is a gate somebody else has
        # since answered: a pass, an attestation, or a real out-of-state source such as the
        # published discipline decisions check.
        # build_profiles.py marks an unfinished gate "(partial)", which is right in New York
        # where the register can finish it and wrong everywhere else: outside New York nothing
        # will ever finish G3's entity half, so it reads as work we owe rather than a gap in the
        # state's publishing.
        already_ours = ("no queryable source" in source_now.lower()
                        or "partial" in source_now.lower())
        if gate.get("pass") or gate.get("attested") or not (was_ny or already_ours):
            continue
        evidence, source = wording[code]
        if gate.get("evidence") == evidence and source_now == source:
            continue
        firm["gates"][code] = {"pass": False, "evidence": evidence, "source": source,
                               "checked_at": gate.get("checked_at")}
        changes.append("%s reset to %s" % (code, source))

    # The entity block, if the New York register wrote one for a firm filed elsewhere.
    if firm.get("entity") and "New York" in json.dumps(firm["entity"]):
        firm.pop("entity")
        changes.append("dropped an entity record from the wrong state's register")

    stripped = 0
    for attorney in firm.get("attorneys") or []:
        present = [k for k in REGISTRY_KEYS if k in attorney]
        if not present:
            continue
        for k in present:
            attorney.pop(k)
        stripped += 1
    if stripped:
        changes.append("stripped New York register annotations from %d attorney(s)" % stripped)

    return changes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    touched = 0
    for path in sorted(FIRMS.rglob("*.json")):
        firm = json.loads(path.read_text(encoding="utf-8"))
        if firm.get("market", {}).get("state") == "NY":
            continue
        changes = clean(firm)
        if not changes:
            continue
        touched += 1
        print("%s (%s)" % (firm["slug"], firm["market"]["state"]))
        for c in changes:
            print("   " + c)
        if args.write:
            io.open(path, "w", encoding="utf-8", newline="\n").write(
                json.dumps(firm, indent=2, ensure_ascii=False) + "\n")

    print()
    print("%d profile(s) %s" % (touched, "repaired" if args.write else "would be repaired"))
    if not args.write:
        print("report only. Add --write to apply, then run scripts/score.py.")
    else:
        print("Run scripts/score.py to recompute.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
