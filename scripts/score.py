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

# Who a firm presents as a lawyer, shared with check_ny_registry.py so that A6 and
# the licence gates count the same roster.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from roster_roles import is_support_role  # noqa: E402

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

# The states whose attorney register we are permitted to query. Sub-factors and gates
# derived from a register mean nothing outside this set, and must not be scored there.
# scripts/build_profiles.py holds the same set for the wording it writes.
OPEN_REGISTER_STATES = {"NY"}

# The eligibility gates, all five checkable by machine from a public source. G4, "no
# consumer-protection actions", was removed at v2.0: it asked for a negative across every
# enforcement body in the country and no search can establish it. The reasoning, and the two
# query shapes that failed, are recorded in scripts/check_g4.py. Naming the set here rather
# than counting to six inline means removing or adding a gate is one edit.
GATES = ("G1", "G2", "G3", "G5", "G6")

# A published price, in the forms a law firm writes one. E1's last point asks for the figure the
# firm charges, and in a practice with no contingency percentage the words alone are not it:
# "flat rates where possible" and "Transparent Flat Fees" name a model, which E1 already pays two
# points for, and tell a client nothing about the size of the bill.
FEE_FIGURE = re.compile(r"\$\s?[\d,]+|\b\d[\d,]*\s*(?:dollars|per hour|an hour|/\s*h(?:r|our))\b",
                        re.I)

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
                 "screening only", "incomplete", "not yet", "no roster published")
# The subset of those that mean the source does not exist in this firm's market, as opposed to
# meaning we have not got there yet. Only these leave the coverage denominator: a check we simply
# owe is still a gap in our work and should count against us.
NO_SOURCE_IN_MARKET = ("no queryable source", "unavailable", "no roster published")


# Sub-factors read from the firm's own website. Every one of them is unmeasurable for a firm whose
# site refuses us, and none of them may be scored zero on that basis. D1 is here for its trust
# pages and D3 is not, because D3 is counted from Google listings rather than from the site.
SITE_DERIVED = {"A5", "A6", "B1", "B2", "B3", "D1", "D4", "E1", "E3", "E4"}
# Thresholds are percentages now, of what we could actually assess. The absolute floors the
# methodology set, 40, 50 and 55 out of the 65 points in pillars A, B and C, carry across as
# the same proportions.
TIERS = [("Elite", 93, 55 / 65), ("Distinguished", 85, 50 / 65), ("Certified", 70, 40 / 65)]

# A normalised score is only meaningful over enough of the scale, and is trivially gamed
# otherwise: a firm with nothing assessed but pillar E could score 90% of it. Certification
# therefore needs a real share of the whole scale assessed, and needs pillars A, B and C to
# have been looked at rather than skipped, since those three carry what the certification
# actually claims. Below that a firm can still be Verified, which is a claim about the gates.
# Practices whose work produces no verdict and no settlement. Pillar B cannot read a results page
# for these and reads scripts/check_transaction.py instead: the fee, the escrow and the stages of
# the deal the firm explains. The pillar keeps its fifteen points, because the question it asks,
# what does this firm tell you before you hire it, has an answer in both kinds of practice.
#
# Decided by the firm's primary practice rather than by any practice it lists. A firm that does
# injury work and closings has results to publish, and the results page is the better measure.
TRANSACTIONAL = {"real-estate"}

# The other practice with no outcomes, and a stronger reason for it. A closing that went well
# produces no verdict; a divorce produces a judgment about a real family's money and a real
# child's living arrangements. Custody proceedings concern children, matrimonial files are
# routinely sealed, and a firm advertising the custody arrangement it obtained is advertising a
# stranger's private life. So pillar B does not ask these firms for results and a firm that
# publishes none is not marked down, which is the opposite of what B1 does everywhere else.
#
# It asks about the price instead, and the reason that works is a rule. Rule 1.5(d)(5)(i) of the
# Rules of Professional Conduct forbids a contingent fee in a domestic relations matter, so the
# promise most firms in this directory make is unavailable here and the hourly rate and the
# retainer are the only prices there are. 22 NYCRR 1400.3 then requires the firm to put the rate
# of every person who may bill you, the amount of the retainer and the frequency of itemized
# billing into a signed agreement before it starts. The client is guaranteed all of it in the
# room where they sign, after choosing. Nothing requires publishing any of it beforehand, which
# is the moment somebody is comparing three firms, and that gap is what this measures.
DOMESTIC = {"family-law"}

MIN_COVERAGE = 0.60
MIN_PILLAR_COVERAGE = 0.50
# Below this, a total is still computed and is no longer offered as a number to compare.
#
# The normalised score divides what a firm earned by what we assessed, which is the right shape
# and stops meaning much when the denominator gets small. A firm whose site refuses our crawler
# was measured on three sub-factors, came out at 69, and sorted above a firm measured on fifteen
# that came out at 48. Both numbers are correct and putting them in one column is not.
#
# One firm in the directory is below this today and the next lowest sits at 0.60, so the line is
# drawn where the data already separates rather than where it would be convenient.
MIN_SCORE_COVERAGE = 0.50

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

def sub(code, pts, source, evidence, max_override=None, label_override=None):
    """One sub-score.

    max_override exists for a factor where part of the scale is not assessable for a firm rather
    than unearned by it. A5 is the case: three of its six points are for disclosing professional
    liability cover, and across thirty-eight firms in two states not one publishes it, not even
    as a phrase on an about page. Plaintiff-side firms in this country do not advertise their own
    cover, and scoring an absence that is universal charges every firm three points for a fact
    about the market. It separates nobody, it moves no ranking, and it quietly makes the published
    thresholds stricter than the page says they are, because 70 out of a scale where three points
    cannot be reached is really 70 out of 97. So that half leaves the denominator until we see a
    firm publish it, at which point the firm that does gets the credit.
    """
    pil, label, mx = SUBS[code]
    mx = mx if max_override is None else max_override
    # The label travels with the sub-score because pillar B measures two different things
    # depending on the practice: published outcomes where there are outcomes, and the published
    # terms of the transaction where there are none. A profile printing "Results published" over
    # a real estate firm's fee disclosure would be describing the wrong thing.
    label = label if label_override is None else label_override
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
    # The people a firm presents as lawyers, which is not everybody it names. A Queens firm
    # names thirty-nine people and prints a role beside each: four practise law, the rest are
    # case managers, intake and translators. Dividing the register matches by thirty-nine would
    # have published "4 of 39 named attorneys matched to the New York register" about a firm
    # that never called those thirty-five attorneys, and charged it eight points for our own
    # misreading. Anyone the firm gave a non-lawyer's title leaves the denominator.
    #
    # src/lib/roster.ts makes the same split for the profile page and holds the same list.
    attys = [a for a in (firm.get("attorneys") or []) if not is_support_role(a)]
    years = [TODAY_YEAR - a["admitted_year"] for a in attys
             if a.get("admitted_year") and a["admitted_year"] <= TODAY_YEAR]
    if years and "A2" not in A:
        avg = sum(years) / len(years)
        pts = 9 if avg >= 15 else 7 if avg >= 10 else 5 if avg >= 5 else 2
        out.append(sub("A2", pts, "registry",
                       f"Mean {avg:.1f} years since admission across {len(years)} of {len(attys)} "
                       f"named attorneys (longest {max(years)}, shortest {min(years)}) · "
                       f"NYS Attorney Registration database"))
    elif firm.get("market", {}).get("state") not in OPEN_REGISTER_STATES:
        # A2 is the year an attorney was admitted, and that year lives in a state attorney
        # register. A6 was given this exact treatment and A2 was missed, which left ten points
        # marked "not yet assessed" on 146 firms in six states where no register exists for
        # anybody to read. It was the single largest block of unmeasured points in the directory
        # and none of it was ours to measure: "pending" says we owe the work, and we do not owe
        # what the state does not publish. It stays out of the denominator, the same way A6 does,
        # and the profile says which state and why.
        out.append(sub("A2", 0, "no queryable source",
                       "%s publishes no attorney register we can query, so years since admission "
                       "cannot be established here for any firm and this is not scored."
                       % firm.get("market", {}).get("state_name", "This state")))
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
    # A6 is a share of a register, so it needs a register. Where the state publishes none we may
    # query, every attorney is unmatched by definition, and the profile said "0 of 7 named
    # attorneys matched to the Maryland register" and scored the firm 1 out of 9 for it. Maryland
    # was never queried: mdcourts.gov asks crawlers to stay out of its attorney search. So the
    # factor leaves the scale rather than charging a firm for a door we agreed not to open.
    if named and firm.get("market", {}).get("state") not in OPEN_REGISTER_STATES:
        out.append(sub("A6", 0, "no queryable source",
                       "%s publishes no attorney register we can query, so the roster is not "
                       "verified here and this is not scored."
                       % firm.get("market", {}).get("state_name", "This state")))
    elif named:
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
    # ---- A5 accountability: read off the firm's own pages, not entered by hand ----
    # This was the last hand-entered sub-factor on the directory, and it was the shape the whole
    # v2.0 rework set out to remove: six points that only a person could award, pending on every
    # profile but one. scripts/check_a5.py looks for a disclosure of professional liability cover
    # with the firm as the subject of the sentence, and for named bar or trial lawyers'
    # associations. A firm that publishes neither scores nothing here rather than being asked.
    acc = firm.get("accountability")
    if acc and "A5" not in A:
        # Three points for cover disclosed, three for a named association. Where no cover is
        # published the scale is the association half alone; see sub() for why.
        cover = acc.get("malpractice_insurance")
        out.append(sub("A5", acc["pts"], acc.get("source", "observed"),
                       acc["evidence"], max_override=None if cover else 3))
    else:
        out.append(assessed("A5", "Nothing published about insurance or bar memberships"))

    # ---- B: published outcomes, or the transaction where the practice has none ----
    practices = firm.get("practices") or []
    primary = next((p for p in practices if p.get("primary")), practices[0] if practices else {})
    transactional = primary.get("slug") in TRANSACTIONAL
    domestic = primary.get("slug") in DOMESTIC
    tx = firm.get("transaction")
    dm = firm.get("domestic")
    rp = firm.get("results_published")

    if domestic and not (dm and dm.get("readable")):
        for code, label in (("B1", "Fee terms published"),
                            ("B2", "The case explained"),
                            ("B3", "Billing and the retainer disclosed")):
            out.append(sub(code, 0, "pending",
                           (dm or {}).get("why")
                           or "The firm's fee and divorce pages have not been read yet",
                           label_override=label))
    elif domestic:
        pages = dm.get("pages_read") or 0
        plural = "" if pages == 1 else "s"
        # The rate is the price. A retainer figure without it is most of the way there: it tells
        # a client what they have to produce to start, which is the question asked first.
        if dm.get("hourly_rate"):
            b1, b1_ev = 6, ('Publishes an hourly rate, which in this practice is the price: "%s"'
                            % dm["hourly_rate"]["quote"][:180])
        elif dm.get("retainer"):
            b1, b1_ev = 4.5, ('Publishes the retainer without an hourly rate: "%s"'
                              % dm["retainer"]["quote"][:180])
        elif dm.get("flat_fee"):
            b1, b1_ev = 4, ('States a flat fee, ordinarily for an uncontested case: "%s"'
                            % dm["flat_fee"]["quote"][:180])
        elif dm.get("fee_terms"):
            b1, b1_ev = 2, ('Says something about how it charges, with no rate, retainer or flat '
                            'fee: "%s"' % dm["fee_terms"]["quote"][:180])
        else:
            b1, b1_ev = 0, ("Nothing about the rate, the retainer or any other price on the %d "
                            "page%s we read. The court rules guarantee a client all of it in a "
                            "signed agreement before the work starts; publishing it beforehand "
                            "is the firm's choice" % (pages, plural))
        out.append(sub("B1", b1, "firm", b1_ev, label_override="Fee terms published"))

        # One point per stage of a matrimonial case the firm names, to four, plus one for saying
        # which way through it does: mediation, collaborative divorce or litigation are different
        # services at different prices, and a firm that names two of them has told a client
        # something about its own practice rather than about divorce in general.
        stages = dm.get("stages") or []
        paths = dm.get("paths") or []
        b2 = min(4, len(stages)) + (1 if len(paths) >= 2 else 0)
        named = ", ".join(stages[:5]) + ("" if len(stages) <= 5 else ", and more")
        b2_ev = (("Explains %d stage%s of a matrimonial case: %s"
                  % (len(stages), "" if len(stages) == 1 else "s", named))
                 if stages else
                 "Names none of the stages of a matrimonial case on the %d page%s we read"
                 % (pages, plural))
        b2_ev += (" · names %s" % ", ".join(paths)) if paths else " · names no route through it"
        out.append(sub("B2", b2, "firm", b2_ev, label_override="The case explained"))

        # The client's money, which is this practice's escrow question. Every one of these firms
        # takes a retainer in advance and bills against it, 22 NYCRR 1400.3 requires an itemized
        # bill at least every 60 days and 1400.2 forbids a non-refundable retainer, so a firm
        # saying nothing about either is choosing not to, and a firm citing the rules is telling
        # clients rights they have whether or not anybody tells them.
        if dm.get("billing_disclosed") and dm.get("client_rights_cited"):
            b3, b3_ev = 4, ('Publishes how it bills and cites the rules that govern it: "%s"'
                            % dm["billing_disclosed"]["quote"][:180])
        elif dm.get("billing_disclosed"):
            b3, b3_ev = 3, ('Publishes how it bills or what happens to the unused retainer: '
                            '"%s"' % dm["billing_disclosed"]["quote"][:180])
        elif dm.get("client_rights_cited"):
            b3, b3_ev = 1.5, ("Cites the client's rights in a domestic relations matter without "
                              'saying how it bills: "%s"'
                              % dm["client_rights_cited"]["quote"][:180])
        else:
            b3, b3_ev = 0, ("Says nothing about how it bills against the retainer or what "
                            "happens to the unused part, on any of the %d page%s we read"
                            % (pages, plural))
        out.append(sub("B3", b3, "firm", b3_ev,
                       label_override="Billing and the retainer disclosed"))

    elif transactional and not (tx and tx.get("readable")):
        for code, label in (("B1", "Fee terms published"),
                            ("B2", "The transaction explained"),
                            ("B3", "Escrow disclosed")):
            out.append(sub(code, 0, "pending",
                           (tx or {}).get("why")
                           or "The firm's fee and closing pages have not been read yet",
                           label_override=label))
    elif transactional:
        # A figure beats a promise. Florida sets the title insurance premium by rule and it is
        # identical at every agency in the state, so the premium is not a thing to compare; the
        # firm's own closing fee is, and a firm that prints it has answered the question a client
        # actually asked. A flat fee stated without a figure is most of the way there.
        if tx.get("price"):
            b1, b1_ev = 6, 'Publishes a figure for its own fee: "%s"' % tx["price"]["quote"][:180]
        elif tx.get("flat_fee"):
            b1, b1_ev = 4, ('States a flat fee without printing it: "%s"'
                            % tx["flat_fee"]["quote"][:180])
        elif tx.get("fee_terms"):
            b1, b1_ev = 2, ('Says something about how it charges, without a figure and without a '
                            'flat fee: "%s"' % tx["fee_terms"]["quote"][:180])
        else:
            b1, b1_ev = 0, ("Nothing about what the work costs on any of the %d page%s we read, "
                            "which in this practice is the question a client asks first"
                            % (tx.get("pages_read") or 0,
                               "" if tx.get("pages_read") == 1 else "s"))
        out.append(sub("B1", b1, "firm", b1_ev, label_override="Fee terms published"))

        # One point per stage of the deal the firm names, to five. A page naming the title
        # search, the survey, the lien search, the estoppel and the settlement statement is
        # explaining the transaction; a page naming one is mentioning it.
        stages = tx.get("stages") or []
        named = ", ".join(stages[:5]) + ("" if len(stages) <= 5 else ", and more")
        out.append(sub("B2", min(5, len(stages)), "firm",
                       ("Explains %d stage%s of the transaction: %s"
                        % (len(stages), "" if len(stages) == 1 else "s", named))
                       if stages else
                       ("Names none of the stages of a closing on the %d page%s we read"
                        % (tx.get("pages_read") or 0,
                           "" if tx.get("pages_read") == 1 else "s")),
                       label_override="The transaction explained"))

        # Who holds the money. Every firm doing this work holds client funds and every one of
        # them could say where, so silence is the firm's choice rather than a limit of ours,
        # which is what makes it scorable at all.
        if tx.get("escrow") and tx.get("escrow_location_named"):
            b3, b3_ev = 4, ('Publishes how client funds are held and where: "%s"'
                            % tx["escrow"]["quote"][:180])
        elif tx.get("escrow"):
            b3, b3_ev = 2.5, ('Mentions the escrow or trust account without saying where it is '
                              'held: "%s"' % tx["escrow"]["quote"][:180])
        else:
            b3, b3_ev = 0, ("Says nothing about who holds the deposit or where, on any of the "
                            "%d page%s we read" % (tx.get("pages_read") or 0,
                                                   "" if tx.get("pages_read") == 1 else "s"))
        out.append(sub("B3", b3, "firm", b3_ev, label_override="Escrow disclosed"))

    elif rp and rp.get("readable"):
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
    # D2 is a percentile, so it needs the peers measured as well as the firm. A cohort assembled
    # before its Ahrefs run has neither, and a cohort part-way through has too few peers for a
    # percentile to mean anything: five is the floor, below which this stays pending rather than
    # ranking a firm against two neighbours.
    measured = [f for f in (cohort["firms"] if cohort else []) if f.get("dr") is not None]
    if ah and cohort and len(measured) >= 6:
        peers = [f for f in measured if f["domain"] != firm["domain"]]
        p_dr = pct(ah["dr"], [f["dr"] for f in peers]); p_rd = pct(ah["refdomains"], [f["refdomains"] for f in peers])
        p_kw = pct(ah["org_keywords"], [f["org_keywords"] for f in peers]); p_tr = pct(ah["org_traffic"], [f["org_traffic"] for f in peers])
        p_vis = (p_kw + p_tr) / 2
        pts = scale(p_dr, 3) + scale(p_rd, 2) + scale(p_vis, 2)
        brand = A.get("D2_brand"); pts += brand["pts"] if brand else 0
        med = statistics.median([f["dr"] for f in measured])
        ev = (f"DR {ah['dr']} → {p_dr}th pct of {len(peers)}-firm cohort (median {med:g}) {scale(p_dr,3)}/3 · "
              f"{ah['refdomains']:,} referring domains, {p_rd}th pct {scale(p_rd,2)}/2 · "
              f"{ah['org_keywords']:,} organic keywords / {ah['org_traffic']:,} visits·mo, {round(p_vis)}th pct {scale(p_vis,2)}/2 · "
              f"brand demand {brand['pts'] if brand else 0}/1" + (" (illustrative)" if brand and brand.get("source","illustrative")=="illustrative" else " (pending)" if not brand else ""))
        out.append(sub("D2", pts, "ahrefs", ev))
    else: out.append(assessed("D2", "Ahrefs data not yet collected for this market"))

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
    # The last point is for publishing the figure the firm actually charges, and what that
    # figure is depends on the practice. Written as a contingency percentage it was a real
    # differentiator sitting empty, because every injury firm says "no fee unless we win" and
    # none says what the fee is. In the other two practices it was not empty, it was impossible:
    # a real estate closing is priced as a flat fee and has no percentage, and Rule 1.5(d)(5)(i)
    # forbids a contingent fee in a matrimonial matter outright. Sixty-two firms, a fifth of the
    # directory, were scored out of six on a point their practice does not allow, and every one
    # of their profiles carried the sentence "the fee percentage itself is not published".
    #
    # So the question is the same in each practice and the form of the answer is not: the
    # percentage in an injury matter, the flat fee at a closing, the rate or retainer in a
    # divorce. In every case it has to be a number. A firm advertising "Transparent Flat Fees"
    # has named its model, which the two points above already pay for, and has not said what it
    # charges.
    statement = firm.get("fee_statement") or ""
    primary = (firm.get("practices") or [{}])[0].get("slug")
    if primary in DOMESTIC:
        block = firm.get("domestic") or {}
        quotes = [(block.get(k) or {}).get("quote") or ""
                  for k in ("hourly", "retainer_figure", "flat_fee", "fee_terms")]
        figure_word = "the rate, retainer or flat fee itself is not published"
    elif primary in TRANSACTIONAL:
        block = firm.get("transaction") or {}
        quotes = [(block.get(k) or {}).get("quote") or ""
                  for k in ("flat_fee", "price", "fee_terms")]
        figure_word = "the flat fee itself is not published"
    else:
        quotes = None
        figure_word = "the fee percentage itself is not published"
    if quotes is None:
        states_figure = bool(re.search(
            r"(\d{2}(?:[.,]\d+)?\s*(?:%|percent)|33\s*1/3|one[-\s]third)", statement, re.I))
    else:
        states_figure = any(FEE_FIGURE.search(q) for q in quotes)
    e1 = ((1 if firm.get("free_consultation") else 0) + (2 if stated else 0)
          + (2 if statement else 0) + (1 if states_figure else 0))
    # The firm's own sentence is quoted rather than merged into ours. One Boston firm publishes
    # "NO FEE UNLESS WE WIN — GUARANTEED!", and running those words into our evidence line put
    # an em dash into this directory's prose, which is a house rule: the dash is the firm's and
    # tidying somebody's own words is not ours to do, so the quotation marks say whose they are.
    e1_ev = ("Free consultation · " if firm.get("free_consultation") else "") + \
        ("“%s”" % statement if statement
         else (model if stated else "fee model not published")) + \
        ("" if states_figure else " · " + figure_word)
    out.append(sub("E1", e1, "observed", e1_ev))
    langs = [l for l in firm.get("languages", []) if l.lower() != "english"]
    av = " ".join(firm.get("availability", [])).lower()
    e3 = min(3, 1.5 * len(langs)) + (1 if "video" in av or "ada" in av else 0)
    out.append(sub("E3", e3, "observed", ", ".join(firm.get("languages", [])) + (" · video consults" if "video" in av else "")))
    e4 = ((2.5 if "24/7" in av else 0)
          + (2.5 if any(w in av for w in ("hospital", "home", "evening", "weekend")) else 0))
    out.append(sub("E4", e4, "observed", " · ".join(firm.get("availability", [])) or "no availability published"))

    # ---- aggregate ----
    # A firm whose site refuses our crawler cannot be measured on anything that lives on a site,
    # and the first draft of this scored all of it zero: pillar B read "the firm publishes no case
    # results we could read" and D4 read "no JSON-LD detected", about pages nobody here had
    # opened. That is the error this engine exists to avoid, stated about a real business, so
    # every site-derived sub-factor is pending for such a firm and the profile says why.
    #
    # What survives is everything measured somewhere else: the reviews and offices from verified
    # Google listings, PageSpeed, which Google measures from its own infrastructure, and the
    # domain's age from RDAP.
    if firm.get("site_blocked"):
        reason = ("The firm's site answers our crawler with a 403, so nothing that lives on a "
                  "site could be read for this firm. Not a finding about the firm.")
        for x in out:
            if x["code"] in SITE_DERIVED and not any(
                    w in (x["source"] or "").lower() for w in NOT_A_FINDING):
                x["pts"], x["source"], x["evidence"] = 0, "pending", reason

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
    # "pending" was the only source treated as unassessed, and NOT_A_FINDING exists precisely
    # because there are several ways of not having looked. A5 brought the difference to a head: a
    # firm whose bios we could not all read, and where we found no membership, reports "partial",
    # and counting that as an assessed zero would charge the firm six points for the reach of our
    # own crawl. The same vocabulary the gates use, for the same reason.
    def spread(codes):
        earned = assessable = 0.0
        for pk in codes:
            for x in pillars[pk]["subs"]:
                if not any(w in (x["source"] or "").lower() for w in NOT_A_FINDING):
                    earned += x["pts"]; assessable += x["max"]
        return earned, assessable

    earned_all, assessed_all = spread(PILLAR_MAX)
    earned_abc, assessed_abc = spread("ABC")
    total = round(100 * earned_all / assessed_all) if assessed_all else 0
    abc_pct = (earned_abc / assessed_abc) if assessed_abc else 0.0

    # Coverage is a share of what this market lets anyone measure, not of a flat hundred.
    #
    # There is a real difference between a check we have not run and a check that cannot be run
    # where the firm practises. "pending" is ours to fix and counts against us. "no queryable
    # source" is a fact about the state: Maryland publishes no attorney register we are permitted
    # to query, so A2 and A6 have no source there for anybody, us or a competitor. Dividing by a
    # hundred put every Maryland firm at 0.55 coverage against a 0.60 minimum and pillar A at 12%
    # against 50%, which capped an entire state at Listed for something no firm in it can change.
    # That is the same error as scoring our own reach, three floors up: it published a fact about
    # Maryland as a fact about the firm.
    #
    # So the denominator is the scale that exists here. A state that publishes less has a shorter
    # ladder, not an unclimbable one, and the profile says which rungs its state does not have.
    def market_scale(codes):
        total_max = absent = 0.0
        for pk in codes:
            total_max += PILLAR_MAX[pk]
            for x in pillars[pk]["subs"]:
                if any(w in (x["source"] or "").lower() for w in NO_SOURCE_IN_MARKET):
                    absent += x["max"]
        return total_max, absent

    all_max, all_absent = market_scale(PILLAR_MAX)
    assessable_all = all_max - all_absent
    coverage = assessed_all / assessable_all if assessable_all else 0.0
    pillar_cover = {}
    for pk in PILLAR_MAX:
        pk_max, pk_absent = market_scale(pk)
        room = pk_max - pk_absent
        pillar_cover[pk] = (spread(pk)[1] / room) if room else 1.0
    coverage_ok = (coverage >= MIN_COVERAGE
                   and all(pillar_cover[pk] >= MIN_PILLAR_COVERAGE for pk in "ABC"))
    abc = round(earned_abc)
    # A gate has three real states, not two. "Not eligible" is a finding — the firm failed a
    # documented check — while a gate we have not run yet says nothing about the firm. Calling
    # the second one "Not eligible" publishes a false statement about a real business, so an
    # unchecked gate (source contains "pending" or "partial", the same convention the
    # sub-factors use) puts the firm under review instead.
    # Only the gates the methodology has. GATES is the authority on that set, and reading the
    # profile's whole block instead let a retired one back in: scripts/check_g4.py wrote G4
    # into twenty-seven profiles, every one of them lost its Verified tier to a sixth gate that
    # does not exist, and the firms had done nothing. A key here that GATES does not name is an
    # artefact of some other script, not a gate.
    gates = {k: v for k, v in (firm.get("gates") or {}).items() if k in GATES}
    def unchecked(g):
        return not g["pass"] and any(w in g.get("source", "").lower() for w in NOT_A_FINDING)
    # A gate has a fourth state, and missing it capped a whole state at Listed. "Pending" is work
    # we owe. "No queryable source" is a fact about where the firm practises: Maryland publishes
    # no attorney register we are permitted to query and no business register either, so G1 and
    # G3 have no answer there for us or for anyone else. Treating those two as unfinished work
    # meant every Maryland firm sat at Listed forever for something no firm in Maryland can
    # change, which is the same mistake as scoring our own coverage.
    #
    # So they neither block nor pass. They are counted, the number travels with the score, and
    # the profile says which checks the firm's state does not allow. A gate that failed still
    # blocks, and a gate we have merely not run still blocks.
    def no_source(g):
        return any(w in (g.get("source") or "").lower() for w in NO_SOURCE_IN_MARKET)
    # And a fifth state, which is the fourth one seen from the other side. "No queryable source"
    # is a fact about the market: nobody can run this check on any firm there. "Unresolvable" is
    # a fact about this firm's paperwork against a source that does exist and that we did read.
    # Two shapes of it turned up, and holding a firm down for either was the Florida mistake
    # again in a different costume:
    #
    #   New York does not require a general partnership to file with the Department of State, so
    #   the entity register has nothing to return for one and never will. The evidence we already
    #   wrote said in so many words "this is not evidence against the firm", and the engine
    #   demoted the firm anyway.
    #
    #   A common name matches several registrations, one of which carries an adverse status, and
    #   nothing in the register ties that entry to this firm's attorney or rules it out. A firm
    #   should not sit below its score because a stranger shares a name with somebody who works
    #   there. It is also the thing our own register article is about.
    #
    # A check we have merely not run still blocks, and a check that ran and found something still
    # blocks. This is neither. The reason is written on the gate record by whichever script did
    # the reading, because that script is the only thing that knows why the source came back
    # empty, and it travels to the profile so the limit is published rather than hidden.
    def unresolvable(g):
        return bool(g.get("unresolvable"))
    unavailable_gates = [k for k, g in gates.items() if not g["pass"] and no_source(g)]
    unresolvable_gates = [k for k, g in gates.items()
                          if not g["pass"] and unresolvable(g) and k not in unavailable_gates]
    excused = set(unavailable_gates) | set(unresolvable_gates)
    pending_gates = [k for k, g in gates.items() if unchecked(g) and k not in excused]
    failed_gates = [k for k, g in gates.items()
                    if not g["pass"] and not unchecked(g) and k not in excused]
    gates_ok = (len(gates) == len(GATES) and not pending_gates and not failed_gates)
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
    # An excused gate must never be reported as one that passed. "All five passed" is a claim
    # about evidence, and a gate the register could not answer produced none, so a firm that
    # clears the rest is described as clearing the rest and the excused ones are named.
    passed_count = len(GATES) - len(excused)
    excused_note = (f"{len(excused)} could not be answered from the available records "
                    f"({', '.join(sorted(excused))}) and {'does' if len(excused) == 1 else 'do'} "
                    f"not count against the firm. " if excused else "")
    verdict = ((f"All {len(GATES)} eligibility gates passed. " if not excused
                else f"{passed_count} of {len(GATES)} eligibility gates passed. " + excused_note)
               if gates_ok
               else f"Eligibility gates not passed: {', '.join(sorted(failed_gates))}. " if failed_gates
               else f"{len(pending_gates) or len(GATES) - len(gates)} eligibility gate(s) still to be checked. " + excused_note) + \
              coverage_note + \
              f"Strongest pillar: {max(pillars, key=lambda p: pillars[p]['score']/pillars[p]['max'])}; most headroom in pillar {lowest} ({pillars[lowest]['score']}/{pillars[lowest]['max']})."
    return {"total": total, "tier": tier, "verdict": verdict, "computed_at": TODAY, "methodology": METHOD,
            "pillars": pillars, "floor_abc": abc, "next_tier": nxt,
            "raw": round(earned_all, 1), "assessed": round(assessed_all),
            "coverage": round(coverage, 3), "floor_abc_pct": round(abc_pct, 3),
            # Which checks the firm's state does not allow anyone to make, so a profile can say
            # so as a fact about the state rather than leaving a reader to wonder what is missing.
            "gates_unavailable": sorted(unavailable_gates),
            # Which checks ran against a real source and could not resolve for a reason that is
            # not this firm's doing. Kept apart from gates_unavailable because the two say
            # different things to a reader: one is "nobody can check this here" and the other is
            # "we checked and the record cannot answer for this firm".
            "gates_unresolvable": sorted(unresolvable_gates),
            "assessable": round(assessable_all),
            # Whether the total may be set beside another firm's. See MIN_SCORE_COVERAGE.
            "comparable": coverage >= MIN_SCORE_COVERAGE}

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
