/**
 * R4. Independent validation of EU-27 occupation shares against Eurostat,
 * and R12. sensitivity of the modeled AI exposure index to its weights.
 *
 * 0007: ported from `crosscheck.py`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import * as C from './config.ts';
import * as fetch from './fetch.ts';
import type { Row, RowValue } from './build.ts';
import { g } from './build.ts';
import { pyFormatFixed, pyRound, pySumFloat } from './pynum.ts';
import { writeCsv } from './csvio.ts';
import { formatCell } from './columns.ts';
import { hooks, type SensitivitySummary } from './report.ts';

// Eurostat's isco08 dimension codes for the major groups, in ISCO order.
export const EUROSTAT_ISCO = ['OC1', 'OC2', 'OC3', 'OC4', 'OC5', 'OC6', 'OC7', 'OC8', 'OC9'];
export const WHITE_COLLAR_EU = new Set(['OC1', 'OC2', 'OC3', 'OC4']);

function eurostatUrl(geo: string, year: number): string {
  const params = new URLSearchParams([
    ['format', 'JSON'], ['lang', 'EN'], ['geo', geo], ['time', String(year)],
    ['sex', 'T'], ['age', 'Y15-64'], ['unit', 'THS_PER'], ['wstatus', 'EMP'],
  ]);
  return `${C.EUROSTAT_API}/${C.EUROSTAT_OCU_DATASET}?${params.toString()}`;
}

/** Return {isco_code: value} from a Eurostat JSON-stat response. */
export function parseJsonstat(payload: Record<string, unknown>): Map<string, number> {
  const dim = (payload.dimension ?? {}) as Record<string, { category: { index: Record<string, number> } }>;
  const isco = dim.isco08?.category?.index ?? {};
  const out = new Map<string, number>();
  if (Object.keys(isco).length === 0) return out;
  const ids = payload.id as string[];
  const sizes = ids.map((d) => Object.keys(dim[d].category.index).length);
  const iscoAxis = ids.indexOf('isco08');
  let stride = 1;
  for (const size of sizes.slice(iscoAxis + 1)) stride *= size;
  const values = (payload.value ?? {}) as Record<string, number>;
  for (const [code, idx] of Object.entries(isco)) {
    // every other dimension is pinned to a single value, so the flat index is
    // just this dimension's position times its stride
    const v = values[String(idx * stride)];
    if (v !== undefined && v !== null) out.set(code, Number(v));
  }
  return out;
}

/** Compare our ILO-derived white-collar share against Eurostat's LFS. */
export function eurostatCheck(
  rowsByIso: Map<string, Row>,
  dataDir: string,
  year = 2024,
): Record<string, RowValue | boolean>[] {
  const results: Record<string, RowValue | boolean>[] = [];
  const failures: Record<string, RowValue | boolean>[] = [];
  for (const iso3 of C.EU27) {
    const row = rowsByIso.get(iso3);
    if (!row || g(row, 'white_collar_pct') === null) continue;
    const geo = (row.eurostat_geo as string) || iso3ToGeo(iso3);
    const dest = path.join(
      fetch.state.RAW, 'eurostat', `${C.EUROSTAT_OCU_DATASET}_${geo}_${year}.json`,
    );
    let groups: Map<string, number>;
    try {
      fetch.get(eurostatUrl(geo, year), dest);
      groups = parseJsonstat(JSON.parse(readFileSync(dest, 'utf8')));
    } catch (e) {
      process.stdout.write(`      ! eurostat ${iso3}: ${e}\n`);
      continue;
    }
    const base = pySumFloat(
      [...groups.entries()].filter(([k]) => EUROSTAT_ISCO.includes(k)).map(([, v]) => v),
    );
    if (!base) continue;
    const euWc =
      (100.0 *
        pySumFloat(
          [...groups.entries()].filter(([k]) => WHITE_COLLAR_EU.has(k)).map(([, v]) => v),
        )) /
      base;
    const delta = (g(row, 'white_collar_pct') as number) - euWc;
    const rec: Record<string, RowValue | boolean> = {
      iso3, country_name: row.country_name as string,
      ilo_white_collar_pct: pyRound(g(row, 'white_collar_pct') as number, 2),
      ilo_year: row.data_year_occupation ?? null,
      eurostat_white_collar_pct: pyRound(euWc, 2),
      eurostat_year: year,
      delta_pp: pyRound(delta, 2),
      within_tolerance: Math.abs(delta) <= C.EUROSTAT_DELTA_TOLERANCE,
    };
    results.push(rec);
    if (!rec.within_tolerance) failures.push(rec);
  }

  if (results.length) {
    const filePath = path.join(dataDir, 'crosscheck_eurostat.csv');
    const header = Object.keys(results[0]);
    writeFileSync(
      filePath,
      writeCsv(header, results.map((r) => header.map((k) => formatCell(k, r[k])))),
      'utf8',
    );
    const ok = results.filter((r) => r.within_tolerance).length;
    process.stdout.write(
      `      ${ok}/${results.length} EU-27 countries agree with Eurostat ` +
        `within ${C.EUROSTAT_DELTA_TOLERANCE}pp\n`,
    );
    for (const r of failures) {
      process.stdout.write(
        `      ! ${r.iso3}: ILO ${formatCell('ilo_white_collar_pct', r.ilo_white_collar_pct)}% ` +
          `(${r.ilo_year}) vs Eurostat ` +
          `${formatCell('eurostat_white_collar_pct', r.eurostat_white_collar_pct)}% ` +
          `(${year}) = ${signed(r.delta_pp as number)}pp\n`,
      );
    }
    process.stdout.write(`      wrote ${filePath}\n`);
  }
  return results;
}

/** `f"{delta:+}"` on a float: the repr with an explicit sign. */
function signed(v: number): string {
  return (v >= 0 && !Object.is(v, -0) ? '+' : '') + formatCell('delta_pp', v);
}

/** Eurostat uses ISO-2 with two well-known exceptions. */
export function iso3ToGeo(iso3: string): string {
  const m: Record<string, string> = {
    AUT: 'AT', BEL: 'BE', BGR: 'BG', HRV: 'HR', CYP: 'CY',
    CZE: 'CZ', DNK: 'DK', EST: 'EE', FIN: 'FI', FRA: 'FR',
    DEU: 'DE', GRC: 'EL', HUN: 'HU', IRL: 'IE', ITA: 'IT',
    LVA: 'LV', LTU: 'LT', LUX: 'LU', MLT: 'MT', NLD: 'NL',
    POL: 'PL', PRT: 'PT', ROU: 'RO', SVK: 'SK', SVN: 'SI',
    ESP: 'ES', SWE: 'SE',
  };
  return m[iso3] ?? iso3.slice(0, 2);
}

// ------------------------------------------------------ R12. sensitivity
/**
 * How much does the country ordering depend on our chosen weights?
 *
 * If the ranking barely moves across plausible weightings, the ORDER is robust
 * even though the cardinal score is not. That is the defensible claim.
 */
export function sensitivity(
  rowsByIso: Map<string, Row>,
  profiles: Record<string, Record<string, number>>,
  dataDir: string,
): SensitivitySummary {
  const countries = [...rowsByIso.values()].filter(
    (r) => r.row_type === 'country' && g(r, 'white_collar_pct') !== null,
  );
  const scores = new Map<string, Map<string, number>>();
  for (const [name, weights] of Object.entries(profiles)) {
    const inner = new Map<string, number>();
    for (const r of countries) {
      inner.set(
        r.iso3 as string,
        pySumFloat(
          Array.from(C.ISCO_GROUPS.values(), ([f]) => ((g(r, f) || 0.0) / 100.0) * weights[f]),
        ),
      );
    }
    scores.set(name, inner);
  }

  const ranks = new Map<string, Map<string, number>>();
  for (const [name, sc] of scores) {
    // Python's `sorted` is stable, so ties keep insertion order -- which is the
    // order `countries` was built in.
    const order = [...sc.keys()].sort((a, b) => -(sc.get(a) as number) - -(sc.get(b) as number));
    ranks.set(name, new Map(order.map((iso, i) => [iso, i + 1])));
  }

  const profileNames = Object.keys(profiles);
  const out: Record<string, RowValue>[] = [];
  for (const r of countries) {
    const iso = r.iso3 as string;
    const rs = profileNames.map((name) => ranks.get(name)?.get(iso) as number);
    const rec: Record<string, RowValue> = { iso3: iso, country_name: r.country_name as string };
    for (const name of profileNames) {
      rec[`score_${name}`] = pyRound(scores.get(name)?.get(iso) as number, 4);
      rec[`rank_${name}`] = ranks.get(name)?.get(iso) as number;
    }
    rec.max_rank_movement = Math.max(...rs) - Math.min(...rs);
    out.push(rec);
  }
  // Stable sort on the negated key, matching Python's `list.sort`.
  out.sort((a, b) => (b.max_rank_movement as number) - (a.max_rank_movement as number));

  const filePath = path.join(dataDir, 'ai_exposure_sensitivity.csv');
  const header = Object.keys(out[0]);
  writeFileSync(
    filePath,
    writeCsv(header, out.map((r) => header.map((k) => formatCell(k, r[k])))),
    'utf8',
  );
  // One definition, shared with report.loadSensitivity(), so `npm run report`
  // and `npm run pipeline` cannot print different numbers for the same data.
  // Through the hook, not the import: see `report.hooks`.
  const summary = hooks.summariseSensitivity(
    out.map((r) => ({
      max_rank_movement: String(r.max_rank_movement),
      country_name: r.country_name as string,
    })),
    profileNames,
  );
  process.stdout.write(
    `      ${out.length} countries scored under ${profileNames.length} weight profiles\n`,
  );
  process.stdout.write(
    `      median rank movement ${summary.median_rank_movement}, ` +
      `worst ${summary.max_rank_movement} (${summary.worst_country})\n`,
  );
  process.stdout.write(`      wrote ${filePath}\n`);
  return summary;
}

// `pyFormatFixed` is imported for the signed-delta path above; re-exported so
// the module's formatting story is in one place for a reviewer.
export { pyFormatFixed };
