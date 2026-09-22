#!/usr/bin/env python3
"""
Record the published lawyer hourly rate tables into src/data/research/.

Why this is a transcription and not a fetcher. Every other research file in this directory is
written by a script that queries an open dataset, so re-running it refreshes the page. There is
no dataset behind these numbers. Clio computes them from its own customers' billing records and
publishes the result as a web page; there is no API, no download, and the page blocks a plain
HTTP client. So this file does the only honest thing available: it records what the publisher's
page said on the day it was read, with the publisher, the page, and the date attached, and the
article presents every figure as somebody else's measurement rather than as one of ours.

That is the same treatment the ABA and Bureau of Labor Statistics figures already get in
attorney-register-ny.json. The rule this repository actually enforces is that a figure about our
firms must be computed from our firms; a figure about somebody else's population must carry the
name of whoever counted it.

Re-running this after the publisher updates its page is a hand edit of the tables below and a new
read_at. Nothing here should ever be edited without moving that date.

Usage:
    python scripts/write_rate_tables.py
"""
from __future__ import annotations

import datetime
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "research" / "lawyer-hourly-rates.json"
LF = chr(10)

READ_AT = "2026-09-22"
SOURCE = {
    "who": "Clio",
    "what": "Compare Average Lawyer Hourly Rate by State, updated March 2026",
    "url": "https://www.clio.com/resources/legal-trends/compare-lawyer-rates/",
    "covers": 2025,
    "method": ("aggregated and anonymized billing data from tens of thousands of legal "
               "professionals using Clio, published annually in the Legal Trends Report"),
    "read_at": READ_AT,
}

# state, lawyer, non-lawyer, firm blended, then the same three adjusted for regional price
# parity. The publisher gives no adjusted row for the national average, so neither do we.
STATES = [
    ("Alabama", "AL", 248, 141, 228, 275, 157, 253),
    ("Alaska", "AK", 327, 196, 290, 321, 193, 285),
    ("Arizona", "AZ", 324, 179, 279, 321, 177, 276),
    ("Arkansas", "AR", 269, 146, 250, 311, 169, 288),
    ("California", "CA", 422, 214, 361, 375, 190, 321),
    ("Colorado", "CO", 321, 177, 287, 317, 174, 283),
    ("Connecticut", "CT", 406, 224, 357, 391, 216, 345),
    ("Delaware", "DE", 475, 226, 419, 478, 227, 422),
    ("District of Columbia", "DC", 492, 224, 456, 444, 202, 411),
    ("Florida", "FL", 353, 183, 305, 342, 177, 295),
    ("Georgia", "GA", 369, 205, 325, 381, 212, 336),
    ("Hawaii", "HI", 339, 172, 305, 312, 159, 281),
    ("Idaho", "ID", 305, 153, 271, 334, 168, 297),
    ("Illinois", "IL", 350, 204, 325, 354, 206, 329),
    ("Indiana", "IN", 291, 171, 267, 316, 185, 290),
    ("Iowa", "IA", 252, 151, 234, 284, 170, 264),
    ("Kansas", "KS", 312, 159, 287, 346, 177, 319),
    ("Kentucky", "KY", 245, 135, 226, 271, 149, 250),
    ("Louisiana", "LA", 266, 119, 242, 302, 135, 274),
    ("Maine", "ME", 254, 167, 238, 261, 172, 245),
    ("Maryland", "MD", 362, 200, 329, 349, 193, 317),
    ("Massachusetts", "MA", 335, 237, 312, 309, 219, 288),
    ("Michigan", "MI", 297, 159, 270, 316, 169, 286),
    ("Minnesota", "MN", 326, 176, 293, 332, 178, 298),
    ("Mississippi", "MS", 249, 142, 225, 285, 163, 258),
    ("Missouri", "MO", 300, 149, 269, 327, 163, 293),
    ("Montana", "MT", 261, 142, 240, 289, 157, 266),
    ("Nebraska", "NE", 260, 156, 235, 287, 173, 260),
    ("Nevada", "NV", 326, 172, 285, 336, 178, 293),
    ("New Hampshire", "NH", 295, 200, 273, 280, 190, 260),
    ("New Jersey", "NJ", 363, 196, 328, 334, 180, 301),
    ("New Mexico", "NM", 280, 144, 242, 310, 160, 267),
    ("New York", "NY", 426, 227, 393, 395, 211, 365),
    ("North Carolina", "NC", 316, 164, 277, 336, 174, 294),
    ("North Dakota", "ND", 324, 210, 301, 366, 237, 340),
    ("Ohio", "OH", 276, 146, 250, 301, 158, 272),
    ("Oklahoma", "OK", 280, 145, 256, 318, 164, 290),
    ("Oregon", "OR", 325, 169, 284, 311, 161, 271),
    ("Pennsylvania", "PA", 311, 197, 292, 319, 202, 299),
    ("Rhode Island", "RI", 369, 207, 349, 364, 204, 344),
    ("South Carolina", "SC", 300, 145, 254, 322, 156, 273),
    ("South Dakota", "SD", 252, 155, 242, 287, 176, 274),
    ("Tennessee", "TN", 299, 156, 270, 323, 168, 292),
    ("Texas", "TX", 366, 185, 314, 377, 190, 323),
    ("Utah", "UT", 337, 174, 302, 355, 183, 318),
    ("Vermont", "VT", 282, 131, 254, 291, 136, 263),
    ("Virginia", "VA", 380, 201, 344, 377, 200, 341),
    ("Washington", "WA", 346, 187, 301, 318, 173, 277),
    ("West Virginia", "WV", 196, 118, 186, 218, 131, 207),
    ("Wisconsin", "WI", 278, 191, 264, 298, 205, 283),
    ("Wyoming", "WY", 309, 138, 280, 340, 152, 308),
]

PRACTICES = [
    ("Administrative Law", 328, 150, 278),
    ("Appellate", 324, 165, 307),
    ("Bankruptcy", 460, 212, 394),
    ("Business Formation / Compliance", 378, 190, 353),
    ("Civil Litigation", 353, 173, 321),
    ("Civil Rights / Constitutional Law", 377, 171, 331),
    ("Collections & Debt", 320, 174, 280),
    ("Commercial / Sale of Goods", 414, 192, 395),
    ("Construction", 313, 154, 284),
    ("Contracts", 373, 193, 356),
    ("Corporate Litigation", 461, 224, 432),
    ("Criminal", 216, 186, 211),
    ("Elder Law", 292, 178, 257),
    ("Employment / Labor", 387, 181, 354),
    ("Family", 344, 183, 295),
    ("Government", 245, 162, 236),
    ("Immigration", 366, 314, 343),
    ("Insurance", 220, 116, 205),
    ("Intellectual Property", 453, 241, 409),
    ("Juvenile", 135, 147, 136),
    ("Mediation / Arbitration", 371, 216, 348),
    ("Medical Malpractice", 249, 132, 223),
    ("Personal Injury", 337, 164, 287),
    ("Real Estate", 377, 200, 348),
    ("Small Claims", 265, 258, 263),
    ("Tax", 444, 236, 395),
    ("Traffic Offenses", 326, 312, 322),
    ("Trusts", 397, 203, 333),
    ("Wills & Estates", 371, 194, 316),
    ("Workers Compensation", 180, 133, 170),
]

# The three rates that stand between an hourly rate and the money. Clio publishes these as its
# law firm benchmarks, from the same billing records as the rate tables, so the two can be
# multiplied without mixing populations.
FUNNEL = {
    "source": {
        "who": "Clio",
        "what": "Law Firm KPIs and benchmarks, 2025",
        "url": "https://www.clio.com/resources/legal-trends/benchmarks/",
        "read_at": READ_AT,
    },
    "hours_in_day": 8,
    "steps": [
        {"key": "worked", "label": "Hours worked", "hours": 8.0, "rate": None,
         "note": "the day the lawyer turns up for"},
        {"key": "utilization", "label": "Recorded as billable", "hours": 3.0, "rate": 38,
         "note": "utilization rate: the share of the working day that becomes billable time"},
        {"key": "realization", "label": "Actually invoiced", "hours": 2.6, "rate": 88,
         "note": "realization rate: the share of billable time that reaches an invoice"},
        {"key": "collection", "label": "Actually paid", "hours": 2.4, "rate": 93,
         "note": "collection rate: the share of invoiced time the client pays"},
    ],
    "utilization_history": [
        {"year": 2019, "value": 30},
        {"year": 2023, "value": 35},
        {"year": 2024, "value": 37},
        {"year": 2025, "value": 38},
    ],
    "lockup_days": {"realization": 43, "collection": 32, "total": 93},
}

CITATIONS = [
    {
        "label": "Median annual wage, lawyers, United States",
        "value": 159670,
        "unit": "dollars per year",
        "who": "U.S. Bureau of Labor Statistics",
        "what": "Occupational Outlook Handbook, May 2025",
        "url": "https://www.bls.gov/ooh/legal/lawyers.htm",
        "note": ("What a lawyer earns, rather than what a lawyer charges. The Bureau surveys "
                 "employers, so it counts salaried lawyers and misses the owner of a firm."),
        "read_at": READ_AT,
    },
    {
        "label": "Fees must be reasonable",
        "value": None,
        "who": "American Bar Association",
        "what": "Model Rules of Professional Conduct, Rule 1.5",
        "url": ("https://www.americanbar.org/groups/professional_responsibility/publications/"
                "model_rules_of_professional_conduct/rule_1_5_fees/"),
        "note": ("The rule lists eight factors for judging a fee, and the prevailing rate in the "
                 "locality for similar services is one of them. It sets no number."),
        "read_at": READ_AT,
    },
]


def main() -> int:
    doc = {
        "source": SOURCE,
        "measured_at": READ_AT,
        "national": {"lawyer": 349, "non_lawyer": 187, "firm": 311, "yoy_percent": 4},
        "non_lawyer_label": ("paralegals and other unlicensed staff whose time appears on the "
                             "same bill"),
        "states": [
            {"state": s, "code": c,
             "lawyer": lw, "non_lawyer": nl, "firm": fm,
             "adjusted_lawyer": alw, "adjusted_non_lawyer": anl, "adjusted_firm": afm}
            for (s, c, lw, nl, fm, alw, anl, afm) in STATES
        ],
        "adjustment": ("Adjusted rates apply the Bureau of Economic Analysis regional price "
                       "parities, so a rate is expressed in what it buys where it is charged."),
        "practices": [
            {"practice": p, "lawyer": lw, "non_lawyer": nl, "firm": fm}
            for (p, lw, nl, fm) in PRACTICES
        ],
        "funnel": FUNNEL,
        "citations": CITATIONS,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    io.open(OUT, "w", encoding="utf-8", newline=LF).write(
        json.dumps(doc, ensure_ascii=False, indent=2) + LF)
    print("%d states, %d practice areas, %d funnel steps -> %s"
          % (len(STATES), len(PRACTICES), len(FUNNEL["steps"]), OUT.relative_to(ROOT)))
    print("source: %s, %s, read %s" % (SOURCE["who"], SOURCE["what"], READ_AT))
    print("today is %s" % datetime.date.today().isoformat())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
