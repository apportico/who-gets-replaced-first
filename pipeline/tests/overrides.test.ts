/**
 * R6 -- an override without a citation is refused, not merged.
 *
 * CLAUDE.md: "Never invent a figure to fill a gap. manual_overrides.json exists
 * for nationally-sourced numbers and *requires* a citation, a year and a
 * retrieval date."
 *
 * Every fixture here is written to a temp file. The suite must never need, or
 * encourage, inventing a figure for Armenia, New Zealand or Saudi Arabia --
 * those gaps are unfilled on purpose, and a test that filled one to prove the
 * merge works would be the exact failure this requirement guards.
 *
 * 0007: ported from `tests/test_overrides.py`, plus the block R1 adds -- the
 * override loader types numbers from the raw JSON token text, which is the one
 * clause of R1 that nothing else asserts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as build from '../build.ts';
import type { Row } from '../build.ts';
import * as fixtures from './fixtures.ts';
import { overrideKinds } from '../overrides.ts';
import { pySum, pySumFloat, pySumInt, toBigInt, type PyNum } from '../pynum.ts';
import { asInt } from '../schema.ts';

const PIPELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED = ['value', 'year', 'source_name', 'source_url', 'retrieved', 'note'];

const COMPLETE = {
  value: 42.5,
  year: 2024,
  source_name: 'Test Statistical Office',
  source_url: 'https://example.invalid/lfs',
  retrieved: '2026-08-30',
  note: 'Synthetic fixture -- not a real figure for any real country.',
};

/** Written as TEXT, not via JSON.stringify: R1 turns on the literal spelling. */
function writeOverrides(dir: string, body: string): string {
  const p = path.join(dir, 'overrides.json');
  writeFileSync(p, body, 'utf8');
  return p;
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'wgrf-overrides-'));
}

function apply(body: string, rows: Map<string, Row>): void {
  const dir = tempDir();
  try {
    fixtures.quiet(() => build.applyOverrides(rows, writeOverrides(dir, body)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------- the override contract
test('a complete entry is applied and tagged', () => {
  const rows = fixtures.byIso(fixtures.country('XXX', { white_collar_pct: null }));
  apply(JSON.stringify({ overrides: { XXX: { white_collar_pct: COMPLETE } } }), rows);
  const row = rows.get('XXX') as Row;
  assert.equal(row.white_collar_pct, 42.5);
  assert.equal(
    row.data_source_override,
    'white_collar_pct=42.5 (2024, Test Statistical Office)',
  );
});

test('drop any one of the six required keys and the value must not land', () => {
  // Parameterised over all six so that relaxing the contract to five keys
  // fails here rather than in production.
  for (const key of REQUIRED) {
    const spec: Record<string, unknown> = { ...COMPLETE };
    delete spec[key];
    const rows = fixtures.byIso(fixtures.country('XXX', { white_collar_pct: 11.0 }));
    apply(JSON.stringify({ overrides: { XXX: { white_collar_pct: spec } } }), rows);
    const row = rows.get('XXX') as Row;
    assert.equal(row.white_collar_pct, 11.0, `missing ${key}`);
    assert.equal(row.data_source_override, null, `missing ${key}`);
  }
});

test('the retrieval date is the freshness audit trail, and is required', () => {
  const spec: Record<string, unknown> = { ...COMPLETE };
  delete spec.retrieved;
  const rows = fixtures.byIso(fixtures.country('XXX', { white_collar_pct: 11.0 }));
  apply(JSON.stringify({ overrides: { XXX: { white_collar_pct: spec } } }), rows);
  assert.equal((rows.get('XXX') as Row).white_collar_pct, 11.0);
});

test("a typo'd ISO3 is skipped without raising, and without applying", () => {
  const rows = fixtures.byIso(fixtures.country('XXX', { white_collar_pct: 11.0 }));
  apply(JSON.stringify({ overrides: { ZZZ: { white_collar_pct: COMPLETE } } }), rows);
  assert.equal((rows.get('XXX') as Row).white_collar_pct, 11.0);
});

test('absence is recorded as null, not left as a missing key', () => {
  const rows = fixtures.byIso(fixtures.country('XXX'));
  apply(JSON.stringify({ overrides: {} }), rows);
  const row = rows.get('XXX') as Row;
  assert.ok('data_source_override' in row);
  assert.equal(row.data_source_override, null);
});

test('multiple overrides on one row are all tagged', () => {
  const second = { ...COMPLETE, value: 7.5 };
  const rows = fixtures.byIso(fixtures.country('XXX'));
  apply(
    JSON.stringify({
      overrides: { XXX: { white_collar_pct: COMPLETE, lfp_rate_total: second } },
    }),
    rows,
  );
  const tag = (rows.get('XXX') as Row).data_source_override as string;
  assert.ok(tag.includes('white_collar_pct=42.5'), tag);
  assert.ok(tag.includes('lfp_rate_total=7.5'), tag);
});

// ------------------------------------------------- the committed overrides file
// The real manual_overrides.json must itself satisfy the contract.
const committed = JSON.parse(
  readFileSync(path.join(PIPELINE, 'manual_overrides.json'), 'utf8'),
);

test('overrides is an object', () => {
  assert.equal(typeof committed.overrides, 'object');
  assert.ok(committed.overrides !== null && !Array.isArray(committed.overrides));
});

test('every committed entry carries all six keys', () => {
  // Passes today with overrides == {}; fails on a future uncited entry.
  for (const [iso3, fields] of Object.entries(committed.overrides as Record<string, object>)) {
    for (const [field, spec] of Object.entries(fields)) {
      assert.deepEqual(
        REQUIRED.filter((k) => !(k in (spec as object))),
        [],
        `${iso3}.${field} is missing required keys`,
      );
    }
  }
});

test('ARM, NZL and SAU stay documented rather than filled', () => {
  const gaps = (committed._unfilled_gaps ?? {}) as Record<string, string>;
  for (const area of ['ARM', 'NZL', 'SAU']) {
    assert.ok(area in gaps, area);
    assert.ok(gaps[area].trim().length > 0, area);
    assert.ok(!(area in committed.overrides), area);
  }
});

// --------------------------------------------- 0007 R1. the tokenising loader
/**
 * The clause that gives `pySum` its only pipeline caller is also the one clause
 * R1's other criteria do not touch, and R3 cannot: `overrides` is `{}` today,
 * so byte identity passes whatever this does. An implementer reaching for
 * `JSON.parse` would get a green R1, a green R3, and a column that publishes a
 * different number from the Python for the same file.
 */
test('R1: the same field written 15000000 and 15000000.0 gets int and float', () => {
  const body = JSON.stringify({
    overrides: {
      AAA: { population_15_24: { ...COMPLETE, value: '@INT@' } },
      BBB: { population_15_24: { ...COMPLETE, value: '@FLOAT@' } },
    },
  })
    // Written into the TEXT, because `JSON.stringify(15000000.0)` is
    // "15000000" -- JavaScript cannot even spell the distinction in an object.
    .replace('"@INT@"', '15000000')
    .replace('"@FLOAT@"', '15000000.0');

  const a = fixtures.country('AAA');
  const b = fixtures.country('BBB');
  const rows = fixtures.byIso(a, b);
  apply(body, rows);

  assert.equal(a.population_15_24, 15000000);
  assert.equal(b.population_15_24, 15000000);
  // Same JavaScript number; different Python type, and that is the finding.
  assert.equal(overrideKinds.get(a)?.get('population_15_24'), 'int');
  assert.equal(overrideKinds.get(b)?.get('population_15_24'), 'float');
});

test('R1: an aggregate over a column carrying an override reproduces sum()', () => {
  // The expected values come from the pinned CPython 3.13:
  //   sum([84.84239393266276, 387, 570])            -> 1041.8423939326626
  //   sum([387, 84.84239393266276, 570])            -> 1041.8423939326626
  // and the all-float fold of the same elements differs.
  const mixed: PyNum[] = [
    { kind: 'float', value: 84.84239393266276 },
    { kind: 'int', value: 387n },
    { kind: 'int', value: 570n },
  ];
  assert.equal(pySum(mixed), 1041.8423939326626);
  // Treating the column as homogeneous -- what JSON.parse would force -- gives
  // a different published number.
  assert.notEqual(pySumFloat(mixed.map((m) => Number(m.value))), pySum(mixed));
  // And the pure-int path is exact where a double fold is not.
  assert.equal(pySumInt([387n, 570n].map((v) => v)), 957n);
  assert.equal(toBigInt(asInt(957)), 957n);
});
