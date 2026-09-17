#!/usr/bin/env python3
"""
Check published attorney names against the NYS Attorney Registration database.

Why this source. The registry's own search UI at iapps.courts.state.ny.us sits behind a
Cloudflare managed challenge, and driving an automated browser through that is evading bot
protection, which this project does not do. The same authority publishes the same data in bulk:
dataset eqw2-r5nb on data.ny.gov, attributed to the NYS Unified Court System, containing the
fields deemed public under 22 NYCRR 118. It is refreshed daily and needs no scraping.

What it can and cannot establish.

  G1, active licensure: the registry's `status` is authoritative and current, so this gate can be
  genuinely passed or failed. An attorney we cannot match is not a failure - it is unchecked, and
  counts neither way. What does hold the gate open is an unmatched name whose namesakes in the
  register include a disbarred or suspended one: that cannot be tied to the firm's attorney and
  cannot be ruled out either, and a pass would be asserting the second.

  G2, clean public discipline, only partly: the dataset carries current status, not a history. A
  currently disbarred or suspended attorney fails G2 outright. But an attorney disciplined six
  years ago and since restored reads as "Currently registered", so a clean result here cannot
  prove the ten-year window the methodology asks for. The gate's source string says so rather
  than implying a full check.

  A2, experience: `year_admitted` is exact, which replaces an estimate with a fact.

Matching is deliberately conservative. Attaching a real person's registration number and
disciplinary status to the wrong attorney is worse than having no data, so a match needs the name
AND a corroborating signal - the firm named in the registration, or the city with no other
candidate of that name in the state. Anything else is recorded as ambiguous or unmatched and
nothing is written.

Usage:
    python scripts/check_ny_registry.py                 # report only, writes nothing
    python scripts/check_ny_registry.py --write         # annotate attorneys in the firm JSONs
    python scripts/check_ny_registry.py --write --gates # also update G1/G2 from the results
    python scripts/check_ny_registry.py --firm greenstein-pittari-llp
"""
from __future__ import annotations

import argparse
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
from roster_roles import is_support_role  # noqa: E402

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

# There is no roster-coverage threshold any more, and the story of this line is the argument.
#
# It started as "every attorney must match", which meant a large firm could never pass: the more
# people it names, the likelier one shares a surname with hundreds of others. Firms sat at 56 to
# 91 per cent with no adverse finding anywhere, which measured how common their partners' names
# are. So it became four fifths. Then Hill & Moin arrived at 4 of 13 and Fuchsberg at 18 of 27,
# again with nothing adverse, and the reason was not their rosters:
#
#   Michael Heffernan at a Garden City firm has four namesakes in the register, at Mirkin and
#   Gordon, at Weil Gotshal, at Congdon Flaherty, and one suspended with no address. None of
#   them is at his firm. Matthew Jackson at a Manhattan plaintiff firm has three, in Tampa, at
#   Snap Inc. and at the NLRB.
#
# The register's employer field is stale or blank often enough that the right person frequently
# is not in the candidate set at all. No tiebreak fixes that, and a city tiebreak would have
# invented matches, which is the Alex Shulman error with the cause reversed.
#
# So the two things were separated. A gate reports findings: nobody we identified is disbarred or
# suspended, and no name we could not identify has an adverse namesake we are unable to rule out.
# How much of the roster we could verify is a measurement, and it already has a home worth nine
# points in pillar A, where A6 scores exactly that share. One number, in the place that reports
# quality rather than the place that reports safety.
#
# Kept as documentation of a threshold that is deliberately gone, not as a value anything reads.
MIN_ROSTER_COVERAGE = None

ROOT = Path(__file__).resolve().parent.parent
FIRMS = ROOT / "src" / "data" / "firms"

ENDPOINT = "https://data.ny.gov/resource/eqw2-r5nb.json"
DATASET = "NYS Attorney Registrations (data.ny.gov eqw2-r5nb), published by the NYS Unified Court System"
UA = "LawFirmListingsBot/1.0 (+https://lawfirmlistings.com/methodology/)"
PAUSE = 0.4  # polite spacing between requests to a free public API

# Statuses that mean the licence is live. "Due to reregister" is a renewal window, not a lapse.
ACTIVE = {
    "currently registered",
    "due to reregister within 30 days of birthday",
}
# A court's determination about an attorney. These are findings, and a firm that publishes one of
# these people as current counsel genuinely fails the gate.
#
# What this register does not carry is the reason. In New York a suspension comes from the
# Appellate Division whatever prompted it, and failing to register for several cycles is itself
# grounds for one, so "suspended, delinquent" can be a sanction for misconduct or the end of a
# long paperwork lapse and the data cannot tell you which. The gate fails either way, because a
# suspended attorney cannot practise and that is what G1 asks. The wording below is therefore
# what the register says rather than a characterisation of it: see the evidence written for G1
# and G2, which name the dataset and stop there.
DISCIPLINED = {
    "disbarred",
    "suspended, delinquent",
    "suspended, currently registered",
    "suspended, due to reregister",
    "resigned from bar - disciplinary reason",
}
# Not active, but not a determination about conduct either. "Delinquent" is a missed biennial
# filing, curable in a day. "Deceased" and "Resigned" on a firm's current roster usually mean one
# side's record is stale - the firm's page or the registration address.
#
# These keep the gate PENDING rather than failing it. Publishing "Eligibility gates not passed"
# about a real firm because one associate is behind on paperwork is a claim the evidence does not
# support, and the difference between a finding and an unresolved flag is the whole reason the
# gates have three states.
LAPSED = {
    "delinquent",
    "deceased",
    "resigned",
    "incapacitated",
}

SUFFIXES = {"JR", "SR", "II", "III", "IV", "ESQ", "ESQUIRE"}
# Short forms that are not prefixes of the registered name. Prefix matching covers ALEX ->
# ALEXANDER and MIKE -> MICHAEL is not a prefix, so the ones that matter are listed.
NICKNAMES = {
    "BOB": "ROBERT", "BOBBY": "ROBERT", "ROB": "ROBERT", "BILL": "WILLIAM", "BILLY": "WILLIAM",
    "WILL": "WILLIAM", "MIKE": "MICHAEL", "JIM": "JAMES", "JIMMY": "JAMES", "JACK": "JOHN",
    "TONY": "ANTHONY", "DICK": "RICHARD", "RICK": "RICHARD", "TED": "THEODORE",
    "NED": "EDWARD", "NICK": "NICHOLAS", "CHUCK": "CHARLES", "PEGGY": "MARGARET",
    "BETTY": "ELIZABETH", "LIZ": "ELIZABETH", "KATE": "KATHERINE", "KATHY": "KATHERINE",
    "SUE": "SUSAN", "TOM": "THOMAS", "STEVE": "STEPHEN", "DAVE": "DAVID", "DAN": "DANIEL",
    "JOE": "JOSEPH", "FRANK": "FRANCIS", "HANK": "HENRY", "GREG": "GREGORY", "JEFF": "JEFFREY",
}
# Words that appear in half the firm names in the state and so distinguish nothing.
GENERIC = {
    "LAW", "LAWS", "FIRM", "FIRMS", "OFFICE", "OFFICES", "GROUP", "LLP", "LLC", "PLLC", "PC",
    "PLC", "LP", "AND", "THE", "OF", "ASSOCIATES", "ASSOCIATION", "PARTNERS", "ATTORNEY",
    "ATTORNEYS", "LAWYER", "LAWYERS", "INJURY", "PERSONAL", "ACCIDENT", "TRIAL", "LEGAL",
    "COUNSEL", "PA", "PLLP", "CO", "INC", "NEW", "YORK", "CITY", "NY",
}


def norm(text: str) -> str:
    """Uppercase, strip punctuation, collapse whitespace.

    An apostrophe closes up rather than becoming a space, and that one character was quietly
    breaking a whole class of surname. "Dan O'Connor" normalised to "DAN O CONNOR", which
    split_name then read as first DAN, middle O, last CONNOR, and no O'Connor in the state was
    ever going to match a last name of CONNOR. The register holds both spellings, "O'CONNOR" and
    "OCONNOR", so closing the apostrophe on both sides makes the two agree.

    It is not a rare name. O'Brien, O'Connell, O'Donnell, D'Amato, D'Angelo and every other
    surname of that shape failed the same way, and a failure here is not visible as an error:
    the attorney is simply reported unmatched, which reads as "we could not find them" rather
    than as "we looked for the wrong person".
    """
    closed = (text or "").upper().replace("'", "").replace("’", "")
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s&]", " ", closed)).strip()


def tokens(text: str) -> set[str]:
    return {t for t in norm(text).split() if t and t != "&"}


def distinctive(firm_name: str, legal_name: str | None, domain: str | None) -> tuple[set[str], set[str]]:
    """(tokens from the firm's name, tokens from its domain).

    Kept apart because they carry different weight. A name token is usually a name partner's
    surname, which identifies the firm only in combination - "GREENSTEIN" alone also matches
    Greenstein & Milbauer, a different firm, and "WALSH" alone matches a solo practitioner named
    Kevin Walsh. Both slipped through when any single shared token counted as a firm match.
    """
    name = {t for t in tokens(firm_name) | tokens(legal_name or "") if t not in GENERIC and len(t) > 2}
    dom = set()
    if domain:
        label = domain.split(".")[0].replace("www", "")
        if len(label) > 4:
            dom.add(label.upper())
    return name, dom


def split_name(full: str) -> tuple[str, str, str]:
    """(first, middle, last) from a published name, dropping suffixes and initials-only middles."""
    parts = [p for p in norm(full).split() if p]
    parts = [p for p in parts if p.rstrip(".") not in SUFFIXES]
    if len(parts) < 2:
        return (parts[0] if parts else "", "", "")
    return parts[0], " ".join(parts[1:-1]), parts[-1]


PAGE = 1000  # Socrata's default cap per request


def fetch_page(where: str, offset: int) -> list[dict]:
    query = urllib.parse.urlencode({
        "$where": where,
        "$select": ("registration_number,first_name,middle_name,last_name,suffix,company_name,"
                    "city,state,county,year_admitted,status,law_school"),
        "$order": "registration_number",  # a stable order, or paging can repeat and skip rows
        "$limit": PAGE,
        "$offset": offset,
    })
    req = urllib.request.Request(f"{ENDPOINT}?{query}", headers={"User-Agent": UA, "Accept": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            # 429 and 5xx are worth waiting out; a 4xx query error is not.
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise
            time.sleep(2 ** attempt)
        except Exception:
            # Anything that is not an HTTP status: a dropped connection, a DNS blip, a
            # read timeout. All of them are worth another go, and the attempt counter
            # stops this looping.
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    return []


def fetch(where: str) -> list[dict]:
    """Every row, paged.

    A fixed limit here would truncate silently, and silent truncation on this particular query is
    not a cosmetic bug: dropping the true record from a candidate set is what leaves a homonym
    looking like the sole holder of a name. Surnames in this dataset reach 2,153 rows.
    """
    rows: list[dict] = []
    while True:
        page = fetch_page(where, len(rows))
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        time.sleep(PAUSE)


def sql_quote(value: str) -> str:
    return value.replace("'", "''")


def first_names_compatible(ours: str, theirs: str) -> bool:
    """Exact, a prefix either way, or a known short form.

    Strict equality here caused a real error: the firm publishes "Alex Shulman" and the registry
    holds him as "ALEXANDER", so the true record was excluded from the candidate set and a
    different, deceased Alex Shulman became the only name match. Strictness in the filter
    manufactures false uniqueness, which is more dangerous than a looser filter.
    """
    if not ours or not theirs:
        return False
    if ours == theirs:
        return True
    if NICKNAMES.get(ours) == theirs or NICKNAMES.get(theirs) == ours:
        return True
    short, long = sorted((ours, theirs), key=len)
    return len(short) >= 3 and long.startswith(short)


def candidate_name_matches(row: dict, first: str, middle: str, last: str) -> bool:
    """Registry `first_name` often holds "ROBERT J." - first token plus an initial."""
    if norm(row.get("last_name", "")) != last:
        return False
    rfirst = norm(row.get("first_name", "")).split()
    if not rfirst or not first_names_compatible(first, rfirst[0]):
        return False
    # If both sides carry a middle initial, they must agree.
    ours = middle.replace(".", "").split()
    theirs = rfirst[1:] + norm(row.get("middle_name", "")).split()
    if ours and theirs and ours[0][0] != theirs[0][0]:
        return False
    return True


def score(row: dict, name_tokens: set[str], domain_tokens: set[str], city: str) -> tuple[int, list[str]]:
    """How well a name-matched row corroborates beyond the name itself.

    A firm match needs two of the firm's name tokens, or the firm's whole distinctive name when
    it only has one ("The Perecman Firm"), or its domain label. One surname out of several is a
    coincidence often enough to matter.
    """
    pts, why = 0, []
    company = tokens(row.get("company_name", ""))
    shared = name_tokens & company
    needed = min(2, len(name_tokens)) or 1
    if len(shared) >= needed or (domain_tokens & company):
        pts += 3
        why.append("firm named in registration")
    if norm(row.get("city", "")) == norm(city):
        pts += 1
        why.append("city matches")
    return pts, why


def check_firm(path: Path, write: bool, write_gates: bool) -> dict:
    firm = json.loads(path.read_text(encoding="utf-8"))
    name = firm["name"]
    city = firm.get("market", {}).get("city", "")
    name_tokens, domain_tokens = distinctive(name, firm.get("legal_name"), firm.get("domain"))
    # The people the firm presents as lawyers. G1 and G2 are statements about "the attorneys a
    # firm names", and one Queens practice names thirty-nine people with a role beside each:
    # searching the register for its receptionist wastes a lookup, and a namesake match would
    # have put a registration number on her and made the gate's own count wrong.
    everyone = firm.get("attorneys") or []
    support = [a for a in everyone if is_support_role(a)]
    attorneys = [a for a in everyone if not is_support_role(a)]

    result = {"slug": firm["slug"], "name": name, "rows": [],
              "matched": 0, "ambiguous": 0, "unmatched": 0,
              "inactive": [], "disciplined": []}

    if not attorneys:
        result["note"] = "no attorney names collected"
        if write and write_gates:
            today = date.today().isoformat()
            apply_g5(firm, today)
            # G1 and G2 ask about the attorneys a firm names, and three firms here name none: no
            # roster page, no bio pages, nothing on the home page. Leaving those gates reading
            # "Bar registry not yet checked" put the gap on us, and it is not ours. The register
            # is open and free; the names are what is missing, and that is a finding about the
            # site, which is also what G5 fails them for.
            for code, what in (("G1", "licensure"), ("G2", "disciplinary history")):
                gate = (firm.get("gates") or {}).get(code) or {}
                if gate.get("pass") or gate.get("attested"):
                    continue
                firm.setdefault("gates", {})[code] = {
                    "pass": False,
                    "evidence": ("This firm names no attorney on its public pages, so there is "
                                 "no roster whose %s can be checked. The register is open and "
                                 "free to search; the names are what is missing." % what),
                    "source": "no roster published",
                    "checked_at": today,
                }
            path.write_text(json.dumps(firm, indent=2, ensure_ascii=False) + "\n",
                            encoding="utf-8")
        return result

    # One request per distinct surname, reused across attorneys who share one.
    by_surname: dict[str, list[dict]] = {}
    for att in attorneys:
        _, _, last = split_name(att["name"])
        if last and last not in by_surname:
            # The register spells the same surname both ways, "O'CONNOR" and "OCONNOR", and
            # rows are filtered server-side on the exact string. Asking for the closed-up form
            # alone returned none of the apostrophised ones, which is most of them: every
            # O'Toole, O'Sullivan, O'Hagan and D'Angelo in the directory came back unmatched
            # from a query that was never going to find them. Both spellings, one request.
            where = f"upper(last_name)='{sql_quote(last)}'"
            if last.startswith(("O", "D", "L")) and len(last) > 2:
                spaced = last[0] + "'" + last[1:]
                where += f" OR upper(last_name)='{sql_quote(spaced)}'"
            by_surname[last] = fetch(where)
            time.sleep(PAUSE)

    today = date.today().isoformat()
    for att in attorneys:
        first, middle, last = split_name(att["name"])
        named = [r for r in by_surname.get(last, []) if candidate_name_matches(r, first, middle, last)]
        scored = sorted(((score(r, name_tokens, domain_tokens, city), r) for r in named),
                        key=lambda x: -x[0][0])

        chosen, confidence, basis = None, "", ""
        # A candidate whose registration names this firm outranks every other consideration, so
        # those are settled first and the rest are not weighed against them at all.
        firm_named = [r for (pts, _), r in scored if pts >= 3]
        if not scored:
            confidence = "not found"
        elif len(firm_named) == 1:
            chosen, confidence = firm_named[0], "matched"
            basis = "firm named in the registration"
        elif len(firm_named) > 1:
            confidence = f"ambiguous ({len(firm_named)} registrations at this firm share this name)"
        elif len(named) == 1:
            (_, why), only = scored[0]
            # Uniqueness alone is enough for an ordinary status, but not for one that says
            # something adverse about a named person. "Alex Shulman" was the sole name match and
            # the record said Deceased; it was a different man. An adverse status is only
            # published when the registration itself names the firm.
            if (only.get("status") or "").strip().lower() in ACTIVE:
                chosen, confidence = only, "matched"
                basis = ("sole attorney of this name admitted in New York"
                         + (f"; {', '.join(why)}" if why else ""))
            else:
                confidence = (f"sole name match carries an adverse status "
                              f"({(only.get('status') or '?').strip()}) and is not corroborated "
                              f"by the firm - not published")
        else:
            confidence = f"ambiguous ({len(named)} attorneys share this name)"

        # An unmatched name is not automatically clean. If one of its namesakes in the register
        # carries a disciplinary status, we cannot tie it to this person and we cannot rule it out
        # either, and a gate that passed in silence would be claiming the second one.
        if not chosen:
            for cand in named:
                st = (cand.get("status") or "").strip()
                if st.lower() in DISCIPLINED:
                    result.setdefault("adverse_unresolved", []).append(
                        (att["name"], st, len(named)))
                    break

        row = {"name": att["name"], "confidence": confidence, "basis": basis}
        if chosen:
            status = (chosen.get("status") or "").strip()
            row.update({
                "reg": chosen.get("registration_number"),
                "status": status,
                "admitted": chosen.get("year_admitted"),
                "company": chosen.get("company_name"),
                "school": chosen.get("law_school"),
            })
            low = status.lower()
            if low not in ACTIVE:
                result["inactive"].append((att["name"], status))
            if low in DISCIPLINED:
                result["disciplined"].append((att["name"], status))
            result["matched"] += 1
            if write:
                att["bar_state"] = "NY"
                att["bar_number"] = str(chosen["registration_number"])
                if chosen.get("year_admitted"):
                    att["admitted_year"] = int(chosen["year_admitted"])
                att["registry_status"] = status
                att["registry_basis"] = basis
                att["checked_at"] = today
        else:
            if confidence.startswith("ambiguous"):
                result["ambiguous"] += 1
            else:
                result["unmatched"] += 1
            if write:
                # An unchecked attorney is recorded as unchecked, never left to look verified.
                # Kept in the record, but not as a label under the person's name. The
                # attorneys section already says "30 of 37 licences checked", which is the
                # honest number. Annotating each unmatched individual with "ambiguous, three
                # share this name" tells a reader nothing usable and reads as a slight on
                # someone whose only distinction is a common surname.
                att.pop("registry_status", None)
                att["registry_note"] = confidence
                att["checked_at"] = today
                att.pop("bar_number", None)
                att.pop("registry_basis", None)
                att.pop("admitted_year", None)
        result["rows"].append(row)

    if write and write_gates:
        apply_gates(firm, result, today)
        apply_g5(firm, today)
    if write:
        path.write_text(json.dumps(firm, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return result


def apply_g5(firm: dict, today: str) -> None:
    """Honest website baseline, recomputed from the profile rather than frozen at crawl time."""
    gates = firm.setdefault("gates", {})
    if (gates.get("G5") or {}).get("attested"):
        return
    https = (firm.get("website") or "").lower().startswith("https://")
    phone = bool((firm.get("phone") or "").strip())
    everyone = firm.get("attorneys") or []
    named = len(everyone)
    # G5 asks whether the firm names its people, so everyone it names counts. The wording
    # separates the two groups rather than calling thirty-five case managers attorneys: the
    # gate is satisfied either way, and the sentence has to stay true.
    lawyers = len([a for a in everyone if not is_support_role(a)])
    support = named - lawyers
    ok = https and phone and named > 0
    if not named:
        who = "no attorney is named on the site we could read"
    elif support:
        who = (f"{lawyers} named attorney{'' if lawyers == 1 else 's'} published, and "
               f"{support} more {'person' if support == 1 else 'people'} in roles the firm "
               "states are not a lawyer's")
    else:
        who = f"{named} named attorney{'' if named == 1 else 's'} published"
    parts = [
        "served over HTTPS" if https else "no HTTPS on the published address",
        "a working phone number published" if phone else "no contact number published",
        who,
    ]
    gates["G5"] = {
        "pass": ok,
        "evidence": ("Site has " + ", ".join(parts) + "."
                     + ("" if ok else " The gate also asks for no misleading claims, which is"
                        " an editorial read we have not recorded.")),
        "source": "Public crawl of the firm's own site" if ok else "Public crawl, partial",
        "checked_at": today,
    }


def apply_gates(firm: dict, result: dict, today: str) -> None:
    """G1 from the registry outright; G2 only as far as current status can carry it.

    A gate the firm has attested is left exactly as it is. Otherwise this script, which runs
    whenever the roster changes, would silently undo a deliberate editorial decision - and the
    firm would lose a tier without anyone touching it. Withdrawing an attestation is a decision
    too, so it is made with scripts/attest.py --revoke, not as a side effect of a re-check.
    """
    existing = firm.get("gates") or {}
    keep = {code for code, g in existing.items() if g.get("attested")}
    if keep:
        print(f"    (leaving attested {', '.join(sorted(keep))} untouched)")
    total = len(firm.get("attorneys") or [])
    gates = firm.setdefault("gates", {})
    matched = result["matched"]
    unchecked = result["ambiguous"] + result["unmatched"]
    disciplined = result["disciplined"]
    lapsed = [(n, st) for n, st in result["inactive"] if st.strip().lower() in LAPSED]
    adverse_unresolved = result.get("adverse_unresolved") or []

    # An attestation cannot survive a finding of actual discipline: if the registry says an
    # attorney is disbarred or suspended, that outranks anything the firm has told us.
    if disciplined:
        keep -= {"G1", "G2"}

    if disciplined and "G1" not in keep:
        detail = "; ".join(f"{n}: {st}" for n, st in disciplined[:3])
        gates["G1"] = {"pass": False,
                       "evidence": (f"{len(disciplined)} of {total} named attorneys are recorded "
                                    f"by the state's attorney register as not able to practise. "
                                    f"{detail}. The register carries the status and not the reason "
                                    "for it."),
                       "source": DATASET, "checked_at": today}
    elif lapsed and "G1" not in keep:
        detail = "; ".join(f"{n}: {st}" for n, st in lapsed[:3])
        gates["G1"] = {"pass": False,
                       "evidence": (f"{matched} of {total} attorneys currently registered. "
                                    f"{len(lapsed)} not currently registered ({detail}). "
                                    "Held for review: either record may be out of date."),
                       "source": f"{DATASET}, pending review of a registration lapse",
                       "checked_at": today}
    elif adverse_unresolved and "G1" not in keep:
        n, st, count = adverse_unresolved[0]
        gates["G1"] = {
            "pass": False,
            "evidence": (f"{matched} of {total} named attorneys are currently registered and none "
                         f"of those carries an adverse status. {len(adverse_unresolved)} other "
                         f"name(s) match a register entry that does: {n} shares a name with one "
                         f"of {count} registrations, one of them {st.lower()}. That entry cannot "
                         "be tied to this firm's attorney and cannot be ruled out either, so the "
                         "gate is held open rather than decided."),
            # "incomplete" is load-bearing: score.py reads that word and keeps the gate out of the
            # finding column. Without it the first version of this made two firms read
            # "Not eligible" because one of their attorneys shares a name with a suspended
            # stranger, which is the worst thing this directory could publish about a
            # working practice.
            "source": f"{DATASET}, incomplete: an adverse namesake we cannot resolve",
            "checked_at": today}
    elif matched and "G1" not in keep:
        gates["G1"] = {
            "pass": True,
            "evidence": (f"{matched} of {total} named attorneys are currently registered and "
                         "none carries an adverse status"
                         + (f". {unchecked} could not be told apart from namesakes in the "
                            "register and are counted neither way" if unchecked else "")),
            "source": DATASET, "checked_at": today}
    elif "G1" not in keep:
        gates["G1"] = {
            "pass": False,
            "evidence": (f"None of the {total} attorneys this firm names could be found in the "
                         "register, so there is nothing here to clear or to fault."),
            "source": f"{DATASET}, partial", "checked_at": today}

    if "G2" in keep:
        pass
    elif disciplined:
        detail = "; ".join(f"{n}: {st}" for n, st in disciplined[:3])
        gates["G2"] = {"pass": False,
                       "evidence": (f"The state's attorney register records a suspension or "
                                    f"disbarment against a named attorney. {detail}. What the "
                                    "register does not carry is what prompted it."),
                       "source": DATASET, "checked_at": today}
    elif adverse_unresolved:
        n, st, count = adverse_unresolved[0]
        gates["G2"] = {"pass": False,
                       "evidence": (f"None of the {matched} attorneys we identified carries a "
                                    f"disciplinary status. {len(adverse_unresolved)} name(s) we "
                                    f"could not identify share a name with a registration that "
                                    f"does, {n} among {count} namesakes. Held open."),
                       # "incomplete" is load-bearing: score.py reads that word and keeps the gate out of the
            # finding column. Without it the first version of this made two firms read
            # "Not eligible" because one of their attorneys shares a name with a suspended
            # stranger, which is the worst thing this directory could publish about a
            # working practice.
            "source": f"{DATASET}, incomplete: an adverse namesake we cannot resolve",
                       "checked_at": today}
    elif matched:
        gates["G2"] = {"pass": True,
                       "evidence": (f"None of the {matched} named attorneys carries a disciplinary "
                                    "status on the public register: no disbarment, suspension or "
                                    "disciplinary resignation. Those statuses persist, so the check "
                                    "reaches back years, but it would not show a censure or a "
                                    "suspension since lifted."),
                       "source": f"{DATASET}. Current status, which is what this register carries",
                       "checked_at": today}
    else:
        gates["G2"] = {"pass": False,
                       "evidence": (f"None of the {total} attorneys this firm names could be found "
                                    "in the register, so no disciplinary history could be read "
                                    "either way."),
                       "source": f"{DATASET}, partial", "checked_at": today}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="annotate attorneys in the firm JSONs")
    ap.add_argument("--gates", action="store_true", help="also update G1/G2 (requires --write)")
    ap.add_argument("--firm", help="a single firm slug")
    args = ap.parse_args()

    if args.gates and not args.write:
        print("--gates needs --write", file=sys.stderr)
        return 2

    paths = sorted(FIRMS.rglob("*.json"))
    if args.firm:
        paths = [p for p in paths if p.stem == args.firm]
        if not paths:
            print(f"no firm with slug {args.firm}", file=sys.stderr)
            return 2

    skipped_out_of_state: list[str] = []
    totals = {"matched": 0, "ambiguous": 0, "unmatched": 0, "attorneys": 0}
    failures: list[str] = []
    for path in paths:
        firm = json.loads(path.read_text(encoding="utf-8"))
        if firm.get("status") in ("sample", "not_eligible"):
            continue
        if firm.get("market", {}).get("state") != "NY":
            # A New York register has nothing to say about a firm admitted elsewhere. This ran
            # over every profile, so a Maryland firm came back with G1 and G2 sourced to the NYS
            # attorney register, an entity gate failed against the New York corporations
            # register, and an evidence line claiming its attorneys had been matched to "the
            # Maryland register" when they had been matched to New York's. Two of seven names
            # happened to appear there, which is what you get from matching common names against
            # a register of 432,910 people, and the profile then said one of them was not
            # currently registered. Maryland publishes no register we may query, so a Maryland
            # profile carries no licence finding at all, and this is where that is enforced.
            skipped_out_of_state.append(firm["slug"])
            continue
        try:
            res = check_firm(path, args.write, args.gates)
        except Exception as exc:
            # One firm failing is one firm, not the run. The rest keep their results,
            # which matters when a run is a couple of hundred lookups long.
            print(f"\n{firm['name']}\n  !!   lookup failed: {type(exc).__name__}: {exc}")
            failures.append(firm["name"])
            continue
        n = len(res["rows"])
        totals["attorneys"] += n
        for k in ("matched", "ambiguous", "unmatched"):
            totals[k] += res[k]

        print(f"\n{res['name']}  ({res['slug']})")
        if res.get("note"):
            print(f"  — {res['note']}")
            continue
        print(f"  {res['matched']} matched · {res['ambiguous']} ambiguous · {res['unmatched']} unmatched  of {n}")
        for r in res["rows"]:
            if "reg" in r:
                print(f"    OK   {r['name']:<30} #{r['reg']}  adm {r['admitted']}  {r['status']}")
                print(f"         via {r['basis']}  ·  registered at: {r.get('company') or '(none)'}")
            else:
                print(f"    --   {r['name']:<30} {r['confidence']}")
        for who, status in res["inactive"]:
            kind = ("DISCIPLINE" if status.strip().lower() in DISCIPLINED
                    else "LAPSE, gate held for review" if status.strip().lower() in LAPSED
                    else "not active")
            print(f"    !!   {who}: {status}  [{kind}]")

    print("\n" + "=" * 70)
    print(f"{totals['attorneys']} attorneys · {totals['matched']} matched "
          f"({100 * totals['matched'] // max(totals['attorneys'], 1)}%) · "
          f"{totals['ambiguous']} ambiguous · {totals['unmatched']} unmatched")
    if failures:
        print(f"lookup failed for {len(failures)}: {', '.join(failures)}")
    print(f"source: {DATASET}")
    if skipped_out_of_state:
        print("%d firm(s) outside New York were left alone: %s"
              % (len(skipped_out_of_state), ", ".join(skipped_out_of_state)))
        print("A New York register says nothing about a firm admitted elsewhere.")
    if not args.write:
        print("report only — nothing written. Add --write to annotate, --write --gates to set G1/G2.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
