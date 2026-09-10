#!/usr/bin/env python3
"""
LFL Certification Score — Methodology v1.1
Reads src/data/firms/**/*.json + src/data/cohorts/*.json, computes the score and writes it
back into each firm file under "score". Deterministic; run before `astro build`.

Automatic sub-factors (from data):  D1 (trust pages, psi), D2 (ahrefs vs cohort), D4-AI (ahrefs), E1, E3, E4, C1 (review count label).
Manual/assessed sub-factors: read from firm["assessments"][code] = {pts, source, evidence}. Missing → 0 pts, source "pending".

Guard: LFL_ENV=production fails the build if a firm has status "sample", or a *certified* firm still has
"illustrative" sub-factors.
"""
import json, os, re, sys, glob, statistics, datetime, pathlib

# The data files and this script's own output carry non-ASCII (× in cohort labels, → in tier paths).
# Windows would otherwise default to cp1252 and crash on them, so pin UTF-8 everywhere.
def read_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIRMS = sorted(glob.glob(str(ROOT / "src/data/firms/**/*.json"), recursive=True))
COHORTS = {c["id"]: c for c in (read_json(p) for p in glob.glob(str(ROOT / "src/data/cohorts/*.json")))}
PROD = os.environ.get("LFL_ENV") == "production"
TODAY = datetime.date.today().isoformat()
# Bumped with the v1.1 change that dropped A3, A4 and E2 and redistributed their points.
# Every firm's score records the version it was computed under, so this must move whenever
# the sub-factors or weights do — otherwise a score claims a methodology it did not use.
METHOD = "v2.0"

SUBS = {  # code: (pillar, label, max)
 # v1.1 dropped A3, A4 and E2. Pillar weights are unchanged (A 25, B 20, C 20, D 25, E 10) so
 # the tier thresholds and the A+B+C floor keep meaning what they meant; the freed points were
 # redistributed inside their own pillar. See the header for why each one went.
 # v2.0. Every sub-factor here is computed from a public source with no outreach. That is
 # the whole change: at v1.1, 54 of the 100 points needed somebody to phone a firm or read a
 # docket, so most of the scale sat pending on every profile and the score was reporting our
 # coverage rather than the firm. What could not be found online was removed, and the field
 # that referred to it went with it.
 #
 # Gone from v1.1: A1 clean-record depth, which wanted ten years of disciplinary history that
 # no public source carries; C4 firm responsiveness, because the Places API does not return
 # owner replies; and gate G4, which is documented at length in scripts/check_g4.py.
 "A2": ("A", "Experience", 10), "A5": ("A", "Accountability", 6),
 "A6": ("A", "Roster verifiability", 9),
 # B is Published Outcomes now, not Verified Outcomes, and it deliberately does not score
 # magnitude: scripts/crawl_results.py shows how fragile the provenance of a headline figure
 # is, since the largest number on a results page is usually a firm-wide total.
 "B1": ("B", "Results published", 6), "B2": ("B", "Specificity", 5),
 "B3": ("B", "Results disclosure", 4),
 "C1": ("C", "Authentic volume", 5), "C2": ("C", "Rating quality", 6),
 "C3": ("C", "Review recency", 5), "C5": ("C", "Complaint share", 4),
 "D1": ("D", "Website trust & experience", 7), "D2": ("D", "Search authority", 8), "D3": ("D", "Local presence", 5), "D4": ("D", "Content, E-E-A-T & schema", 5),
 # E gains the five points B loses. Published results are weaker evidence than verified ones,
 # and everything in E is measured from the firm's own site and is what a client actually
 # uses: what it costs, whether they speak your language, whether anyone answers.
 "E1": ("E", "Free consult & fee transparency", 6), "E3": ("E", "Languages & accessibility", 4),
 "E4": ("E", "Availability", 5),
}
PILLAR_MAX = {"A": 25, "B": 15, "C": 20, "D": 25, "E": 15}

# The eligibility gates, all five checkable by machine from a public source. G4, "no
# consumer-protection actions", was removed at v2.0: it asked for a negative across every
# enforcement body in the country and no search can establish it. The reasoning, and the two
# query shapes that failed, are recorded in scripts/check_g4.py. Naming the set here rather
# than counting to six inline means removing or adding a gate is one edit.
GATES = ("G1", "G2", "G3", "G5", "G6")

# A gate that did not pass is a finding only if we ran a check and it came back adverse. These
# markers in a gate's source mean we did not, and the difference is the whole reason the gates
# have three states rather than two.
#
# "no queryable source" earned its place the hard way. Maryland publishes no attorney register we
# can query, so Malloy Law's G1 and G2 said so honestly, and because that wording carried neither
# "pending" nor "partial" the engine counted them as failed and published "Not eligible" about a
# real firm for something its state does not publish. Matching on substrings of prose is fragile,
# which is why the list is named and here rather than inline.
NOT_A_FINDING = ("pending", "partial", "no queryable source", "unavailable",
                 "screening only", "incomplete", "not yet")
# Thresholds are percentages now, of what we could actually assess. The absolute floors the
# methodology set, 40, 50 and 55 out of the 65 points in pillars A, B and C, carry across as
# the same proportions.
TIERS = [("Elite", 93, 55 / 65), ("Distinguished", 85, 50 / 65), ("Certified", 70, 40 / 65)]

# A normalised score is only meaningful over enough of the scale, and is trivially gamed
# otherwise: a firm with nothing assessed but pillar E could score 90% of it. Certification
# therefore needs a real share of the whole scale assessed, and needs pillars A, B and C to
# have been looked at rather than skipped, since those three carry what the certification
# actually claims. Below that a firm can still be Verified, which is a claim about the gates.
MIN_COVERAGE = 0.60
MIN_PILLAR_COVERAGE = 0.50

def review_count(google):
    """count_label is a label, not a number: "1,776" and "400+" both have to parse."""
    return int("".join(ch for ch in str(google.get("count_label", "")) if ch.isdigit()) or 0)


# How many reviews before a firm's own average is trusted on its own terms. The methodology
# specifies a Bayesian average with the cohort mean as prior but not the weight, so this is an
# implementation choice and worth stating: 100 reviews. It is fixed rather than derived from the
# cohort's median for two reasons. A derived weight drifts as peers are added, moving a firm's
# score for reasons that have nothing to do with the firm. And this cohort's median is 577, a
# weight so heavy it compressed the whole range — a firm rated 4.35 landed one point below one
# rated 4.91, which defeats the point of scoring rating quality.
C2_PRIOR_WEIGHT = 100


def rating_prior():
    """Count-weighted mean rating across every firm with a rating: the prior for C2.

    Computed once over the whole set rather than per firm, so a firm cannot move its own prior,
    and count-weighted on purpose: a plain mean of ratings would let a firm with nine reviews
    pull the prior as hard as one with five thousand.
    """
    pairs = []
    for path in FIRMS:
        try:
            firm = read_json(path)
        except Exception:
            continue
        if firm.get("status") == "sample":
            continue
        g = (firm.get("reviews") or {}).get("google")
        if g and g.get("rating") and review_count(g):
            pairs.append((g["rating"], review_count(g)))
    if not pairs:
        return None, 0
    total = sum(n for _, n in pairs)
    mean = sum(r * n for r, n in pairs) / total
    return (round(mean, 3), C2_PRIOR_WEIGHT), len(pairs)


RATING_PRIOR, RATING_N = rating_prior()


def pct(value, values):
    others = [v for v in values]
    if not others: return 50
    below = sum(1 for v in others if v < value); ties = sum(1 for v in others if v == value)
    return round(100 * (below + 0.5 * ties) / len(others))

def scale(p, maxpts):  # percentile → points, rounded half-up, min 0
    return max(0, min(maxpts, round(p / 100 * maxpts + 1e-9)))

def sub(code, pts, source, evidence):
    pil, label, mx = SUBS[code]
    return {"code": code, "label": label, "pts": round(min(pts, mx), 1), "max": mx, "source": source, "evidence": evidence}

TODAY_YEAR = int(TODAY[:4])

def compute(firm):
    A = firm.get("assessments", {})
    cohort = COHORTS.get(firm["cohort_id"])
    out = []

    def assessed(code, default_ev="Not yet assessed"):
        a = A.get(code)
        if a: return sub(code, a["pts"], a.get("source", "illustrative"), a["evidence"])
        return sub(code, 0, "pending", default_ev)

    # ---- A2 experience: computed from the registry, no longer asserted ----
    # This was hand-entered, and for the one firm that had a value it claimed a "weighted average
    # admission 15+ yrs" that the registry contradicts outright: the real mean across its
    # attorneys is 8.6 years, which is two bands lower. Now that scripts/check_ny_registry.py
    # writes a real admitted_year, the sub-factor is arithmetic.
    #
    # The mean, not a "weighted" mean: the methodology said weighted without ever defining the
    # weights, so the word described nothing. Coverage is stated in the evidence rather than
    # gated on a threshold, because the mean over eight of nine attorneys is a sound estimate of
    # the mean over nine and hiding the denominator would be the dishonest part.
    attys = firm.get("attorneys") or []
    years = [TODAY_YEAR - a["admitted_year"] for a in attys
             if a.get("admitted_year") and a["admitted_year"] <= TODAY_YEAR]
    if years and "A2" not in A:
        avg = sum(years) / len(years)
        pts = 9 if avg >= 15 else 7 if avg >= 10 else 5 if avg >= 5 else 2
        out.append(sub("A2", pts, "registry",
                       f"Mean {avg:.1f} years since admission across {len(years)} of {len(attys)} "
                       f"named attorneys (longest {max(years)}, shortest {min(years)}) · "
                       f"NYS Attorney Registration database"))
    else:
        out.append(assessed("A2"))

    # ---- A6 roster verifiability: computed from the registry check ----
    # What replaced A1. A firm whose whole published roster can be matched to the state
    # register, and which prints bar numbers on its bios, is accountable in a way anybody can
    # check in a minute. A firm that names one attorney and no numbers is not, and that is a
    # real difference rather than a gap in our data.
    named = len(attys)
    verified = [a for a in attys if a.get("bar_number")]
    with_number = [a for a in attys if a.get("bar_number") and a.get("registry_basis")]
    if named:
        share = len(verified) / named
        pts = 6 if share >= 0.95 else 4.5 if share >= 0.8 else 3 if share >= 0.5 else 1
        # Three more for publishing the numbers itself, which is a text change any firm can
        # make and which is the single cheapest thing on this scale.
        on_bios = sum(1 for a in attys if (a.get("bar_number") and
                                           "firm" in (a.get("registry_basis") or "").lower()))
        pts += 3 if on_bios else 0
        out.append(sub("A6", pts, "registry",
                       f"{len(verified)} of {named} named attorneys matched to the "
                       f"{firm.get('market', {}).get('state_name', 'state')} register"
                       + ("; bar numbers published on the bios" if on_bios else
                          "; no bar number published on any bio")))
    else:
        out.append(sub("A6", 0, "pending", "No attorney is named on the site we could read"))

    # ---- A5: only what the firm publishes about itself ----
    out.append(assessed("A5", "Nothing published about insurance or bar memberships"))

    # ---- B: Published Outcomes, from the firm's own results page ----
    rp = firm.get("results_published")
    if rp and rp.get("readable"):
        n = rp.get("count") or 0
        b1 = 6 if n >= 25 else 4.5 if n >= 10 else 3 if n >= 3 else 1 if n >= 1 else 0
        out.append(sub("B1", b1, "firm",
                       (f"{n} result{'' if n == 1 else 's'} published on the firm's own site, "
                        f"counted from {rp.get('counted_from', 'the page')}")
                       if n else "The firm publishes no case results we could read"))
        # Specificity: a figure attached to a kind of case, and a court or county named, are
        # what let a reader go and look. A page of bare numbers does not.
        types, venues = len(rp.get("case_types") or []), len(rp.get("venues") or [])
        b2 = min(3, types) + (2 if venues else 0)
        out.append(sub("B2", b2, "firm",
                       f"{types} case type{'' if types == 1 else 's'} named"
                       + (f"; {venues} court or county reference{'' if venues == 1 else 's'}"
                          if venues else "; no court or county named, so no result can be "
                                         "looked up")))
        # The disclaimer New York's advertising rules effectively require alongside results.
        out.append(sub("B3", 4 if rp.get("disclaimer") else 0, "firm",
                       "Prior-results disclaimer present, as the advertising rules require"
                       if rp.get("disclaimer") else
                       "No prior-results disclaimer on the results page, which the New York "
                       "advertising rules effectively require"))
    elif rp:
        for c in ["B1", "B2", "B3"]:
            out.append(sub(c, 0, "pending", rp.get("why") or "Results page could not be read"))
    else:
        for c in ["B1", "B2", "B3"]:
            out.append(assessed(c, "The firm's results page has not been read yet"))

    # ---- C ----
    g = firm.get("reviews", {}).get("google")
    if g and "C1" not in A:
        n = int("".join(ch for ch in g["count_label"] if ch.isdigit()) or 0)
        pts = 5 if n >= 300 else 4 if n >= 150 else 3 if n >= 75 else 2 if n >= 25 else 1 if n >= 10 else 0
        out.append(sub("C1", pts, "observed", f"{g['count_label']} Google reviews · {g['source']}"))
    else: out.append(assessed("C1"))

    # C2 rating quality, as the methodology defines it: a Bayesian average with the cohort mean
    # as the prior, so three reviews at 5.0 cannot beat four hundred at 4.8. The shrinkage is
    # the IMDb form — (v·R + m·C) / (v + m) — with C the count-weighted mean across scored firms
    # and m the median review count, so a firm with fewer reviews than its peers is pulled
    # toward the middle rather than rewarded for a thin sample.
    #
    # One platform, not several: Google Business Profile is the only source collected so far.
    # The evidence string says so, because a single-platform average is weaker than the
    # cross-platform one §3 describes and a reader should not have to guess which they are seeing.
    if g and "C2" not in A and RATING_PRIOR and g.get("rating"):
        n = review_count(g)
        prior_mean, prior_weight = RATING_PRIOR
        bayes = (n * g["rating"] + prior_weight * prior_mean) / (n + prior_weight)
        pts = (6 if bayes >= 4.9 else 5 if bayes >= 4.8 else 4 if bayes >= 4.6
               else 3 if bayes >= 4.4 else 2 if bayes >= 4.0 else 1 if bayes >= 3.5 else 0)
        out.append(sub("C2", pts, "observed",
                       f"Google rating {g['rating']} over {n:,} reviews → Bayesian {bayes:.2f} "
                       f"(prior {prior_mean:.2f} weighted as {prior_weight:,} reviews, from "
                       f"{RATING_N} scored firms) · single platform, Google only"))
    else: out.append(assessed("C2"))
    # ---- C3 recency and C5 complaint share, from the review sample Places returns ----
    # Places returns five reviews per business listing with a publish time, a rating and the
    # text. Five per listing is a sample, not a census, and the evidence says so: with eleven
    # listings a firm has fifty-five dated reviews behind these two numbers, and with one it
    # has five.
    sample = firm.get("reviews", {}).get("sample") or []
    if sample:
        dates = sorted(r["published_at"][:10] for r in sample if r.get("published_at"))
        recent = [d for d in dates if d >= (datetime.date.today()
                                            - datetime.timedelta(days=365)).isoformat()]
        share_recent = len(recent) / len(dates) if dates else 0
        c3 = (5 if share_recent >= 0.6 else 4 if share_recent >= 0.4
              else 2.5 if share_recent >= 0.2 else 1 if dates else 0)
        out.append(sub("C3", c3, "places",
                       f"{len(recent)} of {len(dates)} sampled reviews are from the last 12 "
                       f"months (newest {dates[-1] if dates else 'unknown'}) · a sample of "
                       f"five per business listing, not every review"))
        low = [r for r in sample if (r.get("rating") or 5) <= 2]
        share_low = len(low) / len(sample)
        c5 = (4 if share_low == 0 else 3 if share_low <= 0.1
              else 2 if share_low <= 0.2 else 1 if share_low <= 0.35 else 0)
        out.append(sub("C5", c5, "places",
                       f"{len(low)} of {len(sample)} sampled reviews rate 1 or 2 stars · a "
                       "sample, so this is the shape of the complaints rather than a count "
                       "of them"))
    else:
        for c in ["C3", "C5"]:
            out.append(assessed(c, "No review sample collected yet"))

    # ---- D1: trust pages (+ psi) ----
    tp = firm.get("digital", {}).get("trust_pages")
    psi = firm.get("digital", {}).get("psi")
    if tp:
        pts = 0; ev = []
        if psi: pts += 2 if psi["value"]["cwv_pass"] else 0; ev.append("CWV " + ("pass" if psi["value"]["cwv_pass"] else "fail"))
        else: a = A.get("D1_cwv"); pts += a["pts"] if a else 0; ev.append("CWV " + (a["evidence"] if a else "pending"))
        a11 = A.get("D1_a11y"); pts += a11["pts"] if a11 else 0
        for key, p, label in [("bar_numbers_on_bios", 1, "bar numbers on bios"), ("fee_statement", 1, "fee statement"), ("privacy_policy", 0.5, "privacy policy"), ("disclaimer", 0.5, "disclaimer"), ("blog", 1, "fresh content")]:
            if tp.get(key): pts += p; ev.append(label)
            else: ev.append("no " + label)
        src = "observed" if psi else ("illustrative" if A.get("D1_cwv") else "observed")
        out.append(sub("D1", pts, src, " · ".join(ev)))
    else: out.append(assessed("D1"))

    # ---- D2: Ahrefs vs cohort ----
    ah = firm.get("digital", {}).get("ahrefs")
    if ah and cohort:
        peers = [f for f in cohort["firms"] if f["domain"] != firm["domain"]]
        p_dr = pct(ah["dr"], [f["dr"] for f in peers]); p_rd = pct(ah["refdomains"], [f["refdomains"] for f in peers])
        p_kw = pct(ah["org_keywords"], [f["org_keywords"] for f in peers]); p_tr = pct(ah["org_traffic"], [f["org_traffic"] for f in peers])
        p_vis = (p_kw + p_tr) / 2
        pts = scale(p_dr, 3) + scale(p_rd, 2) + scale(p_vis, 2)
        brand = A.get("D2_brand"); pts += brand["pts"] if brand else 0
        med = statistics.median([f["dr"] for f in cohort["firms"]])
        ev = (f"DR {ah['dr']} → {p_dr}th pct of {len(peers)}-firm cohort (median {med:g}) {scale(p_dr,3)}/3 · "
              f"{ah['refdomains']:,} referring domains, {p_rd}th pct {scale(p_rd,2)}/2 · "
              f"{ah['org_keywords']:,} organic keywords / {ah['org_traffic']:,} visits·mo, {round(p_vis)}th pct {scale(p_vis,2)}/2 · "
              f"brand demand {brand['pts'] if brand else 0}/1" + (" (illustrative)" if brand and brand.get("source","illustrative")=="illustrative" else " (pending)" if not brand else ""))
        out.append(sub("D2", pts, "ahrefs", ev))
    else: out.append(assessed("D2", "Ahrefs data not yet collected"))

    # D3 local presence, partially. The methodology asks for a verified *and complete* Google
    # Business Profile (categories, hours, services, 20+ photos, Q&A, recent posts) for 2 points,
    # NAP consistency across 30 citations for 1, and local-pack rank for 2. Only the first half
    # of the first item is collected: that listings exist, are operational and carry reviews.
    # That earns 1 point, not 2 — completeness is not something we have looked at, and the
    # evidence says which half is missing so the row is not mistaken for a full measurement.
    places = firm.get("digital", {}).get("places")
    if places and places.get("listing_count") and "D3" not in A:
        n = places["listing_count"]
        out.append(sub("D3", 1, "places",
                       f"{n} operational Google Business Profile listing{'' if n == 1 else 's'} "
                       f"with reviews · profile completeness, NAP consistency across citations "
                       f"and local-pack rank not yet measured (4 of 5 pts still available)"))
    else: out.append(assessed("D3"))

    # ---- D4: content(2) assessed, schema(1) observed, media(1) assessed, AI(1) ahrefs ----
    d4 = 0; ev = []
    c = A.get("D4_content"); d4 += c["pts"] if c else 0; ev.append(f"content {c['pts'] if c else 0}/2")
    sd = firm.get("digital", {}).get("schema_detected"); d4 += 1 if sd else 0; ev.append("JSON-LD detected 1/1" if sd else "no JSON-LD detected 0/1")
    m = A.get("D4_media"); d4 += m["pts"] if m else 0; ev.append(f"earned media {m['pts'] if m else 0}/1" + (" (illustrative)" if m and m.get("source","illustrative")=="illustrative" else ""))
    if ah and ah.get("ai_citations"):
        ai = ah["ai_citations"]; d4 += 1 if ai["total"] > 0 else 0
        ev.append(f"cited in AI answers: {ai['total']} citations / {ai['pages']} pages 1/1" if ai["total"] else "no AI citations 0/1")
    out.append(sub("D4", d4, "ahrefs" if ah else "observed", " · ".join(ev)))

    # ---- E ----
    # "Not stated" is a non-empty string, so the old truthiness test handed two transparency
    # points to firms that publish no fee model at all. A model only counts when it says something.
    model = (firm.get("fee_model") or "").strip()
    stated = bool(model) and not re.match(r"^(not stated|unknown|n/?a|pending)$", model, re.I)
    # The fourth point is for publishing the actual percentage, which the fee guide found no
    # firm in the directory does. It is a real differentiator precisely because it is empty:
    # every firm here says "no fee unless we win" and none says what the fee is.
    statement = firm.get("fee_statement") or ""
    states_pct = bool(re.search(r"(\d{2}(?:[.,]\d+)?\s*(?:%|percent)|33\s*1/3|one[-\s]third)",
                                statement, re.I))
    e1 = ((1 if firm.get("free_consultation") else 0) + (2 if stated else 0)
          + (2 if statement else 0) + (1 if states_pct else 0))
    e1_ev = ("Free consultation · " if firm.get("free_consultation") else "") + \
        (statement or (model if stated else "fee model not published")) + \
        ("" if states_pct else " · the fee percentage itself is not published")
    out.append(sub("E1", e1, "observed", e1_ev))
    langs = [l for l in firm.get("languages", []) if l.lower() != "english"]
    av = " ".join(firm.get("availability", [])).lower()
    e3 = min(3, 1.5 * len(langs)) + (1 if "video" in av or "ada" in av else 0)
    out.append(sub("E3", e3, "observed", ", ".join(firm.get("languages", [])) + (" · video consults" if "video" in av else "")))
    e4 = ((2.5 if "24/7" in av else 0)
          + (2.5 if any(w in av for w in ("hospital", "home", "evening", "weekend")) else 0))
    out.append(sub("E4", e4, "observed", " · ".join(firm.get("availability", [])) or "no availability published"))

    # ---- aggregate ----
    pillars = {p: {"score": 0, "max": PILLAR_MAX[p], "subs": []} for p in PILLAR_MAX}
    for s in out:
        pillars[SUBS[s["code"]][0]]["subs"].append(s); pillars[SUBS[s["code"]][0]]["score"] += s["pts"]
    for p in pillars: pillars[p]["score"] = round(pillars[p]["score"])
    raw = sum(pillars[p]["score"] for p in pillars)

    # The score is a percentage of what we could assess, not of a hundred points most of
    # which we have never looked at. Before this, every firm scored zero on all four of
    # pillar B, not because it has no verified outcomes but because we have no court-records
    # pipeline. That measured our own coverage and published it as the firm's result, which
    # put the A+B+C floor of 40 out of 65 arithmetically out of reach for everyone and left a
    # certification nobody could earn.
    def spread(codes):
        earned = assessable = 0.0
        for pk in codes:
            for x in pillars[pk]["subs"]:
                if x["source"] != "pending":
                    earned += x["pts"]; assessable += x["max"]
        return earned, assessable

    earned_all, assessed_all = spread(PILLAR_MAX)
    earned_abc, assessed_abc = spread("ABC")
    total = round(100 * earned_all / assessed_all) if assessed_all else 0
    abc_pct = (earned_abc / assessed_abc) if assessed_abc else 0.0
    coverage = assessed_all / sum(PILLAR_MAX.values())
    pillar_cover = {pk: (spread(pk)[1] / PILLAR_MAX[pk]) for pk in PILLAR_MAX}
    coverage_ok = (coverage >= MIN_COVERAGE
                   and all(pillar_cover[pk] >= MIN_PILLAR_COVERAGE for pk in "ABC"))
    abc = round(earned_abc)
    # A gate has three real states, not two. "Not eligible" is a finding — the firm failed a
    # documented check — while a gate we have not run yet says nothing about the firm. Calling
    # the second one "Not eligible" publishes a false statement about a real business, so an
    # unchecked gate (source contains "pending" or "partial", the same convention the
    # sub-factors use) puts the firm under review instead.
    gates = firm.get("gates", {})
    def unchecked(g):
        return not g["pass"] and any(w in g.get("source", "").lower() for w in NOT_A_FINDING)
    pending_gates = [k for k, g in gates.items() if unchecked(g)]
    failed_gates = [k for k, g in gates.items() if not g["pass"] and not unchecked(g)]
    gates_ok = len(gates) == len(GATES) and not pending_gates and not failed_gates
    # Clearing every gate is itself a finding worth publishing. It says licensure,
    # discipline, entity, offices, website and footprint were checked and held, which is the
    # part that protects a client, and it claims nothing about the score. Without a rung here
    # the ladder ran straight from "listed" to a tier no firm could reach.
    tier = ("Not eligible" if failed_gates
            # "Under review" describes us rather than the firm. It says we have not
            # finished, which is no use to somebody choosing a lawyer and makes a
            # directory of real, working practices read as a building site. A firm with an
            # open gate is Listed, and the scorecard still says which gate and why, row
            # by row, for anyone who wants it.
            else "Listed" if pending_gates or len(gates) != len(GATES)
            else "Verified")
    if gates_ok and coverage_ok:
        for name, need, floor in TIERS:
            if total >= need and abc_pct >= floor: tier = name; break
    nxt = None
    for name, need, floor in reversed(TIERS):
        if total < need or abc_pct < floor or not coverage_ok:
            path = []
            if not coverage_ok:
                # Naming the unmeasured pillars first, because that is the actual blocker and
                # a firm reading its own card should not be sent chasing points that cannot
                # lift it past a coverage requirement.
                pend = sorted([x for x in out if x["source"] == "pending"],
                              key=lambda x: -x["max"])[:3]
                for x in pend:
                    path.append(f"{x['code']} {x['label']}: not yet measured ({x['max']} pts)")
            weakest = sorted([s for s in out if s["source"] != "pending" and s["pts"] < s["max"]],
                             key=lambda s: s["max"] - s["pts"], reverse=True)[:3 - len(path)]
            for s in weakest: path.append(f"{s['code']} {s['label']}: +{round(s['max']-s['pts'],1)} available")
            nxt = {"name": name, "needed": need, "gap": max(0, need - total),
                   "floor_met": abc_pct >= floor, "coverage_met": coverage_ok,
                   "path": path}; break
    lowest = min(pillars, key=lambda p: pillars[p]["score"] / pillars[p]["max"])
    short = [pk for pk in "ABC" if pillar_cover[pk] < MIN_PILLAR_COVERAGE]
    coverage_note = ""
    if not coverage_ok:
        listed = (" and ".join(short) if len(short) < 3
                  else ", ".join(short[:-1]) + " and " + short[-1])
        coverage_note = ("Certification needs more of the scale measured than we have managed "
                         "here" + (f", pillar{'s' if len(short) > 1 else ''} {listed} "
                                   f"in particular" if short else "") + ". ")
    verdict = (f"All {len(GATES)} eligibility gates passed. " if gates_ok
               else f"Eligibility gates not passed: {', '.join(sorted(failed_gates))}. " if failed_gates
               else f"{len(pending_gates) or len(GATES) - len(gates)} eligibility gate(s) still to be checked. ") + \
              coverage_note + \
              f"Strongest pillar: {max(pillars, key=lambda p: pillars[p]['score']/pillars[p]['max'])}; most headroom in pillar {lowest} ({pillars[lowest]['score']}/{pillars[lowest]['max']})."
    return {"total": total, "tier": tier, "verdict": verdict, "computed_at": TODAY, "methodology": METHOD,
            "pillars": pillars, "floor_abc": abc, "next_tier": nxt,
            "raw": round(earned_all, 1), "assessed": round(assessed_all),
            "coverage": round(coverage, 3), "floor_abc_pct": round(abc_pct, 3)}

def main():
    errors = []
    for path in FIRMS:
        firm = read_json(path)
        if firm.get("status") == "sample":
            if PROD: errors.append(f"{path}: status=sample is not allowed in production")
            continue
        score = compute(firm)
        firm["score"] = score

        # status follows the computed tier. It used to be hand-set, and the two drifted apart the
        # moment a real gate check replaced an asserted one: a firm's JSON still said "certified"
        # while its own scorecard said the gates had not been checked, so the page showed the
        # badge and the contradiction side by side. The tier is the only thing entitled to decide
        # this, and nothing outside the engine writes it.
        was = firm.get("status")
        firm["status"] = ("certified" if score["tier"] in ("Certified", "Distinguished", "Elite")
                          else "verified" if score["tier"] == "Verified"
                          else "not_eligible" if score["tier"] == "Not eligible"
                          else "listed")
        if was != firm["status"]:
            print(f"  status: {was} -> {firm['status']}  ({score['tier']})")

        ill = [s["code"] for p in score["pillars"].values() for s in p["subs"] if s["source"] == "illustrative"]
        if PROD and firm["status"] == "certified" and ill:
            errors.append(f"{path}: certified firm still has illustrative sub-factors {ill}")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(firm, fh, indent=2, ensure_ascii=False)
        print(f"{firm['name']}: {score['total']} → {score['tier']} (A+B+C={score['floor_abc']}) illustrative={ill}")
    if errors:
        print("\n".join(errors), file=sys.stderr); sys.exit(1)

if __name__ == "__main__":
    main()
