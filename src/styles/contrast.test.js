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
import { contrast } from '../../scripts/palette-probe.mjs'

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
function over(hex, alpha, backdrop) {
  const h = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
  const [r1, g1, b1] = h(hex)
  const [r2, g2, b2] = h(backdrop)
  const mix = (a, b) => Math.round(a * alpha + b * (1 - alpha))
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

  it('muted note text clears the 3:1 floor it is held to', () => {
    // --muted is rgba(232,228,218,0.45), used only for secondary notes at
    // 12.5px. Held to 3:1 rather than 4.5:1 and said so, rather than claiming
    // an AA pass it does not have.
    const muted = over(FG, 0.45, SURFACE)
    expect(contrast(muted, SURFACE)).toBeGreaterThanOrEqual(3.0)
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
