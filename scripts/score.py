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
METHOD = "v1.1"

SUBS = {  # code: (pillar, label, max)
 # v1.1 dropped A3, A4 and E2. Pillar weights are unchanged (A 25, B 20, C 20, D 25, E 10) so
 # the tier thresholds and the A+B+C floor keep meaning what they meant; the freed points were
 # redistributed inside their own pillar. See the header for why each one went.
 "A1": ("A", "Clean-record depth", 10), "A2": ("A", "Experience", 9), "A5": ("A", "Accountability", 6),
 "B1": ("B", "Volume of verified results", 6), "B2": ("B", "Magnitude", 6), "B3": ("B", "Trial & appellate", 5), "B4": ("B", "Recency", 3),
 "C1": ("C", "Authentic volume", 5), "C2": ("C", "Rating quality", 6), "C3": ("C", "Recency & consistency", 3), "C4": ("C", "Firm responsiveness", 3), "C5": ("C", "Complaints", 3),
 "D1": ("D", "Website trust & experience", 7), "D2": ("D", "Search authority", 8), "D3": ("D", "Local presence", 5), "D4": ("D", "Content, E-E-A-T & schema", 5),
 "E1": ("E", "Free consult & fee transparency", 4), "E3": ("E", "Languages & accessibility", 3), "E4": ("E", "Availability", 3),
}
PILLAR_MAX = {"A": 25, "B": 20, "C": 20, "D": 25, "E": 10}
TIERS = [("Elite", 93, 55), ("Distinguished", 85, 50), ("Certified", 70, 40)]

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

def compute(firm):
    A = firm.get("assessments", {})
    cohort = COHORTS.get(firm["cohort_id"])
    out = []

    def assessed(code, default_ev="Not yet assessed"):
        a = A.get(code)
        if a: return sub(code, a["pts"], a.get("source", "illustrative"), a["evidence"])
        return sub(code, 0, "pending", default_ev)

    # ---- A, B: assessed (registry/court work) ----
    for c in ["A1", "A2", "A5", "B1", "B2", "B3", "B4"]: out.append(assessed(c))

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
    for c in ["C3", "C4", "C5"]: out.append(assessed(c))

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
    e1 = (1 if firm.get("free_consultation") else 0) + (2 if stated else 0) \
        + (1 if firm.get("fee_statement") else 0)
    e1_ev = ("Free consultation · " if firm.get("free_consultation") else "") + \
        (firm.get("fee_statement") or (model if stated else "fee model not published"))
    out.append(sub("E1", e1, "observed", e1_ev))
    langs = [l for l in firm.get("languages", []) if l.lower() != "english"]
    av = " ".join(firm.get("availability", [])).lower()
    e3 = min(2, 1.0 * len(langs)) + (1 if "video" in av or "ada" in av else 0)
    out.append(sub("E3", e3, "observed", ", ".join(firm.get("languages", [])) + (" · video consults" if "video" in av else "")))
    e4 = (1.5 if "24/7" in av else 0) + (1.5 if any(w in av for w in ("hospital", "home", "evening", "weekend")) else 0)
    out.append(sub("E4", e4, "observed", " · ".join(firm.get("availability", [])) or "no availability published"))

    # ---- aggregate ----
    pillars = {p: {"score": 0, "max": PILLAR_MAX[p], "subs": []} for p in PILLAR_MAX}
    for s in out:
        pillars[SUBS[s["code"]][0]]["subs"].append(s); pillars[SUBS[s["code"]][0]]["score"] += s["pts"]
    for p in pillars: pillars[p]["score"] = round(pillars[p]["score"])
    total = sum(pillars[p]["score"] for p in pillars)
    abc = pillars["A"]["score"] + pillars["B"]["score"] + pillars["C"]["score"]
    # A gate has three real states, not two. "Not eligible" is a finding — the firm failed a
    # documented check — while a gate we have not run yet says nothing about the firm. Calling
    # the second one "Not eligible" publishes a false statement about a real business, so an
    # unchecked gate (source contains "pending" or "partial", the same convention the
    # sub-factors use) puts the firm under review instead.
    gates = firm.get("gates", {})
    def unchecked(g):
        return not g["pass"] and any(w in g.get("source", "").lower() for w in ("pending", "partial"))
    pending_gates = [k for k, g in gates.items() if unchecked(g)]
    failed_gates = [k for k, g in gates.items() if not g["pass"] and not unchecked(g)]
    gates_ok = len(gates) == 6 and not pending_gates and not failed_gates
    tier = ("Not eligible" if failed_gates
            else "Under review" if pending_gates or len(gates) != 6
            else "Listed")
    for name, need, floor in TIERS:
        if gates_ok and total >= need and abc >= floor: tier = name; break
    nxt = None
    for name, need, floor in reversed(TIERS):
        if total < need or abc < floor:
            path = []
            weakest = sorted([s for s in out if s["pts"] < s["max"]], key=lambda s: s["max"] - s["pts"], reverse=True)[:3]
            for s in weakest: path.append(f"{s['code']} {s['label']}: +{round(s['max']-s['pts'],1)} available")
            nxt = {"name": name, "needed": need, "gap": max(0, need - total), "floor_met": abc >= floor, "path": path}; break
    lowest = min(pillars, key=lambda p: pillars[p]["score"] / pillars[p]["max"])
    verdict = ("All six eligibility gates passed. " if gates_ok
               else f"Eligibility gates not passed: {', '.join(sorted(failed_gates))}. " if failed_gates
               else f"{len(pending_gates) or 6 - len(gates)} eligibility gate(s) still to be checked; "
                    "this firm has not been scored yet. ") + \
              f"Strongest pillar: {max(pillars, key=lambda p: pillars[p]['score']/pillars[p]['max'])}; most headroom in pillar {lowest} ({pillars[lowest]['score']}/{pillars[lowest]['max']})."
    return {"total": total, "tier": tier, "verdict": verdict, "computed_at": TODAY, "methodology": METHOD,
            "pillars": pillars, "floor_abc": abc, "next_tier": nxt}

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
