// R12. The trend says it is a stand-in whenever it is one.
//
// `global_labor_timeseries.json` carries `isco4_clerical_pct` and no other ISCO
// group — probed 2026-08-31, 226 series over 2013–2026, of which 185 carry a
// clerical point. So the sparkline is that group's own series for group 4, and
// for the other eight it is either labelled as a stand-in or not shown.
//
// An unlabelled clerical line under a heading about craft workers is the same
// substitution R9's denominator rule and R15 exist to prevent. It is not a
// number this project invented — it is a real series presented as if it were
// about something else, which is worse for being harder to spot.
//
// Reuses `seriesFor` rather than reading the payload again: R1 keeps it for
// exactly this, and a second sparkline pipeline would be a second thing to keep
// in step.
import { seriesFor } from './laborPanel'

export const CLERICAL_FIELD = 'isco4_clerical_pct'
export const CLERICAL_GROUP = 4

// The dashed marker the canvas puts on the sparkline. Generative AI arrived
// between these; the point of showing it is that the trend does not bend there.
export const GENAI_YEAR = 2022

export function trendFor(iso3, group) {
  const points = seriesFor(iso3, CLERICAL_FIELD)
  if (!points.length) {
    // No series at all for this country. Nothing to label and nothing to show —
    // an empty chart frame would read as "flat", which is a claim.
    return { show: false, standIn: false, points: [], reason: 'no_series' }
  }
  const standIn = group !== CLERICAL_GROUP
  return {
    show: true,
    standIn,
    points,
    field: CLERICAL_FIELD,
    genaiYear: GENAI_YEAR,
    tier: 'DERIVED',
    // The notice is the requirement, not decoration. A caller that renders
    // `points` without it has broken R12.
    notice: standIn
      ? 'Clerical support workers shown as a stand-in — no time series is published for this group.'
      : null,
  }
}
