#!/usr/bin/env python3
"""
The promise the prospecting letter makes, asserted against the code that has to keep it.

Since 13 November 2026 every letter to a firm we publish says this:

    Publish what is missing and the next monthly read picks it up. You do not have to tell
    us and we do not have to be told.

Pillar E is the only part of the score that letter names, because it is the only part a
firm can move by itself in a week: what it charges, what languages it works in, when it
answers, all read off its own site. On 16 November 2026 that promise was false. The four
fields were derived in build_profiles.py, which runs once when a market opens, and
promote_measurements.py, which is what the monthly workflow runs, carried none of them in
FIELD_PATHS. Pillar E was frozen on all 1,388 profiles at whatever the firm said that day.

This runs with no network and no crawl, because the thing it guards is a promise to a
stranger and the failure is silent: nothing errors, a number simply never moves.

    python scripts/check_pillar_e.py
"""
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib_claims import pillar_e  # noqa: E402
from promote_measurements import FIELD_PATHS, promote  # noqa: E402

FAILED = 0


def ok(label: str, passed: bool, detail: str = "") -> None:
    global FAILED
    if passed:
        print(f"  ok    {label}")
    else:
        FAILED += 1
        print(f"  FAIL  {label}{('  ' + detail) if detail else ''}")


def head(title: str) -> None:
    print(f"\n{title}")


def main() -> int:
    head("the derivation reads what the crawl writes")
    # A firm that publishes nothing: English only, no fee stated, no free consult.
    bare = pillar_e({"claims": {}})
    ok("a silent site states no fee", bare["fee_model"] == "Not stated", bare["fee_model"])
    ok("and claims no free consultation", bare["free_consultation"] is False)
    ok("and is English only", bare["languages"] == ["English"], str(bare["languages"]))
    ok("and publishes no availability", bare["availability"] == [])

    # The same firm, after it publishes. This is the firm in the letter.
    after = pillar_e({"claims": {"contingency": True, "free_consultation": True,
                                 "se_habla_espanol": True, "available_24_7": True,
                                 "hospital_visits": True}})
    ok("CONTINGENCY IS READ", after["fee_model"] == "Contingency", after["fee_model"])
    ok("the free consultation is read", after["free_consultation"] is True)
    ok("Spanish is read", after["languages"] == ["English", "Spanish"], str(after["languages"]))
    ok("both availability claims are read",
       after["availability"] == ["24/7 intake line", "Hospital & home visits"],
       str(after["availability"]))

    # Spanish has two sources, and the crawler finds it either way.
    signal = pillar_e({"claims": {}, "spanish_signals": ["es/"]})
    ok("Spanish from a page signal, with no claim",
       signal["languages"] == ["English", "Spanish"], str(signal["languages"]))

    # A transactional and a matrimonial practice state a fee that is not a contingency.
    ok("a flat fee is a fee",
       pillar_e({"claims": {}, "transaction": {"flat_fee": True}})["fee_model"] == "Flat fee")
    ok("an hourly rate is a fee",
       pillar_e({"claims": {}, "domestic": {"hourly": True}})["fee_model"]
       == "Hourly rate published")

    head("the monthly run promotes them, which is the whole promise")
    # A published profile as it stands today, and a fresh crawl of the same firm after the
    # firm put its terms up. Nothing else about the record changes.
    firm = {"slug": "example-law", "domain": "example.example",
            "languages": ["English"], "fee_model": "Not stated",
            "free_consultation": False, "availability": []}
    rec = {"domain": "example.example", "pages_found": 4,
           "claims": {"contingency": True, "free_consultation": True,
                      "se_habla_espanol": True, "available_24_7": True}}
    changed = promote(rec, firm)
    ok("THE FEE MODEL MOVES", firm["fee_model"] == "Contingency", firm["fee_model"])
    ok("the free consultation moves", firm["free_consultation"] is True)
    ok("the languages move", firm["languages"] == ["English", "Spanish"])
    ok("availability moves", firm["availability"] == ["24/7 intake line"])
    ok("and each one is reported, not changed silently",
       sum(1 for line in changed
           if line.split()[0] in ("languages", "fee_model", "free_consultation",
                                  "availability")) == 4,
       json.dumps(changed)[:120])

    head("a second run changes nothing, so the monthly diff stays readable")
    again = promote(rec, firm)
    ok("NOTHING MOVES TWICE",
       not [line for line in again
            if line.split()[0] in ("languages", "fee_model", "free_consultation",
                                   "availability")],
       json.dumps(again)[:120])

    head("a crawl that never got in takes no points off anybody")
    # The distinction trust_pages had to learn: {} is a measurement, a missing key is a
    # failure. A firm whose site refused us must keep what it had.
    held = {"slug": "example-law", "domain": "example.example",
            "languages": ["English", "Spanish"], "fee_model": "Contingency",
            "free_consultation": True, "availability": ["24/7 intake line"]}
    promote({"domain": "example.example", "site_blocked": True}, held)
    ok("A BLOCKED SITE KEEPS ITS FEE MODEL", held["fee_model"] == "Contingency",
       held["fee_model"])
    ok("and its languages", held["languages"] == ["English", "Spanish"])
    ok("and its availability", held["availability"] == ["24/7 intake line"])

    # And the opposite: a crawl that read the pages and found nothing is a real finding.
    dropped = {"slug": "example-law", "domain": "example.example",
               "languages": ["English", "Spanish"], "fee_model": "Contingency",
               "free_consultation": True, "availability": ["24/7 intake line"]}
    promote({"domain": "example.example", "pages_found": 4, "claims": {}}, dropped)
    ok("a firm that took its terms down loses them",
       dropped["fee_model"] == "Not stated" and dropped["languages"] == ["English"],
       dropped["fee_model"])

    head("--only can hold each of them back")
    for name in ("languages", "fee_model", "free_consultation", "availability"):
        ok(f"{name} is in FIELD_PATHS", name in FIELD_PATHS)

    print("\nEvery check passed." if not FAILED else f"\n{FAILED} check(s) failed.")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
