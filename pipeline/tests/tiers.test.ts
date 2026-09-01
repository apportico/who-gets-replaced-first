/**
 * R3 -- every emitted field carries a tier, in a registry the tests can read.
 *
 * CLAUDE.md's first non-negotiable is that measured and constructed are never
 * blurred. Before spec 0004 the tier vocabulary existed only as prose in
 * report.py's methodology tables -- `pipeline/README.md` contained none of the
 * four words -- so there was nothing a test could assert against.
 *
 * Two distinct assertions, because the registry and the app payload cover
 * different column sets:
 *
 *   - pipeline-side: FIELD_TIERS keys == run.COLUMNS          -- 171
 *   - payload-side:  payload.field_tiers keys == appKeep      -- 85
 *
 * `exportAppJson` drops the five *_range columns and the 81 cross-tabs, so a
 * single assertion over both would be unsatisfiable by any correct
 * implementation.
 *
 * 0007: ported from `tests/test_tiers.py`. The prose check moved from
 * `report.py` to `report.ts` -- same assertion, the file it reads is the one
 * that now writes the report.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as C from '../config.ts';
import * as run from '../run.ts';
import * as fixtures from './fixtures.ts';

const PIPELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VALID = new Set<string>([...C.TIERS, C.NOT_A_MEASUREMENT]);

const sorted = (xs: Iterable<string>) => [...xs].sort();

// ------------------------------------------------------------------ registry
test('every emitted column has a tier', () => {
  // The point of the registry: a new column without a tier fails here.
  // Deliberately an equality rather than a subset check -- a stale entry for a
  // column that no longer exists is also a defect worth catching.
  assert.deepEqual(sorted(C.FIELD_TIERS.keys()), sorted(run.COLUMNS));
});

test('the registry has no entries for columns that do not exist', () => {
  const columns = new Set(run.COLUMNS);
  assert.deepEqual(sorted([...C.FIELD_TIERS.keys()].filter((f) => !columns.has(f))), []);
});

test('every value is in the closed set', () => {
  for (const [field, tier] of C.FIELD_TIERS) {
    assert.ok(VALID.has(tier), `${field}: ${tier}`);
  }
});

test('the four tiers are the ones CLAUDE.md names', () => {
  assert.deepEqual([...C.TIERS], ['OFFICIAL', 'DERIVED', 'PROXY', 'MODELED']);
});

test('every tier is actually used', () => {
  // A tier nothing carries is a sign the vocabulary drifted from reality.
  const used = new Set(C.FIELD_TIERS.values());
  for (const tier of C.TIERS) assert.ok(used.has(tier), tier);
});

// ------------------------------------------------------------------- anchors
// The registry must agree with what report.ts tells the reader in prose.
test('OFFICIAL is published statistics as published', () => {
  for (const field of [
    'population_total', 'labor_force_total', 'unemployment_rate_total',
    'emp_services_pct', 'gdp_per_capita_ppp',
  ]) {
    assert.equal(C.FIELD_TIERS.get(field), 'OFFICIAL', field);
  }
});

test('DERIVED is arithmetic on official statistics', () => {
  for (const field of [
    'employed_total', 'employed_share_of_population_pct', 'white_collar_pct',
    'professional_core_pct', 'blue_collar_service_pct',
  ]) {
    assert.equal(C.FIELD_TIERS.get(field), 'DERIVED', field);
  }
});

test('the ISCO shares are DERIVED, not OFFICIAL', () => {
  // ILOSTAT publishes headcounts; the percentage shares are ours.
  // applyOccupation computes 100 * group / base, so labelling these OFFICIAL
  // would present our arithmetic as a published statistic.
  assert.equal(C.FIELD_TIERS.get('isco1_managers_pct'), 'DERIVED');
  assert.equal(C.FIELD_TIERS.get('isco_source_employed_thousands'), 'DERIVED');
  // the group-0 count is passed through unchanged, so it stays OFFICIAL
  assert.equal(C.FIELD_TIERS.get('isco_armed_forces_thousands'), 'OFFICIAL');
});

test('the entry-level family is PROXY', () => {
  // Age 15-24 stands in for seniority, which no global source measures.
  for (const field of [
    'young_white_collar_pct', 'prime_white_collar_pct',
    'late_career_white_collar_pct', 'young_white_collar_employed',
  ]) {
    assert.equal(C.FIELD_TIERS.get(field), 'PROXY', field);
  }
});

test('the exposure score and the wage bill are MODELED', () => {
  assert.equal(C.FIELD_TIERS.get('ai_exposure_weighted_score'), 'MODELED');
  assert.equal(C.FIELD_TIERS.get('exposed_wage_bill_ppp'), 'MODELED');
});

test('the squeeze index is MODELED, not DERIVED', () => {
  // SQUEEZE_COMPONENTS' 0.25/0.30/0.25/0.20 are assigned by this project,
  // exactly as the ISCO exposure weights are. Two composites with
  // project-assigned weights must not carry different tiers.
  assert.equal(C.FIELD_TIERS.get('entry_level_squeeze_index'), 'MODELED');
});

test('identity and provenance are not measurements', () => {
  for (const field of [
    'iso3', 'country_name', 'data_year_population', 'data_year_occupation',
    'data_quality_flag', 'data_source_override', 'isco_classification',
  ]) {
    assert.equal(C.FIELD_TIERS.get(field), C.NOT_A_MEASUREMENT, field);
  }
});

test('the coverage percentages are DERIVED', () => {
  // Coverage is computed from the wavg denominator, so it is ours.
  assert.equal(C.FIELD_TIERS.get('isco_coverage_pct_of_employment'), 'DERIVED');
});

// -------------------------------------------------- prose agrees with registry
// A registry that contradicts the prose beside it just relocates the doubt.
const reportSource = readFileSync(path.join(PIPELINE, 'report.ts'), 'utf8');

test('the report no longer calls the squeeze index DERIVED', () => {
  assert.ok(!reportSource.includes('| Entry-level squeeze index | **DERIVED composite**'));
});

test('the report calls the squeeze index MODELED', () => {
  assert.ok(reportSource.includes('| Entry-level squeeze index | **MODELED composite**'));
});

// --------------------------------------------------------------- app payload
/**
 * R3 -- what `exportAppJson` writes. NOT what `src/data/global_labor.json`
 * contains.
 *
 * Read that distinction before trusting this block. Every test below asserts
 * on a payload regenerated from two fixture rows into a temp file. None opens
 * the committed artifact, so all six passed for the whole life of #57 while
 * the file the app actually imports had no `field_tiers` key at all -- green
 * against precisely the defect they appear to cover.
 *
 * The artifact is covered by `app_payloads.test.ts` (spec 0009 R2). Add
 * generator-side assertions here; add artifact-side ones there.
 */
function generatePayload(rows = [fixtures.country('XXX'), fixtures.country('YYY')]) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wgrf-tiers-'));
  const p = path.join(dir, 'app', 'global_labor.json');
  try {
    fixtures.quiet(() => run.exportAppJson(rows, p));
    return JSON.parse(readFileSync(p, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const payload = generatePayload();

test('the payload carries field_tiers', () => {
  assert.ok('field_tiers' in payload);
});

test('the payload tiers match the columns it actually ships', () => {
  // 85 of 171: exportAppJson drops five *_range and 81 cross-tabs.
  //
  // 0010 R20. The cross-tab columns are excluded from this payload and shipped
  // per country instead. They are still tiered -- the gate in exportAppJson
  // runs over the full column list before the exclusion -- and their tiers
  // travel in each per-country artefact's own block, which crosstabs.test.ts
  // asserts.
  const keep = run.COLUMNS.filter((c) => !c.endsWith('_range'));
  const crosstabs = new Set(C.CROSSTAB_COLUMNS);
  const appKeep = keep.filter((c) => !crosstabs.has(c));
  assert.deepEqual(sorted(Object.keys(payload.field_tiers)), sorted(appKeep));
  // 84 -> 85 when 0011 R2 added `iso2`. The literal is deliberate: it is the
  // assertion that fails when a column is added without a tier, so it moves by
  // hand, in the change that adds one.
  assert.equal(Object.keys(payload.field_tiers).length, 85);
  // The exclusion is the only thing that shrinks it, and it must not have
  // taken anything else with it.
  assert.equal(keep.length - appKeep.length, C.CROSSTAB_COLUMNS.length);
});

test('the payload tiers cover every key in a row', () => {
  // Every field the app can render must be labellable.
  for (const key of Object.keys(payload.rows[0])) {
    assert.ok(key in payload.field_tiers, key);
  }
});

test('the payload does not claim coverage of dropped columns', () => {
  for (const field of run.COLUMNS) {
    if (field.endsWith('_range')) assert.ok(!(field in payload.field_tiers), field);
  }
});

test('the payload values are in the closed set', () => {
  for (const [field, tier] of Object.entries(payload.field_tiers)) {
    assert.ok(VALID.has(tier as string), `${field}: ${tier}`);
  }
});

test('the export refuses an untiered column with a legible message', () => {
  // Fail loudly, and say what to do about it. Without the guard this surfaces
  // as a bare lookup miss, which does not tell the next person that the fix is
  // to add a registry entry.
  const original = [...run.COLUMNS];
  run.COLUMNS.push('brand_new_untiered_column');
  try {
    assert.throws(
      () => generatePayload([fixtures.country('XXX')]),
      (e: Error) =>
        e.message.includes('brand_new_untiered_column') &&
        e.message.includes('FIELD_TIERS') &&
        e.message.includes('NOT_A_MEASUREMENT'),
    );
  } finally {
    run.COLUMNS.splice(0, run.COLUMNS.length, ...original);
  }
});
