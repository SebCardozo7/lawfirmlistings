"""
Two factual sentences about a firm, assembled from fields rather than written.

`about[]` is the only editorial field the schema requires, and build_profiles.py left it empty
for a person to fill. That was the next bottleneck after the methodology: publishing twenty-five
firms meant writing twenty-five paragraphs, the same kind of manual step we had just removed from
the scoring.

Reading the ones already written by hand settles whether a machine can do it. Every line turns
out to be an assembly of facts we already hold:

    "The Perecman Firm is a New York City personal injury practice with offices in Manhattan and
     Corona, Queens."
    "Shulman & Hill is a New York personal injury firm operating from an office in Manhattan."

Name, practice, where it works from, then what the firm says about cost and access. No adjective
that is not in a field.

Two rules the wording keeps, and they are why this is publishable rather than filler:

    Nothing is claimed that no field carries. There is no "highly experienced" or "dedicated"
    here, because no column holds that.

    Anything the firm asserts about itself is attributed to the firm rather than stated flatly. A
    fee model read off their page becomes "the firm states that it works on a contingency fee",
    and a missing one becomes "it does not state a fee model on its public pages" rather than
    being quietly dropped. An absence is information, and on this directory it is often the most
    useful thing on the page.

The locality comes from the office's postal address, not its label. Labels are whatever a firm
typed into Google: two of the first three read back as the firm's own name, and one as "Shulman &
Hill - Manhattan Personal Injury Lawyer", which would have produced "a single office in Shulman &
Hill - Manhattan Personal Injury Lawyer". An address is structured and says "New York" or
"Corona" or "Garden City".
"""
from __future__ import annotations

import re

NOT_STATED = ("", "not stated", "unknown", "n/a", "na", "pending")

# The field before the state-and-ZIP one, in "250 W 57th St #401, New York, NY 10107, USA".
STATE_ZIP = re.compile(r"^[A-Z]{2}\s+\d{5}(?:-\d{4})?$")


def locality(address: str) -> str | None:
    parts = [p.strip() for p in (address or "").split(",") if p.strip()]
    for i, part in enumerate(parts):
        if STATE_ZIP.match(part) and i > 0:
            return parts[i - 1]
    # No recognisable state and ZIP: the second field is the town in almost every US format.
    return parts[1] if len(parts) > 2 else None


STATE_NAMES = {
    "NY": "New York", "MD": "Maryland", "DC": "Washington DC", "VA": "Virginia",
    "NJ": "New Jersey", "PA": "Pennsylvania", "CT": "Connecticut", "DE": "Delaware",
    "MA": "Massachusetts", "FL": "Florida", "CA": "California", "TX": "Texas",
    "IL": "Illinois", "GA": "Georgia", "AZ": "Arizona", "WA": "Washington",
}


def state_of(address: str) -> str | None:
    for part in [p.strip() for p in (address or "").split(",")]:
        if STATE_ZIP.match(part):
            return part.split()[0]
    return None


def _localities(offices: list[dict]) -> list[str]:
    out: list[str] = []
    for office in offices:
        place = locality(office.get("address") or "")
        if place and place not in out:
            out.append(place)
    return out


def _footprint(market: dict, offices: list[dict]) -> str:
    """Where the firm works from, without putting its offices in the wrong place.

    A firm is listed in one market and may work well beyond it. Malloy Law is listed in
    Baltimore, which is one of its eight offices, and the first draft of this described it as
    having "8 offices across the Baltimore area, among them Bethesda, Baltimore, Washington".
    Bethesda and Washington are not the Baltimore area. So where the offices span more than one
    state the footprint is described by state, which is true at any scale, and only a firm whose
    offices sit in one state is described by town.
    """
    places = _localities(offices)
    n = len(offices)
    states = []
    for office in offices:
        code = state_of(office.get("address") or "")
        name = STATE_NAMES.get(code, code)
        if name and name not in states:
            states.append(name)

    if not n:
        return f"in {market['city']}"
    if n == 1:
        return f"with a single office in {places[0] if places else market['city']}"

    if len(states) > 1:
        listed = ", ".join(states[:-1]) + f" and {states[-1]}"
        return f"with {n} offices across {listed}"
    if len(places) >= 2 and len(places) <= 3:
        listed = ", ".join(places[:-1]) + f" and {places[-1]}"
        return f"with offices in {listed}"
    if len(places) > 3:
        return (f"with {n} offices across {states[0] if states else market['city']}, "
                f"among them {', '.join(places[:3])}")
    return f"with {n} offices across {states[0] if states else market['city']}"


def describe(name: str, market: dict, offices: list[dict], practices: list[dict],
             languages: list[str], fee_model: str | None, claims: dict,
             availability: list[str]) -> list[str]:
    primary = next((p["name"] for p in practices if p.get("primary")), None)
    if not primary:
        primary = practices[0]["name"] if practices else "law"

    first = f"{name} is a {primary.lower()} firm {_footprint(market, offices)}."

    # Everything below is attributed, because all of it is the firm talking about itself.
    said = " ".join(availability).lower()
    says: list[str] = []
    if "contingency" in (fee_model or "").lower():
        says.append("it works on a contingency fee, with nothing to pay unless the case is won")
    if claims.get("free_consultation"):
        says.append("the first consultation is free")
    if "24/7" in said or re.search(r"24[- ]hour", said):
        says.append("its intake line is open around the clock")
    if "hospital" in said or "home visit" in said:
        says.append("it will visit clients in hospital or at home")

    if says:
        second = "The firm states that " + "; ".join(says) + "."
    else:
        second = "The firm publishes little about cost or availability on the pages we read."

    tail: list[str] = []
    if [l for l in languages if l.lower() != "english"]:
        tail.append("It publishes service in " + " and ".join(languages) + ".")
    if (fee_model or "").strip().lower() in NOT_STATED:
        tail.append("It does not state a fee model on its public pages, so none is recorded here.")

    return [first, " ".join([second] + tail)]
