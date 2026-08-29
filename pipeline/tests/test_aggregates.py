"""R4 -- aggregates are weighted, and their coverage is published.

CLAUDE.md: "Weight aggregates, never simple-average country percentages. And
publish the coverage alongside, so partial coverage is visible."

The fixtures here are built so the weighted and simple-average answers differ
materially. A test where both agree proves nothing -- it would pass against a
simple mean.
"""
import context  # noqa: F401
import unittest

import build
import fixtures


class WeightedAverage(unittest.TestCase):

    def test_weighted_not_simple_mean(self):
        """900 @ 20% and 100 @ 80% -> 26.0 weighted, 50.0 simple. Must be 26.0."""
        rows = [fixtures.member(900, 20.0), fixtures.member(100, 80.0)]
        value, denominator = build._wavg(rows, "white_collar_pct", "employed_total")

        self.assertEqual(value, 26.0)
        self.assertNotEqual(value, 50.0)
        self.assertEqual(denominator, 1000)

    def test_null_member_leaves_both_numerator_and_denominator(self):
        """A member with no value is excluded from BOTH sides, not counted as 0.

        Counting it as zero would drag the aggregate down; counting it in the
        denominator only would do the same more subtly.
        """
        rows = [fixtures.member(900, 20.0), fixtures.member(100, 80.0),
                fixtures.member(100, None)]
        value, denominator = build._wavg(rows, "white_collar_pct", "employed_total")

        self.assertEqual(value, 26.0)
        self.assertEqual(denominator, 1000)

    def test_no_usable_member_yields_none_not_zero(self):
        rows = [fixtures.member(100, None)]

        self.assertEqual(build._wavg(rows, "white_collar_pct", "employed_total"),
                         (None, 0.0))

    def test_zero_weight_member_is_ignored(self):
        """A member with no employment cannot contribute to an employment mean."""
        rows = [fixtures.member(1000, 20.0), fixtures.member(0, 99.0)]
        value, _ = build._wavg(rows, "white_collar_pct", "employed_total")

        self.assertEqual(value, 20.0)


class Aggregate(unittest.TestCase):

    def test_aggregate_uses_the_weighted_figure(self):
        rows = [fixtures.member(900, 20.0), fixtures.member(100, 80.0)]
        agg = build.make_aggregate("TST", "Test", rows, "test")

        self.assertEqual(agg["white_collar_pct"], 26.0)

    def test_coverage_is_published_alongside(self):
        """Partial coverage must be visible, not silently folded in.

        1000 of 1100 employed carry a value -> 90.91%. Without this the
        aggregate would look like a full-coverage figure.
        """
        rows = [fixtures.member(900, 20.0), fixtures.member(100, 80.0),
                fixtures.member(100, None)]
        agg = build.make_aggregate("TST", "Test", rows, "test")

        self.assertEqual(agg["white_collar_pct"], 26.0)
        self.assertEqual(agg["isco_coverage_pct_of_employment"], 90.91)

    def test_full_coverage_reports_100(self):
        rows = [fixtures.member(900, 20.0), fixtures.member(100, 80.0)]
        agg = build.make_aggregate("TST", "Test", rows, "test")

        self.assertEqual(agg["isco_coverage_pct_of_employment"], 100.0)

    def test_headcounts_are_summed_not_averaged(self):
        rows = [fixtures.member(900, 20.0, population=2000),
                fixtures.member(100, 80.0, population=500)]
        agg = build.make_aggregate("TST", "Test", rows, "test")

        self.assertEqual(agg["employed_total"], 1000)
        self.assertEqual(agg["population_total"], 2500)
        self.assertEqual(agg["employed_total_source"], "sum of member countries")

    def test_all_null_members_yield_a_null_aggregate(self):
        """No member with data => the aggregate is null, and says so."""
        rows = [fixtures.member(100, None), fixtures.member(200, None)]
        agg = build.make_aggregate("TST", "Test", rows, "test")

        self.assertIsNone(agg["white_collar_pct"])
        self.assertIn("0/2 members with ISCO data", agg["data_quality_flag"])

    def test_quality_flag_records_member_coverage(self):
        rows = [fixtures.member(900, 20.0), fixtures.member(100, None)]
        agg = build.make_aggregate("TST", "Test", rows, "test")

        self.assertIn("aggregate — 1/2 members with ISCO data",
                      agg["data_quality_flag"])

    def test_member_count_is_recorded(self):
        rows = [fixtures.member(900, 20.0), fixtures.member(100, 80.0),
                fixtures.member(50, None)]
        agg = build.make_aggregate("TST", "Test", rows, "test")

        self.assertEqual(agg["member_count"], 3)


if __name__ == "__main__":
    unittest.main()
