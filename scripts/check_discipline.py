#!/usr/bin/env python3
"""
Attorney discipline where the state publishes no register we may query.

G2 asks whether any attorney the firm names carries public discipline. In New York the state's
open data answers it: the register holds a current status per attorney and we read it. Outside New
York there was no answer at all, so the gate sat unresolved on every Maryland profile, and
Maryland is not going to change: mdcourts.gov/robots.txt carries Disallow: /attysearch, so its
attorney search is off limits to an automated reader and we leave it alone.

The decisions themselves, though, are court opinions, and courts publish those. CourtListener,
run by the Free Law Project, indexes 2,600 Maryland attorney grievance decisions going back
decades, and its search API answers without a key. That is a complete, queryable record of who
has been disciplined in Maryland, which is the thing a client actually wants to know.

Four states are here now: Maryland, Florida, Oregon and Indiana. Each names the disciplined
attorney in its own way and the table below carries the difference, because the parsing is the
only part that is state-specific. Texas is absent on purpose. Its discipline is decided by
evidentiary panels and the Board of Disciplinary Appeals rather than by an appellate court, so
the index holds thirteen Texas cases in total and thirteen cases is not a record. Dallas
profiles carry G2 unresolved and say why, which is where Maryland started.

What this establishes, and what it does not. A published decisions index is strong on history and
silent on the present: it shows that somebody was disbarred in 1994, and it cannot show that
somebody is in good standing today the way a register's status field can. The evidence line says
so in those words rather than letting a pass be read as a licence check. It is not G1, and this
script never touches G1.

One shared surname is not a match, which is the rule the New York checker learned the hard way.
The index gives case names only: "Attorney Grievance Comm'n v. Kolodner" names a surname and
nothing else, because caseNameFull comes back empty from the search index. So a surname hit is a
candidate, and the candidate is then put to the decision's own text.

Three outcomes, and the middle one is why this is worth having:

    identified   a decision whose case name carries the surname also prints the attorney's full
                 name. That is discipline, and the gate fails with the case cited.

    cleared      every decision naming that surname has searchable text and none of them prints
                 this attorney's name. The disciplined lawyer is somebody else, and we can say so
                 rather than leaving a shadow over a common surname.

    unreadable   at least one of those decisions is a scan with no searchable text. The question
                 cannot be answered, so it is not answered.

The first draft accepted a first name on its own and came within one commit of publishing that an
attorney at a working Baltimore firm was the respondent in Attorney Grievance Commission v. Herman,
because the word "Mark" appears somewhere in that 2004 opinion. The full name phrase returns
nothing and the opinion is indexed, so the correct finding about him is the opposite one: cleared.
A first name is not an identification and nothing here treats it as one.

Usage:
    python scripts/check_discipline.py --state MD              # build the index, report
    python scripts/check_discipline.py --state MD --write --gates
    python scripts/check_discipline.py --state MD --refresh    # re-download the index
    python scripts/check_discipline.py --state IN --write --gates
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
SEARCH = "https://www.courtlistener.com/api/rest/v4/search/"
DELAY = 6.0   # the unauthenticated search API returns 429 quickly
TODAY = datetime.date.today().isoformat()
ROOT = pathlib.Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"
LF = chr(10)

# The courts that hear attorney discipline in each state, and what the cases are called there.
# Only states we have actually checked appear here: a state absent from this table has no
# discipline source as far as this script is concerned, and says so rather than guessing.
REGISTERS = {
    "MD": {
        "courts": "md mdctspecapp",
        "case_name": "Attorney Grievance",
        "body": "the Attorney Grievance Commission of Maryland",
    },
    # Florida's recent decisions carry the respondent's full name: "The Florida Bar v.
    # Christopher W. Crowley" identifies a person where "Attorney Grievance Comm'n v. Kolodner"
    # identifies only a surname. Recent is the operative word. Across the whole index, 1946 to
    # today, 91 of 1,237 do it, which is 7 per cent, so the full-name path is a shortcut that
    # happens to cover the newest cases and not a property of the state. Everything else falls
    # through to the surname screen and the text search, exactly as Maryland does.
    "FL": {
        "courts": "fla",
        "case_name": "The Florida Bar",
        "body": "the Supreme Court of Florida on the discipline of Florida Bar members",
    },
    # Oregon names nobody as a plaintiff. The case is "In Re Complaint as to the Conduct of
    # Kirchoff", so the respondent stands after "Conduct of" and the shape is Maryland's: a
    # surname alone, settled afterwards against the decision's own text.
    #
    # The index stops in 2017, and that is a property of the record rather than of this script:
    # Oregon publishes current discipline through the State Bar's Disciplinary Board Reporter
    # rather than as Supreme Court opinions, and a search for anything filed since 2018 returns
    # nothing. The evidence line on every profile prints the range it read, which is the only
    # honest way to use an index that ends nine years ago. It answers whether an attorney was
    # disciplined up to 2017 and it does not answer this year.
    "OR": {
        "courts": "or",
        "case_name": "Conduct of",
        "respondent_after": r"Conduct of\s+",
        "body": "the Supreme Court of Oregon on the conduct of Oregon State Bar members",
    },
    # Indiana writes the respondent's full name into the case name, "In the Matter of Robert
    # James Hardy", and keeps publishing: the newest decision in the index is from this year.
    # That makes it the strongest of the four, with one catch worth the extra term below.
    #
    # "In the Matter of" is also how Indiana titles rule amendments, petitions and every other
    # matter that is not a person, and an attorney whose surname turned up in one of those would
    # be reported as disciplined. So the index asks for decisions that also mention the
    # Disciplinary Commission, which is 301 of the 383 and is named in every real one.
    "IN": {
        "courts": "ind",
        "case_name": "In the Matter of",
        "respondent_after": r"In (?:the )?Matter of\s+(?:the\s+)?",
        "require": "Disciplinary Commission",
        "body": "the Supreme Court of Indiana on the discipline of Indiana attorneys",
    },
}

# Words in a case name that are the court's, the commission's or a title, not a respondent's.
#
# The last four are Indiana's. "In the Matter of the Honorable Jane Doe" is a judicial discipline
# case, and leaving "Honorable" in the name would be worse than cosmetic: a full name that does
# not match is read as positively cleared, so a judge called Doe would clear an attorney called
# Doe. "Anonymous" is how Indiana titles a private reprimand, and it names nobody at all.
NOT_A_NAME = re.compile(
    r"^(?:attorney|grievance|comm|commission|commn|of|maryland|md|state|bar|counsel|"
    r"in|re|matter|the|and|v|vs|honorable|hon|judge|anonymous)\.?$", re.I)

SUFFIX = re.compile(r"^(?:jr|sr|ii|iii|iv|esq|p\.?a|pc|llc|llp)\.?$", re.I)


def fetch(params):
    url = SEARCH + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    # The unauthenticated search API rate-limits hard, and a firm with five common surnames on
    # its roster asks twenty questions in a row. Two sixty-second retries were not enough: the
    # run reached the last firm of seven and died, which is a worse outcome than being slow.
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:
                time.sleep(30 * (attempt + 1))
                continue
            raise
        except Exception:                 # a dropped connection is not an answer
            if attempt == 4:
                raise
            time.sleep(5)
    return {}


def respondent_tokens(case_name: str, spec: dict | None = None) -> list:
    """The name the case is brought against, as tokens, or [] where it names nobody.

    "In Re: Amendments to Florida Family Law Rules" sits on the same docket as the discipline
    decisions and is not about a person, so it has to come back empty rather than nominating
    "Rules" as a respondent.

    Where the respondent's name begins is a property of the state, not of this function. Maryland
    and Florida bring a case against somebody, so it is after "v.". Oregon and Indiana bring no
    case against anybody: the name follows "Conduct of" or "In the Matter of". A state whose spec
    does not say gets the "v." reading, which is what the first two needed.
    """
    marker = (spec or {}).get("respondent_after") or r"\bv\.?\s"
    parts = re.split(marker, case_name, maxsplit=1, flags=re.I)
    if len(parts) < 2:
        return []
    tail = parts[1].strip().strip(".,")
    tail = re.split(r"\s*[,(]| and | & ", tail)[0].strip()
    return [t for t in tail.split() if not SUFFIX.match(t) and not NOT_A_NAME.match(t)]


def respondent(case_name: str, spec: dict | None = None) -> str | None:
    """The respondent's surname, which is all Maryland's case names carry."""
    tokens = respondent_tokens(case_name, spec)
    return tokens[-1].strip(".,").casefold() if tokens else None


def respondent_full(case_name: str, spec: dict | None = None) -> str | None:
    """The respondent's full name, where the state's case names give one.

    Florida writes "The Florida Bar v. Christopher W. Crowley" and Maryland writes "Attorney
    Grievance Comm'n v. Kolodner". Where the full name is there it settles in one step what a
    surname otherwise leaves to a full-text search that frequently cannot answer it, so it is
    worth keeping rather than reducing every state to the weaker of the two.
    """
    tokens = respondent_tokens(case_name, spec)
    return " ".join(tokens) if len(tokens) >= 2 else None


def build_index(state: str, cache: pathlib.Path, refresh: bool):
    if cache.exists() and not refresh:
        with io.open(cache, encoding="utf-8") as fh:
            return json.load(fh)

    spec = REGISTERS[state]
    # A term the real decisions all contain, where the case-name pattern alone is not specific
    # enough to a person. Only Indiana needs it, and the comment on its entry says why.
    query = 'caseName:("%s")' % spec["case_name"]
    if spec.get("require"):
        query += ' AND "%s"' % spec["require"]
    params = {"type": "o", "court": spec["courts"],
              "q": query, "order_by": "dateFiled desc"}
    cases, pages, total = [], 0, None
    cursor = None
    while True:
        page = fetch(dict(params, **({"cursor": cursor} if cursor else {})))
        if total is None:
            total = page.get("count")
        for row in page.get("results") or []:
            name = row.get("caseName") or ""
            cases.append({"case": name,
                          "date": row.get("dateFiled"),
                          "surname": respondent(name, spec),
                          "full": respondent_full(name, spec),
                          "url": "https://www.courtlistener.com" + (row.get("absolute_url") or "")})
        pages += 1
        print("  page %-3d  %d case(s) so far" % (pages, len(cases)), flush=True)
        nxt = page.get("next")
        if not nxt:
            break
        parsed = urllib.parse.parse_qs(urllib.parse.urlparse(nxt).query)
        cursor = (parsed.get("cursor") or [None])[0]
        if not cursor:
            break
        time.sleep(DELAY)

    index = {
        "state": state,
        "body": spec["body"],
        "reported_total": total,
        "collected": len(cases),
        "dates": [min(c["date"] for c in cases if c["date"]),
                  max(c["date"] for c in cases if c["date"])] if cases else None,
        "cases": cases,
        "source": "CourtListener (Free Law Project) opinion search, courts %s" % spec["courts"],
        "built_at": TODAY,
    }
    io.open(cache, "w", encoding="utf-8", newline=LF).write(
        json.dumps(index, ensure_ascii=False, indent=2) + LF)
    return index


def surname_of(name: str) -> str | None:
    tokens = [t for t in name.replace(".", " ").split() if not SUFFIX.match(t)]
    return tokens[-1].casefold() if tokens else None


def first_token(name: str) -> str | None:
    tokens = [t for t in name.replace(".", " ").split() if len(t) > 1]
    return tokens[0] if tokens else None


def name_key(name: str) -> str:
    """First and last name, lowercased. Middle names and initials are dropped on both sides.

    A decision writes "Christopher W. Crowley" and a firm's roster writes "Christopher Crowley",
    and they are one person. Two different Crowleys with different first names are not, which is
    the distinction this has to keep while ignoring the middle.
    """
    tokens = [t.strip(".,").casefold() for t in (name or "").replace(".", " ").split()]
    tokens = [t for t in tokens if t and not SUFFIX.match(t)]
    if len(tokens) < 2:
        return " ".join(tokens)
    return tokens[0] + " " + tokens[-1]


def name_variants(attorney: str) -> list:
    """The forms a decision is likely to print, longest first.

    Phrase matching is brittle around middle initials and suffixes. A profile says "Ronald V.
    Miller Jr." and the decision says "Ronald V. Miller", so both the suffix-stripped full name
    and the plain first-and-last are tried.
    """
    tokens = [t for t in attorney.replace(",", " ").split() if t]
    tokens = [t for t in tokens if not SUFFIX.match(t.strip("."))]
    out = []
    if len(tokens) >= 2:
        out.append(" ".join(tokens))
        first_last = tokens[0] + " " + tokens[-1]
        if first_last not in out:
            out.append(first_last)
    return out


def verify(state: str, attorney: str, surname: str, hits: list):
    """Is this attorney the respondent? Returns (verdict, note).

    True means positively identified: a decision whose case name carries the surname also prints
    this person's full name. False means positively cleared, which is the finding this exists for:
    every decision naming that surname has searchable text, and none of them prints this name, so
    the disciplined lawyer is somebody else. None means the question cannot be answered, because
    at least one of those decisions is a scan with no searchable text.

    The first draft of this accepted a first name on its own, and that was very nearly a
    disaster: it reported an attorney at a working Baltimore firm as the respondent in Attorney
    Grievance Commission v. Herman because the word "Mark" appears somewhere in that 2004
    opinion. Searching the full name phrase returns nothing, and the opinion's text is indexed,
    so the right answer about him was the opposite one. A first name is not an identification,
    and nothing here treats it as one.
    """
    spec = REGISTERS[state]
    variants = name_variants(attorney)

    # Where every decision naming this surname also names the respondent in full, the index
    # already holds the answer and no search is needed. That is the case for most of Florida's
    # recent decisions and for almost none of its older ones, so the condition is "all of them",
    # not "any of them": one full name among four surname-only cases settles nothing.
    #
    # Compared on name tokens rather than strings, so "Christopher W. Crowley" and "Christopher
    # Crowley" are one person while "Christopher Crowley" and "Daniel Crowley" are two.
    named = [h for h in hits if h.get("full")]
    if named and len(named) == len(hits):
        ours = name_key(attorney)
        for h in named:
            if name_key(h["full"]) == ours:
                return True, None
        return False, ("every decision naming this surname names the respondent in full, and "
                       "none of them is this attorney")

    base = 'caseName:("%s" AND %s)' % (spec["case_name"], surname)
    if spec.get("require"):
        base += ' AND "%s"' % spec["require"]
    if not variants:
        return None, "only one name token is published for this attorney"

    for variant in variants:
        page = fetch({"type": "o", "court": spec["courts"],
                      "q": '%s AND "%s"' % (base, variant)})
        time.sleep(DELAY)
        if page.get("count"):
            return True, None

    # Was the text actually searchable? Every one of these decisions contains the word
    # Respondent, so it doubles as a test of whether the opinion is full-text indexed at all.
    total = fetch({"type": "o", "court": spec["courts"], "q": base}).get("count") or 0
    time.sleep(DELAY)
    indexed = fetch({"type": "o", "court": spec["courts"],
                     "q": '%s AND "Respondent"' % base}).get("count") or 0
    time.sleep(DELAY)

    if total and indexed >= total:
        return False, ("read the text of all %d decision(s) naming this surname; none names this "
                       "attorney" % total)
    return None, ("%d of %d decision(s) naming this surname have no searchable text, so they can "
                  "be neither tied to nor ruled out against this attorney"
                  % (max(total - indexed, 0), total))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", required=True, choices=sorted(REGISTERS))
    ap.add_argument("--refresh", action="store_true", help="re-download the decisions index")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--gates", action="store_true", help="also set G2 on the profiles")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    cache = ROOT / ".crawl" / ("discipline_%s.json" % args.state.lower())
    print("index of %s decisions" % REGISTERS[args.state]["body"])
    index = build_index(args.state, cache, args.refresh)
    surnames = {}
    for case in index["cases"]:
        if case["surname"]:
            surnames.setdefault(case["surname"], []).append(case)
    print("%d decision(s) collected of %s reported · %d distinct surname(s) · %s to %s"
          % (index["collected"], index["reported_total"], len(surnames),
             (index["dates"] or ["?", "?"])[0], (index["dates"] or ["?", "?"])[1]))
    print()

    for path in sorted(FIRMS.rglob("*.json")):
        firm = json.loads(path.read_text(encoding="utf-8"))
        if firm.get("market", {}).get("state") != args.state:
            continue
        attorneys = firm.get("attorneys") or []
        if not attorneys:
            print("%-44s no attorney named, nothing to check" % firm["slug"][:44])
            continue

        adverse, cleared, unresolved = [], [], []
        for attorney in attorneys:
            surname = surname_of(attorney["name"])
            hits = surnames.get(surname or "", [])
            if not hits:
                continue
            # One lookup that will not complete must not cost the other six firms their gate.
            # An attorney we could not ask about is unresolved, which is what unresolved is for.
            try:
                verdict, note = verify(args.state, attorney["name"], surname, hits)
            except Exception as e:
                verdict, note = None, ("the decisions index could not be reached for this "
                                       "attorney (%s)" % str(e)[:60])
            if verdict is True:
                adverse.append((attorney["name"], hits[0]))
            elif verdict is False:
                cleared.append((attorney["name"], note))
            else:
                unresolved.append((attorney["name"], hits[0], note))

        print("%-44s %d attorney(s) · %d adverse · %d cleared · %d unreadable"
              % (firm["slug"][:44], len(attorneys), len(adverse), len(cleared), len(unresolved)))
        for name, case in adverse:
            print("    ADVERSE  %-28s %s (%s)" % (name, case["case"], (case["date"] or "")[:4]))
        for name, note in cleared:
            print("    cleared  %-28s %s" % (name, note))
        for name, case, note in unresolved:
            print("    note     %-28s %s (%s): %s" % (name, case["case"],
                                                      (case["date"] or "")[:4], note))

        if not (args.write and args.gates):
            continue
        gate = (firm.get("gates") or {}).get("G2") or {}
        if gate.get("attested") or "data.ny.gov" in (gate.get("source") or ""):
            continue

        body = index["body"]
        span = "%s to %s" % ((index["dates"] or ["?", "?"])[0][:4],
                             (index["dates"] or ["?", "?"])[1][:4])
        source = ("Published decisions of %s, indexed by CourtListener (Free Law Project)" % body)
        if adverse:
            name, case = adverse[0]
            new = {"pass": False, "source": source, "checked_at": TODAY,
                   "evidence": "%s is the respondent in %s (%s)."
                               % (name, case["case"], (case["date"] or "")[:4])}
        elif unresolved:
            name, case, note = unresolved[0]
            # "unavailable" rather than "incomplete", and the difference decides a tier.
            #
            # An unreadable decision is a scan with no text layer. Nobody can search it, not us
            # and not next month, so it is a limit of the published record and not a task we owe.
            # Filing it as unfinished work had a perverse effect: one firm had four of its five
            # surname collisions positively cleared by reading the decisions, and moved from
            # Verified down to Listed for the fifth. Adding a check that exonerated four
            # attorneys made the firm look worse, which cannot be right.
            #
            # So it sits with the other gaps the record itself imposes: it neither passes nor
            # blocks, and the evidence says exactly what was read and what could not be.
            new = {"pass": False, "source": "unavailable", "checked_at": TODAY,
                   "evidence": ("%d of the firm's attorneys share a surname with a disciplined "
                                "attorney, and for %s %s. The decisions that cannot be read are "
                                "scans without searchable text, so this is a limit of the "
                                "published record. Nothing here says the firm's attorney is that "
                                "person."
                                % (len(unresolved), name, note))}
        else:
            note = ""
            if cleared:
                note = (" %d of them share a surname with a disciplined attorney and were read "
                        "against the text of those decisions, which name somebody else."
                        % len(cleared))
            new = {"pass": True, "source": source, "checked_at": TODAY,
                   "evidence": ("No attorney this firm names appears as the respondent in any of "
                                "the %d published discipline decisions of %s, %s.%s Published "
                                "decisions record what has been decided, so this covers a "
                                "disbarment or suspension on the record and not whether a "
                                "registration is current today."
                                % (index["collected"], body, span, note))}
        firm.setdefault("gates", {})["G2"] = new
        io.open(path, "w", encoding="utf-8", newline=LF).write(
            json.dumps(firm, indent=2, ensure_ascii=False) + LF)

    print()
    if args.write and args.gates:
        print("G2 written. Run scripts/score.py to recompute.")
    else:
        print("report only. Add --write --gates to set G2.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
