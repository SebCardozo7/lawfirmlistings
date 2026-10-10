#!/usr/bin/env python3
"""
The site's mark as a square PNG, big enough for a Google account photo.

Gmail does not put a logo beside a sender on its own. It shows either a BIMI logo, which needs
a certificate costing more than a thousand dollars a year, or the profile photo of a Google
account attached to the sending address, which is free. The second one needs an image of at
least 250x250, and public/apple-touch-icon.png is 180.

So this writes the same full-bleed square of the site's gradient at any size, from the same
three colours public/favicon.svg uses, with no dependency: a PNG is a zlib stream of scanlines
and struct can write the four chunks around it. Pillow is not in this project and one image
is not a reason to put it there.

    python scripts/make_avatar.py                 writes public/brand/avatar-512.png
    python scripts/make_avatar.py --size 1024
"""
from __future__ import annotations

import argparse
import pathlib
import struct
import zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# public/favicon.svg, stop for stop: aurora violet, electric blue at 55%, teal.
STOPS = [(0.0, (0x8B, 0x5C, 0xF6)), (0.55, (0x3B, 0x82, 0xF6)), (1.0, (0x5E, 0xEA, 0xD4))]


def colour_at(t: float) -> tuple[int, int, int]:
    """The gradient at t, interpolated between the two stops it falls between."""
    t = min(max(t, 0.0), 1.0)
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t <= t1:
            span = t1 - t0
            k = 0.0 if span == 0 else (t - t0) / span
            return tuple(round(a + (b - a) * k) for a, b in zip(c0, c1))
    return STOPS[-1][1]


def chunk(kind: bytes, data: bytes) -> bytes:
    return (struct.pack(">I", len(data)) + kind + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))


def png(size: int) -> bytes:
    """A size x size truecolour PNG of the diagonal gradient."""
    rows = bytearray()
    last = size - 1
    for y in range(size):
        rows.append(0)  # filter type 0, no prediction: the image is a smooth ramp
        for x in range(size):
            # The SVG runs its gradient corner to corner, so a pixel's position along it is
            # how far (x + y) has travelled across both axes.
            rows.extend(colour_at((x + y) / (2 * last) if last else 0.0))
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
            + chunk(b"IEND", b""))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=512,
                    help="pixels square; Google wants at least 250")
    ap.add_argument("--out", default="public/brand/avatar-512.png")
    args = ap.parse_args()

    out = ROOT / args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    data = png(args.size)
    out.write_bytes(data)
    print("%s  %dx%d  %d bytes" % (args.out, args.size, args.size, len(data)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
