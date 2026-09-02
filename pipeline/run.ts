#!/usr/bin/env node
/**
 * Global labor / AI-exposure dataset pipeline.
 *
 *     node pipeline/run.ts --pilot     # 6-row validation batch
 *     node pipeline/run.ts             # full run, all countries + aggregates
 *
 * Raw API responses are cached under pipeline/raw/, so re-runs are offline
 * and free. Delete a cached file to force a refresh of that source.
 *
 * 0007: ported from `run.py`. The three CLI flags are unchanged -- `--pilot`,
 * `--no-app-json` and `--out-dir` -- because R6 asserts all three behave as
 * before, not just the one issue #21 named.
 */
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as C from './config.ts';
import * as B from './build.ts';
import type { Row, RowValue } from './build.ts';
import * as P from './panel.ts';
import * as BT from './backtest.ts';
import * as X from './crosscheck.ts';
import * as report from './report.ts';
import { pyFormatFixed } from './pynum.ts';
import { writeCsv } from './csvio.ts';
import { cellJson, formatCell } from './columns.ts';
import { dumps, parseTagged, untag, type PyJson } from './pyjson.ts';
import { readFileSync } from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DATA = path.join(HERE, 'data');
export const APP_DATA = path.join(path.dirname(HERE), 'src', 'data');

export const COLUMNS = [
  // identity
  'iso3', 'iso2', 'country_name', 'region', 'income_group', 'row_type', 'capital',
  'lat', 'lon', 'member_count',
  // A. population structure
  'population_total', 'pop_0_14_pct', 'pop_15_64_pct', 'pop_65plus_pct',
  'age_dependency_ratio',
  // B. labor force / employment
  'lfp_rate_total', 'lfp_rate_15_24', 'lfp_rate_15_24_ilo', 'lfp_rate_25_54',
  'lfp_rate_55_64', 'emp_to_pop_ratio_15plus', 'youth_employment_rate_15_24',
  'unemployment_rate_total', 'unemployment_rate_15_24',
  'labor_force_total', 'employed_total', 'employed_total_source',
  'employed_share_of_population_pct',
  // C. broad sector
  'emp_agriculture_pct', 'emp_industry_pct', 'emp_services_pct',
  // D. ISCO-08 occupation
  'isco1_managers_pct', 'isco2_professionals_pct', 'isco3_technicians_pct',
  'isco4_clerical_pct', 'isco5_service_sales_pct', 'isco6_agricultural_pct',
  'isco7_craft_pct', 'isco8_operators_pct', 'isco9_elementary_pct',
  'isco_unclassified_pct', 'isco_armed_forces_thousands', 'isco_groups_reported',
  'isco_classified_share_pct',
  'isco_classification',
  'isco_source_employed_thousands',
  'white_collar_pct', 'professional_core_pct', 'blue_collar_service_pct',
  'white_collar_employed', 'professional_core_employed',
  'clerical_employed', 'professionals_employed',
  // E. entry-level proxy
  'young_white_collar_pct', 'prime_white_collar_pct', 'late_career_white_collar_pct',
  'youth_age_band_used', 'entry_level_data_quality',
  'young_employed_total', 'young_white_collar_employed',
  'youth_cohort_share', 'youth_wc_gap', 'entry_level_squeeze_index',
  'squeeze_components_present',
  // C2. context joins
  'gdp_per_capita_ppp', 'population_15_24', 'labor_force_advanced_edu_pct',
  'service_exports_usd', 'ict_service_exports_pct', 'ict_service_exports_usd',
  // F. modeled overlay
  'ai_exposure_weighted_score', 'exposed_wage_bill_ppp',
  // provenance
  'data_year_population', 'data_year_labor', 'data_year_sector',
  'data_year_occupation', 'data_year_youth_occupation', 'data_year_lfp_age',
  'data_year_context', 'prime_white_collar_year', 'late_career_white_collar_year',
  'data_source_override',
  'data_year_population_range', 'data_year_labor_range',
  'data_year_sector_range', 'data_year_occupation_range',
  'data_year_youth_occupation_range',
  'isco_coverage_pct_of_employment', 'youth_isco_coverage_pct_of_employment',
  'data_quality_flag',
  // H. 0010 R8/R9 — the per-group cross-tabs. Appended rather than slotted
  // beside section D so the 84 existing columns keep their positions and the
  // CSV diff stays readable. They reach global_labor_dataset.csv and the
  // SQLite like any other column; export_app_json sheds them (R20).
  ...C.CROSSTAB_COLUMNS,
];

export const REGRESSION_CHECKS: [string, string, number, number, string][] = [
  ['WLD', 'emp_services_pct', 50.0, 4.0, 'World services employment ~50%'],
  ['USA', 'emp_services_pct', 79.0, 4.0, 'US services employment ~79%'],
  ['EU27', 'emp_services_pct', 72.0, 4.0, 'EU-27 services employment ~72%'],
  ['IND', 'emp_services_pct', 31.5, 4.0, 'India services employment ~31.5%'],
];

const out = (s: string) => process.stdout.write(s + '\n');

export function loadWeights(): Record<string, number> {
  const payload = JSON.parse(readFileSync(path.join(HERE, 'ai_exposure_isco.json'), 'utf8'));
  return payload.weights;
}

export function loadProfiles(): Record<string, Record<string, number>> {
  const payload = JSON.parse(readFileSync(path.join(HERE, 'ai_exposure_isco.json'), 'utf8'));
  return payload.profiles ?? {};
}

export interface RunResult {
  rows: Row[];
  problems: string[];
  outliers: Record<string, RowValue>[];
  ref: Map<string, Row>;
  failures: string[];
}

export function run(scope: ReadonlySet<string> | null = null, label = 'full'): RunResult {
  out(`\n=== Global labor pipeline (${label}) ===\n`);
  const weights = loadWeights();

  out('[1/7] country reference table');
  const [ref] = B.buildReference(scope);
  const rows = new Map<string, Row>();
  for (const [iso3, meta] of ref) rows.set(iso3, { ...meta, row_type: 'country' });
  out(`      ${rows.size} areas in scope`);

  out('[2/7] World Bank indicators (sections A-C)');
  B.loadWorldbank(rows);

  out('[3/7] ILOSTAT employment by occupation (section D)');
  B.loadOccupation(rows);

  out('[4/7] ILOSTAT youth x occupation cross-tab (section E)');
  B.loadYouthOccupation(rows);

  out('[5/7] ILOSTAT labour force participation by age band');
  B.loadLfpByAge(rows);

  out('[5b/7] ILOSTAT education x occupation cross-tab (0010 R9)');
  B.loadEduOccupation(rows);

  out('[6/9] derived fields + modeled AI exposure (section F)');
  B.derive(rows, weights);
  B.squeezeIndex(rows);

  out('[7/9] manual overrides (R3)');
  B.applyOverrides(rows, path.join(HERE, 'manual_overrides.json'));
  for (const r of rows.values()) r.data_quality_flag = B.qualityFlag(r);

  out('[8/9] aggregates');
  const allRows = [...rows.values()];
  const countries = allRows.filter((r) => r.row_type === 'country');
  const aggs: Row[] = [];
  if (scope === null || scope.has('WLD')) {
    aggs.push(B.makeAggregate('WLD', 'World', countries, 'world'));
  }
  if (scope === null) {
    for (const [code, name] of C.WB_REGIONS) {
      const members = countries.filter((r) => r.region === name);
      if (members.length) aggs.push(B.makeAggregate(code, name, members, 'region'));
    }
    for (const [code, name, isoList] of [
      ['EU27', 'European Union (27)', C.EU27],
      ['OECD', 'OECD members', C.OECD],
      ['G20', 'G20 members', C.G20],
    ] as [string, string, string[]][]) {
      const members = isoList.filter((i) => rows.has(i)).map((i) => rows.get(i) as Row);
      aggs.push(B.makeAggregate(code, name, members, 'group'));
    }
  } else {
    for (const [code, name, isoList] of [
      ['EU27', 'European Union (27)', C.EU27],
    ] as [string, string, string[]][]) {
      const members = isoList.filter((i) => rows.has(i)).map((i) => rows.get(i) as Row);
      if (members.length) aggs.push(B.makeAggregate(code, name, members, 'group'));
    }
  }
  const result = [...allRows, ...aggs];
  out(`      ${aggs.length} aggregate rows`);
  out('[9/9] validation + outlier review');

  const problems = B.validate(result);
  out(`\n[validate] ${problems.length} range/consistency problems`);
  for (const p of problems.slice(0, 15)) out(`      ! ${p}`);
  if (problems.length > 15) out(`      ... and ${problems.length - 15} more`);

  const outliers = B.findOutliers(result);
  out(`[outliers] ${outliers.length} values flagged for manual review`);
  for (const o of outliers.slice(0, 8)) {
    out(`      ? ${o.iso3} ${o.field}=${formatCell('value', o.value)} — ${o.reason}`);
  }
  if (outliers.length > 8) out(`      ... and ${outliers.length - 8} more`);

  const idx = new Map(result.map((r) => [r.iso3 as string, r]));
  const failures: string[] = [];
  out('\n[regression checks against known published figures]');
  for (const [iso3, field, expect, tol, desc] of REGRESSION_CHECKS) {
    const got = B.g(idx.get(iso3) ?? {}, field);
    if (got === null) {
      out(`      ?  ${desc}: no value produced`);
      failures.push(`${desc}: no value produced for ${iso3}.${field}`);
    } else {
      const ok = Math.abs(got - expect) <= tol;
      out(
        `      ${ok ? 'PASS' : 'FAIL'}  ${desc}: got ${pyFormatFixed(got, 1)} ` +
          `(expected ~${expect}, tol +/-${tol})`,
      );
      if (!ok) {
        failures.push(`${desc}: got ${pyFormatFixed(got, 1)}, expected ~${expect} +/-${tol}`);
      }
    }
  }
  return { rows: result, problems, outliers, ref, failures };
}

/**
 * Print a verdict and return a process exit code.
 *
 * A moved regression anchor or a range/consistency problem fails the run.
 * Outliers deliberately do NOT fail it — they are a standing review queue
 * (4 on a healthy run), not a regression signal.
 */
export function reportStatus(problems: string[], failures: string[], label: string): number {
  if (failures.length) {
    out(`\n[FAIL] ${failures.length} regression anchor(s) moved:`);
    for (const f of failures) out(`      x ${f}`);
  }
  if (problems.length) {
    out(
      `\n[FAIL] ${problems.length} range/consistency problem(s) — ` +
        'see the [validate] block above',
    );
  }
  if (failures.length || problems.length) {
    out(`\n${label} FAILED. Published figures would change; do not treat this run as good.`);
    return 1;
  }
  out(
    `\n${label} checks passed: ${REGRESSION_CHECKS.length} anchors on target, ` +
      '0 validation problems.',
  );
  return 0;
}

// ------------------------------------------------------------------ exports
export function exportCsv(rows: Row[], filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const sorted = [...rows].sort((a, b) => {
    const key = (r: Row): [number, number, string] => [
      r.row_type !== 'world' ? 1 : 0,
      r.row_type === 'country' ? 1 : 0,
      r.iso3 as string,
    ];
    const ka = key(a);
    const kb = key(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0;
  });
  writeFileSync(
    filePath,
    writeCsv(COLUMNS, sorted.map((r) => COLUMNS.map((k) => formatCell(k, r[k], r)))),
    'utf8',
  );
  out(`      wrote ${filePath} (${rows.length} rows x ${COLUMNS.length} cols)`);
}

/**
 * 0007 R5. `node:sqlite` rather than Python's `sqlite3`.
 *
 * Byte-identical output is NOT achievable and was not left to surface as a
 * mystery diff: the 100-byte header stamps `SQLITE_VERSION_NUMBER`, and the
 * two runtimes bundle 3.48.0 and 3.53.3. Exactly four header bytes differ
 * (offsets 24, 92 and 96); page data is identical, which is what R5 asserts.
 */
export function exportSqlite(rows: Row[], filePath: string): void {
  if (existsSync(filePath)) rmSync(filePath);
  const con = new DatabaseSync(filePath);
  const types: Record<string, string> = {
    iso3: 'TEXT', country_name: 'TEXT', region: 'TEXT',
    income_group: 'TEXT', row_type: 'TEXT', capital: 'TEXT',
    employed_total_source: 'TEXT', entry_level_data_quality: 'TEXT',
    youth_age_band_used: 'TEXT', data_quality_flag: 'TEXT',
  };
  const cols = COLUMNS.map(
    (c) => `"${c}" ${c.endsWith('_range') ? 'TEXT' : (types[c] ?? 'REAL')}`,
  ).join(', ');
  con.exec(`CREATE TABLE global_labor (${cols}, PRIMARY KEY (iso3))`);
  const stmt = con.prepare(
    `INSERT INTO global_labor VALUES (${COLUMNS.map(() => '?').join(',')})`,
  );
  for (const r of rows) stmt.run(...COLUMNS.map((c) => bind(r[c])));
  con.exec('CREATE INDEX idx_region ON global_labor(region)');
  con.exec('CREATE INDEX idx_rowtype ON global_labor(row_type)');
  con.close();
  out(`      wrote ${filePath}`);
}

/** `sqlite3` binds None as NULL; nothing here may turn a null into a 0 or "". */
function bind(v: RowValue): null | number | string {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.join('; ');
  return v;
}

export function exportPanelSqlite(panel: Row[], filePath: string): void {
  const con = new DatabaseSync(filePath);
  con.exec('DROP TABLE IF EXISTS global_labor_panel');
  const textCols = new Set(['iso3', 'country_name', 'region', 'row_type', 'isco_classification']);
  const cols = P.PANEL_FIELDS.map((c) => `"${c}" ${textCols.has(c) ? 'TEXT' : 'REAL'}`).join(', ');
  con.exec(`CREATE TABLE global_labor_panel (${cols})`);
  const stmt = con.prepare(
    `INSERT INTO global_labor_panel VALUES (${P.PANEL_FIELDS.map(() => '?').join(',')})`,
  );
  for (const r of panel) stmt.run(...P.PANEL_FIELDS.map((c) => bind(r[c])));
  con.exec('CREATE INDEX idx_panel ON global_labor_panel(iso3, year)');
  con.close();
  out(`      wrote panel table into ${filePath}`);
}

/**
 * Trimmed payload for the wizard's first load.
 *
 * 0010 R20. The 81 per-group cross-tab columns are excluded here and shipped
 * per country instead: carrying them would take this file from 593 KB to
 * ~1.2 MB, almost all of it describing the 217 countries the reader did not
 * pick, on the spec whose first premise is mobile-first.
 *
 * ORDER MATTERS, and it is the whole reason this is written out rather than
 * left to a comprehension. `keep` feeds three consumers, not two: the
 * `untiered` gate below, the `field_tiers` block, and the row keys. That gate
 * is the ENTIRE enforcement of "every emitted number carries a tier" inside
 * the pipeline -- exportCsv and exportSqlite have no tier check of their own.
 * So it runs over the full column list FIRST, and the exclusion is applied
 * only afterwards, where the payload is assembled. Excluding before the gate
 * would ship 81 unregistered numbers in the CSV and the SQLite.
 */
export function exportAppJson(rows: Row[], filePath: string): void {
  const keep = COLUMNS.filter((c) => !c.endsWith('_range'));
  const untiered = keep.filter((c) => !C.FIELD_TIERS.has(c));
  if (untiered.length) {
    throw new Error(
      `columns with no tier in config.FIELD_TIERS: ['${untiered.join("', '")}']. ` +
        'Every emitted number carries a tier (CLAUDE.md); add these to the ' +
        'registry, using NOT_A_MEASUREMENT for identity/provenance fields.',
    );
  }
  // -- the exclusion, after the gate above has seen every column
  const crosstabs = new Set(C.CROSSTAB_COLUMNS);
  const appKeep = keep.filter((c) => !crosstabs.has(c));
  const fieldTiers: Record<string, PyJson> = {};
  for (const c of appKeep) fieldTiers[c] = C.FIELD_TIERS.get(c) as string;
  const payload: PyJson = {
    generated_from: 'pipeline/run.py',
    // 0004 R3. Per-field tier, so the app can label every number it renders
    // rather than relying on prose the reader has to go and find. Filtered to
    // `keep`, not the whole registry: the payload must not claim coverage of
    // the five *_range columns it drops.
    field_tiers: fieldTiers,
    sources: {
      population_labor_sector: 'World Bank Open Data API v2',
      occupation: 'ILOSTAT SDMX DF_EMP_TEMP_SEX_OCU_NB',
      youth_occupation: 'ILOSTAT SDMX DF_EMP_TEMP_SEX_AGE_OCU_NB',
      lfp_by_age: 'ILOSTAT SDMX DF_EAP_DWAP_SEX_AGE_RT',
      ai_exposure: 'MODELED — pipeline/ai_exposure_isco.json',
    },
    // Read through the tokenising parser so the weights keep the Python types
    // their literals spell -- `0.85` is a float and stays `0.85`.
    ai_exposure_weights: (
      parseTagged(readFileSync(path.join(HERE, 'ai_exposure_isco.json'), 'utf8')) as Record<
        string,
        PyJson
      >
    ).weights,
    rows: rows.map((r) => {
      const o: Record<string, PyJson> = {};
      for (const k of appKeep) o[k] = cellJson(k, r[k], r);
      return o;
    }),
  };
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, dumps(payload), 'utf8');
  out(`      wrote ${filePath} (${statSync(filePath).size.toLocaleString('en-US')} bytes)`);
}

/**
 * 0017 R1/R2/R3/R5. Write the back-test, its summary, and the app payload.
 *
 * The `[backtest]` block prints the pooled row beside the persistence baseline,
 * because the pooled error on its own is the number that invites a reader to
 * decide 1.8pp sounds tolerable. Set against 1.3pp for predicting no change,
 * there is nothing left to decide, and that is the finding this whole spec
 * exists to publish.
 */
export function exportBacktest(panelRows: Row[], dataDir: string, appPath: string): void {
  const rows = BT.backtest(panelRows);
  const summary = BT.backtestSummary(rows);
  const cov = BT.coverage(panelRows, rows);

  const untiered = [...BT.BACKTEST_COLUMNS, ...BT.BACKTEST_SUMMARY_COLUMNS].filter(
    (c) => !C.BACKTEST_FIELD_TIERS.has(c),
  );
  if (untiered.length) {
    throw new Error(
      `back-test columns with no tier in config.BACKTEST_FIELD_TIERS: ` +
        `['${untiered.join("', '")}']. Every emitted number carries a tier ` +
        '(CLAUDE.md); add these to the registry, using NOT_A_MEASUREMENT for ' +
        'identity/provenance fields.',
    );
  }

  const rowsPath = path.join(dataDir, 'backtest.csv');
  writeFileSync(
    rowsPath,
    writeCsv(
      BT.BACKTEST_COLUMNS,
      rows.map((r) => BT.BACKTEST_COLUMNS.map((k) => BT.formatBacktestCell(k, r[k]))),
    ),
    'utf8',
  );
  out(`      wrote ${rowsPath} (${rows.length} rows)`);

  const summaryPath = path.join(dataDir, 'backtest_summary.csv');
  writeFileSync(
    summaryPath,
    writeCsv(
      BT.BACKTEST_SUMMARY_COLUMNS,
      summary.map((r) => BT.BACKTEST_SUMMARY_COLUMNS.map((k) => BT.formatBacktestCell(k, r[k]))),
    ),
    'utf8',
  );
  out(`      wrote ${summaryPath} (${summary.length} rows)`);

  const pooled = summary.find((r) => r.group === BT.POOLED);
  if (pooled) {
    const f = (k: string) => pyFormatFixed(pooled[k] as number, 3);
    out(
      `      pooled n=${pooled.n}  trend MAE=${f('mae_pp')}pp RMSE=${f('rmse_pp')}pp  ` +
        `persistence MAE=${f('persistence_mae_pp')}pp RMSE=${f('persistence_rmse_pp')}pp`,
    );
    out(
      `      trend beats persistence on ${pooled.trend_beats_persistence_n}/${pooled.n}; ` +
        `direction wrong on ${pooled.direction_wrong_n}/${pooled.n}`,
    );
    out(
      `      scored ${cov.eligibleCountries} of ${cov.countriesWithSeries} countries ` +
        `with an ISCO series (${cov.unscorable} unscorable)`,
    );
  }

  const fieldTiers: Record<string, PyJson> = {};
  for (const c of [...BT.BACKTEST_COLUMNS, ...BT.BACKTEST_SUMMARY_COLUMNS]) {
    fieldTiers[c] = C.BACKTEST_FIELD_TIERS.get(c) as string;
  }
  const series: Record<string, PyJson> = {};
  for (const r of rows) {
    const iso3 = r.iso3 as string;
    const byGroup = (series[iso3] ??= {}) as Record<string, PyJson>;
    byGroup[r.group as string] = BT.BACKTEST_COLUMNS.map((k) => BT.backtestCellJson(k, r[k]));
  }
  const payload: PyJson = {
    generated_from: 'pipeline/run.ts',
    fit_start_year: BT.FIT_START,
    fit_end_year: BT.FIT_END,
    target_year: BT.TARGET_YEAR,
    min_fit_obs: BT.MIN_FIT_OBS,
    countries_with_series: cov.countriesWithSeries,
    eligible_countries: cov.eligibleCountries,
    // 0004 R3 / 0017 R2. The payload the screen renders carries its own tiers,
    // so a badge never has to be inferred from a column name.
    field_tiers: fieldTiers,
    fields: BT.BACKTEST_COLUMNS,
    summary_fields: BT.BACKTEST_SUMMARY_COLUMNS,
    summary: summary.map((r) =>
      BT.BACKTEST_SUMMARY_COLUMNS.map((k) => BT.backtestCellJson(k, r[k])),
    ),
    series,
  };
  mkdirSync(path.dirname(appPath), { recursive: true });
  writeFileSync(appPath, dumps(payload), 'utf8');
  out(`      wrote ${appPath} (${statSync(appPath).size.toLocaleString('en-US')} bytes)`);
}

/**
 * 0010 R20. One artefact per country, fetched after step 01.
 *
 * One file per country and not one combined file: a single artefact would
 * still carry ~575 KB of which about 2.5 KB is the country the reader picked,
 * which defers the download to the step 01 -> step 02 transition rather than
 * removing it -- and delivers it at the worst moment, mid-wizard.
 *
 * Each file carries its own tier block. Every emitted number still carries a
 * tier; the block it appears in is this artefact's rather than
 * global_labor.json's, which is what R8 and R9 mean by "the cross-tab
 * artefact's own tier block".
 */
export function exportCrosstabs(rows: Row[], dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
  let written = 0;
  const tiers: Record<string, PyJson> = {};
  for (const c of C.CROSSTAB_COLUMNS) tiers[c] = C.FIELD_TIERS.get(c) as string;
  for (const r of rows) {
    if (r.row_type !== 'country') continue;
    const values: Record<string, PyJson> = {};
    for (const c of C.CROSSTAB_COLUMNS) values[c] = cellJson(c, r[c], r);
    // A country with nothing at all still gets a file. The wizard has to be
    // able to tell "the source publishes nothing here" from "the fetch
    // failed", and a 404 cannot say the first one (R20).
    const payload: PyJson = {
      generated_from: 'pipeline/run.py',
      iso3: r.iso3 as string,
      country_name: (r.country_name as string) ?? null,
      // Deliberately NOT isco_classification. That field records the family
      // the OCCUPATION flow chose for this country, and the age and education
      // loaders resolve their own family per group against a different flow --
      // so copying it here would label these numbers with a classification
      // they may not have come from.
      field_tiers: tiers,
      values,
    };
    writeFileSync(path.join(dirPath, `${r.iso3}.json`), dumps(payload), 'utf8');
    written += 1;
  }
  out(`      wrote ${written} per-country cross-tab files to ${dirPath}`);
}

export function consoleSummary(rows: Row[]): void {
  const countries = rows.filter((r) => r.row_type === 'country');
  const full = countries.filter((r) => B.g(r, 'white_collar_pct') !== null);
  const youth = countries.filter((r) => B.g(r, 'young_white_collar_pct') !== null);
  const world = rows.find((r) => r.iso3 === 'WLD') ?? {};
  out('\n' + '='.repeat(62));
  out(`countries/territories processed : ${countries.length}`);
  out(`  full ISCO occupation coverage : ${full.length}`);
  out(`  no ISCO occupation data       : ${countries.length - full.length}`);
  out(`  youth x ISCO cross-tab        : ${youth.length}`);
  out(`aggregate rows                  : ${rows.length - countries.length}`);
  const wc = B.g(world, 'white_collar_pct');
  // The Python's conditional expression binds to the whole f-string, so a
  // falsy `wc` prints the short form. Ported as written.
  out(
    wc
      ? `\nGLOBAL white-collar share of employment (ISCO 1-4): ${pyFormatFixed(wc, 1)}%`
      : '\nGLOBAL white-collar share: n/a',
  );
  const esp = B.g(world, 'employed_share_of_population_pct');
  if (esp) {
    out(`GLOBAL share of total population that is employed : ${pyFormatFixed(esp, 1)}%`);
  }
  const cov = B.g(world, 'isco_coverage_pct_of_employment');
  if (cov) {
    out(`(computed over ${pyFormatFixed(cov, 0)}% of world employment — countries with ISCO data)`);
  }
  out('='.repeat(62));
}

// ------------------------------------------------------------ 0004 R7. pilot
// Extracted out of main() so the golden-master test drives exactly what
// `--pilot` drives. Inlined, the test would carry its own copy of the scope and
// the filter, and the two would drift apart the first time either changed --
// leaving a golden master that proved something nobody was running.

/**
 * Areas the pilot FETCHES: 32, not the 6 in C.PILOT.
 *
 * EU27 is a weighted aggregate over all 27 members, so producing that output
 * row requires every member's data. The "6-area batch" in the CLI help and in
 * CLAUDE.md describes the seven output rows, not this.
 */
export function pilotScope(): Set<string> {
  return new Set([...C.PILOT, ...C.EU27]);
}

/** The 7 rows the pilot WRITES: C.PILOT plus the EU27 and WLD aggregates. */
export function pilotRows(rows: Row[]): Row[] {
  const keep = new Set([...C.PILOT, 'EU27', 'WLD']);
  return rows.filter((r) => keep.has(r.iso3 as string));
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      pilot: { type: 'boolean', default: false },
      'no-app-json': { type: 'boolean', default: false },
      'out-dir': { type: 'string' },
    },
  });

  if (values.pilot) {
    const { rows: allRows, problems, failures } = run(pilotScope(), 'pilot');
    const rows = pilotRows(allRows);
    const outDir = values['out-dir'] || DATA;
    const outPath = path.join(outDir, 'pilot_labor_dataset.csv');
    exportCsv(rows, outPath);
    consoleSummary(rows);
    out(`\nPilot done. Inspect ${outPath}, then run without --pilot.`);
    return reportStatus(problems, failures, 'Pilot');
  }

  const { rows, problems, outliers, ref, failures } = run(null, 'full');
  out('\n[export]');
  exportCsv(rows, path.join(DATA, 'global_labor_dataset.csv'));
  exportSqlite(rows, path.join(DATA, 'global_labor_dataset.sqlite'));
  if (!values['no-app-json']) {
    exportAppJson(rows, path.join(APP_DATA, 'global_labor.json'));
    exportCrosstabs(rows, path.join(APP_DATA, 'crosstabs'));
  }
  writeFileSync(
    path.join(DATA, 'validation_report.txt'),
    `${problems.length} problems\n` + problems.join('\n'),
    'utf8',
  );
  if (outliers.length) {
    const header = Object.keys(outliers[0]);
    writeFileSync(
      path.join(DATA, 'outliers_for_review.csv'),
      writeCsv(header, outliers.map((o) => header.map((k) => formatCell(k, o[k])))),
      'utf8',
    );
    out(`      wrote ${path.join(DATA, 'outliers_for_review.csv')}`);
  }

  const rowsByIso = new Map(rows.map((r) => [r.iso3 as string, r]));
  out('\n[crosscheck] Eurostat EU-27 occupation shares (R4)');
  X.eurostatCheck(rowsByIso, DATA);
  out('\n[sensitivity] AI exposure weight profiles (R12)');
  const sens = X.sensitivity(rowsByIso, loadProfiles(), DATA);

  out('\n[panel] time series (R6)');
  const panelRows = P.buildPanel(ref, loadWeights());
  const panelAggs = P.panelAggregates(panelRows);
  P.exportPanel(panelRows, panelAggs, DATA, path.join(APP_DATA, 'global_labor_timeseries.json'));
  exportPanelSqlite(
    [...panelRows, ...panelAggs],
    path.join(DATA, 'global_labor_dataset.sqlite'),
  );

  out('\n[backtest] retrodict 2025 from 2013-2019 (0017)');
  exportBacktest(panelRows, DATA, path.join(APP_DATA, 'backtest.json'));

  report.write(report.load(), path.join(HERE, 'summary_report.md'), sens);
  consoleSummary(rows);
  return reportStatus(problems, failures, 'Full run');
}

if (import.meta.filename === process.argv[1]) {
  process.exit(main());
}

// `untag` is exported from pyjson for the app-side consumers of the weights;
// referenced here so the import is not dropped by a linter pass.
export { untag };
