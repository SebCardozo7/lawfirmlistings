# Fifty guides, chosen by what people search for

Working plan for the Guides section, rewritten 2026-10-04 from keyword research rather than from
which fields in the directory happened to be filled. The first version of this file did it the
other way round and produced fifty titles nobody searches for. This one starts from search
demand and uses the directory only where it adds something a competitor cannot: a real firm, a
real state, a real count.

Every item carries **monthly US search volume, keyword difficulty and traffic potential from
Ahrefs**, read on 2026-10-04. Items with no figure beside them were not returned at the volume
floor used (400 to 900 a month depending on the family) and are marked **VERIFY** rather than
guessed at.

## The rules that still bind

1. **Never a geographic or practice ranking.** Anything phrasable as "best `<practice>` lawyers in
   `<city>`" belongs to `/cities/<city>/<practice>/` and `/practice-areas/<practice>/`. Nothing on
   this page is one. The head terms that are (`car accident lawyer`, 401,000 a month at KD 0;
   `car accident attorney`, 137,000 at KD 4; `workers comp lawyer`, 27,000 at KD 0) are recorded
   at the bottom as **landing-page work**, because that is where they belong.
2. **House style holds, and titles are written for the search result.** No em dashes. Plain
   declarative sentences. No marketing adjectives. American English. Since 2026-10-04 the title
   leads with the head term exactly as people type it, then gives a reason to click: the year, the
   number that answers the query, or the question itself. At or under 70 characters. A figure in a
   title is computed from the research file, never typed, and the page declares `figuresFrom`, which
   is what lets `check_meta.mjs` pass it.
3. **Reference pieces cite their source and date it.** These guides are not computed from the
   firms collection, so the rule that every figure comes from `getCollection` does not apply to
   them. The rule that does apply is the one the existing reference guides already follow
   (`how-many-lawyers-in-new-york`, `average-lawyer-hourly-rate`): kicker `Reference`, every figure
   attributed to a named primary source with the date it was read, and `lfl:figures-from` declared
   so a dated figure passes the meta check. A settlement figure comes from the court's approval
   order or the administrator's official site, never from a news summary of either.
4. **Never a dollar amount for a firm's result the record does not mark verified.** Unchanged.

## Where client firms can be linked, and where they cannot

Eight firms are client firms of the agency. All eight are published and all eight are `verified`,
which is the tier at which the profile and card templates already give a firm's own site a
followed link. A guide adds a second, in-content link where the firm is the example the page is
genuinely about. The rule from `src/pages/firms/[slug].astro` stands: *selling followed links is a
link scheme and the penalty would land on this site*, so a client appears where a stated rule
puts it there, and the page prints the rule.

| Client | State | Practice | Score | Natural home in this plan |
| --- | --- | --- | --- | --- |
| Lopez & Humphries, P.A. | FL | injury | **86**, highest in the directory | Florida statute of limitations; Florida settlement pieces |
| Fielding Law | TX | injury | 64 | Texas statute of limitations; Texas settlement pieces |
| Goodwin Law, P.A. | FL | real estate | 61 | Florida statute of limitations, property and contract rows |
| Greenstein & Pittari, LLP | NY | injury | 60 | New York statute of limitations; New York settlement pieces |
| Paulson Coletti Trial Attorneys PC | OR | injury | 59 | Oregon statute of limitations |
| Brooks Law Firm | MA | injury | 56 | Massachusetts statute of limitations |
| Malloy Law Offices, LLC | MD | injury | 46 | Maryland statute of limitations |
| Sarkisian Sarkisian & Associates P.C. | IN | injury | 43 | Indiana statute of limitations |

**The honest map.** Client links fit naturally in **family B** (statute of limitations, one page per
state: seven of the eight clients are the highest-scoring verified injury firm in their state or
close to it, and the page can say so) and in **family D** (settlement values for injuries, which
link to verified injury firms by state). They do **not** fit in family A (class actions: no client
does that work), family C (immigration: no client does it) or family E (divorce, workers'
compensation, expungement: no client does them). That is **20 of the 50 pieces** with a natural
client placement. Forcing a link into the other thirty would be the thing the site promises in six
places it does not do.

**The selection rule a state page prints:** "The verified injury firms in `<state>` are ranked at
`/cities/<city>/personal-injury/`. The highest-scoring is `<firm>`." Computed, not chosen. In
Florida that firm is Lopez & Humphries today because it holds the only 86 in the directory.

## Images, which every one of these needs

The site draws its own: `CoverArt.astro` holds one vector scene per guide, and the charts are
HTML. Nothing is stock and nothing is generated at request time, which is a position the site
states on the record. These pieces keep that and extend it. Each one carries a cover scene plus
**two to four inline figures** of the kinds the content actually needs:

- **A timeline** for every class action piece: filing, consolidation, class certification,
  preliminary approval, notice, claims deadline, final approval, payout. Drawn as SVG in the
  house palette, dates from the docket.
- **An eligibility flowchart** where the rules branch: "Were you a customer between X and Y? Did you
  receive a notice? Which tier?"
- **A payout breakdown** where the fund splits into tiers, as a `StackBar`.
- **A state table rendered as a figure** for the statute pages: the deadline per claim type, with
  the discovery rule and tolling exceptions marked.
- **A process diagram** for the immigration pieces: the forms, the steps, the waits.

Photographs are not in scope. There is no licensed source for them, and a timeline of a settlement
is more useful to the reader than a photograph of a gavel.

## Writing

Long form, and written to be the best page on the result, not the shortest. Every class action
piece is an **account of what happened**, not a claim form with a logo: the conduct, the people
it reached, who sued and where, each step that led to the settlement and why the parties took it,
the terms and what they mean per person, and then and only then how to claim. The house style
holds throughout. The reader should finish knowing the story, not just the deadline.

---

# The fifty

## A. Class action settlements, as the full account of what happened (15)

The largest and least contested demand in all of this research, and none of it touches a landing
page. Each piece is the complete story of one case. Sources, in order of authority: the court's
docket and orders (CourtListener is free and `scripts/check_discipline.py` already reads it), the
settlement's official website and its administrator (Kroll, Epiq, JND, Angeion), the regulator's
filing where there is one, and the press only for context. **Every one of these has a claims
deadline and a payout date, so each carries its dates in the markup and is re-read on the monthly
refresh.** The hub comes first so the others have a parent.

1. **How a class action settlement works, and the ones open right now.** The hub. Targets the
   explainer intent under `kroll settlement administration` (25,000/mo, KD 7, TP 6,800), which is
   people asking why an administrator's name is on their check. Links to every piece below.
   *SEO title:* "Class Action Settlements Open Now: How to Claim and Get Paid (2026)"
2. **The AT&T data breach settlement.** `at&t data breach settlement` **77,000/mo, KD 3, TP 60,000**;
   `att settlement` 42,000 KD 4; `at&t settlement payout date` 18,000 KD 7 TP 55,000;
   `at&t data breach settlement claim` 15,000 KD 3; `att settlement claim` 11,000 KD 2. The
   largest cluster on this page, roughly 190,000 searches a month between KD 0 and 7.
   *SEO title:* "AT&T Data Breach Settlement: Who Qualifies, How Much, When It Pays"
3. **The Facebook user privacy settlement.** `facebook settlement` 61,000 KD 11 TP 37,000;
   `facebook user privacy settlement` 42,000 **KD 0**; `facebook privacy settlement` 17,000 KD 11;
   `facebook settlement payments` 10,000 KD 0; `facebook settlement payout` 9,300 KD 11.
   *SEO title:* "Facebook Privacy Settlement: Payout Amounts and Payment Dates"
4. **The Cash App settlement.** `cash app class action lawsuit settlement` 67,000 KD 15;
   `cash app settlement` 27,000 **KD 0** TP 35,000; `cash app settlement eligibility` 20,000 KD 4.
   *SEO title:* "Cash App Settlement: Who Is Eligible and How Much You Get"
5. **The Amazon Prime settlement.** `amazon prime settlement` 50,000 **KD 0**; `amazon settlement`
   30,000 KD 10 TP 37,000; `amazon prime refunds settlement` 12,000 KD 3 TP 43,000.
   *SEO title:* "Amazon Prime Settlement: Who Gets a Refund and How Much"
6. **The Capital One settlement.** `capital one class action settlement` 26,000 **KD 0** TP 40,000;
   `capital one $425 million settlement` 23,000 KD 12; `capital one settlement` 17,000 KD 7.
   *SEO title:* "Capital One Settlement: Who Gets Paid From the $425 Million"
7. **The Blue Cross Blue Shield settlement.** `bcbs settlement` 26,000 **KD 0**;
   `blue cross blue shield settlement` 13,000 KD 0 TP 23,000.
   *SEO title:* "Blue Cross Blue Shield Settlement: Who Gets Paid and How Much"
8. **The Wells Fargo settlement.** `wells fargo $56.85 m settlement` 39,000 **KD 0**.
   *SEO title:* "Wells Fargo $56.85M Settlement: Who Qualifies and How to Claim"
9. **The Krispy Kreme data breach settlement.** 14,000 KD 6 TP 5,100.
   *SEO title:* "Krispy Kreme Data Breach Settlement: Eligibility and Payouts"
10. **The Comcast data breach settlement.** 11,000 **KD 0**.
    *SEO title:* "Comcast Data Breach Settlement: How to Claim and What You Get"
11. **The Lakeview data breach settlement.** 10,000 KD 2 TP 3,900.
    *SEO title:* "Lakeview Data Breach Settlement: Who Qualifies and How to File"
12. **The Apple settlement.** `apple settlement` 9,800 **KD 0**, parent `apple pay settlement`.
    *SEO title:* "Apple Settlement 2026: Which Case, Which Devices, How Much"
13. **The Nelnet settlement.** 9,100 KD 1, parent `nelnet` with TP 542,000, which is the brand
    term and not ours; the settlement intent is the slice we take.
    *SEO title:* "Nelnet Data Breach Settlement: What Borrowers Can Claim"
14. **The Credit One robocalls settlement.** 9,100 KD 2 TP 4,500.
    *SEO title:* "Credit One Robocall Settlement: Who Qualifies and the Payout"
15. **Settlement checks, and how to tell a real one from a scam.** The consumer-protection
    companion the hub needs, under the `kroll settlement` intent (10,000 KD 15 TP 30,000).
    *SEO title:* "Is My Settlement Check Real? How to Spot a Class Action Scam"

## B. Statute of limitations, one hub and one page per state we cover (14)

`statute of limitations` is **58,000/mo at KD 0**, with `statute of limitations by state` (3,200,
KD 0) and `what is the statute of limitations` (2,800, KD 0) beside it. Evergreen, reference-shaped,
and the structure the directory already has: thirteen states, each with verified firms to point
to. Each state page carries a table by claim type (personal injury, medical malpractice, property
damage, contract, wrongful death), the discovery rule, the tolling exceptions, and the statute
cited. **This is the family where client links are natural**, because every state page ends with
the verified injury firms in that state and names the highest-scoring one by rule.

16. **The hub.** 58,000 KD 0, plus the two sub-questions above. Explains the concept, the
    discovery rule, tolling, and links to every state.
    *SEO title:* "Statute of Limitations by State: Every Deadline in One Table"
17. **California.** 3,500 KD 13 TP 5,100; `statute of limitations in california` 1,700 KD 7;
    `california statute of limitations` 1,000 KD 13. 105 San Diego firms.
    *SEO title:* "California Statute of Limitations 2026: Every Deadline by Claim"
18. **Texas.** 3,300 KD 12; `texas statute of limitations` 900 KD 19; `what is the statute of
    limitations in texas` 600 KD 12. 156 firms. **Fielding Law.**
    *SEO title:* "Texas Statute of Limitations 2026: The 2-Year Rule and Its Exceptions"
19. **Florida.** 2,200 KD 14 TP 1,400; `florida statute of limitations` 1,000 **KD 0**. 222 firms.
    **Lopez & Humphries** (the directory's highest score) and **Goodwin Law** for the property and
    contract rows.
    *SEO title:* "Florida Statute of Limitations 2026: Why You Now Have 2 Years, Not 4"
20. **New York.** `statute of limitations ny` 1,300 KD 7 TP 7,400. 192 firms. **Greenstein &
    Pittari.**
    *SEO title:* "New York Statute of Limitations 2026: 3 Years, or Just 90 Days"
21. **Georgia.** 1,300 **KD 0**. 80 Atlanta firms.
    *SEO title:* "Georgia Statute of Limitations 2026: How Long You Have to Sue"
22. **Pennsylvania.** `statute of limitations pa` 1,000 KD 7. 71 Philadelphia firms.
    *SEO title:* "Statute of Limitations PA: Pennsylvania Deadlines by Claim (2026)"
23. **Illinois.** 1,000 **KD 0**. 103 Chicago firms.
    *SEO title:* "Illinois Statute of Limitations 2026: Deadlines by Type of Case"
24. **Arizona.** 700 KD 15. 100 Phoenix firms.
    *SEO title:* "Arizona Statute of Limitations 2026: How Long You Have to Sue"
25. **Oregon.** 600 KD 1. 20 Portland firms. **Paulson Coletti.**
    *SEO title:* "Oregon Statute of Limitations 2026: Deadlines, Notice and Exceptions"
26. **Maryland.** **VERIFY**: not returned at 400/mo. 31 Baltimore firms. **Malloy Law.**
    *SEO title:* "Maryland Statute of Limitations 2026: The 3-Year Rule, Explained"
27. **Massachusetts.** **VERIFY**: not returned at 400/mo. 28 Boston firms. **Brooks Law Firm.**
    *SEO title:* "Massachusetts Statute of Limitations 2026: Deadlines by Claim"
28. **Nevada.** **VERIFY**: not returned at 400/mo. 84 Las Vegas firms.
    *SEO title:* "Nevada Statute of Limitations 2026: How Long You Have to File"
29. **Indiana.** **VERIFY**: not returned at 400/mo. 13 Northwest Indiana firms. **Sarkisian.**
    *SEO title:* "Indiana Statute of Limitations 2026: The 2-Year Rule and Exceptions"

Two variants that returned real volume and belong inside this family rather than as separate
pages: **medical malpractice** (`medical malpractice statute of limitations` 1,400 KD 0, plus 700
KD 3) gets its own row on every state page and a section on the hub, and **sexual assault**
(2,700 KD 6, 2,300 KD 14, 2,100 KD 8) is large enough to be a sixteenth page in this family if a
person decides to write it; it is deliberately not listed here, because that page has to be
written with care that a plan cannot promise.

## C. Immigration: process, timing and status (10)

A cluster that is almost entirely KD 0 to 15 and almost entirely procedural, which is a shape the
site can write honestly: the form, the step, the wait, the source. The directory's 115 immigration
firms in Miami are the internal link. **No client firm does this work, so no client link.**

30. **Renewing a green card.** `green card renewal` 25,000 KD 7 TP 52,000; `renew green card`
    7,100 **KD 0 TP 99,000**; `renew green card online` 3,600 KD 7. Parent topic `i-90`.
    *SEO title:* "Green Card Renewal 2026: How to Renew With Form I-90, Step by Step"
31. **The Diversity Visa lottery.** `green card lottery` 19,000 **KD 0**; `green card lottery 2027`
    8,200 **KD 0 TP 82,000**; `green card lottery 2026` 3,300 KD 0.
    *SEO title:* "Green Card Lottery 2027: Dates, Eligibility and How to Apply"
32. **Checking lottery results.** `green card lottery results` 3,300 **KD 0 TP 17,000**.
    *SEO title:* "Green Card Lottery Results: How to Check and What Happens Next"
33. **Green card holders and ICE detention.** `green card holder ice detention` 14,000 KD 1
    TP 6,800; `ice green card detention` 3,800 KD 0; `ice detains green card holder` 3,200 KD 0.
    Parent `can you get deported with a green card`. Written from the statute and the case law,
    with care.
    *SEO title:* "Can a Green Card Holder Be Detained by ICE? Your Rights in 2026"
34. **How long a green card takes.** `green card processing time` 3,300 **KD 0**; `how long does it
    take to get a green card` 3,300 KD 15 TP 3,500.
    *SEO title:* "Green Card Processing Time 2026: How Long Each Category Takes"
35. **The green card backlog.** 4,300 KD 15 TP 1,400.
    *SEO title:* "Green Card Backlog 2026: Why the Wait Is Years, and for Whom"
36. **The National Interest Waiver.** `niw green card` 3,300 **KD 0 TP 23,000**.
    *SEO title:* "NIW Green Card: Who Qualifies for the National Interest Waiver"
37. **Self-deportation.** `self deportation` 5,400 **KD 0**; `self-deportation` 4,800 KD 12.
    *SEO title:* "Self-Deportation: What It Means and How It Affects Your Future"
38. **Travel on a green card.** `green card holder travel restrictions` 4,200 KD 18 TP 2,700.
    *SEO title:* "Green Card Holder Travel Restrictions: The Rules Before You Fly"
39. **Reading a green card.** `green card number` 3,500 **KD 0** TP 4,400; `what does a green card
    look like` 3,200 KD 0.
    *SEO title:* "Green Card Number: Where to Find It and What Each Field Means"

## D. What a case is worth: settlement values by injury (6)

The money questions in personal injury. The volume returned is thinner than the two families
above and the long tail needs its own sweep, so the family is kept to six and the rest is marked.
**Client links are natural here**: every piece ends with the verified injury firms in the reader's
state. The house rule stands throughout: published ranges come from a named source, and never
from a firm's own unverified results page.

40. **The hub.** The "how much is my case worth" question, by injury type and by state.
    **VERIFY** the head term's volume; the sub-queries below are what returned.
    *SEO title:* "How Much Is My Personal Injury Case Worth? Settlement Values"
41. **Back and neck injuries after a car accident.** `average settlement for car accident back and
    neck injury` **7,200 KD 0**, parent `lower back pain after car accident compensation`.
    *SEO title:* "Average Settlement for Back and Neck Injury After a Car Accident"
42. **Workers' compensation settlements for surgery.** `average workers' comp settlement for
    surgery` 600 **KD 0**, parent `typical settlement for rotator cuff injury at work`.
    *SEO title:* "Average Workers' Comp Settlement for Surgery: What Decides It"
43. **Talcum powder lawsuits.** `average settlement for talcum powder lawsuit` 900 KD 4 TP 1,000.
    *SEO title:* "Talcum Powder Lawsuit Settlements: Average Payouts So Far"
44. **Asbestos claims.** `what is the average settlement for asbestos claim` 700 **KD 0**.
    *SEO title:* "Average Asbestos Settlement: What Claims Are Worth in 2026"
45. **Wrongful termination in California.** 600 **KD 0**, CPC $6.00. Not a practice the directory
    covers, so no internal link beyond the hub; listed because it returned and because the
    cluster is worth a sweep.
    *SEO title:* "Wrongful Termination Settlements in California: Average Payouts"

## E. The other practices: workers' compensation, divorce, expungement (5)

Smaller, clean clusters, one or two pieces each. **No client firm does this work, so no client
link**; the internal links are the practice hubs and the city rankings.

46. **How workers' compensation works.** `how does workers comp work` 4,600 **KD 0** TP 2,000.
    *SEO title:* "How Does Workers' Comp Work? Claims, Benefits and Deadlines"
47. **What workers' compensation covers.** Parent `what does workers comp cover` under
    `workers comp policy` 5,900 KD 8.
    *SEO title:* "What Does Workers' Comp Cover? Medical Bills, Wages and Limits"
48. **What a divorce costs, nationally.** `how much does a divorce cost` 4,400 **KD 0** TP 2,500.
    The New York version is already published; this is the national one it links from.
    *SEO title:* "How Much Does a Divorce Cost? Fees and Lawyer Costs by State"
49. **Expungement.** `expungement` 10,000 KD 14 TP 1,400. Criminal defense has just entered the
    directory with 85 New York firms.
    *SEO title:* "Expungement: What It Erases, Who Qualifies and How Long It Takes"
50. **Finding an expungement lawyer.** `expungement lawyer` 6,000 **KD 0**. Informational framing,
    not a ranking: what the lawyer does, what it costs, what to ask.
    *SEO title:* "Expungement Lawyer: What They Do, What It Costs, When You Need One"

---

## Landing-page work, recorded here because it is the biggest number in the research

Not guides. These are the head terms the generated pages should be targeting, and nobody has
checked whether they do:

| Term | Volume | KD | Page that should own it |
| --- | --- | --- | --- |
| `car accident lawyer` | **401,000** | 0 | `/practice-areas/personal-injury/` |
| `car accident attorney` | 137,000 | 4 | same |
| `car accident lawyers` | 54,000 | 6 | same |
| `workers comp lawyer` | 27,000 | 0 | `/practice-areas/workers-compensation/` |
| `workers comp attorney` | 14,000 | 0 | same |
| `expungement lawyer` | 6,000 | 0 | a criminal-defense hub, when one exists |
| `immigration lawyer free consultation` | 2,100 | 12 | `/practice-areas/immigration/` |

A caution on the KD 0 figures: Ahrefs difficulty is a backlink measure, and local-intent SERPs
read as KD 0 while being dominated by map packs and firms with decades of links. Read these as
"the page should exist and target the term", not as "this is easy".

## Publishing schedule: three a week

Set 2026-10-04, moved one week earlier on 2026-10-05 so the first week is not empty: **three guides a week, Monday, Wednesday and Friday**, one per run of the scheduled
content task. Each run writes the first item below whose date has arrived and is not yet written,
opens it as a PR against `main` (a person reads every guide before it merges), and logs it in the
client's Basecamp project when the piece places a client. Pieces that place a client go first.

| Date | Item | Client placed |
| --- | --- | --- |
| written 2026-10-04 | 18 Texas, 19 Florida, 20 New York (PR #96) | Fielding; Lopez & Humphries, Goodwin; Greenstein & Pittari |
| written 2026-10-05 | 25 Oregon (PR #105) | Paulson Coletti |
| 2026-10-07 | 26 Maryland | Malloy Law |
| 2026-10-09 | 27 Massachusetts | Brooks Law Firm |
| 2026-10-12 | 29 Indiana | Sarkisian |
| 2026-10-14 | 16 Statute of limitations hub | all seven state pages |
| 2026-10-16 | 41 Back and neck injury settlements | verified injury firms by state |
| 2026-10-19 | 2 AT&T data breach settlement | none |
| 2026-10-21 | 30 Green card renewal | none |
| 2026-10-23 | 17 California | none |
| 2026-10-26 | 31 Green card lottery 2027 | none |
| 2026-10-28 | 21 Georgia | none |
| 2026-10-30 | 3 Facebook privacy settlement | none |
| 2026-11-02 | 4 Cash App settlement | none |
| 2026-11-04 | 22 Pennsylvania | none |
| 2026-11-06 | 5 Amazon Prime settlement | none |
| 2026-11-09 | 23 Illinois | none |
| 2026-11-11 | 6 Capital One settlement | none |
| 2026-11-13 | 33 Green card holders and ICE | none |
| 2026-11-16 | 7 Blue Cross Blue Shield settlement | none |
| 2026-11-18 | 24 Arizona | none |
| 2026-11-20 | 8 Wells Fargo settlement | none |
| 2026-11-23 | 28 Nevada | none |
| 2026-11-25 | 40 Personal injury case value hub | verified injury firms by state |
| 2026-11-27 | 1 Class action settlements hub | none |

After that, the rest of family A in volume order, then C, D and E.

**How a client is placed** (as built in PR #96): the highest-scoring verified firm per state and
practice is computed and named, and a client's own page on the same deadline is listed under
"Further reading" only after it has been read and checked against the statute. Both links are
followed because every client is Verified, which is the profile rule.

**Research still owed before writing:** the family D long tail (one matching-terms sweep on
`settlement for` and `compensation for`), the four **VERIFY** states in family B at a lower volume
floor, and a `serp-overview` on each class action head term before it is written, so the page is
built against what actually ranks.

## Ahrefs spend for this plan

Three `keywords-explorer-matching-terms` calls on 2026-10-04: 1,485, 1,320 and 1,650 units, 4,455
in total, plus the free usage call. 363,730 of 800,000 used at the start of the day. Reset 19
October.
