#!/usr/bin/env python3
"""
Takes the things that are not people out of published attorney rosters.

crawl_attorneys reads headings and bio text, and both carry plenty that is not a lawyer. The
directory publishes, today, "San Diego County Bar Association" and "UC San Diego" as attorneys
of a San Diego firm, "Recent Posts" of two others, "Arnold Palmer Children's Hospital Medical"
of a Florida one, and eight Californian cities as the attorneys of an Arizona firm whose
location pages they are. 136 names across 94 firms.

Two reasons to remove them rather than leave them.

  They are published as people. A reader sees them on the profile under the firm's roster.

  A6 scores the share of a roster verified against the state register, and score.py divides by
  every name on it. A firm that named three attorneys and had a bar association and a
  university pinned to it reads "3 of 5 verified" and loses points for our parsing, not its
  own roster. That is the same argument score.py already makes about support staff, and it is
  what stands between California's new register check and A2 and A6 counting for those firms.

This is deliberately not the screen check_ca_register.py uses to decide what to look up. That
one only has to skip a query, so it can be rough. This one deletes, so it is specific: a name
goes only if it matches a named category below. Four of the names that screen flags are real
people and stay, because five words and a "MD PhD" are not evidence of anything:

    Javier M. Figueroa MD PhD      Jose Maria D. Patino Jr.
    Robert G. Thornhill III (Tri)  Biography John H. (Jack) Hickey

The last of those keeps its name and loses the word "Biography", which is the heading the
crawler swallowed along with it.

    python scripts/clean_rosters.py            prints what it would do
    python scripts/clean_rosters.py --write
"""
from __future__ import annotations

import argparse
import collections
import io
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# The criterion lives in crawl_attorneys.py, which is the script that decides what a name is in
# the first place. Keeping a second copy here is how the two drift: this file was written first,
# the crawler learned about location pages afterwards, and for a few hours the cleanup knew
# about 114 names and the crawler about 173.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from crawl_attorneys import is_a_thing_not_a_person  # noqa: E402

# Words the crawler glues to the front of a real name. The name stays; the word goes.
PREFIX = re.compile(r"^(biography|about|meet|attorney|profile)\s+(?=[A-Z])", re.I)


def is_not_a_person(name: str) -> str | None:
    """The category this name falls in, or None when it is left alone."""
    n = " ".join((name or "").split())
    if not n:
        return "empty"
    return is_a_thing_not_a_person(n)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="apply it")
    ap.add_argument("--state", help="only this market state")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    removed = collections.Counter()
    trimmed = 0
    touched = 0
    emptied = []

    for path in sorted((ROOT / "src/data/firms").rglob("*.json")):
        try:
            d = json.load(io.open(path, encoding="utf-8"))
        except (ValueError, OSError):
            continue
        if args.state and (d.get("market") or {}).get("state") != args.state:
            continue
        attorneys = d.get("attorneys") or []
        if not attorneys:
            continue

        keep, changed = [], False
        for a in attorneys:
            name = (a.get("name") or "").strip()
            why = is_not_a_person(name)
            if why:
                removed[why] += 1
                changed = True
                print("  %-30s %-44s %s" % (path.stem[:30], name[:44], why))
                continue
            fixed = PREFIX.sub("", name).strip()
            if fixed and fixed != name:
                print("  %-30s %-44s -> %s" % (path.stem[:30], name[:44], fixed))
                a["name"] = fixed
                changed = True
                trimmed += 1
            keep.append(a)

        if not changed:
            continue
        touched += 1
        if not keep:
            # Every name this firm published was furniture. It now names no attorneys, which is
            # a true statement about what we can read and the one G5 already measures.
            emptied.append(d.get("name") or path.stem)
        if args.write:
            d["attorneys"] = keep
            io.open(path, "w", encoding="utf-8", newline="\n").write(
                json.dumps(d, ensure_ascii=False, indent=2) + "\n")

    print()
    for why, n in removed.most_common():
        print("%4d  %s" % (n, why))
    print("%4d  names kept, with a heading trimmed off the front" % trimmed)
    print("\n%d names removed from %d firms" % (sum(removed.values()), touched))
    if emptied:
        print("%d firm(s) now name no attorney at all: %s"
              % (len(emptied), ", ".join(emptied[:5])))
    if not args.write:
        print("\nNothing was written. Re-run with --write once this list reads correctly.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
