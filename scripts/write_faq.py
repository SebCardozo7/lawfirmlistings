#!/usr/bin/env python3
"""
Writes the FAQ block of a published profile from the measured record.

One profile of 1,167 had an FAQ. The block is already on the page, already in the side
navigation, and already empty on everything else, so every firm page ends on its scorecard and
answers none of the four questions a person actually arrives with: what it costs, whether the
first call is free, where the offices are, and who checked any of this.

The questions are fixed and the answers are not. Each one is assembled from fields that carry a
source, and where a field is absent the answer says so rather than being dropped, because a firm
that does not publish its fee is a finding about that firm.

What this deliberately does not do: publish a number we did not read. The hand-written FAQ on
nyclawfirm.com says a New York contingency fee is "typically 33 1/3%" and cites the statutory
sliding scale for medical malpractice. That is true and it is useful, and it is also a legal rule
per state that nobody here has sourced for the other twelve states. Inventing twelve of those to
fill a template is the exact failure this directory exists to be the opposite of, so the fee
answer states what the firm publishes and sends the reader to the consultation for the rest.

The verification answer is the one worth having. It is the only page on the internet that will
tell someone which checks were run against this firm, which could not be run, and why, and it is
written to be quotable by something that is summarising the firm for a reader.

Usage:
    python scripts/write_faq.py --dry-run --limit 5
    python scripts/write_faq.py
    python scripts/write_faq.py --domains nyclawfirm.com
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

from lib_about import count, join
from write_about import NOT_STATED, facts, load, short, sub_rows

GATE_NAMES = {
    "G1": "licensure",
    "G2": "discipline",
    "G3": "entity registration",
    "G5": "website",
    "G6": "footprint",
}

# A gate that did not pass because nobody can answer it is not a mark against the firm, and the
# answer has to say which kind of failure it was.
NO_SOURCE = ("no queryable source", "unavailable", "no roster published")


def gate_rows(firm: dict) -> dict:
    return {k: v for k, v in (firm.get("gates") or {}).items() if isinstance(v, dict)}


# ---------------------------------------------------------------------------
# The questions
# ---------------------------------------------------------------------------

def q_fees(firm: dict, f: dict) -> dict | None:
    name = f["short"]
    fee = f["fee"]
    published = fee.lower() not in NOT_STATED

    if published and "contingency" in fee.lower():
        answer = (f"{name} publishes a contingency fee, which means the fee is a share of what "
                  f"the case recovers and there is nothing to pay if it recovers nothing.")
    elif published:
        answer = f"{name} publishes a {fee.lower()} fee."
    else:
        answer = (f"{name} publishes no fee terms on the pages we read, so none is recorded on "
                  f"this profile. An absence here is not a claim that the firm has no fee "
                  f"arrangement, only that it does not state one publicly.")

    # Whether the rate itself is published is a fact about this firm, read from the E1 row, not
    # something to assert because it is usually true. Five firms answer our crawler with a 403,
    # and for those nothing about fees was readable at all.
    e1 = (sub_rows(firm).get("E1") or {}).get("evidence") or ""
    if "403" in e1:
        answer = (f"{name} answers our crawler with a 403, so nothing published on its own site "
                  f"could be read for this profile, fee terms included.")
        rate = ("Ask for the fee agreement in writing, along with how case expenses are handled "
                "and whether they come out of the recovery before or after the fee.")
    elif "is not published" in e1:
        rate = ("The rate itself is not published, so ask for it in writing, along with how case "
                "expenses are handled and whether they come out of the recovery before or after "
                "the fee.")
    else:
        rate = ("Ask for the fee agreement in writing, along with how case expenses are handled "
                "and whether they come out of the recovery before or after the fee.")
    if f["free_consult"]:
        rate += " The first consultation is free, which is the place to ask."

    return {"q": f"How much does {name} charge?", "a": f"{answer} {rate}"}


def q_consultation(firm: dict, f: dict) -> dict:
    name = f["short"]
    if f["free_consult"]:
        opening = f"Yes. {name} publishes a free initial consultation."
    else:
        opening = (f"{name} does not publish a free consultation on the pages we read. That is "
                   f"not the same as charging for one, and it is worth asking.")

    extras = []
    if f["around_clock"]:
        extras.append("the intake line is published as open around the clock")
    if f["visits"]:
        extras.append("the firm states it will visit clients in hospital or at home")
    if f["languages"]:
        extras.append("it publishes material in " + join(f["languages"]))
    if extras:
        joined = join(extras)
        tail = " " + joined[0].upper() + joined[1:] + "."
    else:
        tail = ""
    return {"q": f"Does {name} offer a free consultation?", "a": opening + tail}


def q_offices(firm: dict, f: dict) -> dict:
    name = f["short"]
    offices = f["offices"]
    places = f["localities"]
    n = len(offices)
    by_appointment = [o for o in offices if o.get("by_appointment")]

    if n == 1:
        where = f"one office, in {places[0] if places else f['city']}"
    else:
        where = f"{count(n)} offices"
        if places and len(places) == n and n <= 5:
            # Only an exhaustive list gets "in". Four offices in three towns means two share one,
            # and "four offices, in Lakeland, Bartow and Sebring" reads as a miscount.
            where += f", in {join(places)}"
        elif places:
            where += f", among them {join(places[:4])}"

    answer = f"{name} publishes {where}."
    if by_appointment:
        answer += (f" {count(len(by_appointment))} of them "
                   f"{'is' if len(by_appointment) == 1 else 'are'} by appointment, which usually "
                   f"means there is no staffed reception there.")
    answer += (" Addresses and the Google listing behind each one are on this profile under "
               "Offices.")
    return {"q": f"Where does {name} have offices?", "a": answer}


def q_attorneys(firm: dict, f: dict) -> dict:
    name = f["short"]
    n = f["roster"]
    gates = gate_rows(firm)
    g1 = gates.get("G1") or {}

    if not n:
        return {"q": f"Who are the attorneys at {name}?",
                "a": (f"{name} names no attorney on the public pages we could read. That is a "
                      f"gap in what the firm publishes rather than a statement about who works "
                      f"there, and it is why the licensure and discipline checks on this profile "
                      f"have nothing to run against.")}

    answer = (f"{name} names {count(n)} {'attorney' if n == 1 else 'attorneys'} on its own site, "
              f"and each is listed on this profile with the page we read them from.")
    if g1.get("pass"):
        answer += f" {g1.get('evidence', '').rstrip('.')}."
    elif (g1.get("source") or "") in NO_SOURCE:
        answer += (f" They have not been checked against a state register: "
                   f"{g1.get('evidence', 'no register is available to query').rstrip('.')}.")
    return {"q": f"Who are the attorneys at {name}?", "a": answer}


def q_results(firm: dict, f: dict) -> dict | None:
    if not f["results"]:
        return None
    name = f["short"]
    n = f["results"]
    return {"q": f"Are the case results {name} publishes verified?",
            "a": (f"No. {name} publishes {count(n)} case "
                  f"{'result' if n == 1 else 'results'} with amounts on its own site. We counted "
                  f"them and we did not confirm them: the figures are the firm's. Pillar B scores "
                  f"whether a firm publishes outcomes and discloses them properly, including "
                  f"whether a prior-results disclaimer appears beside them, not whether the "
                  f"amounts are right. Past results do not predict another case.")}


def q_verified(firm: dict, f: dict) -> dict:
    name = f["short"]
    score = firm.get("score") or {}
    gates = gate_rows(firm)

    passed = [GATE_NAMES[k] for k in sorted(gates) if gates[k].get("pass") and k in GATE_NAMES]
    unanswerable = [GATE_NAMES[k] for k in sorted(gates)
                    if not gates[k].get("pass") and k in GATE_NAMES
                    and (gates[k].get("source") or "") in NO_SOURCE]
    failed = [GATE_NAMES[k] for k in sorted(gates)
              if not gates[k].get("pass") and k in GATE_NAMES
              and (gates[k].get("source") or "") not in NO_SOURCE]

    parts = [f"{name} scores {score.get('total')} and sits at {score.get('tier')}."]
    if passed:
        parts.append("Passed: " + join(passed) + ".")
    if failed:
        parts.append("Did not pass: " + join(failed) + ".")
    if unanswerable:
        parts.append("Could not be answered from any public source and therefore counts neither "
                     "for nor against the firm: " + join(unanswerable) + ".")
    parts.append("Every row of the scorecard above names where the value came from and when it "
                 "was read. Nothing on this profile was supplied by the firm for payment, and "
                 "no placement here can be bought.")
    return {"q": f"What has Law Firm Listings verified about {name}?", "a": " ".join(parts)}


BUILDERS = (q_fees, q_consultation, q_offices, q_attorneys, q_results, q_verified)


def faq(firm: dict, f: dict) -> list[dict]:
    out = []
    for build in BUILDERS:
        item = build(firm, f)
        if item:
            out.append(item)
    return out


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--domains", nargs="*", default=[])
    args = ap.parse_args()

    records = [(p, d) for p, d in load()
               if d.get("status") not in ("sample", "not_eligible")]
    all_facts = [facts(d) for _p, d in records]

    written = skipped = shown = 0
    for (path, firm), f in zip(records, all_facts):
        if args.domains and firm.get("domain") not in args.domains:
            continue
        # A hand-written FAQ knows things this does not, so it stays.
        if firm.get("faq"):
            skipped += 1
            continue

        block = faq(firm, f)
        if args.dry_run:
            if not args.limit or shown < args.limit:
                shown += 1
                print(f"=== {firm['name']} ({f['city']}) ===")
                for item in block:
                    print(f"  Q: {item['q']}")
                    print(f"  A: {item['a']}\n")
            written += 1
            continue

        firm["faq"] = block
        io.open(path, "w", encoding="utf-8", newline="\n").write(
            json.dumps(firm, indent=2, ensure_ascii=False) + "\n")
        written += 1

    verb = "tendrian FAQ" if args.dry_run else "con FAQ nueva"
    print(f"{written} {verb} · {skipped} ya tenian una, intactas · {len(records)} publicadas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
