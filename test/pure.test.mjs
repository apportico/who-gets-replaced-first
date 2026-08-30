// Spec 0008 R9 part 3 — the assertions that need no DOM at all.
//
// R3's text equivalent and R5's marker encoding are both built by pure
// functions specifically so they can be checked here. Asserting them over
// rendered output would couple the checks to how Leaflet lays out inside jsdom,
// which is the environment that already reports a false pass for `target-size`
// and cannot decide `color-contrast`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { METRIC_BY_KEY, markerPropsFor, NO_DATA_DASH } from '../src/utils/laborMetrics.js';
import { mapTextEntries, mapSummary } from '../src/utils/mapText.js';

const METRIC = METRIC_BY_KEY.white_collar_pct;          // OFFICIAL
const MODELED = METRIC_BY_KEY.ai_exposure_weighted_score; // MODELED

const ROWS = [
  { iso3: 'PRT', country_name: 'Portugal', white_collar_pct: 50.7148, ai_exposure_weighted_score: 0.46 },
  { iso3: 'IND', country_name: 'India', white_collar_pct: 31.5, ai_exposure_weighted_score: 0.31 },
  { iso3: 'CHN', country_name: 'China', white_collar_pct: null, ai_exposure_weighted_score: null },
  { iso3: 'ARM', country_name: 'Armenia', white_collar_pct: undefined, ai_exposure_weighted_score: undefined },
];

test('R3 — one entry per row, in order, whatever the data', () => {
  const entries = mapTextEntries(ROWS, METRIC);
  assert.equal(entries.length, ROWS.length);
  assert.deepEqual(entries.map((e) => e.iso3), ['PRT', 'IND', 'CHN', 'ARM']);
});

test('R3 — a country with no data says so, and never carries a number', () => {
  const entries = mapTextEntries(ROWS, METRIC);
  const china = entries.find((e) => e.iso3 === 'CHN');
  const armenia = entries.find((e) => e.iso3 === 'ARM');
  for (const e of [china, armenia]) {
    assert.equal(e.hasData, false);
    assert.equal(e.value, 'no data');
    assert.match(e.text, /no data$/);
    assert.ok(!/\d/.test(e.text.replace(e.name, '')), `"${e.text}" contains a number for a row with none`);
  }
});

test('R3 — every figure is announced with its tier word', () => {
  // The misleading case this requirement exists for: a MODELED index read out
  // as a bare number sounds like a measurement.
  for (const e of mapTextEntries(ROWS, MODELED).filter((x) => x.hasData)) {
    assert.equal(e.tier, 'MODELED');
    assert.match(e.text, /— MODELED$/, `"${e.text}" does not carry its tier`);
  }
  for (const e of mapTextEntries(ROWS, METRIC).filter((x) => x.hasData)) {
    assert.match(e.text, /— OFFICIAL$/);
  }
});

test('R3 — the summary publishes coverage, not just a count', () => {
  // Partial coverage is what this project refuses to paper over, and a reader
  // who cannot see the grey circles has no other way to know what is missing.
  const summary = mapSummary(ROWS, METRIC);
  assert.match(summary, /4 countries plotted/);
  assert.match(summary, /2 with data/);
  assert.match(summary, /2 without/);
  assert.match(summary, /OFFICIAL/);
});

test('R5 — the no-data encoding is applied to exactly the null rows', () => {
  const dashed = [];
  for (const row of ROWS) {
    const props = markerPropsFor(METRIC, row);
    if (props.dashArray === NO_DATA_DASH) dashed.push(row.iso3);
    // The encoding must be all-or-nothing per row: a dashed marker that also
    // claims hasData would be the blur this requirement exists to prevent.
    assert.equal(props.dashArray === null, props.hasData);
  }
  assert.deepEqual(dashed, ['CHN', 'ARM'], 'exactly the rows whose value is null or undefined');
});

test('R5 — null and undefined are both treated as no data', () => {
  // The payload uses null; a missing key reads as undefined. Treating only one
  // as absent would silently paint the other as a measured zero.
  assert.equal(markerPropsFor(METRIC, { iso3: 'X' }).hasData, false);
  assert.equal(markerPropsFor(METRIC, { iso3: 'X', white_collar_pct: null }).hasData, false);
  assert.equal(markerPropsFor(METRIC, { iso3: 'X', white_collar_pct: 0 }).hasData, true,
    'zero is a measured value, not missing data');
});
