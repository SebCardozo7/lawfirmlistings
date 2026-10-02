#!/usr/bin/env python3
"""
Rewrites the About block of published profiles from the finished record.

Why this is a separate pass and not a change to build_profiles: `describe()` runs at draft time,
when the firm has no attorneys, no score, no reviews and no cohort to be compared against. It
holds six fields and it writes the only sentence six fields support. By the time the pipeline
finishes, the same firm has a roster, a results count, a review history, a domain age and a rank
in its market, and none of that is in the paragraph a reader sees first.

What it decides, per firm:

  Which fact to lead with. The largest roster in the market leads with the roster. A firm with
  151 published results leads with the results. A firm that names nobody leads with that, because
  on this directory an absence is the finding.

  Whether a superlative is earned. "The longest such list in Boston" is a rank computed over the
  firms published in Boston, written only where the market has at least ten of them and the firm
  is first or second. Everywhere else the number stands on its own.

  What stays attributed. Fees, consultations, recovery totals and anything else the firm says
  about itself keep "the firm states" or "its own figure", because we read them off its pages and
  did not confirm them.

Hand-written blocks are not touched. A profile whose opening sentence does not match the shape
`describe()` produces was written by a person, and this exits leaving it alone.

Usage:
    python scripts/write_about.py --dry-run             # print what would change, write nothing
    python scripts/write_about.py --dry-run --limit 20  # a sample of them
    python scripts/write_about.py                       # write
    python scripts/write_about.py --domains perecman.com
"""
from __future__ import annotations

import argparse
import glob
import io
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from lib_about import (STATE_NAMES, count, join, locality, state_of, street)

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIRMS = ROOT / "src" / "data" / "firms"

# The sentence `describe()` writes. Anything that does not start this way was written by hand.
TEMPLATE = re.compile(r" is an? [a-z' ]+ firm (with|based|in\b)")

LEGAL_SUFFIX = re.compile(
    r",?\s+(?:P\.?A\.?|P\.?C\.?|LLP|L\.L\.P\.?|PLLC|P\.L\.L\.C\.?|LLC|L\.L\.C\.?|"
    r"PLC|Ltd\.?|Inc\.?|Co\.?,?\s*LPA|Chartered)\s*$",
    re.I,
)

NOT_STATED = ("", "not stated", "unknown", "n/a", "na", "pending")


def short(name: str) -> str:
    """"Sweeney Merrigan Law, LLP" is "Sweeney Merrigan" in a sentence about it."""
    out = name.strip()
    previous = None
    while previous != out:
        previous = out
        out = LEGAL_SUFFIX.sub("", out).strip().rstrip(",")
    # A name that ends in a full stop puts one in the middle of the sentence: "Shamon Law, APC.
    # works from Rio San Diego Drive". The abbreviation survives, the stop does not.
    out = out.rstrip(".").strip().rstrip(",")
    return out or name


# ---------------------------------------------------------------------------
# Reading the record
# ---------------------------------------------------------------------------

RESULTS_N = re.compile(r"(\d[\d,]*) results published")
TRUST_PAGES = ("privacy policy", "disclaimer", "terms", "fee statement", "bar numbers on bios")


def sub_rows(firm: dict) -> dict:
    rows = {}
    for pillar in (firm.get("score") or {}).get("pillars", {}).values():
        for row in pillar.get("subs", []):
            rows[row["code"]] = row
    return rows


def facts(firm: dict) -> dict:
    rows = sub_rows(firm)
    offices = firm.get("offices") or []
    hq = next((o for o in offices if o.get("is_hq")), offices[0] if offices else None)

    results = len(firm.get("results") or [])
    if not results and "B1" in rows:
        found = RESULTS_N.search(rows["B1"].get("evidence") or "")
        if found:
            results = int(found.group(1).replace(",", ""))

    google = ((firm.get("reviews") or {}).get("google") or {})
    try:
        review_count = int(str(google.get("count_label") or "0").replace(",", ""))
    except ValueError:
        review_count = 0

    said = " ".join(firm.get("availability") or []).lower()
    ahrefs = (firm.get("digital") or {}).get("ahrefs") or {}

    return {
        "name": firm["name"],
        "short": short(firm["name"]),
        "city": firm["market"]["city"],
        "state": firm["market"]["state"],
        "offices": offices,
        "hq": hq,
        "street": street((hq or {}).get("address") or ""),
        "localities": localities(offices),
        "roster": len(firm.get("attorneys") or []),
        "results": results,
        "reviews": review_count,
        "rating": google.get("rating"),
        "listings": listing_count(google.get("source") or ""),
        "years": (firm.get("operating") or {}).get("years"),
        "formed": (firm.get("entity") or {}).get("formed"),
        "languages": [l for l in (firm.get("languages") or []) if l.lower() != "english"],
        "fee": (firm.get("fee_model") or "").strip(),
        "free_consult": bool(firm.get("free_consultation")),
        "around_clock": "24/7" in said or bool(re.search(r"24[- ]hour", said)),
        "visits": "hospital" in said or "home visit" in said,
        "practices": [p["name"] for p in (firm.get("practices") or [])],
        "dr": ahrefs.get("dr"),
        "trust": trust_pages(rows),
    }


LISTINGS = re.compile(r"(\d+) listings")


def listing_count(source: str) -> int:
    found = LISTINGS.search(source or "")
    return int(found.group(1)) if found else 1


def trust_pages(rows: dict) -> list[str]:
    evidence = (rows.get("D1") or {}).get("evidence") or ""
    return [page for page in TRUST_PAGES if page in evidence.lower()]


def localities(offices: list[dict]) -> list[str]:
    out: list[str] = []
    for office in offices:
        address = office.get("address") or ""
        place = locality(address)
        if place == "New York" and state_of(address) == "NY":
            place = "Manhattan"
        if place and place not in out:
            out.append(place)
    return out


# ---------------------------------------------------------------------------
# Ranks
#
# A superlative is a claim about every other firm on the page, so it is computed over the firms
# actually published in that market and written only where there are enough of them for first
# place to mean something.
# ---------------------------------------------------------------------------

MIN_MARKET = 10
RANKED = ("roster", "results", "reviews", "years")


def ranks(all_facts: list[dict]) -> None:
    by_market: dict[tuple, list[dict]] = {}
    for f in all_facts:
        by_market.setdefault((f["city"], f["state"]), []).append(f)

    for (city, _state), group in by_market.items():
        f_count = len(group)
        for field in RANKED:
            values = sorted((f[field] or 0 for f in group), reverse=True)
            for f in group:
                value = f[field] or 0
                f.setdefault("rank", {})[field] = {
                    "position": values.index(value) + 1 if value else None,
                    "of": f_count,
                    "clear": value > 0 and values.count(value) == 1,
                    "second_value": values[1] if len(values) > 1 else 0,
                }

    for f in all_facts:
        f["market_size"] = len(by_market[(f["city"], f["state"])])


def superlative(f: dict, field: str, singular: str) -> str | None:
    """"the largest roster of any firm listed in Boston", or nothing."""
    if f["market_size"] < MIN_MARKET:
        return None
    rank = (f.get("rank") or {}).get(field) or {}
    if not rank.get("clear") or rank.get("position") != 1:
        return None
    runner_up = rank.get("second_value") or 0
    value = f[field] or 0
    margin = " by a wide margin" if runner_up and value >= runner_up * 1.5 else ""
    return f"the {singular} of any firm listed in {f['city']}{margin}"


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------

def where(f: dict) -> str:
    places = f["localities"]
    n = len(f["offices"])
    states = []
    for office in f["offices"]:
        name = STATE_NAMES.get(state_of(office.get("address") or ""))
        if name and name not in states:
            states.append(name)

    if n == 1:
        here = places[0] if places else f["city"]
        if f["street"] and here != f["city"]:
            return f"works from {f['street']} in {here}"
        if f["street"]:
            return f"works from {f['street']}"
        return f"works from {here}"
    if 2 <= n <= 3 and places:
        if len(places) == 1:
            # Two offices in one town. Naming the town twice reads as a mistake, so the count
            # carries it: "works from two offices in Phoenix".
            if f["street"]:
                return f"works from {f['street']}, one of {count(n)} offices in {places[0]}"
            return f"works from {count(n)} offices in {places[0]}"
        if f["street"]:
            return f"works from {f['street']} in {places[0]}, with " + (
                f"a second office in {places[1]}" if len(places) == 2
                else f"offices in {join(places[1:])}")
        return f"works from {join(places)}"
    if len(states) > 1:
        return f"works from {count(n)} offices across {join(states)}"
    where_state = states[0] if states else f["city"]
    if len(places) > 3:
        return f"works from {count(n)} offices across {where_state}, among them {join(places[:3])}"
    return f"works from {count(n)} offices across {where_state}"


def roster_clause(f: dict) -> str | None:
    n = f["roster"]
    if not n:
        return "names no attorney on the pages we could reach"
    best = superlative(f, "roster", "largest roster")
    if n == 1:
        return f"names a single attorney, {best}" if best else "names a single attorney"
    if best:
        return f"names {count(n)} attorneys, {best}"
    return f"names {count(n)} attorneys"


def results_clause(f: dict) -> str | None:
    n = f["results"]
    if not n:
        return None
    best = superlative(f, "results", "longest such list")
    tail = f", {best}," if best else ""
    return (f"It publishes {count(n)} case {'result' if n == 1 else 'results'} with amounts of "
            f"its own{tail} and they are its figures rather than ones we confirmed")


def reviews_clause(f: dict) -> str | None:
    if not f["reviews"] or not f["rating"]:
        return None
    best = superlative(f, "reviews", "largest count")
    across = f" across {count(f['listings'])} listings" if f["listings"] > 1 else ""
    rating = f"{f['rating']:.2f}".rstrip("0")
    if rating.endswith("."):
        rating += "0"
    return (f"{f['reviews']:,} reviews at {rating}{across}"
            + (f", {best}" if best else ""))


def terms_clause(f: dict) -> str:
    published = []
    if "contingency" in f["fee"].lower():
        published.append("Contingency fees")
    elif f["fee"].lower() not in NOT_STATED:
        published.append(f"{f['fee']} fees")
    if f["free_consult"]:
        published.append("a free consultation")
    if f["around_clock"]:
        published.append("a 24 hour line")
    if f["visits"]:
        published.append("hospital and home visits")
    if f["languages"]:
        published.append("pages in " + join(f["languages"]))

    if not published:
        return ("It publishes nothing we could record about fees, consultations or the hours it "
                "answers.")
    line = join(published)
    return line[0].upper() + line[1:] + ", published."


def gaps_clause(f: dict, silent_on_terms: bool = False) -> str | None:
    missing = []
    if f["fee"].lower() in NOT_STATED:
        missing.append("nothing about the rate or the retainer")
    if not f["trust"]:
        missing.append("none of the trust pages pillar D looks for")
    elif len(f["trust"]) == 1:
        missing.append(f"only a {f['trust'][0]} of the trust pages pillar D looks for")
    if not missing:
        return None
    # The terms sentence has already said the firm records no fees at all, so repeating the rate
    # here says it twice in three sentences.
    if silent_on_terms and missing[0].startswith("nothing about the rate"):
        missing = missing[1:]
    if not missing:
        return None
    return "It publishes " + join(missing) + "."


def history_clause(f: dict) -> str | None:
    years = f["years"]
    if not years or years < 15:
        return None
    best = superlative(f, "years", "longest history")
    if not best:
        return None
    return f"{round(years)} years by its domain registration, {best}"


def about(f: dict) -> list[str]:
    placed = where(f)
    opening = f"{f['short']} {placed}"
    roster = roster_clause(f)
    if roster:
        # "works from X, with a second office in Y and names three attorneys" reads as though the
        # second office were doing the naming. A clause that already carries a comma takes one.
        opening += f", and {roster}" if ("," in placed or " and " in placed) else f" and {roster}"
    first = [opening.rstrip(".") + "."]

    history = history_clause(f)
    if history:
        first.append(history[0].upper() + history[1:] + ".")

    second: list[str] = []
    reviews = reviews_clause(f)
    results = results_clause(f)
    terms = terms_clause(f)

    # A superlative is the most interesting thing on the profile, so it opens the paragraph
    # rather than closing it. Everywhere else the reviews lead, which is what the hand-written
    # blocks did.
    if results and superlative(f, "results", "longest such list"):
        second.append(results + ".")
        results = None
    if reviews:
        second.append(reviews[0].upper() + reviews[1:] + ".")
    second.append(terms)
    if results:
        second.append(results + ".")
    gaps = gaps_clause(f, silent_on_terms=terms.startswith("It publishes nothing we could record"))
    if gaps:
        second.append(gaps)

    return [" ".join(first), " ".join(second)]


# ---------------------------------------------------------------------------

def load() -> list[tuple[pathlib.Path, dict]]:
    out = []
    for path in sorted(glob.glob(str(FIRMS / "**" / "*.json"), recursive=True)):
        p = pathlib.Path(path)
        out.append((p, json.loads(p.read_text(encoding="utf-8"))))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--domains", nargs="*", default=[])
    # A rename changes the name the opening sentence is built from, and the block it
    # has to replace is one this script wrote rather than the old template, so the
    # hand-written guard below would skip it. --force is for that, and is why it is
    # only ever used with --domains.
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    records = load()
    published = [(p, d) for p, d in records
                 if d.get("status") not in ("sample", "not_eligible")]

    all_facts = [facts(d) for _p, d in published]
    ranks(all_facts)

    written = skipped = 0
    shown = 0
    for (path, firm), f in zip(published, all_facts):
        if args.domains and firm.get("domain") not in args.domains:
            continue
        existing = firm.get("about") or []
        if existing and not TEMPLATE.search(existing[0]) and not args.force:
            skipped += 1
            continue

        new = about(f)
        if args.dry_run:
            if not args.limit or shown < args.limit:
                shown += 1
                print(f"--- {firm['name']} ({f['city']}) ---")
                print(f"  antes: {existing[0] if existing else '(vacio)'}")
                for para in new:
                    print(f"  ahora: {para}")
                print()
            written += 1
            continue

        firm["about"] = new
        io.open(path, "w", encoding="utf-8", newline="\n").write(
            json.dumps(firm, indent=2, ensure_ascii=False) + "\n")
        written += 1

    verb = "se reescribirian" if args.dry_run else "reescritas"
    print(f"{written} {verb} · {skipped} escritas a mano, intactas · {len(published)} publicadas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
