#!/usr/bin/env python3
"""
Screen firms for court sanctions and consumer-protection actions: gate G4.

G4 asks for no active state Attorney General, FTC or court sanction for client-related
misconduct. It had never run on any firm, and it was the last gate standing between several
firms and a Verified tier.

The source is CourtListener, run by the Free Law Project, searched through its public API. Two
things had to be established before a zero result from it could mean anything at all, and the
first attempt at this failed both:

  Does a zero result mean the query matched nothing, or that the syntax was wrong? A nonsense
  query returns 0 and a firm's own name returns dozens, so the search is doing its job. Quoted
  phrases are honoured: "sanctions against" returns 28,436 opinions and a quoted nonsense phrase
  returns none.

  Can the screen actually catch a firm that was sanctioned? This is the question that a checker
  which only ever passes cannot answer about itself. Levidow, Levidow & Oberman were sanctioned
  under Rule 11 in Mata v. Avianca in 2023, and searching the OPINIONS index for them alongside
  "Rule 11" returns nothing, because that opinion is not in it. Searching the DOCKET index
  returns exactly one result, Mata v. Avianca, Inc. So this searches dockets, and the first
  version of it, pointed at opinions, would have cleared a firm a week after it was sanctioned.

THE RESULT, recorded so nobody repeats the experiment blind: this does not work as a gate, and
it is not wired to one. It is an editorial screen that produces a queue of dockets to read.

Two query shapes were tried against all thirteen firms and both fail, in opposite directions.

  Full text, firm name AND sanction vocabulary, flagged 13 of 13. A personal injury firm that
  has litigated in federal court appears in dockets discussing sanctions because it argued
  about them, and a mass-tort firm appears in consumer-protection dockets because that is its
  practice area. A screen that flags everyone gates nothing.

  Caption search is precise, and tests the wrong thing. "United States v. Shkolnik" and "In re:
  Stephen Silberstein" are individuals who share a surname with a firm, the same collision the
  corporate-register matcher needed two distinctive tokens to solve. Requiring the full firm
  name fixes that and then asks whether the firm was a party, which is not what G4 asks: the
  Rule 11 sanction on Levidow, Levidow & Oberman was imposed on them as counsel in someone
  else's case, so no caption search would ever find it.

So the signal G4 describes is not separable from ordinary practice by text search over this
collection. G4 is written as pending, with that reason, and the queue of dockets is the useful
output. The honest route to passing it is the firm's own attestation, recorded and labelled
through scripts/attest.py, until a source exists that can carry the check.

Usage:
    python scripts/check_g4.py                 # report only
    python scripts/check_g4.py --write         # update G4
    python scripts/check_g4.py --firm shulman-hill --verbose
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
FIRMS = ROOT / "src" / "data" / "firms"

BASE = "https://www.courtlistener.com/api/rest/v4/search/"
SOURCE = "CourtListener docket search (Free Law Project), RECAP collection"
UA = "LawFirmListingsBot/1.0 (+https://lawfirmlistings.com/methodology/)"
# Anonymous use is rate limited: 429 appeared at roughly one request every two seconds.
PAUSE = 8.0

GENERIC = {
    "LAW", "LAWS", "FIRM", "FIRMS", "OFFICE", "OFFICES", "GROUP", "LLP", "LLC", "PLLC", "PC",
    "PLC", "LP", "AND", "THE", "OF", "ASSOCIATES", "ASSOCIATION", "PARTNERS", "ATTORNEY",
    "ATTORNEYS", "LAWYER", "LAWYERS", "INJURY", "PERSONAL", "ACCIDENT", "TRIAL", "LEGAL",
    "COUNSEL", "PA", "PLLP", "CO", "INC", "NEW", "YORK", "CITY", "NY",
}

# Three queries, each aimed at one limb of the gate. Kept as quoted phrases where a bare token
# would drown in noise: "sanctions" alone matches every case where the firm argued about them.
PROBES = [
    ('"Rule 11"', "Rule 11 sanctions"),
    ('("sanctions against" OR "disciplinary proceeding" OR "professional misconduct")',
     "sanctions or misconduct"),
    ('("consumer protection" OR "deceptive practices" OR "unfair trade")',
     "consumer-protection action"),
]


def anchor(firm: dict) -> str | None:
    """The firm's most distinctive name token, which is what a docket would carry."""
    words = re.sub(r"[^\w\s&]", " ", (firm.get("legal_name") or firm["name"]).upper()).split()
    distinctive = [w for w in words if w not in GENERIC and len(w) > 3 and w != "&"]
    return max(distinctive, key=len) if distinctive else None


def search(query: str) -> tuple[int | None, list[dict], str]:
    url = BASE + "?" + urllib.parse.urlencode({"q": query, "type": "r"})
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return data.get("count"), (data.get("results") or [])[:5], ""
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < 3:
                time.sleep(20 * (attempt + 1))
                continue
            return None, [], f"HTTP {exc.code}"
        except Exception as exc:
            # See check_ny_registry: RemoteDisconnected sits outside URLError.
            if attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            return None, [], type(exc).__name__
    return None, [], "gave up"


def check(firm: dict, verbose: bool = False) -> dict:
    token = anchor(firm)
    if not token:
        return {"error": "no distinctive name token to search on"}
    result = {"token": token, "queries": [], "hits": [], "failed": []}
    for phrase, label in PROBES:
        query = f'"{token}" AND {phrase}'
        n, rows, err = search(query)
        result["queries"].append({"label": label, "query": query, "count": n, "error": err})
        if err or n is None:
            result["failed"].append(label)
        elif n:
            for row in rows:
                result["hits"].append({
                    "label": label,
                    "case": row.get("caseName", "?"),
                    "court": row.get("court", ""),
                    "url": "https://www.courtlistener.com" + (row.get("absolute_url") or ""),
                })
        if verbose:
            print(f"      {n if not err else 'ERR ' + err:<7} {query}")
        time.sleep(PAUSE)
    return result


def apply_gate(firm: dict, result: dict, today: str) -> None:
    """Always writes G4 as pending. The screen cannot pass it; see the note at the top.

    What it can do is say honestly what has been looked at, and carry the size of the review
    queue so the gate is not a blank "not yet checked" when a search has in fact run.
    """
    gates = firm.setdefault("gates", {})
    if (gates.get("G4") or {}).get("attested"):
        return

    if result.get("failed"):
        note = (f"A docket search ran but failed on {len(result['failed'])} of "
                f"{len(PROBES)} queries.")
    else:
        note = (f"A docket search found {len(result['hits'])} case(s) naming this firm "
                "alongside sanction or consumer-protection language, none of which is a "
                "finding against it: a firm appears in such a docket by arguing about "
                "sanctions, or by bringing consumer-protection claims for its clients.")
    gates["G4"] = {
        "pass": False,
        "evidence": (note + " Text search over this collection cannot separate an action "
                     "against a firm from its ordinary practice, so this gate is not settled "
                     "by it. It is open."),
        "source": f"{SOURCE}, screening only, pending",
        "checked_at": today,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--firm")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    paths = sorted(FIRMS.rglob("*.json"))
    if args.firm:
        paths = [p for p in paths if p.stem == args.firm]
        if not paths:
            print(f"no firm with slug {args.firm}", file=sys.stderr)
            return 2

    today = date.today().isoformat()
    clean = flagged = broken = 0
    for path in paths:
        firm = json.loads(path.read_text(encoding="utf-8"))
        if firm.get("status") == "sample":
            continue
        print(f"\n{firm['name']}")
        result = check(firm, args.verbose)
        if result.get("error"):
            print(f"  --   {result['error']}")
            continue
        if result["failed"]:
            broken += 1
            print(f"  ??   search incomplete: {', '.join(result['failed'])}")
        elif result["hits"]:
            flagged += 1
            print(f"  !!   {len(result['hits'])} docket(s) to read")
            for hit in result["hits"][:4]:
                print(f"         [{hit['label']}] {hit['case'][:58]}")
                print(f"           {hit['url']}")
        else:
            clean += 1
            print(f"  OK   nothing found under \"{result['token']}\"")
        if args.write:
            apply_gate(firm, result, today)
            path.write_text(json.dumps(firm, indent=2, ensure_ascii=False) + "\n",
                            encoding="utf-8")

    print("\n" + "=" * 70)
    print(f"{clean} with nothing found · {flagged} with dockets to read · {broken} incomplete")
    print(f"source: {SOURCE}")
    print("The screen fires: it finds the Rule 11 sanction on Levidow, Levidow & Oberman in")
    print("Mata v. Avianca. It also flags every firm here, because a litigating firm argues")
    print("about sanctions and a mass-tort firm brings consumer-protection claims. So this is")
    print("a review queue, not a gate: G4 is written pending either way.")
    if not args.write:
        print("report only. Add --write to record the screen against G4.")
    else:
        print("Run scripts/score.py to recompute.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
