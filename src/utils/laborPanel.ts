// Time-series panel lookup. 0010 R1 keeps `seriesFor` and `PANEL_YEARS`; the
// other three exports -- the field list, the year-snapshot merge and the
// coverage lookup -- went with the map, which was their only consumer. They are
// named in spec 0010 R1, not here: R1's acceptance greps this tree for them.
import timeseries from '../data/global_labor_timeseries.json';

const FIELDS = timeseries.fields;
export const PANEL_YEARS = (timeseries.years as readonly number[]).filter((y) => y <= 2025);

/** One year's cells for one country, keyed by field name. `unknown` per cell
 *  rather than `number`, because a cell may be null and a null must stay null
 *  rather than being coerced to 0 by an over-eager type. */
type PanelYear = Record<string, unknown>;

const PANEL: Record<string, Record<string, PanelYear>> = {};
Object.entries(timeseries.series as Record<string, Record<string, readonly unknown[]>>)
  .forEach(([iso3, years]) => {
    PANEL[iso3] = {};
    Object.entries(years).forEach(([year, values]) => {
      const o: PanelYear = {};
      FIELDS.forEach((f: string, i: number) => { o[f] = values[i]; });
      PANEL[iso3][year] = o;
    });
  });

/** One country's series for one field, ascending by year, nulls dropped. */
export function seriesFor(iso3: string | null | undefined, field: string) {
  const years = iso3 ? PANEL[iso3] : undefined;
  if (!years) return [];
  return Object.entries(years)
    .map(([year, v]) => ({ year: Number(year), value: v[field] as number | null }))
    .filter((p) => p.value !== null && p.value !== undefined && p.year <= 2025)
    .sort((a, b) => a.year - b.year);
}
