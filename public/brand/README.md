# Brand files

Drop the designer's files here and they get wired into the header, the footer and the Open Graph
image. Names matter, because the templates reference them:

    logo-dark.svg        full lockup, black mark and wordmark, for light backgrounds
    logo-light.svg       full lockup, pale lavender, for the dark hero and the footer
    mark-dark.svg        the diamond on its own, black
    mark-light.svg       the diamond on its own, pale lavender

SVG if the designer can export it, which stays sharp at every size and weighs less than a PNG.
PNG at 2x otherwise: 640px wide for a lockup, 256px square for a mark.

The favicon is not one of these. It is generated in public/favicon.svg as a full-bleed square of
the site's own gradient, because at 16 pixels a mark with cut-outs in it reads as a smudge.
