# Monthly refresh

The guides are studies, not essays. Every figure and every chart in them is computed from the
firm records at build time, so the way a guide is updated is not by rewriting it: it is by
re-measuring the firms and rebuilding. Do that once a month and the prose, the tables, the charts
and the dates all move by themselves.

What still needs a person each month is the part a script cannot do: reading what changed, saying
so, and noticing when a sentence that was true in September is not true in October.

## Run it in this order

Everything in steps 1 to 4 needs only Python 3 and the committed cohort files. No API key is
involved, nothing is invented, and the crawlers honor robots.txt with a delay, the same conduct
we score other firms on.

```sh
# 1. Rebuild the staging records from the committed cohorts. Writes .crawl/, which is gitignored
#    on purpose: it is evidence, not published data.
python3 scripts/crawl_public.py --cohort ny-personal-injury
python3 scripts/crawl_public.py --cohort ny-workers-compensation
python3 scripts/crawl_public.py --cohort md-personal-injury
python3 scripts/crawl_public.py --cohort fl-personal-injury

# 2. Re-read every firm's own case-results page. This is what pillar B and the case-results
#    guide are built from.
python3 scripts/crawl_results.py

# 3. Copy the measured blocks into the published profiles. Prose, FAQs and quotes are untouched.
python3 scripts/promote_measurements.py --domains "$(node -e "
  const fs=require('fs');const out=[];
  for (const st of fs.readdirSync('src/data/firms'))
    for (const f of fs.readdirSync('src/data/firms/'+st))
      out.push(JSON.parse(fs.readFileSync('src/data/firms/'+st+'/'+f,'utf8')).domain);
  process.stdout.write(out.join(','));")"

# 4. Rescore, then build and check.
python3 scripts/score.py
npm run build
node scripts/check_meta.mjs
node scripts/check_listing_rules.mjs
node scripts/audit_seo.mjs
node scripts/check_freshness.mjs --strict
```

`check_freshness.mjs --strict` is the step that makes this schedule real. It exits non-zero when
any family of measurements has no reading inside the last 35 days, and it names the script that
refreshes each one. If it passes, the month's data is in.

## What needs a key, and therefore a person

`scripts/enrich_psi.py` and `scripts/enrich_places.py` read the PageSpeed Insights and Places
APIs and need `GOOGLE_API_KEY` from `.env`, which is not in this repository and must not be
reconstructed. They refresh Core Web Vitals (pillar D) and Google review aggregates (pillar C),
which are what the Core Web Vitals guide and the Google reviews guide are built from. Run them on
a machine that has the key, in the same monthly pass, before step 3.

Ahrefs metrics on the cohort files are a third case: the subscription's units are a shared budget
that resets on the 19th, so a monthly pass scheduled before that date will often find none left.
That is not a failure. Record it in `guides-backlog.md` and leave the cohort as it is: D2 reads
the missing metrics, finds nothing, and scores pending, which keeps the points out of the
denominator rather than charging them to the firm.

## Then read what changed

```sh
git diff --stat src/data/firms
node scripts/check_freshness.mjs
```

Four things are worth a person's eye every month:

1. **A conditional that has flipped.** The guides are written so that a sentence changes when the
   data does ("None states what the percentage is" becomes "3 state what the percentage is").
   Check the rendered page, not the source, for the sentences that were written assuming zero.
2. **A firm whose page stopped being readable.** That moves it out of the publishing set and into
   the unreadable one, which changes several figures at once. It is usually a site redesign, and
   it is worth a look before it is reported as a finding.
3. **A chart that has lost its point.** If the distribution flattens or a highlighted band
   empties, the caption arguing about it needs rewriting or the chart needs replacing.
4. **A number in hand-typed prose.** Anything on `/methodology/` or in an editorial note is not
   computed and will not move with the data. `methodology.astro` currently has one of these.

Write the deltas into `docs/guides-backlog.md` under the run's date, and open one pull request
with the data changes and any prose that needed to follow them. Never merge it without reading
it: the whole point of this section is that a person is accountable for what it publishes.

## Scheduling it

There is no cron in this repository. The refresh is driven by a scheduled task on the account
that runs the guides work, and the task's prompt should be this file: "follow
docs/monthly-refresh.md, then report what changed". A session-scoped timer is not enough, because
those expire long before the month does.

A GitHub Actions schedule would also work for steps 1 to 4, since none of them needs a secret.
It is deliberately not set up here: it would mean this repository crawls fifty-nine law firm
websites on a timer with nobody watching, and that is the owner's call to make rather than a
default to inherit.
