/**
 * R4 -- aggregates are weighted, and their coverage is published.
 *
 * CLAUDE.md: "Weight aggregates, never simple-average country percentages. And
 * publish the coverage alongside, so partial coverage is visible."
 *
 * The fixtures here are built so the weighted and simple-average answers
 * differ materially. A test where both agree proves nothing -- it would pass
 * against a simple mean.
 *
 * 0007: ported from `tests/test_aggregates.py`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as build from '../build.ts';
import * as fixtures from './fixtures.ts';

// -------------------------------------------------------- weighted average
test('900 @ 20% and 100 @ 80% -> 26.0 weighted, 50.0 simple. Must be 26.0', () => {
  const rows = [fixtures.member(900, 20.0), fixtures.member(100, 80.0)];
  const [value, denominator] = build.wavg(rows, 'white_collar_pct', 'employed_total');
  assert.equal(value, 26.0);
  assert.notEqual(value, 50.0);
  assert.equal(denominator, 1000);
});

test('a null member leaves both numerator and denominator', () => {
  // Counting it as zero would drag the aggregate down; counting it in the
  // denominator only would do the same more subtly.
  const rows = [
    fixtures.member(900, 20.0), fixtures.member(100, 80.0), fixtures.member(100, null),
  ];
  const [value, denominator] = build.wavg(rows, 'white_collar_pct', 'employed_total');
  assert.equal(value, 26.0);
  assert.equal(denominator, 1000);
});

test('no usable member yields null, not zero', () => {
  const rows = [fixtures.member(100, null)];
  assert.deepEqual(build.wavg(rows, 'white_collar_pct', 'employed_total'), [null, 0.0]);
});

test('a member with no employment cannot contribute to an employment mean', () => {
  const rows = [fixtures.member(1000, 20.0), fixtures.member(0, 99.0)];
  const [value] = build.wavg(rows, 'white_collar_pct', 'employed_total');
  assert.equal(value, 20.0);
});

// ---------------------------------------------------------------- aggregate
test('the aggregate uses the weighted figure', () => {
  const rows = [fixtures.member(900, 20.0), fixtures.member(100, 80.0)];
  const agg = build.makeAggregate('TST', 'Test', rows, 'test');
  assert.equal(agg.white_collar_pct, 26.0);
});

test('partial coverage is published alongside, not silently folded in', () => {
  // 1000 of 1100 employed carry a value -> 90.91%. Without this the aggregate
  // would look like a full-coverage figure.
  const rows = [
    fixtures.member(900, 20.0), fixtures.member(100, 80.0), fixtures.member(100, null),
  ];
  const agg = build.makeAggregate('TST', 'Test', rows, 'test');
  assert.equal(agg.white_collar_pct, 26.0);
  assert.equal(agg.isco_coverage_pct_of_employment, 90.91);
});

test('full coverage reports 100', () => {
  const rows = [fixtures.member(900, 20.0), fixtures.member(100, 80.0)];
  const agg = build.makeAggregate('TST', 'Test', rows, 'test');
  assert.equal(agg.isco_coverage_pct_of_employment, 100.0);
});

test('headcounts are summed, not averaged', () => {
  const rows = [
    fixtures.member(900, 20.0, 2000), fixtures.member(100, 80.0, 500),
  ];
  const agg = build.makeAggregate('TST', 'Test', rows, 'test');
  assert.equal(agg.employed_total, 1000);
  assert.equal(agg.population_total, 2500);
  assert.equal(agg.employed_total_source, 'sum of member countries');
});

test('no member with data => the aggregate is null, and says so', () => {
  const rows = [fixtures.member(100, null), fixtures.member(200, null)];
  const agg = build.makeAggregate('TST', 'Test', rows, 'test');
  assert.equal(agg.white_collar_pct, null);
  assert.ok((agg.data_quality_flag as string).includes('0/2 members with ISCO data'));
});

test('the quality flag records member coverage', () => {
  const rows = [fixtures.member(900, 20.0), fixtures.member(100, null)];
  const agg = build.makeAggregate('TST', 'Test', rows, 'test');
  assert.ok(
    (agg.data_quality_flag as string).includes('aggregate — 1/2 members with ISCO data'),
  );
});

test('the member count is recorded', () => {
  const rows = [
    fixtures.member(900, 20.0), fixtures.member(100, 80.0), fixtures.member(50, null),
  ];
  const agg = build.makeAggregate('TST', 'Test', rows, 'test');
  assert.equal(agg.member_count, 3);
});
