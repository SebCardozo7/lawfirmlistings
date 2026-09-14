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
session is gone. When that happens nobody sends anything. If the owner wants a guarantee that does
not depend on a session being alive, that belongs in a workflow on `push` to `main`, not here.

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

As of 2026-09-14 the build produces 84 pages: `/`, `/cities/`, `/cities/new-york-ny/`,
`/cities/baltimore-md/`, `/cities/lakeland-fl/`, `/cities/<city>/personal-injury/` for all three,
`/cities/new-york-ny/workers-compensation/`, `/practice-areas/`,
`/practice-areas/personal-injury/`, `/practice-areas/workers-compensation/`, 59 firm profiles,
and the static pages (`/methodology/`, `/about/`, `/list-your-firm/`, `/contact/`, `/privacy/`,
`/terms/`). Every city and practice combination in that list is off limits as a guide topic.

## Written

| Run | Guide | Targets | Notes |
| --- | --- | --- | --- |
| 2026-09-14 | `/guides/what-a-law-firm-score-cannot-compare/` | "how are lawyer ratings calculated", "law firm rating methodology", "what does a lawyer rating mean", "are lawyer ratings comparable" | The denominator piece. Reads all three states rather than one, because the argument is what happens when the directory crosses a state line. Two corrections were caught in draft and are worth remembering: the certification coverage floor is `MIN_COVERAGE = 0.60`, not 0.70, and the highest total outside New York is a firm whose total we withhold, not the highest comparable one. |
| 2026-09-13 | `/guides/what-a-case-results-page-proves/` | "how to check a law firm's case results", "law firm case results page", "how to verify a lawyer's track record" | Counts what every firm publishes about its own outcomes and says why we repeat none of the amounts. Doubles as the pillar B method piece. |
| earlier | `/guides/what-new-york-injury-firms-publish-about-fees/` | contingency fee disclosure | E1 method piece. |
| earlier | `/guides/google-reviews-new-york-injury-firms/` | Google review ratings for injury firms | C1/C2 method piece. Its closing paragraph was corrected on 2026-09-13: it read the verified-results set while saying "published any at all", and rendered as nobody publishing results when 37 firms do. |
| earlier | `/guides/core-web-vitals-new-york-injury-firms/` | Core Web Vitals | D method piece. |
| gated | `/guides/best-personal-injury-law-firms-nyc/` | ranking | Publishes at 8 certified firms in New York. Currently 3. |

## Next, ranked

Item 1 was taken on 2026-09-14, and item 6 went into it as a section rather than becoming its own
guide, which is what the old entry predicted. What the writing turned up changed the ranking
below: the piece set out to be about state lines and found that the state lines are the small
half of the problem, which leaves a bigger topic behind it.

1. **The pending measurement, as its own study.** The new denominator guide reports that D2
   Search authority is unmeasured on 46 of 59 firms, which is the single largest hole in the
   score and is ours rather than any state's. That guide gives it four sentences. It deserves a
   piece: what D2 measures, why the cohort ran out of Ahrefs units (the reasoning is already
   written down in `content.config.ts` on the `cohorts` schema), what the score looks like for
   the thirteen firms that do carry it, and what changes when the rest land. Strongest remaining
   topic, and the most uncomfortable, which is usually the same thing here.
2. **How long these firms have actually been operating.** `operating.registered` and
   `operating.years` are filled for 58 of 59 firms from state registers. Founding year claims on
   firm websites are marketing; a register entry is not. Check how often the two disagree before
   committing: if they rarely do, the piece is a paragraph, not a guide.
3. **The firms that publish no roster at all.** Fell out of this run and is not the same topic as
   item 4. Six New York firms have G1 and G2 recorded as `no roster published`: the state register
   is open, and there is simply no name on the site to look up in it. That is a finding about what
   a firm chooses to publish, it is measurable today, and it is the demand-side version of the
   "how do I check my lawyer's licence" query that the registers themselves own (see the SERP note
   below). Check first whether the six are small firms, which would make it a size story instead.
4. **Malpractice insurance and bar membership, who says it out loud.** `accountability` holds
   `malpractice_insurance`, `insurance_evidence.quote` and `bar_associations` with source URLs for
   57 firms. Nothing about individual attorneys, which keeps it clear of the registration rule.
5. **What a firm's own attorney roster does not tell you.** `attorneys[]` has `bar_number` on
   almost nobody. Needs care: no characterisation of any named attorney beyond the record's own
   words, and the piece works better as a count with no names at all. Overlaps item 3; if item 3
   is written, this is probably a section of it.
6. **The office-count problem in every directory.** `digital.places.listing_count` versus review
   totals. Overlaps the Google reviews guide; only worth writing if it is reframed as a directory
   design piece rather than a review piece.

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

**Next run: avvo.com.**

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

## Open items for a person

- `src/pages/methodology.astro` line 85 says of the B3 disclaimer check: "Of the first ten firms
  we read, four carried one." That figure is now stale: across the 37 firms that publish results,
  21 carry a disclaimer. It is hand-typed prose on a page outside the guides section, so this run
  left it alone rather than editing it silently.
- `scripts/audit_seo.mjs` did not exist when this run was asked to run it. It was written on this
  run: broken internal links, duplicate titles and canonicals, missing canonicals, orphans.
  Orphans warn, everything else exits non-zero. It is not wired into `npm run build`; wiring it in
  is a decision for whoever owns the build.
- No firm in the directory has a single verified result (`results[]` is empty for all 59 records).
  Until that changes, pillar B is a measure of disclosure and the site should keep saying so.
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
- Two published pages carry a title over the 70-character mark that `audit_seo.mjs` notes:
  `/firms/koenigsberg-associates-law-offices/` at 71 and `/practice-areas/personal-injury/` at 72.
  Both predate this run and both are notes rather than failures, so they were left alone.
