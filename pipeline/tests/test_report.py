"""The committed report cannot drift from the code that writes it.

`pipeline/summary_report.md` is the document the root `README.md` sends readers
to, and it is generated rather than hand-written -- so nothing stopped it
disagreeing with `report.py`. It did, for the worst possible field: `report.py`
moved the entry-level squeeze index from `DERIVED` to `MODELED` in `ff507b0`,
and the committed report was never regenerated, so the published findings
labelled an analyst-weighted composite as arithmetic on official statistics
(#54).

The drift had two independent causes -- a stale committed file, and two entry
points producing different documents out of one function -- so both are checked,
along with the tier rule itself.

Each check here is written to fail on the specific defect it names, and was
verified by reintroducing that defect. Two earlier drafts of the tier check did
not meet that bar: one compared the report's tier strings against `report.py`'s
source, which cannot fail because the report is generated from those strings;
the next matched only lines naming the field, and the prose carrying the
surviving half of #54 sits under a heading instead. Both were green against the
exact content they existed to reject.
"""
import context  # noqa: F401
import csv
import os
import tempfile
import unittest

import fixtures
import report


def _regenerate():
    """Write the report through the documented entry point, into a temp file.

    Uses `load_sensitivity()` exactly as `report.py`'s `__main__` does, so this
    asserts on what a contributor running `npm run report` actually gets.
    """
    fd, path = tempfile.mkstemp(suffix=".md")
    os.close(fd)
    try:
        with fixtures.quiet():
            report.write(report.load(), path,
                         sensitivity=report.load_sensitivity())
        with open(path, encoding="utf-8") as fh:
            return fh.read().splitlines()
    finally:
        os.unlink(path)


def _committed():
    with open(os.path.join(context.PIPELINE, "summary_report.md"),
              encoding="utf-8") as fh:
        return fh.read().splitlines()


def _without_date(lines):
    """Drop the one line that legitimately differs on every run.

    `report.py` stamps `Generated <date.today()>`, so a fresh run always differs
    there. That is the ONLY licensed difference: this helper removes exactly the
    lines starting with `Generated `, and any second differing line is drift.
    """
    return [ln for ln in lines if not ln.startswith("Generated ")]


class CommittedReportMatchesTheCode(unittest.TestCase):

    def test_regenerating_changes_nothing_but_the_date(self):
        """The committed file is what `report.py` produces today.

        Fails if someone edits `report.py` without regenerating, which is
        exactly how the DERIVED/MODELED drift in #54 survived from `ff507b0`.
        """
        self.assertEqual(_without_date(_committed()), _without_date(_regenerate()))

    def test_the_sensitivity_paragraph_is_present(self):
        """`npm run report` must not silently drop it.

        `report.write(..., sensitivity=None)` skips the paragraph carrying the
        median-4-places claim that `CLAUDE.md` cites as the defence of the
        exposure weights. Before #54 the `__main__` block passed nothing, so the
        documented regeneration path produced a report missing it -- a different
        document from the pipeline's, out of the same function.
        """
        text = "\n".join(_regenerate())
        self.assertIn("**AI exposure sensitivity.**", text)
        self.assertIn("moves the median country by only", text)

    def test_sensitivity_matches_the_definition_of_record(self):
        """The reconstruction has to agree with what the pipeline computes.

        Pinning the shape is not enough: a key set, a profile list, `n > 0` and
        `max >= median` all hold under a median that is subtly the wrong one --
        a true median averages the middle pair on even `n`, where
        `crosscheck.sensitivity` takes the upper-middle value unconditionally.
        `n` is the count of countries carrying `white_collar_pct`, so its parity
        flips with any ILOSTAT refresh, and the two would print different
        numbers on the next even count.

        So the values are pinned against the expression itself, re-derived here
        from the committed CSV rather than imported: `crosscheck.sensitivity()`
        needs live rows and writes the file, which a test must not do.
        """
        with open(os.path.join(context.PIPELINE, "data",
                               "ai_exposure_sensitivity.csv"),
                  newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        moves = sorted(int(r["max_rank_movement"]) for r in rows)

        sens = report.load_sensitivity()
        self.assertEqual(sens["median_rank_movement"], moves[len(moves) // 2])
        self.assertEqual(sens["max_rank_movement"], moves[-1])
        self.assertEqual(sens["n"], len(moves))
        self.assertEqual(sens["profiles"],
                         ["balanced", "clerical_heavy", "cognitive_uniform"])

    def test_both_entry_points_share_one_summariser(self):
        """`crosscheck.sensitivity` and `load_sensitivity` must not diverge.

        The invariant is structural rather than numeric: both go through
        `report.summarise_sensitivity`, so there is one expression and no way
        for `npm run report` and `npm run pipeline` to disagree. Checked by
        feeding the same rows through both shapes they see -- the live rows
        carry ints, the CSV parse carries strings.
        """
        with open(os.path.join(context.PIPELINE, "data",
                               "ai_exposure_sensitivity.csv"),
                  newline="", encoding="utf-8") as fh:
            from_csv = list(csv.DictReader(fh))
        as_live = [dict(r, max_rank_movement=int(r["max_rank_movement"]))
                   for r in from_csv]
        profiles = ["balanced", "clerical_heavy", "cognitive_uniform"]
        self.assertEqual(report.summarise_sensitivity(from_csv, profiles),
                         report.summarise_sensitivity(as_live, profiles))

    def test_a_missing_sensitivity_csv_raises_rather_than_dropping_the_section(self):
        """Absence must be loud, not a silently shorter report.

        `write()` reads `sensitivity=None` as "skip the paragraph". If
        `load_sensitivity()` returned `None` for a missing file, `npm run report`
        would overwrite the tracked report without the median-N-places claim
        while printing `wrote ...` -- #54's second defect with a new trigger.
        The file is committed, so its absence is a broken checkout.
        """
        with tempfile.TemporaryDirectory() as empty:
            original, report.HERE = report.HERE, empty
            try:
                with self.assertRaises(FileNotFoundError):
                    report.load_sensitivity()
            finally:
                report.HERE = original

    def test_no_field_is_given_two_different_tiers_in_the_report(self):
        """One field, one tier word, wherever the report describes it.

        The previous version of this test compared the report's tier strings
        against `report.py`'s source, which cannot fail: the report is generated
        from those very strings, so containment is entailed by the byte
        comparison above rather than tested by it. It was green while the
        published document called the entry-level squeeze index a `MODELED
        composite` in the confidence table and a `derived composite` sixty lines
        earlier, in the section that introduces it -- which is #54's own
        complaint, still in the file.

        This asserts the property instead: for each field whose tier
        `config.FIELD_TIERS` records, no line of the report may describe it with
        a *different* tier word. Independent of the byte comparison, and it
        stays meaningful after a legitimate regeneration.
        """
        import config as C

        # The prose names fields in words, not column names; map the ones the
        # report actually describes with a tier adjective.
        described = {
            "entry_level_squeeze_index": "entry-level squeeze index",
            "exposed_wage_bill_ppp": "exposed wage bill",
            "ai_exposure_weighted_score": "ai exposure",
        }
        other_tiers = {"official": "OFFICIAL", "derived": "DERIVED",
                       "proxy": "PROXY", "modeled": "MODELED"}

        # A line is "about" a field if it names it, OR if it sits under a
        # heading that names it. The prose that carried #54's surviving half
        # does not repeat the field name -- `## Entry-level squeeze index` is
        # the line above it -- so matching only on the line itself silently
        # checks nothing. That was the first draft of this test, and it passed
        # against the exact drift it exists to catch.
        section = ""
        for i, line in enumerate(_committed(), 1):
            low = line.lower()
            if line.startswith("#"):
                section = low
            for field, phrase in described.items():
                expected = C.FIELD_TIERS.get(field)
                if expected not in C.TIERS:
                    continue
                if phrase not in low and phrase not in section:
                    continue
                for word, tier in other_tiers.items():
                    if tier == expected:
                        continue
                    self.assertNotIn(
                        f"**{word} composite**", low,
                        f"summary_report.md:{i} describes {field} as a "
                        f"{word!r} composite, but config.FIELD_TIERS says "
                        f"{expected}. One field cannot carry two tiers -- this "
                        f"is #54, and the confidence table alone is not the "
                        f"whole document.")


if __name__ == "__main__":
    unittest.main()
