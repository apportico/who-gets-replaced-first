// Spec 0008's guarantee, carried onto the surface 0010 replaced it with.
//
// 0008 found three of four tier badges failing AA (3.08 / 3.16 / 4.39:1) and
// fixed them, then pinned the fix with `test/palette.test.mjs`. Spec 0010 R1
// deletes the map those assertions ran against, and five of 0008's six suites
// went with it — they import `LaborDetailPanel`, the metric ramps, or the
// light-theme text palette, none of which survive a dark-only wizard.
//
// Retiring the assertions with the surface is correct. Retiring the GUARANTEE
// would not be: the wizard renders tier badges on every figure it shows, which
// is exactly the case 0008 was about. So the rule moves here and the numbers
// are recomputed against the canvas palette.
//
// `contrast` is imported from 0008's own probe rather than reimplemented, so
// the two cannot drift and a change to the WCAG maths applies to both.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { contrast } from '../../scripts/palette-probe.mjs'

const CSS = readFileSync(path.resolve('src/styles/index.css'), 'utf8')

// The canvas palette, from src/styles/index.css. Duplicated as literals on
// purpose: a test that read the tokens from the file it is checking would pass
// whatever the file said.
const BG = '#0D0C0A'
const SURFACE = '#161411'
const FG = '#E8E4DA'
const FG_STRONG = '#F2EFE6'
const ACCENT = '#FF5A2B'
const ACCENT_SOFT = '#FF9670'

/** Flatten `rgba(fg, alpha)` over an opaque backdrop. */
function over(hex: string, alpha: number, backdrop: string) {
  const h = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
  const [r1, g1, b1] = h(hex)
  const [r2, g2, b2] = h(backdrop)
  const mix = (a: number, b: number) => Math.round(a * alpha + b * (1 - alpha))
  return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)]
    .map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

describe('0008 R4, on 0010’s surface — every tier badge clears AA', () => {
  // .wz-badge: color rgba(232,228,218,0.72) on a 7% #E8E4DA wash over --surface.
  const NEUTRAL_BADGE_BG = over(FG, 0.07, SURFACE)
  const NEUTRAL_BADGE_FG = over(FG, 0.72, NEUTRAL_BADGE_BG)

  it('the DERIVED / OFFICIAL badge clears 4.5:1 on its own background', () => {
    const ratio = contrast(NEUTRAL_BADGE_FG, NEUTRAL_BADGE_BG)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('the unsourced badge clears 4.5:1 on its accent-tinted background', () => {
    // The variant the method panel uses for a term with no source — the one
    // place a badge carries meaning rather than a label.
    const tintBg = over(ACCENT, 0.10, SURFACE)
    expect(contrast(ACCENT_SOFT, tintBg)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('0008 R11, on 0010’s surface — body text clears AA', () => {
  // The tones the SCREENS paint, not the ones the palette happens to define.
  //
  // The first version of this block asserted `contrast(FG, BG)` — 15.40:1 — and
  // reported body text as passing. Bare `--fg` is used by exactly one rule,
  // `body`; every explanatory paragraph on every screen is `.wz-body` or
  // `.wz-note`, both `--muted`, which computed 3.80:1 and failed AA the whole
  // time. A test that measures a colour nothing paints is the shape 0008 spent
  // four rounds learning to distrust.
  const MUTED = over(FG, 0.55, BG)
  const MUTED_ON_CARD = over(FG, 0.55, SURFACE)
  const MUTED_STRONG = over(FG, 0.72, SURFACE)

  it('.wz-body and .wz-note — the prose the screens actually render', () => {
    expect(contrast(MUTED, BG)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(MUTED_ON_CARD, SURFACE)).toBeGreaterThanOrEqual(4.5)
  })

  it('the emphasised secondary tone', () => {
    expect(contrast(MUTED_STRONG, SURFACE)).toBeGreaterThanOrEqual(4.5)
  })

  it('body text on the page and on a card', () => {
    expect(contrast(FG, BG)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(FG, SURFACE)).toBeGreaterThanOrEqual(4.5)
  })

  it('display text clears AA on both grounds', () => {
    expect(contrast(FG_STRONG, BG)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(FG_STRONG, SURFACE)).toBeGreaterThanOrEqual(4.5)
  })

  it('the primary action’s label clears AA on the accent', () => {
    // .wz-cta is --bg text on --accent.
    expect(contrast(BG, ACCENT)).toBeGreaterThanOrEqual(4.5)
  })

  it('a selected option clears AA — it inverts, so both directions matter', () => {
    // The defect this pins from the other side: when --accent-bg was mapped to
    // --surface, a selected option was #161411 on #0D0C0A, about 1.1:1.
    expect(contrast(BG, FG_STRONG)).toBeGreaterThanOrEqual(4.5)
  })

  it('the token itself is the one the screens use, not a weaker one', () => {
    // Guards the fix rather than the symptom: if --muted drifts back toward the
    // canvas's 0.45 this fails, where an assertion on a hardcoded flattened hex
    // would not.
    expect(CSS).toMatch(/--muted:\s*rgba\(232, 228, 218, 0\.5[5-9]\)/)
  })
})

describe('0008’s central finding — a null is distinguishable from a measurement', () => {
  it('a stated absence is not rendered in the same tone as a value', () => {
    // 0008 found the lightest ramp step sitting ΔE 5.6 from the no-data grey,
    // so a measured low value and a null looked the same. The wizard has no
    // ramp: an absence is a SENTENCE, not a colour, so the failure mode cannot
    // recur in that form. What replaces the guarantee is that absence text is
    // legible rather than greyed into the background.
    const absenceText = over(FG, 0.72, SURFACE)
    expect(contrast(absenceText, SURFACE)).toBeGreaterThanOrEqual(4.5)
  })
})
