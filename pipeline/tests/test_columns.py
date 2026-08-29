"""R8 -- the committed CSVs' headers match run.COLUMNS.

This is the check that would have caught the drift it was written for.
`pilot_labor_dataset.csv` sat in the repo at 87 columns against COLUMNS' 89,
still carrying `early_career_white_collar_pct` and `data_year_early_career` --
the columns spec 0002 R11 replaced when it was revised to the career-stage
profile. Nothing failed, because nothing looked.

Header drift is quiet by nature: the file still parses, still has plausible
numbers, and only misleads whoever reads a column that no longer means what
its name says.

Note these assert against files the pipeline *writes*. They are not R7's golden
master -- that lives in tests/fixtures/expected/ precisely so a run cannot
overwrite the thing it is being compared against.
"""
import context  # noqa: F401
import csv
import os
import unittest

import run

DATA = os.path.join(context.PIPELINE, "data")
COMMITTED = ("global_labor_dataset.csv", "pilot_labor_dataset.csv")

# Retired by 0002 R11's revision to the career-stage profile. Named explicitly
# so their reappearance is a test failure rather than an archaeology exercise.
RETIRED = ("early_career_white_collar_pct", "data_year_early_career")


def header(name):
    with open(os.path.join(DATA, name), newline="", encoding="utf-8") as f:
        return next(csv.reader(f))


class CommittedHeaders(unittest.TestCase):

    def test_headers_match_columns_in_content_and_order(self):
        """Order matters: a CSV is positional, so a reordering is a data bug."""
        for name in COMMITTED:
            with self.subTest(csv=name):
                self.assertEqual(header(name), list(run.COLUMNS))

    def test_headers_have_the_expected_width(self):
        for name in COMMITTED:
            with self.subTest(csv=name):
                self.assertEqual(len(header(name)), len(run.COLUMNS))

    def test_no_retired_column_has_come_back(self):
        for name in COMMITTED:
            for column in RETIRED:
                with self.subTest(csv=name, column=column):
                    self.assertNotIn(column, header(name))

    def test_career_stage_columns_are_present(self):
        """The columns 0002 R11 introduced in place of the retired pair."""
        for name in COMMITTED:
            for column in ("prime_white_collar_pct",
                           "late_career_white_collar_pct",
                           "prime_white_collar_year",
                           "late_career_white_collar_year"):
                with self.subTest(csv=name, column=column):
                    self.assertIn(column, header(name))


class PilotContents(unittest.TestCase):
    """The pilot output is the 7-row batch, not the 6 areas of C.PILOT."""

    def setUp(self):
        path = os.path.join(DATA, "pilot_labor_dataset.csv")
        with open(path, newline="", encoding="utf-8") as f:
            self.rows = {r["iso3"]: r for r in csv.DictReader(f)}

    def test_pilot_carries_the_seven_expected_rows(self):
        self.assertEqual(set(self.rows),
                         {"WLD", "EU27", "ARM", "CHN", "DEU", "IND", "USA"})

    def test_eu27_row_is_present(self):
        """EU27 is a weighted aggregate over all 27 members.

        Its presence is what forces the golden-master fixture to cover 32 areas
        rather than the 6 in C.PILOT.
        """
        self.assertIn("EU27", self.rows)

    def test_regenerated_usa_row_carries_the_career_stage_value(self):
        """The specific evidence that the stale file was actually replaced."""
        self.assertTrue(self.rows["USA"]["prime_white_collar_pct"])
        self.assertNotEqual(self.rows["USA"]["prime_white_collar_pct"], "")


if __name__ == "__main__":
    unittest.main()
