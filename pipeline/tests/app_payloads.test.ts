/**
 * 0009 -- the two app payloads cannot drift from the code that writes them.
 *
 * `src/data/global_labor.json` is what the React page imports. It had never
 * been regenerated since the initial commit, so it did not carry the
 * `field_tiers` block the generator writes (#57) -- the tier map CLAUDE.md
 * requires every number to carry "in the data, the docs, and the UI".
 *
 * The reason that survived is the point of this module. The project already
 * believed it was guarded: `tiers.test.ts` asserts `field_tiers` is present,
 * complete and correctly valued, six times over -- and all six passed against a
 * committed file with no `field_tiers` key at all, because they regenerate a
 * payload from two fixture rows into a temp file and assert on that. No test in
 * the suite opened the artifact. The suite was green against precisely the
 * defect it appeared to cover.
 *
 * So every check here opens a **committed file** and compares it to something
 * rebuilt from the code:
 *
 *   - R2 header vs. `exportAppJson([], tmp)`     -- corrective for field_tiers
 *   - R3 timeseries vs. `global_labor_panel.csv` -- preventive
 *   - R4 rows vs. `global_labor_dataset.csv`     -- preventive
 *
 * **The expected header is driven, never rebuilt.** Only two of the four
 * non-`rows` keys come from constants. `generated_from` and `sources` are
 * literals inside `exportAppJson`, so an ingredient list would force
 * transcribing the `sources` object into this file -- a third witness that goes
 * stale silently. Calling the generator transcribes nothing.
 *
 * **The rows are compared by value, not byte-for-byte.** Byte identity is spec
 * 0007's own, against a full run; this closes the payload-versus-CSV gap only.
 *
 * 0007: ported from `tests/test_app_payloads.py`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as C from '../config.ts';
import * as P from '../panel.ts';
import * as run from '../run.ts';
import * as fixtures from './fixtures.ts';
import { readCsvDict } from '../csvio.ts';
import { treeState } from './tree.ts';
import type { ReportRow } from '../report.ts';

const PIPELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DATA = path.join(path.dirname(PIPELINE), 'src', 'data');
const APP_JSON = path.join(APP_DATA, 'global_labor.json');
const APP_TIMESERIES = path.join(APP_DATA, 'global_labor_timeseries.json');
const DATASET_CSV = path.join(PIPELINE, 'data', 'global_labor_dataset.csv');
const PANEL_CSV = path.join(PIPELINE, 'data', 'global_labor_panel.csv');

// Both trees the guards touch, not just the one holding the payloads: the
// dataset guard reads pipeline/data/global_labor_dataset.csv and the timeseries
// guard drives panel.exportPanel, which writes a real global_labor_panel.csv --
// kept out of the tracked tree only by the `tmp` argument it is handed.
const WATCHED = [APP_DATA, run.DATA];

// Captured HERE, at the top of the module body, before any guard below has run.
// Taking it inside the final test is not enough: the guards run first, so a
// guard writing a deterministic file would already be baked into the baseline
// and the check would pass against the very defect it names.
const STATE_BEFORE_ANY_GUARD_RAN = WATCHED.map(treeState);

const loadJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

/** Committed CSV as row objects, with `""` read back as null. */
function readCsvRows(p: string): ReportRow[] {
  return readCsvDict(readFileSync(p, 'utf8')).map((row) => {
    const out: ReportRow = {};
    for (const [k, v] of Object.entries(row)) out[k] = v === '' ? null : v;
    return out;
  });
}

/**
 * Compare 79, 79.0 and "79.0" as equal; leave everything else alone.
 *
 * The payload holds real ints, floats and nulls; the CSV holds their string
 * repr. Without this the comparison reports all 19,236 cells as different and
 * proves nothing.
 */
function n(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const x = Number(value);
  return Number.isNaN(x) || value === '' ? value : x;
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(tmpdir(), 'wgrf-payload-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// -------------------- R2. the committed header is what the generator writes
function generatedHeader() {
  return withTempDir((dir) => {
    const p = path.join(dir, 'payload.json');
    // Driving the generator with no rows: the header does not depend on them,
    // so this needs no cache and no network.
    fixtures.quiet(() => run.exportAppJson([], p));
    return loadJson(p);
  });
}

const stripRows = (payload: Record<string, unknown>) => {
  const { rows: _rows, ...rest } = payload;
  return rest;
};

/**
 * Fails on #57, and on any later edit to the generator's header.
 *
 * Named keys in the message rather than a bare object diff: the failure a
 * contributor sees has to say what to do, and the answer is always
 * `npm run pipeline`.
 */
function checkHeaderMatchesGenerator(): void {
  const want = stripRows(generatedHeader());
  const got = stripRows(loadJson(APP_JSON));
  const missing = Object.keys(want).filter((k) => !(k in got)).sort();
  const extra = Object.keys(got).filter((k) => !(k in want)).sort();
  const changed = Object.keys(want)
    .filter((k) => k in got && JSON.stringify(want[k]) !== JSON.stringify(got[k]))
    .sort();
  assert.deepEqual(
    [missing, extra, changed],
    [[], [], []],
    'src/data/global_labor.json disagrees with run.exportAppJson -- ' +
      `missing=${missing} unexpected=${extra} changed=${changed}. ` +
      'The committed payload was not regenerated after the generator changed; ' +
      'run `npm run pipeline`. A missing `field_tiers` is #57, the tier map ' +
      'the app is meant to receive.',
  );
}

/**
 * A column added to COLUMNS without a regeneration fails here.
 *
 * Otherwise the app receives a field it cannot label, which is the same blur
 * between measured and constructed the tier map exists to prevent.
 */
function checkFieldTiersCoverEveryRowKey(): void {
  const committed = loadJson(APP_JSON);
  const rows = committed.rows as Record<string, unknown>[];
  assert.ok(rows.length, 'the committed payload has no rows');
  // Union over all 229 rows, not rows[0]: against the generator one row would
  // do, but this opens the committed artifact, and the threat model is a
  // hand-edit, which can add a key to any row.
  const union = new Set(rows.flatMap((r) => Object.keys(r)));
  assert.deepEqual(
    [...union].sort(),
    Object.keys(committed.field_tiers).sort(),
    'every field the app can render must carry a tier',
  );
}

test('R2: the committed header is what exportAppJson writes', checkHeaderMatchesGenerator);
test('R2: field_tiers covers every key a row ships', checkFieldTiersCoverEveryRowKey);

// -------------------- R3. the committed timeseries matches the panel CSV
/**
 * Preventive. This file has no drift; it is byte-identical today.
 *
 * **The rebuild drives `panel.exportPanel`, it does not reimplement it.**
 * Assembling `fields` / `years` / `series` by hand here is the exact thing this
 * module's docstring rules out for the header, for the exact reason it gives:
 * change how the payload is built without regenerating, and a transcribed copy
 * still agrees with the committed file while both disagree with the code.
 */
function rebuiltTimeseries() {
  const rows = readCsvRows(PANEL_CSV) as unknown as Parameters<typeof P.exportPanel>[0];
  return withTempDir((dir) => {
    const appPath = path.join(dir, 'timeseries.json');
    // `exportPanel` takes both output paths, so both its writes land under the
    // temp dir -- the panel CSV included, never pipeline/data/. Aggregates are
    // passed empty because the committed CSV already holds them.
    fixtures.quiet(() => P.exportPanel(rows, [], dir, appPath));
    return loadJson(appPath);
  });
}

function checkTimeseriesFields(): void {
  assert.deepEqual(loadJson(APP_TIMESERIES).fields, rebuiltTimeseries().fields);
}

function checkTimeseriesYears(): void {
  assert.deepEqual(
    (loadJson(APP_TIMESERIES).years as unknown[]).map(Number),
    (rebuiltTimeseries().years as unknown[]).map(Number),
  );
}

function checkTimeseriesSeriesKeys(): void {
  assert.deepEqual(
    Object.keys(loadJson(APP_TIMESERIES).series).sort(),
    Object.keys(rebuiltTimeseries().series).sort(),
  );
}

/** Whole `series` objects, so a dropped country-year fails either way. */
function checkTimeseriesCells(): void {
  const normalise = (series: Record<string, Record<string, unknown[]>>) =>
    Object.fromEntries(
      Object.entries(series).map(([iso, years]) => [
        iso,
        Object.fromEntries(Object.entries(years).map(([y, vals]) => [y, vals.map(n)])),
      ]),
    );
  const want = normalise(rebuiltTimeseries().series);
  const got = normalise(loadJson(APP_TIMESERIES).series);
  const disagreed: [string, string][] = [];
  for (const iso of new Set([...Object.keys(want), ...Object.keys(got)])) {
    const yearsA = want[iso] ?? {};
    const yearsB = got[iso] ?? {};
    for (const year of new Set([...Object.keys(yearsA), ...Object.keys(yearsB)])) {
      if (JSON.stringify(yearsA[year]) !== JSON.stringify(yearsB[year])) {
        disagreed.push([iso, year]);
      }
    }
  }
  assert.deepEqual(
    disagreed,
    [],
    'src/data/global_labor_timeseries.json disagrees with what panel.exportPanel ' +
      'writes from pipeline/data/global_labor_panel.csv at ' +
      `${JSON.stringify(disagreed.slice(0, 5))} (${disagreed.length} cells) -- ` +
      'regenerate with `npm run pipeline` rather than editing either by hand.',
  );
}

test('R3: the timeseries fields match', checkTimeseriesFields);
test('R3: the timeseries years match', checkTimeseriesYears);
test('R3: every series key is present and no extras', checkTimeseriesSeriesKeys);
test('R3: every cell matches the panel CSV', checkTimeseriesCells);

// -------------------- R4. the committed rows match the dataset CSV
// Preventive. 0 of 19,236 cells disagree today. Payload-versus-CSV, not
// payload-versus-code: see the module docstring for what that does not close.
const payloadRows = () => loadJson(APP_JSON).rows as Record<string, unknown>[];
const datasetRows = () => readCsvRows(DATASET_CSV);
const datasetByIso = () => new Map(datasetRows().map((r) => [r.iso3 as string, r]));

/**
 * Keying by `iso3` collapses a duplicate, and the set comparison below is
 * invariant to that -- so a dropped row would leave the 229 x 85 comparison
 * without failing anything. Clean today (229 rows, 229 unique).
 */
function checkNoDuplicateIso3(): void {
  assert.equal(
    datasetRows().length,
    datasetByIso().size,
    'duplicate iso3 in global_labor_dataset.csv',
  );
}

function checkSameCountries(): void {
  assert.deepEqual(
    [...new Set(payloadRows().map((r) => r.iso3 as string))].sort(),
    [...datasetByIso().keys()].sort(),
  );
}

/**
 * Keyed by iso3, because the two files are in different orders: `exportCsv`
 * sorts aggregates first then by iso3; `exportAppJson` does not sort at all.
 * Comparing positionally would fail on correct data.
 */
function checkEveryCellMatchesDataset(): void {
  // 0010 R20. The 90 cross-tab columns reach the CSV but not this payload, so
  // comparing them here would fail 229 times over on correct data. They are
  // compared against the CSV in crosstabs.test.ts, against the per-country
  // artefacts that actually carry them -- excluding them from a guard without
  // asserting them somewhere else would be a hole.
  const crosstabs = new Set(C.CROSSTAB_COLUMNS);
  const appKeep = run.COLUMNS.filter((c) => !c.endsWith('_range') && !crosstabs.has(c));
  const byIso = datasetByIso();
  const disagreed: [string, string][] = [];
  for (const row of payloadRows()) {
    const csvRow = byIso.get(row.iso3 as string) as ReportRow;
    for (const column of appKeep) {
      if (n(csvRow[column]) !== n(row[column])) disagreed.push([row.iso3 as string, column]);
    }
  }
  assert.deepEqual(
    disagreed,
    [],
    'src/data/global_labor.json disagrees with pipeline/data/global_labor_dataset.csv at ' +
      `${JSON.stringify(disagreed.slice(0, 5))} (${disagreed.length} cells) -- ` +
      'one of the two was not regenerated. Run `npm run pipeline`.',
  );
}

/**
 * 0010 R20, both halves, because either alone is a hole.
 *
 * Excluding 90 columns from the app payload is only correct if they are still
 * in the archival dataset: this project's output IS the dataset, so paying for
 * the app's download with a gap in the CSV would be the worse trade. And the
 * exclusion has to be real, or R20 bought nothing.
 */
function checkCrosstabsInCsvNotPayload(): void {
  const payload = loadJson(APP_JSON);
  const byIso = datasetByIso();
  const header = new Set(Object.keys(byIso.get([...byIso.keys()][0]) as ReportRow));
  assert.deepEqual(
    C.CROSSTAB_COLUMNS.filter((c) => !header.has(c)),
    [],
    'cross-tab columns absent from global_labor_dataset.csv',
  );
  assert.deepEqual(
    C.CROSSTAB_COLUMNS.filter((c) => c in payload.field_tiers),
    [],
    "cross-tab columns leaked into the payload's field_tiers",
  );
  // Every row, not rows[0]: the threat this module names is a hand-edit.
  assert.deepEqual(
    [...new Set(payloadRows().flatMap((r) => C.CROSSTAB_COLUMNS.filter((c) => c in r)))].sort(),
    [],
    'cross-tab columns leaked into src/data/global_labor.json rows',
  );
}

/**
 * 218 countries, then WLD, 7 regions, 3 groups.
 *
 * Order is not reconstructible from any in-tree file, so it is asserted
 * structurally rather than compared. Adjacent runs only, so a country row
 * appearing after the aggregates fails.
 */
function checkRowTypesContiguous(): void {
  const runs: [string, number][] = [];
  for (const row of payloadRows()) {
    const kind = row.row_type as string;
    if (runs.length && runs[runs.length - 1][0] === kind) runs[runs.length - 1][1] += 1;
    else runs.push([kind, 1]);
  }
  assert.deepEqual(runs, [['country', 218], ['world', 1], ['region', 7], ['group', 3]]);
}

/**
 * The payload has two consumers, not one.
 *
 * A null `country_name` on a country row would silently drop that country from
 * the step 01 search rather than raise -- `src/utils/countrySearch.js` matches
 * on it -- so it is asserted here. The Python named
 * `src/utils/corridorStates.js`, which spec 0010 R1 deleted with the map; the
 * assertion outlived its original consumer and now guards the search.
 */
function checkCountryRowsCarryTheirName(): void {
  for (const row of payloadRows()) {
    if (row.row_type !== 'country') continue;
    assert.notEqual(row.country_name, null, row.iso3 as string);
  }
}

test('R4: the dataset CSV has no duplicate iso3', checkNoDuplicateIso3);
test('R4: the same countries are present', checkSameCountries);
test('R4: every cell matches the dataset CSV', checkEveryCellMatchesDataset);
test('R4: the crosstab columns are in the CSV but not the payload', checkCrosstabsInCsvNotPayload);
test('R4: row types are contiguous and in the written order', checkRowTypesContiguous);
test('R4: country rows carry the name their consumer keys on', checkCountryRowsCarryTheirName);

// ------------------------------------------------------------------ the net
/**
 * `verify` must not republish what it verifies (`scripts/verify.sh`).
 *
 * The middle step is the whole test. Stat-ing the payloads, reading them and
 * stat-ing again asserts that reading a file does not change its mtime -- true
 * no matter what the guards do. The version with teeth is: digest the tree, run
 * the guards, compare.
 *
 * **Both trees, not just `src/data/`.** The timeseries guard drives
 * `panel.exportPanel`, which writes `global_labor_panel.csv` unconditionally --
 * the very CSV another guard compares against, kept out of the tracked tree
 * only by the `tmp` argument it is handed. And there is no outer net:
 * `git status --porcelain` appears nowhere in `scripts/verify.sh` or in CI.
 *
 * **Content alone does not observe it** -- see `treeState`.
 */
test('running every guard leaves both trees untouched', () => {
  assert.deepEqual(
    WATCHED.map(treeState),
    STATE_BEFORE_ANY_GUARD_RAN,
    `a guard wrote to one of ${WATCHED} during the normal pass`,
  );

  // The guards are named explicitly rather than discovered: they live in this
  // module, so loading its tests would re-enter here and recurse.
  for (const guard of [
    checkHeaderMatchesGenerator, checkFieldTiersCoverEveryRowKey,
    checkTimeseriesFields, checkTimeseriesYears, checkTimeseriesSeriesKeys,
    checkTimeseriesCells, checkNoDuplicateIso3, checkSameCountries,
    checkEveryCellMatchesDataset, checkCrosstabsInCsvNotPayload,
    checkRowTypesContiguous, checkCountryRowsCarryTheirName,
  ]) {
    guard();
  }

  assert.deepEqual(
    WATCHED.map(treeState),
    STATE_BEFORE_ANY_GUARD_RAN,
    `running the payload guards modified one of ${WATCHED}. A guard that ` +
      'rewrites the artifact it checks passes unconditionally and leaves CI ' +
      'with a dirty tree.',
  );
});
