// Spec 0019 R11, layer 1. The data surface, as strings, for every country.
//
// Run in BOTH trees (main and this branch) and diff the output. If a single
// figure, tier badge, per-field year, absence sentence or stand-in notice moved,
// the diff is non-empty and R11 fails — which is the point: this migration is
// allowed to move the framework and not one published number.
//
// It runs through vitest rather than as a bare node script so the same file
// resolves `@/utils/x` to `.js` on main and `.ts` here, without either tree
// needing to know about the other.
//
// The functions are named individually and deliberately. Naming the MODULES
// would not do: `groupShare` returns a state, a figure and a year and no tier
// at all — the tier strings and both absence sentences come from `termsFor`,
// and the stand-in flag from `trendFor`. "A stand-in says it is standing in" is
// a Pass 1 rule, so a run that could not see `trendFor` would let it break.
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import payload from '@/data/global_labor.json'
import { groupShare, groupHeadcount } from '@/utils/groupFigures'
import { termsFor } from '@/utils/terms'
import { trendFor } from '@/utils/trend'
import { seriesFor } from '@/utils/laborPanel'
import { classificationNotice } from '@/utils/classification'
import { noticeFor } from '@/utils/urlState'
import { hasAnyIscoGroup } from '@/utils/countryList'
import { backtestFor, summaryFor, tierFor, POOLED } from '@/utils/backtest'

const GROUPS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

it('writes the data surface snapshot', () => {
  const rows = payload.rows.filter((r) => r.row_type === 'country')
  const out = {}

  for (const row of rows.slice().sort((a, b) => a.iso3.localeCompare(b.iso3))) {
    const per = { hasSeries: hasAnyIscoGroup(row), groups: {} }
    for (const g of GROUPS) {
      const share = groupShare(row, g)
      const head = groupHeadcount(row, g)
      const trend = trendFor(row.iso3, g)
      // Cross-tabs are per-country async artefacts; null exercises the absence
      // branches deterministically and offline, which is what R11 compares.
      const terms = termsFor(row, g, null)
      const notice = classificationNotice(row, g)

      per.groups[g] = {
        share: { state: share.state, display: share.display ?? null, tier: share.tier ?? null,
                 year: share.year ?? null, message: share.message ?? null },
        head: { state: head.state, display: head.display ?? null, tier: head.tier ?? null,
                year: head.year ?? null, message: head.message ?? null,
                sources: head.sources ?? null },
        // The POINTS, not their count. A length is invariant to every value
        // in the series changing — the same defect R10's file count had, and
        // exactly what this snapshot exists to catch.
        trend: { show: trend.show, standIn: trend.standIn ?? null,
                 notice: trend.notice ?? null, tier: trend.tier ?? null,
                 points: (trend.points ?? []).map((p) => [p.year, p.value]) },
        // The back-test figures the result screen renders, with their tiers.
        // Absent from the first version of this snapshot, so a migration could
        // have moved a retrodiction and the diff would have stayed empty.
        backtest: (() => {
          const b = backtestFor(row.iso3, g)
          return {
            scored: b.scored,
            column: b.group,
            retrodicted: b.retrodicted_2025_pct ?? null,
            observed: b.observed_2025_pct ?? null,
            error_pp: b.error_pp ?? null,
            direction_correct: b.direction_correct ?? null,
            tiers: {
              retrodicted: tierFor('retrodicted_2025_pct'),
              observed: tierFor('observed_2025_pct'),
              error: tierFor('error_pp'),
            },
          }
        })(),
        summary: summaryFor(g) ?? null,
        // The tier strings and both absence sentences live here.
        terms: terms.map((t) => ({ name: t.name, tier: t.tier ?? null,
                                   sourced: t.sourced, year: t.year ?? null, desc: t.desc })),
        classification: notice ? notice.text : null,
      }
    }
    // Again the values, not the count.
    per.series = seriesFor(row.iso3, 'isco4_clerical_pct').map((p) => [p.year, p.value])
    out[row.iso3] = per
  }

  // The dropped-parameter and no-series notices, which are statements about
  // absence rather than about a country.
  // The pooled finding the result screen quotes when a country cannot be
  // scored — a figure on the screen, so it belongs in the comparison.
  out.__pooled = {
    n: POOLED.n ?? null,
    mae_pp: POOLED.mae_pp ?? null,
    persistence_mae_pp: POOLED.persistence_mae_pp ?? null,
    direction_wrong_n: POOLED.direction_wrong_n ?? null,
  }

  out.__notices = {
    absent: noticeFor({ absent: { iso3: 'CHN', name: 'China' } }),
    droppedCountry: noticeFor({ dropped: ['country'] }),
    droppedAll: noticeFor({ dropped: ['country', 'group', 'age', 'edu'] }),
    none: noticeFor({}),
  }

  writeFileSync(process.env.SURFACE_OUT, JSON.stringify(out, null, 1))
})
