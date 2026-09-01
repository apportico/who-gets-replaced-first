/**
 * Assemble the global labor dataset from cached World Bank + ILOSTAT pulls.
 *
 * 0007: ported from `build.py`. Every quirk ports as-is -- the Non-goals rule
 * out improving the pipeline while porting it, because a port that also fixed
 * things could not be verified by a byte-identical diff, which is the only
 * strong evidence available here.
 *
 * Two things are NOT transliterations, and both are the point of the spec:
 *   - every `round()` is `pyRound` / `pyRoundInt`, never `Math.round`;
 *   - every `sum()` picks its path from the schema's declared `Int` brand at
 *     the call site, never from what the values look like at runtime.
 */
import {
  pyFormatFixed, pyRound, pyRoundInt, pyStr, pySum, pySumFloat, pySumInt, toBigInt, type PyNum,
} from './pynum.ts';
import { iterCsvColumns } from './csvio.ts';
import { parseTagged, type TaggedJson } from './pyjson.ts';
import { readFileSync } from 'node:fs';
import * as C from './config.ts';
import * as fetch from './fetch.ts';
import { overrideKinds } from './overrides.ts';
import { asInt, isIntColumn } from './schema.ts';

export type RowValue = number | string | null | undefined | string[];
export type Row = Record<string, RowValue>;

export const PCT_FIELDS = [
  'pop_0_14_pct', 'pop_15_64_pct', 'pop_65plus_pct', 'lfp_rate_total',
  'lfp_rate_15_24', 'lfp_rate_15_24_ilo', 'lfp_rate_25_54', 'lfp_rate_55_64',
  'emp_to_pop_ratio_15plus', 'youth_employment_rate_15_24',
  'unemployment_rate_total', 'unemployment_rate_15_24',
  'emp_agriculture_pct', 'emp_industry_pct', 'emp_services_pct',
  'white_collar_pct', 'professional_core_pct', 'blue_collar_service_pct',
  'young_white_collar_pct', 'isco_unclassified_pct',
  ...Array.from(C.ISCO_GROUPS.values(), ([f]) => f),
];

// ------------------------------------------------------------------ helpers
/**
 * `float(x)` or None -- the Python's `num()`, including its bare `except`.
 *
 * Every float in the dataset comes through here, so this is where the pipeline
 * decides that an absent cell is `null` and not `0` -- CLAUDE.md's "nulls stay
 * null" at its narrowest point.
 */
export function num(x: unknown): number | null {
  if (x === null || x === undefined || typeof x === 'boolean') return null;
  if (typeof x === 'number') return x;
  const text = String(x).trim();
  if (text === '') return null;
  const v = Number(text);
  return Number.isNaN(v) ? null : v;
}

/** Read a row field as a number, or null -- the shape `row.get(k)` has. */
export function g(row: Row, k: string): number | null {
  const v = row[k];
  return typeof v === 'number' ? v : null;
}

/** Read a row field as a string, or null. */
export function s(row: Row, k: string): string | null {
  const v = row[k];
  return typeof v === 'string' ? v : null;
}

/** Python truthiness for the values a row can hold: 0, "", null are falsy. */
function truthy(v: RowValue): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v !== '';
  return v.length > 0;
}

/** `series: {year -> value}`. Returns [value, year] for the newest non-null. */
export function latest(series: Map<number, number | null>): [number | null, number | null] {
  const live = [...series.entries()].filter(([, v]) => v !== null);
  if (live.length === 0) return [null, null];
  const y = Math.max(...live.map(([k]) => k));
  return [series.get(y) as number, y];
}

/** `defaultdict`-style access over a WeakMap, for the override registry. */
function subWeak<K extends object, V>(m: WeakMap<K, V>, k: K, make: () => V): V {
  let v = m.get(k);
  if (v === undefined) {
    v = make();
    m.set(k, v);
  }
  return v;
}

/** `defaultdict`-style access over a Map. */
function sub<K, V>(m: Map<K, V>, k: K, make: () => V): V {
  let v = m.get(k);
  if (v === undefined) {
    v = make();
    m.set(k, v);
  }
  return v;
}

// ------------------------------------------------------- reference universe
export interface RefEntry extends Row {
  iso3: string;
  country_name: string;
  region: string;
}

export function buildReference(
  scope?: ReadonlySet<string> | null,
): [Map<string, Row>, Map<string, Row>] {
  const meta = fetch.wbCountryMetadata();
  const ref = new Map<string, Row>();
  const aggregates = new Map<string, Row>();
  for (const c of meta) {
    const iso3 = c.id;
    const row: Row = {
      iso3,
      // 0011 R2. The alpha-2 the Bank already ships beside the alpha-3.
      // It is kept for the app's country search, where `Intl.DisplayNames`
      // needs an alpha-2 to return the spelling a reader actually types
      // ("South Korea", not "Korea, Rep."). An identifier, not a measurement.
      iso2: (c.iso2Code ?? '').trim() || null,
      country_name: c.name,
      // the endpoint ships trailing whitespace on some region labels
      region: c.region.value.trim(),
      income_group: c.incomeLevel.value.trim(),
      capital: c.capitalCity || null,
      lat: num(c.latitude),
      lon: num(c.longitude),
    };
    if (c.region.id === 'NA') aggregates.set(iso3, row);
    else ref.set(iso3, row);
  }
  for (const [iso3, info] of C.EXTRA_AREAS) {
    if (!ref.has(iso3)) {
      // 0011 R2. `iso2` is explicitly None here, not omitted. These areas are
      // outside the World Bank country list, so the Bank publishes no alpha-2
      // for them -- TWN is the live case. ISO 3166-1 does assign one, but
      // transcribing it would be inventing a value to fill a gap; the null
      // stands and Taiwan stays findable by name and by iso3.
      ref.set(iso3, {
        iso3, iso2: null, country_name: info.name, region: info.region,
        income_group: 'Unclassified', capital: null,
        lat: info.lat ?? null, lon: info.lon ?? null,
      });
    }
  }
  for (const [iso3, row] of ref) {
    if (row.lat === null && C.FALLBACK_COORDS.has(iso3)) {
      const [lat, lon] = C.FALLBACK_COORDS.get(iso3) as [number, number];
      row.lat = lat;
      row.lon = lon;
    }
  }
  if (scope) {
    for (const k of [...ref.keys()]) if (!scope.has(k)) ref.delete(k);
  }
  return [ref, aggregates];
}

// --------------------------------------------------------------- World Bank
/** Fill A/B/C fields plus per-group vintages onto rowsByIso in place. */
export function loadWorldbank(rowsByIso: Map<string, Row>): Map<string, Row> {
  // iso3 -> group -> field -> year
  const vintages = new Map<string, Map<string, Map<string, number>>>();
  for (const [code, [field, group]] of C.WB_INDICATORS) {
    process.stdout.write(`[worldbank] ${code} -> ${field}\n`);
    const series = new Map<string, Map<number, number | null>>();
    for (const obs of fetch.wbIndicator(code)) {
      const iso3 = obs.countryiso3code || '';
      if (!iso3) continue;
      sub(series, iso3, () => new Map<number, number | null>()).set(
        parseInt(obs.date, 10),
        num(obs.value),
      );
    }
    for (const [iso3, row] of rowsByIso) {
      const [val, yr] = latest(series.get(iso3) ?? new Map());
      row[field] = val;
      if (yr) {
        sub(sub(vintages, iso3, () => new Map()), group, () => new Map()).set(field, yr);
      }
    }
  }
  for (const [iso3, row] of rowsByIso) {
    for (const group of ['population', 'labor', 'sector']) {
      const years = [...(vintages.get(iso3)?.get(group)?.values() ?? [])];
      row[`data_year_${group}`] = years.length ? Math.max(...years) : null;
    }
  }
  return rowsByIso;
}

// ------------------------------------------------------------------ ILOSTAT
/**
 * Stream a cached SDMX-CSV, yielding the requested columns per row.
 *
 * Streaming rather than materialising: the education flow alone is 55MB, and
 * `DictReader`'s per-row dictionary would be three million short-lived strings
 * for four columns actually read.
 */
export function* readIlo(filePath: string, cols: string[]): Generator<string[]> {
  yield* iterCsvColumns(fetch.readCache(filePath), cols);
}

export type GroupCell = Map<string, number>;

/**
 * Most recent year whose major groups reconcile with the reported total.
 *
 * A year is rejected when groups 1-9 plus armed forces exceed the reported
 * total by more than 0.5% -- that signals the source dropped a group and
 * folded it into another, which silently distorts the white-collar share
 * (Japan 2024-25 drops ISCO 3 and 7). Years with >=8 of 9 groups are
 * preferred over more recent years carrying only 7.
 */
export function pickOccupationYear(
  years: Map<number, GroupCell>,
  family: C.IscoFamily,
): [number, number, GroupCell] | null {
  const candidates: [boolean, number, number, GroupCell][] = [];
  for (const [year, groups] of years) {
    const present = [...family.groups.keys()].filter((gr) => groups.has(gr));
    // Homogeneous float column: every value came through `num()`.
    const base = pySumFloat(present.map((gr) => groups.get(gr) as number));
    if (present.length < 7 || base <= 0) continue;
    const total = groups.get(family.total);
    const armed = groups.get(family.armed) ?? 0.0;
    if (truthy(total ?? null) && (base + armed) / (total as number) > 1.005) continue;
    candidates.push([present.length >= 8, year, present.length, groups]);
  }
  if (candidates.length === 0) return null;
  // Python's `max` returns the FIRST maximal element; years are unique, so the
  // tuple comparison (ok8, year) is a total order and the tie never arises.
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    if (c[0] !== best[0] ? c[0] > best[0] : c[1] > best[1]) best = c;
  }
  return [best[1], best[2], best[3]];
}

/** Write ISCO shares onto row, normalising ISCO-88 codes to the ISCO-08 fields. */
export function applyOccupation(
  row: Row,
  family: C.IscoFamily,
  year: number,
  nPresent: number,
  groups: GroupCell,
): void {
  // excludes group 0
  const base = pySumFloat([...family.groups.keys()].map((gr) => groups.get(gr) ?? 0.0));
  for (const [srcCode, canonical] of family.groups) {
    const field = (C.ISCO_GROUPS.get(canonical) as [string, string])[0];
    const v = groups.get(srcCode);
    row[field] = v !== undefined && base ? pyRound((100.0 * v) / base, 4) : null;
  }
  const reportedTotal = groups.get(family.total);
  const armed = groups.get(family.armed) ?? 0.0;
  row.isco_armed_forces_thousands = armed || null;
  if (reportedTotal !== undefined && reportedTotal > 0) {
    const resid = pyRound((100.0 * (reportedTotal - base - armed)) / reportedTotal, 4);
    // survey totals and group sums differ by float noise; clamp the epsilon
    row.isco_unclassified_pct = -0.01 < resid && resid < 0 ? 0.0 : resid;
    row.isco_classified_share_pct = pyRound((100.0 * (base + armed)) / reportedTotal, 2);
  } else {
    row.isco_unclassified_pct = null;
    row.isco_classified_share_pct = null;
  }
  row.isco_source_employed_thousands = pyRound(base, 3);
  row.isco_groups_reported = nPresent;
  row.isco_classification = family.name;
  row.data_year_occupation = year;
}

/** ISCO major group shares. Prefers ISCO-08; falls back to ISCO-88 (R1). */
export function loadOccupation(rowsByIso: Map<string, Row>): Map<string, Row> {
  const filePath = fetch.iloFlow('occupation');
  const by = new Map<string, Map<number, GroupCell>>(); // iso3 -> year -> ocu -> value
  for (const [iso3, ocu, year, val] of readIlo(filePath, [
    'REF_AREA', 'OCU', 'TIME_PERIOD', 'OBS_VALUE',
  ])) {
    const v = num(val);
    if (v !== null) {
      sub(sub(by, iso3, () => new Map()), parseInt(year, 10), () => new Map()).set(ocu, v);
    }
  }

  for (const [iso3, row] of rowsByIso) {
    const years = by.get(iso3) ?? new Map();
    let matched = false;
    for (const family of C.ISCO_FAMILIES) {
      // ISCO-08 first, then -88
      const picked = pickOccupationYear(years, family);
      if (picked) {
        applyOccupation(row, family, picked[0], picked[1], picked[2]);
        matched = true;
        break;
      }
    }
    if (!matched) {
      row.data_year_occupation = null;
      row.isco_source_employed_thousands = null;
      row.isco_groups_reported = 0;
      row.isco_classified_share_pct = null;
      row.isco_classification = null;
      for (const [field] of C.ISCO_GROUPS.values()) row[field] = null;
    }
  }
  return rowsByIso;
}

/** White-collar share of a single age x occupation cell, or null. */
export function youthShare(
  groupsByOcu: GroupCell,
  family: C.IscoFamily,
): [number | null, number | null] {
  const present = [...family.groups.keys()].filter((gr) => groupsByOcu.has(gr));
  const base = pySumFloat(present.map((gr) => groupsByOcu.get(gr) as number));
  if (present.length < 7 || base <= 0) return [null, null];
  const whiteCollarFields = C.WHITE_COLLAR.map(
    (c) => (C.ISCO_GROUPS.get(c) as [string, string])[0],
  );
  const wc = pySumFloat(
    [...groupsByOcu.entries()]
      .filter(([gr]) => {
        const canonical = family.groups.get(gr);
        if (canonical === undefined) return false;
        return whiteCollarFields.includes((C.ISCO_GROUPS.get(canonical) as [string, string])[0]);
      })
      .map(([, v]) => v),
  );
  return [pyRound((100.0 * wc) / base, 4), base];
}

type AgeMap = Map<string, Map<number, GroupCell>>;

/** Entry-level PROXIES: 15-24 (R1-aware) and the career-stage bands (R11). */
export function loadYouthOccupation(rowsByIso: Map<string, Row>): Map<string, Row> {
  const filePath = fetch.iloFlow('age_occupation');
  const by = new Map<string, AgeMap>(); // iso3 -> age -> year -> ocu -> value
  const wanted = new Set([
    ...C.YOUTH_AGE_CODES,
    ...C.CAREER_STAGE_BANDS.keys(),
    ...C.AGE_GROUP_BANDS.keys(),
    C.AGE_GROUP_DENOM,
  ]);
  const keep = new Set(C.ISCO_FAMILIES.flatMap((fam) => [...fam.groups.keys()]));
  for (const [iso3, age, ocu, year, val] of readIlo(filePath, [
    'REF_AREA', 'AGE', 'OCU', 'TIME_PERIOD', 'OBS_VALUE',
  ])) {
    if (!wanted.has(age) || !keep.has(ocu)) continue;
    const v = num(val);
    if (v !== null) {
      sub(
        sub(sub(by, iso3, () => new Map()), age, () => new Map()),
        parseInt(year, 10),
        () => new Map(),
      ).set(ocu, v);
    }
  }

  for (const [iso3, row] of rowsByIso) {
    const ages: AgeMap = by.get(iso3) ?? new Map();
    // -- 15-24, preferring the classification the country's headline uses
    const families = familyPreference(row);
    let result: number | null = null;
    let chosenYear: number | null = null;
    let chosenAge: string | null = null;
    outer: for (const family of families) {
      for (const age of C.YOUTH_AGE_CODES) {
        const years = [...(ages.get(age)?.keys() ?? [])].sort((a, b) => b - a);
        for (const year of years) {
          const [share] = youthShare(ages.get(age)?.get(year) as GroupCell, family);
          if (share !== null) {
            result = share;
            chosenYear = year;
            chosenAge = age;
            break;
          }
        }
        if (result !== null) break outer;
      }
    }
    row.young_white_collar_pct = result;
    row.data_year_youth_occupation = chosenYear;
    row.youth_age_band_used = chosenAge ? (chosenAge.split('_').pop() as string) : null;
    row.entry_level_data_quality =
      result !== null ? 'proxy_youth_15_24_x_isco' : 'proxy_unavailable';

    // -- R11. Career-stage profile: prime-age and late-career white collar,
    // using the same family preference as the headline figure.
    for (const [band, field] of C.CAREER_STAGE_BANDS) {
      let value: number | null = null;
      let valueYear: number | null = null;
      for (const family of families) {
        const years = [...(ages.get(band)?.keys() ?? [])].sort((a, b) => b - a);
        for (const year of years) {
          const [share] = youthShare(ages.get(band)?.get(year) as GroupCell, family);
          if (share !== null) {
            value = share;
            valueYear = year;
            break;
          }
        }
        if (value !== null) break;
      }
      row[field] = value;
      row[field.replace('_pct', '_year')] = valueYear;
    }

    // -- 0010 R8. Per-group age profile.
    //
    // The bands above were already read; what is new is keeping them PER ISCO
    // GROUP instead of collapsing to the white-collar cut through youthShare.
    //
    // Reconciled JOINTLY -- one year per (country, group) carrying all three
    // bands and the YGE15 denominator. The three shares divide a common base,
    // so bands from different years would not sum to the group's whole. This is
    // why the value cannot reuse data_year_youth_occupation, which is
    // reconciled on its own band: they disagree for 10 countries at group 4,
    // LAO by five years.
    ageByGroup(row, ages, families);
  }
  return rowsByIso;
}

/** ISCO-08 first unless the country's headline occupation series is ISCO-88. */
function familyPreference(row: Row): C.IscoFamily[] {
  const headline = s(row, 'isco_classification') ?? 'ISCO-08';
  // Python's `sorted` is stable and the key is a boolean, so this is exactly
  // "the matching family first, the rest in declaration order".
  return [...C.ISCO_FAMILIES].sort(
    (a, b) => Number(a.name !== headline) - Number(b.name !== headline),
  );
}

/** 0010 R8. Nine group x three band shares, one reconciled year per group. */
export function ageByGroup(row: Row, ages: AgeMap, families: C.IscoFamily[]): void {
  for (const n of C.ISCO_GROUP_NUMBERS) {
    const canon = `OCU_ISCO08_${n}`;
    let shares = new Map<string, number>();
    let chosenYear: number | null = null;
    for (const family of families) {
      let src: string | undefined;
      for (const [source, canonical] of family.groups) if (canonical === canon) src = source;
      if (src === undefined) continue;
      const yearSet = new Set<number>();
      for (const band of C.AGE_GROUP_BANDS.keys()) {
        for (const y of ages.get(band)?.keys() ?? []) yearSet.add(y);
      }
      for (const y of ages.get(C.AGE_GROUP_DENOM)?.keys() ?? []) yearSet.add(y);
      const years = [...yearSet].sort((a, b) => b - a);
      for (const year of years) {
        const base = ages.get(C.AGE_GROUP_DENOM)?.get(year)?.get(src);
        if (!base || base <= 0) continue;
        const cells = new Map<string, number>();
        let complete = true;
        for (const [band, suffix] of C.AGE_GROUP_BANDS) {
          const v = ages.get(band)?.get(year)?.get(src);
          if (v === undefined) {
            complete = false;
            break;
          }
          cells.set(suffix, pyRound((100.0 * v) / base, 4));
        }
        if (complete) {
          shares = cells;
          chosenYear = year;
          break;
        }
      }
      if (chosenYear !== null) break;
    }
    for (const suffix of C.AGE_GROUP_BANDS.values()) {
      row[`isco${n}_age_${suffix}_pct`] = shares.get(suffix) ?? null;
    }
    row[`isco${n}_age_year`] = chosenYear;
  }
}

/**
 * 0010 R9. Education x ISCO major group, per group, from a new ILO flow.
 *
 * Two decisions live here rather than in the caller:
 *
 *   1. The denominator is EDU_AGGREGATE_TOTAL, never the sum of the bands.
 *      BAS/INT/ADV do not partition the base, and renormalising over them
 *      would silently redistribute the less-than-basic and unspecified
 *      workers -- the imputation this project does not do.
 *   2. Below EDU_COVERAGE_FLOOR the dimension is WITHHELD for that group, all
 *      four chips null, measured on the chips actually rendered. Cameroon's
 *      four chips describe 13.3% of its clerical workers; four chips summing
 *      to 13 with a caption explaining the other 87 is not an honest screen.
 */
export function loadEduOccupation(rowsByIso: Map<string, Row>): Map<string, Row> {
  const filePath = fetch.iloFlow('edu_occupation');
  const by = new Map<string, AgeMap>(); // iso3 -> edu -> year -> ocu -> value
  const wanted = new Set([...C.EDU_GROUP_BANDS.keys(), C.EDU_GROUP_DENOM]);
  const keep = new Set(C.ISCO_FAMILIES.flatMap((fam) => [...fam.groups.keys()]));
  for (const [iso3, edu, ocu, year, val] of readIlo(filePath, [
    'REF_AREA', 'EDU', 'OCU', 'TIME_PERIOD', 'OBS_VALUE',
  ])) {
    if (!wanted.has(edu) || !keep.has(ocu)) continue;
    const v = num(val);
    if (v !== null) {
      sub(
        sub(sub(by, iso3, () => new Map()), edu, () => new Map()),
        parseInt(year, 10),
        () => new Map(),
      ).set(ocu, v);
    }
  }

  for (const [iso3, row] of rowsByIso) {
    const edus: AgeMap = by.get(iso3) ?? new Map();
    const families = familyPreference(row);
    for (const n of C.ISCO_GROUP_NUMBERS) {
      const canon = `OCU_ISCO08_${n}`;
      let shares = new Map<string, number>();
      let chosenYear: number | null = null;
      let coverage: number | null = null;
      for (const family of families) {
        let src: string | undefined;
        for (const [source, canonical] of family.groups) if (canonical === canon) src = source;
        if (src === undefined) continue;
        const yearSet = new Set<number>();
        for (const e of C.EDU_GROUP_BANDS.keys()) {
          for (const y of edus.get(e)?.keys() ?? []) yearSet.add(y);
        }
        for (const y of edus.get(C.EDU_GROUP_DENOM)?.keys() ?? []) yearSet.add(y);
        const years = [...yearSet].sort((a, b) => b - a);
        for (const year of years) {
          const base = edus.get(C.EDU_GROUP_DENOM)?.get(year)?.get(src);
          if (!base || base <= 0) continue;
          let cells: Map<string, number> | null = new Map();
          let rendered = 0.0;
          for (const [edu, suffix] of C.EDU_GROUP_BANDS) {
            const v = edus.get(edu)?.get(year)?.get(src);
            if (v === undefined) {
              // LTB is optional -- it is a fourth chip only where published.
              // The three named bands are required.
              if (C.EDU_GROUP_REQUIRED.includes(edu)) {
                cells = null;
                break;
              }
              continue;
            }
            cells.set(suffix, pyRound((100.0 * v) / base, 4));
            rendered += v;
          }
          if (cells === null) continue;
          // The year is chosen on AVAILABILITY ALONE, exactly as ageByGroup
          // does, and the floor is applied to that year and no other. An
          // earlier version tested the floor inside this loop and used
          // `continue`, which did not withhold at all: it walked back to
          // whichever older survey happened to pass. CMR shipped four chips
          // from 2014 beside an age profile from 2021, and DOM was ten years
          // behind. Nothing authorised that gap, and the countries it rescued
          // were precisely the ones the floor exists to withhold.
          shares = cells;
          chosenYear = year;
          coverage = (100.0 * rendered) / base;
          break;
        }
        if (chosenYear !== null) break;
      }

      let flag: string;
      if (chosenYear === null) flag = C.EDU_FLAG_NOT_PUBLISHED;
      else if ((coverage as number) < C.EDU_COVERAGE_FLOOR) {
        // Withheld AT the reconciled year, rather than reaching past it.
        shares = new Map();
        flag = C.EDU_FLAG_WITHHELD;
      } else flag = C.EDU_FLAG_PRESENT;

      for (const suffix of C.EDU_GROUP_BANDS.values()) {
        row[`isco${n}_edu_${suffix}_pct`] = shares.get(suffix) ?? null;
      }
      // The year survives a withholding: it says which survey was judged,
      // which is what makes the withholding checkable rather than a bare null.
      // Only the shares go.
      row[`isco${n}_edu_year`] = chosenYear;
      row[`isco${n}_edu_flag`] = flag;
    }
  }
  return rowsByIso;
}

export function loadLfpByAge(rowsByIso: Map<string, Row>): Map<string, Row> {
  const filePath = fetch.iloFlow('lfp_by_age');
  const by = new Map<string, Map<string, Map<number, number | null>>>();
  for (const [iso3, age, year, val] of readIlo(filePath, [
    'REF_AREA', 'AGE', 'TIME_PERIOD', 'OBS_VALUE',
  ])) {
    if (C.LFP_AGE_CODES.has(age)) {
      const v = num(val);
      if (v !== null) {
        sub(sub(by, iso3, () => new Map()), age, () => new Map()).set(parseInt(year, 10), v);
      }
    }
  }
  for (const [iso3, row] of rowsByIso) {
    for (const [age, field] of C.LFP_AGE_CODES) {
      const [val, yr] = latest(by.get(iso3)?.get(age) ?? new Map());
      row[field] = val;
      if (field === 'lfp_rate_25_54') row.data_year_lfp_age = yr;
    }
  }
  return rowsByIso;
}

// ------------------------------------------------------------ derived fields
export function derive(rowsByIso: Map<string, Row>, weights: Record<string, number>): Map<string, Row> {
  for (const row of rowsByIso.values()) {
    const groups = new Map<string, number | null>();
    for (const [code, [field]] of C.ISCO_GROUPS) groups.set(code, g(row, field));
    const haveIsco = row.data_year_occupation !== null && row.data_year_occupation !== undefined;
    const gc = (code: string): number => groups.get(code) || 0.0;
    // Homogeneous float columns -- every element came through pyRound(x, 4).
    row.white_collar_pct = haveIsco
      ? pyRound(pySumFloat(C.WHITE_COLLAR.map(gc)), 4)
      : null;
    row.professional_core_pct = haveIsco
      ? pyRound(pySumFloat(C.PROFESSIONAL_CORE.map(gc)), 4)
      : null;
    row.blue_collar_service_pct = haveIsco
      ? pyRound(pySumFloat(C.BLUE_COLLAR_SERVICE.map(gc)), 4)
      : null;

    // employed headcount (persons) -- needed for correct weighted aggregates
    const lf = g(row, 'labor_force_total');
    const unemp = g(row, 'unemployment_rate_total');
    if (lf !== null && unemp !== null) {
      row.employed_total = pyRoundInt(lf * (1 - unemp / 100.0));
      row.employed_total_source = 'SL.TLF.TOTL.IN x (1 - SL.UEM.TOTL.ZS)';
    } else if (truthy(row.isco_source_employed_thousands ?? null)) {
      row.employed_total = pyRoundInt((row.isco_source_employed_thousands as number) * 1000);
      row.employed_total_source = 'ILOSTAT survey total (ISCO base)';
    } else {
      row.employed_total = null;
      row.employed_total_source = null;
    }

    // share of the WHOLE population that works at all
    const pop = g(row, 'population_total');
    const e2p = g(row, 'emp_to_pop_ratio_15plus');
    const p1564 = g(row, 'pop_15_64_pct');
    if (truthy(row.employed_total ?? null) && pop) {
      row.employed_share_of_population_pct = pyRound(
        (100.0 * (row.employed_total as number)) / pop,
        4,
      );
    } else if (e2p !== null && p1564 !== null) {
      row.employed_share_of_population_pct = pyRound(
        (e2p * (p1564 + (g(row, 'pop_65plus_pct') || 0))) / 100.0,
        4,
      );
    } else {
      row.employed_share_of_population_pct = null;
    }

    // R8. Headcounts, not just shares -- shares hide where the exposed jobs are
    for (const [pctField, out] of [
      ['white_collar_pct', 'white_collar_employed'],
      ['professional_core_pct', 'professional_core_employed'],
      ['isco4_clerical_pct', 'clerical_employed'],
      ['isco2_professionals_pct', 'professionals_employed'],
    ] as const) {
      const v = g(row, pctField);
      row[out] =
        v !== null && truthy(row.employed_total ?? null)
          ? pyRoundInt(((row.employed_total as number) * v) / 100.0)
          : null;
    }

    // employed 15-24 in white collar, headcount
    const yPct = g(row, 'young_white_collar_pct');
    const yPop = g(row, 'population_15_24');
    const yEmpRatio = g(row, 'youth_employment_rate_15_24');
    if (yPct !== null && yPop && yEmpRatio !== null) {
      row.young_employed_total = pyRoundInt((yPop * yEmpRatio) / 100.0);
      row.young_white_collar_employed = pyRoundInt(
        ((row.young_employed_total as number) * yPct) / 100.0,
      );
    } else {
      row.young_employed_total = null;
      row.young_white_collar_employed = null;
    }

    // F. AI exposure overlay (modeled)
    if (haveIsco) {
      row.ai_exposure_weighted_score = pyRound(
        pySumFloat(
          Array.from(C.ISCO_GROUPS.values(), ([f]) => ((g(row, f) || 0.0) / 100.0) * weights[f]),
        ),
        4,
      );
    } else {
      row.ai_exposure_weighted_score = null;
    }

    // R10. Order-of-magnitude economic scale, NOT an amount at risk.
    const score = g(row, 'ai_exposure_weighted_score');
    const gdpPc = g(row, 'gdp_per_capita_ppp');
    row.exposed_wage_bill_ppp =
      score !== null && gdpPc && truthy(row.employed_total ?? null)
        ? pyRoundInt(score * (row.employed_total as number) * gdpPc)
        : null;

    // R7. Exported white-collar labor: services sold abroad, ICT-weighted.
    const sx = g(row, 'service_exports_usd');
    const ict = g(row, 'ict_service_exports_pct');
    row.ict_service_exports_usd = sx && ict !== null ? pyRoundInt((sx * ict) / 100.0) : null;
  }
  return rowsByIso;
}

// ------------------------------------------------------- R9. squeeze index
// field -> [weight, higher_is_more_squeeze]
export const SQUEEZE_COMPONENTS = new Map<string, [number, boolean]>([
  ['youth_cohort_share', [0.25, true]], //        how big the entering cohort is
  ['young_white_collar_pct', [0.3, true]], //     entering exactly the exposed jobs
  ['unemployment_rate_15_24', [0.25, true]], //   absorption already failing
  ['youth_wc_gap', [0.2, true]], //               youth MORE white collar than workforce
]);

/**
 * Entry-level squeeze: big youth cohort + concentrated in exposed occupations
 * + already struggling to be absorbed. Composite, 0-100.
 *
 * MODELED, not measured: the SQUEEZE_COMPONENTS weights above are assigned by
 * this project, the same as the ISCO exposure weights. See spec 0004 R3.
 */
export function squeezeIndex(rowsByIso: Map<string, Row>): Map<string, Row> {
  const countries = [...rowsByIso.values()].filter((r) => r.row_type === 'country');
  for (const r of countries) {
    const pop = g(r, 'population_total');
    const y = g(r, 'population_15_24');
    r.youth_cohort_share = pop && y ? pyRound((100.0 * y) / pop, 4) : null;
    const ywc = g(r, 'young_white_collar_pct');
    const wc = g(r, 'white_collar_pct');
    r.youth_wc_gap = ywc !== null && wc !== null ? pyRound(ywc - wc, 4) : null;
  }

  // percentile-rank each component so units cannot dominate the composite
  const ranks = new Map<string, number[]>();
  for (const field of SQUEEZE_COMPONENTS.keys()) {
    const vals = countries
      .filter((r) => g(r, field) !== null)
      .map((r) => g(r, field) as number)
      .sort((a, b) => a - b);
    ranks.set(field, vals);
  }
  for (const r of countries) {
    let total = 0.0;
    let wsum = 0.0;
    for (const [field, [weight, higher]] of SQUEEZE_COMPONENTS) {
      const v = g(r, field);
      const vals = ranks.get(field) as number[];
      if (v === null || vals.length === 0) continue;
      const pct = (vals.filter((x) => x < v).length / vals.length) * 100.0;
      total += weight * (higher ? pct : 100 - pct);
      wsum += weight;
    }
    // require at least three of the four components to be present
    const present = [...SQUEEZE_COMPONENTS.keys()].filter((f) => g(r, f) !== null).length;
    r.entry_level_squeeze_index = wsum && present >= 3 ? pyRound(total / wsum, 2) : null;
    r.squeeze_components_present = present;
  }
  return rowsByIso;
}

export function qualityFlag(row: Row, currentYear = 2026): string {
  const issues: string[] = [];
  if (g(row, 'white_collar_pct') === null) issues.push('no ISCO data');
  else if (row.isco_classification === 'ISCO-88') {
    issues.push('ISCO-88 fallback (no ISCO-08 series published)');
  } else {
    const age = currentYear - (g(row, 'data_year_occupation') || 0);
    if (age > 5) issues.push(`ISCO data ${row.data_year_occupation} (>5yr old)`);
    const n = g(row, 'isco_groups_reported');
    if (n !== null && n < 9) issues.push(`only ${n}/9 ISCO groups reported by source`);
    const cls = g(row, 'isco_classified_share_pct');
    if (cls !== null && cls < 90) {
      issues.push(`only ${pyFormatInt(cls)}% of employment classified by occupation`);
    }
  }
  if (g(row, 'population_total') === null) issues.push('no population data');
  if (g(row, 'lfp_rate_total') === null) issues.push('no labor force data');
  if (g(row, 'young_white_collar_pct') === null) issues.push('no youth x ISCO cross-tab');
  if (issues.length === 0) return 'complete';
  if (g(row, 'white_collar_pct') === null && g(row, 'population_total') === null) {
    return 'sparse — ' + issues.join('; ');
  }
  return 'partial — ' + issues.join('; ');
}

/** `f"{cls:.0f}"` -- half-to-even, so 88.5 is "88" and not "89". */
function pyFormatInt(v: number): string {
  return pyFormatFixed(v, 0);
}

// ---------------------------------------------------------------- aggregates
export const AGG_WEIGHTED = [
  ...Array.from(C.ISCO_GROUPS.values(), ([f]) => f),
  'white_collar_pct', 'professional_core_pct', 'blue_collar_service_pct',
  'young_white_collar_pct', 'prime_white_collar_pct',
  'late_career_white_collar_pct', 'emp_agriculture_pct', 'emp_industry_pct',
  'emp_services_pct', 'ai_exposure_weighted_score',
];
export const AGG_LF_WEIGHTED = [
  'lfp_rate_total', 'lfp_rate_15_24', 'lfp_rate_15_24_ilo', 'lfp_rate_25_54',
  'lfp_rate_55_64', 'emp_to_pop_ratio_15plus', 'youth_employment_rate_15_24',
  'unemployment_rate_total', 'unemployment_rate_15_24',
  'entry_level_squeeze_index', 'youth_cohort_share',
  'gdp_per_capita_ppp', 'labor_force_advanced_edu_pct',
];
export const AGG_POP_WEIGHTED = [
  'pop_0_14_pct', 'pop_15_64_pct', 'pop_65plus_pct', 'age_dependency_ratio',
];

export function wavg(rows: Row[], field: string, wfield: string): [number | null, number] {
  let numer = 0.0;
  let den = 0.0;
  for (const r of rows) {
    const v = g(r, field);
    const w = g(r, wfield);
    if (v !== null && w) {
      numer += v * w;
      den += w;
    }
  }
  return den ? [pyRound(numer / den, 4), den] : [null, 0.0];
}

/**
 * Sum one column across member rows, picking the path from the declared type.
 *
 * This is R1's call-site rule made concrete. `intColumn` comes from the
 * schema's `Int` brand, never from inspecting the values: `Number.isInteger`
 * is true of a Python float that happens to be integral, so a value sniff
 * would take the BigInt branch for `population_15_24` by construction.
 *
 * The mixed path exists because `apply_overrides` assigns the raw JSON value
 * with no `num()` call, so an override written `15000000` makes an otherwise
 * float column mixed -- and Python's `sum()` returns a different number for it.
 */
function sumColumn(rows: Row[], field: string): number {
  // The branch comes from `isIntColumn`, the same registry `columns.ts` uses to
  // decide how the value is SPELLED. Passing a literal here would be a second
  // source of truth for one fact, and the drift it allows is the one the `Int`
  // brand exists to make impossible: a column printed `2989466` while its
  // aggregate is summed through `pySumFloat`, byte identity gone and nothing
  // naming the cause. Still call-site selection from the declared type, which
  // is what R1 asks for -- the declaration has simply moved to where it is
  // already written down.
  const intColumn = isIntColumn(field);
  const present = rows.filter((r) => truthy(r[field] ?? null));
  const kinds = present.map((r) => overrideKinds.get(r)?.get(field));
  if (kinds.some((k) => k !== undefined && k !== (intColumn ? 'int' : 'float'))) {
    // A column carrying an override of the other kind is genuinely mixed.
    const values: PyNum[] = present.map((r, i) => {
      const kind = kinds[i] ?? (intColumn ? 'int' : 'float');
      const v = g(r, field) as number;
      return kind === 'int'
        ? { kind: 'int', value: toBigInt(asInt(v)) }
        : { kind: 'float', value: v };
    });
    return pySum(values);
  }
  if (intColumn) {
    // Narrowed HERE, at the call site, where the 296x headroom row in the spec
    // is the stated licence for it -- never inside pySumInt, which would make a
    // correct implementation fail its own fixture.
    return Number(pySumInt(present.map((r) => toBigInt(asInt(g(r, field) as number)))));
  }
  return pySumFloat(present.map((r) => g(r, field) as number));
}

export function makeAggregate(iso3: string, name: string, members: Row[], kind: string): Row {
  const rows = members.filter((r) => r);
  const agg: Row = {
    iso3, country_name: name, region: 'AGGREGATE',
    income_group: 'Aggregate', row_type: kind,
    member_count: rows.length, lat: null, lon: null, capital: null,
    iso2: null,
  };

  const totalPop = sumColumn(rows, 'population_total');
  const totalEmp = sumColumn(rows, 'employed_total');
  const totalLf = sumColumn(rows, 'labor_force_total');
  agg.population_total = totalPop || null;
  agg.employed_total = totalEmp || null;
  agg.labor_force_total = totalLf || null;
  agg.employed_total_source = 'sum of member countries';

  for (const f of AGG_POP_WEIGHTED) [agg[f]] = wavg(rows, f, 'population_total');
  for (const f of AGG_LF_WEIGHTED) [agg[f]] = wavg(rows, f, 'population_total');
  for (const f of AGG_WEIGHTED) {
    const [value, covered] = wavg(rows, f, 'employed_total');
    agg[f] = value;
    if (f === 'white_collar_pct') {
      agg.isco_coverage_pct_of_employment = totalEmp
        ? pyRound((100.0 * covered) / totalEmp, 2)
        : null;
    }
    if (f === 'young_white_collar_pct') {
      agg.youth_isco_coverage_pct_of_employment = totalEmp
        ? pyRound((100.0 * covered) / totalEmp, 2)
        : null;
    }
  }

  for (const f of [
    'clerical_employed', 'professionals_employed',
    'young_white_collar_employed', 'population_15_24',
    'exposed_wage_bill_ppp', 'ict_service_exports_usd',
    'service_exports_usd',
  ]) {
    const any = rows.some((r) => truthy(r[f] ?? null));
    agg[f] = any ? sumColumn(rows, f) : null;
  }

  agg.employed_share_of_population_pct =
    totalEmp && totalPop ? pyRound((100.0 * totalEmp) / totalPop, 4) : null;
  for (const [pctField, out] of [
    ['white_collar_pct', 'white_collar_employed'],
    ['professional_core_pct', 'professional_core_employed'],
  ] as const) {
    agg[out] =
      truthy(agg[pctField] ?? null) && totalEmp
        ? pyRoundInt((totalEmp * (agg[pctField] as number)) / 100.0)
        : null;
  }

  for (const k of [
    'data_year_population', 'data_year_labor', 'data_year_sector',
    'data_year_occupation', 'data_year_youth_occupation',
  ]) {
    const vals = rows.filter((r) => truthy(r[k] ?? null)).map((r) => g(r, k) as number);
    agg[k] = vals.length ? Math.max(...vals) : null;
    agg[k + '_range'] = vals.length ? `${Math.min(...vals)}-${Math.max(...vals)}` : null;
  }
  const nIsco = rows.filter((r) => g(r, 'white_collar_pct') !== null).length;
  agg.entry_level_data_quality = 'aggregate of country proxies';
  agg.data_quality_flag =
    `aggregate — ${nIsco}/${rows.length} members with ISCO data, ` +
    `${typeof agg.isco_coverage_pct_of_employment === 'number' ? pyStr(agg.isco_coverage_pct_of_employment) : 'None'}% of employment covered`;
  return agg;
}

// ------------------------------------------------- R3. manual overrides
/**
 * Merge nationally-sourced figures that no free API carries.
 *
 * Every override must cite its source. Applied values are tagged on the row so
 * a national figure is never silently mixed in with API-sourced data.
 *
 * 0007 R1: the payload is read through the tokenising parser, not `JSON.parse`.
 * `15000000` and `15000000.0` are `int` and `float` in Python and the same
 * `number` in JavaScript, and the difference changes what `sum()` returns for
 * the column the value lands in.
 */
export function applyOverrides(rowsByIso: Map<string, Row>, filePath: string): Map<string, Row> {
  const payload = parseTagged(readFileSync(filePath, 'utf8')) as Record<string, TaggedJson>;
  const applied: [string, string, string][] = [];
  const overrides = (payload.overrides ?? {}) as Record<string, Record<string, TaggedJson>>;
  const pending = new Map<Row, string[]>();
  for (const [iso3, fields] of Object.entries(overrides)) {
    const row = rowsByIso.get(iso3);
    if (row === undefined) {
      process.stdout.write(`      ! override for unknown area ${iso3}, skipped\n`);
      continue;
    }
    for (const [field, spec] of Object.entries(fields)) {
      const rec = spec as Record<string, TaggedJson>;
      const missing = ['value', 'year', 'source_name', 'source_url', 'retrieved', 'note'].filter(
        (k) => !(k in rec),
      );
      if (missing.length) {
        process.stdout.write(
          `      ! override ${iso3}.${field} missing ['${missing.join("', '")}'], skipped\n`,
        );
        continue;
      }
      const value = rec.value as PyNum;
      row[field] = value.kind === 'int' ? Number(value.value) : value.value;
      // THE record of what JSON.parse would have erased.
      subWeak(overrideKinds, row, () => new Map()).set(field, value.kind);
      const year = rec.year as PyNum;
      const yearText = year.kind === 'int' ? year.value.toString() : pyStr(year.value);
      const valueText = value.kind === 'int' ? value.value.toString() : pyStr(value.value);
      sub(pending, row, () => []).push(
        `${field}=${valueText} (${yearText}, ${rec.source_name as string})`,
      );
      applied.push([iso3, field, rec.source_name as string]);
    }
  }
  for (const row of rowsByIso.values()) {
    const ov = pending.get(row);
    row.data_source_override = ov ? ov.join('; ') : null;
  }
  if (applied.length) {
    process.stdout.write(`      applied ${applied.length} manual override(s)\n`);
    for (const [iso3, field, src] of applied) {
      process.stdout.write(`        ${iso3}.${field} <- ${src}\n`);
    }
  } else {
    const gaps = Object.keys((payload._unfilled_gaps ?? {}) as object).length;
    process.stdout.write(`      no manual overrides active (${gaps} known gaps documented)\n`);
  }
  return rowsByIso;
}

// ------------------------------------------------------ R5. outlier review
export const OUTLIER_FIELDS = [
  'white_collar_pct', 'professional_core_pct', 'young_white_collar_pct',
  'prime_white_collar_pct', 'isco4_clerical_pct', 'lfp_rate_total',
  'employed_share_of_population_pct', 'ai_exposure_weighted_score',
  'entry_level_squeeze_index',
];

function median(v: number[]): number | null {
  const sorted = [...v].sort((a, b) => a - b);
  const n = sorted.length;
  if (!n) return null;
  return n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/**
 * Values that are statistically improbable rather than merely impossible.
 *
 * Robust z-score (median / MAD) flags |z| > 3.5, plus two structural checks.
 * Nothing is auto-corrected -- this is a review queue.
 */
export function findOutliers(rows: Row[]): Record<string, RowValue>[] {
  const countries = rows.filter((r) => r.row_type === 'country');
  const out: Record<string, RowValue>[] = [];
  for (const field of OUTLIER_FIELDS) {
    const vals = countries.filter((r) => g(r, field) !== null).map((r) => g(r, field) as number);
    const med = median(vals);
    if (med === null || vals.length < 20) continue;
    const mad = median(vals.map((v) => Math.abs(v - med)));
    if (!mad) continue;
    for (const r of countries) {
      const v = g(r, field);
      if (v === null) continue;
      const z = (0.6745 * (v - med)) / mad;
      if (Math.abs(z) > 3.5) {
        out.push({
          iso3: r.iso3 as string, country_name: r.country_name as string,
          field, value: pyRound(v, 4),
          median: pyRound(med, 4), robust_z: pyRound(z, 2),
          reason: 'robust z-score beyond +/-3.5',
          data_year_occupation: r.data_year_occupation ?? null,
          data_quality_flag: r.data_quality_flag ?? null,
        });
      }
    }
  }
  for (const r of countries) {
    const wc = g(r, 'white_collar_pct');
    const srv = g(r, 'emp_services_pct');
    if (wc !== null && srv !== null && wc > srv + 12) {
      out.push({
        iso3: r.iso3 as string, country_name: r.country_name as string,
        field: 'white_collar_pct', value: pyRound(wc, 4),
        median: pyRound(srv, 4), robust_z: '',
        reason:
          `white collar (${fmt1(wc)}%) exceeds services employment ` +
          `(${fmt1(srv)}%) by more than 12pp -- check classification`,
        data_year_occupation: r.data_year_occupation ?? null,
        data_quality_flag: r.data_quality_flag ?? null,
      });
    }
    const ywc = g(r, 'young_white_collar_pct');
    if (ywc !== null && wc !== null && ywc - wc > 25) {
      out.push({
        iso3: r.iso3 as string, country_name: r.country_name as string,
        field: 'young_white_collar_pct', value: pyRound(ywc, 4),
        median: pyRound(wc, 4), robust_z: '',
        reason: `youth white collar exceeds all-ages by ${fmt1(ywc - wc)}pp`,
        data_year_occupation: r.data_year_occupation ?? null,
        data_quality_flag: r.data_quality_flag ?? null,
      });
    }
  }
  return out;
}

/** `f"{x:.1f}"` and `f"{x:.2f}"`, half-to-even on the exact value. */
function fmt1(x: number): string {
  return pyFormatFixed(x, 1);
}

export function fmt2(x: number): string {
  return pyFormatFixed(x, 2);
}

// --------------------------------------------------------------- validation
export function validate(rows: Row[]): string[] {
  const problems: string[] = [];
  for (const r of rows) {
    const tag = r.iso3 as string;
    for (const f of PCT_FIELDS) {
      const v = g(r, f);
      if (v !== null && !(v >= 0 && v <= 100)) {
        problems.push(`${tag}: ${f}=${pyStr(v)} outside [0,100]`);
      }
    }
    const bands = [g(r, 'pop_0_14_pct'), g(r, 'pop_15_64_pct'), g(r, 'pop_65plus_pct')];
    if (bands.every((b) => b !== null)) {
      const total = pySumFloat(bands as number[]);
      if (Math.abs(total - 100) > 1.0) {
        problems.push(`${tag}: age bands sum to ${fmt2(total)}, not ~100`);
      }
    }
    const sectors = [
      g(r, 'emp_agriculture_pct'), g(r, 'emp_industry_pct'), g(r, 'emp_services_pct'),
    ];
    if (sectors.every((x) => x !== null)) {
      const total = pySumFloat(sectors as number[]);
      if (Math.abs(total - 100) > 1.5) {
        problems.push(`${tag}: sector shares sum to ${fmt2(total)}, not ~100`);
      }
    }
    const wc = g(r, 'white_collar_pct');
    const bc = g(r, 'blue_collar_service_pct');
    if (wc !== null && bc !== null && Math.abs(wc + bc - 100) > 0.5) {
      problems.push(`${tag}: white+blue collar = ${fmt2(wc + bc)}, not 100`);
    }

    // -- 0010 R8/R9. The per-group cross-tabs.
    for (const n of C.ISCO_GROUP_NUMBERS) {
      // Age: the three bands divide YGE15, which also contains 65+, so they sum
      // to UNDER 100 and the residual is the 65-and-over cohort. Asserting ~100
      // here would be wrong; over 100 is the real error.
      const age = [...C.AGE_GROUP_BANDS.values()].map((b) => g(r, `isco${n}_age_${b}_pct`));
      if (age.every((v) => v !== null)) {
        const total = pySumFloat(age as number[]);
        if (total > 100.5) {
          problems.push(`${tag}: isco${n} age bands sum to ${fmt2(total)}, over 100`);
        }
        if (r[`isco${n}_age_year`] === null || r[`isco${n}_age_year`] === undefined) {
          problems.push(`${tag}: isco${n} age shares with no isco${n}_age_year`);
        }
      }

      // Education: BAS/INT/ADV/LTB do not partition TOTAL either -- the
      // unspecified cell sits outside them -- so the same rule applies. What IS
      // checked is the coverage floor: anything that survived the loader must
      // be at or above it, or the withholding did not happen.
      const present = [...C.EDU_GROUP_BANDS.values()]
        .map((b) => g(r, `isco${n}_edu_${b}_pct`))
        .filter((v): v is number => v !== null);
      const flag = r[`isco${n}_edu_flag`];
      if (present.length) {
        const total = pySumFloat(present);
        if (total > 100.5) {
          problems.push(`${tag}: isco${n} education chips sum to ${fmt2(total)}, over 100`);
        }
        if (total < C.EDU_COVERAGE_FLOOR - 0.5) {
          problems.push(
            `${tag}: isco${n} education chips cover ${fmt2(total)}%, ` +
              `below the ${pyStr(C.EDU_COVERAGE_FLOOR)}% floor -- should have been withheld`,
          );
        }
        if (r[`isco${n}_edu_year`] === null || r[`isco${n}_edu_year`] === undefined) {
          problems.push(`${tag}: isco${n} education shares with no isco${n}_edu_year`);
        }
        if (flag !== C.EDU_FLAG_PRESENT) {
          problems.push(`${tag}: isco${n} has education shares but flag=${flag}`);
        }
      } else if (
        flag === C.EDU_FLAG_WITHHELD &&
        (r[`isco${n}_edu_year`] === null || r[`isco${n}_edu_year`] === undefined)
      ) {
        // A withholding names the survey it judged; without the year it is
        // indistinguishable from the source publishing nothing.
        problems.push(`${tag}: isco${n} withheld with no isco${n}_edu_year`);
      }
    }
  }
  return problems;
}
