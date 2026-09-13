#!/usr/bin/env python3
"""
A5 Accountability, read off the firm's own pages instead of entered by hand.

A5 is worth six points: three where a firm discloses that it carries professional liability
cover, three for membership of a substantive bar or trial lawyers' association. The methodology
says it is "scored only from what a firm publishes about itself", and until now nothing computed
it. Every firm on the directory had A5 pending except one, which carried a hand-entered value
with the source "illustrative" and an evidence string that mentioned rescaling between
methodology versions on a client's public profile.

That is the wrong shape twice over. Six points nobody can earn is not a ladder, and a hand-typed
assessment is the thing this whole rework set out to remove: the production build already refuses
to certify a firm holding one, so the value could not have survived certification anyway.

Two findings, both conservative, because a miss costs points nobody currently has while a false
positive publishes something untrue about a firm.

Insurance is the hard one. On a personal injury site the word "insurance" is everywhere and it is
almost always the other side's: adjusters, carriers, bad-faith denials, and on a medical
malpractice page the phrase "malpractice insurance" belongs to the defendant. So a disclosure
only counts when the firm is the subject of the sentence, which means a first-person subject and
a carrying verb within a short window of the insurance phrase. "We maintain professional
liability insurance" counts. "The hospital's malpractice insurer denied the claim" does not.

Associations are easier, because they have names. Only real bar and trial lawyers' associations
count. The paid marketing clubs a firm can join by invoice, the "Top 100" and "Multi-Million
Dollar" forums, are excluded on purpose: G5 exists to screen out bought badges and it would be
strange to score them here.

Usage:
    python scripts/check_a5.py                     # every reachable staging record
    python scripts/check_a5.py --domains x.com,y.com --verbose
"""
from __future__ import annotations

import argparse
import datetime
import glob
import io
import json
import pathlib
import re
import sys
import time
import urllib.parse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from crawl_public import UA, fetch, robots_for, strip_tags  # noqa: E402

DELAY = 1.5
ROOT = pathlib.Path(__file__).resolve().parents[1]
TODAY = datetime.date.today().isoformat()

# Every bio, not a sample. A membership line lives on one attorney's page and not on the
# other twenty-nine, so reading eight of thirty and reporting "publishes nothing" would
# be measuring our own sampling. The cap is a safety limit for a roster sitemap that
# turns out to list the whole site, not a sampling decision.
MAX_BIOS = 60

INSURANCE_PHRASE = re.compile(
    r"(professional liability|malpractice|errors\s*(?:&|and)\s*omissions|e&o)\s*"
    r"(?:insurance|coverage|policy|insurer|carrier)", re.I)

# The firm has to be the subject. Without this, every medical malpractice page in the directory
# would report that the firm disclosed its own cover.
FIRST_PERSON = re.compile(
    r"\b(?:we|our firm|our office|this firm|the firm|our attorneys|our lawyers)\b[^.]{0,40}"
    r"\b(?:carry|carries|carried|maintain|maintains|maintained|hold|holds|held|"
    r"insured|covered|purchase|purchases|provide|provides)\b", re.I)

# Substantive associations, by name. A firm that names one is claiming membership of it.
ASSOCIATIONS = [
    ("American Association for Justice", r"american association for justice|\bAAJ\b"),
    ("Association of Trial Lawyers of America", r"association of trial lawyers of america|\bATLA\b"),
    ("New York State Trial Lawyers Association", r"new york state trial lawyers|\bNYSTLA\b"),
    ("New York State Bar Association", r"new york state bar association|\bNYSBA\b"),
    ("New York City Bar Association", r"new york city bar association|"
                                      r"association of the bar of the city of new york"),
    ("Brooklyn Bar Association", r"brooklyn bar association"),
    ("Bronx County Bar Association", r"bronx county bar association"),
    ("Queens County Bar Association", r"queens county bar association"),
    ("Nassau County Bar Association", r"nassau county bar association"),
    ("Suffolk County Bar Association", r"suffolk county bar association"),
    ("Westchester County Bar Association", r"westchester county bar association"),
    ("Maryland State Bar Association", r"maryland state bar association|\bMSBA\b"),
    ("Maryland Association for Justice", r"maryland association for justice"),
    ("Bar Association of Baltimore City", r"bar association of baltimore city"),
    ("National Association of Criminal Defense Lawyers", r"national association of criminal "
                                                         r"defense lawyers|\bNACDL\b"),
    ("American Immigration Lawyers Association", r"american immigration lawyers association|"
                                                 r"\bAILA\b"),
    ("American Bar Association", r"american bar association|\bABA\b"),
    ("New Jersey State Bar Association", r"new jersey state bar association"),
    ("American Board of Trial Advocates", r"american board of trial advocates|\bABOTA\b"),
    # The workers' compensation ones. A comp firm belongs to these and to no trial lawyers
    # association, so a list of injury associations alone reads its membership as an absence
    # and costs it A5 points for being in a different practice.
    ("Injured Workers' Bar Association", r"injured workers'? bar association|\bIWBA\b"),
    ("Workers' Injury Law & Advocacy Group", r"workers'? injury law (?:&|and) advocacy group|"
                                             r"\bWILG\b"),
]
ASSOCIATIONS = [(name, re.compile(pattern, re.I)) for name, pattern in ASSOCIATIONS]

# Named and excluded rather than silently missed, so the next person can see the judgement.
# These are bought or invitation-marketing memberships, not professional associations, and G5
# exists to keep bought badges out of the score.
NOT_AN_ASSOCIATION = re.compile(
    r"multi-?million dollar advocates|million dollar advocates|top 100 trial lawyers|"
    r"national trial lawyers|super lawyers|best lawyers|avvo|expertise\.com|"
    r"lawyers of distinction|american institute of", re.I)


def pages_to_read(record):
    """The pages worth reading, in the order they are worth reading."""
    urls = []
    for kind in ("about", "attorneys", "home"):
        url = (record.get("pages_found") or {}).get(kind)
        if isinstance(url, str) and url:
            urls.append(url)
    if not urls and record.get("canonical_origin"):
        urls.append(record["canonical_origin"])
    urls += [u for u in (record.get("attorney_bio_urls") or [])[:MAX_BIOS]]
    seen, out = set(), []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def describe(insurance, associations, source, pages_read, bios_published):
    """The evidence line, as a reader of the scorecard sees it.

    Membership first, because it is the part that is scored. The cover half is named second and
    explained, because a scorecard that says "no disclosure of professional liability cover" next
    to a full three out of three reads like a contradiction. It is not: no firm in this directory
    publishes its cover, an absence shared by everyone measures nothing, and score.py leaves that
    half out of the scale rather than charging every firm for a fact about the market.
    """
    parts = []
    if associations:
        names = [a["name"] for a in associations]
        parts.append("member of " + ", ".join(names[:3])
                     + (" and %d more" % (len(names) - 3) if len(names) > 3 else ""))
    else:
        parts.append("no bar or trial lawyers' association named on the pages we read")

    if insurance:
        parts.append("professional liability cover disclosed")
    else:
        parts.append("no professional liability cover disclosed, which is not scored here: "
                     "plaintiff firms in this market do not publish it, and an absence shared by "
                     "every firm separates none of them")

    if source == "partial":
        parts.append("read %d page(s) against a roster of %d, so an absence is not yet a finding "
                     "about the firm" % (pages_read, bios_published))
    return " · ".join(parts)


def examine(record, verbose=False):
    origin = record.get("canonical_origin") or ("https://" + record["domain"])
    rp = robots_for(origin)

    insurance = None
    associations = []
    read = 0

    for url in pages_to_read(record):
        if not rp.can_fetch(UA, url):
            continue
        status, html, _final = fetch(url)
        time.sleep(DELAY)
        if status != 200 or not html:
            continue
        read += 1
        text = strip_tags(html)

        if insurance is None:
            for m in INSURANCE_PHRASE.finditer(text):
                window = text[max(0, m.start() - 120):m.end() + 60]
                if FIRST_PERSON.search(window):
                    insurance = {
                        "quote": re.sub(r"\s+", " ", window).strip()[:220],
                        "source_url": url,
                    }
                    break

        for name, pattern in ASSOCIATIONS:
            if name in [a["name"] for a in associations]:
                continue
            m = pattern.search(text)
            if not m:
                continue
            window = text[max(0, m.start() - 60):m.end() + 60]
            if NOT_AN_ASSOCIATION.search(window):
                continue
            associations.append({"name": name,
                                 "source_url": url,
                                 "quote": re.sub(r"\s+", " ", window).strip()[:160]})

        if verbose:
            print("        read %s" % url)

    pts = (3 if insurance else 0) + (3 if associations else 0)

    # Absence is only a finding if we actually looked everywhere it could be. A firm whose bios
    # we could not all read, and where we found nothing, leaves A5 unassessed rather than scoring
    # zero: normalising over what we assessed means a zero here costs six points, and it must not
    # be six points about our own crawl. Evidence found needs no such caveat, because finding a
    # membership on one page does not depend on having read the rest.
    bios = record.get("attorney_bio_urls") or []
    complete = read > 0 and len(bios[:MAX_BIOS]) == len(bios)
    source = "observed" if (pts or complete) else "partial"

    parts = describe(insurance, associations, source, read, len(bios))

    return {
        "malpractice_insurance": bool(insurance),
        "insurance_evidence": insurance,
        "bar_associations": associations,
        "pts": pts,
        "evidence": parts,
        "pages_read": read,
        "bios_published": len(bios),
        "source": source,
        "checked_at": TODAY,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains", help="comma-separated; default is every reachable staging record")
    ap.add_argument("--staging", default=".crawl")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    staging = pathlib.Path(args.staging)
    if args.domains:
        files = [staging / (d.strip() + ".json") for d in args.domains.split(",") if d.strip()]
    else:
        files = sorted(pathlib.Path(p) for p in glob.glob(str(staging / "*.json")))

    scored = insured = affiliated = 0
    for path in files:
        if not path.exists():
            print("%-24s no staging record" % path.stem)
            continue
        with io.open(path, encoding="utf-8") as fh:
            record = json.load(fh)
        if not record.get("https_ok"):
            print("%-24s skipped, site was never reachable" % record["domain"])
            continue

        found = examine(record, args.verbose)

        # Re-read before writing: four scripts share this file.
        with io.open(path, encoding="utf-8") as fh:
            fresh = json.load(fh)
        fresh["accountability"] = found
        io.open(path, "w", encoding="utf-8", newline="\n").write(
            json.dumps(fresh, ensure_ascii=False, indent=2) + "\n")

        scored += 1
        insured += bool(found["malpractice_insurance"])
        affiliated += bool(found["bar_associations"])
        print("%-24s %d/6  %s" % (record["domain"], found["pts"], found["evidence"][:96]))

    print("\n%d firm(s) examined · %d disclose cover · %d name an association"
          % (scored, insured, affiliated))
    print("A5 is what a firm says about itself, so a firm that publishes neither scores nothing")
    print("here rather than being asked for it.")


if __name__ == "__main__":
    main()
