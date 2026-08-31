// R6. The country list, tagged by what the data actually carries.
//
// The tag reads **"any of the nine ISCO fields non-null"**. The three readings
// differ by seven countries — any = 177, all nine = 170, isco4 alone = 177 —
// so the reading is stated here rather than left to whoever writes the screen.
// `isco_groups_reported` in the payload describes the same set.
//
// A consequence follows, and R10 owns it rather than this module: step 01 runs
// before the group is known, so up to seven countries can be tagged
// `official series` here and still land on a stated absence at step 04, when
// the reader's group turns out to be one their source does not report. That is
// honest but it is a promise this screen cannot keep alone — R10 must make the
// withdrawal explicit rather than rendering a blank.
//
// Keeping the tag at step 01 rather than moving it per-group to step 02 is
// deliberate: the country list has to say something about coverage while the
// reader is choosing, and a per-group tag cannot exist before the group does.
import { GROUPS } from './isco'

export const OFFICIAL_SERIES = 'official series'
export const NO_SERIES = 'no series'

/** True when the row reports at least one of the nine major groups. */
export function hasAnyIscoGroup(row) {
  if (!row) return false
  return GROUPS.some((g) => row[g.key] !== null && row[g.key] !== undefined)
}

export function countryTag(row) {
  return hasAnyIscoGroup(row) ? OFFICIAL_SERIES : NO_SERIES
}

/**
 * The step 01 list. Every country appears — a country is never hidden for
 * lacking data, because "we have nothing for you" is a result the reader is
 * entitled to and a silently missing row is not.
 */
export function countryOptions(rows) {
  return rows
    .filter((r) => r.row_type === 'country')
    .map((r) => ({
      iso3: r.iso3,
      name: r.country_name,
      tag: countryTag(r),
      hasSeries: hasAnyIscoGroup(r),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Pre-fill from the browser's locale, and only when it resolves to a country
 * the payload actually carries. Returns null rather than a guess.
 */
export function localeCountry(rows, locale) {
  const region = String(locale ?? '').split(/[-_]/)[1]
  if (!region || region.length !== 2) return null
  let codes
  try {
    codes = new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    return null
  }
  const name = codes.of(region.toUpperCase())
  if (!name) return null
  const hit = rows.find(
    (r) => r.row_type === 'country' && r.country_name?.toLowerCase() === name.toLowerCase(),
  )
  return hit ? hit.iso3 : null
}
