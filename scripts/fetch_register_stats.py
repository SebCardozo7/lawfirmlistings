#!/usr/bin/env python3
"""
Aggregate a state attorney register into a data file a guide can render.

The nine guides on this site are studies of our own measurements, and every figure in them is
computed from the firms collection at build time so the page cannot drift from the data. A
reference article about a public register is a different kind of page: its figures come from
somebody else's dataset, and the rule that no figure may be hand-typed still has to hold.

So the figures are fetched here and written to src/data/research/, one file per state, each
aggregate carrying the exact query that produced it. The page renders the file. Re-running this
updates every number on it, and opening the same article for another state is a second run
rather than a second article's worth of typing.

Why the counts disagree, which is the thing the article is about. "How many lawyers are in New
York" has at least four answers in this one dataset, depending on whether you mean every record
ever created, every registration currently in force, every person with a New York address, or
the intersection. They are not degrees of accuracy. They are different questions.

Third-party figures, the ABA's and the Bureau of Labor Statistics', are not fetched: they are
published as documents rather than as data. They live in the CITATIONS block with their source
and the date they were read, and the page marks them as somebody else's count rather than ours.

Source: NYS Attorney Registrations, dataset eqw2-r5nb on data.ny.gov, published by the New York
State Unified Court System.

Usage:
    python scripts/fetch_register_stats.py            # NY, prints and writes
    python scripts/fetch_register_stats.py --dry-run
"""
from __future__ import annotations

import argparse
import datetime
import io
import json
import sys
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "research"
UA = "LFL-research/1.0 (+https://lawfirmlistings.com; public register aggregation)"
LF = chr(10)

STATES = {
    "NY": {
        "endpoint": "https://data.ny.gov/resource/eqw2-r5nb.json",
        "dataset": "NYS Attorney Registrations (data.ny.gov eqw2-r5nb)",
        "publisher": "the New York State Unified Court System",
        "landing": "https://data.ny.gov/Transparency/NYS-Attorney-Registrations/eqw2-r5nb",
        "state_name": "New York",
        "active_status": "Currently registered",
    },
}

# Counts somebody else published. Not fetched, because they are in documents rather than in data,
# and separated from everything above because a reader should be able to tell which numbers we
# computed and which we are quoting.
CITATIONS = [
    {
        "label": "Lawyers resident in New York",
        "value": 190015,
        "who": "American Bar Association",
        "what": "National Lawyer Population Survey",
        "url": "https://nysba.org/wp-content/uploads/2025/11/2024-aba-nlps.pdf",
        "note": "The highest count of any state. California is second at 181,048.",
        "read_at": "2026-09-21",
    },
    {
        "label": "Median annual wage, lawyers, United States",
        "value": 159670,
        "who": "U.S. Bureau of Labor Statistics",
        "what": "Occupational Outlook Handbook, May 2025",
        "url": "https://www.bls.gov/ooh/legal/lawyers.htm",
        "note": "The Bureau counts people employed as lawyers, which is a third question again: "
                "a licence is not a job.",
        "read_at": "2026-09-21",
    },
]


def fetch(endpoint: str, params: dict) -> list[dict]:
    url = endpoint + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def one(endpoint: str, params: dict, key: str = "count_1") -> int:
    rows = fetch(endpoint, params)
    return int(rows[0][key]) if rows and rows[0].get(key) is not None else 0


def measure(code: str) -> dict:
    spec = STATES[code]
    end = spec["endpoint"]
    active = spec["active_status"]
    today = datetime.date.today().isoformat()
    out: dict = {
        "state": code,
        "state_name": spec["state_name"],
        "dataset": spec["dataset"],
        "publisher": spec["publisher"],
        "landing": spec["landing"],
        "measured_at": today,
        "counts": {},
        "status": [],
        "counties": [],
        "decades": [],
        "schools": [],
        "citations": CITATIONS,
    }

    # The four answers. Each carries its own filter so a reader can re-ask it.
    asks = [
        ("records", "Registration records in the dataset", {}),
        ("current", "Registrations currently in force", {"$where": f"status='{active}'"}),
        ("in_state", "Records with a %s address" % spec["state_name"],
         {"$where": f"upper(state)='{code}'"}),
        ("current_in_state", "Currently registered, with a %s address" % spec["state_name"],
         {"$where": f"upper(state)='{code}' AND status='{active}'"}),
    ]
    for key, label, where in asks:
        params = {"$select": "count(1)"}
        params.update(where)
        out["counts"][key] = {
            "label": label,
            "value": one(end, params),
            "query": where.get("$where", "no filter"),
        }
        print("%-44s %8d" % (label, out["counts"][key]["value"]))

    print()
    for row in fetch(end, {"$select": "status,count(1)", "$group": "status",
                           "$order": "count_1 desc"}):
        if not row.get("status"):
            continue
        out["status"].append({"status": row["status"], "count": int(row["count_1"])})
        print("   %-44s %8d" % (row["status"], int(row["count_1"])))

    print()
    for row in fetch(end, {"$select": "county,count(1)", "$group": "county",
                           "$order": "count_1 desc",
                           "$where": f"upper(state)='{code}' AND status='{active}'"})[:15]:
        if not row.get("county"):
            continue
        out["counties"].append({"county": row["county"], "count": int(row["count_1"])})
        print("   %-24s %8d" % (row["county"], int(row["count_1"])))

    # Admission decade, from the year the register carries. A decade rather than a year: the
    # yearly series is noisy and a decade is what the shape is actually about.
    print()
    dec: Counter = Counter()
    for row in fetch(end, {"$select": "year_admitted,count(1)", "$group": "year_admitted",
                           "$where": f"status='{active}' AND year_admitted IS NOT NULL",
                           "$order": "year_admitted"}):
        try:
            year = int(row["year_admitted"])
        except (TypeError, ValueError):
            continue
        dec[(year // 10) * 10] += int(row["count_1"])
    for decade in sorted(dec):
        out["decades"].append({"decade": decade, "count": dec[decade]})
        print("   %ss %8d" % (decade, dec[decade]))

    out["counts"]["earliest_admission"] = {
        "label": "Earliest admission year still currently registered",
        "value": one(end, {"$select": "min(year_admitted)", "$where": f"status='{active}'"},
                     "min_year_admitted"),
        "query": f"min(year_admitted) where status='{active}'",
    }
    # How many distinct spellings of a law school the register holds. This is a fact about the
    # dataset rather than about the profession, and it belongs in the article for the same reason
    # our own matching problems do: one school appears under several names, so any count by
    # school is a count of spellings.
    out["counts"]["school_spellings"] = {
        "label": "Distinct law school spellings in the dataset",
        "value": one(end, {"$select": "count(distinct law_school)"},
                     "count_distinct_law_school"),
        "query": "count(distinct law_school)",
    }
    print()
    for row in fetch(end, {"$select": "law_school,count(1)", "$group": "law_school",
                           "$where": f"status='{active}' AND law_school IS NOT NULL",
                           "$order": "count_1 desc"})[:12]:
        out["schools"].append({"school": row["law_school"], "count": int(row["count_1"])})
        print("   %-50s %7d" % (row["law_school"][:50], int(row["count_1"])))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", default="NY", choices=sorted(STATES))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    data = measure(args.state)
    if args.dry_run:
        print("\ndry run, nothing written")
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / ("attorney-register-%s.json" % args.state.lower())
    io.open(dest, "w", encoding="utf-8", newline=LF).write(
        json.dumps(data, ensure_ascii=False, indent=2) + LF)
    print("\nwritten to %s" % dest.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
