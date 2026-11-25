# Working in this repository

## How changes reach production

Cloudflare builds and deploys on every push to `main`, so what lands on `main` is live.

**Push straight to `main`, with no pull request, for everything except the scoring engine.**
Content, guides, copy, design, layout, components, fixtures, tooling and data that is not a
score: commit and push. Run the build and the audits first, as always. The review step was
costing more than it caught on this kind of change.

**Open a pull request for anything that can change a published score or gate.** That is
`scripts/score.py`, the `check_*` scripts that write gates, `promote_measurements.py`,
`build_profiles.py`, `apply_ahrefs.py`, and any change to `src/data/firms` that moves a
`score.total`, a `tier` or a gate `pass`. Say in the body how many firms change tier.

The reason for the asymmetry: a score is a public statement about a real law firm, and the
review step has caught a retired gate written into fifty-eight profiles, a name matched to the
wrong register entry, and a market about to publish ninety-three firms at the same tier. A
heading, a paragraph and a CSS change have never needed it.

A change that mixes both goes through a pull request.

## Things that are easy to get wrong here

**The repository is public.** No real person's name, email address or IP address in any file
that is committed. Addresses a firm published on its own site belong in `.crawl/`, which is
gitignored, and never on a profile. Every fixture uses a `.example` domain.

**Never price a correction.** A firm asking us to fix something on its profile, or to appeal a
sub-score, is answered for free, now and always, whether or not it ever buys anything. The
letter says so in writing.

**An absence is a measurement only when something looked.** A field that is missing because no
check ran must leave the scale, not count against the firm: see `sub()`'s `max_override` in
`scripts/score.py` and the treatment A5 gives professional liability cover. Publishing "no bar
numbers on bios" about a firm whose bios nobody read is the one thing this engine may not do.

**Scope a run to the firms it touches.** `--domains` exists on every crawl and promote script.
A whole-directory pass rewrites 1,400 files and is the monthly job's work, not a habit.
