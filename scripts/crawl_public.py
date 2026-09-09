#!/usr/bin/env python3
"""
Public-source crawler — step 2 of the per-firm pipeline (see Plan de carga de contenido, section 4).

Reads domains from a cohort file, fetches the pages a firm publishes about itself, and writes one
staging JSON per firm under .crawl/. It does NOT write into src/data/firms/: everything here needs
review before it becomes a profile, and this script's job is to gather evidence, not to publish.

What it collects, and why only this:
  - The firm's own JSON-LD. This is the highest-quality source available: the firm's machine-readable
    statement of its name, phone, addresses and languages. Preferred over anything scraped from prose.
  - name candidates from <title> and og:site_name, each with the URL it came from.
  - tel: links, mailto: links.
  - Which trust pages exist (privacy policy, disclaimer, fees, attorney bios, blog) -> pillar D1.
  - Whether JSON-LD is present at all -> D4 schema_detected.
  - Spanish-language signals -> pillar E3.
  - Gate G5 evidence: HTTPS reachable, contact method present, attorney names published.

What it deliberately does NOT do:
  - Guess attorney names out of prose. Names drive gates G1/G2 against the bar registry, and a
    wrong name there is worse than a missing one. Bio-page URLs are recorded for assisted review.
  - Infer anything the firm does not state. Every field carries source_url and fetched_at.
  - Ignore robots.txt. We score other firms on conduct; we follow the same rules.

Usage:
    python scripts/crawl_public.py --cohort ny-personal-injury --limit 15
    python scripts/crawl_public.py --domains perecman.com,gairgair.com --out .crawl
"""
import argparse
import datetime
import gzip
import html as html_entities
import io
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import lib_discover
import urllib.robotparser

ROOT = pathlib.Path(__file__).resolve().parents[1]
UA = "LFL-research/1.0 (+https://lawfirmlistings.com; public-data collection for firm profiles)"
TIMEOUT = 25
DELAY = 1.5  # seconds between requests to one host

# Paths worth trying, and the pillar signal each one feeds.
CANDIDATE_PATHS = [
    ("/", "home"),
    ("/about/", "about"), ("/about-us/", "about"), ("/our-firm/", "about"),
    ("/attorneys/", "attorneys"), ("/our-attorneys/", "attorneys"), ("/team/", "attorneys"),
    ("/lawyers/", "attorneys"), ("/our-team/", "attorneys"),
    ("/contact/", "contact"), ("/contact-us/", "contact"),
    ("/results/", "results"), ("/case-results/", "results"), ("/verdicts-settlements/", "results"),
    ("/privacy-policy/", "privacy"), ("/privacy/", "privacy"),
    ("/disclaimer/", "disclaimer"), ("/legal-disclaimer/", "disclaimer"),
    ("/fees/", "fees"), ("/contingency-fees/", "fees"),
    ("/blog/", "blog"), ("/news/", "blog"),
]

SPANISH_SIGNALS = re.compile(
    r"se habla espa|hablamos espa|español|abogado|/es/|lang=[\"']es", re.I)

# How a link's path is recognised. Reading the site's own nav beats guessing paths: firms that
# use /our-attorneys/ or /verdicts/ were invisible when only the fixed list above was tried.
#
# These match a whole path segment, not a substring. Matching "lawyer" loosely sent four firms'
# attorney pages to a practice area instead: ask4sam.net offered
# /home/new-york-city-car-accident-lawyer/ and yourlawyer.com
# /complex-litigation/whistleblower-lawyers/. A slug that ends in "-lawyer" is a practice page;
# an attorney index is the segment itself.
LINK_KINDS = [
    ("about", r"/(about|about-us|our-firm|who-we-are|firm-overview|the-firm)(/|\.html?|$)"),
    ("attorneys", r"/(attorney|attorneys|our-attorneys|lawyer|lawyers|our-lawyers|team|our-team|"
                  r"meet-the-team|staff|people|profiles)(/|\.html?|$)"),
    ("contact", r"/(contact|contact-us|locations|offices)(/|\.html?|$)"),
    ("results", r"/(results|case-results|verdicts|settlements|verdicts-settlements|recoveries|"
                r"case-studies)(/|\.html?|$)"),
    ("privacy", r"/(privacy|privacy-policy)(/|\.html?|$)"),
    ("disclaimer", r"/(disclaimer|legal-disclaimer|legal-notice|terms|terms-of-use)(/|\.html?|$)"),
    ("fees", r"/(fees|our-fees|contingency-fees|contingency-fee|no-fee|pricing)(/|\.html?|$)"),
    ("blog", r"/(blog|news|articles|insights)(/|\.html?|$)"),
]
TRUST_PAGE_KEYS = {
    "privacy": "privacy_policy", "disclaimer": "disclaimer", "fees": "fee_statement",
    "blog": "blog", "attorneys": "attorney_bios",
}

# Claims that feed required schema fields (fee_model, free_consultation, availability) and
# pillar E. Each hit is stored with the sentence it came from and the page URL, so a reviewer
# can see the firm's own wording rather than a bare boolean somebody has to trust.
PHRASE_SIGNALS = [
    ("contingency", r"contingen\w+|no fee unless|no recovery[, ]+no fee|pay nothing unless"),
    ("free_consultation", r"free consultation|free case (?:review|evaluation)|free legal consultation"),
    ("available_24_7", r"24/7|24 hours a day|around the clock|available anytime"),
    ("hospital_visits", r"hospital visit|home visit|we(?:'ll| will)? come to you"),
    ("se_habla_espanol", r"se habla espa\w+|hablamos espa\w+"),
]


def fetch(url):
    """GET a URL. Returns (status, text, final_url) with text='' when the body is not HTML."""
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Encoding": "gzip",
        "Accept-Language": "en-US,en;q=0.9",
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            raw = r.read()
            if r.headers.get("Content-Encoding") == "gzip":
                raw = gzip.decompress(raw)
            ctype = r.headers.get("Content-Type", "")
            if "html" not in ctype and "xml" not in ctype:
                return r.status, "", r.geturl()
            charset = "utf-8"
            m = re.search(r"charset=([\w-]+)", ctype)
            if m:
                charset = m.group(1)
            return r.status, raw.decode(charset, "replace"), r.geturl()
    except urllib.error.HTTPError as e:
        return e.code, "", url
    except Exception as e:
        return None, "", str(e)


def robots_body(origin):
    """The raw robots.txt, kept because it carries the Sitemap directives."""
    try:
        status, body, _ = fetch(origin + "/robots.txt")
        return body if status == 200 else ""
    except Exception:
        return ""


def robots_for(origin):
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(origin + "/robots.txt")
    try:
        status, body, _ = fetch(origin + "/robots.txt")
        # A site with no robots.txt allows everything; a 4xx is not a disallow.
        rp.parse((body or "").splitlines())
    except Exception:
        rp.parse([])
    return rp


def strip_tags(html):
    html = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    text = html_entities.unescape(re.sub(r"<[^>]+>", " ", html))
    # &nbsp; unescapes to U+00A0, which is not matched by \s in older behaviour; normalise it.
    return re.sub(r"[\s ]+", " ", text).strip()


def json_ld_blocks(html):
    """Every JSON-LD block on the page, parsed. Malformed blocks are skipped, not guessed at."""
    out = []
    for m in re.finditer(
            r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            html, re.S | re.I):
        try:
            data = json.loads(m.group(1).strip())
        except Exception:
            continue
        out.extend(data if isinstance(data, list) else [data])
    return out


def meta(html, prop):
    m = re.search(
        r'<meta[^>]+(?:property|name)=["\']' + re.escape(prop) + r'["\'][^>]+content=["\']([^"\']*)["\']',
        html, re.I)
    if not m:
        m = re.search(
            r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + re.escape(prop) + r'["\']',
            html, re.I)
    return m.group(1).strip() if m else None


def unescape(s):
    if not s:
        return s
    for a, b in [("&amp;", "&"), ("&#8211;", "–"), ("&#038;", "&"), ("&quot;", '"'),
                 ("&#39;", "'"), ("&apos;", "'"), ("&nbsp;", " "), ("&#8217;", "’")]:
        s = s.replace(a, b)
    return s.strip()


def discover_links(html, origin):
    # Kept as the fallback for a site with no usable sitemap.
    """Internal links on a page, one URL per kind, taken from the site's own navigation."""
    found = {}
    for m in re.finditer(r'href=["\']([^"\'#\s]+)["\']', html, re.I):
        url = urllib.parse.urljoin(origin + "/", m.group(1).strip())
        if not url.startswith(origin):
            continue
        path = urllib.parse.urlparse(url).path.lower()
        if path in ("", "/"):
            continue
        if "attorneys" not in found and lib_discover.is_attorney_path(path):
            found["attorneys"] = url
            continue
        for kind, pattern in LINK_KINDS:
            if kind == "attorneys":
                continue
            if kind not in found and re.search(pattern, path):
                found[kind] = url
                break
    return found


def crawl(domain, fetched_at):
    origin = "https://" + domain
    record = {
        "domain": domain,
        "fetched_at": fetched_at,
        "https_ok": False,
        "name_candidates": [],
        "phones": [],
        "emails": [],
        "json_ld": [],
        "pages_found": {},
        "trust_pages": {},
        "attorney_page_urls": [],
        "spanish_signals": False,
        "claims": {},
        "robots_disallowed": [],
        "notes": [],
    }

    def harvest(kind, html, final):
        """Pull every signal we take from one page. Same treatment for home and inner pages."""
        record["pages_found"][kind] = final
        if kind in TRUST_PAGE_KEYS:
            record["trust_pages"][TRUST_PAGE_KEYS[kind]] = True
        if kind == "attorneys" and final not in record["attorney_page_urls"]:
            record["attorney_page_urls"].append(final)

        title = re.search(r"<title[^>]*>([^<]*)</title>", html, re.I)
        for value, where in [(title.group(1) if title else None, "<title>"),
                             (meta(html, "og:site_name"), "og:site_name")]:
            value = unescape(value)
            if value and not any(c["value"] == value for c in record["name_candidates"]):
                record["name_candidates"].append({"value": value, "from": where, "source_url": final})

        for blk in json_ld_blocks(html):
            if blk not in record["json_ld"]:
                record["json_ld"].append(blk)

        for m in re.finditer(r'href=["\']tel:([^"\']+)["\']', html, re.I):
            p = re.sub(r"[^\d+]", "", m.group(1))
            if len(p) >= 10 and p not in [x["value"] for x in record["phones"]]:
                record["phones"].append({"value": p, "source_url": final})
        for m in re.finditer(r'href=["\']mailto:([^"\'?]+)["\']', html, re.I):
            e = m.group(1).strip().lower()
            if e and e not in [x["value"] for x in record["emails"]]:
                record["emails"].append({"value": e, "source_url": final})

        text = strip_tags(html)
        if SPANISH_SIGNALS.search(html) or SPANISH_SIGNALS.search(text):
            record["spanish_signals"] = True

        for label, pattern in PHRASE_SIGNALS:
            if label in record["claims"]:
                continue
            m = re.search(pattern, text, re.I)
            if not m:
                continue
            # Keep the surrounding sentence, trimmed, as the evidence for this claim.
            start, end = max(0, m.start() - 90), min(len(text), m.end() + 90)
            record["claims"][label] = {
                "quote": text[start:end].strip(),
                "source_url": final,
            }

    # The home page comes first: it settles the canonical origin (many firms redirect the bare
    # domain to www) and supplies the navigation we read the rest of the site from.
    status, home_html, final_home = fetch(origin + "/")
    time.sleep(DELAY)
    if status != 200 or not home_html:
        record["notes"].append(
            "Home page returned %s over HTTPS, so nothing else was collected. A 403 here is bot "
            "protection; this firm needs manual entry rather than evasion." % status)
        record["schema_detected"] = False
        record["g5_evidence"] = {"https_reachable": False, "contact_method": False,
                                 "attorney_names_published": "not checked"}
        return record

    record["https_ok"] = True
    parsed = urllib.parse.urlparse(final_home)
    canonical = parsed.scheme + "://" + parsed.netloc
    if canonical != origin:
        record["canonical_origin"] = canonical
        origin = canonical

    rp = robots_for(origin)
    harvest("home", home_html, final_home)

    # Three sources, most authoritative first. The sitemap is the list the site itself
    # publishes for crawlers; the home page navigation is what a visitor sees; the fixed
    # paths are guesses and only fill what neither revealed. Before the sitemap was read,
    # a firm whose /meet-our-attorneys/ page sits in its sitemap but is not linked from the
    # home page in a recognised form was recorded as publishing no attorney bios at all.
    sitemap_pages, roster_pages = lib_discover.crawl_sitemap(
        origin, fetch, lambda u: rp.can_fetch(UA, u), robots_body(origin))
    plan = lib_discover.pick_by_kind(sitemap_pages, LINK_KINDS)
    if sitemap_pages:
        record["notes"].append(
            "sitemap listed %d page(s); %d kind(s) resolved from it%s"
            % (len(sitemap_pages), len(plan),
               ("; %d bio page(s) from a roster sitemap" % len(roster_pages))
               if roster_pages else ""))
    for kind, url in discover_links(home_html, origin).items():
        plan.setdefault(kind, url)
    for path, kind in CANDIDATE_PATHS:
        if kind != "home" and kind not in plan:
            plan[kind] = origin + path

    # Individual bio pages, for crawl_attorneys.py. Several of these firms render their team
    # grid in JavaScript, so the server-side HTML of the index lists nobody and the only
    # place the people are enumerated is the sitemap.
    record["attorney_bio_urls"] = lib_discover.attorney_bio_urls(
        sitemap_pages, plan.get("attorneys"), roster_pages)

    for kind, url in plan.items():
        if not rp.can_fetch(UA, url):
            record["robots_disallowed"].append(url)
            continue
        status, html, final = fetch(url)
        time.sleep(DELAY)
        if status != 200 or not html:
            continue
        harvest(kind, html, final)

    record["schema_detected"] = len(record["json_ld"]) > 0

    # Gate G5 needs a live HTTPS site, a working contact method and published attorney names.
    # The first two are decidable here; the third needs the bio pages read, so it stays pending.
    record["g5_evidence"] = {
        "https_reachable": record["https_ok"],
        "contact_method": bool(record["phones"] or record["emails"] or record["pages_found"].get("contact")),
        "attorney_names_published": "pending. Bio pages recorded, names not auto-extracted",
    }
    if record["robots_disallowed"]:
        record["notes"].append("robots.txt disallowed %d path(s); they were not fetched."
                               % len(record["robots_disallowed"]))
    return record


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", help="cohort id under src/data/cohorts, e.g. ny-personal-injury")
    ap.add_argument("--domains", help="comma-separated domains, instead of a cohort")
    ap.add_argument("--limit", type=int, default=0, help="only the first N domains, by descending DR")
    ap.add_argument("--out", default=".crawl", help="staging directory (git-ignored)")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    if args.domains:
        domains = [d.strip() for d in args.domains.split(",") if d.strip()]
    elif args.cohort:
        path = ROOT / "src/data/cohorts" / (args.cohort + ".json")
        with io.open(path, encoding="utf-8") as fh:
            cohort = json.load(fh)
        firms = sorted(cohort["firms"], key=lambda f: -f["dr"])
        domains = [f["domain"] for f in firms]
    else:
        ap.error("pass --cohort or --domains")

    if args.limit:
        domains = domains[:args.limit]

    outdir = ROOT / args.out
    outdir.mkdir(parents=True, exist_ok=True)
    fetched_at = datetime.date.today().isoformat()

    print("crawling %d domain(s) -> %s/\n" % (len(domains), args.out))
    summary = []
    for i, domain in enumerate(domains, 1):
        print("[%2d/%d] %s" % (i, len(domains), domain), flush=True)
        rec = crawl(domain, fetched_at)
        with io.open(outdir / (domain + ".json"), "w", encoding="utf-8") as fh:
            json.dump(rec, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        name = rec["name_candidates"][0]["value"] if rec["name_candidates"] else "(no name found)"
        print("        %-58s" % name[:58])
        print("        pages: %-42s json-ld: %s  tel: %d"
              % (",".join(sorted(rec["pages_found"])) or "none",
                 len(rec["json_ld"]), len(rec["phones"])))
        for n in rec["notes"]:
            print("        note: %s" % n)
        summary.append(rec)

    ok = sum(1 for r in summary if r["https_ok"])
    print("\n%d/%d reachable over HTTPS · %d with JSON-LD · %d with a phone"
          % (ok, len(summary),
             sum(1 for r in summary if r["schema_detected"]),
             sum(1 for r in summary if r["phones"])))
    print("Staging files are evidence, not profiles. Review before anything reaches src/data/firms/.")


if __name__ == "__main__":
    main()
