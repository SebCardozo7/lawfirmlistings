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
from crawl_public import (LINK_KINDS, UA, fetch, robots_for, strip_tags, meta, unescape,  # noqa: E402
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
    r"settlement|case|client|review|blog|news|español|abogado|"
    # Utility links. A roster page also links to its privacy policy and its site map, and
    # "Privacy Policy" is two capitalised words with nothing in it to say it is not a person.
    r"privacy|policy|terms|disclaimer|sitemap|map|assistant|menu|search|espanol|english|"
    r"payment|careers|scholarship|faq|video|testimonial|"
    # Words that only ever belong to a practice-page title. These reached the name only because
    # the role peel had already taken "Lawyer" or "Attorneys" off the end of them, which is how
    # "New York Premises Liability Lawyer" was stored as a person called
    # "New York Premises Liability La".
    r"premises|liability|wrongful|death|brutality|subway|disease|union|worker|workers|"
    r"negligence|abuse|harassment|discrimination|bankruptcy|immigration|divorce|"
    # A general practice firm's roster page links to the rest of its menu, and none of these
    # words had a plural here. "Car Accidents" and "Truck Accidents" were stored as people at a
    # Portage firm, because \baccident\b does not match "Accidents", and "Social Security
    # Disability" was stored because disability was missing altogether.
    r"disability|criminal|crime|defense|felony|misdemeanor|dui|owi|expungement|molesting|"
    r"pornography|custody|adoption|probate|estate|guardianship|mediation|appeal|theft|"
    # "trust" is deliberately not on this list even though "Trusts & Estates" is a practice,
    # because Trust is a given name and dropping a real attorney is the worse mistake: a practice
    # title on a roster is visible on the page, a missing lawyer is not. "Estates" catches the
    # practice anyway.
    r"assault|battery|drug|traffic)s?\b", re.I)

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
    # Spanish, on the Spanish-language versions of these same sites.
    "abogado", "abogada", "abogados", "abogadas", "asociado", "asociada", "socio", "socia",
    "fundador", "fundadora", "gerente", "director", "directora", "principal", "consejero",
    # Korean and Chinese for "attorney", which appear as a suffix on a bio heading.
    "\ubcc0\ud638\uc0ac", "\u5f8b\u5e2b", "\u5f8b\u5e08",
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


# Prefixes that carry a capital inside them. A blanket title-case turns McDonald into Mcdonald
# and O'Hagan into O'hagan, which is somebody's name spelled wrong.
#
# Only these four. The first draft also listed the lowercase particles, de, di, la, le, van and
# von, and those do not take an inner capital at all: they made DELGADO come back as DeLgado and
# LEONARD as LeOnard. A particle is a separate word when it is one.
INNER_CAPS = re.compile(r"^(mc|mac|o'|d')(.+)$", re.I)


def normalise_case(name):
    """Title-case a name the firm published in capitals, and leave every other name alone.

    Frekhtman & Associates sets its roster in capitals, so its attorneys arrived as
    "ARKADY FREKHTMAN" and would have sat in a list beside "Melisande Hill" shouting. Only a
    wholly uppercase name is touched: a firm that writes "deGeneres" or "MacIntyre" is spelling
    it deliberately and knows better than we do.
    """
    letters = re.sub(r"[^A-Za-z]", "", name or "")
    if len(letters) < 4 or not letters.isupper():
        return name

    def fix(word):
        m = INNER_CAPS.match(word)
        if m and len(m.group(2)) > 1:
            head, tail = m.group(1), m.group(2)
            return head.capitalize() + tail[0].upper() + tail[1:].lower()
        return "-".join(part.capitalize() for part in word.split("-"))

    return " ".join(fix(w) for w in name.split())


def looks_like_a_person(name):
    if not name or len(name) > 60:
        return False
    name = name.strip()
    if any(ch.isdigit() for ch in name):
        return False
    if NOT_A_PERSON.search(name):
        return False
    words = [w for w in re.split(r"\s+", name) if w]
    # A name written in a script without cases or spaces between given and family name is
    # still a name. Two to five Latin words is the right test for Latin script and the wrong
    # one for Korean, Chinese or Japanese, where a full name is one short block.
    # Hangul syllables sit at U+AC00-D7AF, above the CJK block, so a single range stopping at
    # U+9FFF matched nothing Korean at all. Three blocks: the Japanese syllabaries, CJK, and
    # Hangul.
    if any("\u3040" <= ch <= "\u30ff" or "\u4e00" <= ch <= "\u9fff"
           or "\uac00" <= ch <= "\ud7af" for ch in name):
        return 2 <= len(name.replace(" ", "")) <= 12
    if not 2 <= len(words) <= 5:
        return False
    # A title word past the given name and surname means the peel stopped early.
    if len(words) > 2 and TITLE_RESIDUE.search(" ".join(words[2:])):
        return False
    # Nothing but title words. The peel takes a role off the end of a name and leaves a bare
    # role alone, so "Founding Partner" and "Of Counsel" arrived here as people: a roster that
    # links each title to an archive of titles publishes both as plain two-word links. No
    # surname collision to worry about, because this fires only when every word is a title.
    if all(w.strip(".,").casefold() in ROLE_WORDS for w in words):
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


# A heading that introduces the person rather than just naming them. Davidoff Law titles every
# bio "About Attorney Mark Getzoni", and six of its attorneys were thrown out because "about" and
# "attorney" are in the vocabulary that means a heading is not a name. The words are the firm's
# furniture, and the name is behind them.
HEADING_PREFIX = re.compile(r"^(?:about|meet|profile of|introducing)\s+"
                            r"(?:attorney|our attorney|lawyer|partner)?\s*", re.I)


def split_name_and_role(raw):
    """Returns (name, role_as_published). The role is the firm's wording, or None."""
    text = re.sub(r"\s+", " ", (raw or "").replace("&amp;", "&")).strip()
    text = HEADING_PREFIX.sub("", text).strip()
    text = SUFFIXES.sub("", text).strip(" ,-|")

    words = [w for w in re.split(r"[\s,|]+", text) if w]
    role = []
    # Peel from the right while the word reads as part of a title, never below the floor so
    # a short name cannot be eaten. A word counts as title if it is a known role word, or is
    # all-caps while the name beside it is not.
    #
    # The floor is two words for Latin script and one for Korean, Chinese or Japanese, where
    # a full name is a single block: "오재현 변호사" is a name followed by the word for attorney,
    # and a floor of two left the title inside the name.
    cjk = any("\u3040" <= ch <= "\u30ff" or "\u4e00" <= ch <= "\u9fff"
              or "\uac00" <= ch <= "\ud7af" for ch in text)
    floor = 1 if cjk else 2
    # The peel treats an all-caps word as a title because the name beside it is not. On a roster
    # set entirely in capitals there is no name beside it: every word is capitals, and the rule
    # ate the surname. "RICHARD R. MOGG" came back as Richard R. with the role "Mogg". Where the
    # whole heading is uppercase, only the vocabulary may peel.
    letters_all = re.sub(r"[^A-Za-z]", "", text)
    all_caps_heading = len(letters_all) >= 4 and letters_all.isupper()
    while len(words) - len(role) > floor:
        w = words[len(words) - len(role) - 1]
        letters = re.sub(r"[^A-Za-z]", "", w)
        is_caps = len(letters) >= 2 and letters.isupper()
        if w.lower().strip(".") in ROLE_WORDS or (is_caps and not all_caps_heading):
            role.insert(0, w)
        else:
            break

    name = " ".join(words[:len(words) - len(role)]).strip(" ,-|")
    role_text = " ".join(role).strip(" ,-|")
    return name, (role_text.title() if role_text else None)


def h1_of(html):
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S | re.I)
    return strip_tags(m.group(1)) if m else None


# What a firm calls the part of its site that holds the lawyers. Matching on vocabulary instead
# of on these names picked /nyc/premises-liability-lawyer/ as a roster, because "lawyer" is in
# both a roster's name and a practice page's.
ROSTER_SECTIONS = {
    "about", "about-us", "about-our-firm", "our-firm", "the-firm", "firm", "our-team", "team",
    "our-attorneys", "attorneys", "attorney", "our-lawyers", "lawyers", "our-people", "people",
    "staff", "profiles", "bios", "meet-our-team", "meet-the-team", "meet-our-attorneys",
    "who-we-are", "leadership", "nuestro-equipo", "abogados",
}


# "attorneys" and "lawyers", never the singular. /attorneys/ and
# /experienced-personal-injury-attorneys-in-new-york/ are rosters;
# /nyc/premises-liability-lawyer/ is a practice page whose children are injuries, not people.
ROSTER_PLURAL = re.compile(r"attorneys|lawyers|abogados", re.I)


def slug_reads_as_a_name(path):
    """Does the last path segment look like a person rather than a topic?

    "/about-us/adam-d-cahn/" is a bio and "/practice-areas/medical-malpractice-lawyer/" is not,
    and the difference is legible in the slug alone: hyphenated name tokens against practice
    vocabulary. The same person test the headings go through decides it, so there is one
    definition of what a name looks like.
    """
    segs = [x for x in (path or "").split("/") if x]
    if not segs:
        return False
    slug = re.sub(r"\.(html?|php|aspx?)$", "", segs[-1])
    tokens = [t for t in slug.split("-") if t]
    if not 2 <= len(tokens) <= 4:
        return False
    return looks_like_a_person(" ".join(t.capitalize() for t in tokens))


def bios_without_index(html, origin):
    """Bio pages on a site that publishes no attorney index we can recognise.

    Five firms came back with an empty roster and "no attorney index found". Four of them publish
    bios perfectly openly, from the home page, under a parent we do not read as a roster:

        sakkascahn.com        /about-us/adam-d-cahn/       linked as "view bio"
        lawfirmdavidoff.com   /our-firm/julia-wetzel/      linked as "View Full Profile"
        kdlm.com              an index whose own slug is a practice phrase

    The reliable signal is not the parent's name and not the anchor text, both of which vary. It
    is that a roster leaves siblings: several links sharing one parent path, each ending in a
    segment that reads as a person. One such link is a coincidence, so two are required before
    the group counts, and the pages themselves are still fetched and still named from their own
    heading.
    """
    groups = {}
    for m in re.finditer(r'href=["\']([^"\'#\s]+)["\']', html, re.I):
        url = urllib.parse.urljoin(origin + "/", m.group(1).strip())
        if not url.startswith(origin):
            continue
        path = urllib.parse.urlparse(url).path
        if not slug_reads_as_a_name(path):
            continue
        segs = [x for x in path.split("/") if x]
        parent = "/".join(segs[:-1])
        groups.setdefault(parent, []).append(url.split("?")[0].rstrip("/"))

    # Choosing the biggest group was wrong twice over. sakkascahn.com publishes three bios under
    # /about-us/ and a dozen city pages at the root, where "Garden City" and "Nassau County" read
    # as people; and it publishes five pages under /nyc/premises-liability-lawyer/, where
    # "Dog Bite" and "Slip And Fall" do too. The second group won on size and because its parent
    # path contains the word "lawyer", which is in a roster's vocabulary and in a practice page's
    # as well.
    #
    # So the parent decides, by name and not by keyword. A roster sits in a section about the
    # firm, and that section is called one of a short list of things. Anything else is a topic.
    candidates = [(parent, sorted(set(urls))) for parent, urls in groups.items()
                  if parent and len(set(urls)) >= 2]
    if not candidates:
        return []

    def section(parent):
        return [x for x in parent.split("/") if x][-1].lower().strip("/")

    # An allowlist of section names alone was too strict: kdlm.com keeps its ten bios under
    # /experienced-personal-injury-attorneys-in-new-york/, which is a roster with a keyword name.
    # The tell is grammatical number. A roster is "attorneys" or "lawyers"; a practice page is
    # "premises liability lawyer", singular, with the practice in front of it. So a plural counts
    # and a singular does not, and an exact section name still wins over both.
    exact = [(p, u) for p, u in candidates if section(p) in ROSTER_SECTIONS]
    plural = [(p, u) for p, u in candidates if ROSTER_PLURAL.search(section(p))]
    pool = exact or plural
    if not pool:
        return []
    return max(pool, key=lambda pair: len(pair[1]))[1]


def bio_candidates(html, origin, index_url, names=None, roles=None):
    """The firm's attorney pages, linked from its attorney index.

    Two passes, because the URL is not the reliable signal. Eleven of the firms published here
    came back with an empty roster, and four of them had a perfectly good roster page whose bio
    links this function threw away:

        mirmanlawyers.com   /our-team/  links to  /about/danielle-ciraola/
        866attylaw.com      /team/      links to  /arkady-frekhtman-personal-injury-attorney/

    The first is two segments deep and says "about", the second is a root-level slug carrying
    practice words. Neither looks like a bio URL and both plainly are one. What they have in
    common is the anchor text: on a roster page, the link to a lawyer's page is their name.

    So pass one keeps the old URL shape test, which catches a bio whose link reads "Read more",
    and pass two accepts any internal link whose anchor text reads as a person's name. Where the
    anchor says "Danielle Ciraola", the URL has nothing left to tell us.
    """
    index_path = urllib.parse.urlparse(index_url).path.rstrip("/")
    base_depth = len([s for s in index_path.split("/") if s])
    out, seen = [], set()

    def consider(href, anchor_name=None, anchor_role=None):
        url = urllib.parse.urljoin(origin + "/", href.strip())
        if not url.startswith(origin):
            return
        path = urllib.parse.urlparse(url).path
        if anchor_name is None:
            if not re.search(ATTORNEY_PATTERN, path):
                return
            segs = [s for s in path.split("/") if s]
            if len(segs) != base_depth + 1:
                return
        clean = url.split("?")[0].rstrip("/")
        # The roster's own link text, kept for the bios whose page does not put the name in a
        # heading. Wruck Paupore heads each of its three bios "Get to Know Don", so the page
        # names nobody and the roster link says "Don Wruck".
        if names is not None and anchor_name:
            names.setdefault(clean, anchor_name)
        if roles is not None and anchor_role:
            roles.setdefault(clean, anchor_role)
        if clean in seen or clean.rstrip("/") == index_url.rstrip("/"):
            return
        seen.add(clean)
        out.append(clean)

    for m in re.finditer(r'href=["\']([^"\'#\s]+)["\']', html, re.I):
        consider(m.group(1))

    for m in re.finditer(r'<a[^>]+href=["\']([^"\'#\s]+)["\'][^>]*>(.*?)</a>', html, re.S | re.I):
        text = re.sub(r"<[^>]+>", " ", m.group(2))
        text = unescape(re.sub(r"\s+", " ", text)).strip()
        name = split_name_and_role(text)[0] if text else ""
        if name and looks_like_a_person(name):
            consider(m.group(1), anchor_name=name,
                     anchor_role=role_beside(html, m.end()) if roles is not None else None)

    return out


# What a roster prints under a name. Ordered longest first so "Founding Partner" is not read as
# "Partner", and deliberately short: a word not on this list is not a role we will assert.
ROSTER_ROLE = re.compile(
    r"\b(founding partner|managing partner|senior partner|name partner|of counsel|partner|"
    r"senior associate|associate attorney|associate|attorney at law|trial attorney|attorney|"
    r"paralegal|law clerk|legal assistant|case manager|office manager|founder)\b", re.I)


def role_beside(html: str, start: int) -> str | None:
    """The role a roster prints next to a name, where it prints one as its own element.

    Wruck Paupore links each lawyer's name to their bio and their title to a title archive, so
    "Don Wruck" and "Founding Partner" are two anchors in a row and the bio page itself says
    neither. Without this the firm's three partners arrive with no role at all, and
    src/lib/roster.ts would print all three as colleagues rather than attorneys.

    The window closes at the next link to another person, so a role is only ever read from
    between one name and the next.
    """
    window = html[start:start + 500]
    # Cut at the next person, not at the next link: a roster that links a title to an archive of
    # titles has "/attorney-titles/of-counsel/" as the very next href, and closing the window
    # there threw away the role it was looking for.
    for m in re.finditer(r'<a[^>]+>(.*?)</a>', window, re.S | re.I):
        text = unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(1)))).strip()
        if text and looks_like_a_person(split_name_and_role(text)[0]):
            window = window[:m.start()]
            break
    m = ROSTER_ROLE.search(unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", window))))
    if not m:
        return None
    # Rosters style these with CSS, so the text can arrive in one case or the other. A role that
    # is entirely lowercase is that styling rather than the firm's spelling.
    role = m.group(1)
    return role.title() if role.islower() else role


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
        # No index we recognise. A roster still leaves sibling bio pages on the home page.
        seeded_bios = bios_without_index(home, origin)
        if seeded_bios and verbose:
            print("      no index; %d sibling bio page(s) off the home page"
                  % len(seeded_bios))
    if not index_url and not seeded_bios:
        return {"error": "no attorney index found, and no group of bio pages on the home page"}

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
    # Firms publish one bio per language, so the same person arrives twice once the Spanish role
    # words peel correctly. The first reading wins: it comes from the default locale, which is
    # where the rest of the profile came from.
    seen_names: set[str] = set()

    # The roster's link text per bio URL, whether or not the bio list came from the sitemap. It
    # is only read when a bio page's own heading turns out not to name anybody.
    anchor_names: dict[str, str] = {}
    anchor_roles: dict[str, str] = {}
    if index_html:
        bio_candidates(index_html, origin, index_final, anchor_names, anchor_roles)
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
        name = normalise_case(name)
        if looks_like_a_person(name):
            result["attorneys"].append({"name": name, "source_url": index_final,
                                        "bar_number": None, "role": role or None,
                                        "role_source": ("firm bio heading" if role
                                                        else "not stated by the firm")})
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
        name = normalise_case(name)
        if name and name.casefold() in seen_names:
            continue
        name_from = "bio heading"
        if not looks_like_a_person(name):
            # The page does not name them, so ask the roster that linked to it. Three Valparaiso
            # lawyers were lost this way: every bio at wp-law.com is headed "Get to Know Don",
            # which is not a name, while the link on the roster page reads "Don Wruck". A firm
            # that names nobody fails G5, so reading zero attorneys off a roster of three is not
            # a cosmetic miss.
            from_link = normalise_case((anchor_names.get(final.split("?")[0].rstrip("/"))
                                        or anchor_names.get(url.rstrip("/")) or ""))
            if not looks_like_a_person(from_link):
                result["rejected"].append({"heading": heading, "url": final})
                continue
            if from_link.casefold() in seen_names:
                continue
            key = final.split("?")[0].rstrip("/")
            name, name_from = from_link, "roster link text"
            role = anchor_roles.get(key) or anchor_roles.get(url.rstrip("/"))
        bar = BAR_NUMBER.search(strip_tags(html))
        # The role is whatever the firm printed next to the name, and nothing where it printed
        # nothing. "Attorney" used to stand in that case, which turned every name on an
        # /our-team/ page into a bar-admitted lawyer on our profile: one firm published
        # twenty-seven that way and seventeen of them had no registration and read as an
        # operations team. Calling somebody an attorney is a claim about their credentials, so
        # the absence is recorded as an absence and src/lib/roster.ts decides what to print.
        seen_names.add(name.casefold())
        result["attorneys"].append({
            "name": name, "source_url": final,
            "bar_number": bar.group(1) if bar else None,
            "role": role or None,
            "role_source": ("firm bio heading" if role and name_from == "bio heading"
                            else "firm roster listing" if role
                            else "not stated by the firm"),
            "name_source": name_from,
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

        # A failed run must not delete a good one. godoskygentile.com serves an intermittent 403
        # to crawlers, and one re-run that happened to hit it replaced four collected attorneys
        # with an error and a count of zero, which then reads as "this firm names nobody" all the
        # way through to the gates. An error is news about the fetch, not about the roster.
        had = ((fresh.get("attorneys_found") or {}).get("attorneys")) or []
        if found.get("error") and had:
            found = dict(found, attorneys=had,
                         kept_from=(fresh["attorneys_found"] or {}).get("checked_at"),
                         note=("this run failed (%s) and the %d name(s) already collected were "
                               "kept rather than overwritten with nothing"
                               % (found["error"], len(had))))
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
