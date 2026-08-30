"""0009 -- the two app payloads cannot drift from the code that writes them.

`src/data/global_labor.json` is what the React page imports. It had never been
regenerated since the initial commit, so it did not carry the `field_tiers`
block `run.export_app_json` writes (#57) -- the tier map `CLAUDE.md` requires
every number to carry "in the data, the docs, and the UI".

The reason that survived is the point of this module. The project already
believed it was guarded: `test_tiers.py::AppPayload` asserts `field_tiers` is
present, complete and correctly valued, six times over -- and all six passed
against a committed file with no `field_tiers` key at all, because `setUp`
regenerates a payload from two fixture rows into a temp file and asserts on
that. No test in the suite opened the artifact. The suite was green against
precisely the defect it appeared to cover, which is the same failure
`test_report.py` records for #54.

So every check here opens a **committed file** and compares it to something
rebuilt from the code, and each was verified by reintroducing the defect it
names rather than by inspection:

  - R2 header vs. `export_app_json([], tmp)`   -- corrective for `field_tiers`
  - R3 timeseries vs. `global_labor_panel.csv` -- preventive, no drift today
  - R4 rows vs. `global_labor_dataset.csv`     -- preventive, 0 cells disagree

Two design decisions are requirements rather than implementation details.

**The expected header is driven, never rebuilt.** Only two of the four
non-`rows` keys come from constants: `field_tiers` from `run.COLUMNS` +
`config.FIELD_TIERS`, and `ai_exposure_weights` from `run.load_weights()`.
`generated_from` and `sources` are literals inside `export_app_json` with no
module-level constant, so an ingredient list would force transcribing the
`sources` dict into this file -- a third witness that goes stale silently, since
editing the literal in `run.py` would leave that copy agreeing with the
committed payload while both disagree with the code. Calling the generator
transcribes nothing and covers all four keys at once.

**The rows are compared by value, not byte-for-byte.** A CSV round-trip returns
13,096 of the cells as strings, and the payload's row order is not
reconstructible from any in-tree file -- `export_csv` sorts, `export_app_json`
does not. Byte identity is spec 0007's, against a full run. R4 closes the
payload-versus-CSV gap only: it catches a hand-edited payload and one not
regenerated when the CSV was, and it cannot catch the two being stale together,
because the CSV's own values have no in-tree guard (`test_golden_master.py`
diffs the 7-row pilot output; `test_columns.py` asserts on headers alone).

Everything here is offline and unconditional -- no `pipeline/raw/`, no network,
nothing written outside a temp path -- so it runs in a fresh clone and in CI,
unlike the pilot `verify` skips when the cache is absent.
"""
import context  # noqa: F401
import csv
import itertools
import json
import os
import tempfile
import unittest
from collections import defaultdict

import fixtures
import panel as P
import run

APP_JSON = os.path.join(os.path.dirname(context.PIPELINE),
                        "src", "data", "global_labor.json")
APP_TIMESERIES = os.path.join(os.path.dirname(context.PIPELINE),
                              "src", "data", "global_labor_timeseries.json")
DATASET_CSV = os.path.join(context.PIPELINE, "data", "global_labor_dataset.csv")
PANEL_CSV = os.path.join(context.PIPELINE, "data", "global_labor_panel.csv")


def _load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _read_csv(path):
    """Committed CSV as row dicts, with `""` read back as None.

    The same mapping `report.load()` applies. It does not coerce numeric types,
    which is why the comparisons below normalise rather than assert equality on
    the raw values.
    """
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    for row in rows:
        for key, value in row.items():
            if value == "":
                row[key] = None
    return rows


def _num(value):
    """Compare 79, 79.0 and "79.0" as equal; leave everything else alone.

    The payload holds real ints, floats and nulls; the CSV holds their string
    repr. Without this the comparison reports all 19,236 cells as different and
    proves nothing.
    """
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return value


class CommittedHeaderMatchesTheGenerator(unittest.TestCase):
    """R2 -- the committed payload's non-`rows` header is what the code writes.

    This is the check that was missing. It opens the artifact, unlike the six
    `AppPayload` tests in `test_tiers.py`, which regenerate one.
    """

    def setUp(self):
        self.committed = _load(APP_JSON)
        fd, path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        try:
            with fixtures.quiet():
                # Driving the generator with no rows: the header does not depend
                # on them, so this needs no cache and no network. Same shape as
                # test_tiers.py::AppPayload.setUp, for the same reason.
                run.export_app_json([], path)
            self.generated = _load(path)
        finally:
            os.unlink(path)

    def _header(self, payload):
        return {k: v for k, v in payload.items() if k != "rows"}

    def test_the_committed_header_is_what_export_app_json_writes(self):
        """Fails on #57, and on any later edit to the generator's header.

        Named keys in the message rather than a bare dict diff: the failure a
        contributor sees has to say what to do, and the answer is always
        `npm run pipeline`.
        """
        want = self._header(self.generated)
        got = self._header(self.committed)
        missing = sorted(set(want) - set(got))
        extra = sorted(set(got) - set(want))
        changed = sorted(k for k in set(want) & set(got) if want[k] != got[k])
        self.assertEqual(
            (missing, extra, changed), ([], [], []),
            "src/data/global_labor.json disagrees with run.export_app_json -- "
            f"missing={missing} unexpected={extra} changed={changed}. "
            "The committed payload was not regenerated after the generator "
            "changed; run `npm run pipeline`. A missing `field_tiers` is #57, "
            "the tier map the app is meant to receive.")

    def test_field_tiers_covers_every_key_a_row_ships(self):
        """A column added to COLUMNS without a regeneration fails here.

        Otherwise the app receives a field it cannot label, which is the same
        blur between measured and constructed the tier map exists to prevent.
        """
        rows = self.committed["rows"]
        self.assertTrue(rows, "the committed payload has no rows")
        self.assertEqual(
            set(rows[0]), set(self.committed.get("field_tiers", {})),
            "every field the app can render must carry a tier")


class CommittedTimeseriesMatchesThePanel(unittest.TestCase):
    """R3 -- preventive. This file has no drift; it is byte-identical today.

    Recorded as preventive on purpose: the issue listed it as unexamined, a
    full run showed it unchanged at 326,519 bytes, and a guard whose framing
    implies a second defect would misreport the state of the repo.
    """

    def setUp(self):
        self.committed = _load(APP_TIMESERIES)
        rows = _read_csv(PANEL_CSV)
        series = defaultdict(dict)
        for row in rows:
            series[row["iso3"]][row["year"]] = [row.get(k)
                                                for k in P.APP_PANEL_FIELDS[2:]]
        self.rebuilt = {
            "fields": P.APP_PANEL_FIELDS[2:],
            "years": sorted({row["year"] for row in rows}),
            "series": {iso: {str(year): values
                             for year, values in sorted(vals.items())}
                       for iso, vals in series.items()},
        }

    def test_fields_match(self):
        self.assertEqual(self.committed["fields"], self.rebuilt["fields"])

    def test_years_match(self):
        self.assertEqual([int(y) for y in self.committed["years"]],
                         [int(y) for y in self.rebuilt["years"]])

    def test_every_series_key_is_present_and_no_extras(self):
        self.assertEqual(set(self.committed["series"]),
                         set(self.rebuilt["series"]))

    def test_every_cell_matches_the_panel_csv(self):
        disagreed = []
        for iso, years in self.committed["series"].items():
            for year, values in years.items():
                want = [_num(v) for v in self.rebuilt["series"][iso][year]]
                got = [_num(v) for v in values]
                if want != got:
                    disagreed.append((iso, year))
        self.assertEqual(
            disagreed, [],
            "src/data/global_labor_timeseries.json disagrees with "
            "pipeline/data/global_labor_panel.csv at "
            f"{disagreed[:5]} ({len(disagreed)} cells) -- regenerate with "
            "`npm run pipeline` rather than editing either by hand.")


class CommittedRowsMatchTheDataset(unittest.TestCase):
    """R4 -- preventive. 0 of 19,236 cells disagree today.

    Payload-versus-CSV, not payload-versus-code: see the module docstring for
    what that does and does not close.
    """

    def setUp(self):
        self.payload = _load(APP_JSON)
        self.rows = self.payload["rows"]
        self.by_iso = {r["iso3"]: r for r in _read_csv(DATASET_CSV)}

    def test_the_same_countries_are_present(self):
        self.assertEqual({r["iso3"] for r in self.rows}, set(self.by_iso))

    def test_every_cell_matches_the_dataset_csv(self):
        """Keyed by iso3, because the two files are in different orders.

        `export_csv` sorts aggregates first then by iso3; `export_app_json` does
        not sort at all. Comparing positionally would fail on correct data.
        """
        keep = [c for c in run.COLUMNS if not c.endswith("_range")]
        disagreed = []
        for row in self.rows:
            csv_row = self.by_iso[row["iso3"]]
            for column in keep:
                if _num(csv_row.get(column)) != _num(row.get(column)):
                    disagreed.append((row["iso3"], column))
        self.assertEqual(
            disagreed, [],
            "src/data/global_labor.json disagrees with "
            "pipeline/data/global_labor_dataset.csv at "
            f"{disagreed[:5]} ({len(disagreed)} cells) -- one of the two was "
            "not regenerated. Run `npm run pipeline`.")

    def test_row_types_are_contiguous_and_in_the_written_order(self):
        """218 countries, then WLD, 7 regions, 3 groups.

        Order is not reconstructible from any in-tree file, so it is asserted
        structurally rather than compared. `itertools.groupby` collapses only
        adjacent runs, so a country row appearing after the aggregates fails.
        """
        runs = [(kind, len(list(group)))
                for kind, group in itertools.groupby(r["row_type"]
                                                     for r in self.rows)]
        self.assertEqual(runs, [("country", 218), ("world", 1),
                                ("region", 7), ("group", 3)])

    def test_country_rows_carry_the_pair_corridorstates_keys_on(self):
        """`src/utils/corridorStates.js:42` maps board names to iso3 with these.

        The payload has two consumers, not one. A null `country_name` on a
        country row would silently drop that country from the corridor overlay
        rather than raise, so it is asserted here.
        """
        for row in self.rows:
            if row["row_type"] != "country":
                continue
            with self.subTest(iso3=row["iso3"]):
                self.assertIsNotNone(row["country_name"])
                self.assertIsNotNone(row["row_type"])


class GuardsAreReadOnly(unittest.TestCase):
    """`verify` must not republish what it verifies (`scripts/verify.sh:27-35`).

    Asserted rather than assumed: a guard that rewrote the artifact it checks
    would pass unconditionally and leave CI with a dirty tree -- the golden
    master's first recorded near-miss, in `test_golden_master.py`'s docstring.
    """

    def test_the_committed_payloads_are_opened_read_only(self):
        before = [os.path.getmtime(p) for p in (APP_JSON, APP_TIMESERIES)]
        _load(APP_JSON)
        _load(APP_TIMESERIES)
        self.assertEqual(before,
                         [os.path.getmtime(p) for p in (APP_JSON, APP_TIMESERIES)])


if __name__ == "__main__":
    unittest.main()
