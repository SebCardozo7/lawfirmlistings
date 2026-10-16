"""A contact sheet of every logo, drawn the way the site draws it, so somebody can look.

fetch_logos.py reads four sources now, and the newest of them, the <img> in a site's header, is
the only one a person has to check. The other three are declarations: a <link rel="icon">, a
schema.org logo property and favicon.ico are all the site saying "this is my icon". A header
image is not a declaration. It is whatever is at the top of the page, and at the top of a law
firm's page, beside its own mark, sit the badges.

Of the first fifty-five read this way, four were not the firm's logo and no rule found them:

    thelalawfirm.com        MMDAF_Logo_PMS_3_color_EPS.webp   Multi-Million Dollar Advocates seal
    michaelwaks.com         V7_Logo_MDR_Dark.svg              "Verdict: Million Dollar Results"
    arattalegal.com         experience-logo1.png              a laurel wreath around a banner
    frlawfirmpllc.com       SMB-Logo-Horizontal-FC-300x97.png its marketing agency's logo

Three are now in NOT_OURS by name and the wreath never will be, because no filename rule finds a
picture of a wreath. What finds them is looking, which takes about a minute for fifty logos and
is the difference between publishing a firm's mark and publishing somebody else's.

So: run this, open the file it prints, and look. Then promote.

    python scripts/review_logos.py
    python scripts/review_logos.py --new          only the ones not yet on a published profile

The sheet draws each logo on #fff, which is what the firm card, the profile and the panel all
use, so a logo that reads as an empty box here reads as an empty box on the site. The contrast
check in fetch_logos already rejects artwork that is entirely white, and this is how you see the
ones it passed.
"""
import argparse
import glob
import io
import json
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / ".logo-review.html"

PAGE = """<!doctype html>
<meta charset="utf-8">
<title>Logo review</title>
<style>
  body{font:13px/1.45 system-ui,sans-serif;background:#eceef2;color:#15161a;margin:0;padding:22px}
  h1{font-size:15px;margin:0 0 4px}
  p.note{color:#5b5f6b;margin:0 0 18px;max-width:70ch}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:12px}
  figure{margin:0;background:#fff;border:1px solid #d8dade;border-radius:10px;overflow:hidden}
  .art{height:90px;display:grid;place-items:center;padding:9px;background:#fff}
  .art img{max-width:164px;max-height:72px;object-fit:contain}
  figcaption{padding:7px 9px;border-top:1px solid #eceef2;display:grid;gap:1px}
  figcaption b{font-size:11.5px;font-weight:600}
  figcaption span{font-size:10px;color:#8a8f98;word-break:break-all}
  .hdr{color:#b45309}
</style>
<h1>%d logos, drawn on the white card the site uses</h1>
<p class="note">Amber means the logo came from the header of the firm's own site, which is the
source that needs an eye: look for award seals, bar-association badges and marketing-agency
logos. Anything that reads as an empty box here will read as an empty box on the site.</p>
<div class="grid">%s</div>
"""


def records(only_new: bool):
    published = {}
    for path in glob.glob(str(ROOT / "src/data/firms/*/*.json")):
        firm = json.loads(io.open(path, encoding="utf-8").read())
        domain = firm.get("domain") or (firm.get("digital") or {}).get("domain")
        if domain:
            published[domain] = (firm.get("logo") or {}).get("file")

    out = []
    for path in sorted(glob.glob(str(ROOT / ".crawl/*.json"))):
        try:
            rec = json.loads(io.open(path, encoding="utf-8").read())
        except ValueError:
            continue
        # The staging directory holds candidate lists too, and a list has no .get().
        if not isinstance(rec, dict):
            continue
        logo = rec.get("logo") or {}
        domain = rec.get("domain") or pathlib.Path(path).stem
        if not logo.get("file"):
            continue
        if only_new and published.get(domain) == logo["file"]:
            continue
        out.append((domain, logo))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--new", action="store_true",
                    help="only logos a published profile does not already carry")
    args = ap.parse_args()

    rows = records(args.new)
    if not rows:
        print("nothing to review.")
        return 0

    cells = []
    for domain, logo in rows:
        src = (ROOT / "public" / logo["file"].lstrip("/"))
        if not src.exists():
            continue
        from_header = "header" in (logo.get("source") or "")
        cells.append(
            '<figure><div class="art"><img src="%s" alt=""></div><figcaption>'
            '<b%s>%s</b><span>%s</span></figcaption></figure>'
            % (src.as_uri(), ' class="hdr"' if from_header else "", domain,
               (logo.get("source_url") or "").split("/")[-1][:46]))

    OUT.write_text(PAGE % (len(cells), "\n".join(cells)), encoding="utf-8")
    headers = sum(1 for _, l in rows if "header" in (l.get("source") or ""))
    print("%d logo(s), %d of them read from a site header." % (len(cells), headers))
    print("open %s and look before promoting." % OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
