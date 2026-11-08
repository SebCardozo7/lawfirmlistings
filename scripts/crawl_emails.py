#!/usr/bin/env python3
"""
The contact address a firm publishes on its own site.

The directory holds a phone number for all 1,412 firms and an email address for none, which is
the whole reason outbound here has only ever been replies. A firm that writes to us can be
answered; a firm we would like to tell about its own profile cannot. This reads the address off
the firm's own contact page, which is the only place it is ours to take it from.

Why a crawl before an email-finding service. Hunter and the rest cost credits per lookup, and
most law firms publish an intake address in plain sight: paying to discover what the site shows
on its contact page is paying for nothing. So this runs first and the paid lookup runs on the
remainder, which is a smaller and more honest bill.

What it will not do:

  It obeys robots.txt. A firm that asks crawlers to stay out of its contact page is a firm we
  do not have an address for, and that is an answer rather than an obstacle.

  It keeps one address per firm, the best one, rather than every address on the page. We are
  looking for who to write to, not building a list of everyone who works there, and a personal
  address scraped off a bio is not an invitation.

  It writes to .crawl/emails.json and never to a profile. The profiles are published and the
  repository is public: an address that a firm put on its own site is one thing, and the same
  address republished in a directory and handed to every scraper is another.

  node is not involved and neither is any API. This costs nothing but time.

    python scripts/crawl_emails.py --limit 30        a sample, to see the hit rate
    python scripts/crawl_emails.py                   all of them
    python scripts/crawl_emails.py --state ny        one state
    python scripts/crawl_emails.py --shard 0/12      one of twelve parallel runs
"""
import argparse
import json
import os
import re
import sys
import time
from html import unescape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from crawl_public import DELAY, fetch, https_origin, robots_for  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIRMS = os.path.join(ROOT, "src", "data", "firms")
OUT = os.path.join(ROOT, ".crawl", "emails.json")

CONTACT_PATHS = ["/contact/", "/contact-us/", "/contact", "/contact-us"]

# Starts with a letter or a digit. Allowing the leading punctuation that a local part may
# technically contain meant any "+" or "." glued to the front of a match came along with it,
# and the sample produced an address with a stray "+" welded to the front of it.
ADDRESS = re.compile(r"[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Mailbox providers a small firm legitimately uses as its own address. Anything else that is
# not the firm's own domain belongs to somebody else: see best().
PROVIDERS = {"gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "aol.com",
             "icloud.com", "me.com", "msn.com", "comcast.net", "att.net", "proton.me"}
MAILTO = re.compile(r'href=["\']mailto:([^"\'?]+)', re.I)

# Addresses that are real and are not a way to reach the firm, plus the ones that are not
# addresses at all. The image extensions matter more than they look: a filename like
# hero@2x.png matches any email pattern ever written, and a list built without this is a third
# junk by volume.
JUNK = re.compile(
    r"(^(no-?reply|do-?not-?reply|postmaster|abuse|webmaster|hostmaster|sentry|wordpress|"
    r"example|your-?name|email|name|user)@)"
    r"|(@(example|test|localhost|domain|yourdomain|sentry|wixpress|squarespace)\.)"
    r"|(\.(png|jpe?g|gif|webp|svg|css|js|woff2?|ico)$)"
    r"|(^[a-f0-9]{16,}@)",
    re.I,
)

# What an intake address tends to be called, best first. A firm that publishes both
# info@ and a partner's personal address wants to be reached at the first one.
PREFERRED = ["info", "contact", "intake", "hello", "inquiries", "enquiries",
             "office", "mail", "newclients", "help", "admin", "reception"]


def firms(state=None):
    out = []
    for st in sorted(os.listdir(FIRMS)):
        if state and st.lower() != state.lower():
            continue
        d = os.path.join(FIRMS, st)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".json"):
                continue
            with open(os.path.join(d, fn), encoding="utf-8") as fh:
                data = json.load(fh)
            if data.get("status") in ("sample", "not_eligible"):
                continue
            if data.get("domain"):
                out.append({"slug": data["slug"], "name": data["name"],
                            "state": st.upper(), "domain": data["domain"]})
    return out


def harvest(html, domain):
    """
    Every plausible address on one page as (address, how it was written).

    How it was written decides whether a Gmail address counts. A mailto: link is the site
    saying "write here"; the same address sitting in the page text may be anything, and on
    the second firm in the sample it was the author of a Google Font, credited inside the
    licence comment of a stylesheet. Nobody at that firm has ever heard of him.
    """
    found = []
    for m in MAILTO.findall(html or ""):
        found.append((unescape(m).strip(), "mailto"))
    # Also the ones written as text, which is most of them, and the ones obfuscated with
    # entities, which unescape() turns back into an address.
    for m in ADDRESS.findall(unescape(html or "")):
        found.append((m.strip(), "text"))
    out, seen = [], set()
    for a, via in found:
        a = a.lower().strip(".,;:")
        if JUNK.search(a) or a in seen:
            continue
        seen.add(a)
        out.append((a, via))
    return out


def best(addresses, domain):
    """
    One address, and only one the firm can be said to own.

    `addresses` is a list of (address, "mailto" | "text").

    An address on a domain that is neither the firm's nor a mailbox provider belongs to
    somebody else: the sample returned the web developer's own address off a footer credit,
    and the one after it an address at a file-sharing service. Writing to either would be
    embarrassing at best, so a firm with no address of its own has no address, which the
    paid lookup can then go and find.

    A mailbox provider counts only behind a mailto: link. A small firm really does use
    Gmail, and a stylesheet really does carry the font designer's Gmail inside its licence
    comment; the link is what tells them apart. The rejects stay in `others`, so the choice
    is reviewable rather than silent.
    """
    if not addresses:
        return None
    bare = domain.lower().replace("www.", "")
    pool = [a for a, via in addresses
            if a.split("@")[-1].replace("www.", "").endswith(bare)
            or (a.split("@")[-1] in PROVIDERS and via == "mailto")]
    if not pool:
        return None
    for want in PREFERRED:
        for a in pool:
            if a.split("@")[0] == want:
                return a
    for want in PREFERRED:
        for a in pool:
            if a.split("@")[0].startswith(want):
                return a
    return pool[0]


def for_firm(firm):
    """Reads at most three pages of one site. Returns a row, always, even when empty."""
    row = {"slug": firm["slug"], "name": firm["name"], "state": firm["state"],
           "domain": firm["domain"], "email": None, "others": [], "where": None,
           "checked_at": time.strftime("%Y-%m-%d")}
    origin = https_origin(firm["domain"])
    if not origin:
        row["where"] = "site did not answer"
        return row

    rp = robots_for(origin)
    seen = []

    def read(url):
        if not rp.can_fetch("*", url):
            return None
        time.sleep(DELAY)
        status, html, _final = fetch(url)
        return html if status == 200 and html else None

    home = read(origin + "/")
    if home is None:
        row["where"] = "home not readable"
    else:
        seen += [(a, via, "home") for a, via in harvest(home, firm["domain"])]
        # The contact link the site itself offers, which beats guessing paths.
        links = re.findall(r'href=["\']([^"\']*(?:contact|locations)[^"\']*)["\']', home, re.I)
        tried = 0
        for href in links:
            if tried >= 2:
                break
            url = href if href.startswith("http") else origin + "/" + href.lstrip("/")
            if not url.startswith(origin):
                continue
            tried += 1
            page = read(url)
            if page:
                seen += [(a, via, "contact") for a, via in harvest(page, firm["domain"])]
        if not seen and not links:
            for path in CONTACT_PATHS[:2]:
                page = read(origin + path)
                if page:
                    seen += [(a, via, "contact") for a, via in harvest(page, firm["domain"])]
                    break

    addresses, known = [], set()
    for a, via, _page in seen:
        if a not in known:
            known.add(a)
            addresses.append((a, via))
    pick = best(addresses, firm["domain"])
    row["others"] = [a for a, _ in addresses if a != pick][:4]
    if pick:
        row["email"] = pick
        row["where"] = next((pg for a, _v, pg in seen if a == pick), "page")
    elif addresses:
        # Addresses were on the page and none of them is the firm's. Worth distinguishing
        # from a page with nothing on it: this one is a candidate for the paid lookup, and
        # the rejects are in `others` if a person wants to overrule the rule.
        row["where"] = "only third-party addresses"
    elif row["where"] is None:
        row["where"] = "no address published"
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="stop after N firms")
    ap.add_argument("--state", help="one state, e.g. ny")
    ap.add_argument("--shard", help="i/n, to run n of these at once")
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    rows = firms(args.state)
    if args.shard:
        i, n = (int(x) for x in args.shard.split("/"))
        rows = [r for k, r in enumerate(rows) if k % n == i]
    if args.limit:
        rows = rows[: args.limit]

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    done, hit = [], 0
    for k, firm in enumerate(rows, 1):
        try:
            row = for_firm(firm)
        except Exception as e:  # one site must never end the run
            row = {"slug": firm["slug"], "name": firm["name"], "state": firm["state"],
                   "domain": firm["domain"], "email": None, "others": [],
                   "where": "error: %s" % type(e).__name__,
                   "checked_at": time.strftime("%Y-%m-%d")}
        done.append(row)
        if row["email"]:
            hit += 1
        print("  %4d/%d  %-34s %s" % (k, len(rows), firm["domain"][:34],
                                      row["email"] or "(" + str(row["where"]) + ")"),
              flush=True)
        # Written as it goes, so a run that is stopped keeps what it found.
        with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(done, fh, indent=2, ensure_ascii=False)
            fh.write("\n")

    pct = round(hit / len(done) * 100) if done else 0
    print("")
    print("  %d of %d firms published an address we could read (%d%%)." % (hit, len(done), pct))
    print("  %s" % args.out)


if __name__ == "__main__":
    main()
