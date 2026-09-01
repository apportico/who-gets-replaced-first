/**
 * R5 -- a row is never presented as a single-year snapshot.
 *
 * CLAUDE.md: "Record the year per field. Vintages differ -- population may be
 * 2025 while occupation is 2017. Never present a row as a single-year
 * snapshot."
 *
 * The failure this guards against is subtle: nothing looks wrong about a row
 * that carries one year. It just quietly asserts that every figure in it was
 * measured at the same time, which for most countries is false.
 *
 * 0007: ported from `tests/test_vintages.py`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as build from '../build.ts';
import * as fixtures from './fixtures.ts';

// --------------------------------------------------------- per-field years
test('population 2025 and occupation 2017 both reach the row intact', () => {
  const row = fixtures.withIsco('XXX', 2017, { g1: 10.0, g2: 12.0 });
  row.data_year_population = 2025;
  build.derive(fixtures.byIso(row), fixtures.weights());
  assert.equal(row.data_year_population, 2025);
  assert.equal(row.data_year_occupation, 2017);
});

test('neither year may be overwritten by the other, in either direction', () => {
  const row = fixtures.withIsco('XXX', 2017, { g1: 10.0 }, {
    data_year_population: 2025, data_year_labor: 2024, data_year_sector: 2022,
  });
  build.derive(fixtures.byIso(row), fixtures.weights());
  assert.deepEqual(
    [row.data_year_population, row.data_year_labor, row.data_year_sector,
      row.data_year_occupation],
    [2025, 2024, 2022, 2017],
  );
});

// ------------------------------------------------------- aggregate vintages
test('an aggregate spanning 2017-2023 publishes the span, not just 2023', () => {
  // Reporting only the newest year would present an aggregate built partly
  // from six-year-old data as if it were current.
  const m1 = fixtures.member(100, 20.0);
  m1.data_year_occupation = 2017;
  const m2 = fixtures.member(100, 40.0);
  m2.data_year_occupation = 2023;
  const agg = build.makeAggregate('TST', 'Test', [m1, m2], 'test');
  assert.equal(agg.data_year_occupation, 2023);
  assert.equal(agg.data_year_occupation_range, '2017-2023');
});

test('a single-vintage span is still recorded', () => {
  const m1 = fixtures.member(100, 20.0);
  m1.data_year_occupation = 2023;
  const m2 = fixtures.member(100, 40.0);
  m2.data_year_occupation = 2023;
  const agg = build.makeAggregate('TST', 'Test', [m1, m2], 'test');
  assert.equal(agg.data_year_occupation_range, '2023-2023');
});

test('no member years yields a null year and a null span', () => {
  const rows = [fixtures.member(100, 20.0), fixtures.member(100, 40.0)];
  const agg = build.makeAggregate('TST', 'Test', rows, 'test');
  assert.equal(agg.data_year_occupation, null);
  assert.equal(agg.data_year_occupation_range, null);
});

test('all five tracked vintages carry a _range on aggregates', () => {
  const tracked = [
    'data_year_population', 'data_year_labor', 'data_year_sector',
    'data_year_occupation', 'data_year_youth_occupation',
  ];
  const m1 = fixtures.member(100, 20.0);
  const m2 = fixtures.member(100, 40.0);
  tracked.forEach((k, i) => {
    m1[k] = 2018 + i;
    m2[k] = 2024;
  });
  const agg = build.makeAggregate('TST', 'Test', [m1, m2], 'test');
  tracked.forEach((k, i) => {
    assert.equal(agg[k], 2024, k);
    assert.equal(agg[k + '_range'], `${2018 + i}-2024`, k);
  });
});

// ------------------------------------------ `latest` picks the vintage
test('the newest non-null wins', () => {
  assert.deepEqual(
    build.latest(new Map([[2020, 5.0], [2023, null], [2021, 7.0]])),
    [7.0, 2021],
  );
});

test('the value and the year travel together', () => {
  const [value, year] = build.latest(new Map([[2015, 1.0], [2019, 9.0], [2017, 4.0]]));
  assert.deepEqual([value, year], [9.0, 2019]);
});
