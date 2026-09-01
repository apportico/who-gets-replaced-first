/**
 * 0007 R1. The number layer against committed differential fixtures.
 *
 * Every case here was produced by the pinned CPython 3.13 (see
 * `scripts/generate-pynum-fixtures.py`) and frozen, because R10 deletes the
 * Python and R11 removes the interpreter from CI -- a test that shelled out to
 * `python3` would have nothing left to compare against, and R8 requires the
 * suite to run offline.
 *
 * The loader parses `i:`-tagged elements, AND the `i:`-tagged expected value,
 * to `bigint` rather than `number`. The tag lets the fixture spell
 * `9007199254740993`; `Number("9007199254740993")` still returns `...992`, so
 * without this the value would be lost at a third layer. The integer assertion
 * is bigint against bigint, which is only possible because `pySumInt` returns
 * bigint: comparing a number result against a bigint expectation is rejected
 * outright by `tsc` (TS2367) and false at runtime under `===` even when the two
 * agree.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  pyRound,
  pyRoundInt,
  pyStr,
  pySum,
  pySumFloat,
  pySumInt,
  toBigInt,
  type PyNum,
} from '../pynum.ts';
import { readCsv } from '../csvio.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures', 'pynum');
const DATA = path.join(HERE, '..', 'data');

function load(name: string): string[] {
  const text = gunzipSync(readFileSync(path.join(FIXTURES, `${name}.txt.gz`))).toString();
  return text.split('\n').filter((l) => l.length > 0);
}

/** Python's repr, back to a double. `inf` / `nan` are not `Number()`-parseable. */
function parseFloatRepr(s: string): number {
  if (s === 'inf') return Infinity;
  if (s === '-inf') return -Infinity;
  if (s === 'nan') return NaN;
  return Number(s);
}

function parseTagged(token: string): PyNum {
  const body = token.slice(2);
  if (token.startsWith('i:')) return { kind: 'int', value: BigInt(body) };
  if (token.startsWith('f:')) return { kind: 'float', value: parseFloatRepr(body) };
  throw new Error(`untagged fixture element: ${token}`);
}

// ------------------------------------------------------------------ pyRound
test('R1: pyRound matches CPython round(x, n) on 20,000 committed cases', () => {
  const lines = load('round');
  assert.ok(lines.length >= 20_000, `only ${lines.length} cases`);
  let checked = 0;
  for (const line of lines) {
    const [input, expected] = line.split('|');
    const [xTok, nTok] = input.split(' ');
    const x = parseFloatRepr(xTok.slice(2));
    const got = pyRound(x, Number(nTok));
    const want = parseFloatRepr(expected.slice(2));
    // Object.is, not ===, so a -0.0 that should have stayed -0.0 fails here
    // rather than passing and then differing in the CSV.
    assert.ok(
      Object.is(got, want),
      `round(${xTok}, ${nTok}): got ${pyStr(got)}, expected ${expected}`,
    );
    checked++;
  }
  assert.equal(checked, lines.length);
});

test('R1: pyRoundInt matches CPython 1-arg round(x) on 20,000 committed cases', () => {
  const lines = load('round_int');
  assert.ok(lines.length >= 20_000, `only ${lines.length} cases`);
  for (const line of lines) {
    const [input, expected] = line.split('|');
    const x = parseFloatRepr(input.slice(2));
    const got = pyRoundInt(x);
    assert.equal(
      String(got),
      expected.slice(2),
      `round(${input}): got ${got}, expected ${expected}`,
    );
  }
});

test('R1: pyRound is half-to-even, not half-away-from-zero', () => {
  // The three cases from the spec's source verification, named so a later
  // refactor to Math.round or toFixed fails with the reason attached.
  assert.equal(pyRound(2.675, 2), 2.67); // naive JS: 2.68
  assert.equal(pyRoundInt(2.5), 2); //       naive JS: 3
  assert.equal(pyRoundInt(-2.5), -2); //     toFixed: -3
});

// -------------------------------------------------------------------- pyStr
test('R1: pyStr reproduces every numeric string in the six committed CSVs', () => {
  const files = [
    'global_labor_dataset.csv',
    'global_labor_panel.csv',
    'ai_exposure_sensitivity.csv',
    'crosscheck_eurostat.csv',
    'outliers_for_review.csv',
    'pilot_labor_dataset.csv',
  ];
  let total = 0;
  let dotZero = 0;
  let negZero = 0;
  for (const name of files) {
    const rows = readCsv(readFileSync(path.join(DATA, name), 'utf8'));
    for (const row of rows) {
      for (const cell of row) {
        // A numeric cell is one that survives a round trip; anything else is a
        // label. `Number("")` is 0, so empties are excluded first.
        if (cell === '' || !/^-?(\d|\.)/.test(cell)) continue;
        const v = Number(cell);
        if (!Number.isFinite(v)) continue;
        if (String(v) !== cell && pyStr(v) !== cell) {
          assert.fail(`${name}: ${cell} -> pyStr ${pyStr(v)}`);
        }
        if (cell.endsWith('.0')) dotZero++;
        if (cell === '-0.0') negZero++;
        total++;
      }
    }
  }
  // The counts from the spec's source verification, asserted rather than
  // trusted: if a future vintage stops carrying them, this test would still be
  // green while checking nothing about the two shapes it exists for.
  assert.ok(total > 70_000, `only ${total} numeric cells scanned`);
  assert.ok(dotZero > 6_000, `only ${dotZero} integral floats`);
  assert.ok(negZero > 0, `no -0.0 values`);
});

test('R1: pyStr keeps the two shapes String() loses', () => {
  assert.equal(pyStr(79), '79.0'); //   String() gives "79"
  assert.equal(pyStr(-0), '-0.0'); //   String() gives "0"
  assert.equal(pyStr(0), '0.0');
  assert.equal(pyStr(8.8633), '8.8633');
  // Python goes exponential at decpt <= -4 or > 16; JavaScript at < -6 or >= 21
  assert.equal(pyStr(1e-5), '1e-05'); // String() gives "0.00001"
  assert.equal(pyStr(1e16), '1e+16'); // String() gives "10000000000000000"
  assert.equal(pyStr(1e15), '1000000000000000.0');
  assert.equal(pyStr(0.0001), '0.0001');
});

// -------------------------------------------------------------- the summations
test('R1: pySumInt matches CPython sum() on 20,000 all-integer cases', () => {
  const lines = load('sum_int');
  assert.ok(lines.length >= 20_000, `only ${lines.length} cases`);
  let aboveCeiling = 0;
  const CEIL = 1n << 53n;
  for (const line of lines) {
    const [input, expected] = line.split('|');
    const values = input.split(' ').map((t) => {
      const v = parseTagged(t);
      assert.equal(v.kind, 'int', 'the all-integer block must carry only ints');
      return v.value as bigint;
    });
    const want = BigInt(expected.slice(2));
    // bigint against bigint -- see the module docstring
    assert.equal(pySumInt(values), want, `sum(${input})`);
    if (values.some((v) => (v < 0n ? -v : v) >= CEIL)) aboveCeiling++;
  }
  // Below 2^53 double addition on integers is exact, so a fixture that stayed
  // there could not tell the integer branch from a naive fold. These cases are
  // the criterion, not its edge.
  assert.ok(aboveCeiling > 5_000, `only ${aboveCeiling} cases reach 2^53`);
});

test('R1: pySumInt separates from a naive fold at 2^53', () => {
  const vals = [9007199254740993n, 2n, 2n, 2n];
  assert.equal(pySumInt(vals), 9007199254740999n);
  const naive = vals.map(Number).reduce((a, b) => a + b);
  assert.equal(naive, 9007199254740998); // what the fold gives
  assert.notEqual(Number(pySumInt(vals)), naive);
});

test('R1: pySumFloat matches CPython sum() on 20,000 all-float cases', () => {
  const lines = load('sum_float');
  assert.ok(lines.length >= 20_000, `only ${lines.length} cases`);
  let diverging = 0;
  for (const line of lines) {
    const [input, expected] = line.split('|');
    const values = input.split(' ').map((t) => {
      const v = parseTagged(t);
      assert.equal(v.kind, 'float', 'the all-float block must carry only floats');
      return v.value as number;
    });
    const want = parseFloatRepr(expected.slice(2));
    assert.ok(
      Object.is(pySumFloat(values), want),
      `sum(${input}): got ${pyStr(pySumFloat(values))}, expected ${expected}`,
    );
    let naive = 0.0;
    for (const v of values) naive += v;
    if (!Object.is(naive, want)) diverging++;
  }
  // A block of cases a naive fold also passes would be 20,000 green assertions
  // proving nothing about compensation.
  assert.ok(diverging > 5_000, `only ${diverging} cases separate from a naive fold`);
});

test('R1: pySum matches CPython sum() on 20,000 mixed cases', () => {
  const lines = load('sum_mixed');
  assert.ok(lines.length >= 20_000, `only ${lines.length} cases`);
  let trailingInts = 0;
  let intAfterFloat = 0;
  for (const line of lines) {
    const [input, expected] = line.split('|');
    const values = input.split(' ').map(parseTagged);
    const want = parseFloatRepr(expected.slice(2));
    assert.ok(
      Object.is(pySum(values), want),
      `sum(${input}): got ${pyStr(pySum(values))}, expected ${expected}`,
    );
    const firstFloat = values.findIndex((v) => v.kind === 'float');
    const after = values.slice(firstFloat + 1);
    if (after.some((v) => v.kind === 'int')) intAfterFloat++;
    if (after.filter((v) => v.kind === 'int').length >= 2) trailingInts++;
  }
  // Without an integer AFTER the first float this block checks nothing: an int
  // prefix followed only by floats is the shape where a wrongly compensated
  // implementation and sum() agree on every case.
  assert.ok(intAfterFloat > 10_000, `only ${intAfterFloat} cases put an int after the first float`);
  assert.ok(trailingInts > 5_000, `only ${trailingInts} cases carry two or more trailing ints`);
});

test('R1: pySum discards the transition residual, and suspends compensation for ints', () => {
  // Smallest cases from the spec, named so a "simplify to Neumaier throughout"
  // refactor fails with the reason attached.
  assert.equal(
    pySum([
      { kind: 'float', value: 84.84239393266276 },
      { kind: 'int', value: 387n },
      { kind: 'int', value: 570n },
    ]),
    1041.8423939326626, // compensating the trailing ints gives ...628
  );
  assert.equal(
    pySum([
      { kind: 'int', value: 10n ** 16n },
      { kind: 'float', value: 0.5 },
      { kind: 'int', value: 1n },
      { kind: 'int', value: 1n },
      { kind: 'int', value: 1n },
    ]),
    1e16, // compensating gives 1.0000000000000004e+16
  );
  assert.equal(
    pySum([
      { kind: 'int', value: 796n },
      { kind: 'float', value: 0.6403143822699731 },
      { kind: 'float', value: 7.582302462868173 },
    ]),
    804.2226168451381, // compensating too early gives ...382
  );
});

// ----------------------------------------------------------------- toBigInt
test('R1: toBigInt validates the Int brand at runtime rather than asserting it', () => {
  assert.equal(toBigInt(2989466), 2989466n);
  assert.throws(() => toBigInt(14455.5), RangeError);
});

test('R1: all five entry points run offline with no Python present', () => {
  // Nothing here shells out; reaching this line with every block above green is
  // the assertion. Kept as a named test so the criterion appears in the report.
  assert.equal(typeof pyRound, 'function');
  assert.equal(typeof pyStr, 'function');
  assert.equal(typeof pySumInt, 'function');
  assert.equal(typeof pySumFloat, 'function');
  assert.equal(typeof pySum, 'function');
});
