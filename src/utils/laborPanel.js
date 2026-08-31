// Time-series panel lookup. 0010 R1 keeps `seriesFor` and `PANEL_YEARS`; the
// other three exports -- the field list, the year-snapshot merge and the
// coverage lookup -- went with the map, which was their only consumer. They are
// named in spec 0010 R1, not here: R1's acceptance greps this tree for them.
import timeseries from '../data/global_labor_timeseries.json';

const FIELDS = timeseries.fields;
export const PANEL_YEARS = timeseries.years.filter((y) => y <= 2025);

const PANEL = {};
Object.entries(timeseries.series).forEach(([iso3, years]) => {
  PANEL[iso3] = {};
  Object.entries(years).forEach(([year, values]) => {
    const o = {};
    FIELDS.forEach((f, i) => { o[f] = values[i]; });
    PANEL[iso3][year] = o;
  });
});

/** One country's series for one field, ascending by year, nulls dropped. */
export function seriesFor(iso3, field) {
  const years = PANEL[iso3];
  if (!years) return [];
  return Object.entries(years)
    .map(([year, v]) => ({ year: Number(year), value: v[field] }))
    .filter((p) => p.value !== null && p.value !== undefined && p.year <= 2025)
    .sort((a, b) => a.year - b.year);
}
