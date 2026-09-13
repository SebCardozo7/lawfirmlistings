#!/usr/bin/env python3
"""
Turn the designer's two lockups into the four files the templates reference.

A designer exports what looks right in the export dialog: a wide canvas with the artwork
somewhere inside it, and the lockup as a single piece. Two things follow from that, and both
are the reason this is a script rather than a manual crop.

The transparent margin is not neutral. An <img> sized by its height reserves the margin too, so
a lockup with eleven per cent of empty canvas on the left sits eleven per cent further right
than the eye expects, and no amount of CSS nudging fixes it for every breakpoint at once. So
every file written here is trimmed to its own ink.

The header needs the mark without the wordmark. Below 820px the wordmark is hidden and the
brand collapses to the mark alone, which the lockup cannot do because it is one image. The
split is found rather than guessed: the widest fully transparent column run inside the artwork
is the gutter the designer left between the diamond and the words.

Run it again whenever new source files land in public/brand. It reads and writes only that
directory, and the source files are left alone.

    python scripts/prepare_brand.py
"""
from __future__ import annotations

import pathlib
import sys

from PIL import Image

BRAND = pathlib.Path(__file__).resolve().parents[1] / "public" / "brand"

# 2x the sizes the templates ask for, so the artwork stays sharp on a retina panel and no
# larger: a header lockup is rendered at about 150 physical pixels wide.
LOCKUP_W = 640
MARK_EDGE = 256


def trim(im: Image.Image) -> Image.Image:
    box = im.getchannel("A").getbbox()
    if not box:
        raise SystemExit("the image is entirely transparent")
    return im.crop(box)


def split_mark(im: Image.Image) -> Image.Image:
    """The artwork left of the widest transparent gutter."""
    alpha = im.getchannel("A")
    w, h = im.size
    empty = [alpha.crop((x, 0, x + 1, h)).getbbox() is None for x in range(w)]

    runs, start = [], None
    for x, blank in enumerate(empty):
        if blank and start is None:
            start = x
        elif not blank and start is not None:
            runs.append((start, x))
            start = None
    if start is not None:
        runs.append((start, w))

    # Only gutters with ink on both sides, so a trailing margin is never mistaken for one.
    inner = [r for r in runs if r[0] > 0 and r[1] < w]
    if not inner:
        raise SystemExit("no gutter found between the mark and the wordmark")
    gutter = max(inner, key=lambda r: r[1] - r[0])
    return trim(im.crop((0, 0, gutter[0], h)))


def square(im: Image.Image, edge: int) -> Image.Image:
    """Centre the mark on a transparent square, so both marks share one aspect ratio."""
    scale = edge / max(im.size)
    small = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))),
                      Image.LANCZOS)
    canvas = Image.new("RGBA", (edge, edge), (0, 0, 0, 0))
    canvas.paste(small, ((edge - small.width) // 2, (edge - small.height) // 2))
    return canvas


def resize_w(im: Image.Image, width: int) -> Image.Image:
    return im.resize((width, max(1, round(im.height * width / im.width))), Image.LANCZOS)


# The three stops of public/favicon.svg. iOS ignores an SVG icon entirely, so a device that
# saves this site to a home screen gets a screenshot of the page unless a PNG exists.
GRADIENT = ((0x8B, 0x5C, 0xF6), (0x3B, 0x82, 0xF6), (0x5E, 0xEA, 0xD4))
TOUCH_EDGE = 180


def touch_icon(path: pathlib.Path) -> None:
    """The favicon's diagonal gradient, rasterised. Corner to corner, like the SVG."""
    im = Image.new("RGB", (TOUCH_EDGE, TOUCH_EDGE))
    px = im.load()
    for y in range(TOUCH_EDGE):
        for x in range(TOUCH_EDGE):
            t = (x + y) / (2 * (TOUCH_EDGE - 1))
            lo, hi, f = (0, 1, t / 0.55) if t <= 0.55 else (1, 2, (t - 0.55) / 0.45)
            px[x, y] = tuple(round(GRADIENT[lo][c] + (GRADIENT[hi][c] - GRADIENT[lo][c]) * f)
                             for c in range(3))
    im.save(path, optimize=True)


def main() -> int:
    touch_icon(BRAND.parent / "apple-touch-icon.png")
    print("apple-touch-icon %dx%d" % (TOUCH_EDGE, TOUCH_EDGE))

    for variant in ("dark", "light"):
        src = BRAND / ("logo-%s.png" % variant)
        if not src.exists():
            print("missing %s" % src.name, file=sys.stderr)
            return 1

        original = trim(Image.open(src).convert("RGBA"))
        mark = square(split_mark(original), MARK_EDGE)
        lockup = resize_w(original, LOCKUP_W)

        lockup.save(src, optimize=True)
        mark.save(BRAND / ("mark-%s.png" % variant), optimize=True)
        print("%-12s lockup %dx%d   mark %dx%d"
              % (variant, lockup.width, lockup.height, mark.width, mark.height))
    return 0


if __name__ == "__main__":
    sys.exit(main())
