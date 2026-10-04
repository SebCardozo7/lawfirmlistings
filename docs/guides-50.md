# Fifty guide topics, ranked and checked against the data

Working plan for the Guides section, written 2026-10-04 against the build at `8390c3ab`
(**1,252 published firms, 18 markets, 13 states, 6 practices, 1,348 pages**). It sits beside
`docs/guides-backlog.md`, which keeps the run-to-run research. This file is the queue.

Each item carries the field it would read and the **fill rate counted on this build**, because the
rule this section keeps relearning is that a topic is worth exactly as much as the data under it.
Items marked **COUNT FIRST** have not been counted yet and must be before anybody writes them.

**A first draft of this page was written against 1,167 firms and was already stale when it was
saved.** Commit `0b4ec007` had opened **New York criminal defense, 85 firms**, a sixth practice,
between the last guide run and this page. Every count below was redone against the current tree.
This is the sixth consecutive time the denominators moved underneath a piece of planning in this
section, and at a weekly cadence it will keep happening. Re-count before writing anything here.

**Practice counts on this build:** personal injury 973, immigration 115, **criminal defense 85**,
family law 42, real estate 20, workers' compensation 17.

## The two rules that bind every item below

1. **Never a geographic or practice ranking.** Anything phrasable as "best `<practice>` lawyers in
   `<city>`" belongs to `/cities/<city>/<practice>/` and `/practice-areas/<practice>/`, which are
   generated, already rank by score, and will outrank a guide aimed at the same query. Every item
   below is either a national cut on one published attribute, a method piece, or a study. None is
   a city-and-practice list.
2. **Every figure is computed from the firms collection at build time** with `getCollection`. A
   figure that cannot be computed from committed data does not go in a guide.

## How client firms get linked, which is settled and not a policy question

Eight firms are client firms of the agency. **All eight are already in the directory and all eight
carry `status: verified`** (checked 2026-10-04), which is the tier at which `src/pages/firms/[slug].astro` and
`src/components/FirmCard.astro` already give a firm's own website a **followed** outbound link:

```js
const gatesPassed = ['Verified', 'Certified', 'Distinguished', 'Elite'].includes(d.score?.tier ?? '');
const linkRel = gatesPassed ? 'noopener' : 'nofollow noopener';
```

The comment above that line settles the rest, and it was written before any of this came up:

> Claiming the profile does not change it, and neither does paying for anything — selling followed
> links is a link scheme and the penalty would land on this site.

So the link is **earned by clearing the gates**, and these eight have. What a guide adds is not a
link that did not exist; it is a second, contextual, in-content link from a page about a
measurement the firm actually wins. That link is editorial, which is what makes it worth having.

**The selection rule stays the one the published guides already use:** a named example is picked by
a stated rule (largest review count, highest score, top of the measure, with a slug tie-break), and
the page says the rule out loud. We choose the study; the data chooses the firm. Any other
arrangement contradicts what the site publishes in six places, among them the home page twice,
`/methodology/` and `/terms/`: **no firm can pay to rank, and the score, gates and tier cannot be
bought.** `/list-your-firm/` goes further and says a directory that claims this "and then asks you
to write for a rate card, is asking to be doubted."

### Where each client actually wins, counted on this build

Ranks are national out of 1,252 published firms. A tie group is marked, because several obvious
superlatives turn out to be shared by hundreds of firms and are therefore not superlatives.

| Client | Market | Score | The measures it genuinely leads on |
| --- | --- | --- | --- |
| Lopez & Humphries, P.A. | Lakeland, FL | **86** | **Highest certification score in the entire directory, and it is unique: one firm at 86, two firms at 80 or above, out of 1,252.** The strongest single fact available about any client. |
| Fielding Law | Dallas, TX | 64 | Domain age 24.6 years (#145); 4 of 5 trust pages (#53); 1,207 referring domains (#316); 822 reviews (#159) |
| Goodwin Law, P.A. | Naples, FL | 61 | Highest score in its market; E1 fees and access 5 of 6 (#3, but 148 firms share that value); 4 of 5 trust pages; the real estate cohort, 20 firms and badly under-written |
| Greenstein & Pittari, LLP | New York, NY | 60 | **7 offices (#34)**; domain age 24.8 years (#138); 1,013 reviews (#129); 5 bar associations (#41); 4 of 5 trust pages |
| Paulson Coletti Trial Attorneys PC | Portland, OR | 59 | **E1 fees and access 5 of 6, #3 nationally**; **6 bar associations named (#26)**; 5,658 monthly organic visits; 14 published results |
| Brooks Law Firm | Boston, MA | 56 | **56 attorneys named, #19 of 1,252**, and first in Boston; 22 published case results; 1,289 reviews (#106) |
| Malloy Law Offices, LLC | Baltimore, MD | 46 | **8 offices (#28)**; **1,929 reviews (#63)**; **PageSpeed 94 (#62)**; 4 of 5 trust pages (#53); 1,259 referring domains (#284) |
| Sarkisian Sarkisian & Associates P.C. | Northwest Indiana, IN | 43 | 4 of 5 trust pages, first in its market; 296 reviews; 8 attorneys named |

**Tie groups that are not superlatives and must not be written as one:** a 5.0 Google rating is
shared by **393** firms; publishing two or more languages by **663**; E1 at 5 of 6 by **148**. Only
**2** firms reach E1 at 6 of 6, and only **52** of 1,195 carry all five trust pages. Four of the
eight clients sit at four of those five pages, which is a concrete thing to tell a client to fix.

**Two corrections to the client list as supplied**, because briefing anybody off it would carry
them forward. The addresses are from each firm's own record:

- **Sarkisian & Sarkisian** was labelled Boston. Its offices are Portage and Valparaiso, **Indiana**.
- **Brooks Law Firm** was labelled Indiana. Its offices are Medford and Framingham, **Massachusetts**,
  plus Manchester, New Hampshire. The two labels appear to have been swapped.
- **Malloy Law** was labelled Washington DC. It has a DC office, but its headquarters is Bethesda
  and six of its eight offices are in Maryland, which is why the record places it in Baltimore.

---

# The fifty

Ordered by family. Within a family, the better-supported topics come first.

## A. Measured superlatives, the `best-law-firm-websites` mold (12)

The existing proof that this shape works: **`/guides/best-law-firm-websites/`**, "20 Best Law Firm
Websites, Measured", which names twenty firms, ranks them on a number Google publishes, and
competes against design agencies showing their portfolios rather than against our own landing
pages. Each item here names ten to twenty-five firms, so each is a real opportunity for a client
that leads the measure.

1. **The law firms with the highest certification score in the country.** `score.total`. One firm
   at 86 and two at 80 or above across 1,252. Leads with **Lopez & Humphries**. The cleanest item
   on this page and the one to write first.
2. **The law firms that publish all five trust pages.** `digital.trust_pages`, **52 of 1,195**
   carry all five. Scarce enough to be a real list. Four of the eight clients sit at four of five.
3. **The largest attorney rosters in the directory.** `attorneys[]`, **19 firms name 56 or more**,
   maximum 128, and **315 firms name none**. Leads with **Brooks Law Firm** at 56.
4. **The law firms with the most offices.** `offices[]`, **33 firms have 8 or more**. **Malloy Law**
   at 8 and **Greenstein & Pittari** at 7.
5. **The oldest law firm domains on the web.** `operating.years`, filled on **1,236**, range 0.1 to
   30.7 years. **Greenstein & Pittari** 24.8 and **Fielding Law** 24.6. The piece must say what the
   field is: a domain registration date over RDAP, a lower bound, never the firm's founding date.
6. **The law firms that name the most bar associations.** `accountability.bar_associations`,
   **66 firms name 5 or more**. **Paulson Coletti** at 6, which is #26.
7. **The most-reviewed law firms in the country.** `digital.places.review_count_total`, filled on
   all 1,252. National, not city-scoped, so it does not touch a landing page. **Malloy Law** 1,929,
   **Brooks** 1,289, **Greenstein & Pittari** 1,013.
8. **The law firms that publish the most case results.** `results_published.count`, filled on **1,213**.
   **Brooks** 22, **Fielding** 16, **Paulson Coletti** 14.
9. **The fastest law firm websites, a year on.** `digital.psi`, filled on **1,163**. A re-run of the
   existing piece on a directory three times the size. **Malloy Law** scores 94, which is #60
   nationally. Check against the existing guide before writing so the two do not duplicate titles.
10. **The law firms buying search ads.** `digital.ahrefs.paid_keywords`, **144 firms bid on at
    least one paid keyword**. Nobody publishes this about law firms and we hold it.
11. **The law firms that name a court in their case results.** `results_published.venues`,
    **98 of 1,252**. Thin, and previously killed as a *study* for that reason, but 98 named firms
    is a perfectly good *list*. Re-read the earlier finding first: every value was a New York
    county or court.
12. **The law firms with the most referring domains.** `digital.ahrefs.refdomains`, filled on **1,133**.
    **Malloy Law** 1,259 and **Fielding Law** 1,207.

## B. Method pieces, one per score component (10)

Each explains what one sub-factor measures, what it cannot, and names the firms at the top and
bottom of that specific measure. Five of these already exist; these are the gaps.

13. **What a bar association membership proves, and what it does not.**
    `accountability.bar_associations`, non-empty on a counted subset. The existing malpractice guide
    established the association half is partly a measure of our own pattern list, which this piece
    owes a reader. **Paulson Coletti** leads at 6.
14. **D4 and structured data: what a law firm's site tells a machine.** `digital.schema_detected`,
    filled on **all 1,252**, true on **1,141**. One of the few fields with complete coverage.
15. **C3 and review recency, and why nothing in this directory dates a review count.** The open
    problem recorded in the backlog: `review_count_total` has no second reading, so velocity cannot
    be measured. An honest method piece about a sub-factor we score and cannot verify.
16. **C5 and what a complaint share can and cannot show.** Reads the same 1.4% review sample the
    2026-09-25 guide established. Must inherit that guide's caveats rather than restate them.
17. **E4 and the 24/7 intake line nobody tests.** `availability`, **654 of 1,252**. The backlog already
    judged this "one paragraph long" as a study because we measure the claim and never test it.
    As a *method* piece about a scored sub-factor, that limitation is the subject.
18. **A5, A6 and the registers only one state lets us read.** `attorneys[].registry_status`, on
    **887 attorney records, every one in New York**. The piece has to be written in aggregate: never
    characterise a named attorney's registration beyond the record's own words.
19. **What a profile score is a share of.** `score.coverage`, `score.assessable`,
    `gates_unavailable`, `gates_unresolvable`. A sequel to the denominator guide now that the
    directory crosses 13 states and 6 practices rather than 3 states.
20. **Pillar B has three shapes and immigration fits none of them.** The open engine item 0g.
    Writable as a method piece the moment somebody decides what pillar B should read for an
    immigration matter. **Blocked on that decision, not on data.**
21. **What a disclaimer on a results page is for.** `results_published.disclaimer`, true on **194**.
22. **What an aggregate claim is worth.** `results_published.aggregate_claims`, non-empty on **213**.
    "Over $100 million recovered" as a category of statement, counted.

## C. Cross-practice and cross-market studies (10)

**New since this page was first drafted:** criminal defense arrived with **85 firms, all in New
York**, which is the same shape immigration had when it arrived and made the 2026-10-02 guide
possible. A practice that produces a plea or a dismissal rather than a recovery fits pillar B no
better than immigration does. Items 23 and 26 should both be checked against it before writing,
and it may well be a better study than either.

The shape of the piece published 2026-10-02: measure every firm, split by something, report what
the split shows including when it is boring.

23. **What a real estate practice publishes that an injury practice does not.** `transaction` on 20,
    `domestic` on 42. A 62-firm study against a 1,252-firm directory, which is the thing to weigh.
    Surfaces **Goodwin Law**, the only client in the real estate cohort.
24. **The case types law firms say they take.** `results_published.case_types`, non-empty on **523**.
    Well supported and never written.
25. **The amounts firms publish, and the ones we will not repeat.** `results_published.amounts`,
    non-empty on **476**. Must hold the line: never publish a dollar amount for a result the record
    does not mark verified.
26. **Does a bigger roster mean a better-rated firm?** `attorneys[]` against
    `digital.places.rating_weighted`. Both filled on most of the directory. Expect a boring answer,
    which is publishable.
27. **What changes when a firm opens a second office.** `offices[]` against the C pillar. Note the
    trap recorded in the backlog: `offices[]` and `places.listing_count` come from the same Places
    response, so compare offices against *reviews and score*, never against listing count.
28. **The thirteen states, and what a firm's address changes about what we can check.**
    `gates_unavailable` by state. Builds on the registers guide with ten more states.
29. **Do older firms publish more?** `operating.years` against `trust_pages` and
    `results_published`. Surfaces **Greenstein & Pittari** and **Fielding Law** at the old end.
30. **The firms whose website refuses to be read.** `site_blocked`, **5 firms** of 1,252. Tiny, and that is
    the point: a piece about what a directory does when it cannot measure.
31. **What a corporate register says about a law firm, in thirteen states.** `entity` on **256**, up from 203 before Florida's register was read.
    A re-run of the registers guide now that Florida's register has been read.
32. **COUNT FIRST. Which markets have the most firms per capita.** Needs a population source and a
    committed market list. Reference-shaped, not a ranking of firms.

## D. Consumer questions answered with counts (10)

The shape of `/guides/do-lawyers-offer-free-consultations/`: a question people actually search,
answered by measuring real firms rather than restating the law. The backlog's seven-run finding
holds, so check volume before committing: the consumer-phrased question is usually thin and the
industry-phrased one is not.

33. **How many lawyers does a law firm actually have?** `attorneys[]`, median 3, maximum 128,
    **315 firms name none**. Leads with **Brooks Law Firm**.
34. **Do lawyers publish their prices?** The two fee fields, 70 and **155**, already separated and
    documented in the backlog as open item 0c. Narrower and more honest than the existing fee guides.
35. **Does a law firm answer the phone at night?** `availability`, **654 of 1,252**.
36. **How long has this law firm existed?** `operating.years`. The piece has to lead with the
    caveat: this is a domain registration date and no firm in this directory publishes a founding
    year, because `founded_year` is absent on all 1,252 records.
37. **What does a five-star law firm look like?** **393 firms hold exactly 5.0.** The finding is
    that the rating does not separate them, which the reviews guides already support.
38. **Can you tell whether a lawyer is licensed?** `attorneys[].registry_status` on **887** records in
    one state. A consumer-facing companion to item 18.
39. **What is a law firm's website for?** `digital.trust_pages` against `digital.ahrefs.org_traffic`.
40. **Does the biggest firm get the best reviews?** `attorneys[]` against rating and review count.
41. **COUNT FIRST. What languages does a law firm publish in?** `languages`, **663** firms publish two
    or more, maximum 3. The Spanish piece is written; this is the multilingual cut and needs a
    check that the second language is ever anything but Spanish.
42. **COUNT FIRST. Who answers a legal question for free?** Needs a field we do not yet have.
    Recorded so nobody proposes it twice without checking.

## E. Directory-design and competitor pieces (5)

Out of the competitor rotation. These are the pieces only a directory that measures can write, and
they are the natural home for an outbound link to a competitor's own documentation.

43. **What a legal directory can actually filter on.** Nolo's directory cannot filter on rating,
    languages or years of experience; FindLaw's can filter on "Free Consultation Offered", a field
    the firm supplies about itself. We measured that same claim across the directory. The strongest
    item in this family.
44. **Five directories whose rating is fed by the rated party.** The backlog's item 4, now with five
    sourced cases: Avvo's participation score, Justia's paid Platinum and Gold tiers, Martindale's
    self-submitted peer references, Nolo's paid lead network, FindLaw's paid profiles. Every claim
    cites their own published documentation and we measure none of it.
45. **What a "free consultation" filter is worth.** A sequel to the piece published 2026-10-02,
    aimed squarely at the FindLaw facet.
46. **What this directory gets wrong.** The open engine items, published. The section has done this
    in halves inside other guides; a standing page would be the most credible thing on the site.
47. **COUNT FIRST. What a law firm review site owes a reader.** Needs a framing that is not an
    opinion piece. Only write it if a measurement carries it.

## F. Reference pieces built on third-party data (3)

The shape of `/guides/how-many-lawyers-in-new-york/` and `/guides/average-lawyer-hourly-rate/`:
somebody else's dataset, aggregated honestly, with every figure sourced and dated. These make no
claim about our firms, so they take the `Reference` kicker rather than `Study`.

48. **How many lawyers are in Texas, Florida and California.** The same exercise as the New York
    piece, in the three states where the directory is now largest. Needs each state's register or
    the ABA table, and a `lfl:figures-from` declaration so `check_meta` accepts a dated figure.
49. **What a paralegal costs, and what that changes about a legal bill.** Companion to the hourly
    rate piece, from the same published rate tables.
50. **COUNT FIRST. Law firm employment by state, over ten years.** The New York statistics guide
    reads payroll data; check whether the same series exists for the other twelve states before
    committing a run.

---

## Writing order, if nobody says otherwise

**First five, because each is well supported, names many firms, and surfaces a different client:**
item 1 (highest score, Lopez & Humphries), item 3 (largest rosters, Brooks), item 7 (most reviewed,
Malloy), item 6 (bar associations, Paulson Coletti), item 23 (real estate, Goodwin Law).

**Then** items 2, 24, 43 and 14, which are the best-supported remaining topics regardless of client.

**Not yet:** every item marked **COUNT FIRST**, and item 20, which is blocked on an engine decision
rather than on data.

## Standing rules for every item on this page

- Keyword check before writing. The backlog's rule stands: the consumer-phrased legal question
  usually has no volume and the industry-phrased one does. At most six Ahrefs calls per run.
- A named firm is chosen by a stated rule with a deterministic tie-break, and the page states it.
- Never a dollar amount for a result the record does not mark verified. Never a firm whose
  `status` is `sample` or `not_eligible`. Never a characterisation of a named attorney's
  registration or discipline beyond the words the record carries.
- Re-count the fill rate before writing. Every figure on this page was counted on 2026-10-04 and
  the directory grew by 85 firms while this page was being written.
