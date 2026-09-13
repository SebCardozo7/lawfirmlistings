#!/usr/bin/env python3
"""
A firm's own logo, so a directory of law firms does not look like a spreadsheet of initials.

Every card and profile currently shows a two-letter monogram on a dark tile. It is tidy and it is
the same for everybody, which on a page comparing seven firms is a page with no way in for the
eye. Firms publish a perfectly good logo already, in the icon their own site declares.

Where the picture comes from, in order of preference:

    apple-touch-icon        usually 180x180, a real logo, made to sit on a phone home screen
    <link rel="icon"> with the largest declared `sizes`, which on WordPress is 192x192
    /favicon.ico            the last resort, and often 16x16, which is why it is last

Anything under 64 pixels is rejected rather than published blurred: the monogram we already have
looks better than a 16-pixel icon stretched to 56, so the fallback is not a failure state.

Downloaded, never hotlinked. Hotlinking would make a firm's server pay for our traffic, hand it
the IP address of every visitor reading about it, and leave a card broken the day somebody
reorganises their uploads folder. The file is copied into public/logos/ and served from here.

Using a firm's mark to identify that firm in a directory entry about it is ordinary nominative
use, which is what every directory does and what the logo is for. It is never presented as a
badge, never placed near the certification mark, and a firm that asks for it to come down gets
that without argument.

Usage:
    python scripts/fetch_logos.py
    python scripts/fetch_logos.py --domains malloy-law.com --verbose
"""
from __future__ import annotations

import argparse
import datetime
import glob
import io
import json
import pathlib
import re
import struct
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from crawl_public import UA, fetch, robots_for  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
LOGOS = ROOT / "public" / "logos"
TODAY = datetime.date.today().isoformat()
DELAY = 1.0

# Below this the monogram is the better picture. 64 is the smallest that survives the 56px tile
# on a high-density screen without going soft.
MIN_EDGE = 64
MAX_BYTES = 400_000

ICON_LINK = re.compile(
    r"<link[^>]+rel=[\"'][^\"']*\b(?:icon|shortcut icon|apple-touch-icon)\b[^\"']*[\"'][^>]*>",
    re.I)

EXT = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif",
       "image/svg+xml": ".svg", "image/webp": ".webp",
       "image/x-icon": ".ico", "image/vnd.microsoft.icon": ".ico"}


def attr(tag: str, name: str):
    m = re.search(r"%s=[\"']([^\"']+)[\"']" % name, tag, re.I)
    return m.group(1) if m else None


def dimensions(blob: bytes):
    """(width, height) read from the file's own header, or None.

    Pillow is not installed and this does not need it: every format here states its size in the
    first few dozen bytes, and reading them is more predictable than adding a dependency to a
    pipeline that otherwise needs none.
    """
    if blob[:8] == b"\x89PNG\r\n\x1a\n" and blob[12:16] == b"IHDR":
        return struct.unpack(">II", blob[16:24])
    if blob[:6] in (b"GIF87a", b"GIF89a"):
        return struct.unpack("<HH", blob[6:10])
    if blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        if blob[12:16] == b"VP8X":
            w = int.from_bytes(blob[24:27], "little") + 1
            h = int.from_bytes(blob[27:30], "little") + 1
            return w, h
        if blob[12:16] == b"VP8 ":
            return struct.unpack("<HH", blob[26:30])
        if blob[12:16] == b"VP8L":
            bits = int.from_bytes(blob[21:25], "little")
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if blob[:2] == b"\xff\xd8":                       # JPEG: walk to a start-of-frame marker
        i = 2
        while i + 9 < len(blob):
            if blob[i] != 0xFF:
                i += 1
                continue
            marker = blob[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                          0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", blob[i + 5:i + 9])
                return w, h
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            i += 2 + int.from_bytes(blob[i + 2:i + 4], "big")
        return None
    if blob[:4] == b"\x00\x00\x01\x00" and len(blob) > 8:   # ICO: 0 in the byte means 256
        w, h = blob[6] or 256, blob[7] or 256
        return w, h
    if b"<svg" in blob[:400].lower():
        return "svg", "svg"
    return None


def candidates(html: str, origin: str):
    """Declared icons, best first."""
    out = []
    for tag in ICON_LINK.findall(html or ""):
        href = attr(tag, "href")
        if not href:
            continue
        sizes = (attr(tag, "sizes") or "").lower()
        biggest = 0
        for part in sizes.replace("x", " ").split():
            if part.isdigit():
                biggest = max(biggest, int(part))
        rel = (attr(tag, "rel") or "").lower()
        typ = (attr(tag, "type") or "").lower()
        # An apple-touch-icon with no stated size is 180 by convention, and an .ico is a last
        # resort whatever it claims.
        if not biggest and "apple-touch" in rel:
            biggest = 180
        score = biggest - (500 if "icon" in typ and "x-icon" in typ else 0)
        out.append((score, urllib.parse.urljoin(origin + "/", href)))
    out.append((-1000, origin + "/favicon.ico"))
    seen, ranked = set(), []
    for score, url in sorted(out, key=lambda p: -p[0]):
        if url not in seen:
            seen.add(url)
            ranked.append(url)
    return ranked


def download(url: str):
    """(bytes, content_type) or (None, reason)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            blob = response.read(MAX_BYTES + 1)
            return blob, (response.headers.get("Content-Type") or "").split(";")[0].strip()
    except Exception as e:
        return None, str(e)[:70]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains", help="comma-separated; default is every staging record")
    ap.add_argument("--staging", default=".crawl")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    LOGOS.mkdir(parents=True, exist_ok=True)
    staging = pathlib.Path(args.staging)
    if args.domains:
        files = [staging / (d.strip() + ".json") for d in args.domains.split(",") if d.strip()]
    else:
        files = sorted(pathlib.Path(p) for p in glob.glob(str(staging / "*.json"))
                       if "discipline_" not in p)

    kept = skipped = 0
    for path in files:
        if not path.exists():
            continue
        record = json.loads(path.read_text(encoding="utf-8"))
        domain = record.get("domain")
        if not domain or not record.get("https_ok"):
            continue

        origin = record.get("canonical_origin") or ("https://" + domain)
        rp = robots_for(origin)
        status, html, final = fetch(origin + "/")
        time.sleep(DELAY)
        if status != 200 or not html:
            print("%-30s home returned %s" % (domain, status))
            continue

        chosen = None
        for url in candidates(html, origin):
            if not rp.can_fetch(UA, url):
                continue
            blob, meta = download(url)
            time.sleep(DELAY)
            if not blob:
                if args.verbose:
                    print("      %s: %s" % (url[:60], meta))
                continue
            if len(blob) > MAX_BYTES:
                if args.verbose:
                    print("      %s: larger than %d bytes" % (url[:60], MAX_BYTES))
                continue
            dims = dimensions(blob)
            if not dims:
                continue
            w, h = dims
            if w != "svg" and min(w, h) < MIN_EDGE:
                if args.verbose:
                    print("      %s: %sx%s, under the %d minimum" % (url[:60], w, h, MIN_EDGE))
                continue
            ext = EXT.get(meta) or pathlib.Path(urllib.parse.urlparse(url).path).suffix or ".png"
            chosen = (url, blob, ext, w, h)
            break

        if not chosen:
            skipped += 1
            print("%-30s no icon worth publishing; the monogram stays" % domain)
            continue

        url, blob, ext, w, h = chosen
        out = LOGOS / (domain + ext)
        out.write_bytes(blob)

        fresh = json.loads(path.read_text(encoding="utf-8"))   # four scripts share this file
        fresh["logo"] = {
            "file": "/logos/" + out.name,
            "source_url": url,
            "width": None if w == "svg" else w,
            "height": None if h == "svg" else h,
            "bytes": len(blob),
            "source": "The icon the firm's own site declares, copied here rather than hot-linked",
            "fetched_at": TODAY,
        }
        io.open(path, "w", encoding="utf-8", newline="\n").write(
            json.dumps(fresh, ensure_ascii=False, indent=2) + "\n")
        kept += 1
        print("%-30s %sx%s  %-5s %d bytes" % (domain, w, h, ext, len(blob)))

    print()
    print("%d logo(s) saved to public/logos/ · %d firms keep their monogram" % (kept, skipped))
    print("Under %dpx a monogram is the better picture, so it is not a fallback of last resort."
          % MIN_EDGE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
