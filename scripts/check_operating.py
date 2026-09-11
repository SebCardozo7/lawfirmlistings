#!/usr/bin/env python3
"""
How long a firm has been operating, from a source every state has.

G6 asks for two things: ten or more public client reviews, and at least a year in operation. The
review half comes from the Places API anywhere in the country. The second half was taken from the
entity's formation date in the New York corporations register, which meant that outside New York
the gate could not be settled at all, and in Maryland it will never be: business filings sit
behind egov.maryland.gov, which serves Disallow: / to every crawler.

A domain's registration date settles it instead, read over RDAP. RDAP is the registries' own
successor to WHOIS, it is free, it needs no key, and it answers for every gTLD.

Why this is sound rather than a convenient substitute. G6 is a threshold, not a magnitude: it asks
whether the firm has been going for a year, not for how long. A registration date is a lower bound
on that, and a lower bound is exactly the right instrument for a threshold in this direction. It
can never pass a firm that has not been going a year, because a domain registered last month reads
as last month. It can understate, and it does: mdtrialfirm.com was registered in 2021 for a
practice decades older than that, which is a rebrand rather than a new firm. That costs the firm
nothing here, because 2021 clears a one-year test comfortably, and nothing anywhere else, because
this figure is never published as the firm's age.

What it must not become is pillar A's experience factor. Years since a domain was registered is
not years since admission to the bar, and A2 stays unassessed where no register carries it.

Usage:
    python scripts/check_operating.py
    python scripts/check_operating.py --domains wgk-law.com,ricelawmd.com
"""
from __future__ import annotations

import argparse
import datetime
import glob
import io
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

UA = "LFL-research/1.0 (+https://lawfirmlistings.com; public-records verification)"
RDAP = "https://rdap.org/domain/"
DELAY = 1.0
TODAY = datetime.date.today().isoformat()


def registration_date(domain: str):
    """(iso date, note). RDAP follows the registry, so this is the registry's own record."""
    req = urllib.request.Request(RDAP + domain,
                                 headers={"User-Agent": UA, "Accept": "application/rdap+json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = json.load(response)
    except urllib.error.HTTPError as e:
        return None, "RDAP returned HTTP %s" % e.code
    except Exception as e:                      # a dropped connection is not a finding
        return None, "RDAP lookup failed: %s" % str(e)[:70]

    for event in body.get("events") or []:
        if event.get("eventAction") == "registration" and event.get("eventDate"):
            return event["eventDate"][:10], None
    return None, "RDAP carried no registration event for this domain"


def years_since(iso: str) -> float:
    then = datetime.date.fromisoformat(iso)
    return (datetime.date.today() - then).days / 365.25


G6_MIN_REVIEWS = 10
G6_MIN_YEARS = 1
FIRMS = pathlib.Path(__file__).resolve().parents[1] / "src" / "data" / "firms"
LF = chr(10)   # spelled out because a backslash in this repo's patch scripts keeps collapsing


def review_count(firm) -> int:
    label = ((firm.get("reviews") or {}).get("google") or {}).get("count_label") or ""
    digits = "".join(c for c in label if c.isdigit())
    return int(digits) if digits else 0


def apply_g6(write: bool):
    """Settle G6 wherever it has no source, which outside New York is everywhere.

    A gate the register already passed is left alone: an entity's formation date is better
    evidence of a firm's age than the day somebody bought its domain, and this is a fallback
    rather than a replacement. An attested gate is left alone too.
    """
    # G5 asks whether the site serves over HTTPS, publishes a contact number and names its
    # attorneys. None of that is a New York question, but the function that computes it lives in
    # the New York registry checker, and guarding that script by state left every Maryland firm's
    # website gate unresolved. Imported rather than copied: one implementation, run everywhere.
    from check_ny_registry import apply_g5

    touched = []
    g5 = []
    for path in sorted(FIRMS.rglob("*.json")):
        firm = json.loads(path.read_text(encoding="utf-8"))

        before_g5 = json.dumps((firm.get("gates") or {}).get("G5"), sort_keys=True)
        apply_g5(firm, TODAY)
        g5_changed = json.dumps(firm["gates"].get("G5"), sort_keys=True) != before_g5
        if g5_changed and write:
            io.open(path, "w", encoding="utf-8", newline=LF).write(
                json.dumps(firm, indent=2, ensure_ascii=False) + LF)
        if g5_changed:
            g5.append((firm["slug"], firm["gates"]["G5"]["pass"]))

        gate = (firm.get("gates") or {}).get("G6") or {}
        if gate.get("pass") or gate.get("attested"):
            continue

        oper = firm.get("operating") or {}
        reviews = review_count(firm)
        years = oper.get("years")
        if years is None:
            continue

        enough = reviews >= G6_MIN_REVIEWS
        old_enough = years >= G6_MIN_YEARS
        listings = ((firm.get("digital") or {}).get("places") or {}).get("listing_count") or 0
        where = "%d Google listing%s" % (listings, "" if listings == 1 else "s")

        if enough and old_enough:
            evidence = ("{:,} public client reviews across {}, above the {} minimum, and the "
                        "firm's domain has been registered since {}, so it has been operating "
                        "for more than a year".format(reviews, where, G6_MIN_REVIEWS,
                                                      oper["registered"]))
            new = {"pass": True, "evidence": evidence,
                   "source": "Google Places API and the domain's registration date over RDAP",
                   "checked_at": TODAY}
        else:
            why = []
            if not enough:
                why.append("%d reviews, below the %d this gate asks for" % (reviews, G6_MIN_REVIEWS))
            if not old_enough:
                why.append("the domain has been registered for %.1f year(s)" % years)
            new = {"pass": False, "evidence": " and ".join(why),
                   "source": "Google Places API and the domain's registration date over RDAP",
                   "checked_at": TODAY}

        firm.setdefault("gates", {})["G6"] = new
        touched.append((firm["slug"], new["pass"], new["evidence"][:70]))
        if write:
            io.open(path, "w", encoding="utf-8", newline=LF).write(
                json.dumps(firm, indent=2, ensure_ascii=False) + LF)

    print()
    for slug, ok in g5:
        print("  %-44s G5 %s" % (slug[:44], "pass" if ok else "fail"))
    for slug, ok, ev in touched:
        print("  %-44s G6 %s  %s" % (slug[:44], "pass" if ok else "fail", ev))
    print(LF + "%d profile(s) %s" % (len(touched), "updated" if write else "would be updated"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains", help="comma-separated; default is every staging record")
    ap.add_argument("--staging", default=".crawl")
    ap.add_argument("--gates", action="store_true", help="also settle G6 on the profiles")
    ap.add_argument("--gates-only", action="store_true", help="skip the lookups, only set G6")
    args = ap.parse_args()

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    if args.gates_only:
        apply_g6(write=True)
        return 0

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    staging = pathlib.Path(args.staging)
    if args.domains:
        files = [staging / (d.strip() + ".json") for d in args.domains.split(",") if d.strip()]
    else:
        files = sorted(pathlib.Path(p) for p in glob.glob(str(staging / "*.json")))

    found = failed = 0
    for path in files:
        if not path.exists():
            print("%-38s no staging record" % path.stem)
            continue
        record = json.loads(path.read_text(encoding="utf-8"))
        domain = record["domain"]

        iso, note = registration_date(domain)
        time.sleep(DELAY)
        if iso:
            block = {
                "registered": iso,
                "years": round(years_since(iso), 1),
                "source": "Domain registration date over RDAP, which is a lower bound on how "
                          "long the firm has been operating rather than its founding date",
                "checked_at": TODAY,
            }
            found += 1
            print("%-38s registered %s  (%.1f years)" % (domain, iso, block["years"]))
        else:
            block = {"registered": None, "years": None, "source": "unavailable",
                     "note": note, "checked_at": TODAY}
            failed += 1
            print("%-38s %s" % (domain, note))

        fresh = json.loads(path.read_text(encoding="utf-8"))   # four scripts share this file
        fresh["operating"] = block
        io.open(path, "w", encoding="utf-8", newline="\n").write(
            json.dumps(fresh, ensure_ascii=False, indent=2) + "\n")

    print("\n%d dated · %d without a registration record" % (found, failed))
    print("A lower bound settles a one-year threshold. It is not the firm's age and is never")
    print("published as one.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
