#!/usr/bin/env python3
"""
The addresses on the attorney bio pages we already publish.

scripts/crawl_emails.py reads a firm's home page and up to two contact pages. That is where
a firm puts info@, and it is not where a firm puts a person. So of the 340 firms we had
addressed at a role mailbox on 13 November 2026, 320 had no alternative stored at all: not
because they publish none, but because we never looked at the page that carries one.

Nothing here guesses a URL. Every attorney on every published profile already records the
bio page they were read from, in `source_url`, so this reads pages the directory has
already proved exist and has already cited. A firm with no published roster is skipped
rather than probed.

    python scripts/crawl_bios.py --targets role          firms we address at a role mailbox
    python scripts/crawl_bios.py --targets none          firms with no address at all
    python scripts/crawl_bios.py --targets role --shard 0/12
    python scripts/crawl_bios.py --merge                 fold findings into emails.json

Findings go to .crawl/bios.json and nothing touches .crawl/emails.json until --merge, which
never makes a firm's address worse: it swaps one in only when rank() prefers it. Both files
hold real firms' contact addresses and stay out of this repository.
"""
import argparse
import glob
import importlib.util
import json
import os
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from crawl_public import DELAY, fetch, robots_for  # noqa: E402

spec = importlib.util.spec_from_file_location("crawl_emails", ROOT / "scripts" / "crawl_emails.py")
ce = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ce)

EMAILS = ROOT / ".crawl" / "emails.json"
OUT = ROOT / ".crawl" / "bios.json"

# Eight bios per firm. A firm that publishes eight and names nobody on any of them is a firm
# that publishes addresses nowhere, and the ninth will not change that; the largest roster
# here is 76, which on its own would be two minutes of one run. Partners come first on
# almost every roster, which is also who we would rather reach.
CAP = 8


def profiles():
    out = {}
    for p in glob.glob(str(ROOT / "src/data/firms/**/*.json"), recursive=True):
        f = json.loads(pathlib.Path(p).read_text(encoding="utf-8"))
        if f.get("status") in ("sample", "not_eligible"):
            continue
        out[f["slug"]] = f
    return out


def bio_urls(firm):
    """The bio pages this directory already cites for a firm, in roster order."""
    seen, out = set(), []
    for a in firm.get("attorneys") or []:
        u = (a.get("source_url") or "").strip()
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    return out[:CAP]


def targets(which, rows, profs):
    for r in rows:
        if not r.get("domain"):
            continue
        current = r.get("email")
        if which == "role" and not (current and ce.rank(current) > 0):
            continue
        if which == "none" and current:
            continue
        firm = profs.get(r["slug"])
        if not firm or not bio_urls(firm):
            continue
        yield r, firm


def for_firm(row, firm):
    """Reads at most CAP bio pages of one site. Returns the addresses the firm owns."""
    urls = bio_urls(firm)
    origin = "/".join(urls[0].split("/")[:3])
    rp = robots_for(origin)
    found, read, blocked = [], 0, 0
    for url in urls:
        if not rp.can_fetch("*", url):
            blocked += 1
            continue
        time.sleep(DELAY)
        status, html, _final = fetch(url)
        read += 1
        if status != 200 or not html:
            continue
        found += ce.harvest(html, row["domain"])
    # best() is what decides whether an address is the firm's at all, and it is the same
    # rule the contact-page crawl uses. A bio page carries the web developer's address in
    # its footer just as often as a home page does.
    own = [a for a, via in found if ce.best([(a, via)], row["domain"])]
    ranked = sorted(dict.fromkeys(own), key=ce.rank)
    return {"slug": row["slug"], "domain": row["domain"], "pages": read,
            "blocked_by_robots": blocked, "found": ranked,
            "checked_at": time.strftime("%Y-%m-%d")}


def choose(current, others, discovered, domain):
    """
    The one decision --merge makes, so it can be tested without a network or a file.

    Returns the address to use, or None to leave the firm exactly as it was. A bio page is
    extra evidence, never a reset: it can only replace what we had with something rank()
    prefers. A firm already addressed at a named partner is not downgraded because a junior
    associate's page also carries info@, and a firm we had no address for takes whatever
    the bios offer, because the alternative is not writing to it at all.
    """
    pool = [(a, "mailto") for a in [current, *others, *discovered] if a]
    pick = ce.best(pool, domain)
    if not pick or pick == current:
        return None
    if current and ce.rank(pick) >= ce.rank(current):
        return None
    return pick


def selftest():
    cases = [
        # current, others, discovered, expected
        ("info@f.com", [], ["marc@f.com"], "marc@f.com", "a bio names a person"),
        ("info@f.com", [], ["contact@f.com"], None, "another role mailbox changes nothing"),
        ("marc@f.com", [], ["info@f.com"], None, "a person is never downgraded"),
        (None, [], ["marc@f.com"], "marc@f.com", "a firm we could not reach at all"),
        (None, [], ["info@f.com"], "info@f.com", "even a role mailbox beats nothing"),
        ("info@f.com", [], ["dev@agency.example"], None, "somebody else's address is refused"),
        ("info@f.com", [], [], None, "no findings, no change"),
        ("intake@f.com", [], ["info@f.com"], "info@f.com", "the office beats admissions"),
    ]
    bad = 0
    for current, others, discovered, want, why in cases:
        got = choose(current, others, discovered, "f.com")
        if got != want:
            bad += 1
            print(f"  FAIL {why}: got {got}, expected {want}")
        else:
            print(f"  ok   {why}")
    print("\nEvery check passed." if not bad else f"\n{bad} check(s) failed.")
    return 1 if bad else 0


def merge():
    if not OUT.exists():
        sys.exit(f"{OUT} is not here. Run a crawl first.")
    rows = json.loads(EMAILS.read_text(encoding="utf-8"))
    found = {r["slug"]: r["found"] for r in json.loads(OUT.read_text(encoding="utf-8"))}
    by_slug = {r["slug"]: r for r in rows}

    improved, filled, kept = 0, 0, 0
    for slug, addresses in found.items():
        row = by_slug.get(slug)
        if not row or not addresses:
            continue
        pick = choose(row.get("email"), row.get("others", []), addresses, row["domain"])
        if not pick:
            kept += 1
            continue
        if row.get("email"):
            improved += 1
        else:
            filled += 1
        row["others"] = [a for a in dict.fromkeys(
            [row.get("email"), *row.get("others", []), *addresses]) if a and a != pick][:4]
        row["email"] = pick
        row["where"] = "attorney bio"
    EMAILS.write_text(json.dumps(rows, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"upgraded from a role mailbox to a person: {improved}")
    print(f"firms that had no address and now have one: {filled}")
    print(f"left alone, nothing better on the bios: {kept}")
    print(f"written to {EMAILS}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets", choices=["role", "none"],
                    help="which firms to read: role mailboxes, or no address at all")
    ap.add_argument("--shard", help="i/n, to run n of these at once")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--merge", action="store_true", help="fold findings into emails.json")
    ap.add_argument("--selftest", action="store_true",
                    help="check the merge rule, with no network and no files")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    if args.selftest:
        sys.exit(selftest())
    if args.merge:
        return merge()
    if not args.targets:
        sys.exit("--targets role|none, or --merge")

    rows = json.loads(EMAILS.read_text(encoding="utf-8"))
    work = list(targets(args.targets, rows, profiles()))
    if args.shard:
        i, n = (int(x) for x in args.shard.split("/"))
        work = [w for k, w in enumerate(work) if k % n == i]
    if args.limit:
        work = work[: args.limit]

    out_path = pathlib.Path(args.out)
    os.makedirs(out_path.parent, exist_ok=True)
    done, hit = [], 0
    for k, (row, firm) in enumerate(work, 1):
        try:
            got = for_firm(row, firm)
        except Exception as e:  # one site must never end the run
            got = {"slug": row["slug"], "domain": row["domain"], "pages": 0,
                   "blocked_by_robots": 0, "found": [],
                   "where": "error: %s" % type(e).__name__,
                   "checked_at": time.strftime("%Y-%m-%d")}
        done.append(got)
        best_found = got["found"][0] if got["found"] else None
        if best_found and ce.rank(best_found) == 0:
            hit += 1
        print("  %4d/%d  %-34s %s" % (k, len(work), row["domain"][:34],
                                      (best_found or "(nothing)")), flush=True)
        # Written as it goes, so a run that is stopped keeps what it found.
        out_path.write_text(json.dumps(done, indent=1, ensure_ascii=False) + "\n",
                            encoding="utf-8", newline="\n")

    print("")
    print("  %d of %d firms named a person on a bio page." % (hit, len(done)))
    print("  %s" % out_path)
    print("  Nothing merged. Run --merge to fold these into emails.json.")


if __name__ == "__main__":
    main()
