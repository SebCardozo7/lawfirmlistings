#!/usr/bin/env python3
"""
G3 outside New York: is the firm a registered legal entity, and does the state let us ask?

G3 wants two things, a registered entity and a confirmed physical office. Google Places settles
the office. The entity is a state record, and until now only New York had one here, through the
Active Corporations register on data.ny.gov. Everywhere else build_profiles.py wrote "Google
Places API (partial)", meaning the office half is done and the entity half is not, and "partial"
reads as unfinished work to the scoring engine. So it blocked, and the whole of Maryland, Florida
and Indiana sat at Listed on a gate nobody had asked.

Asking turns out to have four different answers, and this file is where they live.

    Oregon      the Secretary of State publishes its whole active business registry as open
                data, 508,000 rows with the registry number, the entity type, the registration
                date and the address. data.oregon.gov/resource/tckn-sxa6
    Texas       the Comptroller publishes Active Franchise Taxpayers, which carries the
                Secretary of State file number, the charter date and the status code for every
                entity that pays franchise tax. data.texas.gov/resource/9cir-efmm
    Florida     the register is published in full as data files, on an SFTP host that answers
                an anonymous request with a 401. Reading it is work we owe, so Florida's G3
                stays pending and keeps blocking, which is the honest reading.
    Maryland    nothing queryable. SDAT's entity search is a form, its bulk data is sold, and
                the open data portal publishes a count of businesses rather than the register.
    Indiana     nothing queryable. INBiz answers an automated reader with a 403 and the
                Secretary of State's business search answers with a 202 and an empty body,
                which is a bot challenge. We do not work around either.
    Massachusetts  nothing queryable. The Secretary of the Commonwealth's corporate search
                answers 403 and redirect-loops, and the state runs no open data portal for it.

The distinction between the last two and "partial" is not cosmetic, and it is the reason this
script exists. A gate we have not got to yet should block a certification. A gate the state does
not permit anybody to check should not, because no firm in Maryland can do anything about it, and
treating it as unfinished work means scoring our own coverage as if it were the firm's conduct.
scripts/score.py already understands "no queryable source"; nothing was writing it.

Texas carries one caveat that travels into the evidence line. The franchise tax does not reach
sole proprietorships or general partnerships, so a firm's absence from that list is not evidence
that it is unregistered, only that we could not confirm it there. A match is strong and a miss
says nothing.

Usage:
    python scripts/check_entity.py --state OR
    python scripts/check_entity.py --state TX --write
    python scripts/check_entity.py --state MD --write     # records that there is no source
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
import urllib.error
import urllib.parse
import urllib.request

UA = "LFL-research/1.0 (+https://lawfirmlistings.com; public-records verification)"
DELAY = 1.0
TODAY = datetime.date.today().isoformat()
ROOT = pathlib.Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"
LF = chr(10)

REGISTERS = {
    "OR": {
        "host": "data.oregon.gov",
        "resource": "tckn-sxa6",
        "name": "business_name",
        "fields": "registry_number,business_name,entity_type,registry_date,city,state",
        "date": "registry_date",
        "id": "registry_number",
        "city": "city",
        "source": ("Active Businesses register (data.oregon.gov tckn-sxa6), published as open "
                   "data by the Oregon Secretary of State"),
        "body": "the Oregon Secretary of State",
    },
    "TX": {
        "host": "data.texas.gov",
        "resource": "9cir-efmm",
        "name": "taxpayer_name",
        "fields": ("taxpayer_name,taxpayer_city,taxpayer_organizational_type,sos_charter_date,"
                   "sos_status_code,right_to_transact_business_code,"
                   "secretary_of_state_sos_or_coa_file_number"),
        "date": "sos_charter_date",
        "id": "secretary_of_state_sos_or_coa_file_number",
        "city": "taxpayer_city",
        "source": ("Active Franchise Taxpayers (data.texas.gov 9cir-efmm), published as open "
                   "data by the Texas Comptroller of Public Accounts, which carries the "
                   "Secretary of State file number, charter date and status"),
        "body": "the Texas Comptroller of Public Accounts",
        "caveat": (" The franchise tax does not reach a sole proprietorship or a general "
                   "partnership, so this register can confirm an entity and cannot rule one out."),
    },
}

# A state that does publish its register, to somebody who has arranged access. This is not the
# same as having no source, and the difference is the whole point of this file: Florida's G3 stays
# "partial", which blocks a certification, because reading it is work we owe rather than a door
# the state has closed. Recorded here so the next person does not have to find it out again.
PENDING = {
    "FL": ("Florida does publish its corporate register in full, as fixed-width data files, but "
           "the download sits on an SFTP host that answers an anonymous request with a 401 and "
           "needs an account arranged with the Division of Corporations. Its web search is a "
           "form on a host that answers a crawler with a 403. So Florida's G3 stays pending, "
           "which is honest: the record exists and we have not read it."),
}

NO_SOURCE = {
    "MD": ("Maryland publishes no business register we can query. SDAT's entity search is a "
           "form rather than a dataset, its bulk data is sold rather than published, and the "
           "state's open data portal carries a count of businesses instead of the register. "
           "This is a limit of the published record and not something the firm can change."),
    "MA": ("Massachusetts publishes no business register we can query. The Secretary of the "
           "Commonwealth's corporate search answers a request for its robots file with a 403 "
           "and its search page with a redirect loop, and the state runs no open data portal "
           "carrying the register. This is a limit of the published record and not something "
           "the firm can change."),
    "IN": ("Indiana publishes no business register we can query. INBiz answers an automated "
           "reader with a 403 and the Secretary of State's business search answers with a 202 "
           "and an empty body, which is a bot challenge, and we do not work around either. "
           "This is a limit of the published record and not something the firm can change."),
}

# Endings that are the form of the entity rather than its name, so "Rizk Law, P.C." and "RIZK
# LAW" are one firm. Order matters only in that the longest has to go first.
SUFFIX = re.compile(
    r"[,.]?\s*(?:p\.?l\.?l\.?c|l\.?l\.?p|l\.?l\.?c|p\.?l\.?l\.?p|p\.?c|p\.?a|inc|incorporated|"
    r"corp(?:oration)?|company|co|ltd|chartered|a\s+professional\s+corporation)\.?$", re.I)


def normalise(name: str) -> str:
    out = re.sub(r"\s+", " ", (name or "").replace("&", "and")).strip()
    for _ in range(3):                      # "Firm Name, PLLC, P.C." happens
        stripped = SUFFIX.sub("", out).strip(" ,.")
        if stripped == out:
            break
        out = stripped
    out = re.sub(r"[^A-Za-z0-9 ]", " ", out)
    return re.sub(r"\s+", " ", out).strip().upper()


# Words that are what the business does rather than which business it is. "Jay Murray Law Firm"
# and "JAY MURRAY LAW GROUP, P.C." are one practice in Dallas, and a comparison of the whole
# string says they are two. What has to match is the part that names somebody.
GENERIC = {
    "law", "laws", "firm", "firms", "group", "office", "offices", "associates", "associate",
    "attorney", "attorneys", "lawyer", "lawyers", "legal", "injury", "injuries", "accident",
    "accidents", "trial", "partners", "the", "and", "of", "at", "pllc", "pc", "llp", "llc",
}


def core(name: str) -> str:
    """The distinctive part of a normalised name, or the whole of it if that leaves nothing."""
    # Lowercased for the comparison because normalise() upper-cases everything it returns, and
    # the first version of this compared "LAW" against a set of lowercase words and stripped
    # nothing at all.
    tokens = [t for t in name.split() if t.casefold() not in GENERIC]
    return " ".join(tokens) if tokens else name


def distinctive(core_name: str) -> bool:
    """Is this distinctive enough to match on alone?

    "J. Alexander Law Firm" reduces to "J ALEXANDER", and that matched "J ALEXANDER AND
    ASSOCIATES, PLLC", chartered four months ago, against a firm with 670 reviews. An initial is
    not an identification, which is the same rule scripts/check_discipline.py had to learn about
    a first name. So a core with a single-letter token, or with fewer than two tokens, is not
    enough on its own and the firm falls through to no match.
    """
    tokens = core_name.split()
    return len(tokens) >= 2 and all(len(t.strip(".")) > 1 for t in tokens)


def fetch(spec, where):
    query = {"$select": spec["fields"], "$where": where, "$limit": 40}
    url = "https://%s/resource/%s.json?" % (spec["host"], spec["resource"])
    url += urllib.parse.urlencode(query)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < 3:
                time.sleep(10 * (attempt + 1))
                continue
            raise
    return []


def office_cities(firm) -> set[str]:
    out = set()
    for office in firm.get("offices") or []:
        m = re.search(r",\s*([A-Za-z .'-]+),\s*[A-Z]{2}\s+\d", office.get("address") or "")
        if m:
            out.add(m.group(1).strip().upper())
    return out


def look_up(firm, spec):
    """(row, why) for the register row that is this firm, or (None, why not).

    A name match alone is not enough: Oregon has a Rizk Law and a Rizk Transportation, and Texas
    has five Witherite entities of which one is the law firm. So the candidate has to agree with
    the firm on the city as well, unless its normalised name is identical, which is the case
    where there is nothing left to disagree about.
    """
    wanted = normalise(firm["name"])
    if len(wanted) < 4:
        return None, "the firm's name is too short to match on"
    escaped = wanted.replace("'", "''")
    rows = fetch(spec, "upper(%s) like '%%%s%%'" % (spec["name"], escaped))
    time.sleep(DELAY)
    if not rows:
        # A register writes "and" where a firm writes "&", and drops the comma before PLLC. The
        # leading two words are the part that does not vary, so they are the second attempt.
        lead = " ".join(wanted.split()[:2])
        if len(lead) < 4:
            return None, "no entity whose name contains the firm's name"
        rows = fetch(spec, "upper(%s) like '%%%s%%'" % (spec["name"], lead.replace("'", "''")))
        time.sleep(DELAY)
    if not rows:
        return None, "no entity whose name contains the firm's name"

    cities = office_cities(firm)
    seen, best = set(), None
    for row in rows:
        key = row.get(spec["id"]) or row.get(spec["name"])
        if key in seen:
            continue
        seen.add(key)
        name = normalise(row.get(spec["name"]) or "")
        city = (row.get(spec["city"]) or "").strip().upper()
        if name == wanted:
            return row, "exact"
        if name.startswith(wanted) and (not cities or city in cities):
            best = best or (row, "the register's name begins with the firm's and the city agrees")
        # The distinctive halves agree and so does the city. This is what tells "Jay Murray Law
        # Firm" and "JAY MURRAY LAW GROUP, P.C." in Dallas apart from "JOE GUERRERO LAW FIRM" in
        # Houston, which shares a surname with a Dallas firm and nothing else.
        if (core(name) == core(wanted) and cities and city in cities
                and distinctive(core(wanted))):
            best = best or (row, "the distinctive part of the name matches and the city agrees")
    if best:
        return best
    return None, ("%d entity name(s) contain the firm's name and none of them agrees on both "
                  "the name and the city" % len(seen))


def iso(value: str | None) -> str | None:
    return (value or "")[:10] or None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", required=True,
                    choices=sorted(set(REGISTERS) | set(NO_SOURCE) | set(PENDING)))
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    if args.state in PENDING:
        print(PENDING[args.state])
        print()
        print("Nothing written. G3 stays as it is for %s." % args.state)
        return 0

    spec = REGISTERS.get(args.state)
    touched = 0
    for path in sorted(FIRMS.rglob("*.json")):
        firm = json.load(io.open(path, encoding="utf-8"))
        if (firm.get("market") or {}).get("state") != args.state:
            continue
        gate = (firm.get("gates") or {}).get("G3") or {}
        if gate.get("pass") or gate.get("attested"):
            print("%-44s G3 already settled" % firm["slug"][:44])
            continue

        listings = ((firm.get("digital") or {}).get("places") or {}).get("listing_count") or 0
        offices = len(firm.get("offices") or [])

        if spec is None:
            new = {
                "pass": False,
                "source": "no queryable source",
                "checked_at": TODAY,
                "evidence": ("%d physical location%s verified on Google Business Profile. %s"
                             % (listings or offices, "" if (listings or offices) == 1 else "s",
                                NO_SOURCE[args.state])),
            }
            print("%-44s no source in %s" % (firm["slug"][:44], args.state))
        else:
            try:
                row, why = look_up(firm, spec)
            except Exception as e:                        # a register that will not answer today
                print("%-44s register unreachable (%s)" % (firm["slug"][:44], str(e)[:40]))
                continue
            if not row:
                # "unavailable", not a failure. Reading the register and not finding the firm is
                # not a finding that the firm is unregistered: the Texas franchise tax does not
                # reach a sole proprietorship or a general partnership, an Oregon entity may be
                # registered under a name this matcher cannot tie to the one the firm trades
                # under, and neither is the firm's doing. Filed as a failure it labelled eleven
                # Dallas firms and six Portland ones Not eligible, which is a sentence about
                # them, on the strength of our own name matching.
                new = {
                    "pass": False,
                    "source": "unavailable",
                    "checked_at": TODAY,
                    "evidence": ("%d physical location%s verified on Google Business Profile. "
                                 "We read the %s and could not identify this firm in it: %s. A "
                                 "miss there is not evidence that the firm is unregistered, so "
                                 "this gate is unresolved rather than failed.%s"
                                 % (listings or offices,
                                    "" if (listings or offices) == 1 else "s",
                                    spec["source"], why, spec.get("caveat", ""))),
                }
                print("%-44s no match  (%s)" % (firm["slug"][:44], why[:40]))
            else:
                registered = iso(row.get(spec["date"]))
                status = (row.get("sos_status_code") or "").strip()
                transact = (row.get("right_to_transact_business_code") or "").strip()
                # Every row in Active Franchise Taxpayers carries the right to transact, so that
                # is the field that means something; the Secretary of State status letter is A
                # for most and R for some, the dataset documents neither, and a letter nobody
                # here can explain must not decide a gate. It is printed, not interpreted.
                active = args.state != "TX" or transact == "A"
                parts = ["%s is registered with %s" % (row.get(spec["name"]), spec["body"])]
                if row.get(spec["id"]):
                    parts.append("under number %s" % row[spec["id"]])
                if registered:
                    parts.append("since %s" % registered)
                if args.state == "TX":
                    parts.append("listed as an active franchise taxpayer with the right to "
                                 "transact business in Texas (Secretary of State status code %s)"
                                 % (status or "not given") if active else
                                 "without the right to transact business (code %s)" % transact)
                evidence = (", ".join(parts)
                            + ", and %d physical location%s verified on Google Business Profile."
                            % (listings or offices, "" if (listings or offices) == 1 else "s"))
                new = {"pass": bool(active and (listings or offices)),
                       "source": spec["source"], "checked_at": TODAY, "evidence": evidence}
                if registered:
                    new["registered"] = registered
                print("%-44s %s  %s %s" % (firm["slug"][:44],
                                           "PASS" if new["pass"] else "fail",
                                           (row.get(spec["name"]) or "")[:34], registered or ""))

        firm.setdefault("gates", {})["G3"] = new
        touched += 1
        if args.write:
            io.open(path, "w", encoding="utf-8", newline=LF).write(
                json.dumps(firm, ensure_ascii=False, indent=2) + LF)

    print()
    print("%d profile(s) %s" % (touched, "updated" if args.write else "would be updated"))
    if touched:
        print("Run scripts/score.py --write to recompute.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
