#!/usr/bin/env python3
"""G3 for Texas, from the Comptroller's list of active franchise taxpayers.

Every one of Houston's seventy five firms sat at Listed, and not one of them for anything a firm
had done. Texas publishes no attorney register and no disciplinary register we can query, so G1
and G2 are already excused there as facts about the state. That left G3 reading "Secretary of
State registration still to confirm" on all seventy five, which is work we owed rather than a
finding, and an owed check holds a firm at the bottom tier. This is that work.

The source is the Texas Comptroller of Public Accounts, who publishes every active franchise
taxpayer as open data, refreshed daily, about 3.4 million rows. A law firm organised as a PLLC, a
PC or an LLP pays franchise tax and appears here with its Secretary of State file number and, in
most cases, its charter date.

Three things about this file decide how it may be read.

**An absence proves nothing.** The list holds active franchise taxpayers, so a sole proprietor, a
general partnership and an exempt entity are all missing from it by design. A firm we cannot find
is a check this source cannot answer, never a firm that failed. G3 is written unresolvable in that
case, which is the state New York's general partnerships and Florida's unregistered firms already
established: it neither blocks nor passes, and the profile says why.

**A name is not enough to identify anybody.** In 3.4 million rows somebody shares every surname.
Matching on name similarity alone put Dinh Law Firm together with a laboratory, DeHoyos Accident
Attorneys with a trucking company, and Adley Law Firm with an unrelated HADLEY LLC. So a row is
only accepted when the name is near identical, or when the name is close and the row sits at the
postcode of an office we have already verified on the firm's Google listing. That corroboration is
the same lesson Florida taught when its matcher took a firm's landlord for the firm.

The companion entities are the sharper version of the same trap, because they match well. Arnold
& Itkin appears three times: the firm itself, ARNOLD & ITKIN FOUNDATION, which is its charity, and
ARNOLD & ITKIN GP, LLC, which is its general partner. Only one of the three is the law firm, and
the other two are the two carrying a charter date, so a matcher reaching for the row with a date
picks a charity every time.

**One date in this file is not a date.** Texas rewrote its franchise tax with effect from 1
January 2008, and every entity that already existed was entered with that day as the start of its
responsibility. 96,792 rows carry it, against roughly three hundred on an ordinary day. It means
"was already trading in 2007" and it is published here as that and never as a year of formation.

Usage:
    python scripts/check_tx_register.py                       # report, write nothing
    python scripts/check_tx_register.py --write
    python scripts/check_tx_register.py --firm zehl-associates --write
"""
from __future__ import annotations

import argparse
import difflib
import glob
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from check_fl_register import norm, tokens, years_since  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"
RESOURCE = "https://data.texas.gov/resource/9cir-efmm.json"
DELAY = 1.0
UA = "LFL-research/1.0 (+https://lawfirmlistings.com; public register read)"
LF = chr(10)
TODAY = date.today().isoformat()

DATASET = ("Active Franchise Taxpayers, published daily as open data by the Texas Comptroller of "
           "Public Accounts")

# The day Texas's rewritten franchise tax took effect. Every entity already trading was entered
# with it, so it is a lower bound shared by 96,792 taxpayers and a fact about none of them.
REFORM_DAY = "2008-01-01"

G6_MIN_REVIEWS = 10
G6_MIN_YEARS = 1.0
# Same two exemptions the other register checks carry. Noted rather than imported because each
# script states the rule it applies, and this is the fourth copy of it in the pipeline.
TRANSACTIONAL = {"real-estate"}
DOMESTIC = {"family-law"}

# Near identical, or close with the postcode of an office we verified ourselves. Measured against
# Houston's seventy five: at 0.55, which is Florida's floor, this file returns a wrong firm often
# enough to be useless, because Florida's register holds only Florida companies and this one holds
# every taxpayer in the state.
NEAR = 0.85
CLOSE = 0.62

# Larger than any single distinctive word returns. The widest token across the Texas cohort is
# "DINH" at 120 rows statewide, so a page this size is the whole answer rather than a window on it,
# and a run that hits the ceiling says so instead of quietly dropping the rest.
PAGE = 1000

GENERIC = {
    "LAW", "LAWS", "FIRM", "FIRMS", "OFFICE", "OFFICES", "GROUP", "LLP", "LLC", "PLLC", "PC",
    "PLC", "LP", "AND", "THE", "OF", "ASSOCIATES", "ASSOCIATION", "PARTNERS", "ATTORNEY",
    "ATTORNEYS", "LAWYER", "LAWYERS", "INJURY", "PERSONAL", "ACCIDENT", "TRIAL", "LEGAL",
    "COUNSEL", "PA", "PLLP", "CO", "INC", "ESQ", "CHARTERED", "PROFESSIONAL",
    "TEXAS", "TX", "HOUSTON", "DALLAS", "AUSTIN", "SAN", "ANTONIO",
    "ABOGADO", "ABOGADOS", "ACCIDENTES", "EN", "DE",
}

# An entity that sits beside a law firm and is not it. These match the firm's name well, which is
# what makes them dangerous rather than merely wrong.
COMPANION = re.compile(
    r"\b(FOUNDATION|CHARITIES|CHARITABLE|GP|MANAGEMENT|PROPERTIES|PROPERTY|REALTY|HOLDINGS|"
    r"INVESTMENTS|VENTURES|PARTNERS LP|PAC|TRUST|TRANSPORTATION|LABS|LABORATORY|CONSULTING|"
    r"STAFFING|MEDIA|MARKETING)\b")

# Organisational types the Comptroller assigns. CN is a non-profit corporation, which is the shape
# a law firm's charitable arm takes and never the shape of the firm.
NONPROFIT_TYPES = {"CN", "AN"}


class SourceSilent(Exception):
    """The register did not answer. This is never an answer about a firm."""


def call(params: dict, tries: int = 5) -> list[dict]:
    """One Socrata query.

    Raises rather than returning an empty list when the service will not answer, because the two
    are opposite findings and this returned the same thing for both. An unauthenticated caller is
    throttled here, so a run would drop a handful of firms to a timeout, write "no matching entity"
    on them, and produce a different set of firms the next time. Two runs half an hour apart
    disagreed about Abraham Watkins, Adame Garza and Attorney Brian White, and each disagreement
    was a sentence published on a profile about a firm's registration.
    """
    url = RESOURCE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    last = ""
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as e:
            last = "HTTP %s" % e.code
            if e.code in (400, 404):      # our query is wrong, and retrying will not mend it
                raise SourceSilent(last) from e
        except Exception as e:            # throttling here arrives as a timeout or a reset
            last = type(e).__name__
        time.sleep(2 ** attempt)
    raise SourceSilent(last or "no answer")


def distinctive(firm: dict) -> list[str]:
    """The words in a firm's name that could identify it, longest first, then alphabetically.

    The second half of that ordering is the whole point. Sorting a set by length alone leaves ties
    to the set's iteration order, which Python varies between processes, so "Adame Garza" searched
    on ADAME one run and GARZA the next and the firm was found only on one of them. Four firms
    flipped between two runs this way, every one of them a name whose words are the same length.
    """
    out = {t for t in tokens(firm["name"]) | tokens(firm.get("legal_name") or "")
           if t not in GENERIC and len(t) > 2}
    return sorted(out, key=lambda t: (-len(t), t))


def office_zips(firm: dict) -> set[str]:
    """Postcodes of offices already verified on the firm's Google listing."""
    out = set()
    for office in firm.get("offices") or []:
        for m in re.finditer(r"\b(\d{5})(?:-\d{4})?\b", office.get("address") or ""):
            out.add(m.group(1))
    return out


def office_numbers(firm: dict) -> set[str]:
    """Street numbers of those same offices, which corroborate a postcode rather than replace it."""
    out = set()
    for office in firm.get("offices") or []:
        m = re.match(r"\s*(\d+)\b", office.get("address") or "")
        if m:
            out.add(m.group(1))
    return out


def lookup(firm: dict) -> tuple[list[dict], bool]:
    """(candidate rows, whether the service truncated the answer).

    Every query is ordered and asks for more rows than any firm name returns, because an unordered
    slice makes this check non-deterministic and it already was. "Dinh" appears in 120 taxpayer
    names statewide, we were asking for 40 of them in no particular order, and the firm's own row
    was inside that window on one run and outside it on the next. A register check that answers
    differently on Tuesday is not a register check.

    The city narrows it first, because 120 rows statewide is 36 in Houston, and a firm registered
    from a suburb is then still reachable by the statewide pass.
    """
    toks = [t.replace("'", "''") for t in distinctive(firm)][:2]
    if not toks:
        return [], False
    city = ((firm.get("market") or {}).get("city") or "").upper()

    def ask(where):
        rows = call({"$where": where, "$order": "taxpayer_name", "$limit": PAGE})
        return rows, len(rows) >= PAGE

    # Each distinctive word is asked for on its own rather than welded into one pattern. A pattern
    # built from two of them carries their order, and the register writes a name in whichever order
    # it likes: "%ADAME%GARZA%" finds "ADAME * GARZA, LLP" and "%GARZA%ADAME%" finds nothing, for
    # the same firm. Both answers are then merged, so which word came first stops mattering.
    found, truncated = {}, False
    for scope in ([" and taxpayer_city='%s'" % city] if city else []) + [""]:
        for tok in toks:
            rows, cut = ask("upper(taxpayer_name) like '%%%s%%'%s" % (tok, scope))
            truncated = truncated or cut
            for row in rows:
                found.setdefault(row.get("taxpayer_number") or row.get("taxpayer_name"), row)
            time.sleep(DELAY)
        if found:
            break                      # the city answered, so the whole state need not be asked
    # Every attempt answered, and between them they answered with nothing. That is a finding.
    return sorted(found.values(), key=lambda r: r.get("taxpayer_name") or ""), truncated


def choose(firm: dict, rows: list[dict]) -> tuple[dict | None, str, float]:
    """The one row we would stand behind, with how it was identified."""
    want = norm(firm["name"])
    zips, numbers = office_zips(firm), office_numbers(firm)
    firm_is_companion = bool(COMPANION.search(want))
    best, score, how = None, 0.0, ""
    for row in rows:
        name = norm(row.get("taxpayer_name") or "")
        if not name:
            continue
        if COMPANION.search(name) and not firm_is_companion:
            continue
        if (row.get("taxpayer_organizational_type") or "") in NONPROFIT_TYPES:
            continue
        ratio = difflib.SequenceMatcher(None, want, name).ratio()
        zip_ok = (row.get("taxpayer_zip") or "")[:5] in zips
        street = re.match(r"\s*(\d+)\b", row.get("taxpayer_address") or "")
        street_ok = bool(street and street.group(1) in numbers)
        if ratio >= NEAR:
            label = "the name matches"
        elif ratio >= CLOSE and zip_ok:
            label = "the name is close and the address is one we verified"
        else:
            continue
        if zip_ok and street_ok and "address" not in label:
            label += ", at an address we verified"
        if ratio > score:
            best, score, how = row, ratio, label
    return best, how, score


def registered_on(row: dict) -> tuple[str | None, bool]:
    """(date, is_a_formation_date).

    The charter date is when the Secretary of State chartered the entity. When there is none, and
    about seven per cent of rows have none because an LLP files differently, the franchise
    responsibility date is the next best thing and is a later bound rather than a formation date.
    The reform day is neither: it is shared by 96,792 taxpayers and says only that the entity was
    already trading in 2007.
    """
    charter = (row.get("sos_charter_date") or "")[:10]
    if charter:
        return charter, True
    responsibility = (row.get("responsibility_beginning_date") or "")[:10]
    if responsibility and responsibility != REFORM_DAY:
        return responsibility, False
    return None, False


def apply_gates(firm: dict, row: dict | None, how: str) -> list[str]:
    """G3, and the age half of G6, in the shape the other register checks write them."""
    notes: list[str] = []
    gates = firm.setdefault("gates", {})
    places = (firm.get("digital") or {}).get("places") or {}
    listings = places.get("listing_count") or 0
    reviews = places.get("review_count_total") or 0

    when, is_formation = registered_on(row) if row else (None, False)
    pre_reform = bool(row) and not when and (
        (row.get("responsibility_beginning_date") or "")[:10] == REFORM_DAY)
    active = bool(row) and row.get("right_to_transact_business_code") == "A"
    age = years_since(when) if is_formation else None

    if (gates.get("G3") or {}).get("attested"):
        notes.append("G3 left as attested")
    elif row and active and listings:
        sos = row.get("secretary_of_state_sos_or_coa_file_number")
        gates["G3"] = {
            "pass": True,
            "evidence": ("%s holds an active franchise tax responsibility in Texas with the right "
                         "to transact business%s%s, and %d Google-verified location%s. "
                         "Identified because %s"
                         % (row["taxpayer_name"],
                            ", Secretary of State file %s" % sos if sos else "",
                            (", chartered %s" % when) if is_formation else
                            (", trading since at least 2007") if pre_reform else "",
                            listings, "" if listings == 1 else "s", how)),
            "source": DATASET,
            "checked_at": TODAY,
        }
    elif row and active:
        gates["G3"] = {
            "pass": False,
            "evidence": ("%s holds an active franchise tax responsibility in Texas, but no "
                         "physical location has been verified yet" % row["taxpayer_name"]),
            "source": "%s, pending an office check" % DATASET,
            "checked_at": TODAY,
        }
    else:
        gates["G3"] = {
            "pass": False,
            "evidence": ("No matching entity on the Texas list of active franchise taxpayers. "
                         "Texas does not require a sole proprietorship or a general partnership to "
                         "pay franchise tax, and an exempt entity is left off as well, so this is "
                         "a check this source cannot complete rather than evidence against the "
                         "firm. The state's own SOSDirect service can settle it for a fee"),
            "source": "%s, partial" % DATASET,
            # The same reasoning as Florida and New York. A firm with no obligation to appear here
            # will never appear here, so running the check again cannot turn it into a pass, and
            # leaving it open held every Houston firm at the bottom tier for its own entity type.
            "unresolvable": ("Texas lists only active franchise taxpayers, so a firm that is not "
                             "obliged to be one cannot be found here however often we look"),
            "checked_at": TODAY,
        }

    practice = (firm.get("practices") or [{}])[0].get("slug")
    transactional = practice in (TRANSACTIONAL | DOMESTIC)
    if (gates.get("G6") or {}).get("attested"):
        notes.append("G6 left as attested")
    elif age is not None:
        enough = listings >= 1 if transactional else reviews >= G6_MIN_REVIEWS
        old = age >= G6_MIN_YEARS
        gates["G6"] = {
            "pass": bool(enough and old),
            "evidence": (
                ("%d Google-verified location%s and %.0f years since the entity was chartered in "
                 "%s. This practice is transactional, so the gate asks for a verified listing and "
                 "the year in operation rather than ten reviews, and its %s review%s are scored in "
                 "pillar C instead"
                 % (listings, "" if listings == 1 else "s", age, when[:4],
                    "{:,}".format(reviews), "" if reviews == 1 else "s"))
                if transactional and enough and old else
                ("%s public client review%s and %.0f years since the entity was chartered in %s"
                 % ("{:,}".format(reviews), "" if reviews == 1 else "s", age, when[:4]))
                if enough and old else
                ("%s public client review%s, %s the ten this gate asks for, and %.1f years since "
                 "the entity was chartered"
                 % ("{:,}".format(reviews), "" if reviews == 1 else "s",
                    "at or above" if enough else "below", age))),
            "source": "Google Places API and %s" % DATASET,
            "checked_at": TODAY,
        }
        # The correction check_operating.py, check_ny_dos.py and check_fl_register.py all carry. A
        # charter date is when this entity was registered, not when the practice began: a firm that
        # reorganises or changes name charters again and the register shows the new date. Where the
        # reviews clear comfortably and only the age fails, the two proxies disagree, and a gate
        # holding conflicting evidence has not established that the firm is new.
        if enough and not old:
            gates["G6"]["unresolvable"] = (
                "A charter date is when this entity was registered rather than when the practice "
                "began, and a firm that reorganises charters again. The review count contradicts "
                "it, so the age is unestablished rather than disproved.")
    elif pre_reform and not (gates.get("G6") or {}).get("pass"):
        # Trading in 2007 clears a one year threshold by nineteen years, and that much is certain
        # even though the day itself is not a fact about this firm.
        enough = listings >= 1 if transactional else reviews >= G6_MIN_REVIEWS
        if enough:
            gates["G6"] = {
                "pass": True,
                "evidence": ("%s public client review%s, and the entity was already trading in "
                             "Texas before 2008, which is when the state rewrote its franchise tax "
                             "and entered every existing taxpayer on the same day. The exact year "
                             "of formation is not in this file"
                             % ("{:,}".format(reviews), "" if reviews == 1 else "s")),
                "source": "Google Places API and %s" % DATASET,
                "checked_at": TODAY,
            }
    elif (gates.get("G6") or {}).get("pass"):
        notes.append("G6 left as it was: another source has settled it")
    return notes


def store(firm: dict, row: dict | None, how: str, score: float) -> None:
    """Keep what was read, so a later run and a reader can both see what this was built on."""
    if not row:
        firm["tx_register"] = {
            "matched": False,
            "source": DATASET,
            "note": ("Texas lists only active franchise taxpayers, so a firm with no franchise tax "
                     "obligation is absent by design"),
            "checked_at": TODAY,
        }
        return
    when, is_formation = registered_on(row)
    firm["tx_register"] = {
        "matched": True,
        "taxpayer_name": row.get("taxpayer_name"),
        "taxpayer_number": row.get("taxpayer_number"),
        "sos_file_number": row.get("secretary_of_state_sos_or_coa_file_number"),
        "chartered": when if is_formation else None,
        "trading_before_2008": (not is_formation and
                                (row.get("responsibility_beginning_date") or "")[:10] == REFORM_DAY),
        "right_to_transact": row.get("right_to_transact_business_code") == "A",
        "city": row.get("taxpayer_city"),
        "identified_by": how,
        "name_similarity": round(score, 3),
        "source": DATASET,
        "checked_at": TODAY,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="store the entity and update G3 and G6")
    ap.add_argument("--firm", help="a single firm slug")
    ap.add_argument("--state", default="tx", help="the state directory to read")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    paths = sorted(Path(p) for p in glob.glob(str(FIRMS / args.state / "*.json")))
    if args.firm:
        paths = [p for p in paths if p.stem == args.firm]
        if not paths:
            print("no firm with slug %r under %s" % (args.firm, args.state))
            return 1

    matched = unresolved = skipped = silent = 0
    for path in paths:
        firm = json.loads(path.read_text(encoding="utf-8"))
        try:
            rows, truncated = lookup(firm)
        except SourceSilent as e:
            # Leave the firm exactly as it was. A gate that says "no matching entity" because a
            # server timed out is a claim about the firm drawn from nothing.
            silent += 1
            print("%-42s register did not answer (%s), left untouched" % (firm["name"][:42], e))
            continue
        time.sleep(DELAY)
        row, how, score = choose(firm, rows)
        if truncated and not row:
            # A full page means the register had more to say and we stopped reading. Finding the
            # firm inside a truncated answer is still finding it, but not finding it there is not
            # an absence, and "no matching entity" is what an absence would be written as.
            # "Rad Law Firm" searches on RAD, which is inside thousands of unrelated names.
            silent += 1
            print("%-42s too common a name to search on: the register had more rows than we "
                  "read, so absence proves nothing here" % firm["name"][:42])
            continue
        notes = apply_gates(firm, row, how)
        store(firm, row, how, score)

        if row:
            matched += 1
            when, is_formation = registered_on(row)
            when_txt = when if is_formation else ("before 2008" if firm["tx_register"]
                                                  ["trading_before_2008"] else "no date")
            print("%-42s %-34s %s" % (firm["name"][:42], row["taxpayer_name"][:34], when_txt))
        else:
            unresolved += 1
            print("%-42s no match this source can settle" % firm["name"][:42])
        for note in notes:
            print("      %s" % note)

        if args.write:
            io.open(path, "w", encoding="utf-8", newline=LF).write(
                json.dumps(firm, ensure_ascii=False, indent=2) + LF)
        else:
            skipped += 1

    print()
    print("%d matched, %d left for a source that can answer%s%s"
          % (matched, unresolved,
             ", %d the register would not answer for" % silent if silent else "",
             "" if args.write else ", nothing written (pass --write)"))
    if silent:
        print("The firms the register would not answer for keep the gates they already had. "
              "Run this again to settle them.")
    if args.write:
        print("Run scripts/score.py to recompute.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
