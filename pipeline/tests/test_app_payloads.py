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
import io
import itertools
import json
import os
import tempfile
import unittest

import fixtures
import panel as P
import run

# Imported, not copied: one definition of "has this tree changed" for the two
# modules that need it (`test_golden_master.py:67`).
from test_golden_master import _tree_digest

APP_DATA = os.path.join(os.path.dirname(context.PIPELINE), "src", "data")
APP_JSON = os.path.join(APP_DATA, "global_labor.json")
APP_TIMESERIES = os.path.join(APP_DATA, "global_labor_timeseries.json")
DATASET_CSV = os.path.join(context.PIPELINE, "data", "global_labor_dataset.csv")
PANEL_CSV = os.path.join(context.PIPELINE, "data", "global_labor_panel.csv")


# Both trees the guards touch, not just the one holding the payloads:
# CommittedRowsMatchTheDataset reads pipeline/data/global_labor_dataset.csv and
# CommittedTimeseriesMatchesThePanel drives panel.export, which writes a real
# global_labor_panel.csv -- kept out of the tracked tree only by the `tmp`
# argument it is handed. Watching src/data/ alone would leave that unobserved.
_WATCHED = (APP_DATA, run.DATA)   # run.py:20 -- pipeline/data/

# Captured before any test in this module runs. `unittest` calls setUpModule()
# ahead of the module's first test, which is the only moment these trees are
# known not to have been touched by these guards -- see
# GuardsDoNotWriteWhatTheyCheck for why taking it inside the test is not enough.
_DIGEST_BEFORE_ANY_GUARD_RAN = None


def _tree_state(path):
    """Content digest **and** every file's mtime, because content is not enough.

    A content digest cannot see an idempotent write. Driving `panel.export` at
    `run.DATA` rewrites `global_labor_panel.csv` from rows read out of that same
    file, and the round-trip is byte-perfect today -- `_read_csv` maps `""` to
    None and the DictWriter writes None back as `""` -- so the digest is
    unchanged, `git status` is clean, and the write is invisible. Verified: the
    digest-only version of this check stayed green against exactly that.

    Its harmlessness is accidental. It holds only while the CSV round-trips
    byte-perfectly, which is a property of today's values rather than a
    guarantee -- the float-repr divergences spec 0007 catalogued are the obvious
    way to lose it. mtime sees the write itself, so the guard no longer depends
    on the write happening to be a no-op.
    """
    mtimes = {}
    for root, dirs, files in os.walk(path):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            mtimes[os.path.relpath(full, path)] = os.stat(full).st_mtime_ns
    return _tree_digest(path), mtimes


def setUpModule():
    global _DIGEST_BEFORE_ANY_GUARD_RAN
    _DIGEST_BEFORE_ANY_GUARD_RAN = [_tree_state(p) for p in _WATCHED]


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

    @classmethod
    def setUpClass(cls):
        # Per class, not per method: nothing below mutates what it reads, and
        # `setUp` here drove a generator call for every test in the class.
        cls.committed = _load(APP_JSON)
        fd, path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        try:
            with fixtures.quiet():
                # Driving the generator with no rows: the header does not depend
                # on them, so this needs no cache and no network. Same shape as
                # test_tiers.py::AppPayload.setUp, for the same reason.
                run.export_app_json([], path)
            cls.generated = _load(path)
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
        # Union over all 229 rows, not `set(rows[0])`. Against the generator one
        # row would do -- `export_app_json` builds every row from the same
        # `keep` list -- but this class opens the committed artifact, and the
        # threat model the README names is a hand-edit, which can add a key to
        # any row. Verified they agree today, so this is preventive.
        #
        # `self.committed["field_tiers"]` rather than `.get(..., {})`: a payload
        # missing the block entirely should surface through
        # test_the_committed_header_is_what_export_app_json_writes, whose
        # message carries "#57" and "run `npm run pipeline`", not through a bare
        # set comparison here.
        self.assertEqual(
            set().union(*rows), set(self.committed["field_tiers"]),
            "every field the app can render must carry a tier")


class CommittedTimeseriesMatchesThePanel(unittest.TestCase):
    """R3 -- preventive. This file has no drift; it is byte-identical today.

    Recorded as preventive on purpose: the issue listed it as unexamined, a full
    run showed it unchanged at 326,519 bytes, and a guard whose framing implies a
    second defect would misreport the state of the repo.

    **The rebuild drives `panel.export`, it does not reimplement it.** An earlier
    version assembled `fields` / `years` / `series` here by hand from
    `panel.py:163-172` -- the exact thing this module's docstring rules out for
    the header, for the exact reason it gives. Change how `panel.export` builds
    the payload (drop all-null series, key years differently, reslice
    `APP_PANEL_FIELDS`) without regenerating, and a transcribed copy still agrees
    with the committed file while both disagree with the code. Importing
    `APP_PANEL_FIELDS` would have covered the field list and not the assembly
    around it.

    Driving it also subsumes a second defect that version had: it iterated only
    the years the committed payload already carried, so a country-year *dropped
    from the payload* was never visited and every test here passed. Comparing
    two real payloads catches that in both directions, and fails with a message
    instead of raising `KeyError` on the inverse case.

    **Same caveat as R4, stated rather than left as an asymmetry.** The rows fed
    to `panel.export` come from the committed `global_labor_panel.csv`, so this
    is payload-versus-CSV on the input side: it catches a hand-edited payload and
    one not regenerated when the CSV was, and cannot catch the two being stale
    together. The assembly itself is now checked against the code.
    """

    @classmethod
    def setUpClass(cls):
        cls.committed = _load(APP_TIMESERIES)
        rows = _read_csv(PANEL_CSV)
        # `panel.export` takes both output paths, so both its writes land under
        # the temp dir -- the panel CSV included, never pipeline/data/.
        # Aggregates are passed empty because the committed CSV already holds
        # them: `export` does `panel = rows + aggregates`.
        with tempfile.TemporaryDirectory() as tmp:
            app_path = os.path.join(tmp, "timeseries.json")
            with fixtures.quiet():
                P.export(rows, [], tmp, app_path)
            cls.rebuilt = _load(app_path)

    def test_fields_match(self):
        self.assertEqual(self.committed["fields"], self.rebuilt["fields"])

    def test_years_match(self):
        self.assertEqual([int(y) for y in self.committed["years"]],
                         [int(y) for y in self.rebuilt["years"]])

    def test_every_series_key_is_present_and_no_extras(self):
        self.assertEqual(set(self.committed["series"]),
                         set(self.rebuilt["series"]))

    def test_every_cell_matches_the_panel_csv(self):
        """Whole `series` dicts, so a dropped country-year fails either way."""
        def normalise(series):
            return {iso: {year: [_num(v) for v in values]
                          for year, values in years.items()}
                    for iso, years in series.items()}

        want = normalise(self.rebuilt["series"])
        got = normalise(self.committed["series"])
        disagreed = sorted(
            (iso, year)
            for iso in set(want) | set(got)
            for year in set(want.get(iso, {})) | set(got.get(iso, {}))
            if want.get(iso, {}).get(year) != got.get(iso, {}).get(year))
        self.assertEqual(
            disagreed, [],
            "src/data/global_labor_timeseries.json disagrees with what "
            "panel.export writes from pipeline/data/global_labor_panel.csv at "
            f"{disagreed[:5]} ({len(disagreed)} cells) -- regenerate with "
            "`npm run pipeline` rather than editing either by hand.")


class CommittedRowsMatchTheDataset(unittest.TestCase):
    """R4 -- preventive. 0 of 19,236 cells disagree today.

    Payload-versus-CSV, not payload-versus-code: see the module docstring for
    what that does and does not close.
    """

    @classmethod
    def setUpClass(cls):
        cls.payload = _load(APP_JSON)
        cls.rows = cls.payload["rows"]
        cls.csv_rows = _read_csv(DATASET_CSV)
        cls.by_iso = {r["iso3"]: r for r in cls.csv_rows}

    def test_the_dataset_csv_has_no_duplicate_iso3(self):
        """Keying by `iso3` collapses a duplicate, and the set comparison in
        `test_the_same_countries_are_present` is invariant to that -- so a
        dropped row would leave the 229 x 84 comparison without failing
        anything. Clean today (229 rows, 229 unique), so preventive.

        Its own test rather than a `setUp` assertion: as the latter it failed
        every test in the class with the same message, and this way the check
        has a name worth reading in the output. `CommittedTimeseriesMatchesThePanel`
        needs no equivalent -- it drives `panel.export`, so both sides collapse a
        duplicate `(iso3, year)` identically and there is no gap between them.
        """
        self.assertEqual(len(self.csv_rows), len(self.by_iso),
                         "duplicate iso3 in global_labor_dataset.csv")

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
                # `row_type` is not asserted here -- the loop above already
                # filtered on it, so it cannot be None at this point.
                # `test_row_types_are_contiguous_and_in_the_written_order`
                # covers it for real.
                self.assertIsNotNone(row["country_name"])


class GuardsDoNotWriteWhatTheyCheck(unittest.TestCase):
    """`verify` must not republish what it verifies (`scripts/verify.sh:27-35`).

    The middle step is the whole test. An earlier version stat-ed the two
    payloads, called `json.load` on them and stat-ed again -- which asserts that
    reading a file does not change its mtime, true no matter what the guards in
    this module do. None of them ran between the two calls, so a class named for
    the guards certified nothing about them, and it was green against every
    defect it named: the same reading error this module's docstring documents
    for `test_tiers.py::AppPayload`, and the one shape not worth shipping here
    of all places.

    `test_golden_master.py:138-146` is the version with teeth and the fix is
    taken from it -- digest the tree, do the work, compare. `_tree_digest` is
    imported from there rather than copied, so the two cannot drift.

    **Both trees, not just `src/data/`.** `CommittedTimeseriesMatchesThePanel`
    drives `panel.export`, and `panel.py:154` writes
    `os.path.join(data_dir, "global_labor_panel.csv")` unconditionally -- a real
    write, four times a run, of the very CSV another guard compares against, kept
    out of the tracked tree only by the `tmp` argument it is handed. Nothing else
    would notice if that argument changed: `test_golden_master`'s own
    `run.DATA` guard takes its baseline in `GoldenMaster.setUpClass`, and
    discovery runs `test_app_payloads` first, so a write from here is already
    baked into it -- the contaminated-baseline shape above, one directory over.
    And there is no outer net: `git status --porcelain` appears nowhere in
    `scripts/verify.sh` or in CI. This class is the only thing observing R2's
    clean-tree criterion, so it has to observe all of it.

    **Content alone does not observe it.** Handing `panel.export` `run.DATA`
    instead of `tmp` rewrites the panel CSV from rows read out of that same
    file, byte for byte, so a digest sees nothing and neither does
    `git status`. The digest-only version of this check was green against that
    exact probe. `_tree_state` therefore carries mtimes as well -- see its
    docstring for why the write being a harmless no-op today is not something to
    rely on.
    """

    def test_running_every_guard_leaves_src_data_byte_identical(self):
        # The baseline comes from setUpModule, not from here. Alphabetical
        # ordering runs all three guard classes before this one, so a digest
        # taken at this point has already absorbed whatever they wrote on the
        # outer pass: a guard writing a deterministic file would be baked into
        # the baseline, the nested run would recreate it identically, and this
        # would pass. Found by probe, not by reasoning -- an earlier version
        # took the digest here and stayed green while a guard's setUp created a
        # file under src/data/ on every run.
        before = _DIGEST_BEFORE_ANY_GUARD_RAN
        self.assertIsNotNone(before, "setUpModule did not run")
        self.assertEqual(
            [_tree_state(p) for p in _WATCHED], before,
            f"a guard wrote to one of {_WATCHED} during the normal pass")

        # The three classes are named explicitly rather than discovered: this
        # class lives in the same module, so loading the module's tests would
        # re-enter here and recurse.
        suite = unittest.TestSuite()
        load = unittest.TestLoader().loadTestsFromTestCase
        for case in (CommittedHeaderMatchesTheGenerator,
                     CommittedTimeseriesMatchesThePanel,
                     CommittedRowsMatchTheDataset):
            suite.addTests(load(case))
        result = unittest.TextTestRunner(stream=io.StringIO(),
                                         verbosity=0).run(suite)

        self.assertTrue(
            result.wasSuccessful(),
            "the guards must pass before their write behaviour means anything")
        self.assertEqual(
            [_tree_state(p) for p in _WATCHED], before,
            f"running the payload guards modified one of {_WATCHED}. A guard "
            "that rewrites the artifact it checks passes unconditionally and "
            "leaves CI with a dirty tree. Nothing else observes this: "
            "test_golden_master's run.DATA baseline is captured after this "
            "module has already run, and no git status --porcelain exists in "
            "verify.sh or CI.")


if __name__ == "__main__":
    unittest.main()
