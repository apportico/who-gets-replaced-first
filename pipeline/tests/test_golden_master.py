"""R7 -- a golden-master pilot run, offline.

Unit tests over pure functions cannot catch a change in number formatting,
column order, or the wiring between stages. This runs the real pilot against a
committed slice of the response cache and diffs the result byte for byte. It is
the proof #21's TypeScript port needs to show it changed nothing.

Three things this test is careful about, each of which was a way to get a suite
that reports green while proving nothing:

  1. **It must not write where the expected output lives.** `run.DATA` and
     `fetch.RAW` are module constants and `--pilot` writes to
     os.path.join(DATA, "pilot_labor_dataset.csv"). If the expected output were
     that file, the run would overwrite it and the diff would compare the file
     with itself -- passing unconditionally while a real regression silently
     rewrote the master. So the expected output lives under fixtures/expected/,
     which nothing in the pipeline writes to, and the run's output goes to a
     temp directory. test_pipeline_data_directory_is_untouched enforces it.

  2. **It must actually be offline.** Trusting the cache is not the same as
     proving no network call happened, so getaddrinfo is patched to raise for
     the duration of the run. A missing fixture file would otherwise be silently
     papered over by a live fetch, and the fixture would rot unnoticed.

  3. **It must run what --pilot runs.** The scope and the output filter come
     from run.pilot_scope() / run.pilot_rows(), the same helpers main() calls,
     rather than copies that would drift.

The fixture expands to ~18MB, so it is unpacked once in setUpClass rather than
per test method.
"""
import context  # noqa: F401
import csv
import gzip
import hashlib
import os
import shutil
import socket
import tempfile
import unittest

import config as C
import fetch
import fixtures
import run

EXPECTED = os.path.join(context.FIXTURES, "expected", "pilot_labor_dataset.csv")
FIXTURE_RAW = os.path.join(context.FIXTURES, "raw")


def _unpack(dest):
    """Expand the gzipped fixture cache into `dest`, mirroring pipeline/raw/."""
    for sub in sorted(os.listdir(FIXTURE_RAW)):
        src_dir = os.path.join(FIXTURE_RAW, sub)
        if not os.path.isdir(src_dir):
            continue
        out_dir = os.path.join(dest, sub)
        os.makedirs(out_dir, exist_ok=True)
        for name in sorted(os.listdir(src_dir)):
            if not name.endswith(".gz"):
                continue
            with gzip.open(os.path.join(src_dir, name), "rb") as g, \
                    open(os.path.join(out_dir, name[:-3]), "wb") as f:
                shutil.copyfileobj(g, f)


def _tree_digest(path):
    """Content hash of every file under `path`, so a rewrite is detectable."""
    h = hashlib.sha256()
    for root, dirs, files in os.walk(path):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            h.update(os.path.relpath(full, path).encode())
            with open(full, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
    return h.hexdigest()


@unittest.skipUnless(os.path.isdir(FIXTURE_RAW),
                     "fixture cache absent -- run pipeline/tests/make_fixture.py")
class GoldenMaster(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cache = os.path.join(cls._tmp.name, "raw")
        cls.out_dir = os.path.join(cls._tmp.name, "out")
        os.makedirs(cls.out_dir, exist_ok=True)
        _unpack(cache)

        cls.data_digest_before = _tree_digest(run.DATA)

        real_raw, real_getaddrinfo = fetch.RAW, socket.getaddrinfo
        fetch.RAW = cache

        def blocked(*a, **k):
            raise OSError("network blocked: the golden master must run offline")

        socket.getaddrinfo = blocked
        try:
            with fixtures.quiet() as log:
                rows, problems, _, _, failures = run.run(run.pilot_scope(), "pilot")
                rows = run.pilot_rows(rows)
                cls.out_path = os.path.join(cls.out_dir,
                                            "pilot_labor_dataset.csv")
                run.export_csv(rows, cls.out_path)
        finally:
            fetch.RAW = real_raw
            socket.getaddrinfo = real_getaddrinfo

        cls.rows = rows
        cls.problems = problems
        cls.failures = failures
        cls.log = log.getvalue()

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    # -- the diff ---------------------------------------------------------
    def test_output_matches_the_golden_master_byte_for_byte(self):
        """Catches formatting and column-order changes, not just arithmetic."""
        with open(EXPECTED, "rb") as f:
            expected = f.read()
        with open(self.out_path, "rb") as f:
            got = f.read()

        if got != expected:                     # give a usable diff, not a wall
            exp_lines = expected.decode().splitlines()
            got_lines = got.decode().splitlines()
            self.assertEqual(len(got_lines), len(exp_lines), "row count differs")
            for i, (a, b) in enumerate(zip(exp_lines, got_lines)):
                self.assertEqual(b, a, f"line {i + 1} differs")
        self.assertEqual(got, expected)

    # -- the guard that keeps the diff honest ------------------------------
    def test_pipeline_data_directory_is_untouched(self):
        """The run must not write where the golden master is compared from.

        Without this, redirecting output back into pipeline/data/ would make
        the diff self-comparing and unconditionally green.
        """
        self.assertEqual(_tree_digest(run.DATA), self.data_digest_before)

    def test_expected_output_is_not_inside_the_data_directory(self):
        self.assertFalse(
            os.path.abspath(EXPECTED).startswith(os.path.abspath(run.DATA) + os.sep))

    # -- offline ----------------------------------------------------------
    def test_run_completed_with_the_network_blocked(self):
        """setUpClass patched getaddrinfo to raise; reaching here proves it."""
        self.assertTrue(self.rows)

    def test_every_source_was_served_from_the_fixture_cache(self):
        """A live fetch would have raised; a cache hit logs 'cached'."""
        self.assertIn("cached", self.log)
        self.assertNotIn("fetched", self.log)

    # -- the four anchors --------------------------------------------------
    def test_all_four_regression_anchors_hold(self):
        """WLD ~50, USA ~79, EU27 ~72, IND ~31.5 -- the CLAUDE.md anchors."""
        self.assertEqual(self.failures, [])

    def test_the_anchors_are_the_four_claude_md_names(self):
        self.assertEqual([c[0] for c in run.REGRESSION_CHECKS],
                         ["WLD", "USA", "EU27", "IND"])

    def test_no_range_or_consistency_problems(self):
        self.assertEqual(self.problems, [])

    # -- shape -------------------------------------------------------------
    def test_pilot_writes_the_seven_expected_rows(self):
        self.assertEqual({r["iso3"] for r in self.rows},
                         {"WLD", "EU27", "ARM", "CHN", "DEU", "IND", "USA"})

    def test_eu27_aggregate_is_produced_from_the_fixture(self):
        """The reason the fixture covers 32 areas rather than the 6 in PILOT."""
        eu = next(r for r in self.rows if r["iso3"] == "EU27")
        self.assertEqual(eu["member_count"], len(C.EU27))
        self.assertIsNotNone(eu["white_collar_pct"])

    def test_output_header_matches_columns(self):
        with open(self.out_path, newline="", encoding="utf-8") as f:
            self.assertEqual(next(csv.reader(f)), list(run.COLUMNS))

    def test_armenias_stale_series_still_parses(self):
        """ARM's occupation series ends 2017 -- one of the messy real paths."""
        arm = next(r for r in self.rows if r["iso3"] == "ARM")
        self.assertEqual(arm["data_year_occupation"], 2017)


@unittest.skipUnless(os.path.isdir(FIXTURE_RAW), "fixture cache absent")
class FixtureShape(unittest.TestCase):
    """The fixture itself has properties worth pinning."""

    def test_fixture_stays_under_the_one_megabyte_bound(self):
        total = sum(
            os.path.getsize(os.path.join(root, n))
            for root, _, files in os.walk(FIXTURE_RAW) for n in files)
        self.assertLess(total, 1_000_000, f"fixture is {total / 1e6:.2f}MB")

    def test_country_metadata_ships_whole_not_sliced(self):
        """build_reference iterates all areas and keys on `id`, not iso3.

        Slicing this file by the indicator rule would empty it, and every row
        would lose its region, income group and coordinates.
        """
        path = os.path.join(FIXTURE_RAW, "worldbank", "countries.json.gz")
        with gzip.open(path, "rt", encoding="utf-8") as f:
            import json
            payload = json.load(f)
        self.assertGreater(len(payload[1]), 200)

    def test_eurostat_is_excluded(self):
        """crosscheck runs only on a full run, so shipping it is dead weight."""
        self.assertFalse(os.path.isdir(os.path.join(FIXTURE_RAW, "eurostat")))


if __name__ == "__main__":
    unittest.main()
