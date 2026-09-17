#!/usr/bin/env python3
"""Who on a firm's roster the firm itself presents as a lawyer.

One definition, imported wherever a roster is counted, because three places were about to hold
three copies of it and a firm's score depends on them agreeing:

  scripts/score.py             A6 is the share of the roster matched to the state register
  scripts/check_ny_registry.py G1 and G2 are statements about "the attorneys a firm names"
  src/lib/roster.ts            the profile page decides who it may call an attorney

The list is deliberately the same as the one in roster.ts. A Queens firm names thirty-nine
people and prints a role beside every one: four practise law and the rest are case managers,
intake specialists, paralegals and receptionists. Counting those thirty-five as unverified
attorneys would have published "4 of 39 named attorneys matched to the New York register" about
a firm that never called them attorneys, and charged it eight points for our own misreading.
"""
from __future__ import annotations

import re

SUPPORT_ROLE = re.compile(
    r"\b(paralegal|legal assistant|assistant|case manager|case worker|intake|receptionist|"
    r"office manager|administrator|admin|clerk|investigator|nurse|marketing|operations|"
    r"operating officer|financial officer|technology officer|"
    r"bookkeeper|accountant|translator|interpreter|coordinator|specialist|analyst)\b", re.I)


def is_support_role(person: dict) -> bool:
    """Did the firm itself say this person is not a lawyer?

    Only where the firm stated a role. "not stated by the firm" is the crawler's record that it
    printed none, and an absence is not a statement about anybody's job.

    The stated role decides it ahead of any registration, which is the order roster.ts uses: a
    legal assistant who shares a name with a registered attorney is a collision in the register
    rather than a lawyer.
    """
    role = person.get("role") or ""
    if not role or person.get("role_source") == "not stated by the firm":
        return False
    return bool(SUPPORT_ROLE.search(role))
