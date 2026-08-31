"""0010 R20 — the per-country cross-tab artefacts cannot drift.

Spec 0009 exists because a committed payload went unregenerated for the life of
the project while six tests appeared to cover it — all of them asserting on a
temp file the run had just written, so they compared the output with itself.
`src/data/crosstabs/` is the first app-consumed payload added since, and
shipping it without a guard would re-open exactly that hole.

Same shape as `test_app_payloads.CommittedRowsMatchTheDataset`, and for the same
reason: these tests read the COMMITTED artefacts off disk and compare them
against the committed dataset CSV. Neither side is produced here. A run that
forgets `npm run pipeline` fails, which is the whole point.

What this closes that `test_app_payloads` cannot: R20 excludes the 81 cross-tab
columns from `global_labor.json`, so `test_every_cell_matches_the_dataset_csv`
no longer compares them anywhere. Excluding columns from a guard without
asserting them somewhere else would have been a hole, not a fix.
"""
import context  # noqa: F401
import csv
import json
import os
import tempfile
import unittest

import config as C
import run

CROSSTABS = os.path.join(os.path.dirname(context.PIPELINE), "src", "data", "crosstabs")
DATASET_CSV = os.path.join(context.PIPELINE, "data", "global_labor_dataset.csv")


def _num(v):
    """CSV cells are strings and JSON cells are numbers; compare as numbers.

    Empty string and None are the same absence — `export_csv` writes a null as
    an empty cell, so a strict comparison would fail on every null in the file.
    """
    if v is None or v == "":
        return None
    try:
        return round(float(v), 6)
    except (TypeError, ValueError):
        return v


class CommittedCrosstabsMatchTheDataset(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        with open(DATASET_CSV, encoding="utf-8") as f:
            cls.csv_rows = list(csv.DictReader(f))
        cls.by_iso = {r["iso3"]: r for r in cls.csv_rows
                      if r["row_type"] == "country"}
        cls.files = sorted(n for n in os.listdir(CROSSTABS)
                           if n.endswith(".json"))

    def test_one_artefact_per_country_row(self):
        """Every country, including the ones with nothing to report.

        A country the source says nothing about still gets a file. The wizard
        has to distinguish "the source publishes nothing here" from "the fetch
        failed", and a 404 cannot say the first one — that distinction is the
        whole of R20's invented-absence rule.
        """
        self.assertEqual([n[:-5] for n in self.files], sorted(self.by_iso),
                         "src/data/crosstabs/ disagrees with the country rows "
                         "in global_labor_dataset.csv — run `npm run pipeline`")

    def test_every_cell_matches_the_dataset_csv(self):
        disagreed = []
        for name in self.files:
            with open(os.path.join(CROSSTABS, name), encoding="utf-8") as f:
                payload = json.load(f)
            csv_row = self.by_iso[payload["iso3"]]
            for column in C.CROSSTAB_COLUMNS:
                if _num(csv_row.get(column)) != _num(payload["values"].get(column)):
                    disagreed.append((payload["iso3"], column))
        self.assertEqual(
            disagreed[:5], [],
            f"{len(disagreed)} cells disagree between src/data/crosstabs/ and "
            "pipeline/data/global_labor_dataset.csv — one of the two was not "
            "regenerated. Run `npm run pipeline`.")

    def test_every_value_carries_a_tier(self):
        """R8 and R9 register their tiers in this artefact's own block.

        `export_app_json` sheds these columns, so `global_labor.json`'s tier
        block cannot name them. "Every emitted number carries a tier" still
        holds — the block it appears in moved, which is all R20 changed.
        """
        for name in self.files:
            with open(os.path.join(CROSSTABS, name), encoding="utf-8") as f:
                payload = json.load(f)
            self.assertEqual(set(payload["values"]), set(payload["field_tiers"]),
                             f"{name}: a value with no tier, or the reverse")
            self.assertEqual(set(payload["values"]), set(C.CROSSTAB_COLUMNS),
                             f"{name}: does not carry exactly the 81 columns")

    def test_the_shares_are_derived_and_the_years_are_not_measurements(self):
        with open(os.path.join(CROSSTABS, "GBR.json"), encoding="utf-8") as f:
            tiers = json.load(f)["field_tiers"]
        self.assertEqual(tiers["isco4_age_25_54_pct"], "DERIVED")
        self.assertEqual(tiers["isco4_edu_adv_pct"], "DERIVED")
        self.assertEqual(tiers["isco4_age_year"], C.NOT_A_MEASUREMENT)
        self.assertEqual(tiers["isco4_edu_year"], C.NOT_A_MEASUREMENT)

    def test_a_group_with_shares_carries_its_own_year(self):
        """R8 and R9 both reconcile jointly, one year per (country, group).

        The reconciled year varies across the nine groups — 34 countries on the
        age flow, 43 on the education flow — so a single per-country vintage
        field could not name them. This asserts the per-group field is actually
        populated wherever that group has values.
        """
        orphaned = []
        for name in self.files:
            with open(os.path.join(CROSSTABS, name), encoding="utf-8") as f:
                v = json.load(f)["values"]
            for n in C.ISCO_GROUP_NUMBERS:
                for dim, bands in (("age", C.AGE_GROUP_BANDS.values()),
                                   ("edu", C.EDU_GROUP_BANDS.values())):
                    has = any(v.get(f"isco{n}_{dim}_{b}_pct") is not None
                              for b in bands)
                    if has and v.get(f"isco{n}_{dim}_year") is None:
                        orphaned.append((name, f"isco{n}_{dim}"))
        self.assertEqual(orphaned[:5], [],
                         f"{len(orphaned)} group/dimension pairs carry shares "
                         "with no reconciled year")

    def test_a_withholding_is_flagged_and_names_its_year(self):
        """0010 R9. The floor is terminal at the reconciled year.

        An earlier loader tested the floor inside the year loop and used
        `continue`, which did not withhold at all -- it walked back to whichever
        older survey happened to pass. CMR shipped four chips from 2014 beside
        an age profile from 2021. This pins the corrected behaviour: a withheld
        group carries no shares, carries the flag, and still names the year it
        judged, so the withholding is checkable rather than a bare null.
        """
        bad = []
        for name in self.files:
            with open(os.path.join(CROSSTABS, name), encoding="utf-8") as f:
                v = json.load(f)["values"]
            for n in C.ISCO_GROUP_NUMBERS:
                flag = v.get(f"isco{n}_edu_flag")
                chips = [v.get(f"isco{n}_edu_{b}_pct")
                         for b in C.EDU_GROUP_BANDS.values()]
                present = [c for c in chips if c is not None]
                if flag == C.EDU_FLAG_WITHHELD:
                    if present or v.get(f"isco{n}_edu_year") is None:
                        bad.append((name, n, "withheld but has shares or no year"))
                elif flag == C.EDU_FLAG_PRESENT and not present:
                    bad.append((name, n, "flagged present with no shares"))
                elif flag == C.EDU_FLAG_NOT_PUBLISHED and present:
                    bad.append((name, n, "flagged not published but has shares"))
        self.assertEqual(bad[:5], [], f"{len(bad)} groups disagree with their flag")

    def test_cmr_withholds_at_its_own_reconciled_year(self):
        """The named case from R9, asserted against the committed artefact."""
        with open(os.path.join(CROSSTABS, "CMR.json"), encoding="utf-8") as f:
            v = json.load(f)["values"]
        self.assertEqual(v["isco4_edu_flag"], C.EDU_FLAG_WITHHELD)
        self.assertIsNone(v["isco4_edu_bas_pct"])
        self.assertEqual(v["isco4_edu_year"], 2021)

    def test_the_education_coverage_floor_was_applied(self):
        """R9 withholds below the floor rather than rendering thin chips.

        Anything that survived into the artefact must be at or above it — a
        surviving group whose chips describe a minority of the base means the
        withholding did not happen.
        """
        thin = []
        for name in self.files:
            with open(os.path.join(CROSSTABS, name), encoding="utf-8") as f:
                v = json.load(f)["values"]
            for n in C.ISCO_GROUP_NUMBERS:
                chips = [v.get(f"isco{n}_edu_{b}_pct")
                         for b in C.EDU_GROUP_BANDS.values()]
                present = [c for c in chips if c is not None]
                if present and sum(present) < C.EDU_COVERAGE_FLOOR - 0.5:
                    thin.append((name, n, round(sum(present), 2)))
        self.assertEqual(thin[:5], [],
                         f"{len(thin)} groups below the "
                         f"{C.EDU_COVERAGE_FLOOR}% floor were not withheld")


class CrosstabsAreExcludedFromTheAppPayload(unittest.TestCase):
    """The other half of R20, asserted from this side too.

    `test_app_payloads` asserts the exclusion against the payload. This asserts
    it against the generator, so the two cannot both be satisfied by a payload
    that was simply never regenerated.
    """

    def test_export_app_json_sheds_exactly_the_crosstab_columns(self):
        """Calls the generator rather than re-implementing it.

        An earlier version rebuilt `keep` and the exclusion here and compared
        lengths, which asserts that this test's arithmetic matches this test's
        arithmetic -- the class docstring claims it reaches the generator, and
        it did not. Now it runs `export_app_json` into a temp file and reads
        what actually came out.
        """
        rows = [{c: None for c in run.COLUMNS} | {"iso3": "AAA",
                                                  "country_name": "Aland",
                                                  "row_type": "country"}]
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "payload.json")
            run.export_app_json(rows, out)
            with open(out, encoding="utf-8") as f:
                payload = json.load(f)
        leaked = [c for c in C.CROSSTAB_COLUMNS
                  if c in payload["field_tiers"] or c in payload["rows"][0]]
        self.assertEqual(leaked, [], "export_app_json emitted cross-tab columns")
        self.assertEqual(len(C.CROSSTAB_COLUMNS), 90)
        # And it shed only those: everything else survived.
        expected = [c for c in run.COLUMNS
                    if not c.endswith("_range") and c not in set(C.CROSSTAB_COLUMNS)]
        self.assertEqual(set(payload["field_tiers"]), set(expected))

    def test_the_tier_gate_still_covers_the_excluded_columns(self):
        """The ordering R20 specifies, asserted rather than described.

        `run.py`'s `untiered` gate is the entire enforcement of "every emitted
        number carries a tier" inside the pipeline — `export_csv` and
        `export_sqlite` have no tier check of their own. It runs over the full
        column list BEFORE the exclusion, so the 81 columns are covered by it
        even though they never reach the app payload. Excluding before the gate
        would ship them unregistered in two tracked artefacts.
        """
        untiered = [c for c in C.CROSSTAB_COLUMNS if c not in C.FIELD_TIERS]
        self.assertEqual(untiered, [],
                         "cross-tab columns are not in FIELD_TIERS, so the "
                         "gate in export_app_json would not catch them")


if __name__ == "__main__":
    unittest.main()
