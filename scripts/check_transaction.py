#!/usr/bin/env python3
"""
What a firm publishes about a transaction, for pillar B where there are no outcomes.

Pillar B is Published Outcomes: it reads the settlements and verdicts a firm puts on its own
results page. A firm that closes property transactions has none, and not because it is worse than
an injury firm. A closing that went well produces no verdict. Scoring that zero would publish our
own inability to measure as a finding about the firm, which is the mistake the gates had to
unlearn twice this month, so the sub-factors are measured differently and the pillar keeps its
weight.

Three things, chosen because a client asks all three and a firm can answer all three in public:

    price       the fee for the work, and best of all a figure. Title insurance premiums in
                Florida are set by rule under s. 627.782, identical at every agency in the state,
                so the premium is not a thing to compare. The firm's own closing fee is, and
                almost nobody publishes it.

    escrow      who holds the deposit and where. In Florida a lawyer's trust account is governed
                by the Bar's rules and interest on it funds legal aid through the IOTA
                programme, and a firm can say so plainly. Most say nothing at all, which is a
                real finding rather than a limit of ours: the page is theirs to write.

    process     what happens between contract and keys, in the firm's own words. A page that
                walks through the search, the commitment, the survey, the lien search and the
                settlement statement is the difference between a price and an explanation.

Every one of these is scored from the firm's own pages and stored with the URL and the sentence
it was found in, so a reviewer can open it and disagree. Nothing here reads a directory, a review
or anything the firm did not publish itself.

Writes `transaction` into the .crawl/ staging record. scripts/promote_measurements.py copies it
onto the profile and scripts/score.py reads it for pillar B.

Usage:
    python scripts/check_transaction.py --domains glpa.law --verbose
    python scripts/check_transaction.py --domains a.com,b.com
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

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from crawl_public import DELAY, fetch, robots_for, strip_tags, unescape, UA  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
TODAY = datetime.date.today().isoformat()
MAX_PAGES = 14

# Pages worth reading for this, in the order they are worth reading. A fee lives on a fees page
# and, failing that, on the practice page or the home page.
WANTED = re.compile(
    r"(?:^|/)(?:fees?|pricing|costs?|rates?|flat[-_]fee|fee[-_]schedule|what[-_]we[-_]charge|"
    r"closing[s]?|closing[-_]costs?|real[-_]?estate|title|escrow|process|how[-_]it[-_]works|"
    r"services?|practice[-_]areas?|faqs?)(?:/|$|\.)", re.I)

# A price, and the sentence it sits in. Two currency shapes, because a flat fee is written "$750"
# and a range is written "$750 to $1,200". A percentage is not a price for this work.
FIGURE = re.compile(r"\$\s?\d{2,3}(?:,\d{3})*(?:\.\d{2})?|\$\s?\d{1,3}(?:,\d{3})+")
FLAT_FEE = re.compile(r"\bflat[- ]fee|\bflat[- ]rate|\bfixed[- ]fee|\bone[- ]time fee|"
                      r"\bpriced as flat fees\b", re.I)
FEE_TERMS = re.compile(r"\bour fee|\bfee (?:for|is|structure|schedule)|\bwe charge|"
                       r"\bcost[s]? (?:no more|of|start)|\bhow much (?:we|it) cost", re.I)

ESCROW = re.compile(r"\b(?:escrow|trust) account\b|\bIOTA\b|\btrust funds?\b|"
                    r"\b(?:hold|holding|held) (?:your|the) (?:deposit|funds|money)\b|"
                    r"\bearnest money\b.{0,60}\b(?:account|escrow|trust)\b", re.I)
ESCROW_BANK = re.compile(r"\b(?:escrow|trust) account (?:at|with|is (?:held )?at)\b|"
                         r"\bfederally insured\b|\bFDIC\b", re.I)

# The stages of a purchase. Counted rather than matched: a page that names six of these is
# explaining the transaction, and a page that names one is mentioning it.
STAGES = {
    "title search": re.compile(r"\btitle search\b", re.I),
    "title commitment": re.compile(r"\btitle commitment\b|\bcommitment for title\b", re.I),
    "survey": re.compile(r"\bsurvey\b", re.I),
    "lien search": re.compile(r"\blien search\b|\bmunicipal lien\b", re.I),
    "estoppel": re.compile(r"\bestoppel\b", re.I),
    "settlement statement": re.compile(r"\bsettlement statement\b|\bclosing disclosure\b|"
                                       r"\bHUD-1\b", re.I),
    "inspection period": re.compile(r"\binspection period\b|\bdue diligence period\b", re.I),
    "financing contingency": re.compile(r"\bfinancing contingency\b|\bloan contingency\b", re.I),
    "recording the deed": re.compile(r"\brecord(?:ing|ed)? the deed\b|\bdeed is recorded\b|"
                                     r"\brecording fees?\b", re.I),
    "closing date": re.compile(r"\bclosing date\b|\bday of closing\b|\bat closing\b", re.I),
}


def sentence_around(text: str, at: int) -> str:
    """The sentence the match sits in, or a window around it where there is no sentence.

    A navigation bar has no full stops in it, so the first version of this returned the whole menu
    as the quote: "Video Conferencing Zoom Meeting Docubank Advanced Directives Closing Portal"
    was stored as a firm's published fee terms. Where the sentence runs past what a sentence runs
    to, the match is quoted with its neighbours instead and the reader can see it is a fragment.
    """
    start = max(text.rfind(". ", 0, at), text.rfind("? ", 0, at)) + 1
    end = text.find(". ", at)
    end = len(text) if end < 0 else end + 1
    quote = re.sub(r"\s+", " ", text[start:end]).strip()
    if len(quote) <= 240:
        return quote
    return re.sub(r"\s+", " ", text[max(0, at - 110):at + 170]).strip()


def pages_to_read(record, origin, rp):
    """The firm's own pages, sitemap first and then whatever the record already found."""
    out, seen = [], set()

    def add(url):
        clean = (url or "").split("#")[0].rstrip("/")
        if not clean or clean in seen or not clean.startswith(origin):
            return
        seen.add(clean)
        out.append(clean)

    found = record.get("pages_found") or {}
    for kind in ("home", "about"):
        if found.get(kind):
            add(found[kind])
    for url in (record.get("practice_evidence") or {}).values():
        if isinstance(url, dict) and url.get("url"):
            add(url["url"])
    for url in record.get("pages_found", {}).values():
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
        if len(read) == 1:                      # follow the home page's fee and closing links
            for extra in links_worth_following(html, origin, rp):
                if extra not in todo and extra.rstrip("/") not in [r.rstrip("/") for r in read]:
                    todo.append(extra)
        if verbose:
            print("      read %s" % final)

    if not read:
        return {"readable": False, "why": "no page on the firm's site could be read",
                "checked_at": TODAY}

    price = None
    flat = None
    terms = None
    escrow = None
    escrow_where = False
    stages = {}

    for url, text in texts:
        for m in FIGURE.finditer(text):
            around = sentence_around(text, m.start())
            # A figure in a sentence about a fee, not a figure about a settlement or a house.
            if re.search(r"\bfee|\bcharge|\bcost|\bclosing\b|\bflat\b|\bprice", around, re.I):
                price = price or {"figure": m.group(0).replace(" ", ""),
                                  "quote": around, "source_url": url}
                break
        if not flat and FLAT_FEE.search(text):
            m = FLAT_FEE.search(text)
            flat = {"quote": sentence_around(text, m.start()), "source_url": url}
        if not terms and FEE_TERMS.search(text):
            m = FEE_TERMS.search(text)
            terms = {"quote": sentence_around(text, m.start()), "source_url": url}
        if not escrow and ESCROW.search(text):
            m = ESCROW.search(text)
            escrow = {"quote": sentence_around(text, m.start()), "source_url": url}
            escrow_where = bool(ESCROW_BANK.search(text))
        for name, pattern in STAGES.items():
            if name not in stages and pattern.search(text):
                m = pattern.search(text)
                stages[name] = {"quote": sentence_around(text, m.start()), "source_url": url}

    return {
        "readable": True,
        "pages_read": len(read),
        "price": price,
        "flat_fee": flat,
        "fee_terms": terms,
        "escrow": escrow,
        "escrow_location_named": escrow_where,
        "stages": sorted(stages),
        "stage_evidence": stages,
        "source": "The firm's own fee, closing and practice pages",
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
    done = 0
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
        fresh["transaction"] = block
        io.open(path, "w", encoding="utf-8", newline="\n").write(
            json.dumps(fresh, ensure_ascii=False, indent=2) + "\n")
        done += 1
        if not block.get("readable"):
            print("%-30s %s" % (name[:30], block["why"]))
            continue
        print("%-30s %d page(s) · price %-9s flat %-4s escrow %-4s %d stage(s)"
              % (name[:30], block["pages_read"],
                 (block["price"] or {}).get("figure", "none"),
                 "yes" if block["flat_fee"] else "no",
                 "yes" if block["escrow"] else "no", len(block["stages"])))

    print()
    print("%d firm(s) measured. Pillar B reads this where the practice has no outcomes." % done)
    return 0


if __name__ == "__main__":
    sys.exit(main())
