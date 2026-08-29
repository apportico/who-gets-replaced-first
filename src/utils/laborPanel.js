// R6/R13. Time-series panel lookup, shared by the page and the detail panel.
// Lives here rather than in LaborPage so the two components don't import each
// other in a cycle.
import timeseries from '../data/global_labor_timeseries.json';

export const TS_FIELDS = timeseries.fields;
export const PANEL_YEARS = timeseries.years.filter((y) => y <= 2025);

const PANEL = {};
Object.entries(timeseries.series).forEach(([iso3, years]) => {
  PANEL[iso3] = {};
  Object.entries(years).forEach(([year, values]) => {
    const o = {};
    TS_FIELDS.forEach((f, i) => { o[f] = values[i]; });
    PANEL[iso3][year] = o;
  });
});

/** Row as it stood in a given year, or the latest-year snapshot when year is null. */
export function rowForYear(row, year) {
  if (year === null) return row;
  const snap = PANEL[row.iso3]?.[String(year)];
  if (!snap) return { ...row, ...Object.fromEntries(TS_FIELDS.map((f) => [f, null])) };
  return { ...row, ...snap };
}

export function seriesFor(iso3, field) {
  const years = PANEL[iso3];
  if (!years) return [];
  return Object.entries(years)
    .map(([year, v]) => ({ year: Number(year), value: v[field] }))
    .filter((p) => p.value !== null && p.value !== undefined && p.year <= 2025)
    .sort((a, b) => a.year - b.year);
}

export function coverageForYear(year) {
  if (year === null) return null;
  return PANEL.WLD?.[String(year)]?.isco_coverage_pct_of_employment ?? null;
}
