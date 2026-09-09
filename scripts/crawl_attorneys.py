#!/usr/bin/env python3
"""
Attorney names from the firm's own bio pages — step 3 of the per-firm pipeline.

These names are the input to gates G1 and G2 against the state bar registry, so a wrong one is
worse than a missing one. That is why nothing here reads prose. The method is structural:

    firm home page  ->  attorney index (a whole path segment: /attorneys/, /our-team/)
                    ->  individual bio pages (one segment deeper)
                    ->  the <h1> of that page

A bio page's <h1> is the firm's own heading for that person. Every name is then checked against
`looks_like_a_person`, which rejects anything carrying practice-area or marketing vocabulary, and
is stored with the bio URL so a reviewer can open it and confirm in one click. A page whose
heading does not survive that check is reported, not guessed at.

Also records any bar registration number found on the bio page, which feeds D1's
"attorney bios with bar admission numbers" point.

Writes `attorneys_found` into the .crawl/ staging record. It does NOT write into
src/data/firms/: the names still want a human glance before they drive a registry lookup.

Usage:
    python scripts/crawl_attorneys.py
    python scripts/crawl_attorneys.py --domains perecman.com --verbose
"""
import argparse
import datetime
import glob
import io
import json
import pathlib
import re
import sys
import time
import urllib.parse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from crawl_public import (LINK_KINDS, UA, fetch, robots_for, strip_tags, meta,  # noqa: E402
                          json_ld_blocks)

ROOT = pathlib.Path(__file__).resolve().parents[1]
DELAY = 1.5
# Four firms hit a cap of 25 with names still on the page, so this is the number of bios a
# large firm plausibly publishes rather than a number that quietly truncates the result.
# Raised from 60 once the sitemap started finding real rosters: one firm publishes 64 bios,
# and a cap below the roster size truncates silently, which is how this went wrong at 25.
# Hitting the cap is now reported rather than absorbed.
MAX_BIOS = 200

ATTORNEY_PATTERN = next(p for k, p in LINK_KINDS if k == "attorneys")

# Vocabulary that means the heading is a page title, not a person. "Personal Injury Lawyer" and
# "Meet Our Attorneys" are headings; "Daniel Perecman" is a name.
NOT_A_PERSON = re.compile(
    r"\b(lawyer|attorney|law|firm|injury|accident|malpractice|compensation|team|staff|our|meet|"
    r"about|profile|practice|areas|contact|free|consultation|home|welcome|results|verdict|"
    r"settlement|case|client|review|blog|news|español|abogado)\b", re.I)

SUFFIXES = re.compile(r"\s*[,|–—-]\s*(esq\.?|esquire|jd|j\.d\.|llp|llc|p\.?c\.?|pllc|"
                      r"attorney at law).*$", re.I)

# Several firms put the person and their title in one heading, and the title can run to several
# words: "Alex Shulman FOUNDING PARTNER AND GENERAL COUNSEL", "Ari R. Lieberman SENIOR ASSOCIATE
# ATTORNEY". The reliable signal is case — these firms set the name in title case and the title
# in capitals — so trailing words are peeled off while they are either all-caps or a known role
# word. Stripping a single token left "Senior Associate" inside one name and threw another
# heading out entirely.
#
# The title is worth keeping: it is the firm's own published statement of the role.
ROLE_WORDS = {
    "founding", "managing", "senior", "seniour", "equity", "name", "supervising", "appellate",
    "general", "and", "of", "the", "associate", "partner", "counsel", "attorney", "attorneys",
    "paralegal", "founder", "co-founder", "shareholder", "trial", "litigation", "esq",
    # Titles that are not "partner" or "associate". A firm published "Steven Dorfman Managing
    # Legal Officer" as its bio heading, and because "officer" was missing the peel stopped on
    # the first word and the whole title stayed in the name.
    "officer", "legal", "chief", "executive", "director", "president", "vice", "chair",
    "chairman", "chairwoman", "principal", "member", "head", "lead", "practice", "department",
    "operations", "intake", "emeritus", "advocate", "clerk",
    # Adjectives that only ever sit inside a job title. None is a plausible surname, which is the
    # test for adding one here: the peel walks right to left and stops at the first word it does
    # not know, so a missing adjective leaves everything to its left stuck in the name.
    "operating", "operational", "financial", "administrative", "marketing", "technology",
    "information", "revenue", "strategy", "strategic", "business", "development", "relations",
    "services", "support", "compliance", "risk", "human", "resources", "client", "clients",
}

# The peel is vocabulary-based, so a title word we do not know leaves everything to its left
# stuck in the name. Five words was already the ceiling for a person, but a four-word "name" that
# is really two names plus two title words looked fine. A residual title word after the second
# word is the tell, and it sends the heading to `rejected` for a human rather than publishing a
# job description as somebody's name.
TITLE_RESIDUE = re.compile(r"\b(" + "|".join(sorted(ROLE_WORDS)) + r")\b", re.I)

# New York registration numbers are seven digits; the label varies by firm.
BAR_NUMBER = re.compile(
    r"(?:bar|attorney|registration)\s*(?:no\.?|number|#|id)\s*:?\s*(\d{6,8})", re.I)


def looks_like_a_person(name):
    if not name or len(name) > 60:
        return False
    name = name.strip()
    if any(ch.isdigit() for ch in name):
        return False
    if NOT_A_PERSON.search(name):
        return False
    words = [w for w in re.split(r"\s+", name) if w]
    if not 2 <= len(words) <= 5:
        return False
    # A title word past the given name and surname means the peel stopped early.
    if len(words) > 2 and TITLE_RESIDUE.search(" ".join(words[2:])):
        return False

    def cased_like_a_name(w):
        if w[0].isupper():
            return True
        # A lowercase particle: de la Cruz, van der Berg.
        if w.lower() in ("de", "la", "del", "van", "von", "der", "di", "da", "dos", "el"):
            return True
        # A surname that carries its capital inside it. Requiring a leading capital cost
        # Cellino Law its attorney Joseph deGeneres.
        return any(ch.isupper() for ch in w[1:])

    return all(cased_like_a_name(w) for w in words)


def split_name_and_role(raw):
    """Returns (name, role_as_published). The role is the firm's wording, or None."""
    text = re.sub(r"\s+", " ", (raw or "").replace("&amp;", "&")).strip()
    text = SUFFIXES.sub("", text).strip(" ,-|")

    words = [w for w in re.split(r"[\s,|]+", text) if w]
    role = []
    # Peel from the right while the word reads as part of a title, never below two words so a
    # short name cannot be eaten. A word counts as title if it is a known role word, or is
    # all-caps while the name beside it is not.
    while len(words) - len(role) > 2:
        w = words[len(words) - len(role) - 1]
        letters = re.sub(r"[^A-Za-z]", "", w)
        is_caps = len(letters) >= 2 and letters.isupper()
        if w.lower().strip(".") in ROLE_WORDS or is_caps:
            role.insert(0, w)
        else:
            break

    name = " ".join(words[:len(words) - len(role)]).strip(" ,-|")
    role_text = " ".join(role).strip(" ,-|")
    return name, (role_text.title() if role_text else None)


def h1_of(html):
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S | re.I)
    return strip_tags(m.group(1)) if m else None


def bio_candidates(html, origin, index_url):
    """Links one segment deeper than the attorney index, on the same site."""
    index_path = urllib.parse.urlparse(index_url).path.rstrip("/")
    base_depth = len([s for s in index_path.split("/") if s])
    out, seen = [], set()
    for m in re.finditer(r'href=["\']([^"\'#\s]+)["\']', html, re.I):
        url = urllib.parse.urljoin(origin + "/", m.group(1).strip())
        if not url.startswith(origin):
            continue
        path = urllib.parse.urlparse(url).path
        if not re.search(ATTORNEY_PATTERN, path):
            continue
        segs = [s for s in path.split("/") if s]
        # One segment deeper than the index, and not the index itself.
        if len(segs) != base_depth + 1:
            continue
        clean = url.split("?")[0].rstrip("/")
        if clean in seen or clean.rstrip("/") == index_url.rstrip("/"):
            continue
        seen.add(clean)
        out.append(clean)
    return out


def collect(domain, verbose=False, record=None):
    origin = "https://" + domain
    status, home, final_home = fetch(origin + "/")
    time.sleep(DELAY)
    if status != 200 or not home:
        return {"error": "home returned %s" % status}
    parsed = urllib.parse.urlparse(final_home)
    origin = parsed.scheme + "://" + parsed.netloc
    rp = robots_for(origin)

    # The sitemap first: it is the list the site publishes for crawlers, and it reaches pages
    # the home page does not link in a form we recognise. Falling back to the navigation.
    index_url = (record or {}).get("pages_found", {}).get("attorneys")
    seeded_bios = [u for u in ((record or {}).get("attorney_bio_urls") or [])]
    if index_url or seeded_bios:
        if verbose:
            print("      from sitemap: index %s, %d bio url(s)"
                  % (index_url or "none", len(seeded_bios)))
    for m in re.finditer(r'href=["\']([^"\'#\s]+)["\']', home, re.I):
        url = urllib.parse.urljoin(origin + "/", m.group(1).strip())
        if not url.startswith(origin):
            continue
        path = urllib.parse.urlparse(url).path
        if re.search(ATTORNEY_PATTERN, path):
            segs = [s for s in path.split("/") if s]
            # Prefer the shallowest match: the index, not one of its bios.
            if index_url is None or len(segs) < len([s for s in urllib.parse.urlparse(index_url).path.split("/") if s]):
                index_url = url.split("?")[0]
    if not index_url and not seeded_bios:
        return {"error": "no attorney index found in the sitemap or the navigation"}

    index_html, index_final = "", index_url or ""
    if index_url:
        if not rp.can_fetch(UA, index_url):
            if not seeded_bios:
                return {"error": "robots.txt disallows %s" % index_url}
        else:
            status, index_html, index_final = fetch(index_url)
            time.sleep(DELAY)
            if (status != 200 or not index_html) and not seeded_bios:
                return {"error": "attorney index returned %s" % status,
                        "index_url": index_url}
            index_final = index_final or index_url

    result = {"index_url": index_final, "attorneys": [], "rejected": [],
              "checked_at": datetime.date.today().isoformat()}

    bios = seeded_bios or (bio_candidates(index_html, origin, index_final)
                           if index_html else [])
    if verbose:
        print("      %d bio page(s) to read (%s)"
              % (len(bios), "from sitemap" if seeded_bios else "from index links"))

    # A single bio page reached directly (no index of its own) still counts.
    if not bios and not index_html:
        return {"error": "no bio pages found", "index_url": index_final}
    if not bios:
        name, role = split_name_and_role(h1_of(index_html))
        if looks_like_a_person(name):
            result["attorneys"].append({"name": name, "source_url": index_final,
                                        "bar_number": None, "role": role or "Attorney"})
        else:
            result["rejected"].append({"heading": h1_of(index_html), "url": index_final})
        return result

    if len(bios) > MAX_BIOS:
        result["truncated"] = {"found": len(bios), "read": MAX_BIOS}
    for url in bios[:MAX_BIOS]:
        if not rp.can_fetch(UA, url):
            continue
        status, html, final = fetch(url)
        time.sleep(DELAY)
        if status != 200 or not html:
            continue
        heading = h1_of(html) or meta(html, "og:title")
        name, role = split_name_and_role(heading)
        if not looks_like_a_person(name):
            result["rejected"].append({"heading": heading, "url": final})
            continue
        bar = BAR_NUMBER.search(strip_tags(html))
        # The role is whatever the firm printed next to the name, not our inference. Where it
        # printed none, "Attorney" stands — the handoff's rule that seniority is not assumed.
        result["attorneys"].append({
            "name": name, "source_url": final,
            "bar_number": bar.group(1) if bar else None,
            "role": role or "Attorney",
            "role_source": "firm bio heading" if role else "not stated by the firm",
        })
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains", help="comma-separated; default is every reachable staging record")
    ap.add_argument("--staging", default=".crawl")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    staging = ROOT / args.staging
    if args.domains:
        files = [staging / (d.strip() + ".json") for d in args.domains.split(",") if d.strip()]
    else:
        files = sorted(pathlib.Path(p) for p in glob.glob(str(staging / "*.json")))

    total_names = with_bar = 0
    for path in files:
        if not path.exists():
            continue
        rec = json.loads(io.open(path, encoding="utf-8").read())
        if not rec.get("https_ok"):
            continue

        found = collect(rec["domain"], args.verbose, rec)
        # Re-read before writing: another enricher may have written in the meantime.
        fresh = json.loads(io.open(path, encoding="utf-8").read())
        fresh["attorneys_found"] = found
        io.open(path, "w", encoding="utf-8", newline="\n").write(
            json.dumps(fresh, ensure_ascii=False, indent=2) + "\n")

        if found.get("error"):
            print("%-24s %s" % (rec["domain"], found["error"]))
            continue
        names = found["attorneys"]
        bars = [a for a in names if a["bar_number"]]
        total_names += len(names)
        with_bar += len(bars)
        print("%-24s %2d attorney(s), %d with a bar number%s"
              % (rec["domain"], len(names), len(bars),
                 ", %d heading(s) rejected" % len(found["rejected"]) if found["rejected"] else ""))
        if args.verbose:
            for a in names[:6]:
                print("      %-32s %s" % (a["name"], a["bar_number"] or ""))

    print("\n%d name(s) collected, %d carrying a bar number" % (total_names, with_bar))
    print("Names are evidence, not yet profile data: they drive G1/G2 against the registry, so\n"
          "each one keeps the bio URL it came from for a human to confirm.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
