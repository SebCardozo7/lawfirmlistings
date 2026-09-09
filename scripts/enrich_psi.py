#!/usr/bin/env python3
"""
PageSpeed Insights enrichment — pillar D1, the largest sub-factor in pillar D (7 points).

Measures Core Web Vitals for each domain and writes the result into the staging record under
.crawl/<domain>.json as a `psi` block shaped for the firm schema's `digital.psi`:

    "psi": {
      "value": {"performance": 42, "cwv_pass": false},
      "source": "PageSpeed Insights API (mobile, lab)",
      "measured_at": "2026-09-08",
      "note": "LCP 4.1 s / CLS 0.02 / TBT 310 ms"
    }

cwv_pass follows Google's own thresholds for the three Core Web Vitals: LCP <= 2.5 s,
CLS <= 0.1, INP (approximated in lab by TBT <= 200 ms). Lab data is what the API returns for
sites without enough field traffic, so the note records which one was used — a lab pass is
weaker evidence than field data and a reviewer should be able to tell them apart.

Needs GOOGLE_API_KEY in .env. The API is free and needs no billing account, unlike Places.

Usage:
    python scripts/enrich_psi.py                      # every domain in .crawl/
    python scripts/enrich_psi.py --domains a.com,b.com
"""
import argparse
import datetime
import glob
import io
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
# Google's Core Web Vitals thresholds. TBT stands in for INP in lab data.
LCP_MS, CLS_MAX, TBT_MS = 2500, 0.1, 200


def api_key():
    env = ROOT / ".env"
    if env.exists():
        with io.open(env, encoding="utf-8-sig") as fh:
            for line in fh:
                m = re.match(r"^GOOGLE_API_KEY=(\S+)", line.strip())
                if m:
                    return m.group(1)
    return os.environ.get("GOOGLE_API_KEY")


def write_key(path, key, value):
    """Re-read, set one key, write back.

    The enrichers each own one key in the staging record but share the file. Holding a copy
    from the start of a long run and writing it back at the end silently discards whatever
    another enricher wrote in between — which is how napolilaw.com lost its `places` block when
    this script and enrich_places.py were run concurrently. Re-reading immediately before the
    write keeps them safe to run in parallel.
    """
    with io.open(path, encoding="utf-8") as fh:
        fresh = json.load(fh)
    fresh[key] = value
    with io.open(path, "w", encoding="utf-8") as fh:
        json.dump(fresh, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def measure(url, key, strategy="mobile"):
    qs = urllib.parse.urlencode({
        "url": url, "key": key, "strategy": strategy,
        "category": "performance",
    })
    with urllib.request.urlopen(ENDPOINT + "?" + qs, timeout=120) as r:
        data = json.load(r)

    lh = data["lighthouseResult"]
    audits = lh["audits"]

    def numeric(audit):
        a = audits.get(audit) or {}
        return a.get("numericValue")

    lcp, cls, tbt = numeric("largest-contentful-paint"), numeric("cumulative-layout-shift"), numeric("total-blocking-time")
    have_all = None not in (lcp, cls, tbt)
    cwv_pass = bool(have_all and lcp <= LCP_MS and cls <= CLS_MAX and tbt <= TBT_MS)

    # Field data when the origin has enough real-user traffic; otherwise this is lab only.
    source_kind = "field + lab" if data.get("loadingExperience", {}).get("metrics") else "lab only"

    note_bits = []
    if lcp is not None:
        note_bits.append("LCP %.1f s" % (lcp / 1000))
    if cls is not None:
        note_bits.append("CLS %.3f" % cls)
    if tbt is not None:
        note_bits.append("TBT %d ms" % round(tbt))
    if not have_all:
        note_bits.append("some metrics unavailable, so cwv_pass is false rather than assumed")

    return {
        "value": {
            "performance": round(lh["categories"]["performance"]["score"] * 100),
            "cwv_pass": cwv_pass,
        },
        "source": "PageSpeed Insights API (%s, %s)" % (strategy, source_kind),
        "measured_at": datetime.date.today().isoformat(),
        "note": " / ".join(note_bits),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains", help="comma-separated; default is every file in .crawl/")
    ap.add_argument("--staging", default=".crawl")
    ap.add_argument("--strategy", default="mobile", choices=["mobile", "desktop"])
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            # line_buffering matters here: a run over a dozen domains takes minutes, and Python
            # otherwise buffers stdout when it is not a terminal, so progress appears only at
            # the end — which looks like a hang.
            stream.reconfigure(encoding="utf-8", line_buffering=True)

    key = api_key()
    if not key:
        print("GOOGLE_API_KEY not found in .env or the environment.", file=sys.stderr)
        return 1

    staging = ROOT / args.staging
    if args.domains:
        files = [staging / (d.strip() + ".json") for d in args.domains.split(",") if d.strip()]
    else:
        files = sorted(pathlib.Path(p) for p in glob.glob(str(staging / "*.json")))

    measured = failed = skipped = 0
    for path in files:
        if not path.exists():
            print("%-24s no staging record" % path.stem)
            continue
        with io.open(path, encoding="utf-8") as fh:
            rec = json.load(fh)

        target = rec.get("pages_found", {}).get("home")
        if not target:
            print("%-24s skipped — home page was never reachable" % rec["domain"])
            skipped += 1
            continue

        try:
            psi = measure(target, key, args.strategy)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            try:
                msg = json.loads(body)["error"].get("message", "")[:120]
            except Exception:
                msg = body[:120]
            print("%-24s FAILED HTTP %s  %s" % (rec["domain"], e.code, msg))
            failed += 1
            continue
        except Exception as e:
            # Lighthouse gives up on slow sites; that is the site's result, not ours to invent.
            print("%-24s FAILED  %s" % (rec["domain"], str(e)[:90]))
            failed += 1
            continue

        write_key(path, "psi", psi)
        print("%-24s perf %3d/100  cwv_pass %-5s  %s"
              % (rec["domain"], psi["value"]["performance"], psi["value"]["cwv_pass"], psi["note"]))
        measured += 1

    print("\n%d measured · %d failed · %d skipped" % (measured, failed, skipped))
    if failed:
        print("Failures are usually Lighthouse timing out on a slow site. Re-run those domains;\n"
              "a site we cannot measure keeps D1 pending rather than getting a guessed score.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
