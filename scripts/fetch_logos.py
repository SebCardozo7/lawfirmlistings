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
import _tls  # noqa: F401  (certificate authorities; see scripts/_tls.py)

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


JSON_LD = re.compile(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.I | re.S)


def attr(tag: str, name: str):
    m = re.search(r"%s=[\"']([^\"']+)[\"']" % name, tag, re.I)
    return m.group(1) if m else None


def ico_directory(blob: bytes):
    """Every image an .ico holds, as (width, height, length, offset).

    An .ico is a container rather than a picture. Bytes 4 and 5 count the images it holds, and one
    16-byte entry per image follows, each stating that image's size and where in the file it sits.
    A zero in a size byte means 256, which is the only size that does not fit in a byte.

    Reading only the first entry, which is what this used to do, turns down a file holding a 256
    pixel logo on the grounds that it is 16 pixels, because generators conventionally write the
    small sizes first.
    """
    if blob[:4] != b"\x00\x00\x01\x00" or len(blob) < 6:
        return []
    count = struct.unpack("<H", blob[4:6])[0]
    out = []
    for i in range(count):
        at = 6 + i * 16
        if at + 16 > len(blob):
            break
        length, offset = struct.unpack("<II", blob[at + 8:at + 16])
        out.append((blob[at] or 256, blob[at + 1] or 256, length, offset))
    return out


def ico_best(blob: bytes):
    """The largest image an .ico declares, or None when it declares none."""
    entries = ico_directory(blob)
    return max(entries, key=lambda e: min(e[0], e[1])) if entries else None


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
    if blob[:4] == b"\x00\x00\x01\x00" and len(blob) > 8:
        best = ico_best(blob)
        return (best[0], best[1]) if best else None
    if b"<svg" in blob[:400].lower():
        return "svg", "svg"
    return None


def declared_logo(html: str, origin: str, stored=None):
    """The logo a firm declares in its own structured data, if it declares one.

    264 published firms have no logo, and for most of them the reason is the same: their site
    serves a 32-pixel icon and an empty favicon.ico, which this script rightly refuses. 154 of
    those 264 do declare a real logo in the JSON-LD on their own home page, and the filenames say
    so: logo-square-color2.svg, mdk-logo-09-22-23.png, logo-white.png.

    It sits below the declared icons and above favicon.ico. Below, because an apple-touch-icon is
    square by construction and a brand lockup may be four times as wide as it is tall. Above,
    because a 16-pixel .ico is not a logo at all.
    """
    found = []

    def dig(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key.lower() == "logo":
                    if isinstance(value, str):
                        found.append(value)
                    elif isinstance(value, dict) and value.get("url"):
                        found.append(value["url"])
                dig(value)
        elif isinstance(node, list):
            for value in node:
                dig(value)

    # Either the page we just fetched or the structured data crawl_public stored for us.
    if stored is not None:
        dig(stored)
    for block in JSON_LD.findall(html or ""):
        try:
            dig(json.loads(block))
        except ValueError:
            continue
    return [urllib.parse.urljoin(origin + "/", u) for u in found if u]


IMG_TAG = re.compile(r"<img[^>]+>", re.I)
LOGO_WORD = re.compile(r"logo|brand", re.I)
# The badges a law firm puts in its header beside its own mark, which are somebody else's logo.
# Publishing one of these as the firm's logo would be worse than the monogram, and the word
# "logo" is in half their filenames.
NOT_OURS = re.compile(
    r"avvo|superlawyer|super-lawyer|martindale|justia|lawyers?-of-distinction|bbb|better-business"
    r"|yelp|google|facebook|twitter|linkedin|instagram|youtube|tiktok|trustpilot|findlaw"
    r"|million-dollar|multi-million|top-?100|top-?40|rising-?star|best-?law|nadc|natda|aaj"
    # Four that got through and only an eye caught, which is why review_logos.py exists.
    # thelalawfirm.com published MMDAF_Logo_PMS_3_color_EPS.webp, the Multi-Million Dollar
    # Advocates Forum seal; michaelwaks.com published V7_Logo_MDR_Dark.svg, a "Verdict: Million
    # Dollar Results" lockup; arattalegal.com published experience-logo1.png, a laurel wreath
    # around a banner; and frlawfirmpllc.com published its marketing agency's logo, SMB Team.
    # Only the last two are nameable here. No filename rule finds a wreath.
    r"|mmdaf|_mdr|-mdr|mdr_|mdr-|smbteam|smb-?logo|experience-logo"
    r"|scorpion|fosterwebmarketing|lawrank|rankings\.io|postali|hennessey"
    r"|as-seen|seen-on|featured|press|news|media|award|badge|seal|member|association|certified"
    r"|partner|client|sponsor|payment|visa|mastercard|amex|paypal",
    re.I)


def invisible_on_paper(blob: bytes, ext: str):
    """Whether this logo would show as an empty box where the site draws it.

    Both surfaces that render a logo are light: the firm card and the profile use --paper, and
    the panel draws on #fff. A header logo is often the reversed-out version, white artwork on a
    transparent background made for a dark navigation bar, and six of the first fifty-five read
    this way arrived like that. On a white card they are a blank rectangle with a border, which
    is worse than the monogram, and nothing downstream would ever have said so.

    Returns a reason, or None when the logo has ink a reader can see.
    """
    if ext == ".svg":
        # No pixels to count. A fill is named or it is inherited, and artwork that names only
        # white and nothing else is the reversed version.
        text = blob.decode("utf-8", "replace")
        fills = set(m.lower() for m in re.findall(r'fill[:=]["\s]*(#[0-9a-fA-F]{3,8}|white)', text))
        fills.discard("none")
        light = {"#fff", "#ffffff", "#fffffff", "#ffffffff", "white"}
        if fills and fills <= light:
            return "white artwork, invisible on the card it would sit on"
        return None
    try:
        from PIL import Image
        import io as _io
        im = Image.open(_io.BytesIO(blob)).convert("RGBA")
    except Exception:
        return None  # If it cannot be opened here, the dimension reader already had its say.
    im.thumbnail((160, 160))
    px = list(im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata())
    ink = [p for p in px if p[3] > 32]
    if len(ink) < len(px) * 0.01:
        return "almost nothing but transparency"
    pale = sum(1 for r, g, b, _ in ink if (0.299 * r + 0.587 * g + 0.114 * b) > 212)
    # Whether a white pixel disappears depends on what is behind it, and the alpha channel is
    # what says so. On a transparent background the pale pixels are artwork that will vanish into
    # the card. On an opaque one they are the artwork's own white background, which is the same
    # colour as the card and is meant to be: eight of these are a logo flattened onto white, and
    # judging them by the same number would have thrown away perfectly good marks.
    opaque = len(ink) > len(px) * 0.9
    if not opaque and pale > len(ink) * 0.8:
        return "white artwork, invisible on the card it would sit on"
    if opaque and pale > len(ink) * 0.995:
        return "a blank white rectangle"
    return None


def header_logo(html: str, origin: str):
    """The firm's own mark, from the top of its own page.

    154 firms still show a monogram and most of them do have a logo: it is an <img> in the header
    with a class the theme author wrote, and this script was only ever looking at declared icons,
    JSON-LD and favicon.ico. lopezandhumphries.com, a client, serves a 32-pixel icon and an empty
    favicon.ico, and carries atf-and-scroll-nav-logo-1.svg under class="logo-main".

    A class that says logo is trusted over a filename that says logo, because the class was
    written by whoever built the site to mean this image is the site's mark, while the filename is
    also what every award badge in the industry is called. Only the first images in the document
    are considered, which is the header without having to parse the page's structure.
    """
    out = []
    for position, tag in enumerate(IMG_TAG.findall(html or "")[:25]):
        src = attr(tag, "src") or attr(tag, "data-src")
        if not src or src.startswith("data:"):
            continue
        cls = attr(tag, "class") or ""
        alt = attr(tag, "alt") or ""
        if NOT_OURS.search(cls) or NOT_OURS.search(src) or NOT_OURS.search(alt):
            continue
        by_class = bool(LOGO_WORD.search(cls))
        if not by_class and not LOGO_WORD.search(src):
            continue
        # Earlier in the document wins among equals: a header mark is above a footer one, and the
        # footer copy is often the single-colour version.
        out.append((600 if by_class else 200, position, urllib.parse.urljoin(origin + "/", src)))
    out.sort(key=lambda t: (-t[0], t[1]))
    return [url for _, _, url in out]


def candidates(html: str, origin: str, stored=None):
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
    # Scored between the declared icons and the .ico: see declared_logo for why.
    for url in declared_logo(html, origin, stored):
        out.append((-500, url))
    # Below what the firm declares in structured data, because that is an explicit statement about
    # which image is its logo, and above favicon.ico, because a 16-pixel .ico is not a logo.
    for rank, url in enumerate(header_logo(html, origin)):
        out.append((-600 - rank, url))
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
        # The staging directory holds more than firm records: discover_places writes its
        # candidate lists there too, and those are lists. Skip anything that is not a
        # firm record rather than stopping the whole run on it.
        if not isinstance(record, dict) or "domain" not in record:
            continue
        domain = record.get("domain")
        if not domain or not record.get("https_ok"):
            continue

        origin = record.get("canonical_origin") or ("https://" + domain)
        rp = robots_for(origin)
        status, html, final = fetch(origin + "/")
        time.sleep(DELAY)
        # A home page that will not serve us today is not the end of the search. crawl_public
        # already stored this firm's structured data, and for 154 of the 264 firms without a logo
        # that is where the logo is declared. gadclaw.com and sargonlawgroup.com both refuse the
        # home page now and both declare a logo in the record we already hold.
        stored = record.get("json_ld")
        if status != 200 or not html:
            if not stored:
                print("%-30s home returned %s" % (domain, status))
                continue
            if args.verbose:
                print("%-30s home returned %s; reading the stored structured data"
                      % (domain, status))
            html = ""

        chosen = None
        for url in candidates(html, origin, stored):
            if not rp.can_fetch(UA, url):
                continue
            blob, meta = download(url)
            time.sleep(DELAY)
            if not blob:
                # download() hands back the content type on success and the error on failure, so a
                # media type here means the server answered 200 with nothing in the body. Twenty
                # five sites in the directory do exactly that, and printing the bare type read as
                # though we had failed to measure a file rather than been given an empty one.
                if args.verbose:
                    print("      %s: %s" % (url[:60],
                          "served empty" if meta.startswith("image/") else meta))
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
            if ext == ".ico":
                # The size that cleared the minimum is one image inside a container, and a browser
                # asked to draw the container in an <img> picks whichever size it likes. Publish
                # that image on its own, which works when it is a PNG, and that is how every
                # generator stores the large sizes. When it is not, keep the monogram: it is a
                # better picture than a 16 pixel icon a browser happened to reach for.
                best = ico_best(blob)
                inner = blob[best[3]:best[3] + best[2]] if best else b""
                if inner[:8] != b"\x89PNG\r\n\x1a\n":
                    if args.verbose:
                        print("      %s: %sx%s sits in an .ico we cannot unpack"
                              % (url[:60], w, h))
                    continue
                blob, ext = inner, ".png"
            pale = invisible_on_paper(blob, ext)
            if pale:
                if args.verbose:
                    print("      %s: %s" % (url[:60], pale))
                continue
            chosen = (url, blob, ext, w, h)
            break

        if not chosen:
            skipped += 1
            print("%-30s no icon worth publishing; the monogram stays" % domain)
            continue

        url, blob, ext, w, h = chosen
        out = LOGOS / (domain + ext)
        out.write_bytes(blob)

        # Say which of the three it was. This field is published on the profile, and once the
        # header became a source "the icon the firm's own site declares" was no longer true of
        # every logo here: an <img class="logo"> is not a declaration, it is the picture at the
        # top of the page.
        if url in set(header_logo(html, origin)):
            provenance = ("The logo in the header of the firm's own site, copied here rather "
                          "than hot-linked")
        elif url in set(declared_logo(html, origin, stored)):
            provenance = ("The logo the firm names in its own structured data, copied here "
                          "rather than hot-linked")
        else:
            provenance = ("The icon the firm's own site declares, copied here rather than "
                          "hot-linked")

        fresh = json.loads(path.read_text(encoding="utf-8"))   # four scripts share this file
        fresh["logo"] = {
            "file": "/logos/" + out.name,
            "source_url": url,
            "width": None if w == "svg" else w,
            "height": None if h == "svg" else h,
            "bytes": len(blob),
            "source": provenance,
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
