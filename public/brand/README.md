# Brand files

**The header and the footer no longer read from this folder.** Since 2026-11-12 both draw the
mark in CSS: a rounded square of the site's own gradient, `--aurora`, beside the wordmark set in
the site's own typeface. It is the same square `public/favicon.svg` is, so the tab, the header
and the footer finally show one thing instead of three. It also paints with the first frame,
which a PNG lockup does not: the old one flashed an empty box on every navigation.

The files below are kept because they are the designer's work and the decision above is one line
to reverse. Nothing in `src/` references them today.

    logo-dark.png        full lockup, black diamond and wordmark, for light backgrounds
    logo-light.png       full lockup, pale lavender, for the dark hero and the footer
    mark-dark.png        the diamond on its own, black
    mark-light.png       the diamond on its own, pale lavender
    avatar-512.png       the square avatar, for profiles that want one

To go back to the lockup, put the `<img class="brand-lockup">` back in `Header.astro` and
`Footer.astro` in place of `.brand-tile` and `.brand-word`, and restore `.brand-lockup` in
`global.css`. SVG if the designer can export it, which stays sharp at every size and weighs less
than a PNG. PNG at 2x otherwise: 640px wide for a lockup, 256px square for a mark.
