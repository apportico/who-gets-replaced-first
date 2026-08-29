"""R9 -- the published invariants stay assertable.

`build.validate` already encodes the arithmetic that must hold. These tests
check that it *catches* each violation, so the checker itself cannot rot into
returning an empty list -- a validator that never fails is worse than none,
because it reads as evidence.
"""
import context  # noqa: F401
import unittest

import build
import fixtures


class Validate(unittest.TestCase):

    def test_clean_rows_produce_no_problems(self):
        row = fixtures.country("XXX", lfp_rate_total=60.0)
        row.update(pop_0_14_pct=20.0, pop_15_64_pct=65.0, pop_65plus_pct=15.0,
                   emp_agriculture_pct=10.0, emp_industry_pct=25.0,
                   emp_services_pct=65.0,
                   white_collar_pct=40.0, blue_collar_service_pct=60.0)

        self.assertEqual(build.validate([row]), [])

    def test_white_plus_blue_must_sum_to_100(self):
        """The partition check: 60 + 60 = 120 is not a workforce."""
        row = fixtures.country("BAD", white_collar_pct=60.0,
                               blue_collar_service_pct=60.0)
        problems = build.validate([row])

        self.assertEqual(len(problems), 1)
        self.assertIn("BAD", problems[0])
        self.assertIn("white+blue collar = 120.00", problems[0])

    def test_percentage_outside_range_is_caught(self):
        row = fixtures.country("BAD", lfp_rate_total=150.0)
        problems = build.validate([row])

        self.assertTrue(any("lfp_rate_total=150.0" in p for p in problems),
                        problems)
        self.assertTrue(any("outside [0,100]" in p for p in problems), problems)

    def test_negative_percentage_is_caught(self):
        row = fixtures.country("BAD", lfp_rate_total=-5.0)
        problems = build.validate([row])

        self.assertTrue(any("outside [0,100]" in p for p in problems), problems)

    def test_age_bands_must_sum_to_about_100(self):
        row = fixtures.country("BAD")
        row.update(pop_0_14_pct=20.0, pop_15_64_pct=65.0, pop_65plus_pct=30.0)
        problems = build.validate([row])

        self.assertTrue(any("age bands sum to 115.00" in p for p in problems),
                        problems)

    def test_sector_shares_must_sum_to_about_100(self):
        row = fixtures.country("BAD")
        row.update(emp_agriculture_pct=10.0, emp_industry_pct=25.0,
                   emp_services_pct=90.0)
        problems = build.validate([row])

        self.assertTrue(any("sector shares sum to 125.00" in p for p in problems),
                        problems)

    def test_tolerances_allow_real_world_rounding(self):
        """Published shares rarely sum to exactly 100; the checks allow slack.

        Pinning the tolerances stops someone "tightening" them into a validator
        that cries wolf on every real country.
        """
        row = fixtures.country("XXX")
        row.update(pop_0_14_pct=20.0, pop_15_64_pct=65.0, pop_65plus_pct=15.4,
                   emp_agriculture_pct=10.0, emp_industry_pct=25.0,
                   emp_services_pct=66.2,
                   white_collar_pct=40.0, blue_collar_service_pct=60.3)

        self.assertEqual(build.validate([row]), [])

    def test_null_fields_are_not_validated_into_problems(self):
        """A row of nulls is legitimate -- it must not be reported as invalid."""
        self.assertEqual(build.validate([fixtures.country("XXX")]), [])

    def test_problems_name_the_row_they_came_from(self):
        """A problem list nobody can trace back to a country is not actionable."""
        good = fixtures.country("GOOD", white_collar_pct=40.0,
                                blue_collar_service_pct=60.0)
        bad = fixtures.country("BAD", white_collar_pct=60.0,
                               blue_collar_service_pct=60.0)
        problems = build.validate([good, bad])

        self.assertEqual(len(problems), 1)
        self.assertTrue(problems[0].startswith("BAD:"), problems[0])


if __name__ == "__main__":
    unittest.main()
