"""The committed report cannot drift from the code that writes it.

`pipeline/summary_report.md` is the document the root `README.md` sends readers
to, and it is generated rather than hand-written -- so nothing stopped it
disagreeing with `report.py`. It did, for the worst possible field: `report.py`
moved the entry-level squeeze index from `DERIVED` to `MODELED` in `ff507b0`,
and the committed report was never regenerated, so the published findings
labelled an analyst-weighted composite as arithmetic on official statistics
(#54).

Two things are checked here, because the drift had two independent causes.
"""
import context  # noqa: F401
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

    def test_sensitivity_is_reconstructed_from_committed_artifacts(self):
        """The reconstruction has to agree with what the pipeline computes.

        `run.py` builds this dict from live rows; `load_sensitivity()` rebuilds
        it from `data/ai_exposure_sensitivity.csv` plus the weight profiles. If
        the two ever disagree the report silently misstates its own robustness
        claim, so the shape and the profile list are pinned here.
        """
        sens = report.load_sensitivity()
        self.assertIsNotNone(sens, "ai_exposure_sensitivity.csv should be committed")
        self.assertEqual(set(sens), {"median_rank_movement", "max_rank_movement",
                                     "worst_country", "n", "profiles"})
        self.assertEqual(sens["profiles"],
                         ["balanced", "clerical_heavy", "cognitive_uniform"])
        self.assertGreater(sens["n"], 0)
        self.assertGreaterEqual(sens["max_rank_movement"],
                                sens["median_rank_movement"])

    def test_no_tier_label_in_the_report_is_absent_from_the_code(self):
        """Every tier word the report publishes must come from `report.py`.

        A narrower guard than the byte comparison above, kept separate because
        it survives a legitimate regeneration: it is the tier rule specifically,
        and `CLAUDE.md` puts tiers above every other consideration in review.
        """
        published = "\n".join(_committed())
        with open(os.path.join(context.PIPELINE, "report.py"),
                  encoding="utf-8") as fh:
            source = fh.read()
        for tier in ("DERIVED composite", "MODELED composite"):
            if tier in published:
                # Not assertIn: that dumps all 400 lines of report.py into the
                # failure output and buries the one sentence that explains it.
                self.assertTrue(
                    tier in source,
                    f"summary_report.md publishes {tier!r}, which report.py no "
                    f"longer writes. The committed report is stale -- "
                    f"regenerate it with `npm run report`. This is #54.")


if __name__ == "__main__":
    unittest.main()
