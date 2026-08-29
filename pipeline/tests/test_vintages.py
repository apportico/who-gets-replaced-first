"""R5 -- a row is never presented as a single-year snapshot.

CLAUDE.md: "Record the year per field. Vintages differ -- population may be 2025
while occupation is 2017. Never present a row as a single-year snapshot."

The failure this guards against is subtle: nothing looks wrong about a row that
carries one year. It just quietly asserts that every figure in it was measured
at the same time, which for most countries is false.
"""
import context  # noqa: F401
import unittest

import build
import fixtures


class PerFieldYears(unittest.TestCase):

    def test_differing_vintages_both_survive(self):
        """Population 2025 and occupation 2017 must both reach the row intact."""
        row = fixtures.with_isco("XXX", year=2017, g1=10.0, g2=12.0)
        row["data_year_population"] = 2025
        build.derive({"XXX": row}, fixtures.weights())

        self.assertEqual(row["data_year_population"], 2025)
        self.assertEqual(row["data_year_occupation"], 2017)

    def test_vintage_gap_of_eight_years_is_not_collapsed(self):
        """Neither year may be overwritten by the other, in either direction."""
        row = fixtures.with_isco("XXX", year=2017, g1=10.0)
        row.update(data_year_population=2025, data_year_labor=2024,
                   data_year_sector=2022)
        build.derive({"XXX": row}, fixtures.weights())

        self.assertEqual(
            [row["data_year_population"], row["data_year_labor"],
             row["data_year_sector"], row["data_year_occupation"]],
            [2025, 2024, 2022, 2017])


class AggregateVintages(unittest.TestCase):

    def test_aggregate_records_max_year_and_the_span(self):
        """An aggregate spanning 2017-2023 must publish the span, not just 2023.

        Reporting only the newest year would present an aggregate built partly
        from six-year-old data as if it were current.
        """
        m1 = fixtures.member(100, 20.0)
        m1["data_year_occupation"] = 2017
        m2 = fixtures.member(100, 40.0)
        m2["data_year_occupation"] = 2023
        agg = build.make_aggregate("TST", "Test", [m1, m2], "test")

        self.assertEqual(agg["data_year_occupation"], 2023)
        self.assertEqual(agg["data_year_occupation_range"], "2017-2023")

    def test_single_vintage_span_is_still_recorded(self):
        m1 = fixtures.member(100, 20.0)
        m1["data_year_occupation"] = 2023
        m2 = fixtures.member(100, 40.0)
        m2["data_year_occupation"] = 2023
        agg = build.make_aggregate("TST", "Test", [m1, m2], "test")

        self.assertEqual(agg["data_year_occupation_range"], "2023-2023")

    def test_no_member_years_yields_null_year_and_null_span(self):
        rows = [fixtures.member(100, 20.0), fixtures.member(100, 40.0)]
        agg = build.make_aggregate("TST", "Test", rows, "test")

        self.assertIsNone(agg["data_year_occupation"])
        self.assertIsNone(agg["data_year_occupation_range"])

    def test_every_tracked_vintage_field_gets_a_span(self):
        """All five tracked vintages carry a _range on aggregates."""
        tracked = ("data_year_population", "data_year_labor", "data_year_sector",
                   "data_year_occupation", "data_year_youth_occupation")
        m1, m2 = fixtures.member(100, 20.0), fixtures.member(100, 40.0)
        for i, k in enumerate(tracked):
            m1[k], m2[k] = 2018 + i, 2024
        agg = build.make_aggregate("TST", "Test", [m1, m2], "test")

        for i, k in enumerate(tracked):
            with self.subTest(field=k):
                self.assertEqual(agg[k], 2024)
                self.assertEqual(agg[k + "_range"], f"{2018 + i}-2024")


class LatestPicksTheVintage(unittest.TestCase):
    """`latest` is what decides a field's year in the first place."""

    def test_newest_non_null_wins(self):
        self.assertEqual(build.latest({2020: 5.0, 2023: None, 2021: 7.0}),
                         (7.0, 2021))

    def test_value_and_year_travel_together(self):
        value, year = build.latest({2015: 1.0, 2019: 9.0, 2017: 4.0})

        self.assertEqual((value, year), (9.0, 2019))


if __name__ == "__main__":
    unittest.main()
