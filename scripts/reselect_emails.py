#!/usr/bin/env python3
"""
Re-chooses the recipient for every firm already crawled, with no network.

scripts/crawl_emails.py kept up to four rejected addresses per firm in `others`, which is
the whole reason the preference order could be changed on 13 November 2026 without reading
1,388 websites again. This applies the new rank() to what is already on disk.

It is deliberately separate from the crawler. Re-running the crawl would be three hours and
would also pick up whatever has changed on those sites since, which is a different change
mixed into this one, and this file can be deleted once it has run.

    python scripts/reselect_emails.py            what would change, and nothing written
    python scripts/reselect_emails.py --write    rewrite .crawl/emails.json

Nothing here is printed in full: .crawl/emails.json holds real firms' contact addresses and
stays out of the repository, so the report names local parts and counts, never an address.
"""
import argparse
import importlib.util
import json
import pathlib
import re
import sys
from urllib.parse import unquote

ROOT = pathlib.Path(__file__).resolve().parents[1]
EMAILS = ROOT / ".crawl" / "emails.json"

spec = importlib.util.spec_from_file_location("crawl_emails", ROOT / "scripts" / "crawl_emails.py")
ce = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ce)


def domain_of(address):
    return address.split("@")[-1].lower().replace("www.", "")


# A mailbox named by gluing one or two characters onto a real one. Both ways this happened
# are fixed in the crawler now, in harvest(): a URL-encoded space in a mailto: href gave
# "%20info@" and then "20info@", and a literal backslash-n inside a script gave "ninfo@".
# Four firms were already stored that way and a letter to any of them bounces somewhere we
# cannot see, so the rows on disk are repaired here rather than left for the next crawl.
GLUED = re.compile(
    r"^[a-z0-9%]{1,3}(info|contact|intake|hello|office|mail|admin|team|legal)$")

# The text of a JSON escape, left at the front of a local part because a backslash cannot
# start an address and the letter after it can. The crawler stopped producing these on
# 16 November 2026; the rows already on disk still carry them.
#
# Stripped whatever follows it, rather than only in front of a word we recognise. The first
# version of this repair only stripped it from in front of info@ and its siblings, which
# left one firm with u003emediarequests@ still stored and, because nothing matched it, still
# read as a person's name and still preferred over that firm's real info@ address.
ESCAPED = re.compile(r"^u[0-9a-f]{4}")


def repair(addresses):
    """
    The stored pool, with the decoding artefacts taken out of it.

    unquote first, because "%20info@f.com" decodes to " info@f.com" and is then simply the
    right address. What is left after that is dropped rather than guessed at: a firm whose
    only stored address was an artefact ends with no address, which is a thing the crawl
    and the paid lookup both know how to act on, and is honest. Inventing "info@" from
    "ninfo@" would be writing to a mailbox nobody told us about.
    """
    out, seen = [], set()
    for a in addresses:
        if not a:
            continue
        # clean() is the crawler's own gate, so a row repaired here and a row crawled
        # tomorrow are judged by one rule rather than two that drift apart. It handles the
        # space and the stray @; GLUED handles what is syntactically a perfectly good
        # address and is still nobody's mailbox.
        a = ce.clean(unquote(a))
        if not a:
            continue
        local, at, dom = a.partition("@")
        a = ESCAPED.sub("", local) + at + dom
        if not local or ce.JUNK.search(a) or GLUED.match(a.split("@")[0]):
            continue
        if a not in seen:
            seen.add(a)
            out.append(a)
    return out


def selftest():
    """
    The repair rule, on the six strings that were actually stored as a firm's address.

    Every one of them was chosen, so a letter to any was already written or about to be.
    They are kept as cases rather than fixed by hand because this file runs over 1,388 rows
    and got one of them wrong on the first pass: stripping the JSON escape only in front of
    a word it recognised left u003emediarequests@ intact and preferred over a real info@.
    """
    cases = [
        (["%20info@f.com"], ["info@f.com"], "a URL-encoded space"),
        (["contact@ f.com"], ["contact@f.com"], "a space inside the href"),
        (["@info@f.com"], ["info@f.com"], "a stray @ from a template"),
        (["u003einfo@f.com"], ["info@f.com"], "an escape in front of a known word"),
        (["u003emediarequests@f.com"], ["mediarequests@f.com"],
         "an escape in front of anything else"),
        (["ninfo@f.com"], [], "a swallowed backslash-n, which is nobody's mailbox"),
        (["youremail@gmail.com"], [], "a form's example address"),
        (["here 4 u @ f.com"], [], "an address spaced out against scrapers"),
        (["info@f.com", "info@f.com"], ["info@f.com"], "the same address twice"),
        (["info@f.com"], ["info@f.com"], "an address that was always fine"),
    ]
    bad = 0
    for given, want, why in cases:
        got = repair(given)
        if got != want:
            bad += 1
            print(f"  FAIL {why}: {got}, expected {want}")
        else:
            print(f"  ok   {why}")
    print("\nEvery check passed." if not bad else f"\n{bad} check(s) failed.")
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="rewrite the file")
    ap.add_argument("--selftest", action="store_true",
                    help="check the repair rule, with no files and no network")
    args = ap.parse_args()

    if args.selftest:
        sys.exit(selftest())

    if not EMAILS.exists():
        sys.exit(f"{EMAILS} is not here. Run scripts/crawl_emails.py first.")
    rows = json.loads(EMAILS.read_text(encoding="utf-8"))

    changed, same, no_pool, dropped = 0, 0, 0, 0
    moves = {}
    for row in rows:
        if not row.get("email"):
            continue
        # The pool is what the crawl kept, and it is re-filtered rather than trusted:
        # `others` holds the third-party addresses too, and best() refuses those.
        pool = [(a, "mailto") for a in repair([row["email"], *row.get("others", [])])]
        pick = ce.best(pool, row["domain"])
        if not pick:
            # Everything it had was an artefact. Clearing it is what hands the firm to the
            # next crawl or to the paid lookup, rather than leaving an address that bounces.
            no_pool += 1
            if row["email"]:
                dropped += 1
                row["email"], row["others"] = None, []
                row["where"] = "only malformed addresses"
            continue
        if pick == row["email"]:
            same += 1
            continue
        changed += 1
        key = (row["email"].split("@")[0].lower(), ce.rank(row["email"]), ce.rank(pick))
        moves[key] = moves.get(key, 0) + 1
        row["others"] = [a for a in [row["email"], *row.get("others", [])] if a != pick][:4]
        row["email"] = pick

    print(f"{len(rows)} rows, {same + changed} with an address")
    print(f"  unchanged : {same}")
    print(f"  CHANGED   : {changed}")
    if no_pool:
        print(f"  no address the firm owns: {no_pool}")
    if dropped:
        print(f"  CLEARED, every stored address was an artefact: {dropped}")
    if moves:
        print("\nwhat moved, by the mailbox we were using:")
        for (local, was, now), n in sorted(moves.items(), key=lambda kv: -kv[1]):
            print(f"  {local + '@':20} rank {was} -> {now}   {n}")

    if args.write:
        EMAILS.write_text(json.dumps(rows, indent=1) + "\n", encoding="utf-8", newline="\n")
        print(f"\nwritten to {EMAILS}")
    else:
        print("\nNothing written. Add --write.")


if __name__ == "__main__":
    main()
