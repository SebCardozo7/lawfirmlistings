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

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / ".crawl" / "profiles"
COHORT_ID = "ny-personal-injury"
MARKET = {"city_slug": "new-york-ny", "city": "New York", "state": "NY", "state_name": "New York"}
PRACTICE = {"slug": "personal-injury", "name": "Personal Injury", "primary": True}

# Words that are titles, not firm names. A GBP display name like "New York personal injury
# lawyer" is a page title someone typed into the profile, and must not become a firm's name.
NOT_A_NAME = re.compile(r"^(new york|nyc|personal injury|injury|accident|best|top)\b.*\b"
                        r"(lawyer|attorney|law firm|lawyers|attorneys)s?$", re.I)


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
        v = clean(n.get("name"))
        if v and not NOT_A_NAME.match(v):
            return v, "JSON-LD %s.name" % (n.get("@type") if isinstance(n.get("@type"), str) else "business")
    for l in rec.get("places", {}).get("listings", []):
        v = clean(l.get("name"))
        if v and not NOT_A_NAME.match(v):
            return v, "Google Business Profile display name"
    for c in rec.get("name_candidates", []):
        if c["from"] == "og:site_name" and not NOT_A_NAME.match(clean(c["value"])):
            return clean(c["value"]), "og:site_name"
    return None, None


def plausible_phone(raw):
    """Reject placeholders. Cellino Law publishes (888) 888-8888 in its own JSON-LD, and a
    made-up number on a profile is worse than no number: someone would dial it."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        return False
    body = digits[3:]                       # everything after the area code
    if len(set(body)) == 1:                 # 888-8888, 000-0000
        return False
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
        if l.get("phone") and plausible_phone(l["phone"]):
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


def build(rec, cohort_lookup):
    name, name_source = pick_name(rec)
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
        languages.append("Español")

    availability = []
    if "available_24_7" in claims:
        availability.append("24/7 intake line")
    if "hospital_visits" in claims:
        availability.append("Hospital & home visits")

    # A fee model is only stated if the firm states it. No defaulting to contingency.
    fee_model = "Contingency" if "contingency" in claims else "Not stated"

    reviews = {"quotes": []}
    if agg.get("rating_weighted") and agg.get("review_count_total"):
        reviews["google"] = {
            "rating": agg["rating_weighted"],
            "count_label": "{:,}".format(agg["review_count_total"]),
            "source": "Google Business Profile via Places API — %d listing%s, counts summed and "
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
        "G1": gate(False, "Bar registry not yet checked for this firm's attorneys", "pending"),
        "G2": gate(False, "Disciplinary history not yet checked", "pending"),
        "G3": gate(False,
                   "%d physical location%s verified on Google Business Profile; Secretary of State "
                   "registration still to confirm" % (agg.get("listing_count", 0),
                                                      "" if agg.get("listing_count") == 1 else "s"),
                   "Google Places API (partial)"),
        "G4": gate(False, "AG, FTC and court-sanction search not yet run", "pending"),
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
        "name": name,
        "initials": initials(name),
        "website": rec.get("pages_found", {}).get("home", "https://" + rec["domain"]),
        "domain": rec["domain"],
        "phone": format_phone(phone),
        "status": "listed",
        "practices": [dict(PRACTICE)],
        "market": dict(MARKET),
        "offices": build_offices(rec),
        "attorneys": [],
        "languages": languages,
        "fee_model": fee_model,
        "free_consultation": "free_consultation" in claims,
        "availability": availability,
        "about": [],
        "reviews": reviews,
        "results": [],
        "digital": digital,
        "gates": gates,
        "cohort_id": COHORT_ID,
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
                "about[] is empty — must be written from the material above before publishing",
                "attorneys[] is empty — names must be read from the bio pages, not guessed",
                "fee_statement omitted" if fee_model == "Not stated" else None,
            ],
        },
    }
    if "contingency" in claims:
        firm["fee_statement"] = claims["contingency"]["quote"]
    firm["_review"]["blocking"] = [b for b in firm["_review"]["blocking"] if b]
    return firm, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains", help="comma-separated; default is every file in .crawl/")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    with io.open(ROOT / "src/data/cohorts" / (COHORT_ID + ".json"), encoding="utf-8") as fh:
        cohort_lookup = {f["domain"]: f for f in json.load(fh)["firms"]}

    if args.domains:
        files = [ROOT / ".crawl" / (d.strip() + ".json") for d in args.domains.split(",") if d.strip()]
    else:
        files = sorted(pathlib.Path(p) for p in glob.glob(str(ROOT / ".crawl" / "*.json")))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    built = skipped = 0
    for path in files:
        if not path.exists() or path.parent.name == "profiles":
            continue
        with io.open(path, encoding="utf-8") as fh:
            rec = json.load(fh)
        if not rec.get("https_ok"):
            print("%-24s skipped — site unreachable" % rec["domain"])
            skipped += 1
            continue

        firm, why = build(rec, cohort_lookup)
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
