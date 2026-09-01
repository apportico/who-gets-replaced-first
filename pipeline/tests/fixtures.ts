/**
 * Synthetic row builders shared across the suite.
 *
 * Rows are plain dictionaries everywhere in the pipeline, so a fixture is just
 * an object with the fields a given test cares about. These helpers exist so
 * ten test modules do not each hand-roll one, and so the *shape* of a row is
 * stated once.
 *
 * Nothing here builds a row from a real data file. The one exception is
 * `weights()`, which reads the committed `ai_exposure_isco.json` -- `derive`
 * indexes `weights[f]` for every ISCO group, so the real weights are the only
 * workable input. Tests that need real *data* use the golden master fixture
 * instead (R7).
 *
 * 0007: ported from `tests/fixtures.py`.
 */
import * as C from '../config.ts';
import * as run from '../run.ts';
import type { Row } from '../build.ts';

/**
 * Swallow the pipeline's progress printing.
 *
 * Several pipeline functions report progress on stdout -- useful on a real
 * run, noise in a test suite, where it buries the one line that says whether
 * anything failed. Returns the captured text so a test can assert on it.
 */
export function quiet<T>(fn: () => T): { value: T; log: string } {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = (chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  };
  try {
    return { value: fn(), log: chunks.join('') };
  } finally {
    (process.stdout as { write: unknown }).write = original;
  }
}

/**
 * The real AI exposure weights, keyed by column name.
 *
 * `derive` indexes weights[f] for every ISCO group field, so tests use the
 * committed weights rather than a stub. These are MODELED values -- see spec
 * 0004 R3 -- and the tests here assert plumbing, never the weights themselves.
 */
export function weights(): Record<string, number> {
  return run.loadWeights();
}

/**
 * A country row with every field a test might assert on set to null.
 *
 * Defaulting to null rather than omitting keys matters: the pipeline
 * distinguishes "absent" from "null" in places, and a fixture that omits a key
 * can pass a test that a real null row would fail.
 */
export function country(iso3 = 'TST', over: Row = {}): Row {
  const row: Row = {
    iso3,
    country_name: `Test ${iso3}`,
    region: 'Test Region',
    income_group: 'Test Income',
    row_type: 'country',
    capital: null,
    lat: null,
    lon: null,
    population_total: null,
    labor_force_total: null,
    unemployment_rate_total: null,
    emp_to_pop_ratio_15plus: null,
    pop_15_64_pct: null,
    pop_65plus_pct: null,
    employed_total: null,
    isco_source_employed_thousands: null,
    data_year_occupation: null,
    isco_classification: null,
    isco_groups_reported: null,
    isco_classified_share_pct: null,
    white_collar_pct: null,
    young_white_collar_pct: null,
    lfp_rate_total: null,
  };
  for (const [field] of C.ISCO_GROUPS.values()) row[field] = null;
  return Object.assign(row, over);
}

/**
 * A country row carrying ISCO major-group shares.
 *
 * `groups` is keyed by group number: `withIsco('XXX', 2023, { g1: 10.0 })`.
 * Sets data_year_occupation so `derive`'s have_isco gate opens -- tests that
 * want the gate *shut* should pass `year: null`.
 */
export function withIsco(
  iso3 = 'TST',
  year: number | null = 2023,
  groups: Record<string, number> = {},
  over: Row = {},
): Row {
  const row = country(iso3, { data_year_occupation: year, isco_classification: 'ISCO-08' });
  for (const [code, [field]] of C.ISCO_GROUPS) {
    const n = code.split('_').pop() as string;
    const key = `g${n}`;
    if (key in groups) row[field] = groups[key];
  }
  return Object.assign(row, over);
}

/**
 * An aggregate member: an employed headcount plus the share being weighted.
 *
 * The default weight field for AGG_WEIGHTED is employed_total, so a member
 * with no employed count contributes to neither numerator nor denominator.
 */
export function member(
  employed: number | null,
  pct: number | null = null,
  population: number | null = null,
  over: Row = {},
): Row {
  const iso3 = (over.iso3 as string) ?? 'MBR';
  const row = country(iso3);
  row.employed_total = employed;
  row.population_total = population !== null ? population : employed;
  row.white_collar_pct = pct;
  return Object.assign(row, over);
}

/** `{iso3: row}` -- the shape `derive` and `squeezeIndex` take. */
export function byIso(...rows: Row[]): Map<string, Row> {
  return new Map(rows.map((r) => [r.iso3 as string, r]));
}
