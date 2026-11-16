#!/usr/bin/env python3
"""
Which of a cohort's About blocks need a person, and which do not.

open_market.py ends by saying the About blocks are ready for a person, and then a person has
93 of them to read. Most say nothing to argue with: a firm with one office in Altamonte
Springs, a contingency fee it states itself, a free first consultation it states itself. The
few that need a judgement are not marked in any way, so finding them means reading all of
them, and reading 93 to find 8 is how the ninth gets waved through.

So this reads the evidence `build_profiles` kept beside each block, in `_review`, and says
which firms to look at. It decides nothing and writes nothing. A firm it does not flag is a
firm it found nothing to say about, which is not the same as a firm somebody approved.

What it looks for, in two tiers:

  THE EVIDENCE DOES NOT SAY IT   The sentence claims something its own quote does not
                                 support. One firm's hospital-visits quote turns out to
                                 offer a video call, which is not the same offer.

  WORTH A GLANCE                 The quote is mostly page furniture, so the word that
                                 supports the claim may be a menu item rather than a
                                 promise; or the firm's name came from a listing it writes
                                 itself and is stuffed with the words it wants to rank for,
                                 which would put a competitor's keywords in our headings.

And one thing it asserts rather than reports: no paragraph may state a firm's own claim as
though we had checked it. Every fee, consultation and recovery figure keeps "the firm states"
or "its own figure", because we read them off the firm's pages. That is the line between a
directory that measures and a directory that repeats, and it is checked for every block in
the cohort, every run.

    python scripts/flag_about.py --cohort fl-orlando-personal-injury
    python scripts/flag_about.py --cohort fl-orlando-personal-injury --all
    python scripts/flag_about.py --selftest
"""
from __future__ import annotations

import argparse
import glob
import io
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DRAFTS = ROOT / ".crawl" / "profiles"

# What a claim has to be able to point at inside its own quote. Absent all of them, the
# sentence we publish is not what the evidence says.
SUPPORT = {
    "contingency": ["conting", "no fee", "no win", "unless we", "unless you win",
                    "pay nothing", "nothing unless", "$0", "no recovery", "no upfront",
                    "no cost unless", "only if you win", "percentage of"],
    "free_consultation": ["free consult", "free case", "free legal", "free evaluation",
                          "free review", "free initial", "no cost", "complimentary",
                          "consultation is free", "free"],
    "se_habla_espanol": ["espa", "spanish", "habla"],
    "available_24_7": ["24/7", "24-7", "24 hours", "24 hrs", "around the clock",
                       "day or night", "anytime", "always available", "any time"],
    # "come to you" matters as much as the word hospital: the claim is that the firm travels
    # to the client, and a firm that says so without the word hospital is still saying it.
    "hospital_visits": ["hospital", "home visit", "bedside", "come to you", "we will come",
                        "visit you", "your home", "we travel", "where you are"],
}

# Page furniture. A quote built mostly of this is a menu that happens to contain the word.
CHROME = ["skip to main content", "skip to content", "toggle navigation", "main menu",
          "primary menu", "menu home", "search for:", "open mobile menu",
          "all rights reserved", "privacy policy terms"]

# A name taken from a listing the firm writes itself, stuffed with what it wants to rank
# for. Published as the firm's name it puts those words in our own headings.
STUFFED = re.compile(
    r"(personal injury|accident|car crash|injury lawyer|injury attorney|"
    r"lawyers? in |attorneys? in |law firm in |best |top rated|#1)", re.I)

# The attribution a claim of the firm's own keeps, wherever it appears.
ATTRIBUTED = ("the firm states", "its own figure", "according to", "the firm says",
              "it states", "states that", "the firm reports", "the firm's own")

# A sentence that would need one.
CLAIMY = re.compile(
    r"contingen|no fee|free consult|first consultation|24/7|around the clock|"
    r"hospital|recovered|recovery of|settle", re.I)


def unattributed(about):
    """Paragraphs that state a firm's own claim as though we had checked it."""
    return [p for p in about
            if CLAIMY.search(p) and not any(a in p.lower() for a in ATTRIBUTED)]


def flags_for(draft):
    """(tier, kind, detail) for one draft. Empty means nothing to say about it."""
    out = []
    review = draft.get("_review") or {}
    material = review.get("about_material") or {}
    about = " ".join(draft.get("about") or [])

    for claim, evidence in (material.get("claims") or {}).items():
        quote = ((evidence or {}).get("quote") or "")
        words = SUPPORT.get(claim)
        if not words:
            continue
        if not any(w in quote.lower() for w in words):
            out.append(("evidence", "the quote does not say it",
                        "%s: %s" % (claim, quote[:88])))
        elif sum(1 for c in CHROME if c in quote.lower()) >= 2:
            out.append(("glance", "the quote is mostly a menu",
                        "%s: %s" % (claim, quote[:88])))

    source = review.get("name_source") or ""
    if "Google Business Profile" in source and STUFFED.search(draft.get("name") or ""):
        out.append(("glance", "the name is a keyword string",
                    "%s  <- %s" % (draft.get("name"), source)))

    offices = draft.get("offices") or []
    if offices:
        if "a single office" in about and len(offices) > 1:
            out.append(("evidence", "says one office, we hold %d" % len(offices),
                        about[:88]))
        if re.search(r"offices in ", about) and len(offices) == 1:
            out.append(("evidence", "says several offices, we hold 1", about[:88]))
    return out


def held(cohort):
    """The drafts of this cohort that place_profiles is holding for an About review."""
    for path in sorted(DRAFTS.glob("*.json")):
        draft = json.loads(path.read_text(encoding="utf-8"))
        if draft.get("cohort_id") != cohort:
            continue
        blocking = (draft.get("_review") or {}).get("blocking") or []
        if [b for b in blocking if "about[]" in b]:
            yield draft


def say(line=""):
    io.open(1, "w", encoding="utf-8", closefd=False).write(line + "\n")


def selftest():
    """The two tiers and the assertion, on drafts made up for the purpose."""
    def draft(claims=None, name="Smith Law", source="JSON-LD Organization.name",
              about=None, offices=1):
        return {"slug": "smith-law", "name": name,
                "about": about or ["Smith Law is a personal injury firm."],
                "offices": [{"address": "x"}] * offices,
                "_review": {"name_source": source, "blocking": ["about[]"],
                            "about_material": {"claims": claims or {}}}}

    cases = [
        (draft(), [], "a block with nothing claimed"),
        (draft({"contingency": {"quote": "We work on a contingency fee basis."}}), [],
         "a claim its quote supports"),
        (draft({"hospital_visits": {"quote": "connect with us by phone or video call"}}),
         ["the quote does not say it"], "A VIDEO CALL IS NOT A HOSPITAL VISIT"),
        (draft({"hospital_visits": {"quote": "If you cannot travel we will come to you."}}),
         [], "travelling to the client, without the word hospital"),
        (draft({"free_consultation": {
            "quote": "Home | Firm Skip to content Toggle navigation Free Consultation"}}),
         ["the quote is mostly a menu"], "the word sits in the furniture"),
        (draft(name="Orlando Personal Injury Attorneys",
               source="Google Business Profile display name"),
         ["the name is a keyword string"], "A NAME STUFFED WITH KEYWORDS"),
        (draft(name="Orlando Personal Injury Attorneys", source="JSON-LD Organization.name"),
         [], "the same name, where the firm published it itself"),
        (draft(about=["The firm has offices in Winter Park and Tampa."], offices=1),
         ["says several offices, we hold 1"], "more offices in prose than on record"),
        (draft(about=["The firm has a single office in Winter Park."], offices=3),
         ["says one office, we hold 3"], "fewer offices in prose than on record"),
    ]
    bad = 0
    for d, want, why in cases:
        got = [kind for _, kind, _ in flags_for(d)]
        if got != want:
            bad += 1
            say("  FAIL %s: %s, expected %s" % (why, got, want))
        else:
            say("  ok   %s" % why)

    # And the line the whole directory rests on.
    attributed = ["The firm states that it works on a contingency fee.",
                  "It recovered 4.2 million dollars, its own figure."]
    naked = ["It works on a contingency fee.", "The first consultation is free."]
    for paragraphs, want, why in ((attributed, 0, "an attributed claim passes"),
                                  (naked, 2, "A NAKED CLAIM IS CAUGHT")):
        got = len(unattributed(paragraphs))
        if got != want:
            bad += 1
            say("  FAIL %s: %d, expected %d" % (why, got, want))
        else:
            say("  ok   %s" % why)

    say("\nEvery check passed." if not bad else "\n%d check(s) failed." % bad)
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", help="cohort id, as in src/data/cohorts")
    ap.add_argument("--all", action="store_true", help="also list the firms with no flag")
    ap.add_argument("--selftest", action="store_true",
                    help="check the rules, with no drafts and no network")
    args = ap.parse_args()

    if args.selftest:
        sys.exit(selftest())
    if not args.cohort:
        sys.exit("--cohort <id>, or --selftest")

    drafts = list(held(args.cohort))
    if not drafts:
        sys.exit("No draft of %s is waiting for an About review." % args.cohort)

    flagged = [(d, f) for d, f in ((d, flags_for(d)) for d in drafts) if f]
    naked = [(d, unattributed(d.get("about") or [])) for d in drafts]
    naked = [(d, p) for d, p in naked if p]

    say(args.cohort)
    say("  held for an About review   %d" % len(drafts))
    say("  nothing to say about       %d" % (len(drafts) - len(flagged)))
    say("  LOOK AT THESE              %d" % len(flagged))
    say("")

    for tier, title in (("evidence", "the evidence does not say it"),
                        ("glance", "worth a glance")):
        rows = [(d, [f for f in fs if f[0] == tier]) for d, fs in flagged]
        rows = [(d, fs) for d, fs in rows if fs]
        if not rows:
            continue
        say("%s  (%d)" % (title.upper(), len(rows)))
        for d, fs in rows:
            say("  %s" % d["slug"])
            say("    %s" % (d.get("website") or d.get("domain") or ""))
            for _, kind, detail in fs:
                say("    %-32s %s" % (kind, detail))
        say("")

    if naked:
        say("A CLAIM OF THE FIRM'S IS STATED AS OURS  (%d)" % len(naked))
        say("  This is the one thing here that is not a matter of taste. Nothing may go out")
        say("  with it.")
        for d, paragraphs in naked:
            say("  %s" % d["slug"])
            for p in paragraphs:
                say("    %s" % p[:100])
        say("")
    else:
        say("No block states a firm's own claim as though we had checked it.")
        say("")

    if args.all:
        say("NOTHING TO SAY ABOUT THESE, WHICH IS NOT THE SAME AS APPROVED")
        for d, fs in ((d, flags_for(d)) for d in drafts):
            if not fs:
                say("  %-46s %s" % (d["slug"], (d.get("about") or [""])[0][:70]))


if __name__ == "__main__":
    main()
