/**
 * R8 -- the committed CSVs' headers match run.COLUMNS.
 *
 * This is the check that would have caught the drift it was written for.
 * `pilot_labor_dataset.csv` sat in the repo at 87 columns against COLUMNS' 89,
 * still carrying `early_career_white_collar_pct` and `data_year_early_career`
 * -- the columns spec 0002 R11 replaced when it was revised to the
 * career-stage profile. Nothing failed, because nothing looked.
 *
 * Header drift is quiet by nature: the file still parses, still has plausible
 * numbers, and only misleads whoever reads a column that no longer means what
 * its name says.
 *
 * Note these assert against files the pipeline *writes*. They are not R7's
 * golden master -- that lives in tests/fixtures/expected/ precisely so a run
 * cannot overwrite the thing it is being compared against.
 *
 * 0007: ported from `tests/test_columns.py`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as run from '../run.ts';
import { readCsv, readCsvDict } from '../csvio.ts';

const PIPELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(PIPELINE, 'data');
const COMMITTED = ['global_labor_dataset.csv', 'pilot_labor_dataset.csv'];

// Retired by 0002 R11's revision to the career-stage profile. Named explicitly
// so their reappearance is a test failure rather than an archaeology exercise.
const RETIRED = ['early_career_white_collar_pct', 'data_year_early_career'];

function header(name: string): string[] {
  return readCsv(readFileSync(path.join(DATA, name), 'utf8'))[0];
}

test('headers match COLUMNS in content and order', () => {
  // Order matters: a CSV is positional, so a reordering is a data bug.
  for (const name of COMMITTED) {
    assert.deepEqual(header(name), run.COLUMNS, name);
  }
});

test('headers have the expected width', () => {
  for (const name of COMMITTED) {
    assert.equal(header(name).length, run.COLUMNS.length, name);
  }
});

test('no retired column has come back', () => {
  for (const name of COMMITTED) {
    for (const column of RETIRED) {
      assert.ok(!header(name).includes(column), `${name}: ${column}`);
    }
  }
});

test('the career-stage columns 0002 R11 introduced are present', () => {
  for (const name of COMMITTED) {
    for (const column of [
      'prime_white_collar_pct', 'late_career_white_collar_pct',
      'prime_white_collar_year', 'late_career_white_collar_year',
    ]) {
      assert.ok(header(name).includes(column), `${name}: ${column}`);
    }
  }
});

// ------------------------------------------------------------ pilot contents
// The pilot output is the 7-row batch, not the 6 areas of C.PILOT.
const pilot = new Map(
  readCsvDict(readFileSync(path.join(DATA, 'pilot_labor_dataset.csv'), 'utf8')).map((r) => [
    r.iso3,
    r,
  ]),
);

test('the pilot carries the seven expected rows', () => {
  assert.deepEqual(
    [...pilot.keys()].sort(),
    ['ARM', 'CHN', 'DEU', 'EU27', 'IND', 'USA', 'WLD'],
  );
});

test('the EU27 row is present', () => {
  // EU27 is a weighted aggregate over all 27 members. Its presence is what
  // forces the golden-master fixture to cover 32 areas rather than the 6 in
  // C.PILOT.
  assert.ok(pilot.has('EU27'));
});

test('the regenerated USA row carries the career-stage value', () => {
  // The specific evidence that the stale file was actually replaced.
  const usa = pilot.get('USA') as Record<string, string>;
  assert.ok(usa.prime_white_collar_pct);
  assert.notEqual(usa.prime_white_collar_pct, '');
});
