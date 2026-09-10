#!/usr/bin/env python3
"""
Check firms against the New York Department of State's active corporations register.

Two gates depended on a filing nobody had looked up. G3 asks for a registered legal entity plus
a confirmed physical office, and G6 asks for a minimum public footprint, part of which is a year
in operation. Both had sat pending on every firm because the Secretary of State half was manual.

The register is published in bulk: dataset n9v6-gdp6 on data.ny.gov, attributed to the New York
State Department of State. Being in it is itself the finding, since it lists active entities
only, and `initial_dos_filing_date` gives the date the entity was formed, which is what "a year
in operation" needs.

  G3  registered active entity, plus at least one Google-verified physical location, which
      digital.places already counts. Both halves have to hold.
  G6  ten or more public client reviews and at least a year since formation.

Matching follows the same rules the attorney registry taught us. A firm name is mostly its
partners' surnames, and one surname in common is a coincidence often enough to matter: GREENSTEIN
alone also finds Greenstein & Milbauer. So a match needs two of the firm's distinctive tokens, or
its whole distinctive name when it only has one, and an ambiguous result writes nothing.

Usage:
    python scripts/check_ny_dos.py                # report only
    python scripts/check_ny_dos.py --write        # store the entity and update G3/G6
    python scripts/check_ny_dos.py --firm shulman-hill
"""
from __future__ import annotations

import argparse
import difflib
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

ENDPOINT = "https://data.ny.gov/resource/n9v6-gdp6.json"
DATASET = ("Active Corporations register (data.ny.gov n9v6-gdp6), published by the "
           "New York State Department of State")
UA = "LawFirmListingsBot/1.0 (+https://lawfirmlistings.com/methodology/)"
PAUSE = 0.4
PAGE = 1000

G6_MIN_REVIEWS = 10
G6_MIN_YEARS = 1

# Only a professional entity may practise law in New York: a professional service corporation, a
# professional service LLC, or a registered LLP. A plain LLC or business corporation cannot, so
# where two entities share a firm's name, the professional one is the practice and the other is
# something else, usually a holding company. This settled Shulman & Hill, where "SHULMAN & HILL,
# PLLC" and "SHULMAN & HILL 1 LLC" were indistinguishable by name alone.
PRACTICE_ENTITY = re.compile(r"PROFESSIONAL|LIMITED LIABILITY PARTNERSHIP", re.I)

GENERIC = {
    "LAW", "LAWS", "FIRM", "FIRMS", "OFFICE", "OFFICES", "GROUP", "LLP", "LLC", "PLLC", "PC",
    "PLC", "LP", "AND", "THE", "OF", "ASSOCIATES", "ASSOCIATION", "PARTNERS", "ATTORNEY",
    "ATTORNEYS", "LAWYER", "LAWYERS", "INJURY", "PERSONAL", "ACCIDENT", "TRIAL", "LEGAL",
    "COUNSEL", "PA", "PLLP", "CO", "INC", "NEW", "YORK", "CITY", "NY", "ESQ",
}


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s&]", " ", (text or "").upper())).strip()


def tokens(text: str) -> set[str]:
    return {t for t in norm(text).split() if t and t != "&"}


def distinctive(firm: dict) -> tuple[set[str], set[str]]:
    name = {t for t in tokens(firm["name"]) | tokens(firm.get("legal_name") or "")
            if t not in GENERIC and len(t) > 2}
    dom = set()
    label = (firm.get("domain") or "").split(".")[0].replace("www", "")
    if len(label) > 4:
        dom.add(label.upper())
    return name, dom


def fetch(where: str) -> list[dict]:
    """Every row, paged. A silent truncation here would look exactly like 'not registered'."""
    rows: list[dict] = []
    while True:
        query = urllib.parse.urlencode({
            "$where": where,
            "$select": "dos_id,current_entity_name,initial_dos_filing_date,entity_type,county,jurisdiction",
            "$order": "dos_id",
            "$limit": PAGE,
            "$offset": len(rows),
        })
        req = urllib.request.Request(f"{ENDPOINT}?{query}",
                                     headers={"User-Agent": UA, "Accept": "application/json"})
        page = None
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    page = json.loads(resp.read().decode("utf-8"))
                break
            except urllib.error.HTTPError as exc:
                if exc.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    raise
                time.sleep(2 ** attempt)
            except (urllib.error.URLError, TimeoutError):
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        rows.extend(page or [])
        if not page or len(page) < PAGE:
            return rows
        time.sleep(PAUSE)


def candidates(firm: dict) -> list[dict]:
    """Search on the single most distinctive token, then score the rest locally."""
    name_tokens, _ = distinctive(firm)
    if not name_tokens:
        return []
    anchor = max(name_tokens, key=len)
    return fetch(f"upper(current_entity_name) like '%{anchor}%'")


def match(firm: dict) -> tuple[dict | None, str]:
    name_tokens, domain_tokens = distinctive(firm)
    needed = min(2, len(name_tokens)) or 1
    whole = norm(firm.get("legal_name") or firm["name"])
    scored = []
    for row in candidates(firm):
        entity_name = row.get("current_entity_name", "")
        company = tokens(entity_name)
        shared = name_tokens & company
        if len(shared) >= needed or (domain_tokens & company):
            # Similarity across the WHOLE name, generic words included. Dropping "the", "law" and
            # "firm" is right for deciding whether a row is a candidate at all, and wrong for
            # choosing between candidates: "The Rothenberg Law Firm" reduces to one distinctive
            # token, so fifteen entities containing ROTHENBERG scored identically and the exact
            # match, THE ROTHENBERG LAW FIRM LLP, was discarded as ambiguous. The generic words
            # are most of the signal once the surname is common to every candidate.
            ratio = difflib.SequenceMatcher(None, whole, norm(entity_name)).ratio()
            practice = 1 if PRACTICE_ENTITY.search(row.get("entity_type") or "") else 0
            scored.append((len(shared), practice, ratio, row))
    if not scored:
        return None, "no active entity matched"
    scored.sort(key=lambda x: (-x[0], -x[1], -x[2]))
    top = scored[0]
    rivals = [r for r in scored[1:]
              if r[0] == top[0] and r[1] == top[1] and top[2] - r[2] < 0.08]
    if rivals:
        names = ", ".join(r[3]["current_entity_name"] for r in [top] + rivals[:2])
        return None, f"ambiguous, {len(rivals) + 1} entities score alike ({names})"
    kind = "professional entity" if top[1] else "entity"
    return top[3], f"matched as the {kind}, name similarity {top[2]:.2f}"


def years_since(iso: str | None) -> float | None:
    if not iso:
        return None
    try:
        formed = date.fromisoformat(iso[:10])
    except ValueError:
        return None
    return (date.today() - formed).days / 365.25


def apply_gates(firm: dict, entity: dict | None, today: str) -> list[str]:
    notes: list[str] = []
    gates = firm.setdefault("gates", {})
    places = (firm.get("digital") or {}).get("places") or {}
    listings = places.get("listing_count") or 0
    reviews = places.get("review_count_total") or 0
    age = years_since(entity.get("initial_dos_filing_date")) if entity else None

    for code in ("G3", "G6"):
        if (gates.get(code) or {}).get("attested"):
            notes.append(f"{code} left as attested")

    if "G3" not in [c for c in ("G3",) if (gates.get(c) or {}).get("attested")]:
        if entity and listings:
            gates["G3"] = {
                "pass": True,
                "evidence": (f"{entity['current_entity_name']} is an active {entity.get('entity_type', 'entity').lower()} "
                             f"registered since {entity['initial_dos_filing_date'][:10]}, with {listings} "
                             f"Google-verified location{'' if listings == 1 else 's'}"),
                "source": DATASET,
                "checked_at": today,
            }
        elif entity:
            gates["G3"] = {
                "pass": False,
                "evidence": (f"{entity['current_entity_name']} is registered and active, but no physical "
                             "location has been verified yet"),
                "source": f"{DATASET}, pending an office check",
                "checked_at": today,
            }
        else:
            gates["G3"] = {
                "pass": False,
                "evidence": ("No matching entity found in the active corporations register. New York "
                             "does not require a general partnership to file with the Department of "
                             "State, so this is not evidence against the firm, only a check we "
                             "could not complete from this source"),
                "source": f"{DATASET}, partial",
                "checked_at": today,
            }

    if not (gates.get("G6") or {}).get("attested"):
        enough_reviews = reviews >= G6_MIN_REVIEWS
        old_enough = age is not None and age >= G6_MIN_YEARS
        if enough_reviews and old_enough:
            gates["G6"] = {
                "pass": True,
                "evidence": (f"{reviews:,} public client reviews and {age:.0f} years since the entity "
                             f"was formed in {entity['initial_dos_filing_date'][:4]}"),
                "source": f"Google Places API and {DATASET}",
                "checked_at": today,
            }
        else:
            why = []
            if not enough_reviews:
                why.append(f"{reviews:,} public reviews against a minimum of {G6_MIN_REVIEWS}")
            if not old_enough:
                why.append("time in operation not established" if age is None
                           else f"only {age:.1f} years since formation")
            gates["G6"] = {
                "pass": False,
                "evidence": "; ".join(why).capitalize(),
                "source": f"Google Places API and {DATASET}, partial",
                "checked_at": today,
            }
    return notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--firm")
    args = ap.parse_args()

    paths = sorted(FIRMS.rglob("*.json"))
    if args.firm:
        paths = [p for p in paths if p.stem == args.firm]
        if not paths:
            print(f"no firm with slug {args.firm}", file=sys.stderr)
            return 2

    matched = 0
    total = 0
    today = date.today().isoformat()
    for path in paths:
        firm = json.loads(path.read_text(encoding="utf-8"))
        if firm.get("status") == "sample":
            continue
        total += 1
        entity, why = match(firm)
        print(f"\n{firm['name']}")
        if entity:
            matched += 1
            age = years_since(entity["initial_dos_filing_date"])
            print(f"  OK   {entity['current_entity_name']}")
            print(f"       {entity.get('entity_type', '?')} · DOS #{entity['dos_id']} · "
                  f"formed {entity['initial_dos_filing_date'][:10]} ({age:.0f} years)")
            if args.write:
                firm["entity"] = {
                    "legal_name": entity["current_entity_name"],
                    "entity_type": entity.get("entity_type"),
                    "dos_id": str(entity["dos_id"]),
                    "formed": entity["initial_dos_filing_date"][:10],
                    "source": DATASET,
                    "checked_at": today,
                }
        else:
            print(f"  --   {why}")

        if args.write:
            for note in apply_gates(firm, entity, today):
                print(f"       ({note})")
            g3, g6 = firm["gates"]["G3"], firm["gates"]["G6"]
            print(f"       G3 {'pass' if g3['pass'] else 'open'} · G6 {'pass' if g6['pass'] else 'open'}")
            path.write_text(json.dumps(firm, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        time.sleep(PAUSE)

    print("\n" + "=" * 70)
    print(f"{matched} of {total} firms matched to an active registered entity")
    print(f"source: {DATASET}")
    if not args.write:
        print("report only. Add --write to store the entity and update G3/G6.")
    else:
        print("Run scripts/score.py to recompute.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
