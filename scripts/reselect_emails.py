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
        a = unquote(a).strip().lower()
        if "@" not in a or GLUED.match(a.split("@")[0]):
            continue
        if a not in seen:
            seen.add(a)
            out.append(a)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="rewrite the file")
    args = ap.parse_args()

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
