#!/usr/bin/env python3
"""
The domains of every published firm, optionally one shard of them.

The monthly re-measurement crawls every published site, and the crawler waits 1.5 seconds
between requests to a host because we score other firms on conduct and follow the same rules.
That politeness is the whole runtime: fifty-nine firms is upwards of four hours in one process,
which is close enough to a CI job limit to be a bad bet.

Sharding fixes it without touching the delay. Each shard takes a different set of firms, so the
spacing per host is unchanged and only our own wall-clock improves. Alphabetical rather than
random, so a given firm lands in the same shard on every run and a shard that fails can be
re-run on its own.

Usage:
    python scripts/published_domains.py
    python scripts/published_domains.py --shard 2 --of 4
    python scripts/published_domains.py --state NY --joined
"""
from __future__ import annotations

import argparse
import io
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"

# A sample firm is fictional and a firm that failed a gate is not published, so neither is worth
# a request to anybody's server.
SKIP = {"sample", "not_eligible"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shard", type=int, default=0, help="1-based; 0 means every domain")
    ap.add_argument("--of", type=int, default=1)
    ap.add_argument("--state", help="two-letter code, to limit to one market")
    ap.add_argument("--joined", action="store_true", help="comma-separated on one line")
    args = ap.parse_args()

    if args.shard and not 1 <= args.shard <= args.of:
        print("shard %d is outside 1..%d" % (args.shard, args.of), file=sys.stderr)
        return 2

    domains = []
    for path in sorted(FIRMS.rglob("*.json")):
        try:
            firm = json.load(io.open(path, encoding="utf-8"))
        except ValueError:
            print("unreadable: %s" % path, file=sys.stderr)
            continue
        if firm.get("status") in SKIP or not firm.get("domain"):
            continue
        if args.state and (firm.get("market") or {}).get("state") != args.state.upper():
            continue
        domains.append(firm["domain"])

    domains = sorted(set(domains))
    if args.shard:
        domains = domains[args.shard - 1::args.of]

    print(",".join(domains) if args.joined else "\n".join(domains))
    return 0


if __name__ == "__main__":
    sys.exit(main())
