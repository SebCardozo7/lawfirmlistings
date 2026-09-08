# Law Firm Listings — lawfirmlistings.com

Static directory of U.S. law firms with the **LFL Certification Score** (Methodology v1.0). Built with Astro; data lives in JSON; pages are generated.

## Run
```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # runs scripts/score.py, then astro build → dist/
LFL_ENV=production npm run build   # strict: fails on sample firms / illustrative sub-scores on certified firms
```

## Layout
- `src/data/firms/<state>/<slug>.json` — one firm per file. `status`: listed | certified | not_eligible | sample. Every measured value carries `source` + date. `assessments` holds human-assessed sub-factors (`pts`, `source`, `evidence`). `score` is **written by `scripts/score.py`** — never edit by hand.
- `src/data/cohorts/<state>-<practice>.json` — Ahrefs metrics for the peer set (percentiles are computed against it).
- `src/content.config.ts` — zod schemas for both collections.
- `src/pages/firms/[slug].astro` — data-driven profile (scorecard, digital snapshot, offices, attorneys, reviews, FAQ, JSON-LD).
- `src/pages/{index,methodology}.astro`, `practice-areas/`, `cities/`, `guides/` — v0.8 design pages (static copy; firm cards there are still sample content — to be data-driven in Phase 1).
- `src/components/Scorecard.astro` — the certification scorecard; `Icon.astro` — inline SVG set; `src/styles/global.css` — design system "Aurora + Paper".
- `scripts/score.py` — Methodology v1.0: gates → pillars A–E → tiers (Certified 70 / Distinguished 85 / Elite 93 with A+B+C floors 40/50/55).

## Deploy (Cloudflare Pages)
Framework preset **Astro** · build command `npm run build` · output directory `dist` · Node 22. Add env `LFL_ENV=production` for the production branch once sample data is gone.

## Data honesty rules
No invented amounts, scores or reviews for real firms. Unverified results render as `$—` / "Pending verification". Sub-factors without a measured source are tagged Illustrative (dev) or Pending, never shown as facts.
