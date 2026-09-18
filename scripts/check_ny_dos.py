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
    # The practice words of a family law market, which are as generic here as INJURY and
    # ACCIDENT are in an injury one. RLF Family Law shares RLF and FAMILY with "RLF FAMILY
    # LIMITED PARTNERSHIP, L.P.", an estate planning vehicle that is not a law firm, and two
    # shared tokens was enough to publish it as the firm's registered entity.
    "FAMILY", "DIVORCE", "MATRIMONIAL", "CUSTODY", "SUPPORT",
}


def norm(text: str) -> str:
    # "&" and "and" are the same word, and the whole-name similarity is the only place it
    # showed: Cantor, Wolff, Nicastro and Hall files as CANTOR, WOLFF, NICASTRO & HALL LLC, and
    # the two spellings of one ampersand were enough to drop the ratio below the threshold that
    # accepts a firm registered under a form that cannot practise law.
    text = re.sub(r"\s*&\s*", " AND ", (text or "").upper())
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", text)).strip()


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
            except Exception:
                # See check_ny_registry: urlopen raises RemoteDisconnected outside the
                # URLError hierarchy, and one dropped connection should not discard a
                # run of hundreds of lookups.
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        rows.extend(page or [])
        if not page or len(page) < PAGE:
            return rows
        time.sleep(PAUSE)


def listing_tokens(firm: dict) -> set[str]:
    """Distinctive words in the name on the firm's own Google listing.

    A second name the firm publishes, and sometimes the fuller one: D'Agostino & Associates
    files as THE LAW FIRM OF JONATHAN D'AGOSTINO, P.C., and "D'Agostino" alone is one token
    against 111 entities carrying that surname, so the register said nothing about a firm
    plainly in it. Its listing is headed "Jonathan D'Agostino & Associates".

    These are only ever a second attempt, never part of the first. A listing name carries
    marketing: Beck Law's reads "Beck Workers Comp & Car Accident Attorney of Queens, P.C.",
    and folding those words into the first pass moved the search anchor, raised the number of
    tokens a row had to share, and lost three firms that the plain name had matched exactly.
    """
    out: set[str] = set()
    for office in firm.get("offices") or []:
        out |= {t for t in tokens(office.get("label") or "")
                if t not in GENERIC and len(t) > 2}
    return out


def candidates(firm: dict, name_tokens: set[str]) -> list[dict]:
    """Search on the single most distinctive token, then score the rest locally."""
    if not name_tokens:
        return []
    anchor = max(name_tokens, key=len)
    return fetch(f"upper(current_entity_name) like '%{anchor}%'")


def match(firm: dict) -> tuple[dict | None, str]:
    """The firm's name first. Its Google listing's name only if that found nothing."""
    found, why = attempt(firm, set())
    if found:
        return found, why
    extra = listing_tokens(firm) - distinctive(firm)[0]
    if extra:
        found, why2 = attempt(firm, extra)
        if found:
            return found, why2 + ", matched on the name the firm's Google listing carries"
    return None, why


def attempt(firm: dict, extra: set[str]) -> tuple[dict | None, str]:
    name_tokens, domain_tokens = distinctive(firm)
    # The anchor stays a word from the firm's own name, so the search never wanders.
    anchor_tokens = set(name_tokens)
    name_tokens |= extra
    needed = min(2, len(name_tokens)) or 1
    whole = norm(firm.get("legal_name") or firm["name"])
    scored = []
    for row in candidates(firm, anchor_tokens):
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
    # Only a professional service corporation, a professional service LLC or a registered LLP
    # may practise law in New York. Where the best candidate is none of those, it is somebody's
    # holding company or, in one case here, a family limited partnership that shares a surname,
    # and G3 asks whether this firm is registered rather than whether the name appears anywhere
    # in the register. An almost exact name match is still accepted: Cantor, Wolff, Nicastro &
    # Hall files an LLC under its own full name, and that is the firm however it is organised.
    if not top[1] and top[2] < 0.9:
        return None, ("best match %s is a %s, which cannot practise law in New York, and the "
                      "name is not close enough to be this firm under another form"
                      % (top[3]["current_entity_name"],
                         (top[3].get("entity_type") or "entity").lower()))
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
    # A foreign entity's filing date is the day it registered to do business in New York, not
    # the day the firm was formed. TopDog Law is a Philadelphia practice that registered here in
    # May 2026 and has been operating since 2015 by its domain, and reading the New York date as
    # its age failed a gate on a firm eleven years old.
    foreign = "FOREIGN" in (entity.get("entity_type") or "").upper() if entity else False

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
        elif (age is None or foreign) and (gates.get("G6") or {}).get("pass"):
            # Somebody else has already settled this gate from a source this script does not
            # read. scripts/check_operating.py establishes the year in operation from the
            # domain's registration date, which is a lower bound and a real one, and where no
            # entity matched here there is nothing to add: overwriting it took the gate away
            # from twelve firms and replaced their evidence with "time in operation not
            # established", which was a statement about this script rather than about them.
            notes.append("G6 left as it was: no entity matched and another source has settled it")
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

    skipped_out_of_state: list[str] = []
    matched = 0
    total = 0
    today = date.today().isoformat()
    for path in paths:
        firm = json.loads(path.read_text(encoding="utf-8"))
        if firm.get("status") == "sample":
            continue
        if firm.get("market", {}).get("state") != "NY":
            # A New York register has nothing to say about a firm admitted elsewhere. This ran
            # over every profile, so a Maryland firm came back with G1 and G2 sourced to the NYS
            # attorney register, an entity gate failed against the New York corporations
            # register, and an evidence line claiming its attorneys had been matched to "the
            # Maryland register" when they had been matched to New York's. Two of seven names
            # happened to appear there, which is what you get from matching common names against
            # a register of 432,910 people, and the profile then said one of them was not
            # currently registered. Maryland publishes no register we may query, so a Maryland
            # profile carries no licence finding at all, and this is where that is enforced.
            skipped_out_of_state.append(firm["slug"])
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
            # An entity this script wrote and no longer matches has to go with the match. RLF
            # Family Law carried "RLF FAMILY LIMITED PARTNERSHIP, L.P." on its profile after
            # the matcher stopped accepting it, so the gate said the check could not be
            # completed while the page still printed a legal name belonging to somebody else.
            # A hand-attested entity is left alone: it did not come from here.
            if args.write and (firm.get("entity") or {}).get("source") == DATASET:
                firm.pop("entity")
                print("       (the entity this script had written no longer matches and was "
                      "removed)")

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
    if skipped_out_of_state:
        print("%d firm(s) outside New York were left alone: %s"
              % (len(skipped_out_of_state), ", ".join(skipped_out_of_state)))
        print("A New York register says nothing about a firm admitted elsewhere.")
    if not args.write:
        print("report only. Add --write to store the entity and update G3/G6.")
    else:
        print("Run scripts/score.py to recompute.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
