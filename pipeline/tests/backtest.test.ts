/**
 * 0017. The back-test, scored against a committed golden master.
 *
 * Driven from `pipeline/data/global_labor_panel.csv`, which is in-tree, so this
 * runs in a fresh clone with no `pipeline/raw/` cache and no network -- the same
 * contract as the rest of spec 0004's suite. That was a review finding on the
 * spec rather than an afterthought: R1 and R3's acceptance originally opened
 * with `npm run pipeline`, which nothing in CI can execute.
 *
 * The assertion that carries the most weight is `persistence beats trend`. It
 * encodes the published finding as a build gate, so a future change that
 * reverses it fails loudly instead of quietly invalidating a conclusion the
 * result screen is still asserting. If it ever goes red on a data refresh that
 * touched no code, the fix is to work out what moved in the panel and republish
 * -- never to bump the number until the suite is green.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as C from '../config.ts';
import * as BT from '../backtest.ts';
import { readCsv } from '../csvio.ts';
import type { Row } from '../build.ts';

const PIPELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED = path.join(PIPELINE, 'tests', 'fixtures', 'expected');

const STRING_FIELDS = new Set([
  'iso3', 'country_name', 'region', 'row_type', 'isco_classification',
]);

function readPanel(): Row[] {
  const table = readCsv(readFileSync(path.join(PIPELINE, 'data', 'global_labor_panel.csv'), 'utf8'));
  const header = table[0];
  return table.slice(1)
    .filter((r) => r.length === header.length)
    .map((r) => {
      const row: Row = {};
      header.forEach((h, i) => {
        const v = r[i];
        if (v === '') { row[h] = null; return; }
        if (STRING_FIELDS.has(h)) { row[h] = v; return; }
        const n = Number(v);
        row[h] = Number.isNaN(n) ? v : n;
      });
      return row;
    });
}

const panel = readPanel();
const rows = BT.backtest(panel);
const summary = BT.backtestSummary(rows);
const pooled = summary.find((r) => r.group === BT.POOLED) as Row;
const clerical = summary.find((r) => r.group === 'isco4_clerical_pct') as Row;

const near = (actual: number, expected: number, tol: number, what: string) =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${what}: ${actual} is more than ${tol} from ${expected}`,
  );

// ---------------------------------------------------------------------- R1
test('R1 -- 574 rows over 64 countries and 9 groups', () => {
  assert.equal(rows.length, 574);
  assert.equal(new Set(rows.map((r) => r.iso3)).size, 64);
  assert.equal(new Set(rows.map((r) => r.group)).size, 9);
  // 62 for agriculture, 64 for the other eight: 62 + 64*8 = 574.
  const perGroup = BT.BACKTEST_GROUPS.map((g) => rows.filter((r) => r.group === g).length);
  assert.deepEqual(perGroup, [64, 64, 64, 64, 64, 62, 64, 64, 64]);
});

test('R1 -- every row carries the three figures it is scored on', () => {
  for (const r of rows) {
    for (const k of ['retrodicted_2025_pct', 'observed_2025_pct', 'error_pp']) {
      assert.equal(typeof r[k], 'number', `${r.iso3}/${r.group} has no ${k}`);
    }
  }
});

test('R1 -- an ineligible pair is ABSENT, never zero-filled', () => {
  // The failure this guards is the project's first rule: a country with no
  // usable series is not a row of zeros. Angola has a 2025 clerical value but
  // only two fit-window observations, so it must not appear at all.
  for (const iso3 of ['AGO', 'BFA', 'GMB', 'VUT']) {
    assert.equal(rows.filter((r) => r.iso3 === iso3).length, 0, `${iso3} should be absent`);
  }
  assert.equal(rows.filter((r) => r.error_pp === 0 && r.observed_2025_pct === 0).length, 0);
});

test('R1 -- the fit skips gap years rather than interpolating them', () => {
  // A perfectly linear series with a hole still recovers its own slope; an
  // implementation that filled the hole with a zero could not.
  const points = [2013, 2014, 2017, 2019].map((year) => ({ year, value: 10 - 0.5 * (year - 2013) }));
  near(BT.fitAt(points, 2025) as number, 10 - 0.5 * 12, 1e-9, 'gapped linear fit');
});

// ---------------------------------------------------------------------- R2
test('R2 -- the registry covers exactly the emitted columns', () => {
  const emitted = [...new Set([...BT.BACKTEST_COLUMNS, ...BT.BACKTEST_SUMMARY_COLUMNS])].sort();
  assert.deepEqual([...C.BACKTEST_FIELD_TIERS.keys()].sort(), emitted);
});

test('R2 -- every tier is from the closed vocabulary', () => {
  const valid = new Set<string>([...C.TIERS, C.NOT_A_MEASUREMENT]);
  for (const [field, tier] of C.BACKTEST_FIELD_TIERS) {
    assert.ok(valid.has(tier), `${field} carries ${tier}, which is not a tier`);
  }
});

test('R2 -- MODELED and DERIVED do not blur', () => {
  // The whole point of the artefact. The retrodiction is a model output; the
  // values it is scored against come from the panel; the error between them is
  // MODELED because a difference is only as measured as its least-measured term.
  assert.equal(C.BACKTEST_FIELD_TIERS.get('retrodicted_2025_pct'), 'MODELED');
  assert.equal(C.BACKTEST_FIELD_TIERS.get('error_pp'), 'MODELED');
  assert.equal(C.BACKTEST_FIELD_TIERS.get('persistence_error_pp'), 'MODELED');
  assert.equal(C.BACKTEST_FIELD_TIERS.get('observed_2025_pct'), 'DERIVED');
  assert.equal(C.BACKTEST_FIELD_TIERS.get('last_fit_pct'), 'DERIVED');
});

test('R2 -- the app payload carries the same tiers as the CSV', () => {
  const payload = JSON.parse(readFileSync(
    path.join(PIPELINE, '..', 'src', 'data', 'backtest.json'), 'utf8',
  )) as { field_tiers: Record<string, string>; fields: string[]; summary_fields: string[] };
  const emitted = [...new Set([...payload.fields, ...payload.summary_fields])].sort();
  assert.deepEqual(Object.keys(payload.field_tiers).sort(), emitted);
  for (const [field, tier] of Object.entries(payload.field_tiers)) {
    assert.equal(tier, C.BACKTEST_FIELD_TIERS.get(field), `${field} disagrees with the registry`);
  }
});

// ------------------------------------------------------------------ R3 / R6
test('R6 -- the rows reproduce the committed fixture byte for byte', () => {
  const actual = rows.map((r) => BT.BACKTEST_COLUMNS.map((k) => BT.formatBacktestCell(k, r[k])));
  const expected = readCsv(readFileSync(path.join(EXPECTED, 'backtest.csv'), 'utf8'));
  assert.deepEqual(expected[0], BT.BACKTEST_COLUMNS);
  assert.equal(expected.length - 1, actual.length);
  for (let i = 0; i < actual.length; i++) {
    assert.deepEqual(actual[i], expected[i + 1], `row ${i} (${rows[i].iso3}/${rows[i].group})`);
  }
});

test('R6 -- the summary reproduces the committed fixture', () => {
  const actual = summary.map((r) =>
    BT.BACKTEST_SUMMARY_COLUMNS.map((k) => BT.formatBacktestCell(k, r[k])));
  const expected = readCsv(readFileSync(path.join(EXPECTED, 'backtest_summary.csv'), 'utf8'));
  assert.deepEqual(expected.slice(1), actual);
});

test('R3 -- the published distribution, to the tolerance the spec records', () => {
  // +/-0.005pp against the 2026-09-01 probe. The tolerance is the probe's own
  // precision, not slack: the probe used plain JavaScript arithmetic and this
  // module uses pynum, and pipeline/README.md tabulates how far those diverge.
  assert.equal(pooled.n, 574);
  near(pooled.mae_pp as number, 1.806, 0.005, 'pooled MAE');
  near(pooled.rmse_pp as number, 3.867, 0.005, 'pooled RMSE');
  assert.equal(clerical.n, 64);
  near(clerical.mae_pp as number, 0.94, 0.005, 'clerical MAE');
  near(clerical.rmse_pp as number, 1.295, 0.005, 'clerical RMSE');
  near(clerical.max_abs_error_pp as number, 5.057, 0.005, 'clerical worst case');
  assert.equal(clerical.max_abs_error_iso3, 'GEO');
});

test('R3 -- a mean alone would hide the shape, so all seven statistics ship', () => {
  // The clerical mean signed error is -0.055pp, which reads as an almost
  // unbiased model while the worst country is out by 5.06pp. That gap is the
  // argument for publishing a distribution rather than a headline.
  near(clerical.mean_signed_error_pp as number, -0.055, 0.005, 'clerical mean signed error');
  for (const k of BT.BACKTEST_SUMMARY_COLUMNS) {
    assert.ok(clerical[k] !== undefined && clerical[k] !== null, `summary is missing ${k}`);
  }
  assert.equal(summary.length, 10); // nine groups plus POOLED
});

// ---------------------------------------------------------------------- R4
test('R4 -- the direction is wrong for 31 clerical countries and 241 pooled', () => {
  const wrong = rows.filter((r) => r.direction_correct === false);
  assert.equal(wrong.length, 241);
  assert.equal(wrong.filter((r) => r.group === 'isco4_clerical_pct').length, 31);
  assert.equal(pooled.direction_wrong_n, 241);
  assert.equal(clerical.direction_wrong_n, 31);
});

test('R4 -- the README names every wrong-direction clerical country, not a count', () => {
  const readme = readFileSync(path.join(PIPELINE, 'README.md'), 'utf8');
  const wrong = rows
    .filter((r) => r.group === 'isco4_clerical_pct' && r.direction_correct === false)
    .map((r) => r.iso3 as string)
    .sort();
  assert.equal(wrong.length, 31);
  for (const iso3 of wrong) {
    assert.ok(readme.includes(iso3), `pipeline/README.md does not name ${iso3}`);
  }
});

test('R4 -- a zero observed change has no direction to get wrong', () => {
  // Forcing this to true or false would move the published 31 and 241.
  assert.equal(BT.directionCorrect(10, 11, 10), null);
  assert.equal(BT.directionCorrect(10, 11, 12), true);
  assert.equal(BT.directionCorrect(10, 11, 9), false);
  assert.equal(BT.directionCorrect(10, 9, 8), true);
});

// ---------------------------------------------------------------------- R5
test('R5 -- persistence beats the trend, which is the finding', () => {
  // If this ever fails on a data refresh: investigate what moved in the panel
  // and republish the conclusion. Do not re-baseline it green.
  assert.ok(
    (pooled.persistence_mae_pp as number) < (pooled.mae_pp as number),
    `persistence MAE ${pooled.persistence_mae_pp} should beat trend MAE ${pooled.mae_pp}`,
  );
  assert.ok((pooled.persistence_rmse_pp as number) < (pooled.rmse_pp as number));
  near(pooled.persistence_mae_pp as number, 1.292, 0.005, 'pooled persistence MAE');
  near(pooled.persistence_rmse_pp as number, 2.046, 0.005, 'pooled persistence RMSE');
});

test('R5 -- the trend wins on a minority of pairs', () => {
  assert.equal(pooled.trend_beats_persistence_n, 234);
  assert.ok((pooled.trend_beats_persistence_n as number) / 574 < 0.5);
});

test('R5 -- every row carries its own persistence error', () => {
  for (const r of rows) {
    assert.equal(typeof r.persistence_error_pp, 'number');
    near(
      r.persistence_error_pp as number,
      (r.last_fit_pct as number) - (r.observed_2025_pct as number),
      1e-6,
      `${r.iso3}/${r.group} persistence error`,
    );
  }
});

// ---------------------------------------------------------------------- R8
test('R8 -- no emitted column ships a year beyond the allowlist', () => {
  // An allowlist a new column has to be added to is a guard; a prose exemption
  // for "fit-window and target-year metadata" is a suggestion, and any column
  // ending _year could be argued into it.
  const pattern = /replacement|displacement|halv|_year$/;
  const allowed = new Set(BT.BACKTEST_YEAR_COLUMNS);
  const payload = JSON.parse(readFileSync(
    path.join(PIPELINE, '..', 'src', 'data', 'backtest.json'), 'utf8',
  )) as Record<string, unknown> & { fields: string[]; summary_fields: string[] };
  const keys = [
    ...BT.BACKTEST_COLUMNS, ...BT.BACKTEST_SUMMARY_COLUMNS,
    ...payload.fields, ...payload.summary_fields, ...Object.keys(payload),
  ];
  for (const k of keys) {
    if (pattern.test(k)) assert.ok(allowed.has(k), `${k} looks like a year and is not allowlisted`);
  }
  assert.deepEqual(BT.BACKTEST_YEAR_COLUMNS, ['fit_start_year', 'fit_end_year', 'target_year']);
});

// ---------------------------------------------------------------------- R9
test('R9 -- 64 of 177 countries can be scored, and the rest are not implied', () => {
  const cov = BT.coverage(panel, rows);
  assert.equal(cov.countriesWithSeries, 177);
  assert.equal(cov.eligibleCountries, 64);
  assert.equal(cov.unscorable, 113);
});

test('R9 -- Japan and India are absent, and the README says why', () => {
  // The two countries the design proposal used to argue the model measures the
  // wrong thing. Japan's clerical series ends in 2023, so it has no 2025 value
  // to be scored against; India has two fit-window observations.
  assert.equal(rows.filter((r) => r.iso3 === 'JPN').length, 0);
  assert.equal(rows.filter((r) => r.iso3 === 'IND').length, 0);
  const readme = readFileSync(path.join(PIPELINE, 'README.md'), 'utf8');
  assert.match(readme, /Japan/);
  assert.match(readme, /India/);
  assert.match(readme, /\b64\b/);
  assert.match(readme, /\b177\b/);
});
