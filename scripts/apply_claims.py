#!/usr/bin/env python3
"""
Writes approved panel submissions into the firm files.

The panel stores what a firm sends and an email approves it, and both of those happen at the edge
where the firm files do not exist. This is the other half: it reads the approved items out of KV,
applies each one to src/data/firms, and marks it applied so it is never applied twice.

Four kinds, and they are not treated alike.

  profile   The detail corrections. Applied as sent, because each one is a thing the firm
            publishes about itself and is the authority on.

  logo      Written into public/logos/ and recorded on the profile. The bytes came through the
            panel as base64 rather than through an object store, because a logo is tens of
            kilobytes.

  review    Appended to reviews.quotes, which is what the profile quotes. The rating and the
            count are not touched: those are measured from verified Google listings and no firm
            edits them.

  result    Appended to results with verified set to FALSE, always. A docket number is what makes
            a result checkable, not what makes it checked, and this script does not open a court
            record. Marking one verified stays a human act, which is the whole reason this
            directory's results mean anything.

Usage:
    python scripts/apply_claims.py --dry-run      # print what would change, write nothing
    python scripts/apply_claims.py
    python scripts/apply_claims.py --local        # the wrangler dev store rather than the real one
"""
from __future__ import annotations

import argparse
import base64
import glob
import io
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIRMS = ROOT / "src" / "data" / "firms"
LOGOS = ROOT / "public" / "logos"

EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg"}

# What a panel submission is allowed to write. Anything outside this cannot be reached from the
# panel and must not be reachable from here either, whatever a stored record happens to contain.
PROFILE_FIELDS = {"phone", "languages", "fee_model", "free_consultation", "availability", "offices"}


def wrangler(args: list[str], local: bool) -> str:
    cmd = ["npx", "wrangler", "kv"] + args + ["--binding", "PANEL",
                                              "--local" if local else "--remote"]
    out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                         shell=sys.platform == "win32")
    if out.returncode != 0:
        print(out.stderr.strip()[:600], file=sys.stderr)
        raise SystemExit(f"wrangler fallo: {' '.join(args[:3])}")
    return out.stdout


def pending_keys(local: bool) -> list[str]:
    raw = wrangler(["key", "list", "--prefix", "pending:"], local)
    # wrangler prints the JSON array after whatever banner it feels like printing.
    start = raw.find("[")
    if start < 0:
        return []
    try:
        return [k["name"] for k in json.loads(raw[start:])]
    except (ValueError, KeyError, TypeError):
        return []


def read_key(name: str, local: bool) -> dict | None:
    raw = wrangler(["key", "get", name], local)
    start = raw.find("{")
    if start < 0:
        return None
    try:
        return json.loads(raw[start:])
    except ValueError:
        return None


def firm_path(slug: str) -> pathlib.Path | None:
    for p in glob.glob(str(FIRMS / "**" / "*.json"), recursive=True):
        path = pathlib.Path(p)
        if json.loads(path.read_text(encoding="utf-8")).get("slug") == slug:
            return path
    return None


def write(path: pathlib.Path, firm: dict) -> None:
    io.open(path, "w", encoding="utf-8", newline="\n").write(
        json.dumps(firm, indent=2, ensure_ascii=False) + "\n")


def apply_profile(firm: dict, item: dict) -> list[str]:
    done = []
    for change in item.get("changes") or []:
        field = change.get("field")
        if field not in PROFILE_FIELDS:
            done.append(f"omitido {field}: no es un campo que el panel pueda escribir")
            continue
        if field == "offices":
            # Only the address moves. A firm cannot add or remove an office here, because which
            # offices exist is settled against verified Google listings rather than typed.
            for i, office in enumerate(change.get("to") or []):
                if i < len(firm.get("offices") or []):
                    before = firm["offices"][i].get("address")
                    if before != office.get("address"):
                        firm["offices"][i]["address"] = office.get("address")
                        done.append(f"office {i + 1}: {before} -> {office.get('address')}")
            continue
        before = firm.get(field)
        firm[field] = change.get("to")
        done.append(f"{field}: {json.dumps(before, ensure_ascii=False)} -> "
                    f"{json.dumps(change.get('to'), ensure_ascii=False)}")
    return done


def apply_logo(firm: dict, item: dict) -> list[str]:
    ext = EXT.get(item.get("mime") or "")
    if not ext:
        return [f"omitido: tipo {item.get('mime')} no soportado"]
    data = base64.b64decode(item.get("data") or "")
    if not data:
        return ["omitido: el registro no trae bytes"]
    LOGOS.mkdir(parents=True, exist_ok=True)
    name = f"{firm['domain']}.{ext}"
    (LOGOS / name).write_bytes(data)
    # Any older file for this domain in another format would otherwise sit there unreferenced.
    for other in LOGOS.glob(f"{firm['domain']}.*"):
        if other.name != name:
            other.unlink()
    firm["logo"] = {
        "file": name,
        "source_url": firm.get("website", ""),
        "bytes": len(data),
        "source": "Supplied by the firm through the panel and approved by us",
        "fetched_at": item.get("approved_at", "")[:10] or item.get("submitted_at", "")[:10],
    }
    return [f"logo: {name}, {len(data)} bytes"]


def apply_review(firm: dict, item: dict) -> list[str]:
    quotes = firm.setdefault("reviews", {}).setdefault("quotes", [])
    text = (item.get("review_text") or "").strip()
    if any(q.get("text") == text for q in quotes):
        return ["omitida: esa resena ya esta en el perfil"]
    quotes.append({
        "text": text,
        "author": (item.get("review_author") or "").strip(),
        "source": (item.get("review_source") or "").strip(),
    })
    return [f"resena de {item.get('review_author')}"]


def apply_result(firm: dict, item: dict) -> list[str]:
    results = firm.setdefault("results", [])
    docket = (item.get("result_docket") or "").strip()
    if any((r.get("docket") or "") == docket and docket for r in results):
        return ["omitido: ese expediente ya esta en el perfil"]
    results.append({
        "type": (item.get("result_type") or "").strip(),
        "title": (item.get("result_title") or "").strip(),
        "description": (item.get("result_description") or "").strip(),
        "amount": (item.get("result_amount") or "").strip() or None,
        # Never true from here. The docket makes it checkable; somebody still has to check it.
        "verified": False,
        "docket": docket,
    })
    return [f"resultado {item.get('result_title')} (verified=false, falta leer el expediente)"]


APPLY = {"profile": apply_profile, "logo": apply_logo,
         "review": apply_review, "result": apply_result}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--local", action="store_true")
    args = ap.parse_args()

    keys = pending_keys(args.local)
    if not keys:
        print("no hay items en KV.")
        return 0

    touched: set[pathlib.Path] = set()
    applied = skipped = 0
    needs_rescore = False

    for key in keys:
        item = read_key(key, args.local)
        if not item:
            print(f"  {key}: no se pudo leer")
            continue
        if item.get("status") != "approved":
            skipped += 1
            continue
        if item.get("applied_at"):
            continue

        path = firm_path(item.get("slug", ""))
        if not path:
            print(f"  {key}: no hay firma publicada con slug {item.get('slug')}")
            continue
        firm = json.loads(path.read_text(encoding="utf-8"))
        handler = APPLY.get(item.get("kind") or "")
        if not handler:
            print(f"  {key}: tipo desconocido {item.get('kind')}")
            continue

        lines = handler(firm, item)
        print(f"\n{item.get('name')} · {item.get('kind')} · {item.get('submitted_at', '')[:10]}")
        for line in lines:
            print(f"    {line}")

        if args.dry_run:
            applied += 1
            continue

        write(path, firm)
        touched.add(path)
        item["applied_at"] = __import__("datetime").datetime.utcnow().isoformat() + "Z"
        tmp = ROOT / ".crawl" / "claim-applied.json"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps(item, ensure_ascii=False), encoding="utf-8")
        wrangler(["key", "put", key, "--path", str(tmp)], args.local)
        tmp.unlink(missing_ok=True)
        applied += 1
        if item.get("kind") == "profile":
            needs_rescore = True

    verb = "se aplicarian" if args.dry_run else "aplicados"
    print(f"\n{applied} {verb} · {skipped} todavia sin aprobar · {len(touched)} ficha(s) tocada(s)")
    if applied and not args.dry_run:
        print("\nFalta para que llegue al sitio:")
        if needs_rescore:
            print("  python scripts/score.py      # los honorarios y la consulta alimentan el pilar E")
        print("  npm run build")
        print("  git add -A && git commit")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
