// R20. The per-group cross-tabs, fetched for the chosen country.
//
// R8 and R9 add 81 columns to every row. Carrying them in
// `src/data/global_labor.json` would take the first load from 593 KB to about
// 1.2 MB, almost all of it describing the 217 countries the reader did not
// pick — on the spec whose first premise is mobile-first. So they ship one file
// per country and arrive after step 01.
//
// One file per country, not one combined file: a single artefact would still
// carry ~575 KB of which about 2.5 KB is the chosen country, which defers the
// download to the step 01 → step 02 transition rather than removing it, and
// delivers it mid-wizard.
//
// **A dynamic `import()`, not a `fetch` of `public/`.** `vite.config.js` sets
// the production base to `/who-gets-replaced-first/`, so a hand-built URL has
// to carry `import.meta.env.BASE_URL` and the failure mode is the nasty one:
// works in dev, 404s on Pages, and the 404 then lands in one of the absence
// branches below. Vite code-splits these and resolves the base itself.
import {
  FLAG_WITHHELD,
  LOAD_FAILED,
  NOT_LOADED,
  NOT_PUBLISHED,
  PRESENT,
  WITHHELD,
} from './absence'

// Vite turns this glob into a map of lazy importers at build time, so the
// per-country chunk is only fetched when it is asked for.
const FILES = import.meta.glob('../data/crosstabs/*.json')

const cache = new Map()

/**
 * @returns {Promise<{state: string, data: object|null}>}
 *
 * The state is the point of this function. A failed fetch must never render as
 * "the source does not publish it" — see R20 and `absence.isSourceAbsence`.
 */
export async function loadCrossTabs(iso3) {
  if (!iso3) return { state: NOT_LOADED, data: null }
  if (cache.has(iso3)) return cache.get(iso3)
  const key = `../data/crosstabs/${iso3}.json`
  const importer = FILES[key]
  if (!importer) {
    // No artefact for this ISO3. The pipeline writes one per country row, so
    // this means the app and the payload are out of step — a load problem, not
    // a statement about ILOSTAT.
    const miss = { state: LOAD_FAILED, data: null }
    cache.set(iso3, miss)
    return miss
  }
  try {
    const mod = await importer()
    const ok = { state: PRESENT, data: mod.default ?? mod }
    cache.set(iso3, ok)
    return ok
  } catch {
    // Deliberately not cached: a failure is worth retrying, and caching it
    // would make a transient blip permanent for the session.
    return { state: LOAD_FAILED, data: null }
  }
}

/** Test seam. The cache is module state, which a suite must be able to reset. */
export function _resetCache() {
  cache.clear()
}

const AGE_BANDS = [
  { key: '15_24', label: '15–24' },
  { key: '25_54', label: '25–54' },
  { key: '55_64', label: '55–64' },
]

// LTB first: it is the bottom of the scale, and reading Below basic → Basic →
// Intermediate → Tertiary left to right is the only order that is not confusing.
const EDU_BANDS = [
  { key: 'ltb', label: 'Below basic' },
  { key: 'bas', label: 'Basic' },
  { key: 'int', label: 'Intermediate' },
  { key: 'adv', label: 'Tertiary' },
]

function readBands(crosstabs, group, prefix, bands) {
  if (!crosstabs) return { state: NOT_LOADED, bands: [] }
  const v = crosstabs.values ?? {}
  const present = bands
    .map((b) => ({ ...b, value: v[`isco${group}_${prefix}_${b.key}_pct`] }))
    .filter((b) => b.value !== null && b.value !== undefined)
  if (!present.length) {
    // Read the pipeline's flag rather than assuming. "Withheld below the floor"
    // and "the source publishes nothing for this group" are different facts,
    // and only the pipeline knows which it was at the moment it decided.
    // Treating every empty education group as withheld told readers that
    // published bands described too little of a workforce whose bands are not
    // published at all — an absence the app invented, which is the boundary
    // R20 protects, pointed at the source instead of at the fetch.
    const flag = v[`isco${group}_${prefix}_flag`]
    return {
      state: flag === FLAG_WITHHELD ? WITHHELD : NOT_PUBLISHED,
      bands: [],
      // A withholding names the survey year it judged; a non-publication has
      // none to name.
      year: flag === FLAG_WITHHELD ? (v[`isco${group}_${prefix}_year`] ?? null) : null,
    }
  }
  return {
    state: PRESENT,
    bands: present,
    year: v[`isco${group}_${prefix}_year`] ?? null,
    tier: 'DERIVED',
    // The bands do not sum to 100 and the screen has to say why rather than
    // letting a reader assume they should.
    residual: Math.max(0, 100 - present.reduce((a, b) => a + b.value, 0)),
  }
}

/** R8's three age bands over a YGE15 base — the residual is the 65+ cohort. */
export function ageBands(crosstabs, group) {
  const out = readBands(crosstabs, group, 'age', AGE_BANDS)
  if (out.state === PRESENT) {
    out.residualNote =
      'The bands divide everyone aged 15 and over, so the remainder is workers aged 65+.'
  }
  return out
}

/** R9's chips over EDU_AGGREGATE_TOTAL. */
export function eduBands(crosstabs, group) {
  const out = readBands(crosstabs, group, 'edu', EDU_BANDS)
  if (out.state === PRESENT) {
    // The remainder is `EDU_AGGREGATE_X` (unspecified) — plus
    // `EDU_AGGREGATE_LTB` wherever the country does not publish that chip,
    // which is 69 of the 152 countries carrying group-4 chips. Saying the
    // remainder is only "unspecified" is false for those readers: part of it is
    // workers the source explicitly places below basic. Same move R12 makes on
    // the sparkline — state what the number rests on, not what it usually does.
    const hasLtb = out.bands.some((b) => b.key === 'ltb')
    out.residualNote = hasLtb
      ? 'The chips divide everyone in the group, so the remainder is workers whose education the source does not specify.'
      : 'The chips divide everyone in the group. This country does not publish a below-basic figure, so the remainder is workers whose education is unspecified or below basic.'
  }
  return out
}
