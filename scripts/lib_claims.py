#!/usr/bin/env python3
"""
What a firm publishes about its fees, its languages and when it answers: pillar E, derived
from one staging record.

This lived inside build_profiles.py, which runs once, when a market is opened. The monthly
re-measurement runs promote_measurements.py instead, and that script's FIELD_PATHS never
carried `languages`, `fee_model`, `free_consultation` or `availability`. So the fifteen
points of pillar E were frozen on every published profile at whatever the firm happened to
say on the day its market opened, for all 1,388 of them, and no re-crawl could move them.

That mattered quietly until 13 November 2026, when the prospecting letter started saying
this to firms in writing:

    Publish what is missing and the next monthly read picks it up. You do not have to tell
    us and we do not have to be told.

Which was not true of pillar E, and pillar E is the only part of the score the letter
names, because it is the only part a firm can move by itself in a week.

So the derivation lives here, and both scripts call it. One copy, because two copies of a
rule that decides a public number is one copy and a future disagreement.
"""
from __future__ import annotations


def languages_of(rec: dict) -> list[str]:
    """
    The site is written in English, so the field names the language in English. A profile
    that read "English and Español" mixed the two in one sentence.
    """
    out = ["English"]
    claims = rec.get("claims") or {}
    if "se_habla_espanol" in claims or rec.get("spanish_signals"):
        out.append("Spanish")
    return out


def availability_of(rec: dict) -> list[str]:
    claims = rec.get("claims") or {}
    out = []
    if "available_24_7" in claims:
        out.append("24/7 intake line")
    if "hospital_visits" in claims:
        out.append("Hospital & home visits")
    return out


def fee_model_of(rec: dict) -> str:
    """
    A fee model is only stated if the firm states it. No defaulting to contingency.

    And contingency is not the only thing a firm can state. A transactional practice charges
    a flat fee or an hourly rate, so reading only the contingency claim reported "Not stated"
    for all twenty firms in the first real estate market, five of which say plainly that their
    engagements are priced as flat fees. scripts/check_transaction.py found those words; this
    just believes them.

    And the same again for a domestic relations practice, with a stronger reason. Rule
    1.5(d)(5)(i) forbids a contingent fee in a matrimonial matter outright, so reading only
    the contingency claim reported "Not stated" for all forty-two family law firms in the
    directory, including the four that publish a price. scripts/check_domestic.py found those.
    """
    claims = rec.get("claims") or {}
    tx = rec.get("transaction") or {}
    dm = rec.get("domestic") or {}
    if "contingency" in claims:
        return "Contingency"
    if tx.get("flat_fee"):
        return "Flat fee"
    if dm.get("hourly"):
        return "Hourly rate published"
    if dm.get("retainer_figure"):
        return "Retainer figure published"
    if dm.get("flat_fee"):
        return "Flat fee published"
    if dm.get("fee_terms"):
        return "Billing terms published, no figure"
    return "Not stated"


def free_consultation_of(rec: dict) -> bool:
    return "free_consultation" in (rec.get("claims") or {})


def pillar_e(rec: dict) -> dict:
    """
    All four, for a caller that wants to write them onto a profile.

    Only ever called with a record a crawl actually produced. A record with no `claims` key
    at all is a crawl that never got in, and promote_measurements checks that before asking:
    deriving from nothing here would return "Not stated" and no Spanish, which is a confident
    statement about a firm whose site we failed to read, and would take points off it.
    """
    return {
        "languages": languages_of(rec),
        "fee_model": fee_model_of(rec),
        "free_consultation": free_consultation_of(rec),
        "availability": availability_of(rec),
    }
