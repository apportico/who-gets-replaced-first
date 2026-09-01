// Spec 0010 R19 — the suite the acceptance criteria of R6, R7, R10, R11, R12,
// R15, R16 and R18 name.
//
// These run against the COMMITTED payload, not a fixture built here. A suite
// that constructs its own input proves the function is self-consistent; this
// one fails when the payload and the code disagree, which is the failure worth
// catching. Synthetic rows appear only where the payload cannot exercise a
// branch — R11's null-`employed_total` case is 0 of 177 in real data, so
// asserting it against the payload would mark it passing without ever running.
import { describe, it, expect } from 'vitest'

import payload from '../data/global_labor.json'
import gbrCross from '../data/crosstabs/GBR.json'
import canCross from '../data/crosstabs/CAN.json'
// The countries R9 names, asserted against the committed artefacts rather than
// against rows this file builds for itself.
import cmrCross from '../data/crosstabs/CMR.json'
import djiCross from '../data/crosstabs/DJI.json'
import ethCross from '../data/crosstabs/ETH.json'

// Every artefact, for the cross-country invariants.
const CROSS_MODULES = import.meta.glob('../data/crosstabs/*.json', { eager: true })
const ALL_CROSS = Object.entries(CROSS_MODULES).map(([path, mod]) => ({
  iso3: path.slice(-8, -5),
  v: (mod.default ?? mod).values,
}))

import { resolveTitle } from './resolveTitle'
import { GROUPS, groupDisplay } from './isco'
import { countryOptions, excludedCountries, hasAnyIscoGroup, localeCountry } from './countryList'
import {
  ALIASES, fold, intlName, matches, searchCountries,
} from './countrySearch'
import { groupShare, groupHeadcount } from './groupFigures'
import { trendFor, CLERICAL_GROUP } from './trend'
import { classificationNotice, isIsco88 } from './classification'
import { termsFor, BACKTEST_NOTE } from './terms'
import {
  NOT_PUBLISHED, PRESENT, WITHHELD, LOAD_FAILED, NOT_LOADED,
  FLAG_PRESENT, FLAG_WITHHELD, FLAG_NOT_PUBLISHED,
  isSourceAbsence, isLoadProblem, absenceMessage,
} from './absence'
import { ageBands, eduBands } from './crossTabs'

const rows = payload.rows
const countries = rows.filter((r) => r.row_type === 'country')
const byIso = Object.fromEntries(rows.map((r) => [r.iso3, r]))
const GBR = byIso.GBR
const CAN = byIso.CAN

// ---------------------------------------------------------------- R7
describe('R7 — a job title resolves to an ISCO-08 major group, visibly', () => {
  it('resolves the acceptance criterion’s own examples', () => {
    expect(resolveTitle('paralegal')).toBe(3)
    expect(resolveTitle('bookkeeper')).toBe(4)
  })

  it('returns null for a title it does not know, rather than defaulting', () => {
    // The defect this guards: an earlier draft fell back to group 4, which
    // tells someone who typed anything unfamiliar a confident story about
    // clerical workers. Guessing the group is guessing.
    expect(resolveTitle('zzzz')).toBeNull()
    expect(resolveTitle('')).toBeNull()
    expect(resolveTitle(null)).toBeNull()
  })

  it('shows the resolution with its code and full label', () => {
    expect(groupDisplay(3)).toBe('3 · Technicians and associate professionals')
    expect(groupDisplay(4)).toBe('4 · Clerical support workers')
  })

  it('puts the specific keyword above the general one', () => {
    // "paralegal" must reach 3 before anything else claims it, and "data entry"
    // must reach 4 before "data" could pull it toward 2.
    expect(resolveTitle('senior paralegal')).toBe(3)
    expect(resolveTitle('data entry assistant')).toBe(4)
  })
})

// ------------------------------------------- 0011 R1 — the list narrows
//
// Spec 0010 R6's "hides no country for lacking data" assertion is deliberately
// gone: 0011 R1 reverses it, and R7 re-marks 0010 R6 `[~]` rather than leaving
// the two specs disagreeing. What replaces it is the pair below — the list is
// the 177, and the 41 are still reachable as data so R6 can answer for them.
describe('0011 R1 — step 01 lists only the countries that carry a series', () => {
  it('reads "any of the nine", which is 177 of 218 countries', () => {
    expect(countries.length).toBe(218)
    expect(countryOptions(rows).length).toBe(177)
  })

  it('every listed country really does report a group', () => {
    const byIso3 = Object.fromEntries(countries.map((r) => [r.iso3, r]))
    for (const o of countryOptions(rows)) {
      expect(hasAnyIscoGroup(byIso3[o.iso3])).toBe(true)
    }
  })

  it('leaves out the countries a reader would most expect to find', () => {
    const listed = new Set(countryOptions(rows).map((c) => c.iso3))
    for (const iso3 of ['CHN', 'SAU', 'NZL']) expect(listed.has(iso3)).toBe(false)
  })

  it('keeps the 41 available to the module, excluded from the list not the data', () => {
    expect(excludedCountries(rows).length).toBe(41)
    expect(excludedCountries(rows).map((c) => c.iso3)).toContain('CHN')
  })

  it('the three readings really do differ, which is why one is stated', () => {
    const all9 = countries.filter((r) => GROUPS.every((g) => r[g.key] !== null)).length
    const any9 = countries.filter(hasAnyIscoGroup).length
    expect(any9).toBe(177)
    expect(all9).toBe(170)
  })
})

// ------------------------------------------- 0011 R2 — the identifier
describe('0011 R2 — the payload carries iso2, and TWN stays null', () => {
  it('carries a non-null iso2 for 176 of the 177 listed countries', () => {
    const withIso2 = countryOptions(rows).filter((c) => c.iso2)
    expect(withIso2.length).toBe(176)
  })

  it('leaves Taiwan null rather than transcribing ISO 3166-1', () => {
    const twn = countryOptions(rows).find((c) => c.iso3 === 'TWN')
    expect(twn).toBeDefined()
    expect(twn.iso2).toBeNull()
  })

  it('tiers it as an identifier, not a measurement', () => {
    expect(payload.field_tiers.iso2).toBe('NOT_A_MEASUREMENT')
  })
})

// ------------------------------------------- 0011 R3 — the search predicate
describe('0011 R3 — the query folds, and four routes can match it', () => {
  const hit = (q) => searchCountries(rows, q).matches.map((c) => c.iso3)

  it('folds diacritics and the typographic apostrophe', () => {
    expect(fold('Côte d’Ivoire')).toBe("cote d'ivoire")
    expect(fold('Türkiye')).toBe('turkiye')
    expect(fold('  São Tomé ')).toBe('sao tome')
  })

  it('route 1 — the payload name, as a substring', () => {
    expect(hit('korea')).toContain('KOR')
  })

  it('route 2 — the iso3, as a prefix', () => {
    expect(hit('usa')).toContain('USA')
    expect(hit('gbr')).toContain('GBR')
  })

  it('route 3 — the Intl name, which is the one a reader types', () => {
    expect(hit('south korea')).toContain('KOR')
    expect(hit('vietnam')).toContain('VNM')
    expect(hit('russia')).toContain('RUS')
  })

  it('route 3 needs the fold, or the diacritics miss', () => {
    expect(hit('cote divoire').length + hit("cote d'ivoire").length).toBeGreaterThan(0)
    expect(hit("cote d'ivoire")).toContain('CIV')
  })

  it('route 4 — the alias table, for what no source publishes', () => {
    expect(hit('turkey')).toContain('TUR')
    expect(hit('uk')).toContain('GBR')
  })

  it('an empty query is the whole list, and a nonsense one is empty', () => {
    expect(hit('').length).toBe(177)
    expect(hit('zzzz').length).toBe(0)
  })

  it('returns matches in the list order, with no relevance ranking', () => {
    const order = countryOptions(rows).map((c) => c.iso3)
    const got = hit('land')
    expect(got.length).toBeGreaterThan(1)
    expect(got).toEqual(order.filter((iso3) => got.includes(iso3)))
  })
})

// ------------------------------------------- 0011 R4 — the alias table
describe('0011 R4 — the residual aliases are ours, small, and earn their place', () => {
  const listed = countryOptions(rows)
  const byIso3 = Object.fromEntries(listed.map((c) => [c.iso3, c]))

  it('is small enough to read', () => {
    expect(Object.keys(ALIASES).length).toBeLessThanOrEqual(12)
  })

  it('never points at a country the list does not carry', () => {
    for (const iso3 of Object.values(ALIASES)) expect(byIso3[iso3]).toBeDefined()
  })

  // The guard that stops the table growing into work already done: run each key
  // through the other three routes and fail if one of them already reached the
  // target. `usa`, `us` and `burma` fail this by construction, which is why
  // they are not entries.
  it('every key is one the name, iso3 and Intl routes all miss', () => {
    for (const [key, iso3] of Object.entries(ALIASES)) {
      const option = byIso3[iso3]
      const q = fold(key)
      expect(fold(option.name).includes(q)).toBe(false)
      expect(fold(option.iso3).startsWith(q)).toBe(false)
      const intl = intlName(option.iso2)
      expect(intl === null || !fold(intl).includes(q)).toBe(true)
    }
  })

  it('and the excluded short forms really are already covered', () => {
    const usa = byIso3.USA
    const mmr = byIso3.MMR
    expect(matches(usa, 'usa')).toBe(true)
    expect(matches(usa, 'us')).toBe(true)
    expect(matches(mmr, 'burma')).toBe(true)
    for (const k of ['usa', 'us', 'burma']) expect(ALIASES[k]).toBeUndefined()
  })
})

// ------------------------------------------- 0011 R5 — the locale pre-fill
describe('0011 R5 — pre-fill names the country it cannot select', () => {
  it('selects a country that has a series', () => {
    expect(localeCountry(rows, 'en-GB').iso3).toBe('GBR')
    expect(localeCountry(rows, 'en-GB').excluded).toBeNull()
  })

  it('resolves the 29 whose Intl spelling differs from the payload name', () => {
    // The previous reading compared Intl's name to `country_name` and silently
    // failed for every one of these.
    expect(localeCountry(rows, 'ko-KR').iso3).toBe('KOR')
    expect(localeCountry(rows, 'ru-RU').iso3).toBe('RUS')
    expect(localeCountry(rows, 'vi-VN').iso3).toBe('VNM')
  })

  it('selects nothing for a country with no series, and names it', () => {
    const cn = localeCountry(rows, 'zh-CN')
    expect(cn.iso3).toBeNull()
    expect(cn.excluded).toMatchObject({ iso3: 'CHN', name: 'China' })
    for (const locale of ['en-NZ', 'ar-SA']) {
      expect(localeCountry(rows, locale).iso3).toBeNull()
      expect(localeCountry(rows, locale).excluded).not.toBeNull()
    }
  })

  it('still returns nothing rather than a guess', () => {
    for (const locale of ['xx', undefined, '', 'en']) {
      expect(localeCountry(rows, locale)).toEqual({ iso3: null, excluded: null })
    }
  })
})

// ------------------------------------------- 0011 R6 — the stated absence
describe('0011 R6 — a query that matches a dropped country names it', () => {
  const part = (q) => {
    const { matches: m, absent } = searchCountries(rows, q)
    return { pickable: m.map((c) => c.iso3), absent: absent.map((c) => c.iso3) }
  }

  it('china returns the three that have a series, and states the one that does not', () => {
    const { pickable, absent } = part('china')
    expect(pickable).toEqual(['HKG', 'MAC', 'TWN'])
    expect(absent).toEqual(['CHN'])
  })

  it('a query only a dropped country matches returns nothing pickable', () => {
    expect(part('saudi')).toEqual({ pickable: [], absent: ['SAU'] })
    expect(part('new zea')).toEqual({ pickable: [], absent: ['NZL'] })
  })

  it('a query matching nothing names no country', () => {
    expect(part('zzzz')).toEqual({ pickable: [], absent: [] })
  })

  it('an empty query states no absence — the list is not an accusation', () => {
    expect(searchCountries(rows, '').absent).toEqual([])
  })
})

// ---------------------------------------------------------------- R10
describe('R10 — the group’s share, with tier and vintage', () => {
  it('GBR × clerical gives 8.9%, DERIVED, 2025', () => {
    const s = groupShare(GBR, 4)
    expect(s.state).toBe(PRESENT)
    expect(s.display).toBe('8.9%')
    expect(s.tier).toBe('DERIVED')
    expect(s.year).toBe(2025)
  })

  it('a null group yields the stated-absence branch, not a zero or a dash', () => {
    const row = { ...GBR, isco7_craft_pct: null }
    const s = groupShare(row, 7)
    expect(s.state).toBe(NOT_PUBLISHED)
    expect(s.value).toBeNull()
    expect(s.message).toContain('does not publish')
    expect(s.message).toContain('craft')
  })

  it('owns R6’s withdrawal: listed at step 01, still absent for this group', () => {
    // The seven-country gap R6 documents. A country can be *listed* at step 01
    // and still not report the reader's group — this is where that promise is
    // withdrawn in words. 0011 R10 removed the row tag but not this: being in
    // the list is now the claim that gets withdrawn here.
    const partial = countries.find(
      (r) => hasAnyIscoGroup(r) && GROUPS.some((g) => r[g.key] === null),
    )
    expect(partial).toBeDefined()
    const missing = GROUPS.find((g) => partial[g.key] === null)
    expect(countryOptions(rows).map((c) => c.iso3)).toContain(partial.iso3)
    expect(groupShare(partial, missing.n).state).toBe(NOT_PUBLISHED)
  })
})

// ---------------------------------------------------------------- R11
describe('R11 — headcount is derived per group, or it is absent', () => {
  it('GBR × clerical gives 2.99M', () => {
    const h = groupHeadcount(GBR, 4)
    expect(h.display).toBe('2.99M')
    expect(h.tier).toBe('DERIVED')
  })

  it('reproduces the payload’s own clerical_employed for every country', () => {
    // 177 of 177 exact. This is what makes the derivation a reuse of the
    // pipeline's canonical base rather than a near-duplicate of it.
    const mismatches = countries
      .filter((r) => r.clerical_employed !== null && r.isco4_clerical_pct !== null)
      .filter((r) => groupHeadcount(r, 4).value !== r.clerical_employed)
    expect(mismatches).toEqual([])
  })

  it('derives a figure for a group that has no headcount column', () => {
    const h = groupHeadcount(GBR, 7)
    expect(h.state).toBe(PRESENT)
    expect(h.tier).toBe('DERIVED')
  })

  it('labels the arithmetic as a two-source join, naming both', () => {
    const h = groupHeadcount(GBR, 4)
    expect(h.sources).toHaveLength(2)
    expect(h.sources.join(' ')).toMatch(/ILOSTAT/)
    expect(h.sources.join(' ')).toMatch(/World Bank/)
  })

  it('renders no headcount when employed_total is null — a synthetic row', () => {
    // 0 of 177 countries have a null employed_total, so this branch cannot be
    // exercised against real data. Asserting it against the payload would let
    // the criterion be marked done without the branch ever having run, which is
    // the failure mode the repo's [x] discipline exists to prevent.
    const synthetic = { ...GBR, employed_total: null }
    const h = groupHeadcount(synthetic, 4)
    expect(h.state).toBe(NOT_PUBLISHED)
    expect(h.value).toBeNull()
  })
})

// ---------------------------------------------------------------- R12
describe('R12 — the trend says it is a stand-in whenever it is one', () => {
  it('group 4 shows its own series with no stand-in notice', () => {
    const t = trendFor('GBR', CLERICAL_GROUP)
    expect(t.show).toBe(true)
    expect(t.standIn).toBe(false)
    expect(t.notice).toBeNull()
    expect(t.points.length).toBeGreaterThan(5)
  })

  it('group 7 is either labelled a stand-in or not shown — never bare', () => {
    const t = trendFor('GBR', 7)
    expect(t.show && t.standIn).toBe(true)
    expect(t.notice).toMatch(/stand-in/)
  })

  it('a country absent from the series shows no sparkline', () => {
    const t = trendFor('ZZZ', 4)
    expect(t.show).toBe(false)
    expect(t.points).toEqual([])
  })

  it('carries the generative-AI marker year', () => {
    expect(trendFor('GBR', 4).genaiYear).toBe(2022)
  })
})

// ---------------------------------------------------------------- R18
describe('R18 — ten countries publish ISCO-88, and the screen says so', () => {
  const ISCO88 = ['BMU', 'CAN', 'MAC', 'NAM', 'NIC', 'TTO', 'TWN', 'UKR', 'YEM', 'ZAF']

  it('is exactly those ten, and 167 on ISCO-08', () => {
    const eightyEight = countries.filter(isIsco88).map((r) => r.iso3).sort()
    expect(eightyEight).toEqual([...ISCO88].sort())
    expect(countries.filter((r) => r.isco_classification === 'ISCO-08').length).toBe(167)
  })

  it('CAN × group 2 carries the notice; GBR × group 2 does not', () => {
    const can = classificationNotice(CAN, 2)
    expect(can).not.toBeNull()
    expect(can.classification).toBe('ISCO-88')
    expect(classificationNotice(GBR, 2)).toBeNull()
  })

  it('names the 2/3 boundary, which is where the README says it degrades', () => {
    expect(classificationNotice(CAN, 2).boundary).toBe(true)
    expect(classificationNotice(CAN, 3).boundary).toBe(true)
    expect(classificationNotice(CAN, 9).boundary).toBe(false)
    expect(classificationNotice(CAN, 2).text).toMatch(/groups 2 and 3/)
  })

  it('is present for all ten and absent for the other 167', () => {
    const withNotice = countries.filter((r) => classificationNotice(r, 4) !== null)
    expect(withNotice.map((r) => r.iso3).sort()).toEqual([...ISCO88].sort())
  })
})

// ---------------------------------------------------------------- R15
describe('R15 — nothing is imputed, anywhere', () => {
  it('separates a source absence from a load problem', () => {
    // The distinction R20 exists to protect: a 404 must never render as
    // "ILOSTAT does not publish this".
    expect(isSourceAbsence(NOT_PUBLISHED)).toBe(true)
    expect(isSourceAbsence(WITHHELD)).toBe(true)
    expect(isSourceAbsence(LOAD_FAILED)).toBe(false)
    expect(isLoadProblem(LOAD_FAILED)).toBe(true)
    expect(isLoadProblem(NOT_LOADED)).toBe(true)
  })

  it('says a failed load is our problem, not a gap in the data', () => {
    expect(absenceMessage(LOAD_FAILED)).toMatch(/not a gap in the data/)
    expect(absenceMessage(NOT_PUBLISHED, { country: 'X', group: 'y' })).toMatch(/does not publish/)
  })

  it('a row with every group null yields absences and zero numbers', () => {
    const empty = countries.find((r) => !hasAnyIscoGroup(r))
    for (const g of GROUPS) {
      const s = groupShare(empty, g.n)
      expect(s.state).toBe(NOT_PUBLISHED)
      expect(s.value).toBeNull()
    }
  })

  it('never borrows from another group, a region row or the world row', () => {
    // A synthetic row with one hole. The world row carries a value for group 7;
    // if any fallback existed, this would return it.
    const world = rows.find((r) => r.row_type === 'world')
    expect(world.isco7_craft_pct).not.toBeNull()
    const holed = { ...GBR, isco7_craft_pct: null }
    expect(groupShare(holed, 7).value).toBeNull()
  })

  it('surfaces a data_quality_flag other than complete', () => {
    const flagged = countries.find(
      (r) => r.data_quality_flag && r.data_quality_flag !== 'complete',
    )
    expect(flagged).toBeDefined()
    expect(groupShare(flagged, 4).state).toBeDefined()
    expect(flagged.data_quality_flag).not.toBe('complete')
  })
})

// ---------------------------------------------------------------- R16
describe('R16 — the method panel tells the truth about the model', () => {
  it('its terms match the figures actually rendered', () => {
    const terms = termsFor(GBR, 4, gbrCross)
    const share = groupShare(GBR, 4)
    const head = groupHeadcount(GBR, 4)
    const byName = Object.fromEntries(terms.map((t) => [t.name, t]))
    expect(byName['Share of employment'].sourced).toBe(share.state === PRESENT)
    expect(byName['People doing it'].sourced).toBe(head.state === PRESENT)
    expect(byName['Trend since 2013'].sourced).toBe(trendFor('GBR', 4).show)
  })

  it('shows Duration as unsourced with its reason, never as a number', () => {
    const duration = termsFor(GBR, 4, gbrCross).find((t) => t.name.startsWith('Duration'))
    expect(duration.sourced).toBe(false)
    expect(duration.tier).toBeNull()
    expect(duration.desc).toMatch(/Not sourced/)
    expect(duration.desc).toMatch(/R13/)
  })

  it('every sourced term carries a tier, and every unsourced one does not', () => {
    for (const row of [GBR, CAN]) {
      for (const t of termsFor(row, 4, gbrCross)) {
        if (t.sourced) expect(t.tier).toBeTruthy()
        else expect(t.tier).toBeNull()
      }
    }
  })

  it('claims no back-test, and states the nine-group floor', () => {
    expect(BACKTEST_NOTE).toMatch(/nine major groups/)
    expect(BACKTEST_NOTE).toMatch(/No back-test is claimed/)
  })
})

// ------------------------------------------------- R8 / R9, read from the app
describe('R8 / R9 — the cross-tabs as the screen reads them', () => {
  it('GBR carries three age bands and their own reconciled year', () => {
    const a = ageBands(gbrCross, 4)
    expect(a.state).toBe(PRESENT)
    expect(a.bands).toHaveLength(3)
    expect(a.year).toBe(2025)
    expect(a.tier).toBe('DERIVED')
  })

  it('the age bands sum to under 100, and the screen says why', () => {
    // The YGE15 denominator contains 65+, so the three bands cannot sum to 100.
    // Asserting ~100 here would be asserting a bug.
    const a = ageBands(gbrCross, 4)
    expect(a.bands.reduce((s, b) => s + b.value, 0)).toBeLessThan(100)
    expect(a.residualNote).toMatch(/65\+/)
  })

  it('GBR carries education chips over EDU_AGGREGATE_TOTAL', () => {
    const e = eduBands(gbrCross, 4)
    expect(e.state).toBe(PRESENT)
    expect(e.year).toBe(2025)
    // Strictly under 100: the unspecified cell sits outside the chips.
    expect(e.bands.reduce((s, b) => s + b.value, 0)).toBeLessThan(100)
    expect(e.residualNote).toMatch(/does not specify/)
  })

  // R9 names four education cases, and it names two countries because they are
  // the pair that separates a floor measured on four chips from one measured on
  // three. A hand-built `{ values: { isco4_edu_bas_pct: null } }` cannot tell
  // those apart and passes whatever the loader does — which is exactly what
  // happened: it stayed green while the loader was walking back to a 2014
  // survey for CMR instead of withholding.
  it('CMR yields the withheld branch rather than four chips', () => {
    const e = eduBands(cmrCross, 4)
    expect(e.state).toBe(WITHHELD)
    expect(e.bands).toEqual([])
    // The year survives the withholding: it names the survey that was judged,
    // which is what makes the withholding checkable rather than a bare null.
    expect(e.year).toBe(2021)
  })

  it('DJI does not withhold — three bands at 39.9%, four chips at 99.6%', () => {
    const e = eduBands(djiCross, 4)
    expect(e.state).toBe(PRESENT)
    const three = e.bands.filter((b) => b.key !== 'ltb')
      .reduce((s, b) => s + b.value, 0)
    const four = e.bands.reduce((s, b) => s + b.value, 0)
    expect(three).toBeLessThan(45)      // would fail a three-band floor
    expect(four).toBeGreaterThan(99)    // passes the four-chip floor R9 states
  })

  it('ETH’s chips sum strictly below 100', () => {
    const four = eduBands(ethCross, 4).bands.reduce((s, b) => s + b.value, 0)
    expect(four).toBeLessThan(100)
    expect(four).toBeGreaterThan(90)    // and still clears the floor
  })

  it('a group the source says nothing about is NOT reported as withheld', () => {
    // The two absences are different facts and the flag is what separates them.
    // Reporting a non-publication as "withheld" tells a reader that published
    // bands describe too little of a workforce whose bands are not published.
    const nothing = { values: { isco4_edu_flag: FLAG_NOT_PUBLISHED } }
    expect(eduBands(nothing, 4).state).toBe(NOT_PUBLISHED)
    expect(eduBands(nothing, 4).year).toBeNull()
  })

  it('the residual note tells the truth about LTB', () => {
    // 69 of the 152 countries with group-4 chips publish no LTB, and for them
    // the remainder is unspecified *or below basic*.
    const withLtb = eduBands(gbrCross, 4)
    expect(withLtb.bands.some((b) => b.key === 'ltb')).toBe(true)
    expect(withLtb.residualNote).not.toMatch(/below basic/)

    const noLtb = { values: {
      isco4_edu_bas_pct: 30, isco4_edu_int_pct: 40, isco4_edu_adv_pct: 25,
      isco4_edu_ltb_pct: null, isco4_edu_year: 2025, isco4_edu_flag: 'present',
    } }
    expect(eduBands(noLtb, 4).residualNote).toMatch(/below basic/)
  })

  it('every rendered set of chips clears the floor, across all 218 artefacts', () => {
    // The walk-back this suite failed to catch shipped chips that DID clear the
    // floor — at a survey seven years older than the one the floor rejected.
    // So "everything present clears the floor" is necessary but not sufficient,
    // and the CMR case above is what actually pins the year. Both are asserted.
    //
    // Deliberately NOT asserted: that the education year is close to the age
    // year. MDG publishes the education bands only for 2015 and PRY only up to
    // 2017, while both have 2022+ age data, so a gap of five or more years is a
    // genuine difference between two flows — exactly what the vintage rule
    // exists to record rather than to flatten.
    const below = []
    for (const { iso3, v } of ALL_CROSS) {
      for (let n = 1; n <= 9; n += 1) {
        const chips = ['bas', 'int', 'adv', 'ltb']
          .map((b) => v[`isco${n}_edu_${b}_pct`])
          .filter((x) => x !== null && x !== undefined)
        if (chips.length && chips.reduce((a, b) => a + b, 0) < 89.5) {
          below.push([iso3, n])
        }
      }
    }
    expect(below).toEqual([])
  })

  it('the JS flag constants match the values the pipeline actually writes', () => {
    // The drift guard, which is the whole point of mirroring the constants
    // rather than only de-duplicating the literal. If pipeline/config.py renames
    // a flag, every JS comparison silently reads undefined and falls through to
    // the wrong absence — a withheld group would start reporting itself as
    // "not published", which is the invented-absence failure one layer down.
    const seen = new Set(ALL_CROSS.flatMap(({ v }) =>
      Object.entries(v).filter(([k]) => k.endsWith('_edu_flag')).map(([, x]) => x)))
    expect(seen.size).toBeGreaterThan(0)
    for (const value of seen) {
      expect([FLAG_PRESENT, FLAG_WITHHELD, FLAG_NOT_PUBLISHED]).toContain(value)
    }
    // And each of the three is genuinely produced, so none is dead.
    expect(seen).toContain(FLAG_PRESENT)
    expect(seen).toContain(FLAG_WITHHELD)
    expect(seen).toContain(FLAG_NOT_PUBLISHED)
  })

  it('a withheld group still names the survey it judged', () => {
    const withheldNoYear = ALL_CROSS.filter(({ v }) =>
      v.isco4_edu_flag === FLAG_WITHHELD && v.isco4_edu_year === null)
    expect(withheldNoYear.map(({ iso3 }) => iso3)).toEqual([])
  })

  it('every group with shares carries its own year, per country', () => {
    for (const cross of [gbrCross, canCross]) {
      for (let n = 1; n <= 9; n += 1) {
        const a = ageBands(cross, n)
        if (a.state === PRESENT) expect(a.year).not.toBeNull()
        const e = eduBands(cross, n)
        if (e.state === PRESENT) expect(e.year).not.toBeNull()
      }
    }
  })
})
