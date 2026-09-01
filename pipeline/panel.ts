/**
 * R6. Build the year-by-year panel from the same cached sources as the snapshot.
 *
 * The snapshot picks one year per field and throws the rest away. The raw cache
 * already holds World Bank 2010-2026 and ILOSTAT 2013-2025, so the panel costs
 * no extra API calls -- it just stops discarding.
 *
 * 0007: ported from `panel.py`.
 */
import { writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

import * as C from './config.ts';
import * as fetch from './fetch.ts';
import * as B from './build.ts';
import type { Row } from './build.ts';
import { writeCsv } from './csvio.ts';
import { dumps, type PyJson } from './pyjson.ts';
import { formatCell, cellJson } from './columns.ts';

export const PANEL_FIELDS = [
  'iso3', 'country_name', 'region', 'row_type', 'year',
  'population_total', 'pop_0_14_pct', 'pop_15_64_pct', 'pop_65plus_pct',
  'lfp_rate_total', 'unemployment_rate_total', 'unemployment_rate_15_24',
  'labor_force_total', 'employed_total', 'employed_share_of_population_pct',
  'emp_agriculture_pct', 'emp_industry_pct', 'emp_services_pct',
  'isco1_managers_pct', 'isco2_professionals_pct', 'isco3_technicians_pct',
  'isco4_clerical_pct', 'isco5_service_sales_pct', 'isco6_agricultural_pct',
  'isco7_craft_pct', 'isco8_operators_pct', 'isco9_elementary_pct',
  'white_collar_pct', 'professional_core_pct', 'blue_collar_service_pct',
  'young_white_collar_pct', 'ai_exposure_weighted_score',
  'clerical_employed', 'white_collar_employed',
  'isco_classification', 'isco_groups_reported',
  'isco_coverage_pct_of_employment', 'member_count',
];

// fields the app's scrubber and sparklines actually need
export const APP_PANEL_FIELDS = [
  'iso3', 'year', 'white_collar_pct', 'professional_core_pct',
  'isco4_clerical_pct', 'young_white_collar_pct', 'emp_services_pct',
  'lfp_rate_total', 'unemployment_rate_15_24', 'employed_total',
  'employed_share_of_population_pct', 'ai_exposure_weighted_score',
  'clerical_employed', 'white_collar_employed', 'population_total',
  'isco_coverage_pct_of_employment',
];

export const WB_PANEL_MAP = new Map(
  Array.from(C.WB_INDICATORS, ([code, [field]]) => [code, field] as [string, string]),
);

function sub<K, V>(m: Map<K, V>, k: K, make: () => V): V {
  let v = m.get(k);
  if (v === undefined) {
    v = make();
    m.set(k, v);
  }
  return v;
}

/** iso3 -> year -> {field: value} for every cached World Bank indicator. */
function wbSeries(): Map<string, Map<number, Map<string, number>>> {
  const series = new Map<string, Map<number, Map<string, number>>>();
  for (const [code, field] of WB_PANEL_MAP) {
    for (const obs of fetch.wbIndicator(code)) {
      const iso3 = obs.countryiso3code || '';
      const v = B.num(obs.value);
      if (iso3 && v !== null) {
        sub(
          sub(series, iso3, () => new Map()),
          parseInt(obs.date, 10),
          () => new Map<string, number>(),
        ).set(field, v);
      }
    }
  }
  return series;
}

type Picked = [C.IscoFamily, number, B.GroupCell];

/** iso3 -> year -> (family, n_present, groups) for every reconcilable year. */
function iloOccupationSeries(): Map<string, Map<number, Picked>> {
  const filePath = fetch.iloFlow('occupation');
  const raw = new Map<string, Map<number, B.GroupCell>>();
  for (const [iso3, ocu, year, val] of B.readIlo(filePath, [
    'REF_AREA', 'OCU', 'TIME_PERIOD', 'OBS_VALUE',
  ])) {
    const v = B.num(val);
    if (v !== null) {
      sub(sub(raw, iso3, () => new Map()), parseInt(year, 10), () => new Map()).set(ocu, v);
    }
  }

  const out = new Map<string, Map<number, Picked>>();
  for (const [iso3, years] of raw) {
    for (const [year, groups] of years) {
      for (const family of C.ISCO_FAMILIES) {
        const picked = B.pickOccupationYear(new Map([[year, groups]]), family);
        if (picked) {
          sub(out, iso3, () => new Map()).set(year, [family, picked[1], picked[2]]);
          break; // ISCO-08 preferred, same as the snapshot
        }
      }
    }
  }
  return out;
}

function iloYouthSeries(): Map<string, Map<number, number>> {
  const filePath = fetch.iloFlow('age_occupation');
  const keep = new Set(C.ISCO_FAMILIES.flatMap((fam) => [...fam.groups.keys()]));
  const youthCodes = new Set(C.YOUTH_AGE_CODES);
  const raw = new Map<string, Map<number, B.GroupCell>>();
  for (const [iso3, age, ocu, year, val] of B.readIlo(filePath, [
    'REF_AREA', 'AGE', 'OCU', 'TIME_PERIOD', 'OBS_VALUE',
  ])) {
    if (!youthCodes.has(age) || !keep.has(ocu)) continue;
    const v = B.num(val);
    if (v !== null) {
      sub(sub(raw, iso3, () => new Map()), parseInt(year, 10), () => new Map()).set(ocu, v);
    }
  }
  const out = new Map<string, Map<number, number>>();
  for (const [iso3, years] of raw) {
    for (const [year, cell] of years) {
      for (const family of C.ISCO_FAMILIES) {
        const [share] = B.youthShare(cell, family);
        if (share !== null) {
          sub(out, iso3, () => new Map()).set(year, share);
          break;
        }
      }
    }
  }
  return out;
}

/** One row per (country, year). Same derivations as the snapshot. */
export function buildPanel(
  ref: Map<string, Row>,
  weights: Record<string, number>,
  start?: number,
): Row[] {
  const from = start || C.PANEL_START;
  const wb = wbSeries();
  const occ = iloOccupationSeries();
  const youth = iloYouthSeries();

  const rows: Row[] = [];
  for (const [iso3, meta] of ref) {
    for (let year = from; year < 2027; year++) {
      const wbYear = wb.get(iso3)?.get(year);
      const occYear = occ.get(iso3)?.get(year);
      if (!wbYear && !occYear) continue;
      const row: Row = {
        iso3,
        country_name: meta.country_name,
        region: meta.region,
        row_type: 'country',
        year,
      };
      if (wbYear) for (const [k, v] of wbYear) row[k] = v;
      if (occYear) {
        const [family, nPresent, groups] = occYear;
        B.applyOccupation(row, family, year, nPresent, groups);
      } else {
        for (const [field] of C.ISCO_GROUPS.values()) row[field] = null;
        row.isco_classification = null;
        row.isco_groups_reported = 0;
        row.data_year_occupation = null;
      }
      row.young_white_collar_pct = youth.get(iso3)?.get(year) ?? null;
      rows.push(row);
    }
  }

  const byIso = new Map<string, Row>(rows.map((r) => [`${r.iso3}|${r.year}`, r]));
  B.derive(byIso, weights);
  return rows;
}

/** World + World Bank regions, per year, employment-weighted. */
export function panelAggregates(rows: Row[]): Row[] {
  const byYear = new Map<number, Row[]>();
  for (const r of rows) sub(byYear, r.year as number, () => []).push(r);
  const out: Row[] = [];
  for (const year of [...byYear.keys()].sort((a, b) => a - b)) {
    const members = byYear.get(year) as Row[];
    const groups: [string, string, Row[]][] = [['WLD', 'World', members]];
    for (const [code, name] of C.WB_REGIONS) {
      const subset = members.filter((m) => m.region === name);
      if (subset.length) groups.push([code, name, subset]);
    }
    for (const [code, name, subset] of groups) {
      const agg = B.makeAggregate(code, name, subset, code === 'WLD' ? 'world' : 'region');
      agg.year = year;
      out.push(agg);
    }
  }
  return out;
}

export function exportPanel(
  rows: Row[],
  aggregates: Row[],
  dataDir: string,
  appPath: string,
): string {
  const panel = [...rows, ...aggregates];
  const filePath = path.join(dataDir, 'global_labor_panel.csv');
  const sorted = [...panel].sort((a, b) => {
    const ai = a.iso3 as string;
    const bi = b.iso3 as string;
    if (ai !== bi) return ai < bi ? -1 : 1;
    return (a.year as number) - (b.year as number);
  });
  writeFileSync(
    filePath,
    writeCsv(
      PANEL_FIELDS,
      sorted.map((r) => PANEL_FIELDS.map((k) => formatCell(k, r[k]))),
    ),
    'utf8',
  );
  process.stdout.write(`      wrote ${filePath} (${panel.length} rows)\n`);

  // compact app payload: arrays keyed by iso3, values in APP_PANEL_FIELDS order
  const series = new Map<string, Map<number, PyJson[]>>();
  for (const r of panel) {
    sub(series, r.iso3 as string, () => new Map()).set(
      r.year as number,
      APP_PANEL_FIELDS.slice(2).map((k) => cellJson(k, r[k])),
    );
  }
  const seriesOut: Record<string, PyJson> = {};
  for (const [k, vals] of series) {
    const inner: Record<string, PyJson> = {};
    // The sort is load-bearing for byte fidelity, not cosmetic. These keys are
    // numeric strings, and `pyjson.dumps` walks them with `Object.entries`,
    // which returns integer-like keys in ascending numeric order regardless of
    // insertion -- where Python's `json.dump` writes them in insertion order.
    // Sorting first makes the two agree. Remove it and the timeseries payload
    // reorders silently. See the matching note in `pyjson.ts`.
    for (const y of [...vals.keys()].sort((a, b) => a - b)) inner[String(y)] = vals.get(y) as PyJson;
    seriesOut[k] = inner;
  }
  const payload: PyJson = {
    fields: APP_PANEL_FIELDS.slice(2),
    years: [...new Set(panel.map((r) => r.year as number))].sort((a, b) => a - b).map(
      (y) => ({ kind: 'int', value: BigInt(y) }) as PyJson,
    ),
    series: seriesOut,
  };
  writeFileSync(appPath, dumps(payload), 'utf8');
  process.stdout.write(
    `      wrote ${appPath} (${statSync(appPath).size.toLocaleString('en-US')} bytes)\n`,
  );
  return filePath;
}
