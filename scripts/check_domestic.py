#!/usr/bin/env python3
"""
What a family law firm publishes about cost and process, for pillar B where there are no outcomes.

Pillar B is Published Outcomes, read off a firm's own results page. Two practices here have no
outcomes to read. A closing that went well produces no verdict, which is what
scripts/check_transaction.py exists for, and a divorce produces something worse than nothing: a
judgment about a real family's money and a real child's living arrangements. Custody proceedings
concern children, matrimonial files are routinely sealed, and a firm advertising the custody
arrangement it obtained is advertising a stranger's private life as a sales aid. So this pillar
does not ask these firms for results, and a firm that publishes none is not marked down.

What it asks instead comes out of the rules that govern this work in New York, because they draw
the line between what a client is guaranteed and what a client can actually find out in advance:

    price       Rule 1.5(d)(5)(i) forbids a contingent fee in a domestic relations matter, so
                the promise two hundred and fifty firms in this directory make is not available
                to any of these. What you pay is an hourly rate against an advance retainer.
                22 NYCRR 1400.3 then requires the firm to hand you, in writing and signed,
                "the hourly rate of each person whose time may be charged to the client" and
                the amount of the advance retainer, before it starts work.

                So the law guarantees you the price in the room where you are signing, after
                you have chosen. Nothing requires publishing any of it beforehand, which is the
                moment somebody is comparing three firms. That gap is what this measures.

    billing     22 NYCRR 1400.3 requires the agreement to state "the frequency of itemized
                billing, which shall be at least every 60 days", and 1400.2 tells the client an
                attorney "may not request a retainer fee that is non-refundable" and that a fee
                dispute may go to arbitration under Part 137. A firm that publishes how it bills
                and what happens to the unused retainer is publishing the part of the
                relationship that goes wrong most often. This is the analogue of escrow in a
                closing: it is about the client's money.

    process     what happens between the first filing and the judgment, in the firm's own words.
                DRL 170(7) makes the ground itself easy, six months of irretrievable breakdown
                stated under oath, and then bars the judgment until property, support and the
                arrangements for the children are resolved. The case is the economics, not the
                ground, and a page that walks through the net worth statement, the preliminary
                conference and the attorney for the child is explaining that. A page that says
                "aggressive representation" is not.

Every finding is stored with the URL and the sentence it was found in, so a reviewer can open the
page and disagree. Nothing here reads a directory, a review or anything the firm did not publish.

Writes `domestic` into the .crawl/ staging record. scripts/promote_measurements.py copies it onto
the profile and scripts/score.py reads it for pillar B in a family-law practice.

Usage:
    python scripts/check_domestic.py --domains lkrasner.com --verbose
    python scripts/check_domestic.py --domains a.com,b.com
"""
from __future__ import annotations

import argparse
import datetime
import io
import json
import pathlib
import re
import sys
import time
import urllib.parse
from html import unescape

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from check_transaction import (DELAY, UA, fetch, robots_for, sentence_around,  # noqa: E402
                              strip_tags)

ROOT = pathlib.Path(__file__).resolve().parents[1]
TODAY = datetime.date.today().isoformat()
MAX_PAGES = 14

# Pages worth reading, in the order they are worth reading. A rate lives on a fees page and,
# failing that, on the divorce page, the FAQ or the home page. "Retainer" is in here as a path
# because a handful of firms publish exactly one page about money and call it that.
WANTED = re.compile(
    r"(?:^|/)(?:fees?|pricing|costs?|rates?|retainer|billing|flat[-_]fee|fee[-_]schedule|"
    r"what[-_]we[-_]charge|how[-_]much|divorce|family[-_]?law|matrimonial|custody|"
    r"child[-_]support|mediation|collaborative|uncontested|process|how[-_]it[-_]works|"
    r"what[-_]to[-_]expect|services?|practice[-_]areas?|faqs?)(?:/|$|\.)", re.I)

# An hourly rate, which is the price in this practice. Written "$450 per hour", "$450/hour",
# "$450 an hour", and sometimes as a range.
HOURLY = re.compile(
    r"\$\s?\d{2,3}(?:,\d{3})?(?:\.\d{2})?\s*(?:-|to|–)?\s*(?:\$\s?\d{2,3}(?:,\d{3})?)?"
    r"\s*(?:per\s+hour|an?\s+hour|/\s*h(?:ou)?r|hourly)", re.I)
# The retainer, the figure a client has to produce before anything happens. "A $5,000 retainer",
# "retainer of $7,500", "retainers start at $10,000".
RETAINER_FIGURE = re.compile(
    r"(?:retainer[^.$]{0,40}\$\s?\d{1,3}(?:,\d{3})+|\$\s?\d{1,3}(?:,\d{3})+[^.$]{0,40}retainer)",
    re.I)
# A flat fee, which in this practice means an uncontested divorce quoted as one price.
FLAT_FEE = re.compile(r"\bflat[- ]fee|\bflat[- ]rate|\bfixed[- ]fee|\ball[- ]inclusive fee|"
                      r"\bone[- ]time fee", re.I)
# Anything else the firm says about how it charges. Weaker than a figure and still a statement.
FEE_TERMS = re.compile(r"\bour (?:fees?|rates?|retainer)|\bfee (?:for|is|structure|schedule)|"
                       r"\bwe (?:charge|bill)\b|\bhourly (?:rate|basis|fee)|"
                       r"\bhow much (?:we|it|a divorce) cost|\bcost of (?:a )?divorce", re.I)
# A fee this practice may not charge. Finding one is a finding, and it is reported rather than
# scored: the rule is the Appellate Division's to enforce, not a directory's.
CONTINGENT = re.compile(r"\bno fee unless\b|\bno (?:up[- ]?front|upfront) (?:fee|cost)\b|"
                        r"\bwe (?:only )?get paid (?:only )?(?:if|when) (?:you|we) win\b|"
                        r"\bcontingen(?:cy|t) fee\b", re.I)

# The client's money: how the retainer is held, how often it is billed, what comes back.
BILLING = re.compile(
    r"\bitemi[sz]ed (?:bill|invoice|statement)|\bbilled? (?:monthly|every \d+ days|in \d+ "
    r"minute)|\bbill(?:ed|ing) increments?\b|\btime (?:is )?billed\b|\bmonthly (?:bill|invoice|"
    r"statement)|\bunused (?:portion|balance|retainer)|\brefund(?:ed|able)?\b[^.]{0,40}"
    r"retainer|retainer[^.]{0,40}\brefund", re.I)
# The rules that govern all of it, which a firm may cite and most do not.
RULE_CITED = re.compile(r"\b1400\.[23]\b|\bPart\s*1400\b|\bstatement of client'?s? rights\b|"
                        r"\bPart\s*137\b|\bfee arbitration\b", re.I)

# The stages of a matrimonial case, in New York's own vocabulary. Counted rather than matched: a
# page naming six of these is explaining the case, and a page naming one is mentioning it.
STAGES = {
    "grounds": re.compile(r"\bno[-\s]fault\b|\birretrievab\w*\b|\bgrounds for divorce\b", re.I),
    "summons": re.compile(r"\bsummons with notice\b|\bsummons and complaint\b|"
                          r"\bfiling (?:the|a) (?:summons|petition)\b", re.I),
    "net worth statement": re.compile(r"\bnet worth statement\b|\bstatement of net worth\b|"
                                      r"\bfinancial disclosure\b", re.I),
    "preliminary conference": re.compile(r"\bpreliminary conference\b|\bcompliance conference\b",
                                         re.I),
    "discovery": re.compile(r"\bdiscovery\b|\bsubpoena\b|\bdeposition\b", re.I),
    "custody evaluation": re.compile(r"\bforensic (?:evaluation|evaluator|psycholog)|"
                                     r"\bcustody evaluation\b", re.I),
    "attorney for the child": re.compile(r"\battorney for the child(?:ren)?\b|\blaw guardian\b",
                                         re.I),
    "equitable distribution": re.compile(r"\bequitable distribution\b|\bmarital property\b", re.I),
    "maintenance": re.compile(r"\bmaintenance\b|\bspousal support\b|\balimony\b", re.I),
    "child support": re.compile(r"\bchild support\b|\bCSSA\b|\bchild support standards act\b",
                                re.I),
    "settlement": re.compile(r"\bsettlement (?:agreement|conference|negotiation)\b|"
                             r"\bstipulation of settlement\b|\bseparation agreement\b", re.I),
    "trial": re.compile(r"\b(?:go to |at )?trial\b|\btried before a judge\b", re.I),
    "judgment": re.compile(r"\bjudgment of divorce\b|\bfinal judgment\b", re.I),
}

# The paths through this work, which are genuinely different services and different prices.
PATHS = {
    "mediation": re.compile(r"\bdivorce mediation\b|\bmediat(?:e|or|ion)\b", re.I),
    "collaborative": re.compile(r"\bcollaborative (?:divorce|law|process)\b", re.I),
    "litigation": re.compile(r"\blitigat(?:e|ion|or)\b|\bcourtroom\b|\btrial attorney\b", re.I),
    "uncontested": re.compile(r"\buncontested divorce\b", re.I),
}


def pages_to_read(record, origin, rp):
    """The firm's own pages: what the crawl already found, then anything money-shaped."""
    out, seen = [], set()

    def add(url):
        clean = (url or "").split("#")[0].rstrip("/")
        if not clean or clean in seen or not clean.startswith(origin):
            return
        seen.add(clean)
        out.append(clean)

    found = record.get("pages_found") or {}
    for kind in ("home", "about", "fees"):
        if found.get(kind):
            add(found[kind])
    for value in (record.get("practice_evidence") or {}).values():
        if isinstance(value, dict) and value.get("url"):
            add(value["url"])
    for url in found.values():
        if WANTED.search(urllib.parse.urlparse(url or "").path or ""):
            add(url)
    return [u for u in out if rp.can_fetch(UA, u)][:MAX_PAGES]


def links_worth_following(html, origin, rp):
    out, seen = [], set()
    for m in re.finditer(r'href=["\']([^"\'#\s]+)["\']', html, re.I):
        url = urllib.parse.urljoin(origin + "/", m.group(1).strip()).split("#")[0].rstrip("/")
        if not url.startswith(origin) or url in seen:
            continue
        if not WANTED.search(urllib.parse.urlparse(url).path or ""):
            continue
        seen.add(url)
        if rp.can_fetch(UA, url):
            out.append(url)
    return out


def first_match(pattern, texts, guard=None):
    """The first match across the pages read, with the sentence it sits in.

    `guard` is a second pattern the surrounding sentence must satisfy. A figure on a family law
    page can be a child support cap or somebody's income, so the sentence has to be about
    charging before the figure counts as a price.
    """
    for url, text in texts:
        for m in pattern.finditer(text):
            quote = sentence_around(text, m.start())
            if guard and not guard.search(quote):
                continue
            return {"figure": m.group(0).strip(), "quote": quote, "source_url": url}
    return None


FEE_CONTEXT = re.compile(r"\bfee|\bcharge|\bbill|\brate|\bretainer|\bcost|\bhour", re.I)


def examine(record, verbose=False):
    domain = record["domain"]
    origin = record.get("canonical_origin") or ("https://" + domain)
    rp = robots_for(origin)

    todo = pages_to_read(record, origin, rp)
    read, texts = [], []
    while todo and len(read) < MAX_PAGES:
        url = todo.pop(0)
        status, html, final = fetch(url)
        time.sleep(DELAY)
        if status != 200 or not html:
            continue
        read.append(final)
        texts.append((final, re.sub(r"\s+", " ", unescape(strip_tags(html)))))
        if len(read) == 1:
            for extra in links_worth_following(html, origin, rp):
                if extra not in todo and extra.rstrip("/") not in [r.rstrip("/") for r in read]:
                    todo.append(extra)
        if verbose:
            print("      read %s" % final)

    if not read:
        return {"readable": False, "why": "no page on the firm's site could be read",
                "checked_at": TODAY}

    hourly = first_match(HOURLY, texts, FEE_CONTEXT)
    retainer = first_match(RETAINER_FIGURE, texts)
    flat = first_match(FLAT_FEE, texts)
    terms = first_match(FEE_TERMS, texts)
    contingent = first_match(CONTINGENT, texts)
    billing = first_match(BILLING, texts)
    rule = first_match(RULE_CITED, texts)

    stages, paths = {}, {}
    for url, text in texts:
        for name, pattern in STAGES.items():
            m = pattern.search(text)
            if name not in stages and m:
                stages[name] = {"quote": sentence_around(text, m.start()), "source_url": url}
        for name, pattern in PATHS.items():
            m = pattern.search(text)
            if name not in paths and m:
                paths[name] = {"quote": sentence_around(text, m.start()), "source_url": url}

    return {
        "readable": True,
        "pages_read": len(read),
        "hourly_rate": hourly,
        "retainer": retainer,
        "flat_fee": flat,
        "fee_terms": terms,
        # Reported, never scored. A contingent fee in a domestic relations matter is prohibited
        # by Rule 1.5(d)(5)(i), and what a page says is not proof of what a retainer says.
        "contingency_language": contingent,
        "billing_disclosed": billing,
        "client_rights_cited": rule,
        "stages": sorted(stages),
        "stage_evidence": stages,
        "paths": sorted(paths),
        "path_evidence": paths,
        "source": "The firm's own fee, divorce and FAQ pages",
        "checked_at": TODAY,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains", required=True, help="comma-separated")
    ap.add_argument("--staging", default=".crawl")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    staging = ROOT / args.staging
    done = flagged = 0
    for name in [d.strip() for d in args.domains.split(",") if d.strip()]:
        path = staging / (name + ".json")
        if not path.exists():
            print("%-30s no staging record" % name[:30])
            continue
        record = json.load(io.open(path, encoding="utf-8"))
        try:
            block = examine(record, args.verbose)
        except Exception as e:
            print("%-30s %s" % (name[:30], str(e)[:60]))
            continue

        fresh = json.load(io.open(path, encoding="utf-8"))   # several scripts share this file
        fresh["domestic"] = block
        io.open(path, "w", encoding="utf-8", newline="\n").write(
            json.dumps(fresh, ensure_ascii=False, indent=2) + "\n")
        done += 1
        if not block.get("readable"):
            print("%-30s %s" % (name[:30], block["why"]))
            continue
        if block["contingency_language"]:
            flagged += 1
        print("%-30s %d page(s) · hourly %-12s retainer %-4s flat %-4s billing %-4s "
              "%d stage(s) %d path(s)%s"
              % (name[:30], block["pages_read"],
                 (block["hourly_rate"] or {}).get("figure", "none")[:12],
                 "yes" if block["retainer"] else "no",
                 "yes" if block["flat_fee"] else "no",
                 "yes" if block["billing_disclosed"] else "no",
                 len(block["stages"]), len(block["paths"]),
                 "  CONTINGENCY LANGUAGE" if block["contingency_language"] else ""))

    print()
    print("%d firm(s) measured. Pillar B reads this where the practice has no outcomes." % done)
    if flagged:
        print("%d firm(s) use contingency language on a page. Rule 1.5(d)(5)(i) prohibits a "
              "contingent fee in a domestic relations matter, and what a page says is not what a "
              "retainer agreement says, so this is recorded for a person and never scored."
              % flagged)
    return 0


if __name__ == "__main__":
    sys.exit(main())
