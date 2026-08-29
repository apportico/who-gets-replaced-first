"""R1 -- derived arithmetic pinned to known inputs and known outputs.

Every number here is DERIVED: arithmetic on official statistics. The tests use
hand-computed expected values rather than re-deriving them with the same
expression under test, which would only prove the code equals itself.
"""
import context  # noqa: F401
import unittest

import build
import fixtures


class EmployedHeadcount(unittest.TestCase):

    def test_employed_from_labour_force_and_unemployment(self):
        """employed = labour force x (1 - unemployment/100). 1000 x 0.9 = 900."""
        row = fixtures.country("XXX", labor_force_total=1000,
                               unemployment_rate_total=10.0,
                               population_total=5000)
        build.derive({"XXX": row}, fixtures.weights())

        self.assertEqual(row["employed_total"], 900)
        self.assertEqual(row["employed_total_source"],
                         "SL.TLF.TOTL.IN x (1 - SL.UEM.TOTL.ZS)")

    def test_share_of_whole_population_employed(self):
        """100 x 900 / 5000 = 18.0 -- share of the WHOLE population, not 15+."""
        row = fixtures.country("XXX", labor_force_total=1000,
                               unemployment_rate_total=10.0,
                               population_total=5000)
        build.derive({"XXX": row}, fixtures.weights())

        self.assertEqual(row["employed_share_of_population_pct"], 18.0)

    def test_isco_survey_total_is_the_fallback_source(self):
        """No labour force => fall back to the ILOSTAT survey total, in persons.

        The fallback is in thousands, so it must be multiplied by 1000. Getting
        this wrong understates a country's employment by three orders of
        magnitude and would sail through a range check.
        """
        row = fixtures.country("XXX", isco_source_employed_thousands=1234.0,
                               population_total=10000)
        build.derive({"XXX": row}, fixtures.weights())

        self.assertEqual(row["employed_total"], 1234000)
        self.assertEqual(row["employed_total_source"],
                         "ILOSTAT survey total (ISCO base)")

    def test_emp_to_pop_ratio_fallback_for_the_share(self):
        """With no headcount, the share comes from the 15+ ratio x adult share."""
        row = fixtures.country("XXX", emp_to_pop_ratio_15plus=60.0,
                               pop_15_64_pct=65.0, pop_65plus_pct=15.0)
        build.derive({"XXX": row}, fixtures.weights())

        # 60.0 * (65.0 + 15.0) / 100 = 48.0
        self.assertEqual(row["employed_share_of_population_pct"], 48.0)


class IscoBands(unittest.TestCase):

    def test_white_collar_is_groups_1_to_4(self):
        """Distinct, non-round values so a wrong grouping cannot coincide."""
        row = fixtures.with_isco("XXX", year=2023,
                                 g1=7.31, g2=11.47, g3=9.83, g4=6.29,
                                 g5=15.11, g6=8.07, g7=13.53, g8=12.19, g9=16.2)
        build.derive({"XXX": row}, fixtures.weights())

        self.assertAlmostEqual(row["white_collar_pct"], 34.90, places=4)

    def test_professional_core_is_groups_1_and_2(self):
        row = fixtures.with_isco("XXX", year=2023, g1=7.31, g2=11.47, g3=9.83)
        build.derive({"XXX": row}, fixtures.weights())

        self.assertAlmostEqual(row["professional_core_pct"], 18.78, places=4)

    def test_blue_collar_service_is_groups_5_to_9(self):
        row = fixtures.with_isco("XXX", year=2023,
                                 g5=15.11, g6=8.07, g7=13.53, g8=12.19, g9=16.2)
        build.derive({"XXX": row}, fixtures.weights())

        self.assertAlmostEqual(row["blue_collar_service_pct"], 65.10, places=4)

    def test_white_and_blue_partition_the_workforce(self):
        """1-4 and 5-9 are a partition: they must sum to the classified total."""
        row = fixtures.with_isco("XXX", year=2023,
                                 g1=7.31, g2=11.47, g3=9.83, g4=6.29,
                                 g5=15.11, g6=8.07, g7=13.53, g8=12.19, g9=16.2)
        build.derive({"XXX": row}, fixtures.weights())

        self.assertAlmostEqual(
            row["white_collar_pct"] + row["blue_collar_service_pct"],
            100.0, places=4)


class Num(unittest.TestCase):
    """`num` decides what counts as a usable value -- the gate before every sum."""

    def test_parses_numeric_strings(self):
        self.assertEqual(build.num("12.5"), 12.5)
        self.assertEqual(build.num(3), 3.0)

    def test_unparseable_becomes_none_not_zero(self):
        for bad in (None, "", "n/a", "..", []):
            with self.subTest(bad=bad):
                self.assertIsNone(build.num(bad))

    def test_zero_survives_as_zero(self):
        """A real measured zero must not be swallowed by the None path."""
        self.assertEqual(build.num("0"), 0.0)
        self.assertEqual(build.num(0), 0.0)


class Latest(unittest.TestCase):
    """`latest` decides which vintage wins."""

    def test_returns_newest_non_null_with_its_year(self):
        self.assertEqual(build.latest({2020: 5.0, 2023: None, 2021: 7.0}),
                         (7.0, 2021))

    def test_skips_null_years_rather_than_stopping_at_them(self):
        self.assertEqual(build.latest({2019: 1.0, 2024: None, 2022: 2.0}),
                         (2.0, 2022))

    def test_all_null_yields_no_value_and_no_year(self):
        self.assertEqual(build.latest({2020: None, 2021: None}), (None, None))

    def test_empty_series_yields_no_value_and_no_year(self):
        self.assertEqual(build.latest({}), (None, None))

    def test_a_measured_zero_is_not_treated_as_missing(self):
        """0.0 is falsy; `latest` must select on None, not on truthiness."""
        self.assertEqual(build.latest({2020: 5.0, 2023: 0.0}), (0.0, 2023))


if __name__ == "__main__":
    unittest.main()
