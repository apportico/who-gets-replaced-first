/**
 * R2 -- a missing input produces a null and a flag, never a zero, never a guess.
 *
 * The single most important module in the suite. The project's first
 * non-negotiable is that a country with no data is a row of nulls, never a
 * guess, and nothing but these tests enforces it.
 *
 * The specific line under guard is in `build.derive`:
 *
 *     const gc = (code) => groups.get(code) || 0.0;
 *
 * which coerces a null ISCO group to 0.0 inside the band sums. That is safe
 * only because the whole block is gated on
 *
 *     const haveIsco = row.data_year_occupation !== null && !== undefined
 *
 * Drop the gate and every country with no occupation data silently reports
 * white_collar_pct = 0.0 -- a number that looks like a measurement, sorts like
 * a measurement, and is a fabrication. The first test here is the one that
 * fails if anyone removes it.
 *
 * 0007: ported from `tests/test_nulls.py`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as build from '../build.ts';
import * as fixtures from './fixtures.ts';

// ----------------------------------------------------------- null propagation
test('the have_isco gate: no occupation year => null, NOT 0.0', () => {
  // groups are present but the vintage is absent -- the gate must shut
  const row = fixtures.withIsco('XXX', null, { g1: 10.0, g2: 12.0, g3: 8.0 });
  build.derive(fixtures.byIso(row), fixtures.weights());
  assert.equal(row.white_collar_pct, null);
  assert.equal(row.professional_core_pct, null);
  assert.equal(row.blue_collar_service_pct, null);
});

test('no occupation year is not zero', () => {
  // Stated separately because 0.0 is the specific wrong answer. An
  // `=== null` check above would also pass if the field were absent; this pins
  // the failure mode the `|| 0.0` coercion would produce.
  const row = fixtures.withIsco('XXX', null, { g1: 10.0, g2: 12.0 });
  build.derive(fixtures.byIso(row), fixtures.weights());
  assert.notEqual(row.white_collar_pct, 0.0);
  assert.notEqual(row.professional_core_pct, 0.0);
  assert.notEqual(row.blue_collar_service_pct, 0.0);
});

test('a country with no ISCO data at all yields null', () => {
  // The real production shape: no vintage AND no groups. This is what a
  // country with no ISCO series actually looks like, and it is the case where
  // `|| 0.0` produces literally 0.0 rather than a partial sum. 0.0 is the
  // worst possible wrong answer here -- it reads as "no one in this country
  // does white-collar work", sorts to the bottom, and is indistinguishable
  // from a measurement.
  const row = fixtures.country('XXX', { population_total: 5000 });
  build.derive(fixtures.byIso(row), fixtures.weights());
  assert.equal(row.white_collar_pct, null);
  assert.notEqual(row.white_collar_pct, 0.0);
  assert.equal(row.ai_exposure_weighted_score, null);
});

test('the gate must not be so tight that real data stops summing', () => {
  const row = fixtures.withIsco('XXX', 2023, { g1: 10.0, g2: 12.0, g3: 8.0, g4: 7.0 });
  build.derive(fixtures.byIso(row), fixtures.weights());
  assert.ok(Math.abs((row.white_collar_pct as number) - 37.0) < 5e-5);
});

test('no labour force and no ISCO survey total => employed_total is null', () => {
  const row = fixtures.country('XXX', { population_total: 5000 });
  build.derive(fixtures.byIso(row), fixtures.weights());
  assert.equal(row.employed_total, null);
  assert.equal(row.employed_total_source, null);
});

test('no population => no share of population employed, not a zero', () => {
  const row = fixtures.country('XXX', {
    labor_force_total: 1000, unemployment_rate_total: 10.0,
  });
  build.derive(fixtures.byIso(row), fixtures.weights());
  assert.equal(row.employed_total, 900);
  assert.equal(row.employed_share_of_population_pct, null);
});

// ------------------------------------------------------------- quality flag
test('a complete row is flagged complete', () => {
  const row = fixtures.withIsco('XXX', 2024, { g1: 10.0 }, {
    population_total: 5000, lfp_rate_total: 60.0,
    young_white_collar_pct: 30.0, isco_groups_reported: 9,
    isco_classified_share_pct: 99.0, white_collar_pct: 40.0,
  });
  assert.equal(build.qualityFlag(row, 2026), 'complete');
});

test('a row of nulls must say so, and say why', () => {
  const flag = build.qualityFlag(fixtures.country('XXX'), 2026);
  assert.ok(flag.startsWith('sparse — '), flag);
  assert.ok(flag.includes('no ISCO data'), flag);
  assert.ok(flag.includes('no population data'), flag);
  assert.ok(flag.includes('no labor force data'), flag);
});

test('some data present => partial, and the gap is named, not hidden', () => {
  const row = fixtures.withIsco('XXX', 2024, { g1: 10.0 }, {
    population_total: 5000, lfp_rate_total: 60.0,
    white_collar_pct: 40.0, isco_groups_reported: 9,
    isco_classified_share_pct: 99.0,
  });
  const flag = build.qualityFlag(row, 2026);
  assert.ok(flag.startsWith('partial — '), flag);
  assert.ok(flag.includes('no youth x ISCO cross-tab'), flag);
});

test('vintage is a quality question: >5yr old occupation data is named', () => {
  const row = fixtures.withIsco('XXX', 2017, { g1: 10.0 }, {
    population_total: 5000, lfp_rate_total: 60.0,
    white_collar_pct: 40.0, young_white_collar_pct: 30.0,
    isco_groups_reported: 9, isco_classified_share_pct: 99.0,
  });
  const flag = build.qualityFlag(row, 2026);
  assert.ok(flag.includes('2017'), flag);
  assert.ok(flag.includes('>5yr old'), flag);
});

test("0002 R1's ISCO-88 fallback stays visible in the flag, not blended in", () => {
  const row = fixtures.withIsco('XXX', 2023, { g1: 10.0 }, {
    population_total: 5000, lfp_rate_total: 60.0,
    white_collar_pct: 40.0, young_white_collar_pct: 30.0,
    isco_classification: 'ISCO-88',
  });
  const flag = build.qualityFlag(row, 2026);
  assert.ok(flag.includes('ISCO-88 fallback'), flag);
});
