"""R2 -- a missing input produces a null and a flag, never a zero, never a guess.

The single most important module in the suite. The project's first
non-negotiable is that a country with no data is a row of nulls, never a guess,
and nothing but these tests enforces it.

The specific line under guard is in `build.derive`:

    g = lambda code: groups.get(code) or 0.0

which coerces a null ISCO group to 0.0 inside the band sums. That is safe only
because the whole block is gated on

    have_isco = row.get("data_year_occupation") is not None

Drop the gate and every country with no occupation data silently reports
white_collar_pct = 0.0 -- a number that looks like a measurement, sorts like a
measurement, and is a fabrication. test_no_occupation_year_yields_none is the
test that fails if anyone removes it.
"""
import context  # noqa: F401
import unittest

import build
import fixtures


class NullPropagation(unittest.TestCase):

    def test_no_occupation_year_yields_none(self):
        """The have_isco gate: no occupation year => None, NOT 0.0."""
        row = fixtures.with_isco("XXX", year=None, g1=10.0, g2=12.0, g3=8.0)
        # groups are present but the vintage is absent -- the gate must shut
        build.derive({"XXX": row}, fixtures.weights())

        self.assertIsNone(row["white_collar_pct"])
        self.assertIsNone(row["professional_core_pct"])
        self.assertIsNone(row["blue_collar_service_pct"])

    def test_no_occupation_year_is_not_zero(self):
        """Stated separately because 0.0 is the specific wrong answer.

        `assertIsNone` above would also pass if the field were absent; this
        pins the failure mode the `or 0.0` coercion would produce.

        Equality, not identity. `assertIsNot(value, 0.0)` cannot fail here: the
        pipeline's zero comes out of `round(sum(...), 4)`, a freshly allocated
        float, so it is never the same object as the literal and the assertion
        passes even when the value is 0.0. An earlier revision of this test
        carried that line and credited it with the work this one does.
        """
        row = fixtures.with_isco("XXX", year=None, g1=10.0, g2=12.0)
        build.derive({"XXX": row}, fixtures.weights())

        self.assertNotEqual(row["white_collar_pct"], 0.0)
        self.assertNotEqual(row["professional_core_pct"], 0.0)
        self.assertNotEqual(row["blue_collar_service_pct"], 0.0)

    def test_country_with_no_isco_data_at_all_yields_none(self):
        """The real production shape: no vintage AND no groups.

        This is what a country with no ISCO series actually looks like, and it
        is the case where `or 0.0` produces literally 0.0 rather than a partial
        sum. 0.0 is the worst possible wrong answer here -- it reads as "no one
        in this country does white-collar work", sorts to the bottom of the
        map, and is indistinguishable from a measurement.
        """
        row = fixtures.country("XXX", population_total=5000)
        build.derive({"XXX": row}, fixtures.weights())

        self.assertIsNone(row["white_collar_pct"])
        self.assertNotEqual(row["white_collar_pct"], 0.0)
        self.assertIsNone(row["ai_exposure_weighted_score"])

    def test_gate_open_still_sums(self):
        """The guard must not be so tight that real data stops summing."""
        row = fixtures.with_isco("XXX", year=2023, g1=10.0, g2=12.0, g3=8.0, g4=7.0)
        build.derive({"XXX": row}, fixtures.weights())

        self.assertAlmostEqual(row["white_collar_pct"], 37.0, places=4)

    def test_missing_labour_force_yields_null_employed(self):
        """No labour force and no ISCO survey total => employed_total is None."""
        row = fixtures.country("XXX", population_total=5000)
        build.derive({"XXX": row}, fixtures.weights())

        self.assertIsNone(row["employed_total"])
        self.assertIsNone(row["employed_total_source"])

    def test_missing_population_yields_null_share(self):
        """No population => no share of population employed, not a zero."""
        row = fixtures.country("XXX", labor_force_total=1000,
                               unemployment_rate_total=10.0)
        build.derive({"XXX": row}, fixtures.weights())

        self.assertEqual(row["employed_total"], 900)
        self.assertIsNone(row["employed_share_of_population_pct"])


class QualityFlag(unittest.TestCase):

    def test_complete_row_is_flagged_complete(self):
        row = fixtures.with_isco("XXX", year=2024, g1=10.0)
        row.update(population_total=5000, lfp_rate_total=60.0,
                   young_white_collar_pct=30.0, isco_groups_reported=9,
                   isco_classified_share_pct=99.0, white_collar_pct=40.0)

        self.assertEqual(build.quality_flag(row, current_year=2026), "complete")

    def test_empty_row_is_flagged_sparse_with_reasons(self):
        """A row of nulls must say so, and say why."""
        flag = build.quality_flag(fixtures.country("XXX"), current_year=2026)

        self.assertTrue(flag.startswith("sparse — "), flag)
        self.assertIn("no ISCO data", flag)
        self.assertIn("no population data", flag)
        self.assertIn("no labor force data", flag)

    def test_partial_row_names_the_gap(self):
        """Some data present => partial, and the gap is named, not hidden."""
        row = fixtures.with_isco("XXX", year=2024, g1=10.0)
        row.update(population_total=5000, lfp_rate_total=60.0,
                   white_collar_pct=40.0, isco_groups_reported=9,
                   isco_classified_share_pct=99.0)
        flag = build.quality_flag(row, current_year=2026)

        self.assertTrue(flag.startswith("partial — "), flag)
        self.assertIn("no youth x ISCO cross-tab", flag)

    def test_stale_occupation_year_is_flagged(self):
        """Vintage is a quality question: >5yr old occupation data is named."""
        row = fixtures.with_isco("XXX", year=2017, g1=10.0)
        row.update(population_total=5000, lfp_rate_total=60.0,
                   white_collar_pct=40.0, young_white_collar_pct=30.0,
                   isco_groups_reported=9, isco_classified_share_pct=99.0)
        flag = build.quality_flag(row, current_year=2026)

        self.assertIn("2017", flag)
        self.assertIn(">5yr old", flag)

    def test_isco88_fallback_is_flagged(self):
        """0002 R1's fallback must stay visible in the flag, not blend in."""
        row = fixtures.with_isco("XXX", year=2023, g1=10.0)
        row.update(population_total=5000, lfp_rate_total=60.0,
                   white_collar_pct=40.0, young_white_collar_pct=30.0,
                   isco_classification="ISCO-88")
        flag = build.quality_flag(row, current_year=2026)

        self.assertIn("ISCO-88 fallback", flag)


if __name__ == "__main__":
    unittest.main()
