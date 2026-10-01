"""
Writes the About block of a published profile from the measured record.

`lib_describe.describe()` runs at draft time, before the firm has been crawled for attorneys,
scored, or compared with anyone. It holds six fields and it shows: 976 of the 1,167 published
profiles open with the same sentence shape.

    "Ozols Law Firm is a personal injury firm with offices in San Diego and El Cajon."
    "Kelly Law Team is a personal injury firm with offices in Phoenix and Mesa."

The other 191 were written against the finished record instead, and they read like this:

    "Sweeney Merrigan works from Summer Street in Fort Point and names 18 people."
    "The Case Handler works from Broadway opposite City Hall and is one of the few firms in this
     ranking that says who does what."
    "Jeffrey B. Peltz works from Broadway and practises divorce alongside bankruptcy, immigration
     and real estate, which its own title says."

Nothing in those is an adjective. They are the same kind of fact the template uses, picked
instead of listed, and placed against the market: the longest list of results here, the largest
roster in this ranking, the slowest page in the directory. That comparison is the part a template
cannot do and the part a reader actually wants, and the scoring pipeline already computes it for
every firm in every cohort.

So this module takes the finished profile and the cohort it was scored against, and writes the
same two paragraphs from the full record. The rules the hand-written ones keep are kept here:

    No adjective that is not in a field. There is no "experienced" or "trusted" because no column
    holds one.

    Anything the firm asserts about itself is attributed to the firm. A recovery total on its own
    page is "the firm's figure and not one this directory has confirmed".

    An absence is reported, not dropped. "It names no attorney on the pages we could reach" is
    often the most useful sentence on the profile.

    A superlative is only written when it was computed. "The longest such list in this market" is
    a rank in a cohort, and a cohort too small to rank gets no superlative at all.
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Street addresses
#
# The hand-written profiles name the street and drop everything else: "Summer Street in Fort
# Point", "Fifth Avenue South", "Airport-Pulling Road North". A Google address is
# "1240 Key Hwy Suite 102", so the house number goes, the unit goes, and the abbreviation is
# spelled out, because "works from Key Hwy" reads like a database and "works from Key Highway"
# reads like a sentence.
# ---------------------------------------------------------------------------

STREET_TYPES = {
    "st": "Street", "str": "Street", "ave": "Avenue", "av": "Avenue", "rd": "Road",
    "blvd": "Boulevard", "dr": "Drive", "ln": "Lane", "ct": "Court", "cir": "Circle",
    "pkwy": "Parkway", "pky": "Parkway", "hwy": "Highway", "fwy": "Freeway", "expy": "Expressway",
    "pl": "Place", "sq": "Square", "ter": "Terrace", "trl": "Trail", "wy": "Way",
    "plz": "Plaza", "tpke": "Turnpike", "bnd": "Bend", "xing": "Crossing", "run": "Run",
}

DIRECTIONS = {
    "n": "North", "s": "South", "e": "East", "w": "West", "ne": "Northeast",
    "nw": "Northwest", "se": "Southeast", "sw": "Southwest",
}

ORDINALS = {
    "1st": "First", "2nd": "Second", "3rd": "Third", "4th": "Fourth", "5th": "Fifth",
    "6th": "Sixth", "7th": "Seventh", "8th": "Eighth", "9th": "Ninth", "10th": "Tenth",
    "11th": "Eleventh", "12th": "Twelfth",
}

# "Suite 102", "Ste 400", "Unit 240", "Fl 3", "#2200", "a1" at the end of the line.
UNIT = re.compile(
    r"\s+(?:suite|ste\.?|unit|apt\.?|fl\.?|floor|rm\.?|room|bldg\.?|building|#)\s*[-\w]*$"
    r"|\s+#\S+$"
    r"|\s+[a-z]\d{1,4}$",
    re.I,
)

# "1240 ", "148-55 ", "2655 ". A leading number is the house, never the street name.
HOUSE = re.compile(r"^\d+[-\d]*\s+")

# The word a US street name ends on. Anything after it is a suite, a floor or a typo for one.
TERMINATORS = set(STREET_TYPES.values()) | {"Broadway", "Plaza", "Promenade", "Boardwalk"}


def street(address: str) -> str | None:
    """"1240 Key Hwy Suite 102" becomes "Key Highway"."""
    line = (address or "").split(",")[0].strip().rstrip(".")
    if not line:
        return None
    line = HOUSE.sub("", line)
    previous = None
    while previous != line:
        previous = line
        line = UNIT.sub("", line).strip()
    if not line:
        return None

    words = line.split()
    out: list[str] = []
    for i, word in enumerate(words):
        bare = word.lower().strip(".")
        if bare in ORDINALS:
            out.append(ORDINALS[bare])
        elif bare in STREET_TYPES:
            out.append(STREET_TYPES[bare])
        elif bare in DIRECTIONS and (i == 0 or i == len(words) - 1):
            out.append(DIRECTIONS[bare])
        else:
            out.append(word)
    # Whatever follows the street type is a suite by another name. "N Central Ave 2600 26th floor"
    # loses "floor" to the unit rule above and keeps "2600 26th", and "7th St Spc 212-B" keeps a
    # Spc nobody spells Suite. Cutting at the street type ends all of them at once, except for a
    # direction, which belongs to the street: Peachtree Road Northeast, Fifth Avenue South.
    endings = [i for i, word in enumerate(out) if word in TERMINATORS]
    if endings:
        last = endings[-1]
        if last + 1 < len(out) and out[last + 1] in DIRECTIONS.values():
            last += 1
        out = out[: last + 1]

    name = " ".join(out)
    # A street that is only a direction and a number carries nothing a reader can picture.
    return name if len(name) > 3 and not name.isdigit() else None


# ---------------------------------------------------------------------------
# Counting and joining, in the voice the hand-written profiles used
# ---------------------------------------------------------------------------

WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven",
         8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve"}


def count(n: int) -> str:
    return WORDS.get(n, f"{n:,}")


def join(items: list[str]) -> str:
    items = [i for i in items if i]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


STATE_NAMES = {
    "NY": "New York", "MD": "Maryland", "DC": "Washington DC", "VA": "Virginia",
    "NJ": "New Jersey", "PA": "Pennsylvania", "CT": "Connecticut", "DE": "Delaware",
    "MA": "Massachusetts", "FL": "Florida", "CA": "California", "TX": "Texas",
    "IL": "Illinois", "GA": "Georgia", "AZ": "Arizona", "WA": "Washington",
    "NV": "Nevada", "OR": "Oregon", "IN": "Indiana", "OH": "Ohio", "NC": "North Carolina",
    "CO": "Colorado", "MI": "Michigan", "TN": "Tennessee", "MO": "Missouri", "WI": "Wisconsin",
    "MN": "Minnesota", "SC": "South Carolina", "AL": "Alabama", "LA": "Louisiana",
    "KY": "Kentucky", "OK": "Oklahoma", "CT_": "Connecticut", "UT": "Utah", "IA": "Iowa",
    "AR": "Arkansas", "MS": "Mississippi", "KS": "Kansas", "NM": "New Mexico", "NE": "Nebraska",
    "WV": "West Virginia", "ID": "Idaho", "HI": "Hawaii", "ME": "Maine", "NH": "New Hampshire",
    "RI": "Rhode Island", "MT": "Montana", "SD": "South Dakota", "ND": "North Dakota",
    "AK": "Alaska", "VT": "Vermont", "WY": "Wyoming",
}

STATE_ZIP = re.compile(r"^[A-Z]{2}\s+\d{5}(?:-\d{4})?$")


def locality(address: str) -> str | None:
    parts = [p.strip() for p in (address or "").split(",") if p.strip()]
    for i, part in enumerate(parts):
        if STATE_ZIP.match(part) and i > 0:
            return parts[i - 1]
    return parts[1] if len(parts) > 2 else None


def state_of(address: str) -> str | None:
    for part in [p.strip() for p in (address or "").split(",")]:
        if STATE_ZIP.match(part):
            return part.split()[0]
    return None
