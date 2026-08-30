"""R3 -- every emitted field carries a tier, in a registry the tests can read.

CLAUDE.md's first non-negotiable is that measured and constructed are never
blurred. Before spec 0004 the tier vocabulary existed only as prose in
report.py's methodology tables -- `pipeline/README.md` contained none of the
four words -- so there was nothing a test could assert against.

Two distinct assertions, because the registry and the app payload cover
different column sets:

  - pipeline-side: set(FIELD_TIERS) == set(run.COLUMNS)          -- 89
  - payload-side:  set(payload["field_tiers"]) == set(keep)      -- 84

`export_app_json` drops the five *_range columns, so a single assertion over
both would be unsatisfiable by any correct implementation.
"""
import context  # noqa: F401
import json
import os
import tempfile
import unittest

import config as C
import fixtures
import run

VALID = set(C.TIERS) | {C.NOT_A_MEASUREMENT}


class Registry(unittest.TestCase):

    def test_every_emitted_column_has_a_tier(self):
        """The point of the registry: a new column without a tier fails here.

        Deliberately an equality rather than a subset check -- a stale entry for
        a column that no longer exists is also a defect worth catching.
        """
        self.assertEqual(set(C.FIELD_TIERS), set(run.COLUMNS))

    def test_registry_has_no_entries_for_columns_that_do_not_exist(self):
        self.assertEqual(sorted(set(C.FIELD_TIERS) - set(run.COLUMNS)), [])

    def test_every_value_is_in_the_closed_set(self):
        for field, tier in C.FIELD_TIERS.items():
            with self.subTest(field=field):
                self.assertIn(tier, VALID)

    def test_the_four_tiers_are_the_ones_claude_md_names(self):
        self.assertEqual(C.TIERS, ("OFFICIAL", "DERIVED", "PROXY", "MODELED"))

    def test_every_tier_is_actually_used(self):
        """A tier nothing carries is a sign the vocabulary drifted from reality."""
        used = set(C.FIELD_TIERS.values())
        for tier in C.TIERS:
            with self.subTest(tier=tier):
                self.assertIn(tier, used)


class Anchors(unittest.TestCase):
    """The registry must agree with what report.py tells the reader in prose."""

    def test_official_is_published_statistics_as_published(self):
        for field in ("population_total", "labor_force_total",
                      "unemployment_rate_total", "emp_services_pct",
                      "gdp_per_capita_ppp"):
            with self.subTest(field=field):
                self.assertEqual(C.FIELD_TIERS[field], "OFFICIAL")

    def test_derived_is_arithmetic_on_official_statistics(self):
        for field in ("employed_total", "employed_share_of_population_pct",
                      "white_collar_pct", "professional_core_pct",
                      "blue_collar_service_pct"):
            with self.subTest(field=field):
                self.assertEqual(C.FIELD_TIERS[field], "DERIVED")

    def test_isco_shares_are_derived_not_official(self):
        """ILOSTAT publishes headcounts; the percentage shares are ours.

        _apply_occupation computes 100 * group / base, so labelling these
        OFFICIAL would present our arithmetic as a published statistic.
        """
        self.assertEqual(C.FIELD_TIERS["isco1_managers_pct"], "DERIVED")
        self.assertEqual(C.FIELD_TIERS["isco_source_employed_thousands"], "DERIVED")
        # the group-0 count is passed through unchanged, so it stays OFFICIAL
        self.assertEqual(C.FIELD_TIERS["isco_armed_forces_thousands"], "OFFICIAL")

    def test_entry_level_family_is_proxy(self):
        """Age 15-24 stands in for seniority, which no global source measures."""
        for field in ("young_white_collar_pct", "prime_white_collar_pct",
                      "late_career_white_collar_pct",
                      "young_white_collar_employed"):
            with self.subTest(field=field):
                self.assertEqual(C.FIELD_TIERS[field], "PROXY")

    def test_exposure_score_and_wage_bill_are_modeled(self):
        self.assertEqual(C.FIELD_TIERS["ai_exposure_weighted_score"], "MODELED")
        self.assertEqual(C.FIELD_TIERS["exposed_wage_bill_ppp"], "MODELED")

    def test_squeeze_index_is_modeled_not_derived(self):
        """The one place the registry departs from report.py's original label.

        SQUEEZE_COMPONENTS' 0.25/0.30/0.25/0.20 are assigned by this project,
        exactly as the ISCO exposure weights are. Two composites with
        project-assigned weights must not carry different tiers.
        """
        self.assertEqual(C.FIELD_TIERS["entry_level_squeeze_index"], "MODELED")

    def test_identity_and_provenance_are_not_measurements(self):
        for field in ("iso3", "country_name", "data_year_population",
                      "data_year_occupation", "data_quality_flag",
                      "data_source_override", "isco_classification"):
            with self.subTest(field=field):
                self.assertEqual(C.FIELD_TIERS[field], C.NOT_A_MEASUREMENT)

    def test_coverage_percentages_are_derived(self):
        """Coverage is computed from the _wavg denominator, so it is ours."""
        self.assertEqual(C.FIELD_TIERS["isco_coverage_pct_of_employment"],
                         "DERIVED")


class ProseAgreesWithRegistry(unittest.TestCase):
    """A registry that contradicts the prose beside it just relocates the doubt."""

    def setUp(self):
        with open(os.path.join(context.PIPELINE, "report.py")) as f:
            self.report = f.read()

    def test_report_no_longer_calls_the_squeeze_index_derived(self):
        self.assertNotIn("| Entry-level squeeze index | **DERIVED composite**",
                         self.report)

    def test_report_calls_the_squeeze_index_modeled(self):
        self.assertIn("| Entry-level squeeze index | **MODELED composite**",
                      self.report)


class AppPayload(unittest.TestCase):
    """R3 -- what `export_app_json` writes. NOT what `src/data/global_labor.json`
    contains.

    Read that distinction before trusting this class. Every test below asserts
    on a payload regenerated from two fixture rows into a temp file by `setUp`.
    None of them opens the committed artifact, so all six passed for the whole
    life of #57, while the file the app actually imports had no `field_tiers`
    key at all -- green against precisely the defect they appear to cover.

    That is not a flaw in these tests: they are correct about the generator, and
    a generator-side check is worth having. It is a flaw in reading them as
    coverage of the shipped payload, which is what happened.

    The artifact is covered by
    `test_app_payloads.CommittedHeaderMatchesTheGenerator` (spec 0009 R2), which
    opens `src/data/global_labor.json` and compares its whole non-`rows` header
    against `export_app_json([], tmp)`. Add generator-side assertions here;
    add artifact-side ones there.
    """

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.path = os.path.join(self._tmp.name, "app", "global_labor.json")
        rows = [fixtures.country("XXX"), fixtures.country("YYY")]
        with fixtures.quiet():
            run.export_app_json(rows, self.path)
        with open(self.path) as f:
            self.payload = json.load(f)

    def test_payload_carries_field_tiers(self):
        self.assertIn("field_tiers", self.payload)

    def test_payload_tiers_match_the_columns_it_actually_ships(self):
        """84, not 89 -- export_app_json drops the five *_range columns."""
        keep = [c for c in run.COLUMNS if not c.endswith("_range")]
        self.assertEqual(set(self.payload["field_tiers"]), set(keep))
        self.assertEqual(len(self.payload["field_tiers"]), 84)

    def test_payload_tiers_cover_every_key_in_a_row(self):
        """Every field the app can render must be labellable."""
        for key in self.payload["rows"][0]:
            with self.subTest(field=key):
                self.assertIn(key, self.payload["field_tiers"])

    def test_payload_does_not_claim_coverage_of_dropped_columns(self):
        for field in run.COLUMNS:
            if field.endswith("_range"):
                with self.subTest(field=field):
                    self.assertNotIn(field, self.payload["field_tiers"])

    def test_payload_values_are_in_the_closed_set(self):
        for field, tier in self.payload["field_tiers"].items():
            with self.subTest(field=field):
                self.assertIn(tier, VALID)

    def test_export_refuses_an_untiered_column_with_a_legible_message(self):
        """Fail loudly, and say what to do about it.

        Without the guard this surfaces as a bare KeyError from a dict
        comprehension, which does not tell the next person that the fix is to
        add a registry entry.
        """
        original = list(run.COLUMNS)
        run.COLUMNS.append("brand_new_untiered_column")
        self.addCleanup(lambda: run.COLUMNS.__setitem__(slice(None), original))

        with self.assertRaises(KeyError) as caught:
            with fixtures.quiet():
                run.export_app_json([fixtures.country("XXX")], self.path)

        message = str(caught.exception)
        self.assertIn("brand_new_untiered_column", message)
        self.assertIn("FIELD_TIERS", message)
        self.assertIn("NOT_A_MEASUREMENT", message)


if __name__ == "__main__":
    unittest.main()
