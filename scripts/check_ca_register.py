#!/usr/bin/env python3
"""
G1 and G2 for California, read from the State Bar's own licensee search.

Every California profile this directory publishes carries the sentence "California does not
publish an attorney register we can query", and 110 firms carry it today. It is not true. The
State Bar of California publishes a public licensee search, its robots.txt allows the path, and
the record it returns carries exactly what the two gates ask for: whether the licence is active,
and whether there is discipline against it.

Until this existed no Californian firm could clear G1 or G2, which means none could reach
Verified or any tier above it, for a register that was there the whole time.

Two things this does that the New York check could not.

  It separates namesakes by address. The detail page publishes the licensee's business address,
  so "Brian Beecher" at the firm's own street in Los Angeles is a different fact from "Brian
  Beecher" somewhere in Sacramento. New York's register carries no such field, which is why its
  check has an "unresolvable" branch for adverse namesakes. Here, a namesake usually resolves.

  It separates discipline from administrative suspension, because the State Bar does. Its own
  page says administrative suspensions "are non-disciplinary actions resulting from
  noncompliance with administrative requirements, such as the requirement to pay licensing
  fees", and the history table gives them their own column. An unpaid fee is not misconduct, and
  publishing it as misconduct about a working lawyer would be the worst thing on this site.

Conservative in the same way as the rest of the pipeline: an attorney the register cannot
identify is counted neither for the firm nor against it, and a gate that cannot be decided is
held open rather than failed.

    python scripts/check_ca_register.py --domains arashlaw.com
    python scripts/check_ca_register.py --firms-dir --state CA --write --gates
"""
from __future__ import annotations

import argparse
import datetime
import html as htmlmod
import io
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import _tls  # noqa: F401  (certificate authorities; see scripts/_tls.py)

ROOT = pathlib.Path(__file__).resolve().parent.parent
TODAY = datetime.date.today().isoformat()

SEARCH = "https://apps.calbar.ca.gov/attorney/LicenseeSearch/QuickSearch"
DETAIL = "https://apps.calbar.ca.gov/attorney/Licensee/Detail/%s"
DATASET = "the State Bar of California's licensee search"
UA = ("Mozilla/5.0 (compatible; LawFirmListingsBot/1.0; +https://lawfirmlistings.com/) "
      "reading the public licensee search")
TIMEOUT = 30
DELAY = 1.5  # between requests to the State Bar

# What the register calls a licence that cannot be practised on. "Active" is the only status
# that clears G1; everything else here fails it, and only the disciplinary ones touch G2.
ADVERSE = {"not eligible", "inactive", "suspended", "disbarred", "resigned", "deceased"}

# G2 is published as "no attorney the firm names carries a disbarment, a suspension or a
# disciplinary resignation on the public record". Three things, named. The Discipline column
# holds more than those three, and the difference decides whether a working practice is
# published as carrying discipline:
#
#   "Discipline w/actual suspension 05-O-..."    a suspension. The gate names it.
#   "Disbarment 13-O-16074"                      a disbarment. The gate names it.
#   "Public reproval with/duties 13-C-..."       a reproval. The gate does not name it.
#   "Discipline, probation; no actual suspension"  says in its own words there was none.
#   "Disciplinary charges filed in State Bar Court"  an accusation, not a finding.
#   "Conviction record transmitted to State Bar"  a referral, not a sanction.
#
# Failing a firm's gate on the last four would publish a finding the gate does not claim to
# make. They are still real and still get said; they just do not close the gate.
GATE_DISCIPLINE = re.compile(r"disbar|resign\w*\s+with\s+charges|ordered\s+inactive", re.I)
SUSPENSION = re.compile(r"actual\s+suspension", re.I)
NO_SUSPENSION = re.compile(r"no\s+actual\s+suspension", re.I)


def closes_the_gate(action: str) -> bool:
    """True when this row is one of the three things G2 actually names."""
    if GATE_DISCIPLINE.search(action):
        return True
    return bool(SUSPENSION.search(action)) and not NO_SUSPENSION.search(action)


def fetch(url: str) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError, ValueError):
        return None
    finally:
        time.sleep(DELAY)


def text(markup: str) -> str:
    """Tags out, entities decoded.

    The entities matter more than they look. The register fills an empty cell with &nbsp;, and
    without unescaping it the Discipline column of a spotless record reads as four non-space
    characters: every attorney in California came back carrying discipline.
    """
    markup = re.sub(r"<script.*?</script>", " ", markup, flags=re.S)
    markup = re.sub(r"<style.*?</style>", " ", markup, flags=re.S)
    stripped = htmlmod.unescape(re.sub(r"<[^>]+>", " ", markup))
    return re.sub(r"\s+", " ", stripped.replace("\xa0", " ")).strip()


# A title is not part of the name the register holds. "Dr. Azadeh Keshavarz" returns nothing,
# and retrying on the ends of that string asks for "Dr. Keshavarz", which returns nothing twice.
TITLES = re.compile(r"^(dr|mr|mrs|ms|miss|prof|atty|attorney)\.?\s+", re.I)
SUFFIXES = re.compile(r"[,\s]+(esq|esquire|jr|sr|ii|iii|iv|j\.?d|ll\.?m|apc|aplc)\.?$", re.I)


def plain(name: str) -> str:
    """The name without the honorifics the register does not carry."""
    n = (name or "").strip()
    while True:
        stripped = SUFFIXES.sub("", TITLES.sub("", n)).strip()
        if stripped == n:
            return n
        n = stripped


def search(name: str) -> list[dict]:
    """The result rows for a name: id, name, status, number, city, admitted."""
    url = SEARCH + "?" + urllib.parse.urlencode({"FreeText": name, "SoundsLike": "false"})
    html = fetch(url)
    if not html:
        return []
    table = re.search(r'<table id="tblAttorney".*?</table>', html, re.S)
    if not table:
        return []
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table.group(0), re.S):
        cells = [text(td) for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(cells) < 5:
            continue
        ident = re.search(r"/attorney/Licensee/Detail/(\d+)", tr)
        rows.append({
            "id": ident.group(1) if ident else None,
            "name": cells[0], "status": cells[1], "number": cells[2],
            "city": cells[3], "admitted": cells[4],
        })
    return rows


def detail(ident: str) -> dict | None:
    """Licence status, business address, and whether the history carries discipline."""
    html = fetch(DETAIL % ident)
    if not html:
        return None
    flat = text(html)
    status = re.search(r"License Status:\s*([A-Za-z ]+?)\s+Address:", flat)
    address = re.search(r"Address:\s*(.*?)\s+Phone:", flat)

    # The history table's own columns, which is the only place the State Bar separates a
    # disciplinary action from an administrative one.
    # Every disciplinary row, with its date, because "a suspension" and "a suspension in 2004,
    # served, and practising since" are different sentences about a person.
    discipline_rows: list[tuple[str, str]] = []
    administrative = False
    section = html.find("License Status, Disciplinary and Administrative History")
    if section != -1:
        table = re.search(r"<table.*?</table>", html[section:], re.S)
        if table:
            # Date | License Status | Discipline | Administrative Action. Four columns, and the
            # first version of this read five and skipped every row, which meant the Discipline
            # column was never read at all and the only thing left flagging anybody was the
            # licence status. That is how "Resigned, no charges pending" came out as discipline.
            for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table.group(0), re.S):
                cells = [text(td) for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
                if len(cells) < 4:
                    continue
                action = cells[2].replace("\xa0", " ").strip()
                if action:
                    discipline_rows.append((cells[0].strip(), action))
                if cells[3].replace("\xa0", " ").strip():
                    administrative = True
    return {
        "id": ident,
        "status": (status.group(1).strip() if status else ""),
        "address": (address.group(1).strip() if address else ""),
        # The rows that close G2, and the rows that are discipline but are not one of the three
        # things it names. Both are kept: the first decides the gate, the second gets said.
        "gate_discipline": [r for r in discipline_rows if closes_the_gate(r[1])],
        "other_discipline": [r for r in discipline_rows if not closes_the_gate(r[1])],
        "administrative": administrative,
        "url": DETAIL % ident,
    }


def tokens(value: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", (value or "").lower()) if len(t) > 2}


# Words that belong to an institution rather than to a person. crawl_attorneys reads headings and
# bio text, and both carry things that are not people: "San Diego County Bar Association" and
# "UC San Diego" are listed as attorneys of one firm today, "Recent Posts" of another.
INSTITUTION = re.compile(
    r"\b(university|universidad|college|school|academy|institute|association|bar|society|"
    r"foundation|council|committee|center|centre|clinic|court|county|district|office|group|"
    r"llp|llc|inc|p\.?c\.?|law|lawyers?|attorneys?|firm|posts?|record|awards?|reviews?|news|"
    # California's own campuses, by the initials their alumni pages use. "UC San Diego" is
    # listed as an attorney of a San Diego firm today, and reads as three ordinary words.
    r"uc|ucla|usc|csu|cal)\b",
    re.I)

# Place names the crawler has picked up as people. "San Jose" is listed as an attorney of a San
# Jose firm today, and it cost that firm its G2: the register holds six licensees whose name
# contains it, one of them not eligible to practise, and a namesake that cannot be ruled out
# holds the gate open. A city is not a namesake of anybody.
#
# Named rather than pattern-matched on purpose. "San", "Santa" and "La" open plenty of real
# Spanish surnames, and this directory publishes firms whose lawyers carry them, so a rule that
# drops anything starting that way would quietly delete people. These are the cities this
# directory already works in, plus the biggest in the state.
CA_PLACES = {
    "los angeles", "san diego", "san jose", "san francisco", "long beach", "santa ana",
    "santa monica", "santa barbara", "santa clara", "san bernardino", "sacramento", "fresno",
    "oakland", "bakersfield", "anaheim", "riverside", "stockton", "irvine", "chula vista",
    "fremont", "modesto", "glendale", "huntington beach", "san mateo", "costa mesa",
    "newport beach", "beverly hills", "woodland hills", "sherman oaks", "century city",
    "van nuys", "pasadena", "inglewood", "torrance", "encino", "el segundo",
}


def looks_like_person(name: str, city: str = "") -> bool:
    """A conservative screen, because the cost of each mistake is not the same.

    Querying a name that is not a person wastes a request. Counting one in the denominator
    publishes "3 of 6 named attorneys verified" about a firm that named three attorneys, a bar
    association and a university, and charges it for our own misreading. score.py already makes
    this argument about support staff; this is the same argument about things that are not
    people at all.

    Only clear-cut cases are dropped: two to four words, no institutional word, no digits.
    Anything ambiguous stays in and is looked up.
    """
    n = (name or "").strip()
    if not n or any(ch.isdigit() for ch in n):
        return False
    low = n.lower()
    if low in CA_PLACES or (city and low == city.strip().lower()):
        return False
    words = n.split()
    if not 2 <= len(words) <= 4:
        return False
    return not INSTITUTION.search(n)


def identify(name: str, firm_name: str, city: str) -> tuple[dict | None, str, list[dict]]:
    """One licensee for this name, or nothing, with the reason it could not be pinned down.

    A single hit is taken on its name. Several hits are separated by the business address the
    register publishes: the firm's own name in it is decisive, the market's city is weaker but
    still a fact about where the person practises. Where neither separates them, nothing is
    returned, and the caller reports the adverse ones it could not rule out rather than deciding
    the gate on a guess.
    """
    name = plain(name)
    rows = [r for r in search(name) if r["id"]]
    if not rows:
        # The register holds a legal name and a firm's site prints the name its lawyer uses. One
        # San Diego firm names "Andy Van Le", whose entry is "Le, Andy": the full string returns
        # nothing and the first and last word return him. Middle names and initials do the same
        # thing to "David J. Ebenhack". So a miss is retried on the ends of the name, which is
        # where a person's own first and last name almost always are.
        words = name.split()
        if len(words) > 2:
            rows = [r for r in search("%s %s" % (words[0], words[-1])) if r["id"]]
    if not rows:
        return None, "not found in the register", []
    # The licence number and the admission year live on the search row, the address and the
    # discipline history on the detail page, and A2 and A6 need the first two. Carry both.
    by_id = {r["id"]: r for r in rows}
    merge = lambda got: {**by_id.get(got["id"], {}), **got}  # noqa: E731

    if len(rows) == 1:
        got = detail(rows[0]["id"])
        return ((merge(got), "", rows) if got
                else (None, "the register's detail page did not load", rows))

    firm_tokens = tokens(firm_name)
    by_firm, by_city = [], []
    details = []
    for row in rows[:8]:  # a name with more than eight holders is not going to resolve
        got = detail(row["id"])
        if not got:
            continue
        got = merge(got)
        details.append(got)
        addr = got["address"].lower()
        if firm_tokens and firm_tokens & tokens(addr):
            by_firm.append(got)
        elif city and city.lower() in addr:
            by_city.append(got)
    if len(by_firm) == 1:
        return by_firm[0], "", rows
    if not by_firm and len(by_city) == 1:
        return by_city[0], "", rows
    return None, "%d licensees share this name and the register's addresses do not separate them" \
        % len(rows), details


def assess(attorneys, firm_name, city, verbose=False):
    """Walk a firm's named attorneys and come back with everything the gates need."""
    found, adverse, discipline, unresolved, adverse_namesake = [], [], [], [], []
    other_discipline = []
    # What goes back onto each attorney: A2 is the mean years since admission and A6 is the
    # share of the roster carrying a licence number, and both read these fields off the firm.
    annotations = {}
    not_people = []
    for a in attorneys:
        name = (a.get("name") or "").strip()
        if not name:
            continue
        if not looks_like_person(name, city):
            not_people.append(name)
            if verbose:
                print("    %-28s (not a person's name, left out)" % name[:28])
            continue
        got, why, candidates = identify(name, firm_name, city)
        if verbose:
            print("    %-28s %s" % (name[:28], got["status"] if got else "(%s)" % why))
        if not got:
            unresolved.append((name, why))
            # An unidentified name that shares the register with somebody adverse is the one case
            # worth carrying forward: it cannot be cleared and must not be held against the firm.
            if any((c.get("status") or "").strip().lower() in ADVERSE for c in candidates):
                adverse_namesake.append((name, len(candidates)))
            continue
        status = (got["status"] or "").strip()
        record = (name, status, got["url"])
        found.append(record)
        if status.lower() in ADVERSE:
            adverse.append(record)
        # Only the register's own Discipline column. The licence status cannot stand in for it,
        # and this is not a theoretical point: the first run of this flagged two attorneys at a
        # 128-lawyer firm as carrying "a disciplinary record" because their status reads
        # "Resigned". Their history says "Resignation, no charges pending". One of them resigned
        # in 2008. Publishing that as discipline about a real practice is the worst thing on this
        # site, and the State Bar had already drawn the distinction in its own columns: a
        # suspension for an unpaid fee sits under Administrative Action, not under Discipline.
        # G2 is titled "No public discipline outstanding", and outstanding is the operative word.
        # A suspension served is not outstanding: the register keeps it for life, and reading
        # "carries on the public record" literally marked two working practices Not eligible for
        # sanctions from 2004 and 2013 whose attorneys have been licensed and practising ever
        # since. So a disciplinary action closes the gate while the licence still reflects it,
        # and once the licence is active again it is history rather than a finding.
        if got["gate_discipline"] and status.lower() in ADVERSE:
            when = got["gate_discipline"][-1][0]
            discipline.append((name, "%s, %s" % (got["gate_discipline"][-1][1], when), got["url"]))
        elif got["gate_discipline"] or got["other_discipline"]:
            # A served sanction lands here, and it is the gate_discipline list that holds it,
            # not the other one. Reading other_discipline unconditionally crashed on the first
            # attorney who had a suspension behind them and nothing else on the record: Morgan
            # & Morgan, 197 names in, which stopped the run at firm 153 of 252.
            rows = got["other_discipline"] or got["gate_discipline"]
            when, what = rows[-1][0], rows[-1][1]
            other_discipline.append((name, "%s, %s" % (what, when), got["url"]))

        note = {"registry_status": status, "registry_url": got["url"]}
        if got.get("number"):
            note["bar_number"] = str(got["number"]).strip()
        year = re.search(r"\b(19|20)\d{2}\b", got.get("admitted") or "")
        if year:
            note["admitted_year"] = int(year.group(0))
        annotations[name] = note
    return {"found": found, "adverse": adverse, "discipline": discipline,
            "other_discipline": other_discipline,
            "unresolved": unresolved, "adverse_namesake": adverse_namesake,
            "annotations": annotations, "not_people": not_people,
            # The denominator every sentence below counts against: the names this firm gave that
            # are a person's name. The ones that are not are our parsing error, not its roster.
            "total": len(attorneys) - len(not_people)}


def gates_from(result: dict) -> dict:
    """G1 and G2, in the shape build_profiles writes and score.py reads."""
    total = result["total"]
    matched = len(result["found"])
    clean = matched - len(result["adverse"])
    gates = {}

    if result["discipline"]:
        detail_s = "; ".join("%s: %s" % (n, s) for n, s, _ in result["discipline"][:3])
        gates["G1"] = {"pass": False, "source": DATASET, "checked_at": TODAY,
                       "evidence": ("%d of %d named attorneys carry a disciplinary record with "
                                    "the State Bar of California. %s."
                                    % (len(result["discipline"]), total, detail_s))}
        gates["G2"] = {"pass": False, "source": DATASET, "checked_at": TODAY,
                       "evidence": ("The State Bar of California records discipline against a "
                                    "named attorney. %s. The register carries the action and not "
                                    "what prompted it." % detail_s)}
        return gates

    if result["adverse"]:
        detail_s = "; ".join("%s: %s" % (n, s) for n, s, _ in result["adverse"][:3])
        gates["G1"] = {
            "pass": False, "checked_at": TODAY,
            "source": "%s, pending review of a licence status" % DATASET,
            "evidence": ("%d of %d named attorneys hold an active California licence. %d do not "
                         "(%s). No discipline is recorded against any of them, so this is a "
                         "licence status rather than a finding of misconduct, and either record "
                         "may be out of date."
                         % (clean, total, len(result["adverse"]), detail_s))}
    elif result["adverse_namesake"] and not matched:
        name, count = result["adverse_namesake"][0]
        gates["G1"] = {
            "pass": False, "checked_at": TODAY,
            # "incomplete" keeps the gate out of the finding column, so a firm does not read "Not
            # eligible" because a stranger shares a name with one of its lawyers. It does not do
            # the rest of the job: an unfinished gate still blocks a tier, and the word on its own
            # cost 27 Californian firms a badge they had earned. Only `unresolvable` says the
            # thing that is true here, which is that the register has an answer for nobody and
            # never will, and only the script that did the reading knows that.
            "source": "%s, incomplete: an adverse namesake we cannot resolve" % DATASET,
            "evidence": ("None of the %d attorneys this firm names could be told apart from "
                         "namesakes in the register. %s shares a name with one of %d licensees, "
                         "one of them not eligible to practise, and the register's published "
                         "addresses do not separate them. Held open rather than decided."
                         % (total, name, count)),
            "unresolvable": ("The register cannot separate this firm's attorney from a namesake "
                             "who carries an adverse status, and carries no field that would")}
    elif matched:
        extra = ""
        if result["unresolved"]:
            extra = (". %d name(s) could not be told apart from namesakes and are counted "
                     "neither way" % len(result["unresolved"]))
        gates["G1"] = {
            "pass": True, "source": DATASET, "checked_at": TODAY,
            "evidence": ("%d of %d named attorneys hold an active California licence and none "
                         "carries an adverse status%s" % (matched, total, extra))}
    else:
        gates["G1"] = {
            "pass": False, "checked_at": TODAY,
            "source": "%s, partial" % DATASET,
            "evidence": ("None of the %d attorneys this firm names could be found in the State "
                         "Bar of California's register, so there is nothing here to clear or to "
                         "fault." % total),
            # "Could not be found" is not "found and not licensed", and we cannot tell those two
            # apart from a search that returns nothing. A name spelt differently on the site than
            # on the licence, a lawyer admitted elsewhere, a middle name in one place and not the
            # other: each returns the same empty result. Our own rule is that a check which cannot
            # complete must never read as a verdict about a firm, so this one does not.
            "unresolvable": ("The register returns nothing for any name this firm publishes, and "
                             "an empty search does not say whether the licence is missing or the "
                             "name is")}

    if result["adverse_namesake"]:
        name, count = result["adverse_namesake"][0]
        gates["G2"] = {
            "pass": False, "checked_at": TODAY,
            "source": "%s, incomplete: an adverse namesake we cannot resolve" % DATASET,
            "evidence": ("No disciplinary record is held against any of the %d attorneys we "
                         "identified. %s could not be told apart from %d namesakes, one of whom "
                         "is not eligible to practise. Held open."
                         % (matched, name, count)),
            # The G1 branch above sets this and G2 did not, which is how Arash Law lost Certified
            # over a stranger in the register who shares a surname with one of its sixteen
            # lawyers, every one of whom is clean.
            "unresolvable": ("A namesake carries an adverse status and the register holds no "
                             "field that would tell the two people apart")}
    elif matched:
        # A reproval or a probation without suspension is real and is on the public record, and
        # this gate does not name it. Saying so is the only honest way to pass a firm that has
        # one: the alternative is a clean-sounding sentence that a reader could check and find
        # incomplete.
        # Named, not detailed, and that is a correction of my own first draft. The first version
        # printed the action: "the register does carry conviction record transmitted to state bar
        # court 22-C-30118 against Kevin Cowan". California requires an attorney to report any
        # conviction, a traffic matter included, and the transmittal is a referral rather than a
        # finding. Printing it on a firm's profile publishes something grave about a named person
        # that this gate does not measure and that we have not read the underlying record for.
        # This site publishes what it measures. Where the register holds something else, it says
        # so and sends the reader to the register, which is the only place the detail belongs.
        rest = ""
        if result["other_discipline"]:
            n, what, url = result["other_discipline"][0]
            year = re.search(r"(19|20)\d{2}", what)
            rest = (". The State Bar's record for %s carries an earlier entry%s, which is "
                    "not outstanding against the licence today and is published in full at %s"
                    % (n, " from %s" % year.group(0) if year else "", url))
        gates["G2"] = {
            "pass": True, "source": DATASET, "checked_at": TODAY,
            "evidence": ("No named attorney carries a disbarment, a suspension or a disciplinary "
                         "resignation on the State Bar of California's record, across the %d we "
                         "identified. Administrative suspensions, which the State Bar states are "
                         "non-disciplinary, are not counted here%s" % (matched, rest))}
    else:
        gates["G2"] = {
            "pass": False, "checked_at": TODAY,
            "source": "%s, partial" % DATASET,
            "evidence": ("No attorney this firm names could be identified in the register, so "
                         "no disciplinary record could be looked up either."),
            "unresolvable": ("With no attorney identified in the register, there is no "
                             "disciplinary record to find or to fail to find")}
    return gates


def attorneys_of(record: dict) -> list[dict]:
    """The named attorneys, from a staging record or from a published firm."""
    found = record.get("attorneys_found")
    if isinstance(found, dict) and found.get("attorneys"):
        return found["attorneys"]
    if isinstance(record.get("attorneys"), list):
        return record["attorneys"]
    return []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains", help="comma-separated staging domains")
    ap.add_argument("--firms-dir", action="store_true",
                    help="read published firms under src/data/firms instead of staging")
    ap.add_argument("--state", default="CA", help="with --firms-dir, which market state")
    ap.add_argument("--limit", type=int, help="only the first N")
    ap.add_argument("--firm", action="append",
                    help="with --firms-dir, one slug; repeatable")
    ap.add_argument("--write", action="store_true", help="write the gates back")
    ap.add_argument("--staging", default=".crawl")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--resume", action="store_true",
                    help="skip firms whose gates already cite this register")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    targets = []
    if args.firms_dir:
        for path in sorted((ROOT / "src/data/firms").rglob("*.json")):
            try:
                d = json.load(io.open(path, encoding="utf-8"))
            except (ValueError, OSError):
                continue
            if (d.get("market") or {}).get("state") == args.state:
                targets.append((path, d, d.get("name") or d.get("domain"),
                                (d.get("market") or {}).get("city") or ""))
    else:
        if not args.domains:
            print("give --domains or --firms-dir", file=sys.stderr)
            return 2
        for domain in [d.strip() for d in args.domains.split(",") if d.strip()]:
            path = ROOT / args.staging / (domain + ".json")
            if not path.exists():
                print("no staging record for %s" % domain, file=sys.stderr)
                continue
            d = json.load(io.open(path, encoding="utf-8"))
            targets.append((path, d, domain, ""))

    if args.firm:
        wanted = {f.strip().lower() for f in args.firm}
        targets = [t for t in targets if t[0].stem.lower() in wanted]
    if args.limit:
        targets = targets[:args.limit]

    passed = held = 0
    for i, (path, record, label, city) in enumerate(targets, 1):
        # A run over 252 firms and 1,052 names takes hours, and the last one died with
        # the session at firm 153. Re-asking the register about a firm it already
        # answered costs that firm another few dozen queries for nothing.
        if args.resume and "State Bar of California" in (
                ((record.get("gates") or {}).get("G1") or {}).get("source") or ""):
            continue
        attorneys = attorneys_of(record)
        if not attorneys:
            print("%3d/%d %-34s no named attorneys, nothing to look up"
                  % (i, len(targets), str(label)[:34]))
            # Skipping the lookup is right; leaving the old sentence behind is not. 82 Californian
            # profiles still read "California does not publish an attorney register we can query",
            # which stopped being true the day this script landed. The reason this firm's licences
            # are unverified is that it names nobody, and that is a fact about the firm, which G5
            # already measures. Say that instead of a false fact about the state.
            if args.write and "State Bar of California" not in (
                    ((record.get("gates") or {}).get("G1") or {}).get("source") or ""):
                reason = ("This firm names no attorney on its own site, so there is no licence to "
                          "look up. The State Bar of California does publish a register we can "
                          "query; it was not the obstacle.")
                # unresolvable, and the flag matters more than the sentence. The engine reads a
                # gate that did not pass as a finding against the firm unless something on the
                # record says otherwise, and prose does not say otherwise to a machine: the
                # evidence here reads "it was not the obstacle" and 75 Californian firms would
                # still have been published as Not eligible, for naming no attorney, which G5
                # already measures. This is the New York general-partnership case in different
                # words. The source exists, we could have queried it, and this firm gave us
                # nothing to query it with.
                gates = {
                    "G1": {"pass": False, "evidence": reason,
                           "unresolvable": ("The firm names no attorney, so the register has no "
                                            "name to look up and no answer to give"),
                           "source": "%s, nothing to query" % DATASET, "checked_at": TODAY},
                    "G2": {"pass": False, "checked_at": TODAY,
                           "unresolvable": ("With no attorney named, there is no licence whose "
                                            "disciplinary record could be read"),
                           "source": "%s, nothing to query" % DATASET,
                           "evidence": ("With no attorney named, there is no disciplinary record "
                                        "to look up either.")},
                }
                record.setdefault("gates", {}).update(gates)
                io.open(path, "w", encoding="utf-8", newline="\n").write(
                    json.dumps(record, ensure_ascii=False, indent=2) + "\n")
            continue
        print("%3d/%d %-34s %d attorney(s)" % (i, len(targets), str(label)[:34], len(attorneys)))
        result = assess(attorneys, record.get("name") or str(label), city, args.verbose)
        if not result["total"]:
            # Every name this firm gave was page furniture. There is nobody to look up, so there
            # is nothing to say: writing "None of the 0 attorneys this firm names could be found"
            # would be a finding about a firm from a sentence with no subject.
            print("        every name here is page furniture (%s), nothing to look up"
                  % ", ".join(result["not_people"][:3]))
            continue
        gates = gates_from(result)
        print("        G1 %-5s G2 %-5s  %s"
              % (gates["G1"]["pass"], gates["G2"]["pass"], gates["G1"]["evidence"][:88]))
        passed += 1 if gates["G1"]["pass"] else 0
        held += 0 if gates["G1"]["pass"] else 1

        if args.write:
            record.setdefault("gates", {}).update(gates)
            # The licence number and the admission year go back onto the attorney they belong
            # to. Without them A2 and A6 have nothing to read, and adding California to the set
            # of states with a readable register would move both into the denominator at zero,
            # which would take points off seventy three firms for a check that just succeeded.
            for a in attorneys:
                note = result["annotations"].get((a.get("name") or "").strip())
                if note:
                    a.update(note)
            io.open(path, "w", encoding="utf-8", newline="\n").write(
                json.dumps(record, ensure_ascii=False, indent=2) + "\n")

    print()
    print("%d firm(s) clear G1, %d held" % (passed, held))
    if not args.write:
        print("Nothing was written. Re-run with --write once the findings read correctly.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
