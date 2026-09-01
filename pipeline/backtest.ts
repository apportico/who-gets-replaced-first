/**
 * 0017. Back-test the naive trend: fit 2013-2019, retrodict 2025, score it.
 *
 * The result screen refuses to state a replacement date. Before this module
 * that refusal rested on a source probe finding nothing published (0010 R13) --
 * the right reason, but not a measured one. Here the refusal gets a number: fit
 * the model a reader would assume sits behind any published date, run it at a
 * year that has already happened, and report how far it missed.
 *
 * It missed badly, and the requirement that makes that legible is R5. Ordinary
 * least squares on the fit window is *beaten by assuming nothing changes*, and
 * it gets the direction of travel wrong on 42% of the pairs it can score. An
 * error figure on its own would not show this: 1.8pp invites the reader to judge
 * whether that is tolerable, and there is nothing left to judge once it sits
 * beside the 1.3pp you get from predicting no change at all. So every row
 * carries its persistence error, and the summary carries both.
 *
 * The structural reason, which no amount of better fitting would fix: the
 * observed employment share is a NET figure. It bundles displacement with
 * demand growth, offshoring, ageing, labour supply and reclassification. A
 * model reading the net and calling it displacement measures the wrong thing.
 *
 * Nothing here emits a year. R8's allowlist is the enforcement, and
 * `BACKTEST_YEAR_COLUMNS` below is the whole of it.
 */
import type { Row } from './build.ts';
import { pyRound, pyStr, pySumFloat, type PyNum } from './pynum.ts';
import type { PyJson } from './pyjson.ts';

/**
 * The back-test's own row.
 *
 * `build.Row` deliberately excludes `boolean` from `RowValue` -- the snapshot
 * has no boolean columns, and `formatCell` takes `RowValue | boolean` so the
 * exception stays visible at the one place it applies. `direction_correct` is
 * genuinely tri-state (true / false / no direction to get wrong), so widening
 * the shared type for it would put a boolean into every column in the pipeline
 * to serve one column here.
 */
export type BacktestValue = string | number | boolean | null;
export type BacktestRow = Record<string, BacktestValue>;

// ------------------------------------------------------------- the window
export const FIT_START = 2013;
export const FIT_END = 2019;
export const TARGET_YEAR = 2025;

/**
 * A two-point fit has no residual and would enter the error distribution as a
 * spuriously confident row, so three is the floor. Spec 0017 Non-goals records
 * the five countries this excludes despite their having a 2025 value.
 */
export const MIN_FIT_OBS = 3;

/** The nine ISCO-08 major-group shares. The derived aggregates are functions of
 *  these, so scoring them too would add correlated rows, not evidence. */
export const BACKTEST_GROUPS = [
  'isco1_managers_pct', 'isco2_professionals_pct', 'isco3_technicians_pct',
  'isco4_clerical_pct', 'isco5_service_sales_pct', 'isco6_agricultural_pct',
  'isco7_craft_pct', 'isco8_operators_pct', 'isco9_elementary_pct',
] as const;

export const BACKTEST_COLUMNS = [
  'iso3', 'country_name', 'group',
  'fit_start_year', 'fit_end_year', 'fit_obs', 'target_year',
  'last_fit_pct', 'retrodicted_2025_pct', 'observed_2025_pct',
  'error_pp', 'persistence_error_pp', 'direction_correct',
];

export const BACKTEST_SUMMARY_COLUMNS = [
  'group', 'n',
  'mean_signed_error_pp', 'mae_pp', 'rmse_pp',
  'median_abs_error_pp', 'p90_abs_error_pp', 'max_abs_error_pp', 'max_abs_error_iso3',
  'persistence_mae_pp', 'persistence_rmse_pp',
  'trend_beats_persistence_n', 'direction_wrong_n',
];

/**
 * R8. The ONLY columns permitted to look like a year.
 *
 * An allowlist a new column has to be added to is a guard; a prose exemption
 * for "fit-window and target-year metadata" is a suggestion, and any column
 * ending `_year` could be argued into it. `POOLED` is the summary's group key
 * for the row spanning every group.
 */
export const BACKTEST_YEAR_COLUMNS = ['fit_start_year', 'fit_end_year', 'target_year'];
export const POOLED = 'POOLED';

const DP = 6;

/**
 * Which of these columns are Python ints.
 *
 * Kept here rather than added to `schema.INT_COLUMNS`, which is a literal
 * enumeration of `run.COLUMNS` that `columns.test.ts` checks -- the back-test
 * emits none of those, so widening the shared set to carry them would blur what
 * that enumeration is for. Same rule as everywhere else in the pipeline: the
 * declared kind decides, never `Number.isInteger`, which is true of `14455.0`.
 */
export const BACKTEST_INT_COLUMNS = new Set([
  'fit_start_year', 'fit_end_year', 'fit_obs', 'target_year',
  'n', 'trend_beats_persistence_n', 'direction_wrong_n',
]);

/** `csv.writer`'s rendering, for the back-test's own columns. */
export function formatBacktestCell(field: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'string') return value;
  return BACKTEST_INT_COLUMNS.has(field) ? String(value) : pyStr(value as number);
}

/** The same decision, for the JSON side. */
export function backtestCellJson(field: string, value: unknown): PyJson {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  return BACKTEST_INT_COLUMNS.has(field)
    ? ({ kind: 'int', value: BigInt(value as number) } satisfies PyNum)
    : ({ kind: 'float', value: value as number } satisfies PyNum);
}

// ------------------------------------------------------------------- fitting
export interface Point { readonly year: number; readonly value: number; }

/**
 * Ordinary least squares through the observed points, returned as the value the
 * fitted line takes at `at`.
 *
 * Only years actually observed take part -- a gap year is skipped, never
 * interpolated. Returns null when the years carry no spread, which cannot
 * happen above MIN_FIT_OBS distinct years but is the honest answer rather than
 * a division by zero.
 */
export function fitAt(points: readonly Point[], at: number): number | null {
  const n = points.length;
  if (n === 0) return null;
  const meanX = pySumFloat(points.map((p) => p.year)) / n;
  const meanY = pySumFloat(points.map((p) => p.value)) / n;
  const num = pySumFloat(points.map((p) => (p.year - meanX) * (p.value - meanY)));
  const den = pySumFloat(points.map((p) => (p.year - meanX) ** 2));
  if (den === 0) return null;
  const slope = num / den;
  return meanY - slope * meanX + slope * at;
}

/**
 * R4. Did the model get the direction of travel right?
 *
 * Compared against the last observation in the fit window, which is what a
 * reader extrapolating by eye would anchor on. A pair whose observed change is
 * exactly zero has no direction to get right or wrong and records null rather
 * than being forced to true or false -- counting it either way would move the
 * published 31 and 241.
 */
export function directionCorrect(
  last: number, retrodicted: number, observed: number,
): boolean | null {
  const predicted = Math.sign(retrodicted - last);
  const actual = Math.sign(observed - last);
  if (actual === 0 || predicted === 0) return null;
  return predicted === actual;
}

// --------------------------------------------------------------- the rows
type Series = Map<string, { name: string; obs: Map<number, number> }>;

/** iso3 -> {name, year -> value} for one group field, country rows only. */
function seriesFor(panel: readonly Row[], field: string): Series {
  const out: Series = new Map();
  for (const row of panel) {
    if (row.row_type !== 'country') continue;
    const value = row[field];
    if (value === null || value === undefined || value === '') continue;
    const iso3 = row.iso3 as string;
    let entry = out.get(iso3);
    if (entry === undefined) {
      entry = { name: (row.country_name as string) ?? '', obs: new Map() };
      out.set(iso3, entry);
    }
    entry.obs.set(Number(row.year), Number(value));
  }
  return out;
}

/**
 * R1. One row per eligible country-group pair, and nothing at all for the rest.
 *
 * "Never impute a missing country" is the project's first rule, and the shape it
 * takes here is absence: a pair short of MIN_FIT_OBS, or with no observed 2025
 * value to score against, produces no row. Not a zero, not a regional average,
 * not a fit extended over a shorter window to make the count up.
 */
export function backtest(panel: readonly Row[]): BacktestRow[] {
  const rows: BacktestRow[] = [];
  for (const field of BACKTEST_GROUPS) {
    const series = seriesFor(panel, field);
    for (const [iso3, { name, obs }] of series) {
      const observed = obs.get(TARGET_YEAR);
      if (observed === undefined) continue;
      const points: Point[] = [];
      for (let year = FIT_START; year <= FIT_END; year++) {
        const value = obs.get(year);
        if (value !== undefined) points.push({ year, value });
      }
      if (points.length < MIN_FIT_OBS) continue;
      const retrodicted = fitAt(points, TARGET_YEAR);
      if (retrodicted === null) continue;
      const last = points[points.length - 1].value;
      rows.push({
        iso3,
        country_name: name,
        group: field,
        fit_start_year: FIT_START,
        fit_end_year: FIT_END,
        fit_obs: points.length,
        target_year: TARGET_YEAR,
        last_fit_pct: pyRound(last, DP),
        retrodicted_2025_pct: pyRound(retrodicted, DP),
        observed_2025_pct: pyRound(observed, DP),
        error_pp: pyRound(retrodicted - observed, DP),
        // R5. The no-trend baseline, per row, so the summary can be checked
        // against the rows rather than taken on trust.
        persistence_error_pp: pyRound(last - observed, DP),
        direction_correct: directionCorrect(last, retrodicted, observed),
      });
    }
  }
  rows.sort((a, b) => {
    const ag = a.group as string;
    const bg = b.group as string;
    if (ag !== bg) return ag < bg ? -1 : 1;
    const ai = a.iso3 as string;
    const bi = b.iso3 as string;
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  });
  return rows;
}

// ------------------------------------------------------------- the summary
function quantile(sortedAbs: readonly number[], p: number): number {
  return sortedAbs[Math.floor(p * (sortedAbs.length - 1))];
}

function stats(rows: readonly BacktestRow[], group: string): BacktestRow {
  const errs = rows.map((r) => r.error_pp as number);
  const pers = rows.map((r) => r.persistence_error_pp as number);
  const abs = [...errs].map(Math.abs).sort((a, b) => a - b);
  const n = rows.length;
  const rmse = (xs: readonly number[]) => Math.sqrt(pySumFloat(xs.map((x) => x * x)) / n);
  const mae = (xs: readonly number[]) => pySumFloat(xs.map(Math.abs)) / n;
  const maxAbs = abs[abs.length - 1];
  const worst = rows.find((r) => Math.abs(r.error_pp as number) === maxAbs);
  return {
    group,
    n,
    mean_signed_error_pp: pyRound(pySumFloat(errs) / n, DP),
    mae_pp: pyRound(mae(errs), DP),
    rmse_pp: pyRound(rmse(errs), DP),
    median_abs_error_pp: pyRound(quantile(abs, 0.5), DP),
    p90_abs_error_pp: pyRound(quantile(abs, 0.9), DP),
    max_abs_error_pp: pyRound(maxAbs, DP),
    max_abs_error_iso3: (worst?.iso3 as string) ?? '',
    persistence_mae_pp: pyRound(mae(pers), DP),
    persistence_rmse_pp: pyRound(rmse(pers), DP),
    // R5. Not "is the trend better on average" but "how often is it better at
    // all". Averages can hide a model that wins hugely on a few and loses
    // slightly on most; this cannot.
    trend_beats_persistence_n: rows.filter(
      (r) => Math.abs(r.error_pp as number) < Math.abs(r.persistence_error_pp as number),
    ).length,
    direction_wrong_n: rows.filter((r) => r.direction_correct === false).length,
  };
}

/**
 * R3. A row per group, then the pooled row.
 *
 * The pooled row is the headline and the per-group rows are what stop it being
 * a headline that hides its own spread -- `isco6_agricultural_pct` carries a
 * 58pp worst case that would otherwise sit inside one number with everything
 * else.
 */
export function backtestSummary(rows: readonly BacktestRow[]): BacktestRow[] {
  const out: BacktestRow[] = [];
  for (const field of BACKTEST_GROUPS) {
    const subset = rows.filter((r) => r.group === field);
    if (subset.length > 0) out.push(stats(subset, field));
  }
  if (rows.length > 0) out.push(stats(rows, POOLED));
  return out;
}

// ------------------------------------------------------------------ coverage
export interface Coverage {
  readonly countriesWithSeries: number;
  readonly eligibleCountries: number;
  readonly unscorable: number;
}

/**
 * R9. The denominator, so the error figure cannot be read as covering more than
 * it does.
 *
 * 64 of 177 is the honest headline. Japan -- the design proposal's own
 * counter-example, whose clerical share ROSE while the model expects a fall --
 * is not among them: its series ends in 2023.
 */
export function coverage(panel: readonly Row[], rows: readonly BacktestRow[]): Coverage {
  const withSeries = new Set<string>();
  for (const field of BACKTEST_GROUPS) {
    for (const iso3 of seriesFor(panel, field).keys()) withSeries.add(iso3);
  }
  const eligible = new Set(rows.map((r) => r.iso3 as string));
  return {
    countriesWithSeries: withSeries.size,
    eligibleCountries: eligible.size,
    unscorable: withSeries.size - eligible.size,
  };
}
