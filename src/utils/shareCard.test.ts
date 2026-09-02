// 0015 R6 and R7, asserted over the card's model.
//
// These run over **every country and every one of the nine groups**, not just
// the UK case the issue names. A share card is generated in the reader's
// browser for whatever cell they landed on, so a guarantee checked on one cell
// is not a guarantee — and the interesting cells are precisely the ones with a
// missing figure or a stand-in series, which is exactly what a single
// hand-picked example misses.
import { describe, it, expect } from 'vitest'

import payload from '@/data/global_labor.json'
import type { LaborRow } from '@/types'
import {
  shareCardModel, cardText, allowedYears, yearTokens, CARD_REFUSAL,
} from '@/utils/shareCard'
import { GROUPS } from '@/utils/isco'

// 0019 R6. One assertion at the payload boundary, the same shape WizardShell
// uses: the JSON import infers a vast literal union, and `LaborRow[]` is the
// contract the app actually consumes. One cast here beats a cast at every call.
const rows = payload.rows as unknown as LaborRow[]
const gbr = rows.find((r) => r.iso3 === 'GBR')
const TECHNICIANS = 3

const everyCell: [LaborRow, number][] = []
for (const row of rows) {
  for (const g of GROUPS) everyCell.push([row, g.n])
}

describe('0015 R6 — every figure carries its tier, or is not drawn', () => {
  it('no figure on any card, for any cell, is drawn without a tier', () => {
    const offenders = []
    for (const [row, group] of everyCell) {
      for (const f of shareCardModel({ row, group }).figures) {
        if (!f.tier) offenders.push(`${row.iso3}/${group}: ${f.label}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the tier vocabulary is the project’s four, and nothing else', () => {
    const tiers = new Set()
    for (const [row, group] of everyCell) {
      for (const f of shareCardModel({ row, group }).figures) tiers.add(f.tier)
    }
    for (const t of tiers) {
      expect(['OFFICIAL', 'DERIVED', 'PROXY', 'MODELED']).toContain(t)
    }
  })

  it('a stand-in trend always carries the stand-in sentence', () => {
    // The failure this guards is silent and specific: the clerical series
    // drawn under a heading about technicians, with the disclosure lost in the
    // crop. Checked on every non-clerical group of every country that has a
    // series at all.
    let checked = 0
    for (const [row, group] of everyCell) {
      const model = shareCardModel({ row, group })
      const trend = model.figures.find((f) => f.span)
      if (!trend || group === 4) continue
      checked += 1
      expect(model.disclosures.some((d) => d.includes('stand-in'))).toBe(true)
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('a figure the source does not publish is stated in words, never omitted silently', () => {
    const noSeries = rows.find((r) => r.isco3_technicians_pct === null)
    if (!noSeries) return
    const model = shareCardModel({ row: noSeries, group: TECHNICIANS })
    expect(model.figures.some((f) => f.label === 'Share today')).toBe(false)
    expect(model.absences.length).toBeGreaterThan(0)
    expect(model.headline).toBe('No published figure')
  })

  it('the UK technicians card carries the three figures the screen shows', () => {
    const model = shareCardModel({ row: gbr, group: TECHNICIANS })
    expect(model.subject).toBe('Technicians and associate professionals · United Kingdom')
    expect(model.headline).toBe("14.1% of United Kingdom's workers")
    expect(model.figures.map((f) => f.tier)).toEqual(['DERIVED', 'DERIVED', 'DERIVED'])
    expect(model.disclosures.some((d) => d.startsWith('Clerical support workers shown as a stand-in'))).toBe(true)
  })
})

describe('0015 R7 — the card never states a year as an outcome', () => {
  it('every year token on every card traces to a vintage or a series endpoint', () => {
    const offenders = []
    for (const [row, group] of everyCell) {
      const model = shareCardModel({ row, group })
      const allowed = allowedYears(model)
      for (const { year, text } of yearTokens(model)) {
        if (!allowed.has(year)) offenders.push(`${row.iso3}/${group}: ${year} in "${text}"`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the whitelist is not vacuous — the UK card really does carry years', () => {
    // Without this, a model that emitted no years at all would pass the test
    // above while proving nothing.
    const model = shareCardModel({ row: gbr, group: TECHNICIANS })
    expect(yearTokens(model).length).toBeGreaterThan(0)
    expect([...allowedYears(model)].sort()).toEqual([2013, 2025])
  })

  it('rejects a year that traces to nothing', () => {
    // The canary. A blacklist keyed on "later than today" would let this
    // through in 2031; the whitelist rejects it now and then.
    const model = shareCardModel({ row: gbr, group: TECHNICIANS })
    // A mutable copy: ShareCardModel's arrays are readonly by contract
    // (0015 R5), and this test is deliberately injecting a bad disclosure.
    const poisoned = { ...model, disclosures: [...model.disclosures, 'Replacement expected by 2041.'] }
    const allowed = allowedYears(poisoned)
    const bad = yearTokens(poisoned).filter((t) => !allowed.has(t.year))
    expect(bad.map((t) => t.year)).toEqual([2041])
  })

  it('carries the refusal, and the refusal itself names no year', () => {
    const model = shareCardModel({ row: gbr, group: TECHNICIANS })
    expect(model.refusal).toBe(CARD_REFUSAL)
    expect(CARD_REFUSAL).not.toMatch(/\b\d{4}\b/)
    expect(cardText(model)).toContain(CARD_REFUSAL)
  })

  it('no card anywhere contains a year later than the latest vintage in the payload', () => {
    // A second, independent angle on the same rule. The whitelist above is
    // about provenance; this is about plausibility, and the two failing
    // together is what a projected date would look like.
    const latest = Math.max(
      ...rows.map((r) => (r.data_year_occupation as number | null) ?? 0).filter(Boolean),
    )
    for (const [row, group] of everyCell) {
      for (const { year } of yearTokens(shareCardModel({ row, group }))) {
        expect(year).toBeLessThanOrEqual(latest)
      }
    }
  })
})
