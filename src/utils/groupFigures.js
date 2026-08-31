// R10 and R11. What the result screen reports about one group in one country.
//
// R10 — the group's share of employment, its tier, and its own vintage. Never
// presented as a single-year snapshot: where R8's and R9's values are shown,
// their years are shown with them, and those are per (country, group).
//
// R10 also owns the **withdrawal** R6 sets up. Step 01 tags a country
// `official series` if it reports ANY of the nine groups, so a country can be
// tagged and still not report the reader's group. When that happens the screen
// states it in words — which group, which country, that the source does not
// publish it — rather than rendering a blank or a dash that reads like a value.
//
// R11 — the headcount. `clerical_employed` exists in the payload but the other
// eight groups have none, so it is derived. Two things about that derivation
// are worth stating because they are easy to get wrong:
//
//   1. `round(share / 100 * employed_total)` reproduces the payload's own
//      `clerical_employed` for 177 of 177 countries exactly, so this reuses the
//      pipeline's canonical base rather than inventing a near-duplicate.
//   2. It is a **two-source join**. The share comes from the ILO survey base and
//      `employed_total` from the World Bank, and the two disagree — for GBR,
//      33,728,592 against `isco_source_employed_thousands`' 34,055,472, about
//      1%. "Label the arithmetic" means naming both, not implying one base.
import { fmt, fmtCompact } from './laborMetrics'
import { groupByNumber } from './isco'
import { NOT_PUBLISHED, PRESENT, absenceMessage } from './absence'

export const DERIVED = 'DERIVED'

/** The group's share of employment, with its tier and vintage. */
export function groupShare(row, group) {
  const g = groupByNumber(group)
  if (!row || !g) return { state: NOT_PUBLISHED, value: null }
  const value = row[g.key]
  if (value === null || value === undefined) {
    return {
      state: NOT_PUBLISHED,
      value: null,
      // The withdrawal, in words. R6 may have promised a series for this
      // country; this is where that promise is honestly withdrawn.
      message: absenceMessage(NOT_PUBLISHED, {
        country: row.country_name,
        group: g.label.toLowerCase(),
      }),
    }
  }
  return {
    state: PRESENT,
    value,
    display: fmt(value, 1, '%'),
    tier: DERIVED,
    year: row.data_year_occupation ?? null,
    label: g.label,
  }
}

/**
 * The group's headcount, derived, or absent.
 *
 * Returns the sources it joined so the caller can label the arithmetic rather
 * than presenting a single figure with a single provenance.
 */
export function groupHeadcount(row, group) {
  const g = groupByNumber(group)
  if (!row || !g) return { state: NOT_PUBLISHED, value: null }
  const share = row[g.key]
  const employed = row.employed_total
  if (share === null || share === undefined ||
      employed === null || employed === undefined) {
    return {
      state: NOT_PUBLISHED,
      value: null,
      message: absenceMessage(NOT_PUBLISHED, {
        country: row.country_name,
        group: g.label.toLowerCase(),
      }),
    }
  }
  const value = Math.round((share / 100) * employed)
  return {
    state: PRESENT,
    value,
    display: fmtCompact(value),
    tier: DERIVED,
    year: row.data_year_occupation ?? null,
    // Both, always. This is the join, not a measurement.
    sources: ['ILOSTAT occupation survey (share)', 'World Bank (employed total)'],
    note: 'Share × total employment. The two come from different sources and disagree slightly.',
  }
}
