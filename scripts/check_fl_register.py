#!/usr/bin/env python3
"""
Check firms against Florida's corporate register, which this repository had written off.

scripts/check_entity.py listed Florida under PENDING with this reason: the register is published
in full as fixed-width data files, "but the download sits on an SFTP host that answers an
anonymous request with a 401 and needs an account arranged with the Division of Corporations".
The first half is true and the second half is wrong. No account is needed. The Division of
Corporations publishes the credentials for that host on its own data-downloads page, because a
public register is meant to be read, and the host also answers plain HTTPS with them.

So Florida's G3 was the only gate in the directory blocked by our own unfinished work rather
than by a state that publishes nothing, and it was blocked on a sentence nobody had retested.
Thirty-four published firms carried "Secretary of State registration still to confirm".

    https://dos.fl.gov/sunbiz/other-services/data-downloads/
    https://dos.fl.gov/sunbiz/other-services/data-downloads/corporate-data-file/

What it reads. The quarterly snapshot, /Public/doc/Quarterly/Cor/cordata.zip, which is every
active record rather than one day's filings. 1.8 GB compressed, downloaded once and kept out of
the repository. The layout is the state's own, from the second page above:

    Corporation Number    1    12        Corporation Name     13   192
    Status              205     1        Filing Type         206    15
    Address 1           221    42        City                305    28
    Zip                 335    10        File Date           473     8   MMDDYYYY

Two things differ from scripts/check_ny_dos.py, and both make the match harder rather than
easier. Florida's file carries no field saying whether an entity is a professional one, so the
tie-break that settled Shulman & Hill in New York, where only a professional service entity may
practise law, has nothing to read here. And a firm may be a PA, a PLLC or an ordinary
corporation in Florida without any of that showing in the file. What is left is the firm's own
distinctive tokens, the whole-name similarity, and the city of an office we have already
verified on the firm's Google listing, which is a discriminator New York did not need.

Credentials come from .env as FL_SFTP_USER and FL_SFTP_PASS. They are published by the state and
are not a secret; they are kept out of this file because this repository is public and a password
in a public repository reads as a leak whatever its provenance.

Usage:
    python scripts/check_fl_register.py                 # report only
    python scripts/check_fl_register.py --write         # store the entity and update G3/G6
    python scripts/check_fl_register.py --firm boatman-ricci
"""
from __future__ import annotations

import argparse
import base64
import difflib
import io
import json
import os
import re
import sys
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"
CACHE = ROOT / ".crawl" / "fl"
HOST = "https://sftp.floridados.gov"
SNAPSHOT = "/Public/doc/Quarterly/Cor/cordata.zip"
UA = "LFL-research/1.0 (+https://lawfirmlistings.com; public register read)"
LF = chr(10)
TODAY = date.today().isoformat()

DATASET = ("Corporate Data File, quarterly full snapshot, published by the Florida Department of "
           "State Division of Corporations")
G6_MIN_REVIEWS = 10
G6_MIN_YEARS = 1.0
# The practices G6 does not ask ten reviews of, which is the same set scripts/score.py names.
# The methodology says why: the ten-review minimum was calibrated on consumer injury markets,
# where a client who has just been paid leaves a review, and transactional practices work by
# referral and do not. For those, the gate asks for a verified listing and the year in operation,
# and the thin listing costs the firm points in pillar C instead of its eligibility.
#
# Written down here because leaving it out cost three Naples firms their eligibility on the first
# run of this script. One of them was Cheffy Passidomo, which is the firm the methodology itself
# cites as the reason the exemption exists: eighty years in Naples, fifteen attorneys, five
# reviews. Publishing "Not eligible" about it would have contradicted our own published rule on
# the same site.
TRANSACTIONAL = {"real-estate"}
# Family law is the same exemption for a stronger reason: a client who has just been
# through a custody dispute does not review their lawyer under their own name. Five Buffalo
# practices were published as "Not eligible" before this was seen. No Florida market here
# runs family law yet, and the set is kept in step anyway so the next one does not repeat it.
DOMESTIC = {"family-law"}

# The state's own field positions, one-based in its documentation and zero-based here.
FIELDS = {
    "number": (0, 12), "name": (12, 204), "status": (204, 205), "filing_type": (205, 220),
    "address": (220, 262), "city": (304, 332), "zip": (334, 344), "file_date": (472, 480),
}
RECORD_LEN = 1440

# An entity whose name carries a street address holds property; it does not practise law. Florida
# has no professional-entity flag to tell the two apart, so the name is the only signal, and this
# is the shape it takes: a surname or firm word, then a number, then a street type. "LABOVICK 10
# NE 3RD STREET, LLC" is the office building. Matching it gave LaBovick Law Group that entity's
# filing date and published "Not eligible" about a firm with 1,279 client reviews.
ADDRESS_ENTITY = re.compile(
    r"\b\d+\s+(?:\w+\.?\s+){0,3}"
    r"(?:ST|STREET|AVE|AVENUE|RD|ROAD|BLVD|BOULEVARD|DR|DRIVE|LN|LANE|WAY|CT|COURT|PL|PLACE|"
    r"TER|TERRACE|PKWY|PARKWAY|HWY|HIGHWAY|CIR|CIRCLE|SUITE|STE|UNIT|FLOOR|FL)\b", re.I)

# Words that separate no two law firms in this state. Florida's own practice vocabulary is on it
# for the same reason New York's is: a token every second firm carries cannot anchor a match.
GENERIC = {
    "LAW", "LAWS", "FIRM", "FIRMS", "OFFICE", "OFFICES", "GROUP", "LLP", "LLC", "PLLC", "PC",
    "PLC", "LP", "AND", "THE", "OF", "ASSOCIATES", "ASSOCIATION", "PARTNERS", "ATTORNEY",
    "ATTORNEYS", "LAWYER", "LAWYERS", "INJURY", "PERSONAL", "ACCIDENT", "TRIAL", "LEGAL",
    "COUNSEL", "PA", "PLLP", "CO", "INC", "ESQ", "CHARTERED", "PROFESSIONAL",
    "FLORIDA", "FL", "NAPLES", "TAMPA", "LAKELAND", "MIAMI", "ORLANDO", "JACKSONVILLE",
    "REAL", "ESTATE", "TITLE", "CLOSING", "CLOSINGS",
}


def env(name: str) -> str | None:
    path = ROOT / ".env"
    if path.exists():
        for line in io.open(path, encoding="utf-8-sig"):
            m = re.match(r"^%s=(.*)$" % re.escape(name), line.strip())
            if m:
                return m.group(1)
    return os.environ.get(name)


def auth_header() -> str:
    user, password = env("FL_SFTP_USER"), env("FL_SFTP_PASS")
    if not user or not password:
        raise SystemExit(
            "FL_SFTP_USER and FL_SFTP_PASS are not set. The Division of Corporations publishes "
            "them on https://dos.fl.gov/sunbiz/other-services/data-downloads/ ; put them in .env, "
            "which is gitignored.")
    return "Basic " + base64.b64encode(("%s:%s" % (user, password)).encode()).decode()


def download(force: bool = False) -> Path:
    """The snapshot, fetched once and streamed to disk.

    1.8 GB is not something to hold in memory or to fetch twice, and .crawl is gitignored, so
    the archive stays out of the repository and out of the build.
    """
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / "cordata.zip"
    req = urllib.request.Request(HOST + SNAPSHOT,
                                 headers={"User-Agent": UA, "Authorization": auth_header()})
    with urllib.request.urlopen(req, timeout=300) as r:
        expected = int(r.headers.get("Content-Length") or 0)
        if dest.exists() and not force and dest.stat().st_size == expected:
            print("snapshot already downloaded: %s (%d bytes)" % (dest.name, expected))
            return dest
        print("downloading %s, %.1f GB" % (SNAPSHOT, expected / (1 << 30)))
        got = 0
        with io.open(dest, "wb") as fh:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                fh.write(chunk)
                got += len(chunk)
                if got % (200 << 20) < (1 << 20):
                    print("   %d MB" % (got >> 20), flush=True)
    print("   %d MB, done" % (got >> 20))
    return dest


def field(line: str, key: str) -> str:
    start, end = FIELDS[key]
    return line[start:end].strip()


def iso_date(mmddyyyy: str) -> str | None:
    """The state writes a file date as MMDDYYYY. Anything else is left alone rather than guessed."""
    if not re.fullmatch(r"\d{8}", mmddyyyy or ""):
        return None
    month, day, year = mmddyyyy[:2], mmddyyyy[2:4], mmddyyyy[4:]
    try:
        return date(int(year), int(month), int(day)).isoformat()
    except ValueError:
        return None


def norm(text: str) -> str:
    text = re.sub(r"\s*&\s*", " AND ", (text or "").upper())
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", text)).strip()


def tokens(text: str) -> set[str]:
    return {t for t in norm(text).split() if t}


def distinctive(firm: dict) -> set[str]:
    out = {t for t in tokens(firm["name"]) | tokens(firm.get("legal_name") or "")
           if t not in GENERIC and len(t) > 2}
    label = (firm.get("domain") or "").split(".")[0].replace("www", "")
    if len(label) > 4:
        out.add(label.upper())
    return out


def firm_cities(firm: dict) -> set[str]:
    """The cities of offices we have already verified, which Florida's file can be matched on."""
    out = set()
    for office in firm.get("offices") or []:
        city = (office.get("city") or "").strip().upper()
        if city:
            out.add(city)
    market = (firm.get("market") or {}).get("city")
    if market:
        out.add(market.upper())
    return out


def scan(path: Path, wanted: dict[str, set[str]]) -> dict[str, list[dict]]:
    """One pass over the snapshot, collecting the rows that could belong to any firm we asked about.

    One pass rather than one per firm, because the file is ten gigabytes uncompressed and a
    thirty-four pass version of this would read it thirty-four times. A row is kept for a firm
    when it shares one of that firm's distinctive tokens, which is deliberately loose: choosing
    between the candidates happens afterwards, where the whole name and the city can be read.
    """
    index: dict[str, set[str]] = {}
    for slug, toks in wanted.items():
        for tok in toks:
            index.setdefault(tok, set()).add(slug)
    hits: dict[str, list[dict]] = {slug: [] for slug in wanted}
    rows = kept = 0
    with zipfile.ZipFile(path) as zf:
        members = [m for m in zf.namelist() if not m.endswith("/")]
        print("snapshot holds %d member file(s): %s" % (len(members), ", ".join(members[:4])))
        for member in members:
            with zf.open(member) as raw:
                for data in io.TextIOWrapper(raw, encoding="latin-1", newline=""):
                    line = data.rstrip("\r\n")
                    if len(line) < RECORD_LEN - 40:
                        continue
                    rows += 1
                    if rows % 2000000 == 0:
                        print("   %d rows, %d kept" % (rows, kept), flush=True)
                    name = field(line, "name")
                    slugs: set[str] = set()
                    for tok in tokens(name):
                        if tok in index:
                            slugs |= index[tok]
                    if not slugs:
                        continue
                    row = {
                        "entity_name": name,
                        "document_number": field(line, "number"),
                        "status": field(line, "status"),
                        "filing_type": field(line, "filing_type"),
                        "city": field(line, "city"),
                        "zip": field(line, "zip"),
                        "file_date": iso_date(field(line, "file_date")),
                    }
                    for slug in slugs:
                        hits[slug].append(row)
                    kept += 1
    print("   %d rows read, %d kept across %d firm(s)" % (rows, kept, len(wanted)))
    return hits


def choose(firm: dict, rows: list[dict]) -> tuple[dict | None, str]:
    """The firm's entity, or nothing and the reason.

    Ranked on how many distinctive tokens are shared, then on whether the entity sits in a city
    where this firm has a verified office, then on how close the whole names are. The city is
    doing the work the professional-entity field does in New York: Florida's file does not say
    whether an entity may practise law, so two entities sharing a surname are told apart by where
    they are.
    """
    active = [r for r in rows if r["status"] == "A"]
    if rows and not active:
        return None, ("every entity matching this name is inactive in the register (%s)"
                      % ", ".join(sorted({r["entity_name"] for r in rows})[:2]))
    toks = distinctive(firm)
    cities = firm_cities(firm)
    whole = norm(firm.get("legal_name") or firm["name"])
    needed = min(2, len(toks)) or 1
    scored = []
    for row in active:
        shared = toks & tokens(row["entity_name"])
        if len(shared) < needed:
            continue
        # A firm's surname plus a street address is the vehicle that holds the office, not the
        # practice. LaBovick Law Group matched "LABOVICK 10 NE 3RD STREET, LLC" on the strength of
        # one shared token and a Miami address, took that entity's filing date, and was published
        # "Not eligible" for being six months old with 1,279 client reviews behind it. Property
        # LLCs are named this way as a rule, so the shape is worth rejecting outright rather than
        # hoping the similarity score catches it.
        if ADDRESS_ENTITY.search(row["entity_name"]):
            continue
        here = 1 if row["city"].upper() in cities else 0
        ratio = difflib.SequenceMatcher(None, whole, norm(row["entity_name"])).ratio()
        scored.append((len(shared), here, ratio, row))
    if not scored:
        return None, "no active entity shares enough of this firm's name"
    scored.sort(key=lambda x: (-x[0], -x[1], -x[2]))
    top = scored[0]
    rivals = [r for r in scored[1:]
              if r[0] == top[0] and r[1] == top[1] and top[2] - r[2] < 0.08]
    if rivals:
        names = ", ".join(r[3]["entity_name"] for r in [top] + rivals[:2])
        return None, "ambiguous, %d entities score alike (%s)" % (len(rivals) + 1, names)
    # A name that is not close and an address that is not the firm's is somebody else with the
    # same surname. Florida has no professional-entity flag to fall back on, so this is the whole
    # guard, and it is deliberately the strict half of the two.
    # In-city used to be enough on its own, with no floor on the name at all, which is how a 0.43
    # match was accepted. A verified office in the same city is real corroboration and should stay
    # cheaper than a cold name match, but not free: a surname is shared by strangers and a city is
    # shared by millions. 0.55 admits the forms a firm genuinely files under, "RICE MURTHA &
    # PSORAS LLC" against "Rice, Murtha & Psoras", and refuses a surname bolted to something else.
    if top[1] and top[2] < 0.55:
        return None, ("best match %s is in the right city but its name is only %.2f like this "
                      "firm's, which a shared surname will do on its own"
                      % (top[3]["entity_name"], top[2]))
    if not top[1] and top[2] < 0.82:
        return None, ("best match %s is in %s, where this firm has no verified office, and the "
                      "name is not close enough to be it under another form"
                      % (top[3]["entity_name"], top[3]["city"].title() or "an unstated city"))
    where = "in a city where this firm has a verified office" if top[1] else "on its name alone"
    return top[3], "matched %s, name similarity %.2f" % (where, top[2])


def years_since(iso: str | None) -> float | None:
    if not iso:
        return None
    try:
        formed = date.fromisoformat(iso[:10])
    except ValueError:
        return None
    return (date.today() - formed).days / 365.25


def apply_gates(firm: dict, entity: dict | None) -> list[str]:
    """G3 and the age half of G6, in the shape scripts/check_ny_dos.py writes them."""
    notes: list[str] = []
    gates = firm.setdefault("gates", {})
    places = (firm.get("digital") or {}).get("places") or {}
    listings = places.get("listing_count") or 0
    reviews = places.get("review_count_total") or 0
    age = years_since(entity["file_date"]) if entity else None
    # A foreign entity's file date is the day it registered to do business in Florida rather than
    # the day the firm was formed, which is the trap TopDog Law set in New York.
    foreign = entity["filing_type"].upper().startswith("FOR") if entity else False

    if (gates.get("G3") or {}).get("attested"):
        notes.append("G3 left as attested")
    elif entity and listings:
        gates["G3"] = {
            "pass": True,
            "evidence": ("%s is an active %s on the Florida register, document %s%s, with %d "
                         "Google-verified location%s"
                         % (entity["entity_name"], entity["filing_type"] or "entity",
                            entity["document_number"],
                            ", filed %s" % entity["file_date"] if entity["file_date"] else "",
                            listings, "" if listings == 1 else "s")),
            "source": DATASET,
            "checked_at": TODAY,
        }
    elif entity:
        gates["G3"] = {
            "pass": False,
            "evidence": ("%s is active on the Florida register, but no physical location has been "
                         "verified yet" % entity["entity_name"]),
            "source": "%s, pending an office check" % DATASET,
            "checked_at": TODAY,
        }
    else:
        gates["G3"] = {
            "pass": False,
            "evidence": ("No matching active entity in the Florida corporate register. Florida "
                         "does not require a sole proprietorship or a general partnership to "
                         "register, so this is a check we could not complete from this source "
                         "rather than evidence against the firm"),
            "source": "%s, partial" % DATASET,
            # Same reasoning as the New York register: a firm that is not obliged to appear here
            # will never appear here, so the gate cannot become a pass by being run again, and
            # leaving it open capped the firm at the bottom tier for its own entity type.
            "unresolvable": ("Florida does not require every law firm to register, so this "
                             "register cannot answer for one that is not obliged to appear in it"),
            "checked_at": TODAY,
        }

    practice = (firm.get("practices") or [{}])[0].get("slug")
    transactional = practice in (TRANSACTIONAL | DOMESTIC)
    if (gates.get("G6") or {}).get("attested"):
        notes.append("G6 left as attested")
    elif age is not None and not foreign:
        enough = listings >= 1 if transactional else reviews >= G6_MIN_REVIEWS
        old = age >= G6_MIN_YEARS
        gates["G6"] = {
            "pass": bool(enough and old),
            "evidence": (
                ("%d Google-verified location%s and %.0f years since the entity was filed in %s. "
                 "This practice is transactional, so the gate asks for a verified listing and the "
                 "year in operation rather than ten reviews, and its %s review%s are scored in "
                 "pillar C instead"
                 % (listings, "" if listings == 1 else "s", age, entity["file_date"][:4],
                    "{:,}".format(reviews), "" if reviews == 1 else "s"))
                if transactional and enough and old else
                ("%s public client review%s and %.0f years since the entity was filed in %s"
                 % ("{:,}".format(reviews), "" if reviews == 1 else "s", age,
                    entity["file_date"][:4]))
                if enough and old else
                ("%s public client review%s, %s the ten this gate asks for, and %.1f years since "
                 "the entity was filed"
                 % ("{:,}".format(reviews), "" if reviews == 1 else "s",
                    "at or above" if enough else "below", age))),
            "source": "Google Places API and %s" % DATASET,
            "checked_at": TODAY,
        }
        # The same correction check_operating.py already carries, for the other source of an age.
        # An entity's filing date says when that entity was registered, not when the practice
        # started: a firm that reorganised, changed name or moved from one LLC to another files
        # again, and the register shows the new date. LaBovick Law Group was published "Not
        # eligible" on one, at half a year old with 1,279 client reviews behind it, and reviews do
        # not accumulate at two thousand a year.
        #
        # So where the review half clears comfortably and only the age fails, the two proxies for
        # "real and trading" disagree, and a gate that has found conflicting evidence has not
        # established that the firm is new. It stays unresolved, and a person can settle it from
        # the firm's own about page.
        if enough and not old:
            gates["G6"]["unresolvable"] = (
                "An entity filing date is when this entity was registered rather than when the "
                "practice began, and a firm that reorganises files again. The review count "
                "contradicts it, so the age is unestablished rather than disproved.")
    elif (gates.get("G6") or {}).get("pass"):
        # Another source has already settled this gate. check_operating.py establishes a year in
        # operation from the domain's registration date, which is a real lower bound, and
        # overwriting it with "no entity matched" took the gate away from twelve New York firms
        # once already.
        notes.append("G6 left as it was: another source has settled it")
    return notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="store the entity and update G3/G6")
    ap.add_argument("--firm", help="a single firm slug")
    ap.add_argument("--force-download", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    paths = sorted((FIRMS / "fl").glob("*.json"))
    if args.firm:
        paths = [p for p in paths if p.stem == args.firm]
        if not paths:
            print("no Florida firm with slug %s" % args.firm, file=sys.stderr)
            return 2
    firms = {}
    for path in paths:
        firm = json.loads(path.read_text(encoding="utf-8"))
        # A sample is a fixture and is skipped. A firm marked not eligible is not: it is a real
        # firm that failed a gate, and the whole point of re-reading a register is that a gate
        # can stop failing. Copying the usual skip from the other scripts locked in this script's
        # own first mistake, because the three firms it wrongly made ineligible were then the
        # three it refused to look at again. "Not eligible" is the harshest thing this directory
        # publishes about a business, and it must never be the one state a check cannot leave.
        if firm.get("status") == "sample":
            continue
        firms[path.stem] = (path, firm)
    if not firms:
        print("no Florida firms to check", file=sys.stderr)
        return 1
    print("%d Florida firm(s) to check against the register" % len(firms))

    snapshot = download(force=args.force_download)
    wanted = {slug: distinctive(firm) for slug, (_, firm) in firms.items()}
    thin = [s for s, t in wanted.items() if not t]
    if thin:
        print("no distinctive token to search on, skipped: %s" % ", ".join(thin))
    hits = scan(snapshot, {s: t for s, t in wanted.items() if t})

    matched = 0
    for slug, (path, firm) in sorted(firms.items()):
        entity, why = choose(firm, hits.get(slug) or [])
        if entity:
            matched += 1
        print("%-46s %s" % (firm["name"][:46], why))
        if entity:
            print("    %s · %s · %s · filed %s"
                  % (entity["entity_name"], entity["document_number"],
                     entity["city"].title(), entity["file_date"] or "unstated"))
        if not args.write:
            continue
        if entity:
            # The field names the collection schema already uses, not new ones. Florida calls
            # this a document number and New York calls it a DOS id, and inventing a second
            # spelling for the same idea would mean every reader of a profile has to know which
            # state it came from before it can look the entity up.
            firm["entity"] = {
                "legal_name": entity["entity_name"],
                "entity_type": entity["filing_type"] or None,
                "dos_id": entity["document_number"],
                "formed": entity["file_date"] or "",
                "source": DATASET,
                "checked_at": TODAY,
            }
        elif (firm.get("entity") or {}).get("source", "").startswith("Corporate Data File"):
            # A stale entity this script wrote and can no longer confirm is removed rather than
            # left standing, which is the rule check_ny_dos.py already follows.
            firm.pop("entity", None)
        for note in apply_gates(firm, entity):
            print("    %s" % note)
        path.write_text(json.dumps(firm, ensure_ascii=False, indent=2) + LF, encoding="utf-8")

    print()
    print("%d of %d firm(s) matched to an active registered entity" % (matched, len(firms)))
    print("source: %s" % DATASET)
    if args.write:
        print("Run scripts/score.py to recompute.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
