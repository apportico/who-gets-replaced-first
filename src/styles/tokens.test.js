// R2 / R4 / R5 — the parts of the style contract that can be checked without a
// browser, checked here rather than left to the eye.
//
// This reads src/styles/index.css as text and asserts the declarations the spec
// names. That is a real check of R2's contract — the tokens exist, carry the
// canvas's values, and the touch-target rules are declared — and it is honest
// about its limit: it proves the CSS *says* min-height 60px, not that the
// button *renders* at 60px. Layout needs a browser, and 0010's Non-goals rule
// out taking a Playwright dependency for two criteria, so the rendered halves
// of R4 and R5 stay in the spec's Verification section.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// path.resolve from the repo root rather than import.meta.url: vitest serves
// test modules over an http: URL, so `new URL('./x', import.meta.url)` is not a
// file: URL and readFileSync rejects it.
const css = readFileSync(path.resolve('src/styles/index.css'), 'utf8')
const HTML = readFileSync(path.resolve('index.html'), 'utf8')

/** The declarations of one rule, comments stripped. Selector matched exactly. */
function ruleBody(selector) {
  const i = css.indexOf(`${selector} {`)
  if (i === -1) return ''
  const body = css.slice(i + selector.length + 2, css.indexOf('}', i))
  return body.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('R2 — the canvas tokens are declared, with the canvas values', () => {
  const TOKENS = {
    '--bg': '#0D0C0A',
    '--surface': '#161411',
    '--fg': '#E8E4DA',
    '--fg-strong': '#F2EFE6',
    '--accent': '#FF5A2B',
    '--accent-hover': '#FF7A4D',
    '--accent-soft': '#FF9670',
  }

  it.each(Object.entries(TOKENS))('%s is %s', (name, value) => {
    expect(css).toMatch(new RegExp(`${name}:\\s*${value}`))
  })

  it('declares the type scale as tokens, not only as rules', () => {
    // R2 names the type scale alongside the palette, radii and keyframes. It
    // was the one defined only inside .wz-* rules, and R2's hex grep cannot
    // catch a hand-typed font-size, so it was the half that drifts silently.
    for (const [name, value] of [
      ['--step-h1', '66px'], ['--step-h2', '46px'], ['--step-stat', '38px'],
      ['--step-lede', '17.5px'], ['--step-body', '15px'], ['--step-note', '12.5px'],
      // 11px across every mono label, not just badges. 0008 R4's sentence names
      // badge text, but 0008 records its closure as "the 7-10px labels that
      // carry meaning are raised to 11px" — eyebrows, accordion triggers,
      // tertiary actions and band chips all carry meaning. Raising only the
      // badge token carried half of R4 and left the rest at the pre-fix size.
      ['--step-meta', '11px'], ['--step-badge', '11px'], ['--step-eyebrow', '11px'],
    ]) {
      expect(css).toMatch(new RegExp(`${name}:\\s*${value.replace('.', '\\.')}`))
    }
    // And the rules reach for the tokens rather than repeating the numbers.
    expect(css).toMatch(/\.wz-h1[\s\S]{0,120}font-size:\s*var\(--step-h1\)/)
    expect(css).toMatch(/\.wz-body\s*{[^}]*font-size:\s*var\(--step-body\)/)
  })

  it('declares the three radii and the three touch targets', () => {
    for (const [name, value] of [
      ['--radius-control', '14px'], ['--radius-card', '18px'], ['--radius-pill', '99px'],
      ['--tap-primary', '60px'], ['--tap-option', '56px'], ['--tap-tertiary', '48px'],
    ]) {
      expect(css).toMatch(new RegExp(`${name}:\\s*${value}`))
    }
  })

  it('requests all three families from the document, not from the CSS', () => {
    // Two defects in a row here, and the second is the instructive one.
    //
    // First: the @import sat below the :root blocks, which CSS forbids, so
    // browsers drop it. I moved it above the first rule and asserted the
    // POSITION rather than the presence, which felt like the lesson.
    //
    // It was not. Tailwind v4's processing drops a bare `@import url()`
    // entirely, so the built CSS carried no @import and no @font-face at either
    // ordering -- the app shipped in fallback faces the whole time and a test
    // reading the source file could not see it. The request now lives in
    // index.html, and this asserts the file that actually ships.
    expect(HTML).toContain('Instrument+Serif:ital@0;1')
    expect(HTML).toContain('family=Geist:')
    expect(HTML).toContain('Geist+Mono')
    expect(HTML).toMatch(/rel="preconnect"[^>]*fonts\.gstatic\.com/)
    // And nothing tries to bring them in through the stylesheet again.
    expect(css).not.toContain('fonts.googleapis')
  })

  it('every family carries a real fallback stack', () => {
    // Load-bearing rather than decorative: a blocked font request has to
    // degrade to a system face, and for two rounds this was what the app was
    // actually rendering in.
    expect(css).toMatch(/--font-display:.*serif/)
    expect(css).toMatch(/--font-body:.*sans-serif/)
    expect(css).toMatch(/--font-mono:.*monospace/)
  })
})

describe('R2 — four keyframes, not the canvas’s five', () => {
  it('ships stepin, fade, draw and pulse', () => {
    for (const k of ['stepin', 'fade', 'draw', 'pulse']) {
      expect(css).toMatch(new RegExp(`@keyframes\\s+${k}\\b`))
    }
  })

  it('does not ship `band`, which animated the interval band R14 removes', () => {
    expect(css).not.toMatch(/@keyframes\s+band\b/)
    expect((css.match(/@keyframes/g) ?? []).length).toBe(4)
  })

  it('disables them under prefers-reduced-motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(css).toMatch(/animation-duration:\s*0\.001ms\s*!important/)
  })
})

describe('R4 — the shadcn defaults are overwritten, not shipped', () => {
  it('no perceptual-colour default from `shadcn init` survives', () => {
    // R4's own criterion. It has to hold for comments too, which is why the
    // note explaining this rule does not spell the function name.
    expect(css).not.toContain('oklch(')
  })

  it('the palette sits on bare :root, not only under a dark class', () => {
    expect(css).toMatch(/:root\s*{[^}]*--bg:/)
    expect(css).not.toMatch(/\.dark\s*{/)
  })

  it('maps shadcn’s own token names onto the canvas palette', () => {
    for (const n of ['--background', '--foreground', '--primary', '--card', '--ring']) {
      expect(css).toMatch(new RegExp(`${n}:\\s*var\\(--`))
    }
  })
})

describe('R5 — the touch targets and the focus ring are declared', () => {
  it('no mono rule in this stylesheet declares a px size under 11', () => {
    // Deliberately narrow, and named for what it does. It catches the likely
    // new-label regression — someone writing `font-family: var(--font-mono);
    // font-size: 9px` — and nothing else:
    //
    //   - the token-valued rules are skipped here and pinned at the token
    //     assertions above, which is where they belong;
    //   - it requires font-size to sit adjacent to font-family, so a mono rule
    //     that sets size elsewhere in its block is invisible to it;
    //   - it cannot see inline `fontSize` in JSX at all, which is what the
    //     defect actually was — 218 rendered country rows, outside this file.
    //
    // The rendered floor is asserted in computed.test.jsx, on elements. An
    // earlier version of this comment claimed both halves were checked here.
    // They were not, and saying so was the same defect as the thing it claimed
    // to check.
    const monoRules = [...css.matchAll(/font-family:\s*var\(--font-mono\)[^;]*;\s*font-size:\s*([^;]+);/g)]
    expect(monoRules.length).toBeGreaterThan(0)
    for (const [, size] of monoRules) {
      const px = size.trim().endsWith('px') ? parseFloat(size) : null
      if (px !== null) expect(px).toBeGreaterThanOrEqual(11)
    }
  })

  it('the two Radix components that ship meet the floor', () => {
    // shadcn ships h-9 (36px) on the toggle and the accordion trigger.
    //
    // The earlier version of this test asserted a selector list that included
    // button and input — components that were installed and never rendered, so
    // it was checking a rule that applied to nothing. Asserting a selector is
    // not asserting that anything matches it; computed.test.jsx is what closes
    // that gap, on elements.
    // Scoped under .wz-bandgroup so it outranks .wz-chip — see the comment on
    // that rule. computed.test.jsx asserts the outcome on the element, which is
    // what a text grep cannot do and what let the shadowing through.
    //
    // Extract the rule body rather than matching within a character window: the
    // window has to be widened every time a comment grows, and a window that is
    // too small fails for a reason that has nothing to do with the rule.
    expect(ruleBody('.wz-bandgroup [data-slot="toggle-group-item"]'))
      .toMatch(/min-height:\s*var\(--tap-option\)/)
    expect(ruleBody('[data-slot="accordion-trigger"]'))
      .toMatch(/min-height:\s*var\(--tap-option\)/)
  })

  it('a selected Radix chip inverts, the way .wz-option does', () => {
    // Radix reports selection through data-state, not aria-pressed, so the
    // .wz-option rule does not reach it. A selected chip that reads as
    // unselected is the exact defect this file already shipped once.
    expect(css).toMatch(/\[data-state="on"\][\s\S]{0,140}background:\s*var\(--fg-strong\)/)
  })

  it('the primary CTA declares the 60px target', () => {
    expect(css).toMatch(/\.wz-cta\s*{[^}]*min-height:\s*var\(--tap-primary\)/)
  })

  it('options declare 56px and tertiary actions 48px', () => {
    expect(css).toMatch(/\.wz-option\s*{[^}]*min-height:\s*var\(--tap-option\)/)
    expect(css).toMatch(/\.wz-tertiary\s*{[^}]*min-height:\s*var\(--tap-tertiary\)/)
  })

  it('the focus ring is 2px accent at 3px offset, and is never removed', () => {
    expect(css).toMatch(/outline:\s*2px solid var\(--accent\)/)
    expect(css).toMatch(/outline-offset:\s*3px/)
    expect(css).not.toMatch(/outline:\s*none/)
  })

  it('the column is capped at the canvas width', () => {
    expect(css).toMatch(/--column:\s*480px/)
  })
})
