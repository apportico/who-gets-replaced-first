// 0017 R7. The back-test, as the result screen reads it.
//
// This module exists to change one sentence. The `backtest` accordion used to
// say "No back-test is claimed here, because no displacement model ships" —
// true when it was written, and false now: a back-test is claimed, it is the
// evidence for the refusal the screen makes two paragraphs higher up, and the
// reader is entitled to see how it came out.
//
// The finding, in one line: fitting the naive trend on 2013–2019 and predicting
// 2025 is **beaten by assuming nothing changes**, and it gets the direction of
// travel wrong 42% of the time. That is why the screen states no date.
//
// Coverage is the other half. Only 64 of the 177 countries with an ISCO series
// can be scored at all, so most readers land on a country with no row here.
// That case says so; it does not borrow the pooled figure and present it as the
// reader's own. Nulls stay null on this screen like everywhere else.
import payload from '../data/backtest.json'

const FIELDS = payload.fields
const SUMMARY_FIELDS = payload.summary_fields

/**
 * A hydrated back-test row: the column-name -> value mapping the payload stores
 * positionally. `unknown` per cell rather than `any` — every read below narrows
 * it, and a cell that is null must stay null rather than becoming 0.
 */
type BacktestRow = Record<string, unknown>

const hydrate = (values: readonly unknown[], fields: readonly string[]): BacktestRow => {
  const o: BacktestRow = {}
  fields.forEach((f, i) => { o[f] = values[i] })
  return o
}

/** iso3 -> group column -> row object. */
const SERIES: Record<string, Record<string, BacktestRow>> = {}
Object.entries(payload.series as Record<string, Record<string, readonly unknown[]>>)
  .forEach(([iso3, groups]) => {
    SERIES[iso3] = {}
    Object.entries(groups).forEach(([group, values]) => {
      SERIES[iso3][group] = hydrate(values, FIELDS)
    })
  })

const SUMMARY: Record<string, BacktestRow> = {}
;(payload.summary as readonly (readonly unknown[])[]).forEach((values) => {
  const row = hydrate(values, SUMMARY_FIELDS)
  SUMMARY[String(row.group)] = row
})

export const BACKTEST_FIELD_TIERS = payload.field_tiers as Record<string, string>
export const POOLED = SUMMARY.POOLED
export const FIT_START_YEAR = payload.fit_start_year
export const FIT_END_YEAR = payload.fit_end_year
export const TARGET_YEAR = payload.target_year
export const COUNTRIES_WITH_SERIES = payload.countries_with_series
export const ELIGIBLE_COUNTRIES = payload.eligible_countries

/** The ISCO major-group number, as the wizard holds it, to the panel column. */
const COLUMN = {
  1: 'isco1_managers_pct',
  2: 'isco2_professionals_pct',
  3: 'isco3_technicians_pct',
  4: 'isco4_clerical_pct',
  5: 'isco5_service_sales_pct',
  6: 'isco6_agricultural_pct',
  7: 'isco7_craft_pct',
  8: 'isco8_operators_pct',
  9: 'isco9_elementary_pct',
} as Record<number, string>

export function groupColumn(group: number | null | undefined) {
  return group == null ? null : (COLUMN[group] ?? null)
}

/** The tier a field carries, from the payload's own registry — never guessed. */
export function tierFor(field: string) {
  return BACKTEST_FIELD_TIERS[field] ?? null
}

/**
 * The reader's own pair, or a statement that there isn't one.
 *
 * Returns `{ scored: false }` for a country-group the back-test could not
 * score. The caller shows the pooled finding in that case and says whose figure
 * it is, rather than letting a national-looking number stand in for one that
 * was never computed.
 */
export function backtestFor(iso3: string | null | undefined, group: number | null | undefined) {
  const column = groupColumn(group)
  if (!iso3 || !column) return { scored: false, group: column }
  const row = SERIES[iso3]?.[column]
  if (!row) return { scored: false, group: column }
  return { scored: true, group: column, ...row }
}

/** Per-group summary, for the group the reader picked. */
export function summaryFor(group: number | null | undefined) {
  const column = groupColumn(group)
  return column ? (SUMMARY[column] ?? null) : null
}

const pp = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}pp`
export const signedPp = pp

/** `8.9%` — the shares are published to one decimal everywhere on this screen. */
export const pct = (v: number) => `${v.toFixed(1)}%`

/**
 * R7 + R14. The note under the accordion, replacing the old
 * "No back-test is claimed here" sentence.
 *
 * Still says what the nine-group floor means, because that limit did not go
 * away; what changes is that the second half now reports a measurement instead
 * of declining to make one.
 */
export const BACKTEST_NOTE =
  'Occupation detail bottoms out at nine major groups worldwide. No source '
  + 'supports telling an individual that their specific role is at risk — only '
  + 'their occupational group. And no source publishes a displacement date for '
  + 'any occupation, anywhere, so this page states none. That refusal is '
  + 'measured, not assumed: the back-test below is what happened when the '
  + 'obvious model was asked to predict a year that has already been observed.'
