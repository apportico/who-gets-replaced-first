/**
 * 0010 R20 — the per-country cross-tab artefacts cannot drift.
 *
 * Spec 0009 exists because a committed payload went unregenerated for the life
 * of the project while six tests appeared to cover it — all of them asserting
 * on a temp file the run had just written, so they compared the output with
 * itself. `src/data/crosstabs/` is the first app-consumed payload added since,
 * and shipping it without a guard would re-open exactly that hole.
 *
 * These tests read the COMMITTED artefacts off disk and compare them against
 * the committed dataset CSV. Neither side is produced here. A run that forgets
 * `npm run pipeline` fails, which is the whole point.
 *
 * 0007: ported from `tests/test_crosstabs.py`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as C from '../config.ts';
import * as run from '../run.ts';
import * as fixtures from './fixtures.ts';
import { readCsvDict } from '../csvio.ts';
import { pyRound } from '../pynum.ts';
import type { Row } from '../build.ts';

const PIPELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CROSSTABS = path.join(path.dirname(PIPELINE), 'src', 'data', 'crosstabs');
const DATASET_CSV = path.join(PIPELINE, 'data', 'global_labor_dataset.csv');

/**
 * CSV cells are strings and JSON cells are numbers; compare as numbers.
 *
 * Empty string and null are the same absence — `exportCsv` writes a null as an
 * empty cell, so a strict comparison would fail on every null in the file.
 */
function n(v: unknown): unknown {
  if (v === null || v === undefined || v === '') return null;
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isNaN(x) ? v : pyRound(x, 6);
}

const csvRows = readCsvDict(readFileSync(DATASET_CSV, 'utf8'));
const byIso = new Map(csvRows.filter((r) => r.row_type === 'country').map((r) => [r.iso3, r]));
const files = readdirSync(CROSSTABS).filter((f) => f.endsWith('.json')).sort();

interface Crosstab {
  iso3: string;
  values: Record<string, unknown>;
  field_tiers: Record<string, string>;
}
const load = (name: string): Crosstab =>
  JSON.parse(readFileSync(path.join(CROSSTABS, name), 'utf8'));

test('one artefact per country row, including the ones with nothing to report', () => {
  // A country the source says nothing about still gets a file. The wizard has
  // to distinguish "the source publishes nothing here" from "the fetch
  // failed", and a 404 cannot say the first one — that distinction is the
  // whole of R20's invented-absence rule.
  assert.deepEqual(
    files.map((f) => f.slice(0, -5)),
    [...byIso.keys()].sort(),
    'src/data/crosstabs/ disagrees with the country rows in ' +
      'global_labor_dataset.csv — run `npm run pipeline`',
  );
});

test('every cell matches the dataset CSV', () => {
  const disagreed: [string, string][] = [];
  for (const name of files) {
    const payload = load(name);
    const csvRow = byIso.get(payload.iso3) as Record<string, string>;
    for (const column of C.CROSSTAB_COLUMNS) {
      if (n(csvRow[column]) !== n(payload.values[column])) {
        disagreed.push([payload.iso3, column]);
      }
    }
  }
  assert.deepEqual(
    disagreed.slice(0, 5),
    [],
    `${disagreed.length} cells disagree between src/data/crosstabs/ and ` +
      'pipeline/data/global_labor_dataset.csv — one of the two was not ' +
      'regenerated. Run `npm run pipeline`.',
  );
});

test('every value carries a tier, in this artefact own block', () => {
  // `exportAppJson` sheds these columns, so `global_labor.json`'s tier block
  // cannot name them. "Every emitted number carries a tier" still holds — the
  // block it appears in moved, which is all R20 changed.
  const expected = [...C.CROSSTAB_COLUMNS].sort();
  for (const name of files) {
    const payload = load(name);
    assert.deepEqual(
      Object.keys(payload.values).sort(),
      Object.keys(payload.field_tiers).sort(),
      `${name}: a value with no tier, or the reverse`,
    );
    assert.deepEqual(
      Object.keys(payload.values).sort(),
      expected,
      `${name}: does not carry exactly the ${C.CROSSTAB_COLUMNS.length} columns`,
    );
  }
});

test('the shares are DERIVED and the years are not measurements', () => {
  const tiers = load('GBR.json').field_tiers;
  assert.equal(tiers.isco4_age_25_54_pct, 'DERIVED');
  assert.equal(tiers.isco4_edu_adv_pct, 'DERIVED');
  assert.equal(tiers.isco4_age_year, C.NOT_A_MEASUREMENT);
  assert.equal(tiers.isco4_edu_year, C.NOT_A_MEASUREMENT);
});

test('a group with shares carries its own year', () => {
  // R8 and R9 both reconcile jointly, one year per (country, group). The
  // reconciled year varies across the nine groups — 34 countries on the age
  // flow, 43 on the education flow — so a single per-country vintage field
  // could not name them.
  const orphaned: [string, string][] = [];
  for (const name of files) {
    const v = load(name).values;
    for (const g of C.ISCO_GROUP_NUMBERS) {
      for (const [dim, bands] of [
        ['age', [...C.AGE_GROUP_BANDS.values()]],
        ['edu', [...C.EDU_GROUP_BANDS.values()]],
      ] as [string, string[]][]) {
        const has = bands.some((b) => v[`isco${g}_${dim}_${b}_pct`] !== null);
        if (has && v[`isco${g}_${dim}_year`] === null) orphaned.push([name, `isco${g}_${dim}`]);
      }
    }
  }
  assert.deepEqual(
    orphaned.slice(0, 5),
    [],
    `${orphaned.length} group/dimension pairs carry shares with no reconciled year`,
  );
});

test('a withholding is flagged and names its year', () => {
  // 0010 R9. The floor is terminal at the reconciled year. An earlier loader
  // tested the floor inside the year loop and used `continue`, which did not
  // withhold at all -- it walked back to whichever older survey happened to
  // pass. CMR shipped four chips from 2014 beside an age profile from 2021.
  const bad: [string, number, string][] = [];
  for (const name of files) {
    const v = load(name).values;
    for (const g of C.ISCO_GROUP_NUMBERS) {
      const flag = v[`isco${g}_edu_flag`];
      const present = [...C.EDU_GROUP_BANDS.values()]
        .map((b) => v[`isco${g}_edu_${b}_pct`])
        .filter((c) => c !== null);
      if (flag === C.EDU_FLAG_WITHHELD) {
        if (present.length || v[`isco${g}_edu_year`] === null) {
          bad.push([name, g, 'withheld but has shares or no year']);
        }
      } else if (flag === C.EDU_FLAG_PRESENT && !present.length) {
        bad.push([name, g, 'flagged present with no shares']);
      } else if (flag === C.EDU_FLAG_NOT_PUBLISHED && present.length) {
        bad.push([name, g, 'flagged not published but has shares']);
      }
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} groups disagree with their flag`);
});

test('CMR withholds at its own reconciled year', () => {
  // The named case from R9, asserted against the committed artefact.
  const v = load('CMR.json').values;
  assert.equal(v.isco4_edu_flag, C.EDU_FLAG_WITHHELD);
  assert.equal(v.isco4_edu_bas_pct, null);
  assert.equal(v.isco4_edu_year, 2021);
});

test('the education coverage floor was applied', () => {
  // Anything that survived into the artefact must be at or above it — a
  // surviving group whose chips describe a minority of the base means the
  // withholding did not happen.
  const thin: [string, number, number][] = [];
  for (const name of files) {
    const v = load(name).values;
    for (const g of C.ISCO_GROUP_NUMBERS) {
      const present = [...C.EDU_GROUP_BANDS.values()]
        .map((b) => v[`isco${g}_edu_${b}_pct`])
        .filter((c): c is number => typeof c === 'number');
      const total = present.reduce((a, b) => a + b, 0);
      if (present.length && total < C.EDU_COVERAGE_FLOOR - 0.5) {
        thin.push([name, g, pyRound(total, 2)]);
      }
    }
  }
  assert.deepEqual(
    thin.slice(0, 5),
    [],
    `${thin.length} groups below the ${C.EDU_COVERAGE_FLOOR}% floor were not withheld`,
  );
});

// ------------------------------- the other half of R20, from the other side
test('exportAppJson sheds exactly the cross-tab columns', () => {
  // Calls the generator rather than re-implementing it: rebuilding `keep` and
  // the exclusion here and comparing lengths would assert that this test's
  // arithmetic matches this test's arithmetic.
  const row: Row = Object.fromEntries(run.COLUMNS.map((c) => [c, null]));
  Object.assign(row, { iso3: 'AAA', country_name: 'Aland', row_type: 'country' });
  const dir = mkdtempSync(path.join(tmpdir(), 'wgrf-crosstab-'));
  let payload;
  try {
    const out = path.join(dir, 'payload.json');
    fixtures.quiet(() => run.exportAppJson([row], out));
    payload = JSON.parse(readFileSync(out, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const leaked = C.CROSSTAB_COLUMNS.filter(
    (c) => c in payload.field_tiers || c in payload.rows[0],
  );
  assert.deepEqual(leaked, [], 'exportAppJson emitted cross-tab columns');
  assert.equal(C.CROSSTAB_COLUMNS.length, 90);
  // And it shed only those: everything else survived.
  const crosstabs = new Set(C.CROSSTAB_COLUMNS);
  const expected = run.COLUMNS.filter((c) => !c.endsWith('_range') && !crosstabs.has(c));
  assert.deepEqual(Object.keys(payload.field_tiers).sort(), [...expected].sort());
});

test('the tier gate still covers the excluded columns', () => {
  // The ordering R20 specifies, asserted rather than described. The `untiered`
  // gate is the entire enforcement of "every emitted number carries a tier"
  // inside the pipeline — exportCsv and exportSqlite have no tier check of
  // their own. It runs over the full column list BEFORE the exclusion, so the
  // 90 columns are covered by it even though they never reach the app payload.
  const untiered = C.CROSSTAB_COLUMNS.filter((c) => !C.FIELD_TIERS.has(c));
  assert.deepEqual(
    untiered,
    [],
    'cross-tab columns are not in FIELD_TIERS, so the gate in exportAppJson ' +
      'would not catch them',
  );
});
