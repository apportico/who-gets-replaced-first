// R1, R5, R10 (spec 0011) — the step 01 country list, and what is not in it.
//
// Renamed from `countryTag.js` by R10: it no longer tags anything. Every row it
// returns carries a series, so the per-row `official series` / `no series` tag
// said the same thing 177 times and went with the list it described.
//
// The list is the countries that carry an official series, read as **"any of
// the nine ISCO fields non-null"** — 177 of 218, the same set
// `isco_groups_reported` describes. The three readings differ by seven
// countries (any = 177, all nine = 170, `isco4` alone = 177), so the reading is
// stated here rather than left to whoever writes the screen.
//
// **This is a reversal, and a deliberate one.** Spec 0010 R6 listed all 218 and
// tagged each row `official series` / `no series`, on the reasoning that "we
// have nothing for you" is a result the reader is entitled to. It is — but 41
// unpickable rows in a 218-row scroll is a poor place to say it. Spec 0011
// moves the statement rather than dropping it: `excludedCountries` keeps the 41
// available so a *search* can answer for them by name (R6), and `localeCountry`
// names the reader's own country when it is one of them (R5). The obligation in
// CLAUDE.md — "`no series` is a first-class result: nulls stay null, the row
// says so" — is discharged by those two, not by a row nobody scrolls to.
//
// A consequence survives from 0010 and is still owned by 0010 R10: step 01 runs
// before the group is known, so up to seven countries appear here and still
// land on a stated absence at step 04, when the reader's group turns out to be
// one their source does not report. That is honest, but it is a promise this
// screen cannot keep alone — R10 must make the withdrawal explicit rather than
// rendering a blank.
import { GROUPS } from './isco'

/**
 * True when the row reports at least one of the nine major groups.
 *
 * Exported although only the suite imports it: this is the "any of the nine"
 * reading 0010 R6 fixed and 0011 R1 inherits, and the test asserts it against
 * the committed payload rather than against a row it builds. That is a real
 * consumer with a reason, unlike an export kept because it might be wanted.
 */
export function hasAnyIscoGroup(row) {
  if (!row) return false
  return GROUPS.some((g) => row[g.key] !== null && row[g.key] !== undefined)
}

function shape(r) {
  return { iso3: r.iso3, iso2: r.iso2 ?? null, name: r.country_name }
}

const countryRows = (rows) => rows.filter((r) => r.row_type === 'country')
const byName = (a, b) => a.name.localeCompare(b.name)

/**
 * The step 01 list: only the countries that carry a series, alphabetical.
 * A country with no series is not here — see `excludedCountries`.
 */
export function countryOptions(rows) {
  return countryRows(rows).filter(hasAnyIscoGroup).map(shape).sort(byName)
}

/**
 * The 41 that `countryOptions` leaves out. Not rendered as options — R6 uses
 * them to answer a search by name instead of with silence, which is the whole
 * reason they are exported rather than filtered away and forgotten.
 */
export function excludedCountries(rows) {
  return countryRows(rows).filter((r) => !hasAnyIscoGroup(r)).map(shape).sort(byName)
}

/**
 * Pre-fill from the browser's locale. Returns `{ iso3, excluded }`:
 *
 *   - `iso3` — the country to select, or null. Never a guess.
 *   - `excluded` — the country the locale *did* resolve to, when that country
 *     has no series and so cannot be selected. The screen names it, so a reader
 *     in China or Saudi Arabia learns why their country is absent before they
 *     go looking for it (R5).
 *
 * The match is on `iso2`, which spec 0011 R2 carries into the payload from the
 * World Bank. The previous reading compared `Intl.DisplayNames`' name to
 * `country_name`, which silently failed for the 29 countries where the two
 * spellings differ — `ko-KR` resolves to "South Korea" and the payload says
 * "Korea, Rep." — so every one of those locales pre-filled nothing. Matching on
 * the identifier rather than on prose fixes that as a side effect of having it.
 */
export function localeCountry(rows, locale) {
  const none = { iso3: null, excluded: null }
  // `Intl.Locale`, not `split('-')[1]`. Subtag 1 is the *script* on a tag that
  // carries one — `zh-Hans-CN` yields `Hans`, `sr-Latn-RS` yields `Latn` — so
  // the split reading dropped the region for every script-bearing locale and
  // returned neither a pre-fill nor a stated absence. `zh-Hans-CN` is the
  // flagship R5 case, and it was one of the tags it silently missed.
  let region = null
  try {
    region = new Intl.Locale(String(locale)).region ?? null
  } catch {
    return none
  }
  if (!region) return none
  const code = region.toUpperCase()
  const hit = countryRows(rows).find((r) => r.iso2 === code)
  if (!hit) return none
  if (!hasAnyIscoGroup(hit)) return { iso3: null, excluded: shape(hit) }
  return { iso3: hit.iso3, excluded: null }
}
