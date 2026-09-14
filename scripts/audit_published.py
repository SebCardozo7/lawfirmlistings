#!/usr/bin/env python3
"""
Read every published profile the way a hostile reader would, and report what will not hold up.

The directory's whole claim is that a number on a profile can be traced to something public. That
claim is only as good as the worst profile, and the worst profile is never the one you remember
writing. Two of the errors this project has already had to undo, New York findings published
about a Maryland firm and a discipline report attached to the wrong Mark Herman, were both
invisible in the file and obvious in a list.

So this is a list. Every check is a question somebody could ask us in public, and none of them
takes an opinion about quality: each is about whether a published statement is supported.

Nothing here is fixed automatically. A finding is a thing to look at, and several of them will be
fine on inspection, which is exactly why the script reports rather than edits.

Usage:
    python scripts/audit_published.py
    python scripts/audit_published.py --check names,roster
    python scripts/audit_published.py --firm cellino-law-injury-attorneys
"""
from __future__ import annotations

import argparse
import collections
import io
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"
PUBLIC = ROOT / "public"

# A firm name that opens with one of these is a phrase somebody typed into a Google Business
# Profile to rank, not a name. Two got as far as a draft: "Workers Compensation Lawyers NYC
# Injury..." and a brand where the firm has a real name on its own letterhead.
NAME_AS_PHRASE = re.compile(
    r"^(?:best|top|the best|cheap|affordable|free|24|nyc|new york|brooklyn|queens|bronx|manhattan|"
    r"baltimore|lakeland|personal injury|injury|accident|workers?|compensation|car accident|"
    r"truck|slip)\b", re.I)
# A title, not a name: a firm does not put a pipe or a call to action in what it calls itself.
NAME_IS_TITLE = re.compile(r"[|]|\bcall (?:now|us)\b|\bfree consultation\b|!", re.I)

# A roster page a firm files everyone under. A name from one of these with no registration
# behind it may be an office manager, a paralegal or an intake clerk, and publishing them under
# "attorneys" is a statement about a real person's credentials.
TEAM_PATH = re.compile(r"/(?:our-team|team|staff|our-staff|people|support)(?:/|$)", re.I)

# Prose that reads like it came off a navigation bar rather than out of a sentence.
#
# The case-insensitive flag does not belong on the whole pattern, and the first version had it:
# `[a-z]` under re.I matches every letter there is, so "starts with a lower-case letter" became
# "starts with a letter" and the check reported all fifty-nine firms' perfectly good opening
# sentences. A check that fires on everything finds nothing.
NAV_FRAGMENT = re.compile(
    r"^[a-z]|^\W|"
    r"\b(?:[Mm]enu|[Ss]kip to|[Tt]oggle|[Cc]lick here)\b|"
    r"\s{3,}|[·|]\s*$")


def load():
    out = []
    for path in sorted(FIRMS.rglob("*.json")):
        try:
            out.append((path, json.load(io.open(path, encoding="utf-8"))))
        except ValueError as err:
            print("UNREADABLE %s: %s" % (path, err), file=sys.stderr)
    return out


def check_names(firms):
    for path, f in firms:
        name = f.get("name") or ""
        if NAME_AS_PHRASE.match(name) or NAME_IS_TITLE.search(name):
            yield path, "name", "%r reads as a search phrase or a page title" % name


# States whose attorney register we may query. Everywhere else an attorney has no registration
# on the record because the state does not publish one we can read, which is a fact about the
# state and not a question about the firm. Without this the check reported every Maryland and
# Florida firm, which is noise that hides the two rosters actually worth reading.
OPEN_REGISTER_STATES = {"NY"}


# A role that says the person practises law. Kept here rather than imported, because the
# authority is src/lib/roster.ts and this is a second opinion on the same question: a check that
# shares its subject's code cannot catch its subject's bug.
LAWYER_ROLE = re.compile(
    r"\b(attorney|lawyer|partner|associate|of counsel|counsel|esq|shareholder)\b", re.I)


def check_roster(firms):
    """The question is not who is unmatched, it is who we are calling an attorney anyway.

    This used to report every name that came off a team page without a registration, which was
    the right alarm for the wrong thing: those people are published now as named by the firm
    without a role, which is what the firm's page actually says. What matters is the regression,
    a role asserted where the record says the firm never stated one.
    """
    for path, f in firms:
        people = f.get("attorneys") or []
        asserted = [a for a in people
                    if a.get("role_source") == "not stated by the firm"
                    and LAWYER_ROLE.search(a.get("role") or "")]
        if asserted:
            yield (path, "roster",
                   "%d name(s) carry a lawyer's role the record says the firm never printed: %s"
                   % (len(asserted), ", ".join(a["name"] for a in asserted[:4])))

        if (f.get("market") or {}).get("state") not in OPEN_REGISTER_STATES:
            continue
        # Informational, and a real signal about the firm rather than about us: a practice that
        # publishes a dozen people and says which two are lawyers is telling a reader very little.
        roleless = [a for a in people if not a.get("role") and not a.get("bar_number")]
        if len(people) >= 8 and len(roleless) / len(people) > 0.5:
            yield (path, "roster",
                   "%d of %d people the firm names carry neither a role nor a registration"
                   % (len(roleless), len(people)))


def check_fee(firms):
    for path, f in firms:
        fee = f.get("fee_statement")
        if fee and NAV_FRAGMENT.search(fee):
            yield path, "fee", "fee_statement does not read as a sentence: %r" % fee[:90]


def check_amounts(firms):
    for path, f in firms:
        for r in (f.get("results") or []):
            if r.get("amount") and not r.get("verified"):
                yield (path, "amount",
                       "publishes %s for %r without a verified source"
                       % (r["amount"], (r.get("title") or "")[:50]))


def check_market(firms):
    for path, f in firms:
        state = (f.get("market") or {}).get("state")
        offices = f.get("offices") or []
        if state and offices and not any(
                re.search(r",\s*%s\s+\d|,\s*%s$" % (state, state), o.get("address") or "")
                for o in offices):
            yield (path, "market",
                   "ranked in %s with no office whose address is in %s" % (state, state))


def check_reviews(firms):
    for path, f in firms:
        g = (f.get("reviews") or {}).get("google")
        places = (f.get("digital") or {}).get("places")
        if not g or not places:
            continue
        label = int(re.sub(r"[^0-9]", "", str(g.get("count_label") or "")) or 0)
        total = places.get("review_count_total") or 0
        if label and total and abs(label - total) > max(5, 0.02 * total):
            yield (path, "reviews",
                   "profile shows %s reviews, the Places aggregate holds %d" % (label, total))


def check_practice_evidence(firms):
    for path, f in firms:
        for p in (f.get("practices") or []):
            if not p.get("source_url"):
                yield (path, "practice",
                       "lists %r with no link to the page that evidences it" % p.get("name"))


def check_logo(firms):
    for path, f in firms:
        logo = f.get("logo")
        if logo and not (PUBLIC / "logos" / pathlib.Path(logo["file"]).name).exists():
            yield path, "logo", "logo.file %r is not in public/logos" % logo["file"]


def check_score(firms):
    for path, f in firms:
        s = f.get("score")
        if not s:
            yield path, "score", "published with no score at all"
            continue
        tier, status = s.get("tier"), f.get("status")
        expected = ("certified" if tier in ("Certified", "Distinguished", "Elite")
                    else "verified" if tier == "Verified"
                    else "not_eligible" if tier == "Not eligible" else "listed")
        if status != expected:
            yield path, "score", "status %r but the engine computed tier %r" % (status, tier)
        if s.get("comparable") is False and status == "certified":
            yield path, "score", "certified on a score the engine says is not comparable"


def check_gates(firms):
    known = {"G1", "G2", "G3", "G5", "G6"}
    for path, f in firms:
        extra = set(f.get("gates") or {}) - known
        if extra:
            yield path, "gates", "carries %s, which the methodology does not have"  % ", ".join(sorted(extra))


def check_prose(firms):
    """Copy that asserts something no field on the record supports."""
    for path, f in firms:
        for para in (f.get("about") or []):
            if NAV_FRAGMENT.search(para):
                yield path, "prose", "about paragraph reads like scraped navigation: %r" % para[:80]
        q = f.get("quote")
        if q and not (q.get("attribution") or "").strip():
            yield path, "prose", "publishes a pull quote with no attribution"
        for h in (f.get("highlights") or []):
            if not (h.get("text") or "").strip():
                yield path, "prose", "an empty highlight is rendered as a card"


def check_duplicates(firms):
    for field in ("slug", "domain"):
        seen = collections.defaultdict(list)
        for path, f in firms:
            seen[f.get(field)].append(path.name)
        for value, files in seen.items():
            if len(files) > 1:
                yield (FIRMS, field, "%s %r appears in %s" % (field, value, ", ".join(files)))


CHECKS = {
    "names": check_names, "roster": check_roster, "fee": check_fee, "amounts": check_amounts,
    "market": check_market, "reviews": check_reviews, "practice": check_practice_evidence,
    "logo": check_logo, "score": check_score, "gates": check_gates, "prose": check_prose,
    "duplicates": check_duplicates,
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", help="comma-separated subset of: " + ", ".join(CHECKS))
    ap.add_argument("--firm", help="one slug")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    firms = load()
    if args.firm:
        firms = [(p, f) for p, f in firms if f.get("slug") == args.firm]
    names = [c.strip() for c in (args.check or ",".join(CHECKS)).split(",") if c.strip()]

    findings = []
    for name in names:
        if name not in CHECKS:
            print("no check called %r" % name, file=sys.stderr)
            return 2
        findings.extend((name, p, k, msg) for p, k, msg in CHECKS[name](firms))

    by_kind = collections.Counter(k for _, _, k, _ in findings)
    for kind in sorted(by_kind):
        print()
        print("== %s (%d)" % (kind, by_kind[kind]))
        for _, path, k, msg in findings:
            if k != kind:
                continue
            label = path.name if hasattr(path, "name") else str(path)
            print("   %-46s %s" % (label[:46], msg))

    print()
    print("%d finding(s) across %d published firm(s)" % (len(findings), len(firms)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
