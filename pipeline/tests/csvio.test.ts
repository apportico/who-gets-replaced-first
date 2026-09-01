/**
 * 0007 R2. The hand-rolled CSV reader/writer round-trips the committed files.
 *
 * The acceptance is deliberately the six real outputs rather than a set of
 * hand-written cases: a dialect is only right if it reproduces the file the
 * pipeline actually wrote, quoted fields, CRLF terminators, embedded commas,
 * em-dashes in `data_quality_flag` and all. Read then write must reproduce the
 * input exactly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { iterCsvColumns, readCsv, readCsvDict, writeCsv, writeCsvRow } from '../csvio.ts';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILES = [
  'global_labor_dataset.csv',
  'global_labor_panel.csv',
  'ai_exposure_sensitivity.csv',
  'crosscheck_eurostat.csv',
  'outliers_for_review.csv',
  'pilot_labor_dataset.csv',
];

test('R2: all six committed CSVs round-trip byte for byte', () => {
  for (const name of FILES) {
    const original = readFileSync(path.join(DATA, name), 'utf8');
    const rows = readCsv(original);
    const rebuilt = writeCsv(rows[0], rows.slice(1));
    assert.equal(rebuilt, original, `${name} does not round-trip`);
  }
});

test('R2: the terminator is CRLF, as `newline=""` produces', () => {
  for (const name of FILES) {
    const raw = readFileSync(path.join(DATA, name));
    assert.ok(raw.includes('\r\n'), `${name} is not CRLF`);
    // and no bare LF outside a CRLF pair
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === 0x0a) assert.equal(raw[i - 1], 0x0d, `${name}: bare LF at ${i}`);
    }
  }
});

test('R2: QUOTE_MINIMAL quotes only what has to be quoted', () => {
  assert.equal(writeCsvRow(['a', 'b']), 'a,b\r\n');
  assert.equal(writeCsvRow(['a,b']), '"a,b"\r\n');
  assert.equal(writeCsvRow(['say "hi"']), '"say ""hi"""\r\n');
  assert.equal(writeCsvRow(['line\nbreak']), '"line\nbreak"\r\n');
  assert.equal(writeCsvRow(['']), '\r\n');
  // an em-dash is not special: data_quality_flag is full of them
  assert.equal(writeCsvRow(['partial — no ISCO data']), 'partial — no ISCO data\r\n');
});

test('R2: the reader resolves doubled quotes and embedded terminators', () => {
  const rows = readCsv('a,"b,c","d""e"\r\n"multi\nline",f,g\r\n');
  assert.deepEqual(rows, [['a', 'b,c', 'd"e'], ['multi\nline', 'f', 'g']]);
});

test('R2: DictReader keys on the header row', () => {
  const rows = readCsvDict('iso3,value\r\nGBR,8.8633\r\nFRA,\r\n');
  assert.deepEqual(rows, [
    { iso3: 'GBR', value: '8.8633' },
    { iso3: 'FRA', value: '' },
  ]);
});

test('R2: the streaming column reader agrees with the whole-file reader', () => {
  // The two share a grammar and must not drift: the streaming one reads the
  // 55MB ILOSTAT flows, the other reads the committed outputs.
  const name = 'crosscheck_eurostat.csv';
  const text = readFileSync(path.join(DATA, name), 'utf8');
  const cols = ['iso3', 'delta_pp'];
  const streamed = [...iterCsvColumns(text, cols)];
  const whole = readCsvDict(text).map((r) => cols.map((c) => r[c]));
  assert.deepEqual(streamed, whole);
});

test('R2: a field over the size ceiling is refused rather than swallowed', () => {
  // `csv.field_size_limit(10_000_000)` at build.py:10. An unterminated quote in
  // a source file should fail loudly here, not consume the rest of the input.
  const runaway = '"' + 'x'.repeat(10_000_002);
  assert.throws(() => readCsv(runaway), RangeError);
});
