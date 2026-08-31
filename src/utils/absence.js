// R15. Nothing is imputed, anywhere in the wizard.
//
// This restates a rule REVIEW.md Pass 1 already enforces as a Blocker, and it
// earns a module because the surface makes it newly tempting: the map showed
// 218 countries at once, so a gap was visibly a gap. The wizard shows **one**
// country, and a blank screen invites a fallback to a regional average, a world
// figure, or a neighbour.
//
// There is no fallback path in here on purpose. Every function returns a
// *described absence* instead — a reason the screen can say out loud.

export const PRESENT = 'present'
export const NOT_PUBLISHED = 'not_published'   // the source carries nothing
export const WITHHELD = 'withheld'             // below R9's coverage floor
export const NOT_LOADED = 'not_loaded'         // R20: the fetch has not resolved
export const LOAD_FAILED = 'load_failed'       // R20: the fetch failed

/**
 * The one distinction R20 exists to protect.
 *
 * Both payloads used to be static imports, so a missing value could only mean
 * one thing. A per-country fetch gives absence three meanings, and R6's
 * `no series`, R9's withheld branch and R10's stated absence are all statements
 * *about ILOSTAT*. A 404 or an offline phone landing in any of them would tell
 * a reader that ILOSTAT does not publish something it does publish — not an
 * invented number, an invented absence.
 */
export function isSourceAbsence(state) {
  return state === NOT_PUBLISHED || state === WITHHELD
}

export function isLoadProblem(state) {
  return state === NOT_LOADED || state === LOAD_FAILED
}

/** Prose for each absence, so no screen has to invent its own wording. */
export function absenceMessage(state, { country, group } = {}) {
  switch (state) {
    case NOT_PUBLISHED:
      return group && country
        ? `${country} does not publish a figure for ${group}.`
        : 'The source does not publish this figure.'
    case WITHHELD:
      return country
        ? `Withheld: the published bands describe too little of ${country}'s workforce to report honestly.`
        : 'Withheld: the published bands describe too little of the workforce to report honestly.'
    case NOT_LOADED:
      return 'Loading…'
    case LOAD_FAILED:
      return 'Could not load. This is a problem at our end, not a gap in the data.'
    default:
      return null
  }
}

/**
 * Read one field, and say why when it is not there.
 *
 * `quality` carries the row's own data_quality_flag so the result screen can
 * surface it — R15 requires a row flagged other than `complete` to say so
 * rather than presenting itself as whole.
 */
export function readField(row, field) {
  if (!row) return { state: NOT_PUBLISHED, value: null, quality: null }
  const value = row[field]
  const quality = row.data_quality_flag ?? null
  if (value === null || value === undefined) {
    return { state: NOT_PUBLISHED, value: null, quality }
  }
  return { state: PRESENT, value, quality }
}
