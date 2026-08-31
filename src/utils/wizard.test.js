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

import { resolveTitle } from './resolveTitle'
import { GROUPS, groupDisplay } from './isco'
import { countryTag, countryOptions, hasAnyIscoGroup, OFFICIAL_SERIES, NO_SERIES } from './countryTag'
import { groupShare, groupHeadcount } from './groupFigures'
import { trendFor, CLERICAL_GROUP } from './trend'
import { classificationNotice, isIsco88 } from './classification'
import { termsFor, BACKTEST_NOTE } from './terms'
import {
  NOT_PUBLISHED, PRESENT, WITHHELD, LOAD_FAILED, NOT_LOADED,
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

// ---------------------------------------------------------------- R6
describe('R6 — step 01 country, tagged by what the data actually carries', () => {
  it('reads "any of the nine", which is 177 countries', () => {
    const official = countries.filter((r) => countryTag(r) === OFFICIAL_SERIES)
    expect(official.length).toBe(177)
  })

  it('tags a country with every group null as no series', () => {
    const none = countries.find((r) => !hasAnyIscoGroup(r))
    expect(none).toBeDefined()
    expect(countryTag(none)).toBe(NO_SERIES)
  })

  it('hides no country for lacking data', () => {
    expect(countryOptions(rows).length).toBe(countries.length)
  })

  it('the three readings really do differ, which is why one is stated', () => {
    const all9 = countries.filter((r) => GROUPS.every((g) => r[g.key] !== null)).length
    const any9 = countries.filter(hasAnyIscoGroup).length
    expect(any9).toBe(177)
    expect(all9).toBe(170)
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

  it('owns R6’s withdrawal: tagged official, still absent for this group', () => {
    // The seven-country gap R6 documents. A country can be tagged
    // `official series` at step 01 and still not report the reader's group —
    // this is where that promise is withdrawn in words.
    const partial = countries.find(
      (r) => hasAnyIscoGroup(r) && GROUPS.some((g) => r[g.key] === null),
    )
    expect(partial).toBeDefined()
    const missing = GROUPS.find((g) => partial[g.key] === null)
    expect(countryTag(partial)).toBe(OFFICIAL_SERIES)
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

  it('a withheld group yields the withheld state, not four thin chips', () => {
    const withheld = { values: { isco4_edu_bas_pct: null, isco4_edu_year: null } }
    expect(eduBands(withheld, 4).state).toBe(WITHHELD)
    expect(eduBands(withheld, 4).bands).toEqual([])
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
