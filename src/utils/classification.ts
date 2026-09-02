import type { LaborRow } from '@/types'
// R18. Ten countries publish ISCO-88, and the result screen says so.
//
// 167 of the 177 countries with an ISCO block publish ISCO-08; ten publish
// ISCO-88 — BMU, CAN, MAC, NAM, NIC, TTO, TWN, UKR, YEM, ZAF — carried in
// `isco_classification`.
//
// Why this matters here and not in the map: `pipeline/README.md` justifies the
// fallback on the grounds that "the two revisions align 1:1 at the major-group
// level, so the 1-4 white-collar cut carries over", and then names where that
// breaks — the revision "did move some ICT occupations between groups 2 and 3".
// The old app rendered only the aggregate cut, so the fallback was invisible
// and harmless. This spec moves the unit of analysis to the individual major
// group, which is precisely where the README says comparability degrades, on
// the one screen that tells a person about their own occupation.
//
// A Canadian who types "software developer" resolves to group 2 and is shown an
// ISCO-88 group 2 share under an ISCO-08 label. R12's principle applies
// unchanged: a stand-in says it is standing in.

export const ISCO88 = 'ISCO-88'
export const ISCO08 = 'ISCO-08'

/** The 2/3 boundary is the one the README flags, so the notice names it. */
const BOUNDARY_GROUPS: readonly number[] = [2, 3]

export function isIsco88(row: LaborRow | null | undefined) {
  return row?.isco_classification === ISCO88
}

/**
 * @returns {{classification: string, boundary: boolean, text: string}|null}
 *   null where the country publishes ISCO-08, which is the common case.
 */
export function classificationNotice(row: LaborRow | null | undefined, group: number | null | undefined) {
  if (!isIsco88(row)) return null
  const country = row?.country_name ?? 'This country'
  const boundary = group != null && BOUNDARY_GROUPS.includes(group)
  const base =
    `${country} publishes ISCO-88, not ISCO-08. The mapping between the two ` +
    `is the pipeline's, not the source's.`
  const caveat = boundary
    ? ' The revision moved some ICT occupations between groups 2 and 3, so this' +
      ' group is where the two classifications agree least.'
    : ''
  return { classification: ISCO88, boundary, text: base + caveat }
}
