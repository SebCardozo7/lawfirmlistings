#!/usr/bin/env python3
"""
Aggregate the federal count of law offices into a data file a guide can render.

The companion to scripts/fetch_register_stats.py, and a different question. That one counts
lawyers, from the state's register of admissions. This one counts law offices, from the federal
payroll record, and the two disagree in a way that is the point of the article: a state can hold
more licensed attorneys than its law firms employ, because a licence is not a job.

Source: the Quarterly Census of Employment and Wages, published by the U.S. Bureau of Labor
Statistics. QCEW counts establishments that report payroll, so a solo practitioner with no
employees may not appear, and the count is of offices rather than of firms: a firm with four
offices is four establishments. Both limits are stated on the page.

    https://www.bls.gov/cew/
    https://data.bls.gov/cew/doc/access/csv_data_slices.htm

Chosen over the Census Bureau's County Business Patterns, which measures the same thing, because
CBP now requires an API key and QCEW's open data slices need none. Nobody should have to register
for anything to reproduce a figure on this site.

NAICS 541110 is Offices of Lawyers. 5411 is Legal Services, which also holds title abstract
offices, notaries and process servers, and the gap between the two is reported rather than
hidden: it is the part of the legal economy that is not a law firm.

Usage:
    python scripts/fetch_firm_stats.py                  # NY, prints and writes
    python scripts/fetch_firm_stats.py --state NY --years 8 --dry-run
"""
from __future__ import annotations

import argparse
import csv
import datetime
import io
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "research"
UA = "LFL-research/1.0 (+https://lawfirmlistings.com; public statistics aggregation)"
LF = chr(10)

QCEW_AREA = "https://data.bls.gov/cew/data/api/%s/a/area/%s.csv"
QCEW_INDUSTRY = "https://data.bls.gov/cew/data/api/%s/a/industry/%s.csv"
AREA_TITLES = "https://data.bls.gov/cew/doc/titles/area/area_titles.csv"

LAW_OFFICES = "541110"      # Offices of Lawyers
LEGAL_SERVICES = "5411"     # Legal Services, the wider industry
PRIVATE = "5"               # own_code: private ownership

STATES = {
    "NY": {"fips": "36000", "name": "New York", "prefix": "36"},
    "FL": {"fips": "12000", "name": "Florida", "prefix": "12"},
    "TX": {"fips": "48000", "name": "Texas", "prefix": "48"},
    "MA": {"fips": "25000", "name": "Massachusetts", "prefix": "25"},
    "MD": {"fips": "24000", "name": "Maryland", "prefix": "24"},
    "OR": {"fips": "41000", "name": "Oregon", "prefix": "41"},
    "IN": {"fips": "18000", "name": "Indiana", "prefix": "18"},
}

# A figure published as a document rather than as data, kept apart so a reader can tell what we
# computed from what we are quoting.
CITATIONS = [
    {
        "label": "Median annual wage, lawyers, United States",
        "value": 159670,
        "who": "U.S. Bureau of Labor Statistics",
        "what": "Occupational Outlook Handbook, May 2025",
        "url": "https://www.bls.gov/ooh/legal/lawyers.htm",
        "read_at": "2026-09-21",
    },
]


def rows(url: str) -> list[dict]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return list(csv.DictReader(io.StringIO(r.read().decode("utf-8", "replace"))))


def num(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except ValueError:
        return 0


def area_names() -> dict[str, str]:
    """FIPS to the title BLS gives it, so a county is named rather than numbered."""
    out = {}
    for row in rows(AREA_TITLES):
        code = (row.get("area_fips") or "").strip()
        title = (row.get("area_title") or "").strip()
        if code and title:
            out[code] = title
    return out


def state_year(fips: str, year: int) -> dict | None:
    """One year of the state's own totals, for both industry definitions."""
    try:
        data = rows(QCEW_AREA % (year, fips))
    except urllib.error.HTTPError:
        return None
    found = {}
    for row in data:
        if row.get("own_code") != PRIVATE:
            continue
        code = row.get("industry_code")
        if code in (LAW_OFFICES, LEGAL_SERVICES):
            found[code] = {
                "establishments": num(row.get("annual_avg_estabs")),
                "employment": num(row.get("annual_avg_emplvl")),
                "annual_wages": num(row.get("total_annual_wages")),
                "avg_weekly_wage": num(row.get("annual_avg_wkly_wage")),
            }
    if LAW_OFFICES not in found:
        return None
    return {"year": year, "law_offices": found[LAW_OFFICES],
            "legal_services": found.get(LEGAL_SERVICES)}


def counties(prefix: str, year: int, names: dict[str, str]) -> list[dict]:
    out = []
    for row in rows(QCEW_INDUSTRY % (year, LAW_OFFICES)):
        fips = row.get("area_fips") or ""
        if not fips.startswith(prefix) or fips.endswith("000") or row.get("own_code") != PRIVATE:
            continue
        estabs = num(row.get("annual_avg_estabs"))
        if not estabs:
            continue
        title = names.get(fips, fips)
        out.append({
            "fips": fips,
            # BLS writes "New York, New York"; the county is the first half of that.
            "county": title.split(",")[0].strip(),
            "title": title,
            "establishments": estabs,
            "employment": num(row.get("annual_avg_emplvl")),
            "avg_weekly_wage": num(row.get("annual_avg_wkly_wage")),
            "unallocated": fips.endswith("999"),
        })
    out.sort(key=lambda r: -r["establishments"])
    return out


def measure(code: str, years: int) -> dict:
    spec = STATES[code]
    names = area_names()
    this_year = datetime.date.today().year
    series = []
    # Walk back from this year until a year answers, then take the window from there. QCEW
    # publishes annual averages a year or more behind, and hardcoding "last year" breaks every
    # January.
    latest = None
    for year in range(this_year, this_year - 4, -1):
        got = state_year(spec["fips"], year)
        if got:
            latest = year
            break
    if latest is None:
        raise SystemExit("QCEW answered for no recent year; check the endpoint")
    for year in range(latest - years + 1, latest + 1):
        got = state_year(spec["fips"], year)
        if got:
            series.append(got)
            print("%d  offices %6d  employment %7d  avg weekly wage $%s"
                  % (year, got["law_offices"]["establishments"],
                     got["law_offices"]["employment"],
                     "{:,}".format(got["law_offices"]["avg_weekly_wage"])))
    by_county = counties(spec["prefix"], latest, names)
    print()
    for row in by_county[:12]:
        print("   %-24s offices %5d  employment %7d  $%s/week"
              % (row["county"][:24], row["establishments"], row["employment"],
                 "{:,}".format(row["avg_weekly_wage"])))
    return {
        "state": code,
        "state_name": spec["name"],
        "latest_year": latest,
        "measured_at": datetime.date.today().isoformat(),
        "dataset": ("Quarterly Census of Employment and Wages, annual averages, private "
                    "ownership, NAICS 541110 Offices of Lawyers"),
        "publisher": "the U.S. Bureau of Labor Statistics",
        "landing": "https://www.bls.gov/cew/",
        "series": series,
        "counties": by_county,
        "citations": CITATIONS,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", default="NY", choices=sorted(STATES))
    ap.add_argument("--years", type=int, default=10)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    data = measure(args.state, args.years)
    if args.dry_run:
        print("\ndry run, nothing written")
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / ("law-offices-%s.json" % args.state.lower())
    io.open(dest, "w", encoding="utf-8", newline=LF).write(
        json.dumps(data, ensure_ascii=False, indent=2) + LF)
    print("\nwritten to %s" % dest.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
