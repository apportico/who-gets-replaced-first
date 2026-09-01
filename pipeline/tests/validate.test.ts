/**
 * R9 -- the published invariants stay assertable.
 *
 * `build.validate` already encodes the arithmetic that must hold. These tests
 * check that it *catches* each violation, so the checker itself cannot rot
 * into returning an empty list -- a validator that never fails is worse than
 * none, because it reads as evidence.
 *
 * 0007: ported from `tests/test_validate.py`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as build from '../build.ts';
import * as fixtures from './fixtures.ts';

test('clean rows produce no problems', () => {
  const row = fixtures.country('XXX', {
    lfp_rate_total: 60.0,
    pop_0_14_pct: 20.0, pop_15_64_pct: 65.0, pop_65plus_pct: 15.0,
    emp_agriculture_pct: 10.0, emp_industry_pct: 25.0, emp_services_pct: 65.0,
    white_collar_pct: 40.0, blue_collar_service_pct: 60.0,
  });
  assert.deepEqual(build.validate([row]), []);
});

test('the partition check: 60 + 60 = 120 is not a workforce', () => {
  const row = fixtures.country('BAD', {
    white_collar_pct: 60.0, blue_collar_service_pct: 60.0,
  });
  const problems = build.validate([row]);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes('BAD'));
  assert.ok(problems[0].includes('white+blue collar = 120.00'), problems[0]);
});

test('a percentage outside range is caught', () => {
  const row = fixtures.country('BAD', { lfp_rate_total: 150.0 });
  const problems = build.validate([row]);
  assert.ok(problems.some((p) => p.includes('lfp_rate_total=150.0')), problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('outside [0,100]')), problems.join('\n'));
});

test('a negative percentage is caught', () => {
  const row = fixtures.country('BAD', { lfp_rate_total: -5.0 });
  const problems = build.validate([row]);
  assert.ok(problems.some((p) => p.includes('outside [0,100]')), problems.join('\n'));
});

test('age bands must sum to about 100', () => {
  const row = fixtures.country('BAD', {
    pop_0_14_pct: 20.0, pop_15_64_pct: 65.0, pop_65plus_pct: 30.0,
  });
  const problems = build.validate([row]);
  assert.ok(
    problems.some((p) => p.includes('age bands sum to 115.00')),
    problems.join('\n'),
  );
});

test('sector shares must sum to about 100', () => {
  const row = fixtures.country('BAD', {
    emp_agriculture_pct: 10.0, emp_industry_pct: 25.0, emp_services_pct: 90.0,
  });
  const problems = build.validate([row]);
  assert.ok(
    problems.some((p) => p.includes('sector shares sum to 125.00')),
    problems.join('\n'),
  );
});

test('the tolerances allow real-world rounding', () => {
  // Published shares rarely sum to exactly 100; the checks allow slack.
  // Pinning the tolerances stops someone "tightening" them into a validator
  // that cries wolf on every real country.
  const row = fixtures.country('XXX', {
    pop_0_14_pct: 20.0, pop_15_64_pct: 65.0, pop_65plus_pct: 15.4,
    emp_agriculture_pct: 10.0, emp_industry_pct: 25.0, emp_services_pct: 66.2,
    white_collar_pct: 40.0, blue_collar_service_pct: 60.3,
  });
  assert.deepEqual(build.validate([row]), []);
});

test('a row of nulls is legitimate and must not be reported as invalid', () => {
  assert.deepEqual(build.validate([fixtures.country('XXX')]), []);
});

test('a problem names the row it came from', () => {
  const good = fixtures.country('GOOD', {
    white_collar_pct: 40.0, blue_collar_service_pct: 60.0,
  });
  const bad = fixtures.country('BAD', {
    white_collar_pct: 60.0, blue_collar_service_pct: 60.0,
  });
  const problems = build.validate([good, bad]);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].startsWith('BAD:'), problems[0]);
});
