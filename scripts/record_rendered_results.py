#!/usr/bin/env python3
"""
Settle pillar B for the firms whose results page our crawler could read but not interpret.

scripts/crawl_results.py fetches served HTML. Where a page came back with text on it and no
figure and no mention of a settlement, verdict or recovery, it wrote the only honest thing it
could: "whether the results are held back from the served HTML or the page carries none is not
something this check can tell", and left B1, B2 and B3 pending. Ten firms sat in that state.

Each of those ten pages was then opened in a real browser, which runs the JavaScript the crawler
does not, and the ambiguity resolved five ways. Only one of them is recorded here.

  The page renders and carries no results. Five firms. That is a finding about the firm, not a
  gap in our data, and it is what this script writes: readable, zero results. It costs those
  firms the fifteen points of pillar B, which is the correct price for publishing a page headed
  "Results" with nothing on it.

  The page carries real results and our crawler was refused. Godosky & Gentile returns 403 to us
  and renders nine verdicts and settlements to a person. Nothing is written here, because the
  figures would have to be typed in by hand and no figure in this repository is hand-typed. It is
  a crawler problem and it is recorded as one in docs/market-queue.md.

  The URL we hold is a 404. Two firms. Our record is wrong, so the gate stays pending: that is
  work we owe, not a finding.

  The URL we hold is an index of other results pages. One firm. Same answer: our crawl needs a
  second level, and until it has one this stays pending.

  The page carries a template nobody filled in. Metro Injury Law publishes nine headings reading
  "Tax Consultancy", "Trade and Markets" and "Marriage Agreements". Counting those as results
  would be worse than counting none, so this stays pending and is noted for a person.

Written as its own script rather than folded into crawl_results.py because it records a reading
taken by hand in a browser on one day. It is not part of the monthly run and must not become one:
the real fix is a crawler that renders, and this file should be deleted when that exists.

Usage:
    python scripts/record_rendered_results.py --write
"""
from __future__ import annotations

import argparse
import glob
import io
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"
LF = chr(10)
TODAY = date.today().isoformat()

SOURCE = ("the firm's own results page, opened in a browser so its JavaScript ran, because our "
          "crawler reads served HTML and could not tell an empty page from a deferred one")

# Only the pages that rendered and carried nothing. What each one did show is recorded, because
# "nothing" is a claim and a reader is entitled to know what was actually on the screen.
EMPTY = {
    "greenstein-pittari-llp": (
        "The page at /results/ renders a heading, the site navigation, a contact form and seven "
        "office addresses. It names no case, states no figure and mentions no settlement, verdict "
        "or recovery."),
    "malloy-law-offices-llc": (
        "The page at /results/ renders the word Results and nothing else."),
    "lipsitz-green-scime-cambria": (
        "The page at /results/ renders three paragraphs about obtaining the best possible results "
        "for clients and directs the reader to the practice pages. It names no case and states no "
        "figure. It does carry the prior-results disclaimer."),
    "ugalde-rzonca-llp": (
        "The page at /case-results/ renders the words Coming Soon and the prior-results "
        "disclaimer."),
    "foti-law": (
        "The page at /results/ renders an empty archive: a heading, and no entries under it."),
}

# Carries the disclaimer even though it carries no results. Kept separate because the disclaimer
# is a real thing the page does and B3 reads it.
HAS_DISCLAIMER = {"lipsitz-green-scime-cambria", "ugalde-rzonca-llp"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    paths = {Path(p).stem: Path(p) for p in glob.glob(str(FIRMS / "*" / "*.json"))}
    written = 0
    for slug, evidence in EMPTY.items():
        path = paths.get(slug)
        if not path:
            print("%-32s NOT FOUND" % slug)
            continue
        firm = json.loads(path.read_text(encoding="utf-8"))
        firm["results_published"] = {
            "readable": True,
            "count": 0,
            "amounts": [],
            "case_types": [],
            "disclaimer": slug in HAS_DISCLAIMER,
            "venues": [],
            "why": evidence,
            "source": SOURCE,
            "checked_at": TODAY,
        }
        print("%-32s 0 results · disclaimer %s" % (slug, "yes" if slug in HAS_DISCLAIMER else "no"))
        if args.write:
            io.open(path, "w", encoding="utf-8", newline=LF).write(
                json.dumps(firm, indent=2, ensure_ascii=False) + LF)
            written += 1

    print()
    print("%d profile(s) %s" % (written if args.write else len(EMPTY),
                                "written" if args.write else "would be written; pass --write"))
    print("Run scripts/score.py to recompute. Pillar B moves from pending to a measured zero for")
    print("these firms, which lowers their score, and that is the point: a page headed Results")
    print("with nothing on it is a finding rather than a gap.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
