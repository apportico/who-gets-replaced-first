/**
 * R1 -- derived arithmetic pinned to known inputs and known outputs.
 *
 * Every number here is DERIVED: arithmetic on official statistics. The tests
 * use hand-computed expected values rather than re-deriving them with the same
 * expression under test, which would only prove the code equals itself.
 *
 * 0007: ported from `tests/test_derive.py`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as build from '../build.ts';
import * as fixtures from './fixtures.ts';

const close = (got: number | null, want: number, places = 4) =>
  assert.ok(
    got !== null && Math.abs(got - want) < 10 ** -places / 2,
    `expected ~${want}, got ${got}`,
  );

// -------------------------------------------------------- employed headcount
test('employed = labour force x (1 - unemployment/100). 1000 x 0.9 = 900', () => {
  const row = fixtures.country('XXX', {
    labor_force_total: 1000, unemployment_rate_total: 10.0, population_total: 5000,
  });
  build.derive(fixtures.byIso(row), fixtures.weights());
  assert.equal(row.employed_total, 900);
  assert.equal(row.employed_total_source, 'SL.TLF.TOTL.IN x (1 - SL.UEM.TOTL.ZS)');
});

test('100 x 900 / 5000 = 18.0 -- share of the WHOLE population, not 15+', () => {
  const row = fixtures.country('XXX', {
    labor_force_total: 1000, unemployment_rate_total: 10.0, population_total: 5000,
  });
  build.derive(fixtures.byIso(row), fixtures.weights());
  assert.equal(row.employed_share_of_population_pct, 18.0);
});

test('no labour force => fall back to the ILOSTAT survey total, in persons', () => {
  // The fallback is in thousands, so it must be multiplied by 1000. Getting
  // this wrong understates a country's employment by three orders of magnitude
  // and would sail through a range check.
  const row = fixtures.country('XXX', {
    isco_source_employed_thousands: 1234.0, population_total: 10000,
  });
  build.derive(fixtures.byIso(row), fixtures.weights());
  assert.equal(row.employed_total, 1234000);
  assert.equal(row.employed_total_source, 'ILOSTAT survey total (ISCO base)');
});

test('with no headcount, the share comes from the 15+ ratio x adult share', () => {
  const row = fixtures.country('XXX', {
    emp_to_pop_ratio_15plus: 60.0, pop_15_64_pct: 65.0, pop_65plus_pct: 15.0,
  });
  build.derive(fixtures.byIso(row), fixtures.weights());
  // 60.0 * (65.0 + 15.0) / 100 = 48.0
  assert.equal(row.employed_share_of_population_pct, 48.0);
});

// ---------------------------------------------------------------- ISCO bands
test('white collar is groups 1 to 4', () => {
  // Distinct, non-round values so a wrong grouping cannot coincide.
  const row = fixtures.withIsco('XXX', 2023, {
    g1: 7.31, g2: 11.47, g3: 9.83, g4: 6.29,
    g5: 15.11, g6: 8.07, g7: 13.53, g8: 12.19, g9: 16.2,
  });
  build.derive(fixtures.byIso(row), fixtures.weights());
  close(row.white_collar_pct as number, 34.9);
});

test('professional core is groups 1 and 2', () => {
  const row = fixtures.withIsco('XXX', 2023, { g1: 7.31, g2: 11.47, g3: 9.83 });
  build.derive(fixtures.byIso(row), fixtures.weights());
  close(row.professional_core_pct as number, 18.78);
});

test('blue collar / service is groups 5 to 9', () => {
  const row = fixtures.withIsco('XXX', 2023, {
    g5: 15.11, g6: 8.07, g7: 13.53, g8: 12.19, g9: 16.2,
  });
  build.derive(fixtures.byIso(row), fixtures.weights());
  close(row.blue_collar_service_pct as number, 65.1);
});

test('white and blue partition the workforce', () => {
  // 1-4 and 5-9 are a partition: they must sum to the classified total.
  const row = fixtures.withIsco('XXX', 2023, {
    g1: 7.31, g2: 11.47, g3: 9.83, g4: 6.29,
    g5: 15.11, g6: 8.07, g7: 13.53, g8: 12.19, g9: 16.2,
  });
  build.derive(fixtures.byIso(row), fixtures.weights());
  close((row.white_collar_pct as number) + (row.blue_collar_service_pct as number), 100.0);
});

// ---------------------------------------------------------------------- num
// `num` decides what counts as a usable value -- the gate before every sum.
test('num parses numeric strings', () => {
  assert.equal(build.num('12.5'), 12.5);
  assert.equal(build.num(3), 3.0);
});

test('num: unparseable becomes null, not zero', () => {
  for (const bad of [null, '', 'n/a', '..', []]) {
    assert.equal(build.num(bad), null, `num(${JSON.stringify(bad)})`);
  }
});

test('num: a real measured zero survives as zero', () => {
  assert.equal(build.num('0'), 0.0);
  assert.equal(build.num(0), 0.0);
});

// ------------------------------------------------------------------- latest
// `latest` decides which vintage wins.
test('latest returns the newest non-null with its year', () => {
  assert.deepEqual(
    build.latest(new Map([[2020, 5.0], [2023, null], [2021, 7.0]])),
    [7.0, 2021],
  );
});

test('latest skips null years rather than stopping at them', () => {
  assert.deepEqual(
    build.latest(new Map([[2019, 1.0], [2024, null], [2022, 2.0]])),
    [2.0, 2022],
  );
});

test('latest: all null yields no value and no year', () => {
  assert.deepEqual(build.latest(new Map([[2020, null], [2021, null]])), [null, null]);
});

test('latest: an empty series yields no value and no year', () => {
  assert.deepEqual(build.latest(new Map()), [null, null]);
});

test('latest: a measured zero is not treated as missing', () => {
  // 0.0 is falsy; `latest` must select on null, not on truthiness.
  assert.deepEqual(build.latest(new Map([[2020, 5.0], [2023, 0.0]])), [0.0, 2023]);
});
