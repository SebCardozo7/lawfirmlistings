# Guides backlog

Working file for the Guides section. One guide ships per run. This file carries what the last run
learned so the next one does not repeat the research.

Rules that decide what goes on this list, restated so they are not re-argued every run:

- **Every guide carries at least one chart.** A measurement is read faster as a shape than as a
  column of numbers, and these pieces are measurements before they are prose. Use the components
  in `src/components/`: `BarChart` for comparing quantities, `ColumnChart` for a distribution,
  `StackBar` for the parts of one population. A chart's numbers are passed in already computed,
  from the same variables the prose uses, so a chart can never disagree with the sentence beside
  it. Colour is not picked by eye: the steps in `global.css` were validated against the page
  surface, one hue for magnitude and a quiet grey for the bars a chart is not about, and every
  bar prints its own value so nothing is legible by colour alone.
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

As of 2026-09-13 the build produces 83 pages: `/`, `/cities/`, `/cities/new-york-ny/`,
`/cities/baltimore-md/`, `/cities/lakeland-fl/`, `/cities/<city>/personal-injury/` for all three,
`/cities/new-york-ny/workers-compensation/`, `/practice-areas/`,
`/practice-areas/personal-injury/`, `/practice-areas/workers-compensation/`, 59 firm profiles,
and the static pages (`/methodology/`, `/about/`, `/list-your-firm/`, `/contact/`, `/privacy/`,
`/terms/`). Every city and practice combination in that list is off limits as a guide topic.

## Written

| Run | Guide | Targets | Notes |
| --- | --- | --- | --- |
| 2026-09-13 | `/guides/what-a-case-results-page-proves/` | "how to check a law firm's case results", "law firm case results page", "how to verify a lawyer's track record" | Counts what every firm publishes about its own outcomes and says why we repeat none of the amounts. Doubles as the pillar B method piece. |
| earlier | `/guides/what-new-york-injury-firms-publish-about-fees/` | contingency fee disclosure | E1 method piece. |
| earlier | `/guides/google-reviews-new-york-injury-firms/` | Google review ratings for injury firms | C1/C2 method piece. Its closing paragraph was corrected on 2026-09-13: it read the verified-results set while saying "published any at all", and rendered as nobody publishing results when 37 firms do. |
| earlier | `/guides/core-web-vitals-new-york-injury-firms/` | Core Web Vitals | D method piece. |
| gated | `/guides/best-personal-injury-law-firms-nyc/` | ranking | Publishes at 8 certified firms in New York. Currently 3. |

## Next, ranked

1. **What the score cannot compare across states.** `score.assessable`, `gates_unavailable` and
   `comparable` exist because Maryland and Florida publish different registers than New York. Two
   firms currently carry `comparable: false`. A method piece saying plainly that a 71 in New York
   and a 71 in Lakeland are not the same number, and how the denominator is built. Strongest
   remaining topic: the data is committed, no other directory says this about its own score, and
   it is the honest answer to "why does this firm score lower than that one".
2. **How long these firms have actually been operating.** `operating.registered` and
   `operating.years` are filled for 58 of 59 firms from state registers. Founding year claims on
   firm websites are marketing; a register entry is not. Check how often the two disagree before
   committing: if they rarely do, the piece is a paragraph, not a guide.
3. **Malpractice insurance and bar membership, who says it out loud.** `accountability` holds
   `malpractice_insurance`, `insurance_evidence.quote` and `bar_associations` with source URLs for
   57 firms. Nothing about individual attorneys, which keeps it clear of the registration rule.
4. **What a firm's own attorney roster does not tell you.** `attorneys[]` has `bar_number` on
   almost nobody. Needs care: no characterisation of any named attorney beyond the record's own
   words, and the piece works better as a count with no names at all.
5. **The office-count problem in every directory.** `digital.places.listing_count` versus review
   totals. Overlaps the Google reviews guide; only worth writing if it is reframed as a directory
   design piece rather than a review piece.
6. **What "no queryable source" means.** The vocabulary in `content.config.ts` that keeps a
   sub-factor out of the denominator. Small, honest, probably a section of item 1 rather than its
   own guide.

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

**Next run: findlaw.com.**

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

Rules for the next one: pick the form from the data's job before touching colour, keep every
figure computed, and look at the rendered chart at 390px before shipping it. The three components
already handle the mobile reflow; a chart with more than about eight rows is a table.

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
