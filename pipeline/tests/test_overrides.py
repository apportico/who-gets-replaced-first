"""R6 -- an override without a citation is refused, not merged.

CLAUDE.md: "Never invent a figure to fill a gap. manual_overrides.json exists
for nationally-sourced numbers and *requires* a citation, a year and a
retrieval date."

Every fixture here is written to a temp file. The suite must never need, or
encourage, inventing a figure for Armenia, New Zealand or Saudi Arabia -- those
gaps are unfilled on purpose, and a test that filled one to prove the merge
works would be the exact failure this requirement guards.
"""
import context  # noqa: F401
import json
import os
import tempfile
import unittest

import build
import fixtures

REQUIRED = ("value", "year", "source_name", "source_url", "retrieved", "note")

COMPLETE = {
    "value": 42.5,
    "year": 2024,
    "source_name": "Test Statistical Office",
    "source_url": "https://example.invalid/lfs",
    "retrieved": "2026-08-30",
    "note": "Synthetic fixture -- not a real figure for any real country.",
}


class OverrideContract(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)

    def _write(self, overrides):
        path = os.path.join(self._tmp.name, "overrides.json")
        with open(path, "w") as f:
            json.dump({"overrides": overrides}, f)
        return path

    def test_complete_entry_is_applied_and_tagged(self):
        path = self._write({"XXX": {"white_collar_pct": COMPLETE}})
        rows = {"XXX": fixtures.country("XXX", white_collar_pct=None)}
        with fixtures.quiet():
            build.apply_overrides(rows, path)

        self.assertEqual(rows["XXX"]["white_collar_pct"], 42.5)
        self.assertEqual(
            rows["XXX"]["data_source_override"],
            "white_collar_pct=42.5 (2024, Test Statistical Office)")

    def test_each_missing_key_refuses_the_merge(self):
        """Drop any one of the six and the value must not land.

        Parameterised over all six so that relaxing the contract to five keys
        fails here rather than in production.
        """
        for key in REQUIRED:
            with self.subTest(missing=key):
                spec = {k: v for k, v in COMPLETE.items() if k != key}
                path = self._write({"XXX": {"white_collar_pct": spec}})
                rows = {"XXX": fixtures.country("XXX", white_collar_pct=11.0)}
                with fixtures.quiet():
                    build.apply_overrides(rows, path)

                self.assertEqual(rows["XXX"]["white_collar_pct"], 11.0)
                self.assertIsNone(rows["XXX"]["data_source_override"])

    def test_missing_retrieved_date_refuses_the_merge(self):
        """Stated on its own: the retrieval date is the freshness audit trail."""
        spec = {k: v for k, v in COMPLETE.items() if k != "retrieved"}
        path = self._write({"XXX": {"white_collar_pct": spec}})
        rows = {"XXX": fixtures.country("XXX", white_collar_pct=11.0)}
        with fixtures.quiet():
            build.apply_overrides(rows, path)

        self.assertEqual(rows["XXX"]["white_collar_pct"], 11.0)

    def test_unknown_area_is_skipped_without_raising(self):
        """A typo'd ISO3 must not take the pipeline down, nor silently apply."""
        path = self._write({"ZZZ": {"white_collar_pct": COMPLETE}})
        rows = {"XXX": fixtures.country("XXX", white_collar_pct=11.0)}
        with fixtures.quiet():
            build.apply_overrides(rows, path)

        self.assertEqual(rows["XXX"]["white_collar_pct"], 11.0)

    def test_rows_without_overrides_get_an_explicit_null_tag(self):
        """Absence must be recorded as None, not left as a missing key."""
        path = self._write({})
        rows = {"XXX": fixtures.country("XXX")}
        with fixtures.quiet():
            build.apply_overrides(rows, path)

        self.assertIn("data_source_override", rows["XXX"])
        self.assertIsNone(rows["XXX"]["data_source_override"])

    def test_multiple_overrides_on_one_row_are_all_tagged(self):
        second = dict(COMPLETE, value=7.5)
        path = self._write({"XXX": {"white_collar_pct": COMPLETE,
                                    "lfp_rate_total": second}})
        rows = {"XXX": fixtures.country("XXX")}
        with fixtures.quiet():
            build.apply_overrides(rows, path)

        tag = rows["XXX"]["data_source_override"]
        self.assertIn("white_collar_pct=42.5", tag)
        self.assertIn("lfp_rate_total=7.5", tag)


class CommittedOverridesFile(unittest.TestCase):
    """The real manual_overrides.json must itself satisfy the contract."""

    def setUp(self):
        path = os.path.join(context.PIPELINE, "manual_overrides.json")
        with open(path) as f:
            self.payload = json.load(f)

    def test_overrides_is_a_dict(self):
        self.assertIsInstance(self.payload.get("overrides"), dict)

    def test_every_committed_entry_carries_all_six_keys(self):
        """Passes today with overrides == {}; fails on a future uncited entry."""
        for iso3, fields in self.payload["overrides"].items():
            for field, spec in fields.items():
                with self.subTest(area=iso3, field=field):
                    self.assertEqual(
                        [k for k in REQUIRED if k not in spec], [],
                        f"{iso3}.{field} is missing required keys")

    def test_unfilled_gaps_stay_documented_rather_than_filled(self):
        """ARM, NZL and SAU are unfilled on purpose; the reason must persist."""
        gaps = self.payload.get("_unfilled_gaps", {})
        for area in ("ARM", "NZL", "SAU"):
            with self.subTest(area=area):
                self.assertIn(area, gaps)
                self.assertTrue(gaps[area].strip())
                self.assertNotIn(area, self.payload["overrides"])


if __name__ == "__main__":
    unittest.main()
