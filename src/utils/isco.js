// The nine ISCO-08 major groups, as the wizard states them.
//
// The key/number mapping is reused from laborMetrics rather than re-typed —
// that list is what the pipeline's column names are keyed on, and two copies
// would drift the first time a column was renamed. What is added here is the
// *official* ISCO-08 label. laborMetrics' labels are map-legend abbreviations
// ("Technicians & associate professionals"); the wizard tells a person which
// group their own job sits in, so it uses the published wording.
//
// Nine is the floor, and it is a real one: no source supports telling an
// individual their specific role is at risk, only their occupational group
// (spec 0010 R16).
import { ISCO_GROUPS } from './laborMetrics'

const OFFICIAL = {
  1: 'Managers',
  2: 'Professionals',
  3: 'Technicians and associate professionals',
  4: 'Clerical support workers',
  5: 'Service and sales workers',
  6: 'Skilled agricultural, forestry and fishery workers',
  7: 'Craft and related trades workers',
  8: 'Plant and machine operators, and assemblers',
  9: 'Elementary occupations',
}

// The chip face. Short enough for a 3-column grid on a 480px column.
const SHORT = {
  1: 'Managers',
  2: 'Professionals',
  3: 'Technicians',
  4: 'Clerical',
  5: 'Service & sales',
  6: 'Agricultural',
  7: 'Craft & trades',
  8: 'Operators',
  9: 'Elementary',
}

export const GROUPS = ISCO_GROUPS.map((g) => ({
  n: g.n,
  key: g.key,
  label: OFFICIAL[g.n],
  short: SHORT[g.n],
}))

export function groupByNumber(n) {
  return GROUPS.find((g) => g.n === n) ?? null
}

/** `4 · Clerical support workers` — the form the resolution is shown in. */
export function groupDisplay(n) {
  const g = groupByNumber(n)
  return g ? `${g.n} · ${g.label}` : null
}
