// R1, R5, R6 (spec 0016) — the codec, against the committed payload.
//
// Against the real `global_labor.json`, not a fixture. The rules under test are
// statements *about that payload* — which 41 countries publish no occupation
// breakdown, which rows are aggregates rather than countries — and a fixture
// would let the payload change underneath a green suite.
import { describe, it, expect } from 'vitest'

import { rows } from '@/data/payload'
import { AGE_BAND_KEYS, EDU_BAND_KEYS } from '@/utils/crossTabs'
import { decode, encode, noticeFor, STEPS } from '@/utils/urlState'

describe('R1 — encode', () => {
  it('writes the five parameters in a fixed order', () => {
    expect(encode({ step: 4, iso3: 'GBR', group: 3, age: '25_54', edu: 'adv' }))
      .toBe('?step=result&country=GBR&group=3&age=25_54&edu=adv')
  })

  it('writes nothing at all for the intro', () => {
    expect(encode({ step: 0 })).toBe('')
    expect(encode({ step: 0, iso3: 'GBR', group: 3 })).toBe('')
  })

  it('omits an unset parameter rather than writing it empty', () => {
    expect(encode({ step: 2, iso3: 'GBR' })).toBe('?step=occupation&country=GBR')
  })

  it('round-trips every state the wizard can hold', () => {
    for (const step of [1, 2, 3, 4]) {
      const state = { step, iso3: 'GBR', group: 3, age: '25_54', edu: 'adv' }
      const back = decode(encode(state), rows)
      expect(back.step).toBe(step)
      expect(back.iso3).toBe('GBR')
      expect(back.group).toBe(3)
      expect(back.age).toBe('25_54')
      expect(back.edu).toBe('adv')
      expect(back.dropped).toEqual([])
    }
  })

  it('never writes a fragment', () => {
    const url = encode({ step: 4, iso3: 'GBR', group: 3, age: '25_54', edu: 'adv' })
    expect(url).not.toContain('#')
  })
})

describe('R1 — the vocabularies are the ones the screens use', () => {
  it('takes its step slugs from one list', () => {
    expect(STEPS).toEqual(['intro', 'country', 'occupation', 'optional', 'result'])
  })

  it('validates bands against the cross-tab keys, not a second copy', () => {
    expect(AGE_BAND_KEYS).toEqual(['15_24', '25_54', '55_64'])
    expect(EDU_BAND_KEYS).toEqual(['ltb', 'bas', 'int', 'adv'])
  })
})

// The rule with the most riding on it. 41 of the 218 countries publish no
// ISCO-08 breakdown, and a URL is a door into the result screen that does not
// pass through the country search — so without this, a deep link would be the
// one path in the app that could reach a result for a country with no series.
describe('R5 — a country with no official series never becomes a selection', () => {
  for (const [iso3, name] of [['CHN', 'China'], ['SAU', 'Saudi Arabia'], ['NZL', 'New Zealand']]) {
    it(`${iso3} decodes to a named absence, not a country`, () => {
      const out = decode(`?step=result&country=${iso3}&group=3`, rows)
      expect(out.iso3).toBeNull()
      expect(out.absent).toEqual({ iso3, name })
      expect(out.step).toBe(1)
      // Not a broken link — the country is real, the breakdown is not.
      expect(out.dropped).not.toContain('country')
    })
  }

  it('names the country in the notice rather than saying the link was bad', () => {
    const out = decode('?step=result&country=CHN&group=3', rows)
    const notice = noticeFor(out)
    expect(notice).toContain('China')
    expect(notice).toContain('no occupation breakdown')
  })

  it('holds for all 41, not only the three spot-checked', () => {
    const noSeries = rows.filter(
      (r) => r.row_type === 'country'
        && !['isco1_managers_pct', 'isco2_professionals_pct', 'isco3_technicians_pct',
          'isco4_clerical_pct', 'isco5_service_sales_pct', 'isco6_agricultural_pct',
          'isco7_craft_pct', 'isco8_operators_pct', 'isco9_elementary_pct']
          .some((k) => r[k] !== null && r[k] !== undefined),
    )
    expect(noSeries).toHaveLength(41)
    for (const r of noSeries) {
      const out = decode(`?step=result&country=${r.iso3}&group=3`, rows)
      expect(out.iso3).toBeNull()
      expect(out.step).toBe(1)
      expect(out.absent?.name).toBe(r.country_name)
    }
  })

  it('lets all 177 with a series through', () => {
    const withSeries = rows.filter(
      (r) => r.row_type === 'country'
        && ['isco1_managers_pct', 'isco2_professionals_pct', 'isco3_technicians_pct',
          'isco4_clerical_pct', 'isco5_service_sales_pct', 'isco6_agricultural_pct',
          'isco7_craft_pct', 'isco8_operators_pct', 'isco9_elementary_pct']
          .some((k) => r[k] !== null && r[k] !== undefined),
    )
    expect(withSeries).toHaveLength(177)
    for (const r of withSeries) {
      const out = decode(`?step=result&country=${r.iso3}&group=3`, rows)
      expect(out.iso3).toBe(r.iso3)
      expect(out.step).toBe(4)
      expect(out.absent).toBeNull()
    }
  })
})

describe('R6 — bad input degrades to the deepest supported step', () => {
  const cases = [
    ['?step=result&country=ZZZ&group=3', 1, ['country']],
    ['?step=result&country=GBR&group=12', 2, ['group']],
    ['?step=result', 1, []],
    ['?step=banana&country=GBR', 2, ['step']],
    ['?step=result&country=WLD&group=3', 1, ['country']],
  ]

  for (const [search, step, dropped] of cases as [string, number, string[]][]) {
    it(`${search} → step ${step}`, () => {
      const out = decode(search, rows)
      expect(out.step).toBe(step)
      expect(out.dropped).toEqual(dropped)
    })
  }

  it('an aggregate row is not a country', () => {
    // WLD exists in the payload; it is just not somebody's country.
    expect(rows.some((r) => r.iso3 === 'WLD')).toBe(true)
    expect(rows.find((r) => r.iso3 === 'WLD')!.row_type).not.toBe('country')
    const out = decode('?step=result&country=WLD&group=3', rows)
    expect(out.iso3).toBeNull()
    expect(out.absent).toBeNull()
  })

  it('drops only the bad band and keeps the good one', () => {
    const out = decode('?step=result&country=GBR&group=3&age=30_40&edu=adv', rows)
    expect(out.step).toBe(4)
    expect(out.age).toBeNull()
    expect(out.edu).toBe('adv')
    expect(out.dropped).toEqual(['age'])
  })

  it('rejects a group that only starts as a number', () => {
    expect(decode('?group=3abc', rows).group).toBeNull()
    expect(decode('?group=3.5', rows).group).toBeNull()
    expect(decode('?group=0', rows).group).toBeNull()
    expect(decode('?group=10', rows).group).toBeNull()
  })

  it('an unreadable step still honours the intent, a missing one does not', () => {
    // Different failures. `step=banana` says "somewhere in the wizard" and we
    // go as deep as the answers allow; no `step` at all is the bare landing.
    expect(decode('?step=banana&country=GBR', rows).step).toBe(2)
    expect(decode('?country=GBR', rows).step).toBe(0)
  })

  it('an empty query is the intro with nothing dropped', () => {
    const out = decode('', rows)
    expect(out).toMatchObject({ step: 0, iso3: null, group: null, dropped: [] })
    expect(noticeFor(out)).toBeNull()
  })

  it('says what it dropped', () => {
    expect(noticeFor(decode('?step=result&country=ZZZ&group=3', rows)))
      .toContain('does not carry')
    expect(noticeFor(decode('?step=result&country=GBR&group=12', rows)))
      .toContain('outside the nine')
  })

  it('never throws on hostile input', () => {
    for (const s of ['?', '?step', '?step=&country=&group=', '?country=%%%', '?group=NaN',
      '?step=result&step=intro', '?age=15_24&age=99']) {
      expect(() => decode(s, rows)).not.toThrow()
    }
  })
})
