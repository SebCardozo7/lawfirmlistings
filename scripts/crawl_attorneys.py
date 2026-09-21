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
from crawl_public import (LINK_KINDS, UA, fetch, https_origin, robots_for, strip_tags,  # noqa: E402
                          meta, unescape, json_ld_blocks)

ROOT = pathlib.Path(__file__).resolve().parents[1]
DELAY = 1.5
# Four firms hit a cap of 25 with names still on the page, so this is the number of bios a
# large firm plausibly publishes rather than a number that quietly truncates the result.
# Raised from 60 once the sitemap started finding real rosters: one firm publishes 64 bios,
# and a cap below the roster size truncates silently, which is how this went wrong at 25.
# Hitting the cap is now reported rather than absorbed.
MAX_BIOS = 200

ATTORNEY_PATTERN = next(p for k, p in LINK_KINDS if k == "attorneys")

# A section of a site that never holds a person, however much the link to it reads like a name.
# A roster page links the rest of the site, and the anchor text is the whole signal for a bio
# whose own page names nobody: "St. Albans", "Throgs Neck", "Nassau County", "Press Releases"
# and "Ceiling Collapse" are all two capitalised words, and all of them are pages about a
# neighbourhood, a practice or a press release. The address of the page is what separates them.
NOT_A_BIO_PATH = re.compile(
    r"/(?:practice[-_]areas?|practice|services?|areas?[-_]we[-_](?:serve|service)|"
    r"areas?[-_](?:served|serving)|locations?|[a-z]{2,4}[-_]locations?|cities|neighborhoods?|"
    r"blog|news|press([-_]releases?)?|articles?|recent[-_]articles?|resources?|author|"
    r"category|tag|courses?|contact([-_]us)?|why[-_]choose[-_]us|reviews?|testimonials?|"
    r"faq|videos?|lawsuits?|case[-_]results?)(?:/|$)", re.I)
# "profiles" is deliberately absent: Rosenberg & Rodriguez publishes every one of its ten
# lawyers at /profiles/<name>/, and a blacklist that reads like a list of sections has to be
# checked against where firms actually put their people.

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
    # The plural of a word ending in y is not that word plus an s, and the optional s below
    # therefore missed every one of them. A Buffalo roster published "Railroad Injuries" and
    # "Traumatic Brain Injuries" as members of staff, and a Lakeland one published "Asset
    # Protection", each of them a link on the roster page to a practice page.
    r"injuries|liabilities|disabilities|policies|protection|planning|railroad|asset|"
    # Menu items on a roster page that are neither a practice nor a person. A Fort Worth
    # firm's team page linked "Community Involvement" and "Social Media" beside its
    # lawyers, and both were stored as people.
    # "press" is left off for the same reason as "trust": Press is somebody's surname.
    r"community|involvement|social|media|event|award|podcast|newsletter|"
    # A roster page's own headings can be its addresses. Seitelman Law Offices heads its team
    # page with "Broadway Office", "Grand Street Office" and "Gracie Terrace Office", and the
    # fallback that reads those headings stored all three as people.
    r"office|location|"
    # The kinds of collision a firm lists on its menu. "Motorcycle Collisions", "Animal
    # Attacks" and "Slip And Fall" were each published as a member of staff, at a Portland
    # firm and a Dallas one, because the list held the practice-area nouns and not these.
    # Bare "fall", "bite" and "hazard" are left off: Fall, Bite and Hazard are all
    # surnames, and the phrases are what a menu actually prints.
    # "slip" and not "fall": a firm that writes "Slip & Falls" in its menu defeats the phrase
    # below, and Slip is nobody's surname while Fall is somebody's.
    r"motorcycle|collision|crash|rollover|pedestrian|bicycle|animal|attack|slip|"
    r"slip[-\s]and[-\s]fall|dog[-\s]bite|nursing|toxic|asbestos|mesothelioma|"
    # "trust" is deliberately not on this list even though "Trusts & Estates" is a practice,
    # because Trust is a given name and dropping a real attorney is the worse mistake: a practice
    # title on a roster is visible on the page, a missing lawyer is not. "Estates" catches the
    # practice anyway.
    r"assault|battery|drug|traffic|"
    # What a roster page's menu links besides its people, found when the crawler began reading
    # both the seeded bio list and the roster's own links: one Manhattan firm's team page put
    # "Referral Program", "Life Insurance Claims", "Tree Root Sidewalk Heaves" and "Read More"
    # among its sixteen lawyers and staff, every one of them a link whose text is two or three
    # capitalised words.
    #
    # "Bronx" and "Staten Island" are here as the boroughs a firm links its local pages by.
    # Neither is a surname anybody in this directory carries, and a firm that does employ a
    # Ms Island will be caught by a human reading the roster, which is what the drop lists in
    # the publish scripts are for.
    # Brooklyn, Queens and Manhattan are deliberately absent: Brooklyn is a given name, and the
    # rule of this list is that a practice title on a roster is visible to anybody reading the
    # page while a dropped lawyer is invisible.
    r"referral|program|insurance|claim|sidewalk|read[-\s]more|bronx|staten[-\s]island|"
    # More of the same, from the same reading: a link to a city page, a defective-product page
    # or an advertising-disclosure page, each of which is two capitalised words.
    r"lawsuit|uninsured|commercial|advertisement|collapse|new[-\s]york|view[-\s]all)s?\b",
    re.I)

# Words a roster puts in front of a name rather than after it. Kept apart from ROLE_WORDS
# because that set is wide enough to include "of" and "and", which must never lead a peel.
LEADING_TITLES = {"attorney", "attorneys", "atty", "lawyer", "abogado", "abogada"}

# Words a firm puts in front of a name, as its own statement of rank. Kept apart from
# ROLE_WORDS because that set carries "the", "and", "name" and "client", which read as a title
# at the end of a heading and would swallow the start of one.
LEADING_ROLE_WORDS = {
    "of", "counsel", "partner", "partners", "managing", "founding", "senior", "associate",
    "associates", "founder", "co-founder", "shareholder", "principal", "president", "equity",
    "socio", "socia", "asociado", "asociada", "fundador", "fundadora",
    # A rank in front of the name is as often a staff rank as a lawyer's one, and the two are
    # told apart downstream by src/lib/roster.ts. Leaving "Case Manager" inside a name would
    # publish the job as part of a real person's name on their own profile line.
    "attorney", "attorneys", "lawyer", "lawyers", "trial", "supervising", "staff", "case",
    "manager", "paralegal", "intake", "specialist", "legal", "assistant", "clerk", "chief",
    "director", "coordinator", "investigator", "nurse",
}

SUFFIXES = re.compile(r"\s*[,|–—-]\s*(esq\.?|esquire|jd|j\.d\.|llp|llc|p\.?c\.?|pllc|"
                      r"attorney at law).*$", re.I)

# A word a roster puts after a name to say the link goes to their page. Vernon Litigation links
# "Chris Vernon Bio" and "John J. Truitt Bio", and both were stored with the word inside the
# name. Stripped only where it is the last word and the name survives without it.
LINK_WORD = re.compile(r"\s+(?:bio|biography|profile|vcard|v[- ]card|page)\s*$", re.I)

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
    # Roles a firm publishes that are not lawyers. src/lib/roster.ts already knows an
    # investigator is staff; without the word here the peel left it inside the name and a Dallas
    # firm's in-house investigator was stored as a person called "Mike Foster Private
    # Investigator".
    "investigator", "private", "nurse", "bookkeeper", "receptionist", "translator",
    "interpreter", "coordinator", "specialist", "analyst",
    # Adjectives that only ever sit inside a job title. None is a plausible surname, which is the
    # test for adding one here: the peel walks right to left and stops at the first word it does
    # not know, so a missing adjective leaves everything to its left stuck in the name.
    "operating", "operational", "financial", "administrative", "marketing", "technology",
    "information", "revenue", "strategy", "strategic", "business", "development", "relations",
    "services", "support", "compliance", "risk", "human", "resources", "client", "clients",
    # The practice in front of the job, which is how a firm writes a bio's page title:
    # "Cornelius Redmond Personal Injury Attorney". The peel stopped at "Injury", left it
    # inside the name, and the vocabulary that rejects a heading then threw the whole thing
    # out, so a Brooklyn firm with 820 reviews read as naming nobody. None of these is a
    # surname, and the two-word floor means a name can never be eaten down to nothing.
    "personal", "injury", "injuries", "accident", "accidents", "malpractice", "compensation",
    "comp", "criminal", "defense", "immigration", "employment", "bankruptcy",
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
    # A given name and an initial, which is how a page prints somebody it is not naming in
    # full. Gelbstein & Associates publishes its client reviews on its about page as "Isaac H."
    # and "Sara S.", and reading that page as a roster stored five of its clients as the firm's
    # people. Shalom Law does print its staff that way, so this drops real names too: the
    # firm's attorney is published under his full name and the rest of that staff list is not
    # ours to complete. Publishing a client as an employee is the worse of the two errors.
    if len(words) == 2 and len(words[1].strip(".")) == 1:
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
    stripped = LINK_WORD.sub("", text).strip()
    if stripped and len(stripped.split()) >= 2:
        text = stripped

    # "Perla Hagemeier - The Barber Law Firm" is a page title with the site's name appended, and
    # nine of that firm's bios are headed exactly that way, so nine people were unreachable.
    # Split on the separator and keep the half that reads as a person. A role after the separator
    # is still a role, so "Jane Doe - Managing Partner" is left for the peel below.
    # Split on every separator rather than the first one found. Goodwin Law heads each bio
    # "Alexandra Kane - Naples, Collier County, Lee County, FL | Goodwin Law, P.A.", so taking
    # the half before the pipe left the city and the county in the name and all five of its
    # people were thrown out.
    parts = [p.strip() for p in re.split(r"\s[|–—-]\s", text) if p.strip()]
    if len(parts) > 1:
        tail_words = [w for w in re.split(r"[\s,]+", parts[1]) if w]
        # A role after the separator is the role, and the peel below wants the whole string.
        if not (tail_words and all(w.lower().strip(".") in ROLE_WORDS for w in tail_words)):
            if looks_like_a_person(parts[0]):
                text = parts[0]
            elif parts[0] != text:
                # The half before the separator can be a name with its job attached, which is
                # how a bio's page title is written: "Cornelius Redmond Personal Injury
                # Attorney | Redmond Law Firm". Asking the same question of that half alone
                # peels the job off it; asking it of the whole string leaves the firm's name
                # inside the person's. Terminates because the half is always shorter.
                head_name, head_role = split_name_and_role(parts[0])
                if looks_like_a_person(normalise_case(head_name)):
                    return head_name, head_role

    words = [w for w in re.split(r"[\s,|]+", text) if w]

    # A title in front of the name, which the peel below never looked for because it only works
    # from the right. Three Dallas attorneys were lost to it: mullenandmullen.com links each of
    # them as "Attorney Regis L. Mullen", and the word Attorney is in the vocabulary that rejects
    # a heading outright, so the firm read as naming nobody and failed G5.
    #
    # Only these words, and only as the first of at least three. "Dr." is deliberately absent: a
    # doctor on a law firm's roster is a doctor, and peeling the title into the role would make
    # src/lib/roster.ts print them as an attorney.
    lead = None
    if len(words) >= 3 and words[0].lower().strip(".") in LEADING_TITLES:
        lead, words = words[0], words[1:]
    else:
        # The firm's own title, published in front of the name instead of behind it. Union Law
        # Firm heads its bios "Partner Frank R. Schirripa" and "Of Counsel Halina Radchenko",
        # and eleven of its twenty-three people were stored with the job inside the name. The
        # peel above only knew the words a directory puts in front of a name.
        #
        # Left to right while the word is a title, never below two words, and only if what is
        # left still reads as a person, so a surname that happens to be in the vocabulary
        # cannot be eaten.
        taken = 0
        while len(words) - taken > 2 and words[taken].lower().strip(".") in LEADING_ROLE_WORDS:
            taken += 1
        if taken and looks_like_a_person(" ".join(words[taken:])):
            lead, words = " ".join(words[:taken]), words[taken:]

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
    # A leading title is the role where the firm published no other one, and is dropped where it
    # did: "Attorney Jane Doe, Managing Partner" is a managing partner.
    if lead and not role_text:
        role_text = lead.strip(".")
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
    # A firm that writes its bio slugs for search engines puts the job on the end of them:
    # mullenandmullen.com publishes /about/regis-l-mullen-attorney/, and the word attorney is in
    # the vocabulary that rejects a slug, so all three of its lawyers were unreachable and the
    # firm read as naming nobody. Peeling one trailing job word leaves the name behind it, and
    # the page is still fetched and still named from its own heading.
    tokens = [t for t in slug.split("-") if t]
    if len(tokens) > 2 and tokens[-1].lower() in ("attorney", "attorneys", "lawyer", "lawyers",
                                                  "esq", "bio", "profile", "abogado", "abogada"):
        tokens = tokens[:-1]
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
        # Never a person, in either pass. The roster of a firm that publishes a page per
        # neighbourhood links forty of them, and their anchor text is the neighbourhood.
        if NOT_A_BIO_PATH.search(path):
            return
        if anchor_name is None:
            # A bio under a section whose name carries a number, which WordPress adds when a
            # page slug is already taken: Redmond Law Firm publishes its one attorney at
            # /staff-2/cornelius-redmond/ and links it "View Profile", so neither the address
            # test nor the anchor text reached it and a firm with 820 reviews read as naming
            # nobody on an attorneys page it titled "The Attorney".
            segs = [s for s in path.split("/") if s]
            parent = re.sub(r"-\d+$", "", segs[-2]).lower() if len(segs) > 1 else ""
            in_roster = parent in ROSTER_SECTIONS and slug_reads_as_a_name(path)
            if not re.search(ATTORNEY_PATTERN, path) and not in_roster:
                return
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
    r"managing attorney|supervising attorney|senior attorney|staff attorney|"
    r"senior associate|associate attorney|associate|attorney at law|trial attorney|attorney|"
    r"paralegal|law clerk|legal assistant|case manager|office manager|"
    r"intake specialist|client relations|founder)\b", re.I)


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


# Every word a job title is made of. A short element whose every word is on this list is a job
# title and nothing else: "Supervising Paralegal", "Case Manager Assistant", "Receptionist".
#
# Matching against a list of whole titles was the first attempt, and it read four roles off a
# roster of thirty-nine that prints one beside every name: a firm writes "Case Manager
# Assistant", and no list of whole titles is ever long enough. A vocabulary of the words they
# are made of is, and what gets stored is still the firm's own wording.
ROLE_PHRASE_WORDS = ROLE_WORDS | {
    "case", "manager", "managers", "assistant", "assistants", "bilingual", "secretary",
    "supervisor", "administrator", "accountant", "billing", "records", "medical", "liaison",
    "paraprofessional", "counselor", "staff", "law",
}

# Letters a firm prints with a title, which are a qualification rather than part of the job.
# Carrion's chief operating officer is published as "RN, BSN Chief Operating Officer": she is a
# nurse running the practice, and the two credentials pushed the title past the word limit and
# left her with no role at all.
CREDENTIAL_WORDS = {"rn", "bsn", "msn", "lpn", "np", "jd", "llm", "md", "phd", "mba", "cpa",
                    "esq", "esquire", "ma", "ms", "mpa", "cp", "acp"}


def reads_as_role(text):
    """Is this short piece of text a job title and nothing else? Returns it, or None.

    The firm's own wording, tidied only where the page is styled in one case: a roster set in
    capitals says "OF COUNSEL" about a person whose title is Of Counsel.
    """
    words = [w for w in re.split(r"[\s,/&]+", text or "") if w]
    while words and words[0].lower().strip(".") in CREDENTIAL_WORDS:
        words = words[1:]
    while words and words[-1].lower().strip(".") in CREDENTIAL_WORDS:
        words = words[:-1]
    if not 1 <= len(words) <= 4:
        return None
    if not all(w.lower().strip(".") in ROLE_PHRASE_WORDS for w in words):
        return None
    return text.title() if text.isupper() or text.islower() else text


def role_on_bio(html):
    """The role a bio page prints beside its own heading, in an element of its own.

    Carrion Accident & Injury Attorneys puts the title above the name and in a separate
    element: "Managing Attorney" then "Robert Astrachan, Esq.", "Case Manager" then "Mafer
    Moran". Reading only the heading left all thirty-nine of its people with no role, so the
    case manager and the chemical engineer would have been published beside the managing
    attorney with nothing to tell them apart.

    Only an element whose entire text is a role counts, and only within reach of the heading.
    A page whose navigation says "Injury Attorneys" is not stating anybody's job.
    """
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S | re.I)
    if not m:
        return None
    near = html[max(0, m.start() - 800):m.end() + 400]
    for chunk in re.finditer(r"<(?!a[\s>])(\w+)[^>]*>([^<>]{3,60})</\1>", near, re.I):
        text = unescape(re.sub(r"\s+", " ", chunk.group(2))).strip(" |:-–—")
        role = reads_as_role(text)
        if role:
            return role
    return None


def collect(domain, verbose=False, record=None):
    # The staging record already knows which host answered, because crawl_public followed the
    # redirects and wrote it down. Asking the bare domain again cost Feron Poleon LLP its whole
    # roster: its site is on the www host, this returned "home returned None", and a firm with
    # three named lawyers read as naming nobody.
    origin = (record or {}).get("canonical_origin") or https_origin(domain)
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
    # The about page, when the firm keeps its roster on it. Nothing in its address says
    # "attorneys", so neither the sitemap pass nor the link pass finds it, and seven of the
    # twenty-five firms in one New York run read as naming nobody: Shalom Law heads
    # /about-us/ "Our Team" and lists thirteen people under "Meet the Team", and Elliot
    # Ifraimoff & Associates lists eight attorneys under "Our Team" on /about-our-law-firm/.
    # Failing G5 for those firms would have been our mistake published as theirs.
    #
    # The page has to say so itself. An about page that is a paragraph about the firm is not a
    # roster, and this asks for the words a firm puts above a list of its people.
    if not index_url:
        about = (record or {}).get("pages_found", {}).get("about")
        if about and rp.can_fetch(UA, about):
            status, about_html, about_final = fetch(about)
            time.sleep(DELAY)
            if status == 200 and about_html and re.search(
                    r"\b(?:our team|meet the team|meet our team|our attorneys|our lawyers|"
                    r"meet our attorneys|meet our lawyers|nuestro equipo)\b",
                    strip_tags(about_html), re.I):
                index_url = about_final or about
                if verbose:
                    print("      no attorney index; the about page names a team: %s" % index_url)
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
    # And from the home page, because a firm with no index at all still links its people
    # somewhere. Mullen & Mullen heads every bio page with the single word "attorney", so the
    # page names nobody and the only place the names appear is the home page, which links them
    # as "Attorney Regis L. Mullen". These entries are read only for a URL we actually fetched
    # as a bio, so an anchor pointing anywhere else is never consulted.
    bio_candidates(home, origin, index_final or origin, anchor_names, anchor_roles)
    # Both lists, seeded first. It used to be one or the other, and the seeded list wins when
    # it exists: Seitelman Law's fifteen seeded "bio pages" are the fifteen staff photographs
    # WordPress publishes as attachment pages under /our-team/, every one of which redirects to
    # the roster page, so the crawler read one page heading fifteen times and the firm came
    # back naming nobody. Its roster menu links a real bio per person. Neither list is
    # reliable alone and reading the union of them costs a handful of fetches.
    linked = bio_candidates(index_html, origin, index_final) if index_html else []
    bios = list(dict.fromkeys([u.split("?")[0].rstrip("/") for u in seeded_bios + linked]))
    if verbose:
        print("      %d bio page(s) to read (%s)"
              % (len(bios), "from sitemap" if seeded_bios else "from index links"))

    # A single bio page reached directly (no index of its own) still counts.
    if not bios and not index_html:
        return {"error": "no bio pages found", "index_url": index_final}
    # The index page's own heading, whenever it names somebody. At a firm with one lawyer the
    # index and the bio are the same page: brianjlevy.com heads /attorney/levy-brian-j/ with
    # "Brian J. Levy" and links his law school and his professional associations off it, and
    # reading this heading only when that page linked nothing else lost him the moment the
    # crawler started following both lists of bios.
    if index_html:
        name, role = split_name_and_role(h1_of(index_html))
        name = normalise_case(name)
        if looks_like_a_person(name):
            seen_names.add(name.casefold())
            result["attorneys"].append({"name": name, "source_url": index_final,
                                        "bar_number": None, "role": role or None,
                                        "role_source": ("firm bio heading" if role
                                                        else "not stated by the firm"),
                                        "name_source": "the heading of the firm's own page"})
        elif not bios:
            result["rejected"].append({"heading": h1_of(index_html), "url": index_final})
        # No return here. A roster page that links no bios still names people on itself, and
        # returning at this point skipped the reading of its own headings at the end of this
        # function: Raytsin Law publishes three attorneys as h2 headings with their titles in
        # the h3 beside them, Richard M. Kenny's firm publishes three as h3 headings, and all
        # six were lost because the page's h1 says "Attorneys" rather than a name. The loop
        # below runs over an empty list of bios and the fallback does the work.

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
        role_from = "firm bio heading" if role else None
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
            # The link text alone is not enough. A firm with a page per neighbourhood links
            # "Springfield Gardens", "Throgs Neck" and "Nassau County" off its roster, and a
            # page that does not name a person in its own heading either has to have the name
            # in its address or sit in the part of the site that holds the people. Without this
            # one Queens firm published six of its service areas as members of staff.
            bio_path = urllib.parse.urlparse(final).path
            segs = [s for s in bio_path.split("/") if s]
            in_roster_section = any(s.lower() in ROSTER_SECTIONS for s in segs[:-1])
            if not (slug_reads_as_a_name(bio_path) or in_roster_section):
                result["rejected"].append({"heading": heading, "url": final,
                                           "link_text": from_link})
                continue
            if from_link.casefold() in seen_names:
                continue
            key = final.split("?")[0].rstrip("/")
            name, name_from = from_link, "roster link text"
            role = anchor_roles.get(key) or anchor_roles.get(url.rstrip("/"))
            role_from = "firm roster listing" if role else None
        # The firm printed the title beside the heading rather than inside it.
        if not role:
            role = role_on_bio(html)
            role_from = "firm bio page" if role else None
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
            "role_source": role_from or "not stated by the firm",
            "name_source": name_from,
        })

    # The roster page itself, when following its links found nobody. Seitelman Law Offices
    # publishes fifteen people as sections of one /our-team/ page, so every "bio link" is an
    # anchor on that page: the crawler stripped the fragment, fetched the same page fifteen
    # times and rejected the same heading fifteen times. A person reading that page sees
    # fifteen names, so this reads the page's own headings, which is the last thing tried and
    # only where the structural path came back empty.
    #
    # Anything on that page ending in "Esq." is read whether or not names were found, because
    # the abbreviation is the firm asserting a lawyer and nothing else uses it. Kerner Law
    # Group builds its legal team page out of unstyled divs and publishes "Stuart M. Kerner,
    # Esq." and four more in them; Shalom Law heads its team list "Jonathan Shalom, Esq." and
    # its own menu links four service-area pages whose text reads like a name, which is enough
    # to make the roster look found and leave its one attorney unread. Reading every div would
    # have published both firms' Google reviewers as their staff instead.
    if index_html:
        esq = []
        for m in re.finditer(r"<(\w+)[^>]*>([^<>]{4,200})</\1>", index_html, re.I):
            text = re.sub(r"\s+", " ", unescape(strip_tags(m.group(2)))).strip()
            if re.search(r",\s*Esq\.?$", text, re.I):
                esq.append(text)
        headings = list(esq)
        if not result["attorneys"]:
            headings += [re.sub(r"\s+", " ", unescape(strip_tags(m.group(2)))).strip()
                         for m in re.finditer(r"<(h[2-5]|strong|b)[^>]*>(.*?)</\1>",
                                              index_html, re.S | re.I)]
        for i, heading in enumerate(headings):
            name, role = split_name_and_role(heading)
            name = normalise_case(name)
            if not looks_like_a_person(name) or name.casefold() in seen_names:
                continue
            # The title in the heading after the name, which is how a page built out of
            # headings says it: Raytsin Law sets each name as an h2 and the title as the h3
            # under it, so the role is never in the same element as the person it belongs to.
            if not role and i + 1 < len(headings):
                role = reads_as_role(headings[i + 1])
            seen_names.add(name.casefold())
            result["attorneys"].append({
                "name": name, "source_url": index_final,
                "bar_number": None,
                "role": role or None,
                "role_source": "firm roster listing" if role else "not stated by the firm",
                "name_source": "the roster page's own headings",
            })
        if result["attorneys"]:
            result["from_roster_page"] = len(result["attorneys"])

    # The page's own title, last of all. Beck Law names nobody in the body of its about page
    # and titles that page "About David Beck, Esq.", which is the firm stating who its attorney
    # is on the page it wrote for the purpose. The same reading a bio page already gets, and
    # the person test is what keeps "About Us" and "Our Team" out.
    if not result["attorneys"] and index_html:
        head = re.search(r"<title[^>]*>(.*?)</title>", index_html, re.I | re.S)
        for text in [unescape(strip_tags(head.group(1))).strip() if head else "",
                     meta(index_html, "og:title") or ""]:
            name, role = split_name_and_role(text)
            name = normalise_case(name)
            if looks_like_a_person(name):
                result["attorneys"].append({
                    "name": name, "source_url": index_final, "bar_number": None,
                    "role": role or None,
                    "role_source": "firm roster listing" if role else "not stated by the firm",
                    "name_source": "the title of the firm's own team page",
                })
                break
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
