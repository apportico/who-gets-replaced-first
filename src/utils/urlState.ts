// R1, R5, R6 (spec 0016) — the wizard's state, as a URL.
//
// **A query string on the existing path.** Not a fragment and not a path
// segment, and the reasoning is a probe rather than a preference (0016's Source
// verification, 2026-09-01):
//
//   - `…/who-gets-replaced-first/result` returns **404** on GitHub Pages, and
//     `public/` carries no `404.html`. A real route needs the SPA-fallback
//     hack, which serves every deep link under a 404 status.
//   - A fragment is stripped before the request leaves the browser. A hash URL
//     is therefore invisible to the server, to a crawler and to a preview
//     scraper — which would *permanently foreclose* the per-result OG card #78
//     wants, rather than merely leave it unbuilt.
//   - `…/?c=GBR&g=3` returns **200** with no server config at all.
//
// Everything here is pure: no DOM, no React, no `location`. That is what puts
// R5's named absence and R6's degradation inside vitest instead of in a manual
// browser walk — the two rules most worth asserting are also the two hardest to
// eyeball.
import { AGE_BAND_KEYS, EDU_BAND_KEYS } from './crossTabs'
import { hasAnyIscoGroup } from './countryList'
import type { WizardState, LaborRow, AbsentCountry } from '@/types'

/**
 * The wizard's five screens. Moved here from `WizardShell` so the slugs the URL
 * writes and the order the shell renders are one list — two copies would drift
 * the first time a step was inserted, and the failure would be a link that
 * opens the wrong screen rather than an error.
 */
export const STEPS = ['intro', 'country', 'occupation', 'optional', 'result']

export const STEP_INTRO = 0
export const STEP_COUNTRY = 1
export const STEP_OCCUPATION = 2
export const STEP_RESULT = 4

/** The state a URL carries, and nothing else. */
export const EMPTY = { step: STEP_INTRO, iso3: null, group: null, age: null, edu: null }

/**
 * R1. State → query string, or `''` for the intro.
 *
 * Parameter order is fixed rather than insertion-ordered so the same state
 * always produces the same string — a link copied twice is the same link, and
 * the test can assert it literally.
 */
/**
 * 0019 R5. `Partial<WizardState>`, not `WizardState` — found by type-checking
 * the suite, which is the half of R5 with teeth. The body is
 * `{ ...EMPTY, ...state }`, so a caller supplying only `{ step }` is doing
 * exactly what the function is built for; the stricter signature described a
 * contract the implementation never had.
 */
export function encode(state: Partial<WizardState>) {
  const s = { ...EMPTY, ...state }
  if (s.step === STEP_INTRO) return ''
  const q = new URLSearchParams()
  q.set('step', STEPS[s.step])
  if (s.iso3) q.set('country', s.iso3)
  if (s.group) q.set('group', String(s.group))
  if (s.age) q.set('age', s.age)
  if (s.edu) q.set('edu', s.edu)
  return `?${q}`
}

const countryRows = (rows: readonly LaborRow[] | null | undefined): readonly LaborRow[] =>
  (rows ?? []).filter((r) => r.row_type === 'country')

/**
 * The deepest step the surviving parameters can render honestly.
 *
 * This is R6's whole rule in three lines. `result` and `optional` state a
 * figure about a country and a group, so both are required; `occupation` needs
 * the country the cross-tabs are fetched for; `country` needs nothing. A
 * truncated link, an unknown ISO code and a hand-edited `group=12` all reach
 * this the same way — there is deliberately no per-case branch.
 */
function deepestSupported(iso3: string | null, group: number | null) {
  if (!iso3) return STEP_COUNTRY
  if (!group) return STEP_OCCUPATION
  return STEP_RESULT
}

/**
 * R1 + R5 + R6. Query string → state, plus what had to be thrown away.
 *
 * @returns {{
 *   step: number, iso3: string|null, group: number|null,
 *   age: string|null, edu: string|null,
 *   absent: {iso3: string, name: string}|null,
 *   dropped: string[],
 * }}
 *
 * `absent` and `dropped` are different facts and are kept apart on purpose.
 * A country that is not in the dataset is a **broken link** — `dropped`. One of
 * the 41 that is in the dataset and publishes no occupation breakdown is a
 * **statement about the source** — `absent`, carrying the name so step 01 can
 * say which country it was. Collapsing the two would tell a reader in China
 * that their link was malformed, when what is true is that ILOSTAT publishes
 * nothing for China.
 */
export function decode(search: string, rows: readonly LaborRow[] | null | undefined) {
  const q = new URLSearchParams(search ?? '')
  const dropped = []
  let absent: AbsentCountry | null = null

  // Country. Aggregates are rejected: `WLD` is a row in the payload but it is
  // not a country, and rendering a world figure as somebody's country would be
  // the imputation rule broken through the address bar.
  let iso3 = null
  const rawCountry = q.get('country')
  if (rawCountry) {
    const hit = countryRows(rows).find((r) => r.iso3 === rawCountry.toUpperCase())
    if (!hit) dropped.push('country')
    else if (!hasAnyIscoGroup(hit)) absent = { iso3: hit.iso3, name: hit.country_name }
    else iso3 = hit.iso3
  }

  // Group. `Number` rather than `parseInt`, so `3abc` is rejected instead of
  // silently becoming 3.
  let group = null
  const rawGroup = q.get('group')
  if (rawGroup) {
    const n = Number(rawGroup)
    if (Number.isInteger(n) && n >= 1 && n <= 9) group = n
    else dropped.push('group')
  }

  // The two optional bands, against the key lists the screens render from.
  let age = null
  const rawAge = q.get('age')
  if (rawAge) {
    if (AGE_BAND_KEYS.includes(rawAge)) age = rawAge
    else dropped.push('age')
  }

  let edu = null
  const rawEdu = q.get('edu')
  if (rawEdu) {
    if (EDU_BAND_KEYS.includes(rawEdu)) edu = rawEdu
    else dropped.push('edu')
  }

  // Step, then the clamp.
  //
  // The two failure shapes are not the same, and treating them alike sent a
  // link carrying a perfectly good country to the intro screen — which has no
  // slot to explain itself, so the reader would have seen their link silently
  // discarded. So:
  //
  //   - **No `step` at all** is the bare landing. Intro. The app never writes
  //     this (encode omits the whole query for the intro and always writes a
  //     slug otherwise), so it only arrives hand-edited.
  //   - **A `step` we cannot read** still says the sender meant somewhere
  //     inside the wizard. Honour that intent as far as the surviving answers
  //     allow, and let the clamp be the whole answer.
  const deepest = deepestSupported(iso3, group)
  let requested = STEP_INTRO
  const rawStep = q.get('step')
  if (rawStep) {
    const i = STEPS.indexOf(rawStep)
    if (i > 0) requested = i
    else {
      dropped.push('step')
      requested = deepest
    }
  }

  const step = Math.min(requested, deepest)
  return { step, iso3, group, age, edu, absent, dropped }
}

const DROP_WORDING: Record<string, string> = {
  country: 'names a country this dataset does not carry',
  group: 'names an occupation group outside the nine',
  age: 'names an age band that is not one of the three published',
  edu: 'names an education level that is not one of the four published',
  step: 'names a step that does not exist',
}

/**
 * R5 + R6. One sentence saying what the link asked for and did not get, or
 * null when nothing was lost.
 *
 * Rendered as a `.wz-note` under the lede of whichever step the clamp landed
 * on — the slot 0011 R5 already uses for the locale absence, so the wording
 * sits where a reader of this app has learned to look for an explanation.
 *
 * Saying it out loud is the point. A link that silently opens somewhere other
 * than where it pointed reads as a broken site; a link that says what it could
 * not honour reads as a site that knows what it does not know.
 */
export function noticeFor(
  { absent, dropped }: { absent?: AbsentCountry | null; dropped?: readonly string[] } = {},
) {
  if (absent) {
    return `That link named ${absent.name}, which is in the dataset but reports no occupation breakdown to ILOSTAT — so there is no result to give you. Pick somewhere else below.`
  }
  if (!dropped?.length) return null
  const parts = dropped.map((d) => DROP_WORDING[d]).filter(Boolean)
  if (!parts.length) return null
  const joined = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `That link ${joined}, so it could not be opened as sent. This is where it picks up.`
}
