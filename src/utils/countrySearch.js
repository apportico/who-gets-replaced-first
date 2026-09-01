// R3, R4, R6 (spec 0011) — the step 01 search.
//
// Choosing one country out of 177 is a search, not a scan, and the payload
// spells countries the way the World Bank does — `Korea, Rep.`, `Russian
// Federation`, `Viet Nam`, `Lao PDR`, `Venezuela, RB`. Nobody types that.
//
// The obvious fix is a hand-written alias table. Most of it turned out to be
// unnecessary: `iso2` (R2, from the World Bank's own `iso2Code`) lets
// `Intl.DisplayNames` — a platform standard, not data we authored — supply the
// reader's spelling for 29 of the 177, including `South Korea`, `Russia`,
// `Vietnam`, `Laos`, `Slovakia`, `Kyrgyzstan`, `Iran`, `Egypt` and
// `Cape Verde`. What ALIASES carries is only the residue no source publishes.
import { countryOptions, excludedCountries } from './countryList'

/**
 * Fold a string to what a reader would type: strip diacritics, **drop
 * apostrophes**, collapse every other punctuation mark to a space, squeeze
 * runs of whitespace, lowercase.
 *
 * Required, not cosmetic, and the apostrophe rule is the part that was wrong
 * first time. An earlier version normalised `’` to `'` instead of removing it,
 * which left `Côte d’Ivoire` folding to `cote d'ivoire` — so a reader typing
 * `cote divoire`, which is what anyone does on a phone keyboard, matched
 * nothing. Removing it folds both sides to `cote divoire`.
 *
 * Collapsing the rest of the punctuation buys the World Bank spellings the same
 * forgiveness: `Korea, Rep.` → `korea rep`, `Lao PDR` → `lao pdr`,
 * `Congo - Kinshasa` → `congo kinshasa`.
 */
export function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/['’ʼ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

// One instance, not one per keystroke. Guarded because a runtime without the
// region dataset throws on construction rather than returning null.
const REGION_NAMES = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    return null
  }
})()

/**
 * The reader-facing name for an alpha-2, or null. `TWN` lands here as null —
 * the World Bank publishes no alpha-2 for Taiwan, so it has no `iso2` to look
 * up (R2 leaves that null rather than transcribing ISO 3166-1), and Taiwan
 * stays findable by name and by `iso3`.
 */
export function intlName(iso2) {
  if (!iso2 || !REGION_NAMES) return null
  let name = null
  try {
    name = REGION_NAMES.of(iso2)
  } catch {
    return null
  }
  // `of` echoes the input back for a code it does not know.
  return !name || name === iso2 ? null : name
}

/**
 * R4. Ours, and small. Every entry is a short form that **no other route
 * reaches** — the test enforces exactly that, so this cannot quietly grow into
 * work the payload or `Intl` already does.
 *
 * Two absences are load-bearing. `usa`/`us` are not here: the `iso3` route
 * matches by prefix and reaches `USA` already. `burma` is not here: `Intl`
 * returns `Myanmar (Burma)`, which the substring route already matches.
 */
export const ALIASES = {
  uk: 'GBR',
  uae: 'ARE',
  turkey: 'TUR',
  'czech republic': 'CZE',
  swaziland: 'SWZ',
  'ivory coast': 'CIV',
  'east timor': 'TLS',
  holland: 'NLD',
}

function matchesName(option, q) {
  return fold(option.name).includes(q)
}

function matchesCode(option, q) {
  return fold(option.iso3).startsWith(q)
}

function matchesIntl(option, q) {
  const name = intlName(option.iso2)
  return name !== null && fold(name).includes(q)
}

// Prefix, not substring — the same shape route 2 uses for `iso3`. Substring
// matching made aliases fire on fragments that were never meant to reach them:
// `land` pulled Eswatini out of `swaziland` and the Netherlands out of
// `holland`, and `or` pulled Cote d'Ivoire out of `ivory coast` and Timor-Leste
// out of `east timor`, none of which any other route returns. No intended alias
// is lost: `uk`, `turk`, `czech` and the rest all still prefix their key.
function matchesAlias(option, q) {
  return Object.entries(ALIASES).some(([key, iso3]) => iso3 === option.iso3 && key.startsWith(q))
}

// Not exported: nothing outside this module consumes it, and an export whose
// only claim on existence is that it looks useful is what 0010 R3 recorded and
// R10 deleted the tag functions for. The tests reach the routes through
// `matches` and `searchCountries`, which is what the screen uses too.
const ROUTES = [matchesName, matchesCode, matchesIntl, matchesAlias]

export function matches(option, query) {
  const q = fold(query)
  if (!q) return true
  return ROUTES.some((route) => route(option, q))
}

// R2 (spec 0013). How much of a result set reaches the screen.
//
// Both numbers are bounded by measurement rather than taste, from opposite
// sides. 12: at 390x844 the listbox starts 356px down and a row costs 70px, so
// 17 rows is the most that keeps the page under two viewport heights — and
// every three-character prefix already returns 7 matches or fewer, so the cap
// is unreachable from three characters on. It can only bite at one or two,
// where the reader has not yet said enough to be shown a list.
//
// 3: the first draft of 0013 R2 exempted the absences, reasoning there are only
// ever a few. Probed, that is false — `a` matches 39 of the 41, which is ~2,300px
// of note text on its own. 99% of three-character queries and 100% of
// four-character ones return three or fewer, and every full country name returns
// exactly one, so a reader who typed a name never loses the named statement.
export const MATCH_LIMIT = 12
export const ABSENT_LIMIT = 3

/**
 * R3 + R6 (0011), R2 (0013). Partition a query into what the reader can pick
 * and what we have to explain, and cap both.
 *
 *   - `matches` — options from R1's 177, **in `countryOptions`' own
 *     alphabetical order**. There is no relevance ranking: a match is a match,
 *     and a reader scanning a narrowed list should find it where the alphabet
 *     puts it rather than where a scoring function does. The cap takes the
 *     first `limit` of that order, so it narrows the list without reordering it.
 *   - `absent` — countries the query matched that carry no series. Not options.
 *     The screen renders them as a statement, so typing `china` says why China
 *     is not there instead of returning an empty box that reads as broken.
 *
 * `matchCount` and `absentCount` are the sizes **before** truncation. They are
 * returned rather than left to the caller to recompute, because the live region
 * announces one and the list renders the other, and two independent counts is
 * how those drift apart.
 *
 * An empty query returns all 177 and nothing absent. That is a statement about
 * the *predicate* — everything matches an empty query — and 0011 R3 is right
 * about it. What the *screen* renders at rest is a different question, answered
 * by `renderedCountries` below rather than by conflating the two here.
 */
export function searchCountries(rows, query, { limit = MATCH_LIMIT, absentLimit = ABSENT_LIMIT } = {}) {
  const q = fold(query)
  const options = countryOptions(rows)
  if (!q) {
    return {
      matches: options,
      absent: [],
      matchCount: options.length,
      absentCount: 0,
      truncated: false,
      absentTruncated: false,
    }
  }
  const hits = options.filter((o) => matches(o, q))
  const missing = excludedCountries(rows).filter((o) => matches(o, q))
  return {
    matches: hits.slice(0, limit),
    absent: missing.slice(0, absentLimit),
    matchCount: hits.length,
    absentCount: missing.length,
    truncated: hits.length > limit,
    absentTruncated: missing.length > absentLimit,
  }
}

/**
 * R1 (spec 0013). What step 01 *renders*, as opposed to what matches.
 *
 * These were the same function until 0013, and that is precisely how a screen
 * described as "a folded search" shipped rendering all 177 rows: the predicate
 * says everything matches an empty query, the screen rendered the predicate's
 * answer, and 0011's own acceptance criteria asserted the result.
 *
 * At rest the answer is **the selected country and nothing else** — which on
 * arrival is the locale pre-fill, since that is what seeds the selection. Keyed
 * to the selection rather than to the locale, because `Escape` returns here: a
 * reader in the UK who picks France and presses `Escape` would otherwise see
 * United Kingdom rendered while France drove `Continue`.
 */
export function renderedCountries(rows, query, selectedIso3, opts) {
  if (fold(query)) return { ...searchCountries(rows, query, opts), resting: false }
  const selected = countryOptions(rows).filter((o) => o.iso3 === selectedIso3)
  return {
    matches: selected,
    absent: [],
    matchCount: selected.length,
    absentCount: 0,
    truncated: false,
    absentTruncated: false,
    resting: true,
  }
}
