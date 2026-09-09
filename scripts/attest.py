#!/usr/bin/env python3
"""
Record a firm's written attestation for an eligibility gate.

Why this exists. Six gates have to clear before a firm can be certified, and several of them
depend on sources we cannot yet query at scale — a disciplinary history covering ten years, a
Secretary of State filing, a malpractice policy. A firm that co-operates can simply tell us, in
writing, and for a directory that is an ordinary tier of evidence. Without this, the only firms
that could ever certify would be the ones whose evidence happens to be machine-readable, which
penalises exactly the small practices that answer the phone when we call.

What it is not. An attestation is not a measurement, and it is never presented as one. It is
written into the gate as `attested: true` with the name of the person who gave it and the date,
the scorecard on the firm's public profile labels that gate **Firm-attested** in a different
colour from a measured one, and the methodology page says the mechanism exists. A reader can
always see which gates we checked and which the firm asserted. That distinction is the whole
reason this is defensible rather than a favour, and it is the reason the label is not optional.

The registry checker leaves attested gates alone, so a later run cannot silently overwrite one.

Usage:
    python scripts/attest.py --firm greenstein-pittari-llp --gate G1 \\
        --by "Robert J. Greenstein, Founding Partner" \\
        --evidence "All nine named attorneys hold active NY registrations; \\
                    registration numbers supplied for the eight we matched."

    python scripts/attest.py --firm X --gate G2 --revoke
    python scripts/attest.py --list
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
FIRMS = ROOT / "src" / "data" / "firms"
GATES = {
    "G1": "Active licensure",
    "G2": "Clean public discipline",
    "G3": "Verified entity & office",
    "G4": "No consumer-protection actions",
    "G5": "Honest website baseline",
    "G6": "Minimum footprint",
}


def find(slug: str) -> Path:
    for path in FIRMS.rglob("*.json"):
        if path.stem == slug:
            return path
    print(f"no firm with slug {slug}", file=sys.stderr)
    raise SystemExit(2)


def show_all() -> int:
    rows = []
    for path in sorted(FIRMS.rglob("*.json")):
        firm = json.loads(path.read_text(encoding="utf-8"))
        if firm.get("status") == "sample":
            continue
        for code, gate in sorted((firm.get("gates") or {}).items()):
            if gate.get("attested"):
                rows.append((firm["slug"], code, gate.get("attested_by", "?"),
                             gate.get("checked_at", "?"), gate.get("evidence", "")))
    if not rows:
        print("No attested gates.")
        return 0
    print(f"{len(rows)} attested gate(s):\n")
    for slug, code, by, when, ev in rows:
        print(f"  {slug}  {code} {GATES.get(code, '')}")
        print(f"    attested by {by} on {when}")
        print(f"    {ev}\n")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--firm")
    ap.add_argument("--gate", choices=sorted(GATES))
    ap.add_argument("--by", help="who at the firm gave the attestation, name and role")
    ap.add_argument("--evidence", help="what they attested, in a sentence a reader can weigh")
    ap.add_argument("--revoke", action="store_true", help="remove an attestation")
    ap.add_argument("--list", action="store_true", help="show every attested gate")
    args = ap.parse_args()

    if args.list:
        return show_all()
    if not (args.firm and args.gate):
        ap.error("--firm and --gate are required")

    path = find(args.firm)
    firm = json.loads(path.read_text(encoding="utf-8"))
    gates = firm.setdefault("gates", {})
    today = date.today().isoformat()

    if args.revoke:
        gate = gates.get(args.gate)
        if not gate or not gate.get("attested"):
            print(f"{args.firm} {args.gate} is not attested", file=sys.stderr)
            return 2
        gates[args.gate] = {
            "pass": False,
            "evidence": "Attestation withdrawn; awaiting our own check",
            "source": f"Attestation withdrawn {today} — pending",
            "checked_at": today,
        }
        print(f"revoked: {args.firm} {args.gate}")
    else:
        if not (args.by and args.evidence):
            ap.error("--by and --evidence are required (an unsigned attestation is worth nothing)")
        gates[args.gate] = {
            "pass": True,
            "evidence": " ".join(args.evidence.split()),
            # The source names the mechanism, so it reads honestly anywhere the string surfaces
            # even if a template forgets to check the `attested` flag.
            "source": f"Firm attestation by {args.by}, not independently verified",
            "checked_at": today,
            "attested": True,
            "attested_by": args.by,
        }
        print(f"attested: {args.firm} {args.gate} {GATES[args.gate]}")
        print(f"  by {args.by} on {today}")

    path.write_text(json.dumps(firm, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("\nRun scripts/score.py to recompute the tier.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
