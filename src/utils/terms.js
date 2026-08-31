// R16. The method panel tells the truth about the model.
//
// A pure `termsFor(row, group)` rather than a list written into JSX, so "the
// terms match the figures actually rendered" is an assertion over one function
// instead of a person reading two lists side by side. That is the difference
// between R16 being tested and R16 being looked at.
//
// The panel lists what the result screen *uses*. A term with no source appears
// as an absence with its reason, never as a number — which is the whole reason
// the canvas's method panel is worth keeping while its headline is not.
import { groupByNumber } from './isco'
import { groupShare, groupHeadcount } from './groupFigures'
import { trendFor } from './trend'
import { FLAG_WITHHELD, PRESENT } from './absence'

/**
 * @returns {Array<{name, tier, sourced, desc}>} in the order the panel renders.
 */
export function termsFor(row, group, crosstabs) {
  const g = groupByNumber(group)
  const terms = []

  const share = groupShare(row, group)
  terms.push({
    name: 'Share of employment',
    tier: share.state === PRESENT ? 'DERIVED' : null,
    sourced: share.state === PRESENT,
    year: share.year ?? null,
    desc: share.state === PRESENT
      ? `${g.label} as a share of employment, from the ILOSTAT occupation survey.`
      : 'Not published for this country and group.',
  })

  const head = groupHeadcount(row, group)
  terms.push({
    name: 'People doing it',
    tier: head.state === PRESENT ? 'DERIVED' : null,
    sourced: head.state === PRESENT,
    year: head.year ?? null,
    desc: head.state === PRESENT
      ? 'Share × total employment. Two sources: the ILO survey base and the World Bank total, which disagree slightly.'
      : 'Not published for this country and group.',
  })

  const trend = trendFor(row?.iso3, group)
  terms.push({
    name: 'Trend since 2013',
    tier: trend.show ? 'DERIVED' : null,
    sourced: trend.show,
    desc: !trend.show
      ? 'No time series is published for this country.'
      : trend.standIn
        ? 'Clerical support workers, standing in — no series is published for this group.'
        : 'This group’s own series.',
  })

  if (crosstabs) {
    for (const [name, prefix] of [['Age profile', 'age'], ['Education profile', 'edu']]) {
      const present = Object.keys(crosstabs.values ?? {}).some(
        (k) => k.startsWith(`isco${group}_${prefix}_`) &&
               k.endsWith('_pct') && crosstabs.values[k] !== null,
      )
      terms.push({
        name,
        tier: present ? 'DERIVED' : null,
        sourced: present,
        year: crosstabs.values?.[`isco${group}_${prefix}_year`] ?? null,
        // No longer hedging "withheld or not published": the flag says which.
        desc: present
          ? 'ILOSTAT, cross-tabulated with occupation.'
          : crosstabs.values?.[`isco${group}_${prefix}_flag`] === FLAG_WITHHELD
            ? 'Withheld: the published bands describe too little of this group to report honestly.'
            : 'Not published for this country and group.',
      })
    }
  }

  // The term the canvas's own method panel concedes, and the reason this spec
  // ships no year. R13 is [!]: probed 2026-08-31, nothing publishes a
  // displacement date per occupation — the nearest published work is US-only
  // decadal occupational churn on US census classifications, which is not
  // ISCO-08, not per country, and not AI displacement.
  terms.push({
    name: 'Duration to displacement',
    tier: null,
    sourced: false,
    unsourced: true,
    desc: 'Not sourced. No published dataset gives a displacement date per occupation, so this project does not state one (spec 0010 R13).',
  })

  return terms
}

/** R16's back-test half: the floor, stated rather than implied. */
export const BACKTEST_NOTE =
  'Occupation detail bottoms out at nine major groups worldwide. No source ' +
  'supports telling an individual that their specific role is at risk — only ' +
  'their occupational group. No back-test is claimed here, because no ' +
  'displacement model ships.'
