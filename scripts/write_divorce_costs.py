#!/usr/bin/env python3
"""
Record what a New York divorce costs, from the two kinds of source that actually know.

The first kind is the statute. New York's court fees are not an estimate and not a survey: the
amounts are set in the Civil Practice Law and Rules, every line below carries the section that
sets it, and anybody can read the section and check the figure. That is the only part of the
answer to "how much does a divorce cost" that has an exact number, and every page competing on
this search either buries it or quotes it without saying where it comes from.

The second kind is a survey, and it is weaker on purpose. Martindale-Nolo asked people who had
just been divorced what they paid. It is self-selected (respondents had been looking for a lawyer
online), it is national rather than New York, and it is several years old. All three limits are
stated on the page rather than hidden, because the alternative is what everybody else publishes:
a single "average cost of divorce in New York" with no method attached at all.

What this file does not contain: an average we made up, and any figure from a law firm's own
marketing page. The rates that turn hours into money live in lawyer-hourly-rates.json and are
read from there, so the two articles cannot disagree.

Usage:
    python scripts/write_divorce_costs.py
"""
from __future__ import annotations

import datetime
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "research" / "divorce-cost-ny.json"
LF = chr(10)

READ_AT = "2026-09-22"
CPLR = "https://www.nysenate.gov/legislation/laws/CVP/"

# Every fee a divorce cannot avoid, with the section that sets it. The index number fee is three
# separate amounts in one statute, which is why the page prints the arithmetic rather than the
# total: $190 plus a $5 records management fee plus a $15 cultural education fee.
MANDATORY = [
    {
        "label": "Index number",
        "amount": 210,
        "section": "CPLR 8018(a)",
        "url": CPLR + "8018",
        "note": ("$190 for the index number, plus $5 to the records management fund and $15 to "
                 "the cultural education account. Buying the index number is what starts the case."),
    },
    {
        "label": "Request for Judicial Intervention",
        "amount": 95,
        "section": "CPLR 8020(a)",
        "url": CPLR + "8020",
        "note": "The filing that puts the case in front of a judge.",
    },
    {
        "label": "Note of issue",
        "amount": 30,
        "section": "CPLR 8020(a)",
        "url": CPLR + "8020",
        "note": ("The additional amount for placing the cause on the calendar. The statute sets "
                 "$125 for the two together."),
    },
]

# The fees that exist only because somebody disagreed. This is the part of the price list that
# makes the court's own incentive visible.
CONDITIONAL = [
    {"label": "Each motion or cross motion", "amount": 45, "section": "CPLR 8020(a)",
     "url": CPLR + "8020",
     "note": "Charged every time either side asks the judge to decide something."},
    {"label": "Demand for a jury trial", "amount": 65, "section": "CPLR 8020(b)",
     "url": CPLR + "8020",
     "note": ("Only the grounds for the divorce can go to a jury, and since New York added a "
              "no-fault ground in 2010 almost nothing does.")},
    {"label": "Filing a stipulation of settlement", "amount": 35, "section": "CPLR 8020(c)",
     "url": CPLR + "8020",
     "note": "The fee for agreeing, which is the cheapest line on the list."},
    {"label": "Certified copy of the judgment", "amount": 8, "section": "CPLR 8020(d)",
     "url": CPLR + "8020",
     "note": ("$8 in New York City, the Bronx, Kings, Queens, Richmond, Nassau, Suffolk, "
              "Westchester and Rockland; $4 in every other county. Most people need at least "
              "one, to change a name or a title or a beneficiary.")},
    {"label": "Certificate of exemplification", "amount": 25, "section": "CPLR 8020(d)",
     "url": CPLR + "8020",
     "note": "$25 in the same counties, $10 elsewhere. Needed to use the judgment out of state."},
]

WAIVER = {
    "section": "CPLR 1101",
    "url": CPLR + "1101",
    "title": "Motion to waive costs, fees, and expenses",
    "note": ("A party who swears out an affidavit of their income and assets showing they lack "
             "sufficient means may be relieved of the costs, fees and expenses entirely. A party "
             "represented by a legal aid society or a nonprofit legal services organisation gets "
             "the waiver without having to move for it."),
}

# The survey. Every limit it has is recorded beside it, because the limits are the reason this
# page presents it as one input to a model rather than as the answer.
SURVEY = {
    "who": "Martindale-Nolo Research",
    "what": "divorce study of readers who had recently been through a divorce",
    "url": "https://www.nolo.com/legal-encyclopedia/ctp/cost-of-divorce.html",
    "year": 2019,
    "scope": "United States",
    "read_at": READ_AT,
    "limits": [
        "Respondents volunteered: they had given an email address while researching how to hire "
        "a divorce lawyer, so the sample is people who were shopping for one.",
        "It is national. Nothing in it is specific to New York.",
        "It reports what people remembered paying, not what any firm billed.",
    ],
    "average_rate": 270,
    "rate_spread": [
        {"label": "Paid $200 to $300 an hour", "share": 69},
        {"label": "Paid $400 an hour or more", "share": 20},
        {"label": "Paid around $100 an hour", "share": 11},
    ],
    # The four outcomes, in the order a case can go. Every one of them is a total cost including
    # fees, which is what makes them convertible into hours.
    "outcomes": [
        {"key": "uncontested", "label": "Uncontested, with a lawyer", "total": 4100,
         "note": "Nothing in dispute by the time the lawyer was hired"},
        {"key": "settled", "label": "Disputed, then settled", "total": 10600,
         "note": "Issues in dispute at the start, all of them agreed before trial"},
        {"key": "trial_one", "label": "Trial on one issue", "total": 20400,
         "note": "One issue the parties could not agree, decided by a judge"},
        {"key": "trial_many", "label": "Trial on two or more issues", "total": 23300,
         "note": "More than one issue decided by a judge"},
    ],
}


def main() -> int:
    doc = {
        "state": "NY",
        "state_name": "New York",
        "measured_at": READ_AT,
        "court_fees": {
            "publisher": "New York State, Civil Practice Law and Rules",
            "read_at": READ_AT,
            "mandatory": MANDATORY,
            "mandatory_total": sum(f["amount"] for f in MANDATORY),
            "conditional": CONDITIONAL,
            "waiver": WAIVER,
            "note": ("Set by statute, so these are the only figures on the subject that are not "
                     "an estimate. A county clerk may charge for copies and searches on top."),
        },
        "survey": SURVEY,
        "rates_from": ("src/data/research/lawyer-hourly-rates.json, so the rate used to turn "
                       "hours into money is the same one the hourly rate article publishes"),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    io.open(OUT, "w", encoding="utf-8", newline=LF).write(
        json.dumps(doc, ensure_ascii=False, indent=2) + LF)
    print("%d mandatory fees totalling $%d, %d conditional, %d survey outcomes -> %s"
          % (len(MANDATORY), doc["court_fees"]["mandatory_total"], len(CONDITIONAL),
             len(SURVEY["outcomes"]), OUT.relative_to(ROOT)))
    print("today is %s" % datetime.date.today().isoformat())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
