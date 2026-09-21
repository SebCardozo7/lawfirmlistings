#!/usr/bin/env python3
"""
Save the mobile screenshot PageSpeed already took of each firm's home page.

A ranking of law firm websites wants a picture of each one, and every competing page on that
search is an agency portfolio of hand-picked designs. The honest version shows the same render
the score came from, so the picture and the number cannot disagree.

PageSpeed Insights returns one. Lighthouse loads the page on a throttled mobile device to measure
it, keeps the final frame, and hands it back as a base64 JPEG in the `final-screenshot` audit. So
the image is Google's own render of the page at the moment it finished measuring it, which is
exactly the thing the article is about, and it costs no new tool and no new permission: this
repository already calls that endpoint for every firm in scripts/enrich_psi.py.

What it writes. public/screens/<slug>.jpg, plus src/data/research/site-screens.json recording the
dimensions, the byte count and the date, so the page can size the image without reading it and a
missing screenshot is visible rather than a broken tile.

The screenshot is of the home page as Lighthouse rendered it on a phone. It is not a design
review and this file makes no claim about how the site looks on a desktop.

Needs GOOGLE_API_KEY in .env, the same key enrich_psi.py uses.

Usage:
    python scripts/fetch_site_screens.py --domains a.com,b.com
    python scripts/fetch_site_screens.py --top 20        # the top of the speed ranking
"""
from __future__ import annotations

import argparse
import base64
import datetime
import glob
import io
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIRMS = ROOT / "src" / "data" / "firms"
SCREENS = ROOT / "public" / "screens"
INDEX = ROOT / "src" / "data" / "research" / "site-screens.json"
ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
LF = chr(10)


def api_key() -> str | None:
    env = ROOT / ".env"
    if env.exists():
        for line in io.open(env, encoding="utf-8-sig"):
            m = re.match(r"^GOOGLE_API_KEY=(\S+)", line.strip())
            if m:
                return m.group(1)
    return os.environ.get("GOOGLE_API_KEY")


def published() -> list[dict]:
    """Every published firm with a PageSpeed reading, ranked the way the article ranks them.

    One measured number from Google, then two measured tiebreaks: whether Core Web Vitals passed
    and how many of the eight publishing signals the site carries. Nothing here is weighted by
    us, which is the whole reason the ranking is defensible.
    """
    out = []
    for path in glob.glob(str(FIRMS / "*" / "*.json")):
        firm = json.loads(Path(path).read_text(encoding="utf-8"))
        if firm.get("status") == "sample":
            continue
        digital = firm.get("digital") or {}
        value = ((digital.get("psi") or {}).get("value")) or {}
        if value.get("performance") is None:
            continue
        pages = digital.get("trust_pages") or {}
        signals = sum([
            bool(digital.get("schema_detected")), bool(firm.get("attorneys")),
            bool(pages.get("attorney_bios")), bool(pages.get("privacy_policy")),
            bool(pages.get("disclaimer")), bool(pages.get("fee_statement")),
            bool(pages.get("blog")), bool(firm.get("fee_statement")),
        ])
        out.append({
            "slug": firm["slug"], "domain": firm["domain"], "name": firm["name"],
            "performance": value["performance"], "cwv": bool(value.get("cwv_pass")),
            "signals": signals,
            "home": firm.get("website") or ("https://" + firm["domain"] + "/"),
        })
    out.sort(key=lambda r: (-r["performance"], not r["cwv"], -r["signals"]))
    return out


def jpeg_size(raw: bytes) -> tuple[int, int]:
    """Width and height from the JPEG's own start-of-frame marker.

    Lighthouse returns the screenshot without saying how big it is, and a page that has to size
    an image needs real numbers rather than an assumed phone aspect ratio: a wrong one reserves
    the wrong space and the layout jumps when the picture arrives. Parsed here rather than with an
    imaging library, because this is twelve bytes into a file format and not worth a dependency.
    """
    i = 2
    while i < len(raw) - 9:
        if raw[i] != 0xFF:
            i += 1
            continue
        marker = raw[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                      0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            height = int.from_bytes(raw[i + 5:i + 7], "big")
            width = int.from_bytes(raw[i + 7:i + 9], "big")
            return width, height
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        i += 2 + int.from_bytes(raw[i + 2:i + 4], "big")
    return 0, 0


def shoot(url: str, key: str) -> tuple[bytes, int, int]:
    """The final frame Lighthouse kept, as bytes, with the dimensions it reports."""
    qs = urllib.parse.urlencode({"url": url, "key": key, "strategy": "mobile",
                                 "category": "performance"})
    with urllib.request.urlopen(ENDPOINT + "?" + qs, timeout=180) as r:
        data = json.load(r)
    audits = (data.get("lighthouseResult") or {}).get("audits") or {}
    details = (audits.get("final-screenshot") or {}).get("details") or {}
    uri = details.get("data") or ""
    if not uri.startswith("data:image"):
        raise ValueError("PageSpeed ran and returned no screenshot for this page")
    head, b64 = uri.split(",", 1)
    raw = base64.b64decode(b64)
    # Lighthouse does not report the frame's dimensions beside the data, so they come off the
    # file. Its own numbers are preferred where a future version starts sending them.
    width = int(details.get("width") or 0)
    height = int(details.get("height") or 0)
    if not (width and height):
        width, height = jpeg_size(raw)
    return raw, width, height


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains", help="comma-separated")
    ap.add_argument("--top", type=int, help="the top N of the speed ranking")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    key = api_key()
    if not key:
        print("GOOGLE_API_KEY not found in .env or the environment.", file=sys.stderr)
        return 1

    ranked = published()
    if args.domains:
        want = {d.strip().lower() for d in args.domains.split(",") if d.strip()}
        targets = [r for r in ranked if r["domain"].lower() in want]
    elif args.top:
        targets = ranked[:args.top]
    else:
        print("give --domains or --top", file=sys.stderr)
        return 2

    SCREENS.mkdir(parents=True, exist_ok=True)
    index = {}
    if INDEX.exists():
        index = json.loads(INDEX.read_text(encoding="utf-8")).get("screens") or {}

    saved = failed = 0
    for i, firm in enumerate(targets, 1):
        try:
            raw, width, height = shoot(firm["home"], key)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            print("%2d/%d %-26s FAILED HTTP %s" % (i, len(targets), firm["domain"][:26], e.code))
            failed += 1
            continue
        except Exception as e:
            print("%2d/%d %-26s FAILED %s" % (i, len(targets), firm["domain"][:26], str(e)[:60]))
            failed += 1
            continue
        dest = SCREENS / (firm["slug"] + ".jpg")
        dest.write_bytes(raw)
        index[firm["slug"]] = {
            "file": "/screens/%s.jpg" % firm["slug"],
            "domain": firm["domain"],
            "width": width or None, "height": height or None,
            "bytes": len(raw),
            "source": ("the final frame of Lighthouse's mobile render, from the PageSpeed "
                       "Insights API"),
            "captured_at": datetime.date.today().isoformat(),
        }
        print("%2d/%d %-26s %4d/100  %5d bytes  %sx%s"
              % (i, len(targets), firm["domain"][:26], firm["performance"], len(raw),
                 width or "?", height or "?"))
        saved += 1

    INDEX.parent.mkdir(parents=True, exist_ok=True)
    io.open(INDEX, "w", encoding="utf-8", newline=LF).write(
        json.dumps({"measured_at": datetime.date.today().isoformat(),
                    "source": ("the final frame of Lighthouse's mobile render, from the "
                               "PageSpeed Insights API"),
                    "screens": dict(sorted(index.items()))},
                   ensure_ascii=False, indent=2) + LF)
    print("\n%d saved · %d failed · index at %s"
          % (saved, failed, INDEX.relative_to(ROOT)))
    if failed:
        print("A failure is usually Lighthouse timing out. Re-run those domains; a site we could "
              "not render keeps no screenshot rather than a stale one.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
