#!/usr/bin/env python3
"""
Does this firm actually practise this area, by its own account?

Discovery returns whoever the map returns, and a text search for "workers compensation lawyer New
York" hands back sixty personal injury firms along with the ten that do the work. Ranking a firm
in a practice it does not hold itself out for would be a fabrication, and the first six results
for that query on Places contain several.

The evidence a directory is entitled to use is the firm's own page about the practice. Not a
mention in a footer link list, where every firm in the state lists every area of law that exists,
and not a phrase in a blog post. A page, with the practice in its title or its first heading.

So this reads the site the way a person would. It asks for the sitemap first, because that is the
list the site itself publishes for crawlers, falls back to the links on the home page, and
follows the best candidate to confirm what the page is actually about. Robots.txt is honoured, a
403 is recorded as a 403 rather than worked around, and nothing here retries a refusal.

The result is written back into the firm's staging record as `practice_evidence`, so the cohort
is assembled from something checkable rather than from a domain name that happened to contain the
words. It is also why a firm already published in another practice can be added to this one
later: the evidence is per practice, not per firm.

Usage:
    python scripts/check_practice.py --practice workers-compensation \\
        --candidates .crawl/candidates-ny-workers-compensation.json --top 40
    python scripts/check_practice.py --practice workers-compensation --domains workerslaw.com
"""
from __future__ import annotations

import argparse
import datetime
import io
import json
import pathlib
import re
import sys
import time
import urllib.parse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from crawl_public import (DELAY, fetch, https_origin, robots_body, robots_for,  # noqa: E402
                          strip_tags, unescape)

ROOT = pathlib.Path(__file__).resolve().parents[1]
TODAY = datetime.date.today().isoformat()

# Per practice: what the URL of such a page looks like, and what its title has to say. The two
# are deliberately different. A slug is abbreviated ("workers-comp", "work-injury") where a
# heading is written out, and requiring both to match the same pattern rejected real pages.
# Why several of these patterns carry Spanish and Chinese.
#
# This check reads a firm's own pages and asks whether it holds itself out for a practice. For a
# year it asked that question only in English, and in New York City that is not a neutral choice.
# Four firms in the first injury cohort were recorded as publishing no practice page while their
# home pages said so plainly: Abogados de accidentes Cantaso links seventeen Spanish practice
# pages, GW Law Group and Caesar, Napoli & Spivak publish in Chinese, and Kasen & Liu trades as
# 凯森律师楼. A fifth, Krause & Glassmith, went unpublished for four days because the cohort held
# its Chinese subdomain and we asked the wrong host for an English page.
#
# So this was not a gap at the edges. A large part of this market's injury practice is conducted
# in Chinese, Spanish and Russian, and a directory that can only read English is not measuring the
# market it claims to rank; it is ranking the English-speaking part of it and calling that the
# whole. The alternatives below are the words these firms actually use, taken from their own
# pages rather than from a dictionary.
#
# Chinese needs one thing noted: it is written without spaces, so none of those alternatives can
# use a word boundary and each is matched as a plain substring.
#
# Two gaps, named rather than left to be discovered. Russian is not here, and Brooklyn and Queens
# have a large Russian-speaking injury bar. And only personal-injury carries the alternatives so
# far, because that is the only practice where we have firms in hand whose pages prove the
# vocabulary; adding words to family-law or real-estate from a dictionary rather than from a
# firm's own page is how a corroborating test starts accepting things it should not.
PRACTICES = {
    # Family law, where the corroborating vocabulary has to work harder than anywhere else.
    #
    # A divorce search on a map returns general practices: the two largest results by review
    # count for "divorce lawyer New York City" are traffic-ticket firms whose listings mention
    # divorce among fourteen other things. So naming the practice is not enough here, and the
    # corroborating pattern asks for the words that only appear on a page written about this
    # work: what the court divides, what it orders paid, and what it decides about children.
    #
    # "Family law" and "matrimonial" are both in the title pattern because the profession uses
    # the second and clients search the first. Prenuptial agreements and domestic violence
    # orders are inside this practice rather than beside it, the way title work sits inside real
    # estate: somebody who needs an order of protection is looking for a family lawyer.
    "family-law": {
        "slug": re.compile(r"family[-_]?law|matrimonial|divorce|child[-_](?:custody|support)|"
                           r"custody|visitation|parenting[-_]time|spousal[-_](?:support|"
                           r"maintenance)|alimony|prenup(?:tial)?|postnup(?:tial)?|"
                           r"separation[-_]agreement|equitable[-_]distribution|"
                           r"order[s]?[-_]of[-_]protection|domestic[-_]violence|"
                           r"paternity|adoption|guardianship[-_]of[-_]a[-_]child", re.I),
        "title": re.compile(
            r"family\s+law|matrimonial|divorce|child\s+(?:custody|support)|custody|visitation|"
            r"parenting\s+time|spousal\s+(?:support|maintenance)|alimony|"
            r"pre(?:nuptial|marital)|postnuptial|separation\s+agreement|"
            r"equitable\s+distribution|order\s+of\s+protection|paternity", re.I),
        # What a page about this work says, and a page that merely lists it does not. Every one
        # of these is a thing a New York court does: equitable distribution under the Domestic
        # Relations Law, maintenance on a statutory formula, child support under the CSSA, and
        # the no-fault ground that has been the only one most people use since 2010.
        "corroborating": re.compile(
            r"equitable\s+distribution|marital\s+(?:property|asset|residence|estate)|"
            r"child\s+support|custody|parenting\s+(?:time|plan)|visitation|"
            r"maintenance|spousal\s+support|alimony|no[-\s]fault|irretrievab|"
            r"separation\s+agreement|prenuptial|family\s+court|matrimonial|"
            r"uncontested\s+divorce|retainer", re.I),
    },
    # The first practice here that is not an injury. It changes what the corroborating term has
    # to look for: an injury page argues about negligence and limitation periods, and a real
    # estate page walks through a closing. So the corroborating pattern is the vocabulary of a
    # transaction, and "statute of limitations" would find nothing on a perfectly good one.
    #
    # Title and escrow are deliberately inside this practice rather than beside it. Somebody
    # looking for help with a purchase searches for a real estate attorney; the title work is
    # how the job gets done, the same way a car accident page lives inside personal injury.
    "real-estate": {
        "slug": re.compile(r"real[-_]?estate|(?:residential|commercial)[-_](?:closing|purchase|"
                           r"real[-_]?estate)|title[-_](?:insurance|agency|and[-_]escrow|escrow|"
                           r"search|work)|closing[s]?[-_](?:service|attorney|lawyer)|escrow|"
                           r"land[-_]use|zoning|landlord[-_]tenant|hoa|condo(?:minium)?[-_]law",
                           re.I),
        "title": re.compile(
            r"real\s+estate|title\s+(?:insurance|and\s+escrow|agency|company|services)|"
            r"escrow|closing(?:s)?\b|land\s+use|zoning|landlord[\s/]+tenant|"
            r"(?:condominium|condo|homeowners?\s+association|hoa)\s+law", re.I),
        # What a page about a property transaction says, and an injury page never does.
        "corroborating": re.compile(
            r"closing|title\s+(?:search|insurance|commitment|defect)|deed|survey|lien|"
            r"escrow|purchase\s+(?:and\s+sale\s+)?(?:agreement|contract)|seller|buyer|"
            r"settlement\s+statement|encumbrance", re.I),
    },
    "workers-compensation": {
        "slug": re.compile(r"work(?:ers?|place)?[-_]?(?:comp\b|compensation|injur)|"
                           r"injured[-_]?(?:at[-_])?work|on[-_]the[-_]job", re.I),
        "title": re.compile(r"workers?'?s?\s+comp(?:ensation)?\b|work(?:place)?\s+injur|"
                            r"injured\s+(?:at|on\s+the)\s+(?:work|job)", re.I),
        # Present on a page about the practice and absent from one that only mentions it.
        "corroborating": re.compile(
            r"workers'?\s*compensation\s*board|\bWCB\b|form\s*C-3|schedule\s*loss|"
            r"lost\s*wages|third[-\s]party\s*(?:claim|case|action)|light\s*duty|"
            r"independent\s*medical\s*exam", re.I),
    },
    # Personal injury is the one practice most firms do not name. Buffalo showed it: William
    # Mattar, Richmond Vona and Cantor Wolff are the three best known injury firms in the city
    # and all three failed a check that demanded the phrase "personal injury", because upstate
    # sites are organised by injury type instead. "Buffalo Car Accident Lawyer" is a personal
    # injury practice page. So the pattern accepts the sub-topics this directory already lists
    # under the practice in src/data/practices.ts, and the check was excluding real firms in
    # every market rather than only in this one.
    # The practice this directory has most of, and the one where reading only English cost us the
    # most. See the note under PRACTICES about why the Spanish and Chinese alternatives are here.
    "personal-injury": {
        "slug": re.compile(r"personal[-_]?injur|injury[-_]lawyer|accident[-_]lawyer|"
                           r"(?:car|auto|truck|motorcycle|pedestrian|bicycle|bike|construction|"
                           r"premises|slip[-_]and[-_]fall|dog[-_]bite|wrongful[-_]death|"
                           r"catastrophic)[-_](?:accident|injur|death|liability)|"
                           # Spanish slugs, which is how these firms actually address their
                           # pages: abogadosde1800cantaso.com links seventeen of them, from
                           # /accidente-de-auto-new-york/ to /abogado-accidentes-andamio-ny/.
                           r"abogad[oa]s?[-_]?(?:de[-_])?(?:accidente|lesion)|"
                           r"accidente[-_]de[-_](?:auto|carro|coche|trabajo|construcci|camion|"
                           r"bicicleta|moto|peaton|uber)|accidentes?[-_]de[-_]|"
                           r"lesiones[-_]personales|resbalon|caida[s]?[-_]|negligencia[-_]medica",
                           re.I),
        "title": re.compile(
            r"personal\s+injury|catastrophic\s+injur|wrongful\s+death|medical\s+malpractice|"
            r"nursing\s+home\s+(?:abuse|neglect)|slip\s+and\s+fall|premises\s+liability|"
            r"\b(?:car|auto|truck|motorcycle|pedestrian|bicycle|bike|construction|dog\s+bite)"
            r"[\s\w]{0,14}(?:accident|injur|crash)|"
            # Spanish. "Abogado de accidentes" is the phrase these firms title with, and it is
            # what a Spanish-speaking client types.
            r"abogad[oa]s?\s+de\s+(?:accidentes?|lesiones)|accidente\s+de\s+(?:auto|carro|coche|"
            r"trabajo|construcci|cami|bicicleta|moto)|lesiones\s+personales|"
            r"muerte\s+por\s+negligencia|negligencia\s+médica|resbal|caída[s]?\s+y\s+resbal|"
            # Chinese, which carries no spaces and no word boundaries, so these are plain
            # substrings: car accident, traffic accident, personal injury, accidental injury,
            # work injury, medical malpractice, misdiagnosis, slip and fall, wrongful death.
            r"车祸|交通事故|人身伤害|意外伤害|工伤|医疗事故|误诊|滑倒|摔伤|意外死亡",
            re.I),
        # Every word here has to be one a page written about this work uses and a page that
        # merely lists the practice does not. That rules out the fee promise and the free
        # consultation in any language: "consulta gratis" and 免费咨询 sit in the header of every
        # page on these sites, exactly like "no fee unless we win" does in English, so accepting
        # them would let the banner corroborate the page it sits on. What is left is the
        # vocabulary of the claim itself.
        "corroborating": re.compile(r"negligen|statute\s+of\s+limitations|pain\s+and\s+suffering|"
                                    r"contingen|"
                                    # Spanish: negligence, compensation, damages, claim, suit,
                                    # liability, the limitation period.
                                    r"negligencia|indemnizaci|compensaci|daños\s+y\s+perjuicios|"
                                    r"reclamaci|responsabilidad\s+civil|prescripci|"
                                    # Chinese: compensation, to claim compensation, damages,
                                    # liability, negligence, statute of limitations.
                                    r"赔偿|索赔|损害赔偿|责任|过失|诉讼时效", re.I),
    },
}

# A link in a page-wide list of every area of law the firm might take. Those lists are the reason
# a footer cannot be evidence: they are marketing surface, not a statement of practice.
MENU_DENSITY = 12

# Words that may appear in the address of the practice page itself without making it a different
# page. Anything else in the final segment is a variant: a borough, a glossary, a blog post. The
# ranking below prefers the page with the fewest of those, which is the practice page.
CORE_WORDS = {
    "law", "lawyer", "lawyers", "attorney", "attorneys", "firm", "practice", "areas",
    "new", "york", "nyc", "ny", "manhattan", "our", "the", "a", "and", "of", "in",
}

# Writing about the practice is not holding yourself out for it. The first run accepted a
# glossary of compensation terms, a "workers' comp vs personal injury" comparison piece and a
# blog post on how to report an injury, all of which a firm with no comp practice could publish
# and two of which sat under /blog/. A page a firm links from its practice-area menu is a
# statement about what it does; an article is content marketing, and the difference is the whole
# point of asking.
NOT_A_PRACTICE_PAGE = re.compile(
    r"(^|/)(blog|news|articles?|posts?|resources?|library|glossary|dictionary|terms|"
    r"faqs?|questions?|category|categories|tag|tags|20\d\d)(/|$)|"
    r"[-_](?:vs|versus|glossary|faq|guide|checklist)(?:[-_]|$)|"
    # A slug that opens with a question word is the firm answering one, which is the same
    # content-marketing page with a friendlier address: /if-i-was-injured-on-the-job-do-i.
    r"(?:^|/)(?:if|what|how|can|do|does|should|when|why|who|is|are|will)[-_]", re.I)

# The same judgement applied to what the page calls itself, for the cases the address hides.
ARTICLE_TITLE = re.compile(
    r"\b(?:vs\.?|versus)\b|"
    # An explainer announces itself in its first word. "Understanding Liability in
    # Multi-Vehicle Collisions" is a real page on a real firm's site and is not that firm
    # telling anybody what it does.
    r"^\s*(?:what|how|why|when|can|do|does|should|is|are|will|understanding|"
    r"everything|tips|mistakes|signs|reasons|steps)\b|"
    r"\b(?:glossary|faq|frequently asked|blog|guide to|checklist|explained|"
    # A WordPress category archive and a resources hub both title themselves for the practice
    # and are not a statement that the firm does the work. Three Baltimore and Lakeland
    # candidates were accepted on "Personal Injury Archives", "Personal Injury Resources" and
    # "Personal Injury Statistics", which are a listing, a reading list and a page of numbers.
    r"archives?|resources?|statistics|library|"
    r"everything you need)\b", re.I)


def sitemap_urls(origin, robots, rp):
    """URLs from the sitemaps robots.txt declares, plus the conventional location."""
    seen, out = set(), []
    todo = re.findall(r"(?im)^\s*sitemap:\s*(\S+)", robots or "") or [origin + "/sitemap.xml"]
    while todo and len(out) < 4000:
        url = todo.pop(0)
        if url in seen or len(seen) > 12:
            continue
        seen.add(url)
        if not rp.can_fetch("*", url):
            continue
        status, body, _ = fetch(url)
        time.sleep(DELAY)
        if status != 200 or not body:
            continue
        # A sitemap index points at more sitemaps; both are <loc> lists.
        locs = [unescape(m) for m in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body, re.I)]
        for loc in locs:
            (todo if loc.lower().endswith(".xml") or "sitemap" in loc.lower() else out).append(loc)
    return out


def home_links(origin, rp):
    if not rp.can_fetch("*", origin + "/"):
        return []
    status, html, _ = fetch(origin + "/")
    time.sleep(DELAY)
    if status != 200 or not html:
        return []
    return [urllib.parse.urljoin(origin + "/", unescape(h))
            for h in re.findall(r'<a[^>]+href=["\']([^"\'#]+)', html, re.I)]


# A page that lists what the firm does, rather than a page about one thing it does.
# The trailing -1 is Squarespace: it appends a number when a page slug collides with one that
# already exists, so a firm's only practice list is published at /services-1. Marinero Law, PLLC
# publishes estate planning and family law on that page, and this check read it as a firm with no
# practice list, on a suffix its website builder chose.
COMBINED_PAGE = re.compile(
    r"(?:^|/)(?:practice[-_]areas?|practice|areas?[-_]of[-_]practice|services?|what[-_]we[-_]do|"
    r"how[-_]we[-_]help|legal[-_]services?|praactice[-_]areas?)(?:[-_]\d+)?(?:/|$|\.)", re.I)


def confirm_combined(url, spec, rp, practice_name):
    """The practice named on a page that lists all of them, which is weaker and still evidence.

    The URL test is the right first question and it is not the only one. The three firms with the
    largest review counts in New York City publish no page whose address names an injury
    practice: one lists every practice on a single /practice-areas/ page, one spells its own path
    "praactice-areas", and the ranking would have omitted the two best known injury practices in
    Queens on the strength of a typo and a site structure.

    So where no dedicated page exists, a combined page counts if the practice is named in a
    heading or a link on it and the page carries the vocabulary of that practice. The evidence
    records which kind it is, because a firm with a page about personal injury has published more
    than a firm with personal injury in a list of nine things, and a reader can see the
    difference on the profile.
    """
    if not rp.can_fetch("*", url):
        return None, "robots.txt disallows it"
    status, html, final = fetch(url)
    time.sleep(DELAY)
    if status != 200 or not html:
        return None, "HTTP %s" % (status if status else "unreachable")

    # Named in a heading or a link, not merely somewhere in the prose: a firm that mentions
    # personal injury in a paragraph about something else has not told anybody it does the work.
    labels = []
    for m in re.finditer(r"<(h[1-5]|a|strong|b|li)[^>]*>(.*?)</\1>", html, re.S | re.I):
        text = re.sub(r"\s+", " ", unescape(strip_tags(m.group(2)))).strip()
        if 3 < len(text) < 80:
            labels.append(text)
    named = next((t for t in labels if spec["title"].search(t)), None)
    if not named:
        # A page whose own markup yields no practice at all has not told us the firm does not do
        # this work. Two Buffalo firms showed the two shapes of that. Marinero Law's practice
        # list is a Squarespace page naming estate planning and family law in text blocks rather
        # than in headings or links, and this check read one label on it, the firm's name.
        # Bengart & DeMarco's page yielded twenty-two labels and every one of them was navigation
        # or a phone number. Both were reported as firms whose practice list does not include
        # this practice, which is a claim about a firm made from a claim about its markup.
        if len(labels) < 3:
            return None, ("the page carries no headings or links we can read, %d in total, so "
                          "what it lists is not readable here" % len(labels))
        others = sum(1 for t in labels
                     for name, other in PRACTICES.items()
                     if other["title"].search(t))
        if not others:
            return None, ("the page names no practice at all in a heading or a link, so its list "
                          "is not readable here rather than missing this practice")
        return None, "the page lists the firm's practices and this one is not among them"
    if not spec["corroborating"].search(strip_tags(html)):
        return None, "names the practice in a list and says nothing specific to it"

    head = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    return {
        "url": final,
        "title": unescape(strip_tags(head.group(1))).strip() if head else named,
        "heading": named,
        "checked_at": TODAY,
        "source": ("the firm's own page listing its practice areas, which names %s among them "
                   "rather than devoting a page to it" % practice_name),
        "kind": "listed among the firm's practice areas",
    }, None


def confirm(url, spec, rp):
    """Fetch a candidate page and decide whether it is about the practice."""
    if not rp.can_fetch("*", url):
        return None, "robots.txt disallows it"
    status, html, final = fetch(url)
    time.sleep(DELAY)
    if status != 200 or not html:
        return None, "HTTP %s" % (status if status else "unreachable")

    head = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.I | re.S)
    title = unescape(strip_tags(head.group(1))).strip() if head else ""
    heading = unescape(strip_tags(h1.group(1))).strip() if h1 else ""

    if not (spec["title"].search(title) or spec["title"].search(heading)):
        return None, "page is not titled for the practice"

    # The address is not always the tell. One firm's comparison piece lives at
    # /construction-site-accident-lawyer/workers-comp-personal-injury/, which no path rule would
    # catch, and announces itself in the title: "Workers Comp vs Personal Injury".
    if ARTICLE_TITLE.search(title) or ARTICLE_TITLE.search(heading):
        return None, "the title is an article's, not a practice page's"

    text = strip_tags(html)
    if not spec["corroborating"].search(text):
        return None, "titled for the practice but says nothing specific to it"

    return {
        "url": final,
        "title": title or heading,
        "heading": heading or None,
        "checked_at": TODAY,
        "source": "the firm's own practice page",
        "kind": "a page about this practice",
    }, None


def examine(domain, spec):
    origin = https_origin(domain)
    rp = robots_for(origin)
    robots = robots_body(origin)

    def matching(urls, seen):
        out = []
        for url in urls:
            if urllib.parse.urlparse(url).netloc.split(":")[0].removeprefix("www.") != domain:
                continue
            path = urllib.parse.urlparse(url).path
            if not spec["slug"].search(path) or url in seen:
                continue
            if NOT_A_PRACTICE_PAGE.search(path):
                continue
            seen.add(url)
            out.append(url)
        return out

    seen = set()
    where = "sitemap"
    from_sitemap = list(sitemap_urls(origin, robots, rp))
    from_home = []
    candidates = matching(from_sitemap, seen)
    if not candidates:
        # A sitemap that answers and does not list the practice pages used to end the check,
        # because the home page was only consulted when the sitemap produced nothing at all.
        # Iannella & Mummolo publishes /personal_injury and its sitemap does not mention it, so
        # a Boston firm with 688 reviews read as publishing no injury practice.
        from_home = list(home_links(origin, rp))
        candidates = matching(from_home, seen)
        where = "sitemap, then the home page's links"

    if not candidates:
        # No sitemap and no links is not a finding about the firm. familycourtbuffalo.com
        # publishes a page headed "Family Law Areas" and this check reported that the firm
        # publishes no such page: its host answered 429 to three requests in a row, so there was
        # nothing to read and the reason given described the site instead of the refusal.
        if not from_sitemap and not from_home:
            return None, ("nothing to read: no sitemap answered and the home page served no "
                          "links, so this is a site we could not fetch rather than a page the "
                          "firm does not publish")
        return None, "no page whose address names the practice (%s)" % where

    # A site with dozens of matching URLs has a page per borough and per injury type as well as
    # the practice page. Rank by how much of the final segment is not the practice itself, then
    # by depth: /workers-compensation beats /workers-comp-glossary beats /bronx/workers-comp.
    def rank(url):
        parts = [p for p in urllib.parse.urlparse(url).path.strip("/").split("/") if p]
        # Every segment, not only the last: /bronx/workers-compensation is a borough variant
        # and its final segment alone looks like the practice page itself.
        tokens = [t for t in re.split(r"[-_./]+", "/".join(parts).lower()) if t]
        extra = [t for t in tokens
                 if t not in CORE_WORDS and not spec["slug"].search(t) and not t.isdigit()]
        return (len(extra), len(parts), len(url))

    candidates.sort(key=rank)
    if len(candidates) > MENU_DENSITY:
        candidates = candidates[:MENU_DENSITY]

    last = "no candidate page confirmed"
    for url in candidates[:8]:
        found, why = confirm(url, spec, rp)
        if found:
            found["candidates_seen"] = len(seen)
            return found, None
        last = why
    return None, last


def examine_combined(domain, spec, practice_name):
    """The second question, asked only when the first one found nothing."""
    origin = https_origin(domain)
    rp = robots_for(origin)
    robots = robots_body(origin)

    urls, seen = [], set()
    everything = list(sitemap_urls(origin, robots, rp)) + list(home_links(origin, rp))
    for url in everything:
        if urllib.parse.urlparse(url).netloc.split(":")[0].removeprefix("www.") != domain:
            continue
        path = urllib.parse.urlparse(url).path
        if not COMBINED_PAGE.search(path) or url in seen:
            continue
        seen.add(url)
        urls.append(url)
    urls.sort(key=lambda u: len(urllib.parse.urlparse(u).path))

    if not everything:
        return None, ("nothing to read: no sitemap answered and the home page served no links, "
                      "so this is a site we could not fetch rather than a firm with no "
                      "practice-areas page")
    last = "the firm publishes no page listing its practice areas either"
    for url in urls[:4]:
        found, why = confirm_combined(url, spec, rp, practice_name)
        if found:
            found["candidates_seen"] = len(seen)
            return found, None
        last = why
    return None, last


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--practice", required=True, choices=sorted(PRACTICES))
    ap.add_argument("--candidates", help="a file written by scripts/discover_places.py")
    ap.add_argument("--domains", help="comma-separated domains instead")
    ap.add_argument("--top", type=int, default=40, help="how many candidates to examine")
    ap.add_argument("--staging", default=".crawl")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    if args.domains:
        domains = [d.strip() for d in args.domains.split(",") if d.strip()]
        names = {}
    elif args.candidates:
        data = json.load(io.open(args.candidates, encoding="utf-8"))
        rows = data["candidates"][:args.top]
        domains = [r["domain"] for r in rows]
        names = {r["domain"]: r.get("name", "") for r in rows}
    else:
        print("give --candidates or --domains", file=sys.stderr)
        return 2

    spec = PRACTICES[args.practice]
    staging = ROOT / args.staging
    staging.mkdir(parents=True, exist_ok=True)
    holds, misses = [], []

    for i, domain in enumerate(domains, 1):
        try:
            found, why = examine(domain, spec)
            # Where the firm publishes no page about this practice, ask whether it publishes a
            # page listing its practices and names this one on it. Weaker, cited as such, and
            # the difference between ranking the two best known injury practices in Queens and
            # omitting them over a site structure and a typo in somebody's own URL.
            if not found:
                combined, why_combined = examine_combined(
                    domain, spec, args.practice.replace("-", " "))
                if combined:
                    found, why = combined, None
                else:
                    why = "%s; %s" % (why, why_combined)
        except Exception as err:                      # a site can fail in ways urllib does not
            found, why = None, "error: %s" % err
        label = (names.get(domain) or "")[:34]
        print("%3d/%d %-34s %-34s %s"
              % (i, len(domains), domain[:34], label,
                 found["url"][:60] if found else "no  (%s)" % why))

        path = staging / (domain + ".json")
        rec = {}
        if path.exists():
            try:
                rec = json.load(io.open(path, encoding="utf-8"))
            except (ValueError, OSError):
                rec = {}
        rec.setdefault("domain", domain)
        evidence = rec.setdefault("practice_evidence", {})
        evidence[args.practice] = found or {"held": False, "why": why, "checked_at": TODAY}
        io.open(path, "w", encoding="utf-8", newline="\n").write(
            json.dumps(rec, ensure_ascii=False, indent=2) + "\n")

        (holds if found else misses).append(domain)

    print()
    print("%d of %d publish a %s practice page, or name it among their practice areas"
          % (len(holds), len(domains), args.practice))
    print()
    for d in holds:
        print("   %s" % d)
    return 0


if __name__ == "__main__":
    sys.exit(main())
