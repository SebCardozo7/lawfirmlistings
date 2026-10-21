"""One firm's failure is a fact about that firm, not the end of the run.

Every step in this pipeline walks a few hundred firms and does something to each. Until now
the body of those loops was unguarded, so the first record that did something unexpected ended
the run where it stood, and everything after it in the list was simply not done.

That is not a hypothetical. check_ca_register died at firm 153 of 252 on an attorney whose
record had a served sanction and nothing else, and the 99 firms behind Morgan & Morgan in the
alphabet got no register check at all. crawl_attorneys died on Los Angeles because the staging
directory also holds discover_places candidate lists and a list has no .get(), and that market
got no rosters on its first pass. Both were fixed with an `if` for the one shape that had
broken, which is the fix that works until the next market finds the next shape.

The cost of that pattern is not the bug. It is that opening a market turns into debugging the
pipeline against a new set of websites, one stop at a time, and each stop hides whatever else
was wrong further down the list.

So:

    run = Survive("crawl_attorneys")
    for path in files:
        with run.firm(path.stem):
            ...                      # whatever this step does to one firm
    return run.report()

What it deliberately does not do is swallow the failures quietly. A run that skipped twelve
firms and said nothing would be worse than one that stopped, because the twelve would look
measured. report() names every one of them with its error and returns a non-zero exit code, so
a script that limps still limps loudly.

KeyboardInterrupt and SystemExit pass straight through. Stopping a long run by hand has to keep
working, and a step that calls sys.exit means it.
"""
from __future__ import annotations

import sys
import traceback


class Survive:
    def __init__(self, label: str, verbose: bool = False):
        self.label = label
        self.verbose = verbose
        self.failures: list[tuple[str, str, str]] = []
        self.done = 0

    def firm(self, name: str) -> "_Firm":
        return _Firm(self, name)

    def report(self, stream=None) -> int:
        """Print what could not be done, and return an exit code that says so."""
        out = stream or sys.stderr
        if not self.failures:
            return 0
        print("", file=out)
        print("%d of %d firm(s) could not be processed by %s:"
              % (len(self.failures), self.done + len(self.failures), self.label), file=out)
        for name, kind, message in self.failures:
            print("  %-34s %s: %s" % (name[:34], kind, message[:96]), file=out)
        print("", file=out)
        print("Every other firm was done. Re-run this step for the ones above once the reason "
              "is understood; nothing was written for them.", file=out)
        return 1


class _Firm:
    def __init__(self, run: Survive, name: str):
        self.run = run
        self.name = name

    def __enter__(self):
        return self

    def __exit__(self, kind, value, tb) -> bool:
        if kind is None:
            self.run.done += 1
            return False
        if issubclass(kind, (KeyboardInterrupt, SystemExit)):
            return False
        self.run.failures.append((self.name, kind.__name__, str(value)))
        if self.run.verbose:
            traceback.print_exception(kind, value, tb)
        return True
