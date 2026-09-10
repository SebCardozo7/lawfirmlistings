#!/usr/bin/env python3
"""
Read what each firm publishes about its own case results: the input for pillar B.

Pillar B was written as "Verified Outcomes", checked against court records. That needs a person
reading dockets, so it scored zero for every firm in the directory, which meant the score was
reporting our missing pipeline as the firm's result and put certification out of reach for
everyone. It is now "Published Outcomes", and it measures something we can actually read: how
openly a firm accounts for its own results.

That is a weaker claim than verification and it is labelled as one everywhere it appears. It is
also a real signal to a reader, and a defensible one: New York's advertising rules already
require a firm's own claims about results to be truthful and to carry a disclaimer, so a firm
publishing false figures has a problem with its regulator, not only with us. We report what it
publishes; we do not endorse the figures.

What this extracts, all of it from the page the firm already publishes:

    count        how many distinct results are published
    amounts      the money values, where the firm states them
    case_types   the kinds of case the results are attributed to
    disclaimer   whether the page carries a "prior results do not guarantee" notice, which the
                 advertising rules effectively require and which none of the first four firms
                 checked had
    venues       courts or counties named, which is what separates a checkable result from a
                 headline figure
    readable     whether we actually read the page

`readable` matters more than it looks. A page we could not fetch leaves pillar B pending rather
than scoring zero, because a firm should not lose points for our failure to read its site. A page
we did read and which states no amounts is a real finding, not a gap.

Usage:
    python scripts/crawl_results.py                      # every staging record with a results page
    python scripts/crawl_results.py --domains shulman-hill.com --verbose
"""
from __future__ import annotations

import argparse
import glob
import io
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import date

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", line_buffering=True)

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = "LawFirmListingsBot/1.0 (+https://lawfirmlistings.com/methodology/)"
DELAY = 1.5
TIMEOUT = 40

# "$6,500,000" and "$6.5 million" are the same claim written two ways, and a firm uses both on
# one page. Both are captured and normalised to a number so they can be de-duplicated: the same
# figure repeated in a heading and a card is one result, not two.
MONEY = re.compile(
    r"\$\s?(\d[\d,]*(?:\.\d+)?)\s*(million|billion|m\b|k\b)?", re.I)

MULTIPLIER = {"million": 1_000_000, "m": 1_000_000, "billion": 1_000_000_000, "k": 1_000}

# A firm-wide total is not a case result, and it is the largest figure on the page, so left
# alone it becomes "the biggest result" and inflates the count by one. Shulman & Hill open
# their results page with "helped thousands of New Yorkers recover more than $1 billion in
# compensation", which is a claim about the practice rather than a case. These figures are
# kept, separately, because the claim is worth recording; they are just not results.
# Only a quantifier of multiplicity marks a total. "Recovered $5,100,000 for a construction
# worker" is one case, and treating the bare verb as an aggregate signal reclassified twenty-two
# of Shulman & Hill's individual results as firm-wide claims. What actually distinguishes a total
# is that it counts more than one case: "more than", "over", "combined", "in total".
AGGREGATE_BEFORE = re.compile(
    r"\b(?:more than|over|in excess of|upwards of|totall?ing|combined|collectively|"
    r"in total|thousands of|hundreds of)\b[^.$]{0,40}$", re.I)
AGGREGATE_AFTER = re.compile(
    r"^[^.$]{0,50}(?:in compensation|for (?:our|their) clients|in (?:verdicts|settlements)|"
    r"in total|recovered (?:for|on behalf)|in damages for clients)", re.I)

# The kinds of case a result gets attributed to. Deliberately the vocabulary a firm uses about
# itself rather than a taxonomy of ours.
CASE_TYPES = [
    ("construction", r"construction|scaffold|labor law|ladder|fall from"),
    ("motor vehicle", r"motor vehicle|car accident|auto accident|collision|rear[- ]end"),
    ("truck", r"truck|tractor[- ]trailer|18[- ]wheeler"),
    ("premises", r"premises|slip and fall|trip and fall|sidewalk|stairwell"),
    ("medical malpractice", r"malpractice|misdiagnos|surgical error|birth injury"),
    ("wrongful death", r"wrongful death|fatal"),
    ("workplace", r"workplace|work injury|workers[' ]?comp"),
    ("pedestrian", r"pedestrian|crosswalk"),
    ("product liability", r"product liability|defective"),
    ("municipal", r"municipal|city of new york|mta|nycha|transit"),
]

# The notice the advertising rules effectively require alongside published results.
DISCLAIMER = re.compile(
    r"prior results?|past results?|previous results?|do(?:es)? not guarantee|"
    r"no guarantee of|every case is different|results may vary|"
    r"each case (?:is|must be) (?:different|judged)", re.I)

# What makes a published result checkable rather than a headline: somewhere to look it up.
VENUE = re.compile(
    r"Supreme Court|County Court|Civil Court|Court of Claims|Index No\.?|Docket No\.?|"
    r"E\.?D\.?N\.?Y|S\.?D\.?N\.?Y|"
    r"(?:Kings|Queens|Bronx|Richmond|Nassau|Suffolk|Westchester|Rockland|Orange|Erie|Monroe)"
    r"\s+County|New York County", re.I)

# A result is usually introduced by one of these, which is how distinct results are counted on a
# page that states no figures at all.
RESULT_WORD = re.compile(r"settlement|verdict|recovery|recovered|award(?:ed)?|judgment", re.I)


def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            raw = resp.read(4_000_000)
            charset = resp.headers.get_content_charset() or "utf-8"
            return resp.status, raw.decode(charset, "replace"), resp.geturl()
    except urllib.error.HTTPError as exc:
        return exc.code, "", url
    except Exception:
        return 0, "", url


def robots_for(origin):
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(origin + "/robots.txt")
    status, body, _ = fetch(origin + "/robots.txt")
    # No robots.txt allows everything; a 4xx is not a disallow.
    rp.parse(body.splitlines() if status == 200 else [])
    return rp


def strip_tags(html):
    text = re.sub(r"(?s)<(script|style|noscript)\b.*?</\1>", " ", html)
    text = re.sub(r"(?s)<!--.*?-->", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def money_values(text):
    """(case results, firm-wide totals), both normalised and de-duplicated.

    The same amount written twice, once in a heading and once in a card, is one result. A
    figure surrounded by aggregate language is a claim about the practice and is separated
    out, because it is always the largest number on the page and would otherwise be reported
    as the firm's biggest case.
    """
    results, aggregates = set(), set()
    for match in MONEY.finditer(text):
        digits, unit = match.group(1), match.group(2)
        try:
            value = float(digits.replace(",", ""))
        except ValueError:
            continue
        if unit:
            value *= MULTIPLIER.get(unit.lower().rstrip("."), 1)
        # A published case result under ten thousand dollars is almost always a price, a fee
        # or a fragment of a phone number rather than a recovery.
        if value < 10_000:
            continue
        before = text[max(0, match.start() - 90):match.start()]
        after = text[match.end():match.end() + 70]
        if AGGREGATE_BEFORE.search(before) or AGGREGATE_AFTER.search(after):
            aggregates.add(int(value))
        else:
            results.add(int(value))
    # A figure that appears both ways on one page is a total: the aggregate reading wins.
    results -= aggregates
    return sorted(results, reverse=True), sorted(aggregates, reverse=True)


def extract(text):
    amounts, aggregates = money_values(text)
    types = [name for name, pattern in CASE_TYPES if re.search(pattern, text, re.I)]
    # How many results the page describes. Where figures are published that is the figure count;
    # where none are, it is how many times the page introduces a result, which is a weaker
    # count and is recorded as such.
    result_words = len(RESULT_WORD.findall(text))
    return {
        "count": len(amounts) or min(result_words, 40),
        "counted_from": "stated amounts" if amounts else "result headings",
        "amounts": amounts[:60],
        "largest": amounts[0] if amounts else None,
        "aggregate_claims": aggregates[:5],
        "case_types": types,
        "disclaimer": bool(DISCLAIMER.search(text)),
        "venues": sorted({v.strip() for v in VENUE.findall(text)})[:10],
        "text_length": len(text),
    }


def collect(domain, results_url, verbose=False):
    parsed = urllib.parse.urlparse(results_url)
    origin = parsed.scheme + "://" + parsed.netloc
    rp = robots_for(origin)
    time.sleep(DELAY)
    if not rp.can_fetch(UA, results_url):
        return {"readable": False, "why": "robots.txt disallows the results page",
                "url": results_url, "checked_at": date.today().isoformat()}
    status, html, final = fetch(results_url)
    time.sleep(DELAY)
    if status != 200 or not html:
        return {"readable": False, "why": f"results page returned {status}",
                "url": results_url, "checked_at": date.today().isoformat()}
    text = strip_tags(html)
    # A length test is the wrong test. Malloy Law's results page serves 220KB of HTML and 5,617
    # characters of text, all of it the navigation menu: the results themselves are rendered in
    # the browser. It cleared a 400-character floor comfortably and would have scored zero
    # results, which is a judgement about their tech stack rather than their transparency, and
    # exactly what the readable flag exists to prevent.
    #
    # So the test is for content: a results page we actually read shows a figure or the word for
    # a result. Neither means we did not read the results, whatever the text length, and pillar B
    # stays pending rather than scoring the firm nothing.
    has_money = bool(MONEY.search(text))
    has_words = bool(RESULT_WORD.search(text))
    if len(text) < 400 or not (has_money or has_words):
        return {"readable": False,
                "why": ("results page has almost no text, most likely rendered in the browser"
                        if len(text) < 400 else
                        "the results page served no figures and no mention of a settlement, "
                        "verdict or recovery, so its results are rendered in the browser rather "
                        "than served to a reader or a crawler"),
                "url": final, "checked_at": date.today().isoformat()}
    out = extract(text)
    out.update({"readable": True, "url": final, "checked_at": date.today().isoformat()})
    if verbose:
        print(f"      {out['count']} result(s) from {out['counted_from']}, "
              f"{len(out['case_types'])} case type(s), disclaimer={out['disclaimer']}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains", help="comma-separated; default is every staging record")
    ap.add_argument("--staging", default=".crawl")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    staging = ROOT / args.staging
    if args.domains:
        files = [staging / (d.strip() + ".json") for d in args.domains.split(",") if d.strip()]
    else:
        files = sorted(pathlib.Path(p) for p in glob.glob(str(staging / "*.json")))

    read = nopage = unreadable = 0
    for path in files:
        if not path.exists():
            continue
        rec = json.loads(path.read_text(encoding="utf-8"))
        url = (rec.get("pages_found") or {}).get("results")
        print(f"\n{rec['domain']}")
        if not url:
            nopage += 1
            print("  --   no results page found on the site")
            # Recorded, so pillar B can tell "publishes nothing" from "we did not look".
            rec["results_published"] = {"readable": True, "count": 0, "amounts": [],
                                        "case_types": [], "disclaimer": False, "venues": [],
                                        "why": "the site publishes no case-results page",
                                        "checked_at": date.today().isoformat()}
        else:
            found = collect(rec["domain"], url, args.verbose)
            rec["results_published"] = found
            if found["readable"]:
                read += 1
                print(f"  OK   {found['count']} result(s) · {len(found['case_types'])} case type(s)"
                      f" · disclaimer {'yes' if found['disclaimer'] else 'no'}"
                      f" · {len(found['venues'])} venue mention(s)")
                if found.get("largest"):
                    print(f"       largest stated: ${found['largest']:,}")
            else:
                unreadable += 1
                print(f"  ??   {found['why']}")
        path.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print("\n" + "=" * 70)
    print(f"{read} read · {nopage} with no results page · {unreadable} unreadable")
    print("A page we could not read leaves pillar B pending. A page we read that states no")
    print("amounts is a finding about the firm, not a gap in our data.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
