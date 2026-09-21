# Guides backlog

Working file for the Guides section. One guide ships per run. This file carries what the last run
learned so the next one does not repeat the research.

## Telling the owner a piece went out, which is not optional

The owner asked on 2026-09-14 to hear about every new piece, and the run before that had decided
on its own not to say anything. Do not repeat that. In a scheduled run `PushNotification` is the
only channel that leaves the session: it reaches the owner's phone and inbox, and anything written
only into the transcript reaches nobody. Wrap the message in `<routine_summary>` tags, since the
first sentence becomes the phone banner and the whole text becomes the email body.

Send one at each of these two moments:

1. **When the pull request is opened.** The piece is written and needs a person. This is the one
   the run can always send, because the run is still alive at that point.
2. **When the merge event arrives**, if the session is still subscribed to the pull request. That
   is the moment the piece is actually published, and it is the one the owner asked for.

The second one is best effort and the reason is structural, so do not quietly treat it as covered:
a run opens the pull request and finishes, and the human merge can land hours later, after the
session is gone. When that happens no session sends anything.

**That gap is now closed by something that does not depend on a session, and this paragraph used
to say it was not.** `.github/workflows/announce_guide.yml` fires on `push` to `main` under
`src/pages/guides/**.astro`, takes added files only so an edit is not a publication, resolves the
headline through `scripts/guide_title.mjs`, and opens an issue assigned to the repository owner,
which is what sends the mail. Checked on 2026-09-16 against the new guide's slug: the title
resolves and the step would run. So the merge is announced whether or not a session is alive, and
the run's own second notification is now a faster duplicate rather than the only copy. Still send
it: a duplicate costs nothing and the workflow has never been observed firing on a real merge.

The judgement call that produced the gap, written down so it is not made again: the merge arrived
while the session was still watching, and the run skipped the notification on the grounds that the
owner had done the merge themselves and already knew. Whether they already know is not the test.
Say it went out.

No email address goes in this file. This repository is public, and `PushNotification` already
routes to whoever owns the routine, so writing an address here would publish it and change nothing.

## Computing the figure is only half of it

Found on 2026-09-14, hours after publishing, when twenty-eight firms landed in Baltimore and
Lakeland and took the directory from 59 to 87. Every figure in the denominator guide recomputed
correctly, which is the design working. The **prose around them did not**, and the page went out
reading "they sit in New York and Florida and Florida and Florida and Maryland. Neither is on the
shorter scale. Both had the whole 100 points available." Three separate breakages in two
sentences, on a page whose entire subject is numbers that move underneath sentences.

So a computed figure is necessary and not sufficient. Before shipping, read every sentence that
touches a count and ask what it says when the count is 1, 2 and 20:

- **Never `join(' and ')` a list.** Use a helper that deduplicates and formats. Mapping one state
  name per firm and joining is what produced the repetition above, and it read perfectly while
  exactly two firms were involved.
- **"Neither", "Both", "either", "the other one"** are hardcoded counts wearing words. They pass
  every check in this repo and go false in silence. Prefer "not one of them", "every one of them".
- **A count spelled in words is still a count.** "the other two states", "a verdict on two
  states". Compute it or drop it; dropping it usually reads better.
- **Named places and firms go stale.** Linking Baltimore and Lakeland by hand is a sentence that
  is wrong the day a fourth market opens. Derive the list from the records.
- **Break ties deterministically.** The "firms that share a score" chart picks the widest spread,
  and two scores tied at the same spread, so which example appeared depended on collection order.
  Tie-break explicitly or the page changes its own illustration between builds.

`check_meta.mjs` and `audit_seo.mjs` cannot catch any of this. The sentences are grammatical and
the build is green. Only reading them at a different n catches it.

Rules that decide what goes on this list, restated so they are not re-argued every run:

- **Every guide carries at least one chart.** A measurement is read faster as a shape than as a
  column of numbers, and these pieces are measurements before they are prose. Use the components
  in `src/components/`: `BarChart` for comparing quantities, `ColumnChart` for a distribution,
  `StackBar` for the parts of one population. A chart's numbers are passed in already computed,
  from the same variables the prose uses, so a chart can never disagree with the sentence beside
  it. Colour is not picked by eye: the steps in `global.css` were validated against the page
  surface, one hue for magnitude and a quiet grey for the bars a chart is not about, and every
  bar prints its own value so nothing is legible by colour alone.
- **The headline states the finding, not the subject.** "New study: office count matters more
  than star rating for injury firms" earns a click that "Google reviews, and why the ratings
  barely differ" does not, and it is the same claim. The constraint is that the comparison has to
  be one the measurement actually supports, and a headline that would be wrong next month is
  wrong now: write the conditional version instead, the way the fees guide does. No figure in a
  title or a description ever, because `check_meta.mjs` rejects it and is right to: a title is
  indexed once and a count moves every month. Spelling the count in words evades the check and
  keeps the problem, so do not.
- **Every guide has a drawn cover and a committed share card.** The scene lives in
  `CoverArt.astro`, one per piece, built from the shapes the article is about; `GuideCover.astro`
  frames it at the top of the article and the cards on the home page and the guides index draw
  the same scene small, so a card advertises its own study instead of repeating a generic icon.
  A new guide sets `cover` in the manifest or its card falls back to the icon. The matching raster in
  `public/og/` is what Facebook, LinkedIn, Slack and X show, since none of them renders an SVG,
  and it is passed to `<Base>` as `image` with an `imageAlt` that describes it. Never ship a
  panel that says "slot" to a reader.
- **The data behind a guide is refreshed monthly**, which is what keeps a study from becoming an
  essay about September. The order is in `docs/monthly-refresh.md`, and
  `node scripts/check_freshness.mjs --strict` fails when a family of measurements has no reading
  inside 35 days.

- A guide is a study across the directory, or a method piece about a component of the score. Every
  figure in it is computed from the firms collection at build time.
- A guide is never a geographic or practice ranking. Anything phrasable as "best <practice>
  lawyers in <city>" belongs to `/cities/<city>/<practice>/` or `/practice-areas/<practice>/`,
  which are generated, already rank by score, and will outrank a guide aimed at the same query.
- Nothing is published that the committed records under `src/data/firms/**` cannot support. No
  dollar amount for a result the record does not mark verified.

## Generated pages, so a topic is not aimed at one of them

As of 2026-09-21 the build produces **341 pages, from 296 published firms in 9 markets and 7
states**, and there are now 8 published guides plus the gated ranking. Re-enumerated against the
build on this run rather than inherited. No new market opened since 2026-09-18; the growth is
firms inside the markets that already existed, plus this run's guide.

- `/`, `/cities/`, `/practice-areas/`, `/guides/`
- Nine city hubs: `baltimore-md`, `boston-ma`, `buffalo-ny`, `dallas-tx`, `lakeland-fl`,
  `naples-fl`, `new-york-ny`, `northwest-indiana`, `portland-or`
- Twelve city x practice rankings: `personal-injury` in all of the above except `naples-fl`,
  `workers-compensation` in `baltimore-md` and `new-york-ny`, `real-estate` in `naples-fl`,
  `family-law` in `new-york-ny`
- Four practice hubs: `/practice-areas/personal-injury/`, `/practice-areas/real-estate/`,
  `/practice-areas/workers-compensation/`, `/practice-areas/family-law/`
- 296 firm profiles, and the static pages (`/methodology/`, `/about/`, `/list-your-firm/`,
  `/contact/`, `/privacy/`, `/terms/`)

Firm counts by state, for scoping a study: NY 150, FL 34, MD 31, MA 28, OR 20, TX 20, IN 13.

Every city and practice combination in that list is off limits as a guide topic.

## Written

| Run | Guide | Targets | Notes |
| --- | --- | --- | --- |
| 2026-09-21 | `/guides/what-a-business-register-proves-about-a-law-firm/` | "how to check if a law firm is registered" (10/mo US, 20 global), and the business-entity verification cluster around it. Deliberately **not** "how to check if a law firm is legit" (30/mo, KD 3), which the 2026-09-16 guide already holds | Backlog item 1, and it was larger and sharper than the entry predicted. `gates.G3.pass` is true on **140 of 296**, and the four non-pass reasons are genuinely different facts: 72 in states publishing nothing queryable (IN, MA, MD), 34 in Florida whose register is published and **we have not read it**, 33 New York general partnerships the state does not require to file, 17 we could not identify in a register we did read. The second half is the new finding: for the **113** domestic New York firms holding both `entity.formed` and `operating.registered`, the two dates agree within a year on only 37, sit more than a decade apart on 25, and the error is **symmetric** (39 older in the register, 37 older on the web), so it is noise rather than a correctable bias. |
| 2026-09-18 | `/guides/what-law-firms-publish-about-malpractice-insurance/` | "do lawyers have malpractice insurance" (40/mo, KD 2), "can i sue my lawyer for malpractice" (70, KD 0), and the client-side phrasings that return no data at all | Backlog item 1, and it held up: `accountability.malpractice_insurance` is `true` on **0 of 267** firms across 2,313 pages, while `bar_associations` is non-empty on 113. The finding that makes the piece is **Oregon**: the one state here where the cover is mandatory, and 0 of its 20 firms mention it, which proves silence measures publishing habits rather than cover. Also published against ourselves: the association half is partly a measure of our own pattern list, 84 of 155 in the two states it carries a local association for against 29 of 112 elsewhere. |
| 2026-09-16 | `/guides/what-it-takes-to-check-a-law-firm/` | "how to check if a law firm is legit" (30/mo, KD 3), "how to check if a law firm is registered", "how to check a lawyer credentials", "how to check if a lawyer is legitimate" | Backlog item 3, and much larger than the old entry predicted: 56 of 217 firms name no attorney we could read, not 6. Pillar A's method piece and the study behind gates G1 and G2. Two findings worth remembering: only New York, of the seven states, publishes an attorney register we may query, so G1 passes on 51 firms and never outside it, while published discipline is searchable in six states through CourtListener. **The check people assume is buried is the more open one.** Also: the no-roster firms are indistinguishable from the rest on Google rating, 53 of 56 at 4.5 or better against 196 of 217. |
| 2026-09-14 | `/guides/what-a-law-firm-score-cannot-compare/` | "how are lawyer ratings calculated", "law firm rating methodology", "what does a lawyer rating mean", "are lawyer ratings comparable" | The denominator piece. Reads all three states rather than one, because the argument is what happens when the directory crosses a state line. Two corrections were caught in draft and are worth remembering: the certification coverage floor is `MIN_COVERAGE = 0.60`, not 0.70, and the highest total outside New York is a firm whose total we withhold, not the highest comparable one. |
| 2026-09-13 | `/guides/what-a-case-results-page-proves/` | "how to check a law firm's case results", "law firm case results page", "how to verify a lawyer's track record" | Counts what every firm publishes about its own outcomes and says why we repeat none of the amounts. Doubles as the pillar B method piece. |
| earlier | `/guides/what-new-york-injury-firms-publish-about-fees/` | contingency fee disclosure | E1 method piece. |
| earlier | `/guides/google-reviews-new-york-injury-firms/` | Google review ratings for injury firms | C1/C2 method piece. Its closing paragraph was corrected on 2026-09-13: it read the verified-results set while saying "published any at all", and rendered as nobody publishing results when 37 firms do. |
| earlier | `/guides/core-web-vitals-new-york-injury-firms/` | Core Web Vitals | D method piece. |
| gated | `/guides/best-personal-injury-law-firms-nyc/` | ranking | Publishes at 8 certified firms in New York. Currently 3. |

## Next, ranked

Item 1 was taken on 2026-09-21 and is written. Two things in the old entry were wrong, and both are
corrected here rather than silently dropped.

**The correction that matters: `operating.years` does not come from state registers.** The old item
1 said it was "filled for 271 from state registers". It is filled for 295 of 296 firms and every
single one carries the source `Domain registration date over RDAP`. There is no state register
anywhere in that field. `scripts/check_operating.py` says so in its own docstring, and says more
than that: the value is a lower bound, and "this figure is never published as the firm's age". This
is the same class of mistake as the `bar_numbers_on_bios` one, two fields that sound like the same
fact, and it was caught this run only by reading the script that writes a field before building a
sentence on it. Keep doing that. The rest of the stale figures: `entity` is on 117 firms and not
105, and G3 passes on 140 of 296 and not 128 of 272.

The entries below were re-checked against the collection on 2026-09-21.

1. **Read Florida's business register.** Not a guide, a data job, and it is now the only place in
   the directory where a gate is blocked by our own backlog rather than by a state. 34 Florida
   firms carry `Google Places API (partial)` on G3 because the register is published in full on an
   SFTP host that answers an anonymous request with a 401. Every other non-pass on G3 is either the
   state's policy or a firm that genuinely need not file. Doing this moves 34 firms and makes the
   next version of the registers guide say something better about ourselves. It is the highest
   value item on this list and it is not writing.
2. **Texas, the state where neither check runs.** Of the 20 Dallas firms, G1 passes on 0 and G2
   passes on 0, the only state in the directory where both are blank: the bar refuses automated
   readers and attorney discipline there is not an order of the supreme court, so CourtListener has
   nothing to index either. Texas *does* publish its corporate register, and the registers guide
   now carries the franchise-tax caveat (a match is strong, a miss says nothing), so this is a
   section of a future piece rather than its own guide. Narrower than it was.
3. **The office-count problem in every directory.** `digital.places.listing_count` versus review
   totals. Overlaps the Google reviews guide; only worth writing if it is reframed as a directory
   design piece rather than a review piece.
4. **What a participation score measures.** Out of the Avvo pass: Avvo's own documentation says
   answering questions and publishing guides on Avvo can raise a lawyer's Avvo Rating. The Justia
   pass added paid Platinum and Gold placements buying position outright, and the lawyers.com pass
   below adds a third and cleaner case: a Martindale-Hubbell peer rating is initiated from
   references **the rated attorney submits**. Three directories, three ways the rated party feeds
   its own rating. We have no measurement of any of them, so this is a sourced paragraph inside a
   future method piece and not a guide, and every claim has to cite their published documentation.
5. **What a firm publishes about how it bills, across practices that cannot be compared.**
   `domestic.hourly_rate`, `domestic.retainer` and `transaction.flat_fee` are the family law and
   real estate answers to the contingency percentage, and the fees guide only ever counted the
   injury version. The E1 blocker on this cleared on 2026-09-21 (see the open items), so this is
   now writable and is the strongest remaining *writing* topic.
6. **How old is a law firm, outside New York.** The registers guide could only compare the two
   dates in New York, because `entity` exists nowhere else. Oregon and Texas both publish a
   registration or charter date in the registers we already read, and neither is currently stored
   on the firm record. Storing them would take the date comparison from 113 firms to roughly 136
   and let the piece speak about three states instead of one. Data job first, then a refresh of
   the guide rather than a new one.

**Dead, so they are not proposed again:**

- *What a firm's own roster does not tell you, from `attorneys[].bar_number`.* We do not measure
  whether a firm publishes bar numbers. See the open item below: the field that claimed to is
  empty on every record, and the one that does exist means something else.
- *D2 as the largest hole.* Filled.
- *Nobody says they carry malpractice insurance.* Written 2026-09-18. Do not re-propose the
  insurance count as a topic: it is now a published page that recomputes itself.
- *Founding-year claims against the register.* No committed claims to compare: `founded_year` is
  absent on all 296 records. Re-checked 2026-09-21. This is why the registers guide compares the
  register against the domain rather than against anything a firm asserts.
- *Is this firm even a company?* Written 2026-09-21.

## Keyword research, 2026-09-21

`subscription-info-limits-and-usage` is free and was the first call again: **27,006 of 800,000
used**, because the reset landed on the 19th, two days before this run. Roughly 773,000 units were
available, the most any run has had. Four paid calls, 1,635 units in total, well inside the
six-call rule. Keep starting with the free call.

What they returned, and the answer is mostly "nothing", which is itself the finding:

- **The registration cluster is close to empty.** Of eight seed phrasings only "how to check if a
  law firm is registered" returned data at all: **10/mo US, 20 global**, no difficulty, no parent
  topic. "how to check if a law firm is a real business", "how to look up a law firm business
  registration", "how old is a law firm", "how to find out how long a law firm has been in
  business", "law firm business entity search", "is my law firm a real company" and "how to verify
  a law firm exists" all returned no data.
- **`serp-overview` on that keyword returned an empty position list**, so there is no Ahrefs SERP
  to read for it. The SERP was read through WebSearch instead, and that is where the case for the
  piece actually came from. Do not treat an empty `positions` array as a reason to drop a topic.
- **Do not run `matching-terms` on "law firm business".** It was one of this run's four paid calls
  and it was wasted: the term is owned by firms that *practise* business law. Forty rows of
  "business litigation law firm", "small business law firm atlanta", "law firm business plan",
  "law firm business cards". The word "business" cannot reach the entity-verification intent in
  this vertical. One genuinely useful row came out of it: **"is marble law firm legit", 200/mo,
  KD 0, CPC $7.00, branded.** People search "is <firm name> legit" by name. That is demand our firm
  profiles should answer rather than a guide, and it is worth a separate look at whether our
  profiles rank for `is <firm> legit`.
- **The adjacent winnable query is already ours and was deliberately avoided.** "how to check if a
  law firm is legit" is 30/mo at **KD 3** with traffic potential 900, and the 2026-09-16 guide
  holds it. Pointing a second page at it would have been us competing with ourselves. This run
  targeted the registration phrasing instead and linked the two pages together in both directions.
- "how to check if a business is registered" is 80/mo, KD 28, parent topic `how to verify a
  business`, traffic potential 50. Generic, not law-specific, owned by business-formation services.
  Not our reader and not worth a run.

**The SERP read is the reason to publish.** WebSearch on "how to check if a law firm is a
registered business entity" returns LegalZoom's LLC lookup tool, TailorBrands, iDenfy's KYB guides,
Collective and LegalClarity. Every one of them is generic business-entity advice with no law-firm
specificity, and **every one of them says "go to the state's business search database" without ever
asking whether that database exists for the state you are in.** In four of our seven states it does
not. Nobody has measured that, and nobody has measured what the fallback everyone reaches for, the
age of the firm's website, is actually worth. That is the information gain.

Alongside it, "how long has this law firm been in business" returns Guinness World Records on the
oldest law firm, plus a derrick-app listicle, "Company Founding Year: 5 Ways to Find It", which
recommends state registries, LinkedIn, the company's own website and Crunchbase. It does not ask
whether those sources agree with each other. We measured that they do not: on the 113 firms where
we hold two of them, they agree within a year on 37.

## Keyword research, 2026-09-18

`subscription-info-limits-and-usage` is free and was the first call again: 497,988 of 800,000
used, reset still on the 19th, so roughly 302,000 units were available. Two paid calls, 452 units
in total, well inside the six-call rule. Keep starting with the free call.

What they returned:

- **The target is "do lawyers have malpractice insurance": 40/mo, difficulty 2**, parent topic
  `legal malpractice insurance`, informational and commercial intent. A difficulty of 2 is the
  lowest this section has found on anything with commercial intent. Traffic potential reads 2,900,
  but that number belongs to the parent topic, which is lawyers shopping for cover, not clients
  checking on one. Do not inherit it as our ceiling.
- Next to it, "can i sue my lawyer for malpractice" at 70/mo and **KD 0**, parent topic `how to sue
  a lawyer for malpractice`, traffic potential 1,500. That is a different piece and a real one, but
  it is legal procedure rather than measurement, so it is Nolo's to win and not ours.
- "legal malpractice insurance requirements by state" (80, KD 25) is supply side: lawyers checking
  their own obligations. "lawyer professional liability insurance" (250, KD 3) is the same, and the
  $10.00 CPC says who is bidding on it. Neither is our reader.
- **Nothing at all returned for the client-side phrasings**: "does my lawyer have malpractice
  insurance", "how to check if a lawyer has malpractice insurance", "what happens if my lawyer
  makes a mistake", "is my lawyer insured". The same shape the last two runs found. The question
  people actually have has no measured volume, and the query that does have volume is asked in the
  lawyer's words rather than the client's.
- **`serp-overview` on "do lawyers have malpractice insurance" is the reason to write it, and it is
  the clearest unoccupied SERP this section has seen.** Position two is the ABA's "FAQs on
  Malpractice Insurance for the New or Suddenly Solo Attorney" at DR 90. Four is the Ohio State Bar
  asking "Do I need malpractice insurance?". Five through nine are insurance sellers:
  attorneysinsurancemutual at DR 9, lawyersmutual, texasbarpractice, biberk, l2insuranceagency at
  DR 18 with 14 monthly visits. Ten is the Michigan bar's Rule 21.
- **Every organic result on that page is written for a lawyer buying insurance. Not one is written
  for the client the insurance would pay.** The only client-side results are a Reddit thread
  literally titled "What benefit is there to a client for an attorney to have malpractice
  insurance" and an Avvo answers thread. Nobody has measured what firms publish. That is the
  information gain, and a page where DR 9 and DR 18 rank is a page we can enter.
- People also ask: "How often do lawyers get sued for malpractice?", "How much does a lawyer pay
  for malpractice insurance?" Both are supply side again. The demand-side version of this query is
  genuinely vacant rather than merely competitive.

## Keyword research, 2026-09-16

`subscription-info-limits-and-usage` is free and was the first call again: 468,209 of 800,000
used, reset still on the 19th, so roughly 330,000 units were available. Three paid calls, 967
units in total, well inside the six-call rule. Keep starting with the free call.

What they returned:

- **The winnable query is "how to check if a law firm is legit": 30/mo, difficulty 3**, parent
  topic `law license lookup`. A difficulty of 3 on a question with commercial intent in this
  vertical is close to unheard of, and it is what this run's guide targets. Around it sit "how to
  check a lawyer credentials" (80, KD 65), "how to check a lawyer reputation" (80, KD 52), "how to
  check if a lawyer is legit" (60, KD 52), "how to check if a lawyer is licensed" (30, KD 55),
  "how to verify a lawyer" (20, KD 55) and a long tail of "how to check if a law firm is
  registered", "how to check if a lawyer is in good standing", "where can i check if a lawyer is
  legit", each at 10 to 20. Individually small, collectively a few hundred a month, and the whole
  cluster shares one parent topic.
- **The head terms are still not worth a run**, and the 2026-09-14 note on that stands.
- Nothing returned for "law firm website no attorney names", "attorney license lookup by state",
  "how to verify a lawyer is real", "who are the lawyers at a law firm" or "law firm
  transparency". The finding this run published has no query of its own. It is reachable only
  through the "is this firm legit" cluster, which is why the guide is framed as the check rather
  than as the absence.
- **`serp-overview` on "how to check if a law firm is legit" is the reason to write it.** Position
  one is americanbar.org's Lawyer Licensing page, three is lawyerlegion.com's list of state bar
  directories, five is calbar.ca.gov on legal services fraud. Four and seven are JustAnswer, Avvo
  Legal Answers and three Reddit threads. Six is a FindLaw blog post, "5 Quick Ways to See If Your
  Lawyer Is Legit", at DR 90 and 10 monthly visits. Eight and nine are law firm blog posts at DR
  36 and DR 29, ranking on a page with the ABA and a state bar. Ten is a Facebook group post
  reading "How to check if the lawyer is legit? I only have his name."
- **Nobody on that SERP has measured anything.** Every result is either a list of registers or
  generic advice, and every one of them says to look the attorney up without asking whether there
  is an attorney to look up. That is the information gain, and a page where DR 29 ranks is a page
  we can enter.
- People also ask: "How can I find out if a lawyer is real?", "How to identify a fake lawyer?",
  "What are red flags for lawyers?", "How to spot a fake legal notice?" The third one is ours to
  answer with evidence rather than with a list of vibes.

## Keyword research, 2026-09-14

**The previous run's advice to budget nothing for Ahrefs was wrong, and the free call is how you
find that out.** `subscription-info-limits-and-usage` costs no units and reported 400,332 of
800,000 used with the reset still on the 19th, so roughly 400,000 units were available the whole
time. Whatever exhausted the key on the 13th was not the workspace quota. Start every run with
that free call rather than inheriting the last run's conclusion. This run spent four paid calls
and 1,894 units in total, well inside the six-call rule.

What they returned:

- The head terms are owned outright and are not worth a run. "lawyer ratings" (600/mo, KD 85),
  "lawyer rating website" (250, KD 89), "lawyer ratings and reviews" (200, KD 88) all carry a
  parent topic of `avvo` or `best lawyers`. Avvo and Martindale own this cluster and the intent
  behind it is navigational: people are looking for those sites by description, not for an
  explainer.
- The explainer queries around them are close to empty. "how to evaluate a law firm" returns 10
  a month, "how to compare law firms" returns 0, and "how are lawyer ratings calculated",
  "law firm rating system" and "lawyer rating systems explained" returned no data at all. This
  run's guide targets that cluster knowing it is thin: it is a method piece whose job is trust
  and internal linking, and the volume is not the reason to publish it. Do not let a later run
  mistake this for a traffic bet.
- A real cluster does sit next door, in questions: "how to check attorney license" (KD 57),
  "how to look up attorney license", "how to verify attorney license", "how to find an attorney's
  bar number", with parent topics `law license lookup` and `attorney search`. Individually small,
  collectively meaningful, and materially easier than the head terms.
- **That cluster should not be chased directly, and the SERP is why.** `serp-overview` on "how to
  check attorney license" returns the registers themselves: americanbar.org at one, the State Bar
  of California, Texas, Colorado, Illinois, Utah and the New York attorney search at ten. The
  searcher wants the lookup tool, and the lookup tool is a better answer than we could write. What
  is unoccupied is the question one step up, which nobody on that SERP answers: whether you can
  run that check everywhere. You cannot, and we have the measurement. That is backlog item 3.
- People also ask on that SERP: "How do I verify an attorney's license?", "How can I check if a
  lawyer is good or not?", "How to look up an attorney license in Florida?" The Florida one is
  ours to answer with evidence, since Florida is one of the two states whose register we cannot
  query.

## Keyword research, 2026-09-13

Ahrefs returned `API units limit reached. Expected usage: 344, API units left: 0` on the first
call of the run (`keywords-explorer-overview`, eight seed keywords, US). Per the standing rule the
call was not retried and the rest of the run used WebSearch. Units reset on the 19th, so the next
run before then should assume the same and budget nothing for Ahrefs. Nothing was spent this run.

From the SERP read instead:

- "how to verify a law firm's advertised case results" returns firm-owned blog posts, a LexisNexis
  product page, and scam-warning content about fake settlement checks. Nobody has measured what
  case results pages actually contain. That gap is what this run's guide took.
- "how to evaluate a personal injury lawyer's case results page" is owned by law firm marketing
  agencies writing for law firms, not for clients. Their advice ("ten to fifteen results across
  your core case types") is a supply-side target, which means the demand-side version of the same
  question is unoccupied.
- "prior results do not guarantee a similar outcome" is answered by Quora, JD Supra and firm
  disclaimer pages. It is a real query with a thin best answer. A short section inside the new
  guide covers it; a standalone piece would be a definition, which we have no advantage at.
- People also ask, repeatedly: whether settlement amounts are public record, and how to find out
  what somebody else got. Both are answerable with court records rather than with our data, so
  they are not ours to chase yet.

## Competitor rotation

Order: nolo.com → findlaw.com → avvo.com → justia.com → lawyers.com → superlawyers.com →
martindale.com → thelawfirmlist.us, then back to the start.

**Next run: superlawyers.com.**

### lawyers.com, read 2026-09-21

`www.lawyers.com` is blocked by this environment's egress proxy, so this was read through search
results, its own pages as they appear in them, and Martindale's published documentation.
**Five of the eight competitors are now known to be unreachable from here** (nolo, findlaw, avvo,
justia, lawyers), so the search-based read is the normal case and not the exception. Budget for it.

Shapes lawyers.com earns traffic with:

1. **A consumer legal-information hub on its own subdomain**, `legal-info.lawyers.com`, organised
   by practice area, with a "Research Basics" section underneath it: "Should You Sue?", "How, and
   How Much, Do Lawyers Charge?", "Client's Bill of Rights When Dealing With Lawyers". Restating
   procedure and general advice. We have no advantage here and should not chase it.
2. **Directory profiles shared with martindale.com**, carrying Martindale-Hubbell Peer Review
   Ratings and client reviews on the same page. The two sites are one content asset presented
   twice, which is worth noting: the peer rating is the product and the directory is its shelf.
3. **"A Consumer's Guide to Peer and Client Review Ratings"**, a page whose whole job is explaining
   their own rating to the people it is aimed at. That shape is one we should copy and can do
   better: `/methodology/` is ours and it is written as a specification rather than as an
   explainer. The guides are currently doing that job instead.

What is worth taking, as a measurement rather than a topic: **the Martindale-Hubbell peer rating is
initiated from references the rated attorney submits.** Their own documentation says an attorney
"may submit as many or a few references as they choose" to start the process, and Martindale then
adds reviewers in the same geography and practice area. Ratings publish to the profile within 24
hours. That is the third instance of the pattern this rotation keeps finding, after Avvo's
engagement inputs and Justia's paid placements, and it now has enough cases to be a section in a
method piece. See ranked item 4. Source it to their documentation; we cannot measure it.

What we should not chase: their practice-area explainer library. It is thousands of pages of
restated law, it is what every one of these eight competitors does, and it is the exact thing the
editorial standard in this file rules out.

### justia.com, read 2026-09-18

`www.justia.com` is blocked by this environment's egress proxy, so this was read through search
results, Justia's own marketing and directory-listing pages as they appear in them, and
third-party write-ups. **Four of the eight competitors are now known to be unreachable from here**
(nolo, findlaw, avvo, justia), so a search-based read is now the majority case. Budget for it.

Shapes Justia earns traffic with:

1. **The primary sources themselves**, at `law.justia.com`: case law, state and federal codes,
   regulations, dockets. This is the largest free law library any of these competitors runs, and it
   is the reason their domain carries the authority it does. Do not chase any part of it. We cannot
   beat a primary source at being one, and unlike Nolo's encyclopedia this is not even an
   explainer we could out-measure: it is the statute.
2. **The lawyer directory at `lawyers.justia.com`**, faceted by practice area and location, with
   free claimable profiles seeded at scale. Structurally identical to our generated pages and to
   FindLaw's, and again with no measurement behind the ordering.
3. **Paid position, stated openly.** "Justia Platinum Placements" buy fixed top placement for one
   metro and practice-area combination; "Gold Placements" buy sponsored slots above and among the
   free profiles. **This is the cleanest statement of the thing our pages are supposed to be the
   answer to**, and it is worth keeping because it is published by them rather than alleged by us:
   on that directory the top of a city-by-practice page is for sale, and on ours it is a score.
   Nolo's paid matching service is the same business model less plainly described.
4. **Badges and claimed-profile markers** as the engagement hook, the same participation mechanic
   Avvo uses, minus a numeric rating tied to it.

The thing to take, and it is a sharper version of the FindLaw and Avvo notes: all three of the
directory giants rank on the queries we want with content that measures nothing, and two of the
three sell the ordering of the pages that compete with our city-by-practice rankings. **The
contrast to make is never "their number is wrong", it is that ours is a share of measured evidence
with the share published and theirs is either popularity or a purchase.** Make it by demonstration.
Item 4 in the ranked list is where the Avvo and Justia observations belong once we have something
of our own to measure them against.

Also worth noting for a future run: Justia's malpractice and legal-ethics content did not appear
anywhere on the SERP this run studied, despite their library covering it. The insurance question
is not a place their authority reaches.

### avvo.com, read 2026-09-16

`www.avvo.com` is blocked by this environment's egress proxy, so this was read through search
results and Avvo's own support and legal-guide pages as they appear in them. **Three of the eight
competitors are now known to be unreachable from here** (nolo, findlaw, avvo), so a search-based
read is the normal case rather than the exception. Budget for it.

Shapes Avvo earns traffic with:

1. **Consumer Q&A at `/legal-answers/`**, thousands of threads where lawyers answer for free. This
   is the shape that matters for us, because it is how Avvo occupies exactly the SERP this run's
   guide targets: two of the top ten for "how to check if a law firm is legit" are Avvo threads.
   Do not chase it. We have no lawyer community, one cannot be faked, and a thread of opinions is
   what a measured page beats.
2. **Lawyer-written Legal Guides at `/legal-guides/ugc/`.** Free content supply, and the incentive
   is the rating: see below. Structurally clever and not available to us.
3. **The Avvo Rating, 1 to 10**, from lawyer-supplied profile data plus state bar records. Their
   published factors include years in practice, peer endorsements, awards, publications, profile
   completeness, and **"legal thought leadership", which they describe as including answering
   questions and publishing guides on Avvo**. Advertising does not influence it and they say so
   prominently, which is true and is not the interesting part. The interesting part is that
   engaging with the directory can raise the score the directory publishes about you, and that a
   lawyer who ignores Avvo scores lower for an empty form rather than for anything about their
   practice.
4. **A profile for essentially every licensed attorney**, seeded from bar records. Worth knowing
   for the piece just published: a reader with a name can usually find that lawyer on Avvo. A
   reader without one cannot, and Avvo does not help them either.

The thing to take: Avvo's rating is self-reported plus participation, ours is measured evidence
with the coverage published, and the contrast is best made by demonstration. Also the practical
note that FindLaw and Avvo both rank on the queries we want with content that measures nothing,
which means the bar is lower than their domain ratings suggest.

### findlaw.com, read 2026-09-14

Blocked by this environment's egress proxy, both `www.findlaw.com` and `lawyers.findlaw.com`, so
this is a second-hand read through search results and third-party write-ups, the same caveat nolo
carries. Two of the eight competitors are now known to be unreachable from here; assume the rest
may be and budget a search-based read.

Shapes FindLaw earns traffic with:

1. **"Learn About the Law", thousands of state-keyed explainers**, plus `codes.findlaw.com` and
   `caselaw.findlaw.com` carrying the primary sources themselves. Do not chase, for the same
   reason as Nolo's encyclopedia, and less than Nolo: FindLaw also hosts the actual statutes, so
   the explainer sits next to the authority. We cannot beat a primary source at being one.
2. **The directory faceted three ways at once**, by state, by city and by "legal issue"
   (`lawyers.findlaw.com/legal-issues/`), over a claimed million-plus profiles. Structurally this
   is what our generated pages are, at a thousand times the size and with no measurement behind
   any of it. Worth noting as the thing our `/cities/<city>/<practice>/` pages compete with: they
   win on facet coverage and we win only if the ranking means something.
3. **Client star ratings, one to five, averaged.** Optional sub-ratings for value, quality of
   service and professional competence, and, in their own documentation, **the optional
   sub-ratings do not influence the overall rating**, and attorney ratings do not influence the
   firm rating. That is the same structural problem this run's guide is about, sitting in a
   competitor's published methodology: a composite whose components are not all in its
   denominator. Nobody, including them, writes about the denominator. It is the clearest evidence
   yet that the angle is unoccupied rather than merely unpopular.

The thing to take: FindLaw's rating is a popularity average with no floor on evidence, and ours is
a share of measured evidence with the share published. Neither of the two directory giants states
what its number cannot do. Every method piece we write should make that contrast by demonstration
rather than by claiming it, because claiming it is what they would do.

### nolo.com, read 2026-09-13

`www.nolo.com` is blocked by this environment's egress proxy, so this was read through search
results rather than by fetching the site. Treat the shapes below as well evidenced and the details
as second hand.

Shapes Nolo earns traffic with:

1. **The legal encyclopedia explainer**, thousands of them, keyed to a statute or a procedure and
   updated by staff editors. Do not chase. It restates the law, anyone can write it, we have no
   advantage, and it is the single most crowded content type in this vertical.
2. **The reader survey.** Nolo surveys its own readers about what their case settled for and
   publishes the distribution ("more than half received between $3,000 and $25,000, average
   $52,900", from its 2017 survey, still cited nine years later). This is the shape worth learning
   from: original numbers nobody else holds, published as a distribution, which earns links
   forever. We cannot survey clients. We can measure firms, which is the same move applied to the
   only population we have.
3. **The case-value calculator** ("how much is my case worth"). High intent, and for us a trap:
   we would be inventing numbers we cannot source. Not ours.
4. **The directory and attorney matching service** underneath the content, which is the business
   model the content feeds. Structurally the same as ours; theirs is paid placement and ours is
   not, which is a difference worth stating somewhere on the site rather than in a guide.

The lesson to carry forward: every one of our guides should be a thing only a directory that
measures firms could have written. If a piece could have been written by reading the law, it is
Nolo's to win and not worth our run.

## Charts, added 2026-09-13

Every published guide now carries at least one, and the two guides whose tables were doing a
chart's job lost the table:

| Guide | Chart | Form, and why that form |
| --- | --- | --- |
| Case results | Split bar: what each firm's results page gave us | Part-to-whole of one population, four ordered states, so one hue in four steps rather than four colours |
| Case results | Columns: how many results each publishing firm lists | A distribution, with the bands at or above the B1 threshold highlighted so the chart shows where our own rule stops paying |
| Case results | Bars: what those pages carry | Magnitude across five measures, all out of the same denominator |
| Fees | Bars: what firms publish about fees | Same, and the bars shorten as the question gets useful, which is the argument |
| Google reviews | Bars: reviews per firm, with listing count under each name | The spread is the point, and the highlight marks the multi-listing firms that cause it |
| Core Web Vitals | Bars: mobile performance, every measured firm | Replaced a table showing only the top three and bottom three, so the chart says more than the table did |
| NYC ranking (gated) | Bars: the cohort by certification stage, or the scores once it publishes | A reader who lands on a held ranking is owed the count that is holding it |
| Denominator | Bars: firms for which each eligibility gate could actually be checked | Magnitude across the five gates out of one denominator, with the blocked ones highlighted so a reader sees that a blocked gate is not a failed one |
| Denominator | Columns: how much of the available scale we read | A distribution, with the band below the comparability line highlighted, which is again where our own rule bites |
| Denominator | Bars: points of scale measured, for the firms that all share one score | The argument in one picture: identical totals, bars from 16 to 97. Built by finding the shared total with the widest spread rather than by naming firms, so it re-picks itself as the data moves |
| Denominator | Split bar: what limits the comparison across all firms | Part-to-whole of one population in three non-overlapping states, so one hue in three steps |
| Checking a firm | Split bar: what we found when we went looking for a name | Part-to-whole of one population in four states, ordered by how much evidence we got, so our own two failures sit beside the firms' one rather than being folded into it |
| Checking a firm | Columns: attorneys named per firm | A distribution, with the empty band highlighted. The rank of that band is computed rather than described, because a hand-written "second largest" was wrong on the first build |
| Checking a firm | Bars: firms naming nobody, by state | The bar is the share and the printed figure is the count, because the states hold 13 to 71 firms each and a bar drawn from the raw count makes the largest market look like the worst one |
| Checking a firm | Bars: what we could check, four checks out of one denominator | Magnitude, with the licensure row highlighted because it is the one every competitor recommends and the one that ran least often. The argument is the ordering |
| Business registers | Split bar: what happened when we asked for a registration | Part-to-whole of one population in four states ordered by how much evidence we got, so the failure that is ours and the one that is the state's sit beside the firms' rather than being folded in. Four segments and not five, because `StackBar` caps its hue steps at four (`Math.min(i, 3)`) and a fifth would have drawn identical to the fourth |
| Business registers | Bars: firms whose company we could confirm, by state | The bar is the share and the printed figure is the count, following the roster guide's lesson: the markets hold 13 to 150 firms. The note on each row carries the reason, because a zero means three different things here and one of them is our own unread register |
| Business registers | Columns: how far apart the register's date and the domain's date sit | A distribution, with the bands at five years and above highlighted, which is where the proxy stops being usable. The shape is the argument: the tallest band is agreement and the tail past it is longer than anyone would guess |

Rules for the next one: pick the form from the data's job before touching colour, keep every
figure computed, and look at the rendered chart at 390px before shipping it. The three components
already handle the mobile reflow; a chart with more than about eight rows is a table.

## House format, set 2026-09-14

- **Headlines are set in Title Case**, with the principal words capitalised: "New Study: Office
  Count Matters More Than Star Rating for Injury Firms". Sentence case read as a note to a
  colleague rather than as a published piece.
- **Links in the body of a guide are underlined without waiting for a hover**, internal and
  external alike, so a reader scanning the page can see where it will take them. Chart row labels
  are the exception, because underlining a column of them turns a figure into a list of links.
- **Paragraphs run one to three sentences.** Every published guide is now under four sentences a
  paragraph, averaging around thirty-five words. A long paragraph is nearly always two ideas that
  have not been separated yet.
- **Bold carries the finding, not the topic.** Roughly one bolded sentence per section, on the
  line a reader would quote. Bold on every other sentence is the same as no bold at all.

## Editorial standard, after the Ahrefs piece on AI slop

The owner sent through "How We Use AI for Every Article Without Making AI Slop" (Ahrefs, Si Quan
Ong, reviewed by Ryan Law) as the standard for this section. What it asks for, and where we stand:

> AI slop is content published without enough human understanding, judgement, evidence, or
> original contribution to justify the reader's attention. In short, slop transfers effort from
> the creator to the reader.

Their four gates, which are worth running before a guide is written rather than after:

1. **Idea gate.** Do we have something useful to add, or would this piece repeat what already
   ranks? Their phrasing for it is *information gain*: what can we add that is not already sitting
   in the search results. For this section the answer is always the same and it is a real one: we
   measure every firm in the directory, and nobody else has that. A guide that could have been
   written by reading the law is not ours to write.
2. **Outline gate.** Does every section serve the reader and the promise in the headline?
3. **Evidence gate.** Which claims need a source, and what still needs measuring? Our version is
   stricter than theirs by necessity: a figure that cannot be computed from the committed records
   does not go in the guide.
4. **Draft gate.** Has anything smuggled in certainty, filler, or an example we did not earn? This
   is the one to watch here: the temptation is a confident sentence about firms in general when
   what we have is a count of fifty-nine of them.

Two of their points land directly on how this repository already works, and are worth keeping:

- **Spend the time saved on better content, not more of it.** They refresh their datasets monthly
  through tooling rather than publishing more articles; `docs/monthly-refresh.md` is the same
  move, and it is why a guide here recomputes itself instead of being rewritten.
- **Someone has to own the result.** "A human in the loop means very little if the human only
  rubber-stamps the output. They need the knowledge, authority, and willingness to say no." That
  is what the pull request is for, and it is why nothing in this section is merged by the run that
  wrote it.

One caution from the same piece, aimed at a rule this repo already has: "Remove every em dash and
banned phrase and congratulations: you may now have slop with cleaner punctuation." The no-em-dash
rule is a house convention, not a quality bar, and passing `check_meta.mjs` is not evidence that a
guide was worth publishing.

## Corrections, 2026-09-14

Three published guides were counting the wrong firms. `core-web-vitals-...`, `google-reviews-...`
and `what-new-york-injury-firms-publish-about-fees` all filter the collection by status only,
which was right while the directory was New York and quietly wrong from the day Baltimore and
Lakeland opened: the pages were computing over Maryland and Florida firms while every sentence on
them says "New York". Each now filters on `market.state === 'NY'`, which is what the titles
always claimed. Figures moved accordingly, for example Core Web Vitals from 56 measured firms to
46 and from 3 passing to 2, because one of the passing firms is in Maryland.

The lesson for the next market that opens: a guide scoped to a place has to say so in its filter,
not only in its title. Check every guide's `getCollection` call when a new state lands.

Two hand-typed lines in `src/data/guides.ts` were stale for the same reason and are now written
without figures, since nothing in that file is computed: the Core Web Vitals entry said "One firm
out of thirteen passes", and the fees entry said every firm offers a free consultation, which is
now forty-seven of forty-eight.

## Corrections, 2026-09-16

**`digital.trust_pages.bar_numbers_on_bios` is written by nothing and read by three things.** No
committed record under `src/data/firms/**` carries that key: the `trust_pages` map holds only
`attorney_bios`, `privacy_policy`, `disclaimer`, `blog` and `fee_statement`, all of them `true`
where present and absent otherwise. `scripts/crawl_attorneys.py` says in its own docstring that it
records bar numbers found on bio pages, but it writes into `.crawl/` staging and that value never
reaches the firm record.

The consequence on the guides side was a published sentence. `core-web-vitals-new-york-injury-firms`
read that key, got `undefined` for every firm, counted zero, and printed "not one firm publishes a
bar registration number on its attorney bios" as though it were a measurement. It is the third
version of the same failure on the same page, after the one the run brief describes, and it is the
worst of the three: the earlier ones read the wrong real field, this one read no field at all. The
page now makes no claim about bar numbers, and the new guide says out loud that we do not measure
it. Both are fixed here.

The other two readers are **not** fixed here, because they are scoring code and changing them
rescores 217 firms, which is not a guide run's call:

- `scripts/score.py` line 448 awards a point of D1 for `trust_pages["bar_numbers_on_bios"]`. Since
  no record carries it, **every firm in the directory loses that point**, and every firm's D1
  evidence string reads "no bar numbers on bios". That is the repository's own stated rule broken
  in its own engine: a firm must not lose points to the reach of our crawl. Either wire the
  crawler's finding through to the record, or take the point out of D1.
- `src/lib/achievements.ts` line 100 gates the "Bar numbers published" achievement on the same
  key, so no profile can ever earn it.
- Separately, **A6's evidence string says something it does not measure.** `score.py` line 262
  computes `on_bios` from `registry_basis` containing the word "firm", which is the value
  `firm named in the registration`: that is the state register's entry naming this firm as the
  attorney's address. It then prints "bar numbers published on the bios" and awards 3 points for
  it. The register naming a firm and the firm printing a number are not the same fact. This is
  live on profiles.

## Open items for a person

- **Florida's register is the only gate in the directory blocked by us rather than by a state, and
  it is now published in a guide.** 34 Florida firms carry `Google Places API (partial)` on G3
  because `check_entity.py` says Florida's register is "published in full as data files, on an SFTP
  host that answers an anonymous request with a 401. Reading it is work we owe". The registers
  guide says that out loud, in those terms, because the alternative was letting a reader think
  Florida is like Indiana and Maryland. It is not: those states publish nothing, and Florida
  publishes everything. Doing the work moves 34 firms off a blocked gate. Ranked item 1.
  Noted 2026-09-21.

- **`operating.years` is a domain age and this file said it was a register date.** Corrected in the
  ranked list above. Worth repeating here because it is the third time two fields that sound like
  one fact have nearly reached a published page, after `bar_numbers_on_bios` and
  `attorneys[].bar_number`. The thing that caught it was the run brief's instruction to read the
  script that writes a field before building a sentence on it, and it caught it before anything was
  written rather than after. That instruction is earning its place. Noted 2026-09-21.

- **The registers guide names firms on only one side of its own distribution, deliberately.** 57 of
  113 New York firms have a domain older than their current registered entity, which has an
  innocent explanation (a practice reorganises as a new P.C. and keeps its domain) that the record
  cannot confirm. A firm in that group is indistinguishable in our data from a new practice on an
  old web address, and firm sites are unreachable from this environment, so no firm is named there.
  Only the flattering direction is named. If Oregon and Texas registration dates are ever stored
  (ranked item 6), this constraint should be revisited rather than inherited. Noted 2026-09-21.

- **The 390px horizontal overflow is still there and is still site-wide.** Re-checked this run by
  rendering the new guide and `/guides/core-web-vitals-new-york-injury-firms/` at 390 in headless
  Chromium without device emulation: both clip identically at the right edge, so the new page
  introduces nothing. Third run in a row this has been noted and left alone. It needs somebody with
  a real phone, not another headless render. Noted 2026-09-21.

- **`StackBar` silently caps at four hue steps.** `Math.min(i, 3)` in both the bar and the legend,
  so a fifth segment renders identical to the fourth and the chart reads as though two categories
  were one. This run wanted five segments on the G3 outcomes and grouped down to four instead,
  which turned out to read better anyway. Nothing is broken, but the component should either say so
  in its own comment or clamp loudly. Noted 2026-09-21.

- **No OG card generator exists; this run built one by hand and did not commit it.**
  `public/og/register.png` was produced by extracting the rendered `cover-art` SVG from the built
  page, framing it on the night ground with static aurora blobs, and screenshotting it at 1200x630
  with the preinstalled Chromium (`/opt/pw-browsers/chromium*/chrome-linux/chrome --headless
  --screenshot`). The scene must be rendered `xMidYMid meet` and not `slice`: at 1200x630 the
  440-high viewBox crops badly with `slice` and the first version lost the whole right-hand panel.
  Somebody should make this a script in `scripts/`, because every future guide needs one and this
  recipe is currently only written down here. Noted 2026-09-21.

- **A5's association list only knows three states, and it is scored.** `scripts/check_a5.py`
  matches bar and trial lawyers' associations against a fixed list of 22 patterns. Every
  state-keyed entry on it belongs to New York, Maryland or New Jersey, because those were the
  first markets. There is no Massachusetts, Oregon, Texas, Indiana or Florida bar association on
  it at all. The consequence is live in the score: a firm in Dallas or Portland that names its own
  state bar is read as naming nothing and loses three points of A5, which it can only recover by
  naming a national body. The measured gap is **84 of 155 firms in New York and Maryland against
  29 of 112 everywhere else**, and some unknown share of that is our list rather than the firms.
  This is the same class of failure as the `bar_numbers_on_bios` one: a firm losing points to the
  reach of our own matching, which the repository's own stated rule forbids. The new guide says so
  out loud rather than publishing the by-state rates as if they were rates, but saying it is not
  fixing it. The fix is adding each state's bar and trial lawyers' associations to the list and
  re-running A5, which rescores firms in five states, so it is a decision rather than an edit.
  Noted 2026-09-18.

- **Every guide page overflows horizontally at 390px in a headless render**, the new one and the
  already-published ones alike. Checked this run by rendering `/guides/what-law-firms-publish-
  about-malpractice-insurance/` and `/guides/core-web-vitals-new-york-injury-firms/` at the same
  width: both clip identically at the right edge, so it is pre-existing and site-wide rather than
  anything this run introduced, and it was left alone for that reason. It may be an artifact of
  headless Chrome without device emulation rather than a real mobile bug, which is exactly why
  somebody should check it on a real phone. If it is real it affects every article on the site.
  Noted 2026-09-18.

- **`BarChart` emphasis is a trap on a zero row, and it cost this run a rewrite.** Marking the
  row that is the point with `emphasis: true` quiets every other row, and a row whose value is
  zero draws no bar, so the chart rendered as six grey bars with nothing highlighted and the
  argument invisible. The build passed and `check_meta` passed. Only looking at the rendered
  chart caught it, which is the standing rule working. The published chart uses no emphasis and
  lets the empty track at the bottom carry the finding. Worth a line in `BarChart.astro`'s own
  comment if somebody is in there anyway. Noted 2026-09-18.

- ~~**E1's fifth point cannot be earned in two of the four practices.**~~ **Fixed 2026-09-21**,
  and it was worse than this note said. Nobody in the directory earned the point, in any
  practice: it asks for a contingency percentage and all 296 firms were scored out of six on it.
  In injury work that was the design, a differentiator sitting empty waiting for the first firm
  to publish its percentage. In the other two it was impossible, and 62 profiles carried the
  sentence "the fee percentage itself is not published" about a practice that forbids one.
  The point now asks for the figure the firm charges in the form its practice allows, and it
  has to be a number: the percentage in an injury matter, the flat fee at a closing, the rate or
  retainer in a divorce. Two firms gain it. Two more things were found underneath. `fee_model`
  and `fee_statement` were derived only from the injury and real estate blocks, so no family law
  firm could have a fee statement at all whatever it published, and `fee_sentence` threw away any
  sentence carrying a dollar figure, which is right on a results page and wrong on a fee page.

- `src/pages/methodology.astro` line 85 says of the B3 disclaimer check: "Of the first ten firms
  we read, four carried one." Still there, and now stale twice over: across the 107 firms that
  publish results, 44 carry a disclaimer. It is hand-typed prose on a page outside the guides
  section, so two runs have now left it alone rather than editing it silently. Somebody should
  either compute it or drop the sentence.
- `scripts/audit_seo.mjs` did not exist when this run was asked to run it. It was written on this
  run: broken internal links, duplicate titles and canonicals, missing canonicals, orphans.
  Orphans warn, everything else exits non-zero. It is not wired into `npm run build`; wiring it in
  is a decision for whoever owns the build.
- No firm in the directory has a single verified result. `results[]` is empty on all **217**
  records, unchanged since this was first noted at 59. Until that changes, pillar B is a measure
  of disclosure and the site should keep saying so.
- `/guides/what-a-case-results-page-proves/` says the publishing firms "average {avgPublishers}
  out of 100" and the non-publishers average something lower. Those two averages are means of
  percentages taken over different denominators, which the new denominator guide is precisely
  about, so the comparison is softer than the sentence implies. This run added a caveat paragraph
  and a link rather than rewriting somebody else's argument. Whether the averages should be
  recomputed over a common scale, or the sentence reworded, is a call for a person.
- **The score's own vocabulary is not documented anywhere a reader can reach.** `raw`, `assessed`,
  `assessable`, `coverage` and `comparable` are now explained in a guide, which is the wrong home
  for a definition the profiles and `/methodology/` both depend on. Consider moving the four-term
  glossary onto the methodology page and having the guide link to it.
- Six published pages carry a title over the 70-character mark that `audit_seo.mjs` notes, five of
  them firm profiles whose length is the firm's own name, plus `/practice-areas/personal-injury/`
  at 72. All predate this run and all are notes rather than failures, so they were left alone.
- ~~**`npm run check:meta` has been failing at head since before this run**~~, on the
  real-estate description and on three em dashes inside Jason Stone's own fee wording. **Both
  fixed 2026-09-17.** The description was trimmed. The decision the second one needed was taken
  the way this note framed it: the check now exempts quoted firm copy, in all three forms a page
  uses it, a `<blockquote>`, a `<q>` and a passage inside typographic quotation marks, and the
  profile sets the firm's fee sentence as a quotation rather than running it into ours.
  `check_meta` is clean across 314 pages.
- ~~The `attorneys[]` measurement is structural~~, and a firm that names its lawyers only in a
  paragraph read as naming nobody. **Largely fixed 2026-09-17.** Eleven changes to
  `scripts/crawl_attorneys.py` and a re-read of every firm that named nobody: eighteen firms
  gained a roster and fourteen moved from Listed to Verified on evidence that had always been on
  their sites. The crawler now reads a title in front of a name, a role in a separate element, a
  roster kept on an about page, names in unstyled divs, bios WordPress publishes as photo
  attachments, and a heading whose page title carries the practice before the job. The headline
  figure in `/guides/what-it-takes-to-check-a-law-firm/` moved on its own, which is the design
  working. Forty-nine firms still name nobody we can read, and that is now a fact about their
  sites.
- Firm sites are largely unreachable from this environment: the egress proxy blocked every attempt
  to spot-check a no-roster firm's site by hand. The two firms the new guide names are named for
  facts that are complimentary or are about a state's records policy, not for an absence we could
  not verify independently. Keep that constraint in mind before a future run names a firm as an
  example of something missing.
