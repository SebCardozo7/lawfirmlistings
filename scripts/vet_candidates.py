#!/usr/bin/env python3
"""
Decide which verified candidates actually belong in a city's cohort.

scripts/discover_places.py finds firms in a state and scripts/check_practice.py confirms each
publishes the practice. Neither answers the question a city page asks, which is whether the firm
is in *this* market. Both let through firms that are in the right state and the wrong metro:

    bobkatzlaw.com        titles its page "Manassas Personal Injury Lawyer". Manassas is Virginia.
    dubolawfirm.com       "Bethesda Personal Injury Lawyer". Maryland, forty miles from Baltimore.
    dennishernandez.com   "Brandon Personal Injury lawyer". Tampa area, not Polk County.

A postal prefix answers it without a judgement call. Baltimore City and County are 21xxx, which
excludes Bethesda at 208xx and Manassas at 201xx. Polk County is 338xx, which excludes Brandon,
Lutz and Tampa at 335xx and 336xx. The prefix is passed in rather than inferred, because which
towns count as a market is an editorial decision and this script is not the place to make it.

It reports; it writes no cohort. The cohort is written by a person from this output, which is
where a national firm's local branch, a virtual office and a genuine second location get told
apart, and none of those is a call an address string can make.

Usage:
    python scripts/vet_candidates.py --id md-personal-injury --practice personal-injury --zip 21
    python scripts/vet_candidates.py --id fl-personal-injury --practice personal-injury --zip 338
"""
from __future__ import annotations

import argparse
import io
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"

# A firm with offices in this many states is a national practice with a branch here. Not a
# disqualification: it has an office in the market and the gate asks only that. It is flagged,
# because a reader comparing local firms deserves to know which one is a branch.
NATIONAL_OFFICES = 8


def published_domains() -> set[str]:
    out = set()
    for path in FIRMS.rglob("*.json"):
        try:
            out.add(json.load(io.open(path, encoding="utf-8"))["domain"])
        except (ValueError, KeyError, OSError):
            pass
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, help="the candidate file's cohort id")
    ap.add_argument("--practice", required=True)
    ap.add_argument("--zip", required=True,
                    help="postal prefixes the market shares, comma separated: 21, or 750,752,753")
    ap.add_argument("--staging", default=".crawl")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    staging = ROOT / args.staging
    path = staging / ("candidates-%s.json" % args.id)
    if not path.exists():
        print("no candidate file at %s" % path, file=sys.stderr)
        return 2
    data = json.load(io.open(path, encoding="utf-8"))
    already = published_domains()
    # One prefix was enough while every market sat inside a single postal block. Dallas does not:
    # the city is 752xx and 753xx, Plano and Irving and Garland are 750xx, and the shortest prefix
    # that covers all of them is "75", which also reaches Tyler and Longview a hundred miles away.
    # A list keeps the boundary honest without widening it.
    prefixes = [p.strip() for p in args.zip.split(',') if p.strip()]
    in_market = re.compile(
        r",\s*[A-Z]{2}\s+(?:%s)\d*" % "|".join(re.escape(p) for p in prefixes))

    # This reads practice_evidence off the staging record and fetches nothing itself, so running
    # it before scripts/check_practice.py has run reports every candidate as having no practice
    # page when what it means is that nobody has looked. Chicago came back "3 to publish, 145
    # without a practice page" that way, which reads like a market with no firms in it.
    #
    # The same guard enrich_places.py carries, for the same reason: a step that ran too early
    # exits 0 and prints a small number, and a small number reads like there was not much to do.
    pending = [c["domain"] for c in data["candidates"]
               if c["domain"] not in already and not (staging / (c["domain"] + ".json")).exists()]
    fresh = [c for c in data["candidates"] if c["domain"] not in already]
    if fresh and len(pending) > len(fresh) / 2:
        print("%d of %d candidates have no staging record, so the crawl has not run for this "
              "market yet and every one of them would be reported as having no practice page.\n"
              "Run scripts/crawl_public.py and scripts/check_practice.py first."
              % (len(pending), len(fresh)), file=sys.stderr)
        return 2

    keep, out_of_market, unverified, national = [], [], [], []
    for cand in data["candidates"]:
        domain = cand["domain"]
        if domain in already:
            continue

        record = staging / (domain + ".json")
        evidence = {}
        if record.exists():
            try:
                evidence = ((json.load(io.open(record, encoding="utf-8"))
                             .get("practice_evidence") or {}).get(args.practice) or {})
            except (ValueError, OSError):
                evidence = {}
        if not evidence.get("url"):
            unverified.append((cand, evidence.get("why") or "not checked"))
            continue

        local = [o for o in cand["offices"] if in_market.search(o.get("address") or "")]
        if not local:
            out_of_market.append(cand)
            continue
        if len(cand["offices"]) >= NATIONAL_OFFICES:
            national.append(cand)
        keep.append((cand, evidence, local))

    keep.sort(key=lambda k: -(k[0]["review_count_total"] or 0))
    print("%d to publish, %d in the state but outside the market, %d without a practice page"
          % (len(keep), len(out_of_market), len(unverified)))
    print()
    for cand, evidence, local in keep:
        mark = "  [national, branch here]" if cand in [c for c in national] else ""
        print("  %-32s %-32s %5d rev  %d local office(s)%s"
              % (cand["domain"][:32], (cand.get("name") or "")[:32],
                 cand["review_count_total"], len(local), mark))
        print("      %s" % evidence["url"][:96])

    if out_of_market:
        print()
        print("Outside the market, with their nearest address:")
        for cand in out_of_market:
            first = (cand["offices"][0].get("address") or "?") if cand["offices"] else "?"
            print("  %-32s %s" % (cand["domain"][:32], first[:62]))

    # A firm the map returns in several cities is a national practice with a local office, and
    # publishing it as a local firm in each of them counts it once per city and tells a reader it
    # is something it is not. The office count above catches the ones with many addresses, and
    # misses the ones whose branch network is only visible when two markets are opened together:
    # Morgan and Morgan came back in all three cities opened on 2026-09-26, and Lerner and Rowe
    # and Karns and Karns in two each.
    #
    # Which market keeps such a firm is an editorial decision and this does not make it, the same
    # way the postal prefix is passed in rather than inferred. It says where else the firm turned
    # up, which is the part a person cannot see from one candidate file.
    elsewhere = {}
    for other in sorted(staging.glob("candidates-*.json")):
        if other.name == path.name:
            continue
        try:
            rival = json.load(io.open(other, encoding="utf-8"))
        except (ValueError, OSError):
            continue
        for cand in rival.get("candidates") or []:
            elsewhere.setdefault(cand["domain"], []).append(
                other.name[len("candidates-"):-len(".json")])
    shared = [(c, elsewhere[c["domain"]]) for c, _, _ in keep if c["domain"] in elsewhere]
    if shared:
        print()
        print("Also a candidate in another market, so one market has to give them up:")
        for cand, where in shared:
            print("  %-32s %s" % (cand["domain"][:32], ", ".join(sorted(set(where)))[:62]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
