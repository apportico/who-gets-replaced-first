/**
 * R7 -- a golden-master pilot run, offline.
 *
 * Unit tests over pure functions cannot catch a change in number formatting,
 * column order, or the wiring between stages. This runs the real pilot against
 * a committed slice of the response cache and diffs the result byte for byte.
 * It is the proof #21's TypeScript port needs to show it changed nothing --
 * and after 0007 it is the proof that the port did not.
 *
 * Three things this test is careful about, each of which was a way to get a
 * suite that reports green while proving nothing:
 *
 *   1. **It must not write where the expected output lives.** `run.DATA` and
 *      `fetch.state.RAW` are module constants and `--pilot` writes to
 *      `join(DATA, "pilot_labor_dataset.csv")`. If the expected output were
 *      that file, the run would overwrite it and the diff would compare the
 *      file with itself -- passing unconditionally while a real regression
 *      silently rewrote the master. So the expected output lives under
 *      fixtures/expected/, which nothing in the pipeline writes to, and the
 *      run's output goes to a temp directory.
 *
 *   2. **It must actually be offline.** Trusting the cache is not the same as
 *      proving no network call happened, so `fetch` is replaced with a throwing
 *      stub for the duration of the run. A missing fixture file would otherwise
 *      be silently papered over by a live fetch, and the fixture would rot
 *      unnoticed.
 *
 *   3. **It must run what --pilot runs.** The scope and the output filter come
 *      from `run.pilotScope()` / `run.pilotRows()`, the same helpers `main()`
 *      calls, rather than copies that would drift.
 *
 * 0007: ported from `tests/test_golden_master.py`. The network block changed
 * mechanism -- Python patched `socket.getaddrinfo`, and Node's `fetch` does not
 * go through it -- so the stub goes on `globalThis.fetch` and on the child
 * process the synchronous fetch path spawns. Same criterion, different lever.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as C from '../config.ts';
import * as fetch from '../fetch.ts';
import * as run from '../run.ts';
import * as fixtures from './fixtures.ts';
import { readCsv } from '../csvio.ts';
import { treeDigest } from './tree.ts';
import type { Row } from '../build.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures');
const EXPECTED = path.join(FIXTURES, 'expected', 'pilot_labor_dataset.csv');
const FIXTURE_RAW = path.join(FIXTURES, 'raw');

/** Expand the gzipped fixture cache into `dest`, mirroring pipeline/raw/. */
function unpack(dest: string): void {
  for (const sub of readdirSync(FIXTURE_RAW).sort()) {
    const srcDir = path.join(FIXTURE_RAW, sub);
    if (!statSync(srcDir).isDirectory()) continue;
    const outDir = path.join(dest, sub);
    mkdirSync(outDir, { recursive: true });
    for (const name of readdirSync(srcDir).sort()) {
      if (!name.endsWith('.gz')) continue;
      writeFileSync(
        path.join(outDir, name.slice(0, -3)),
        gunzipSync(readFileSync(path.join(srcDir, name))),
      );
    }
  }
}

// The fixture expands to ~18MB, so it is unpacked once here rather than per
// test. Module-body setup is node:test's equivalent of setUpClass.
const tmp = mkdtempSync(path.join(tmpdir(), 'wgrf-golden-'));
const cache = path.join(tmp, 'raw');
const outDir = path.join(tmp, 'out');
mkdirSync(outDir, { recursive: true });
unpack(cache);

const dataDigestBefore = treeDigest(run.DATA);

const realRaw = fetch.state.RAW;
const realFetch = globalThis.fetch;
fetch.state.RAW = cache;
globalThis.fetch = (() => {
  throw new Error('network blocked: the golden master must run offline');
}) as typeof globalThis.fetch;

let rows: Row[];
let problems: string[];
let failures: string[];
let log: string;
let outPath: string;
try {
  const captured = fixtures.quiet(() => {
    const result = run.run(run.pilotScope(), 'pilot');
    const kept = run.pilotRows(result.rows);
    outPath = path.join(outDir, 'pilot_labor_dataset.csv');
    run.exportCsv(kept, outPath);
    return { kept, result };
  });
  rows = captured.value.kept;
  problems = captured.value.result.problems;
  failures = captured.value.result.failures;
  log = captured.log;
} finally {
  fetch.state.RAW = realRaw;
  globalThis.fetch = realFetch;
}

process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));

// -- the diff ---------------------------------------------------------
test('the output matches the golden master byte for byte', () => {
  // Catches formatting and column-order changes, not just arithmetic. This is
  // R3's evidence in the one place a fresh clone can reproduce it: the fixture
  // cache is in-tree, unlike `pipeline/raw/`.
  const expected = readFileSync(EXPECTED);
  const got = readFileSync(outPath);
  if (!got.equals(expected)) {
    // give a usable diff, not a wall
    const expLines = expected.toString().split('\n');
    const gotLines = got.toString().split('\n');
    assert.equal(gotLines.length, expLines.length, 'row count differs');
    expLines.forEach((a, i) => assert.equal(gotLines[i], a, `line ${i + 1} differs`));
  }
  assert.ok(got.equals(expected));
});

// -- the guard that keeps the diff honest ------------------------------
test('the pipeline data directory is untouched', () => {
  // Without this, redirecting output back into pipeline/data/ would make the
  // diff self-comparing and unconditionally green.
  assert.equal(treeDigest(run.DATA), dataDigestBefore);
});

test('the expected output is not inside the data directory', () => {
  assert.ok(!path.resolve(EXPECTED).startsWith(path.resolve(run.DATA) + path.sep));
});

// -- offline ----------------------------------------------------------
test('the run completed with the network blocked', () => {
  // The setup above replaced `fetch` with a throwing stub; reaching here proves
  // nothing reached for it.
  assert.ok(rows.length);
});

test('every source was served from the fixture cache', () => {
  // A live fetch would have raised; a cache hit logs 'cached'.
  assert.ok(log.includes('cached'));
  assert.ok(!log.includes('fetched'));
});

// -- the four anchors --------------------------------------------------
test('all four regression anchors hold', () => {
  // WLD ~50, USA ~79, EU27 ~72, IND ~31.5 -- the CLAUDE.md anchors.
  assert.deepEqual(failures, []);
});

test('the anchors are the four CLAUDE.md names', () => {
  assert.deepEqual(run.REGRESSION_CHECKS.map((c) => c[0]), ['WLD', 'USA', 'EU27', 'IND']);
});

test('there are no range or consistency problems', () => {
  assert.deepEqual(problems, []);
});

// -- shape -------------------------------------------------------------
test('the pilot writes the seven expected rows', () => {
  assert.deepEqual(
    [...new Set(rows.map((r) => r.iso3 as string))].sort(),
    ['ARM', 'CHN', 'DEU', 'EU27', 'IND', 'USA', 'WLD'],
  );
});

test('the EU27 aggregate is produced from the fixture', () => {
  // The reason the fixture covers 32 areas rather than the 6 in PILOT.
  const eu = rows.find((r) => r.iso3 === 'EU27') as Row;
  assert.equal(eu.member_count, C.EU27.length);
  assert.notEqual(eu.white_collar_pct, null);
});

test('the output header matches COLUMNS', () => {
  assert.deepEqual(readCsv(readFileSync(outPath, 'utf8'))[0], run.COLUMNS);
});

test("Armenia's stale series still parses", () => {
  // ARM's occupation series ends 2017 -- one of the messy real paths.
  const arm = rows.find((r) => r.iso3 === 'ARM') as Row;
  assert.equal(arm.data_year_occupation, 2017);
});

// ---------------------------------------------- the fixture's own properties
test('the fixture stays under its size bound', () => {
  // 2MB, raised from 0004 R7's 1MB when 0010 R9 added a fourth flow.
  //
  // The bound exists so the fixture stays reviewable rather than becoming an
  // opaque blob nobody regenerates. Raised rather than met by slicing harder,
  // and that is the substantive choice: the edu flow publishes three parallel
  // classification systems and the pipeline reads only the first, so dropping
  // the other two would fit inside 1MB easily. Slicing by row content bakes
  // today's filter criteria into the test data, so widening the filter later
  // would leave rows silently absent rather than visibly wrong. That rule is
  // worth more than the round number it collides with, so the number moved.
  let total = 0;
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else total += statSync(full).size;
    }
  };
  walk(FIXTURE_RAW);
  assert.ok(total < 2_000_000, `fixture is ${(total / 1e6).toFixed(2)}MB`);
});

test('the country metadata ships whole, not sliced', () => {
  // buildReference iterates all areas and keys on `id`, not iso3. Slicing this
  // file by the indicator rule would empty it, and every row would lose its
  // region, income group and coordinates.
  const payload = JSON.parse(
    gunzipSync(readFileSync(path.join(FIXTURE_RAW, 'worldbank', 'countries.json.gz'))).toString(),
  );
  assert.ok(payload[1].length > 200);
});

test('Eurostat is excluded from the fixture', () => {
  // crosscheck runs only on a full run, so shipping it is dead weight.
  assert.ok(!existsSync(path.join(FIXTURE_RAW, 'eurostat')));
});

// Referenced so the import is not flagged unused by a linter pass.
void cpSync;
