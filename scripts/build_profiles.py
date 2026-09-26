#!/usr/bin/env python3
"""
Turns .crawl/ staging records into draft firm profiles — step 8 of the per-firm pipeline.

Drafts land in .crawl/profiles/<slug>.json, NOT in src/data/firms/. Two things have to happen
before a draft becomes a profile, and neither is scriptable:

  1. The About block has to be written. Every draft ships with `about: []` and the material for
     writing it under `_review.about_material`. Copying the firm's own JSON-LD description was
     the obvious shortcut and it is wrong: on this batch those descriptions carried
     self-reported recovery totals ("$1 billion recovered"), one was in Russian, and one
     described a California practice. The content plan puts a human review on this block for
     exactly that reason.
  2. Attorney names have to be filled in. `attorneys: []` here, because those names drive
     G1/G2 against the state bar registry and a mis-parsed name is worse than a missing one.
     Bio page URLs are in `_review.attorney_page_urls`.

Everything else is derived from measured evidence, and every value carries where it came from.
Nothing is inferred: a firm that does not state a fee model gets "Not stated", not "Contingency"
because personal injury firms usually work that way.

Status is always `listed`. Gates G1, G2, G4 need sources this pipeline does not have yet, so no
draft can honestly claim certification.

Usage:
    python scripts/build_profiles.py                     # every staging record
    python scripts/build_profiles.py --domains perecman.com
"""
import argparse
import glob
import io
import json
import pathlib
import re
import sys
import html as html_entities
import unicodedata

from lib_describe import describe

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / ".crawl" / "profiles"
# The cohort file carries its own market, so opening a city means writing one of those
# rather than editing this. The default is the cohort that existed before there were two.
DEFAULT_COHORT = "ny-personal-injury"
# The practice comes off the cohort file, which has carried a "practice" slug since the first
# one. Only the display name lives here, and an unknown slug stops the run rather than writing
# a profile with a slug where its name should be. Keep in step with src/data/practices.ts: a
# practice missing there gets no hub page, and the profile would link into nothing.
PRACTICE_NAMES = {
    "personal-injury": "Personal Injury",
    "workers-compensation": "Workers' Compensation",
    "real-estate": "Real Estate",
    "family-law": "Family Law",
}

# Words that are titles, not firm names. A GBP display name like "New York personal injury
# lawyer" is a page title someone typed into the profile, and must not become a firm's name.
# A page title somebody typed into a name field. The first version of this listed New York and
# its own practice words, which worked for one city and silently stopped working at the next:
# "Houston Personal Injury Lawyer" sat in a firm's own JSON-LD, ahead of "Attorney Brian White"
# in the same document, and was published as the firm's name.
#
# So the test is what the string is made of rather than which city it names. A name is a title
# when every word in it is a place, a practice or a legal-services noun, because a firm's name
# has a proper noun in it: somebody's surname, or a coined word. "Montlick Injury Attorneys" and
# "Alexander Shunnarah Trial Attorneys" keep every word; "Car Accident Attorney" and "Houston
# Personal Injury Lawyer" have nothing in them that belongs to one firm rather than a thousand.
GENERIC_NAME_WORD = re.compile(
    r"^(the|and|of|in|at|for|a|an|&|"
    r"law|laws|legal|firm|firms|group|office|offices|practice|associates|partners|team|"
    r"lawyer|lawyers|attorney|attorneys|counsel|esq|abogado|abogados|de|en|"
    r"personal|injury|injuries|accident|accidents|trial|trials|compensation|malpractice|"
    r"car|auto|truck|motorcycle|pedestrian|bicycle|construction|premises|"
    r"best|top|free|now|com|net|"
    r"new|york|nyc|manhattan|brooklyn|queens|bronx|buffalo|miami|houston|atlanta|dallas|"
    r"boston|baltimore|portland|naples|lakeland|tampa|indiana|"
    r"ny|fl|tx|ga|ma|md|or|in|"
    r"llp|llc|pc|pllc|pa|plc|inc)$", re.I)


def NOT_A_NAME_match(value):
    words = [w for w in re.split(r"[\s,.]+", (value or "").strip()) if w]
    return bool(words) and all(GENERIC_NAME_WORD.match(w) for w in words)


class _NotAName:
    """Kept callable as `.match` so the three call sites below read unchanged."""
    @staticmethod
    def match(value):
        return NOT_A_NAME_match(value)


NOT_A_NAME = _NotAName


def slugify(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^\w\s-]", "", value).strip().lower()
    return re.sub(r"[\s_-]+", "-", value)


def initials(name):
    # Ampersands and legal suffixes are noise; take the first letters of the real words.
    words = [w for w in re.split(r"[\s,]+", re.sub(r"[&.]", " ", name))
             if w and w.lower() not in ("and", "the", "of", "llp", "llc", "pc", "plc", "pllc", "law",
                                        "firm", "group", "associates", "attorneys", "lawyers", "injury")]
    if not words:
        return name[:2].upper()
    # The tile wants two characters. One surviving word ("The Perecman Firm") gives its first
    # two letters rather than a lone initial.
    if len(words) == 1:
        return words[0][:2].upper()
    return "".join(w[0] for w in words[:2]).upper()


def format_phone(raw):
    """US numbers render as (212) 977-7033. JSON-LD often publishes them as bare digits."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        return "(%s) %s-%s" % (digits[:3], digits[3:6], digits[6:])
    return (raw or "").strip()


def json_ld_business(rec):
    def walk(n):
        if isinstance(n, dict):
            yield n
            for g in (n.get("@graph") or []):
                yield from walk(g)
    out = []
    for blk in rec.get("json_ld", []):
        for n in walk(blk):
            t = n.get("@type")
            t = t if isinstance(t, str) else "+".join(t) if isinstance(t, list) else ""
            if any(k in t for k in ("LegalService", "Attorney", "LocalBusiness", "Organization", "LawFirm")):
                out.append(n)
    return out


def clean(value):
    """Site markup leaks entities into names: "Stephen Bilkis &amp; Associates"."""
    return html_entities.unescape((value or "").strip())


def pick_name(rec):
    """The firm's own name, with its provenance. Falls back down a ranked list of sources."""
    for n in json_ld_business(rec):
        # Trimmed like a listing name, because a firm that puts its page title into its own
        # JSON-LD has published a title rather than a name. Opening three markets turned up
        # "Alex Hanna Law | Miami, FL", "Rodney Jones Law Group | Houston Personal Injury Lawyer
        # | Houston Car Accident Lawyer" and "Ryan Nguyen Attorney at Law | Abogado Ryan", all
        # from structured data. The trim was only ever applied to the Google display name, on
        # the assumption that structured data would carry the name proper. It does not always.
        v = trim_listing_tail(clean(n.get("name")))
        if v and not NOT_A_NAME.match(v):
            return v, "JSON-LD %s.name" % (n.get("@type") if isinstance(n.get("@type"), str) else "business")
    for l in rec.get("places", {}).get("listings", []):
        v = trim_listing_tail(clean(l.get("name")))
        if v and not NOT_A_NAME.match(v):
            return v, "Google Business Profile display name"
    for c in rec.get("name_candidates", []):
        if c["from"] == "og:site_name" and not NOT_A_NAME.match(clean(c["value"])):
            return clean(c["value"]), "og:site_name"
    return None, None


LISTING_TAIL = re.compile(r"\s+[–—-]\s+.*$|\s*[(|].*$")


def trim_listing_tail(name):
    """A Google listing name minus the keyword phrase a firm appended to it.

    Firms optimise that field, so it reads "Lopez & Humphries, P.A. - Car Accident Lawyers" and
    "Shulman & Hill - Manhattan Personal Injury Lawyer". Published as the firm's name it is the
    name plus an advertisement, and it lands in the slug, which is a URL and permanent.

    The same rule src/lib/labels.ts applies to office labels, kept in step by hand because one is
    Python at build time and the other TypeScript at render time. Only cut at a separator: a firm
    genuinely called "Rice, Murtha & Psoras" keeps every word of it.
    """
    if not name:
        return name
    cut = LISTING_TAIL.sub("", name).strip(" ,-|")
    # Never trim away the firm. If what is left is too short to be a name, the separator was part
    # of the name rather than a joint in it.
    return cut if len(cut) >= 4 else name


# Navigation, not a statement about fees. A crawl window that catches these caught a menu.
FEE_FURNITURE = re.compile(
    r"learn more|click here|read our|get answers|contact us|free case (?:review|evaluation)|"
    r"call us|se habla|menu|home\b|past results do not guarantee", re.I)


def fee_sentence(quote, priced=False):
    """The firm's own sentence about its fees, or nothing.

    `priced` says the window came from a fee finding by scripts/check_domestic.py or
    scripts/check_transaction.py rather than from a keyword sweep of the whole site. Those two
    read a fee page, matched a fee pattern and kept the source URL, so a money figure inside the
    sentence is a price and not a verdict from a results page. Without it the guard below threw
    away the only real fee sentences in two practices: a firm publishing "Flat fees for a NY
    uncontested divorce are: $1,500" had that read as a settlement and dropped.

    What was stored instead was a 190-character window cut around a keyword, which meant 35 of 37
    profiles published something starting mid-word: "rsonal Attention Trusted Legal Support",
    "ored to discuss your case with you". Displayed under the word Contingency on the profile of a
    certified firm, and quoted as the evidence for a fee-transparency medal.

    So the window has to be a sentence before it is published. It has to start where a sentence
    starts, end where one ends, be short enough to be one, and carry none of the vocabulary that
    means a menu was scraped. Anything else is dropped: the fee model is a separate signal and
    survives on its own, and no statement is better than a fragment attributed to the firm.
    """
    text = re.sub(r"\s+", " ", (quote or "")).strip()
    if not text:
        return None
    # Start at the first full sentence in the window, since the window rarely begins at one.
    m = re.search(r"[A-Z][^.!?]{15,200}[.!?]", text)
    if not m:
        return None
    sentence = m.group(0).strip()
    if len(sentence) > 150 or FEE_FURNITURE.search(sentence):
        return None
    # A sentence about fees, rather than the sentence that happened to sit beside the word.
    if not re.search(r"fee|cost|charge|paid|payment|percent|contingen|owe|unless we win",
                     sentence, re.I):
        return None
    # These blobs carry no sentence punctuation, so "from a capital to the first full stop" ran
    # across four menu items and a settlement figure before it found one. Three of these tells
    # were enough to let "Settlement Leg Amputation $3,167,000 Settlement Scaffolding Fall" and
    # "Attention Trusted Legal Support Florida legal support" through as fee statements.
    # Any money at all, written any way. The first version asked for four digits and let
    # "NYC We have won over $1 BILLION for accident injury" through as a fee statement.
    if not priced and re.search(r"\$\s*[\d.,]+\s*(?:billion|million|thousand|k\b)?",
                                sentence, re.I):
        return None                      # a figure from a results page, not a fee term
    # Even on a fee page, a seven-figure number is a recovery rather than a price. Written as a
    # word or as digits: "$1 BILLION" and "$3,167,000" are both somebody's settlement.
    if priced and (re.search(r"\$\s*[\d.,]+\s*(?:billion|million)", sentence, re.I)
                   or re.search(r"\$\s*\d[\d,]*", sentence)
                   and max(int(re.sub(r"\D", "", m) or 0)
                           for m in re.findall(r"\$\s*\d[\d,]*", sentence)) >= 1000000):
        return None
    if re.search(r"(?:\b[A-Z][a-z]+\b[ ,]+){3,}[A-Z][a-z]+", sentence):
        return None                      # a run of Title Case words is a menu
    # Two capitalised words straight after a lowercase one is the seam where one menu item was
    # welded to the next: "...free Consultation We offer free initial consultations...". Ordinary
    # prose does this once, for a proper noun, and then carries on in lower case.
    if re.search(r"\b[a-z]+ [A-Z][a-z]+ [A-Z][a-z]+", sentence):
        return None
    # A fee statement is the firm addressing a reader. Without a person in it, the window caught
    # prose about fees in general rather than this firm's terms.
    #
    # Unless it carries a price. "Flat fees for a NY uncontested divorce are: $1,500 with no
    # children and $2,500 with children" names nobody and is the plainest fee disclosure in the
    # directory, and this guard was dropping it. A figure on a fee page is this firm's figure:
    # general prose about what a divorce costs does not quote a number and call it a fee, and
    # scripts/check_domestic.py moves the sentences that do to market_rate_quoted before they
    # reach here.
    priced_here = priced and re.search(r"\$\s*[\d.,]+", sentence)
    if not priced_here and not re.search(r"\b(?:we|our|us|you|your|clients?)\b", sentence, re.I):
        return None
    return sentence


def plausible_phone(raw, verified=False):
    """Reject placeholders. Cellino Law publishes (888) 888-8888 in its own JSON-LD, and a
    made-up number on a profile is worse than no number: someone would dial it.

    `verified` is the whole subtlety. A body of one repeated digit is the shape of a placeholder
    and also the shape of a vanity line a firm paid for, and the rule that rejected both threw
    out William Mattar, whose number is 444-4444 and whose entire advertising is that number.
    What separates the two is who says so: Google verifies a phone number before it appears on a
    business profile, and nobody verifies a firm's own markup. So a repeated-digit number is
    trusted from a verified listing and refused from a page we scraped.
    """
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        return False
    body = digits[3:]                       # everything after the area code
    if len(set(body)) == 1 and not verified:  # 888-8888, 000-0000
        return False
    # Never, whoever claims it: 555-01xx is reserved for fiction and the rest are keyboard runs.
    if body in ("1234567", "0000000") or body.startswith("5550"):
        return False
    return True


def pick_phone(rec):
    """The firm's own stated number first — often a vanity line it wants clients to use — then
    the number Google verified on the business profile."""
    for n in json_ld_business(rec):
        v = str(n.get("telephone") or "").strip()
        if v and plausible_phone(v):
            return v, "JSON-LD telephone"
    for l in rec.get("places", {}).get("listings", []):
        if l.get("phone") and plausible_phone(l["phone"], verified=True):
            return l["phone"], "Google Business Profile"
    for p in rec.get("phones", []):
        if plausible_phone(p["value"]):
            return p["value"], p["source_url"]
    return None, None


def build_offices(rec):
    """Offices come from Google Business Profile: a listing is a verified physical location."""
    offices = []
    for i, l in enumerate(rec.get("places", {}).get("listings", [])):
        if not l.get("address"):
            continue
        label = clean(l.get("name")) or "Office"
        if NOT_A_NAME.match(label):
            # The listing's own name is a page title; describe it by locality instead.
            city = re.sub(r",\s*[A-Z]{2}\s+\d{5}.*$", "", l["address"]).split(",")[-1].strip()
            label = city or "Office"
        offices.append({
            "label": label,
            "address": l["address"],
            "by_appointment": False,
            "is_hq": i == 0,
            "source_url": l.get("maps_uri") or "",
        })
    return offices


def build(rec, cohort_lookup, market, cohort_id, practice):
    name, name_source = pick_name(rec)
    if not name:
        # The cohort file's name, which a person wrote while deciding the firm belonged in this
        # market. Senft Legal publishes no JSON-LD, no Google name we could match and no
        # og:site_name, so the draft was skipped entirely over a field that was sitting in the
        # cohort all along. It is the last resort and not the first: a name the firm publishes
        # about itself is better evidence than a name we typed.
        fallback = (cohort_lookup.get(rec["domain"]) or {}).get("name")
        if fallback and not NOT_A_NAME.match(fallback):
            name, name_source = fallback, "the cohort file, written by hand"
    if not name:
        return None, "no usable firm name in JSON-LD, GBP or og:site_name"

    phone, phone_source = pick_phone(rec)
    if not phone:
        return None, "no phone number published"

    claims = rec.get("claims", {})
    places = rec.get("places", {})
    agg = places.get("aggregate", {})

    languages = ["English"]
    if "se_habla_espanol" in claims or rec.get("spanish_signals"):
        # The site is written in English, so the field names the language in English. A
        # profile that read "English and Español" mixed the two in one sentence.
        languages.append("Spanish")

    availability = []
    if "available_24_7" in claims:
        availability.append("24/7 intake line")
    if "hospital_visits" in claims:
        availability.append("Hospital & home visits")

    # A fee model is only stated if the firm states it. No defaulting to contingency.
    #
    # And contingency is not the only thing a firm can state. A transactional practice charges a
    # flat fee or an hourly rate, so reading only the contingency claim reported "Not stated"
    # for all twenty firms in the first real estate market, five of which say plainly that their
    # engagements are priced as flat fees. scripts/check_transaction.py found those words; this
    # just believes them.
    tx = rec.get("transaction") or {}
    # And the same again for a domestic relations practice, with a stronger reason. Rule
    # 1.5(d)(5)(i) forbids a contingent fee in a matrimonial matter outright, so reading only the
    # contingency claim reported "Not stated" for all forty-two family law firms in the directory,
    # including the four that publish a price. The New York City and Buffalo passes each patched
    # this by hand in a scratchpad script; it belongs here, so the next family market does not
    # need one. scripts/check_domestic.py found the words.
    dm = rec.get("domestic") or {}
    if "contingency" in claims:
        fee_model = "Contingency"
    elif tx.get("flat_fee"):
        fee_model = "Flat fee"
    elif dm.get("hourly"):
        fee_model = "Hourly rate published"
    elif dm.get("retainer_figure"):
        fee_model = "Retainer figure published"
    elif dm.get("flat_fee"):
        fee_model = "Flat fee published"
    elif dm.get("fee_terms"):
        fee_model = "Billing terms published, no figure"
    else:
        fee_model = "Not stated"
    built_offices = build_offices(rec)

    reviews = {"quotes": []}
    if agg.get("rating_weighted") and agg.get("review_count_total"):
        reviews["google"] = {
            "rating": agg["rating_weighted"],
            "count_label": "{:,}".format(agg["review_count_total"]),
            "source": "Google Business Profile via Places API. %d listing%s, counts summed and "
                      "rating weighted by count" % (agg["listing_count"],
                                                    "" if agg["listing_count"] == 1 else "s"),
            "fetched_at": places.get("measured_at"),
        }

    digital = {}
    trust = rec.get("trust_pages") or {}
    if trust:
        digital["trust_pages"] = trust
    digital["schema_detected"] = bool(rec.get("schema_detected"))
    if rec.get("psi"):
        digital["psi"] = rec["psi"]
    ah = cohort_lookup.get(rec["domain"])
    if ah:
        # The cohort file holds four Ahrefs metrics; digital.ahrefs needs the full set, so it
        # stays out until enrich_ahrefs writes it. D2 reads pending rather than partial.
        digital["_ahrefs_partial_from_cohort"] = ah

    def gate(passed, evidence, source):
        return {"pass": bool(passed), "evidence": evidence, "source": source,
                "checked_at": places.get("measured_at") or rec.get("fetched_at")}

    g5 = rec.get("g5_evidence", {})
    gates = {
        "G1": gate(False, *registry_wording(market)),
        "G2": gate(False, *discipline_wording(market)),
        "G3": gate(False, *entity_wording(market, agg.get("listing_count", 0))),
        "G5": gate(False,
                   "HTTPS reachable: %s; contact method published: %s; attorney names not yet "
                   "extracted from bio pages" % (g5.get("https_reachable"), g5.get("contact_method")),
                   "public crawl (partial)"),
        "G6": gate(False,
                   "%s public reviews across %d Google listing%s, above the 10 minimum; time in "
                   "operation still to confirm" % ("{:,}".format(agg.get("review_count_total", 0)),
                                                   agg.get("listing_count", 0),
                                                   "" if agg.get("listing_count") == 1 else "s"),
                   "Google Places API (partial)"),
    }

    firm = {
        "slug": slugify(name),
        # Carried onto the profile because the engine has to know: every sub-factor read
        # from a firm's own site is unmeasurable for this firm, and scoring those zero
        # would publish our inability to look as a finding about the practice.
        **({"site_blocked": rec["site_blocked"]} if rec.get("site_blocked") else {}),
        "name": name,
        "initials": initials(name),
        "website": rec.get("pages_found", {}).get("home", "https://" + rec["domain"]),
        "domain": rec["domain"],
        "phone": format_phone(phone),
        "status": "listed",
        # The link to the page the firm publishes about this practice, where check_practice.py
        # found one. It was left out of the first version, and the audit then reported thirteen
        # fresh Indiana profiles for the same missing evidence that apply_practice.py had just
        # backfilled across a hundred and eleven older ones.
        "practices": [dict(practice, **(
            {"source_url": evidence["url"], "checked_at": evidence.get("checked_at")}
            if (evidence := ((rec.get("practice_evidence") or {}).get(practice["slug"]) or {}))
            .get("url") else {}))],
        "market": dict(market),
        "offices": built_offices,
        "attorneys": [],
        "languages": languages,
        "fee_model": fee_model,
        # What the firm publishes about the transaction, where the practice has no outcomes.
        # scripts/score.py reads this for pillar B; see scripts/check_transaction.py.
        **({"transaction": rec["transaction"]} if rec.get("transaction") else {}),
        # The same for a domestic relations practice, which also has no outcomes to read and a
        # different pillar B. promote_measurements.py copies this onto a published profile; a
        # new draft was going out without it and getting it on the next promote.
        **({"domestic": rec["domestic"]} if rec.get("domestic") else {}),
        "free_consultation": "free_consultation" in claims,
        "availability": availability,
        # Assembled from the fields above rather than left for a person to write. See
        # lib_describe: it states nothing no column carries, and attributes to the firm
        # everything the firm says about itself.
        "about": describe(name, market, built_offices, [dict(practice)], languages,
                          fee_model, claims, availability),
        "reviews": reviews,
        "results": [],
        "digital": digital,
        "gates": gates,
        "cohort_id": cohort_id,
        "faq": [],
        "_review": {
            "name_source": name_source,
            "phone_source": phone_source,
            "about_material": {
                "claims": claims,
                "json_ld_descriptions": [n["description"] for n in json_ld_business(rec)
                                         if n.get("description")],
                "pages": rec.get("pages_found", {}),
            },
            "attorney_page_urls": rec.get("attorney_page_urls", []),
            "blocking": [
                "about[] was assembled from the fields above, not written. Read it before "
                "publishing: it should say nothing the record does not carry.",
                "attorneys[] is empty. Names must be read from the bio pages, not guessed",
                "fee_statement omitted" if fee_model == "Not stated" else None,
            ],
        },
    }
    # The firm's own sentence about its price, from whichever pillar B measured this practice
    # with. Reading only the injury and real estate blocks meant no family law firm in the
    # directory could have a fee statement at all, so E1's two points for publishing one were
    # out of reach for forty-two firms whatever they published, and the profile of a firm
    # advertising "Transparent Flat Fees" said it had published nothing.
    statement = fee_sentence(claims.get("contingency", {}).get("quote"))
    for block, keys in ((tx, ("flat_fee", "price")),
                        (dm, ("hourly", "retainer_figure", "flat_fee", "fee_terms"))):
        for key in keys:
            if statement:
                break
            if block.get(key):
                statement = fee_sentence(block[key].get("quote"), priced=True)
    if statement:
        firm["fee_statement"] = statement
    firm["_review"]["blocking"] = [b for b in firm["_review"]["blocking"] if b]
    return firm, None


# Which states we can actually check, and what to say about the ones we cannot.
#
# New York publishes its attorney register and its corporations register as open data, so a
# pending gate there is a queued job. Maryland publishes neither in a queryable form and its
# business search sets Disallow: / , so the gate is not pending, it is unavailable from any source
# we have. Telling a reader "not yet checked" about a check that has no source is the same shape
# of claim as a score we never measured.
OPEN_REGISTER_STATES = {"NY"}

# The states where a script in this repo reads a business register and can settle G3. Everywhere
# else the gate has no source, and saying so is the whole point of this set.
#
# G1 and G2 have had a per-state wording since Baltimore, and G3 never did: every new market was
# written "Secretary of State registration still to confirm", which is pending, and a pending gate
# holds a firm at Listed. That is correct in New York, Florida and Texas, where a check really is
# coming. In a state with no readable register it is a promise nothing can keep, and it cost
# Houston seventy five firms until the Texas register was read today.
#
# Illinois, Pennsylvania and Nevada were checked on 2026-09-26 before opening those markets, and
# none of the three can be read: apps.ilsos.gov and file.dos.pa.gov both answer an automated
# request with a 403, and Nevada's register moved to a portal behind Imperva. Bot protection is
# never worked around, so these are facts about the states in the same way Georgia's are.
ENTITY_REGISTER_STATES = {"NY", "FL", "TX"}


def registry_wording(market):
    if market["state"] in OPEN_REGISTER_STATES:
        return ("Bar registry not yet checked for this firm's attorneys", "pending")
    return (f"{market['state_name']} does not publish an attorney register we can query, so "
            "licensure is not verified here. The state's own attorney search is the place to "
            "check it.", "no queryable source")


def discipline_wording(market):
    if market["state"] in OPEN_REGISTER_STATES:
        return ("Disciplinary history not yet checked", "pending")
    return (f"{market['state_name']} does not publish a disciplinary register we can query.",
            "no queryable source")


def entity_wording(market, listings):
    """G3's opening line, which has to know whether a register check is actually coming."""
    where = "%d physical location%s verified on Google Business Profile" % (
        listings, "" if listings == 1 else "s")
    if market["state"] in ENTITY_REGISTER_STATES:
        return ("%s; Secretary of State registration still to confirm" % where,
                "Google Places API (partial)")
    return ("%s. %s publishes no business register we are able to query, so the registration "
            "itself is not verified here. The state's own business search is the place to check "
            "it." % (where, market["state_name"]),
            "no queryable source")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains", help="comma-separated; default is every file in .crawl/")
    ap.add_argument("--cohort", default=DEFAULT_COHORT,
                    help="cohort id under src/data/cohorts; it carries the market")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    cohort_path = ROOT / "src/data/cohorts" / (args.cohort + ".json")
    if not cohort_path.exists():
        print("no cohort file at %s" % cohort_path, file=sys.stderr)
        return 2
    with io.open(cohort_path, encoding="utf-8") as fh:
        cohort = json.load(fh)
    cohort_lookup = {f["domain"]: f for f in cohort["firms"]}
    market = cohort["market"]
    slug = cohort["practice"]
    if slug not in PRACTICE_NAMES:
        print("cohort names practice %r, which has no display name in PRACTICE_NAMES "
              "and no page in src/data/practices.ts" % slug, file=sys.stderr)
        return 2
    practice = {"slug": slug, "name": PRACTICE_NAMES[slug], "primary": True}
    print("cohort %s · %s · %s, %s"
          % (args.cohort, practice["name"], market["city"], market["state"]))

    if args.domains:
        files = [ROOT / ".crawl" / (d.strip() + ".json") for d in args.domains.split(",") if d.strip()]
    else:
        # The cohort's own domains, not every file in the staging directory. Staging holds every
        # firm ever crawled, across markets and practices, so the glob built a personal injury
        # firm a profile saying "Workers' Compensation" the moment there were two cohorts. It
        # also swept up the candidate lists and the run logs, which are not firm records at all.
        files = [ROOT / ".crawl" / (f["domain"] + ".json") for f in cohort["firms"]]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    built = skipped = 0
    for path in files:
        if not path.exists() or path.parent.name == "profiles":
            continue
        with io.open(path, encoding="utf-8") as fh:
            rec = json.load(fh)
        if not rec.get("domain"):
            continue
        # A site we could not read is usually the end of it. A site that refuses our crawler is
        # not: scripts/seed_from_places.py has already built the offices, the phone and the
        # reviews from listings the firm verified itself, and none of that came from the site.
        # The profile is thinner and says so, rather than the firm simply not existing here.
        if not rec.get("https_ok") and not (rec.get("site_blocked") and rec.get("places")):
            print("%-24s skipped — site unreachable" % rec["domain"])
            skipped += 1
            continue

        # A firm that does not hold itself out for this practice does not belong in this cohort,
        # and this used to build a draft for it anyway. Opening three markets at once produced
        # twelve of them, and among them an immigration firm whose own title says so, a site
        # returning 404 on every path, and a domain now serving an Indonesian gambling brand
        # under the name "Naga303". None of those would have been published, because a draft is
        # not a profile and a person reads them first. But leaving them in the pile makes that
        # person's job the one thing a script can do reliably, and the one mistake that costs
        # most here is moving a firm into a practice it does not do.
        held = ((rec.get("practice_evidence") or {}).get(slug) or {})
        if not held.get("url"):
            print("%-24s skipped — does not publish a %s practice page: %s"
                  % (rec["domain"], slug, (held.get("why") or "not checked")[:60]))
            skipped += 1
            continue

        firm, why = build(rec, cohort_lookup, market, args.cohort, practice)
        if not firm:
            print("%-24s skipped — %s" % (rec["domain"], why))
            skipped += 1
            continue

        with io.open(OUT_DIR / (firm["slug"] + ".json"), "w", encoding="utf-8") as fh:
            json.dump(firm, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        print("%-24s %-34s %d office(s)  %s  %s"
              % (rec["domain"], firm["name"][:34], len(firm["offices"]), firm["fee_model"],
                 "reviews ok" if firm["reviews"].get("google") else "no reviews"))
        built += 1

    print("\n%d draft(s) in .crawl/profiles/ · %d skipped" % (built, skipped))
    print("Drafts are not profiles. Each needs its About block written and its attorneys filled\n"
          "in before it belongs in src/data/firms/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
