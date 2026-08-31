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

  it('declares the three radii and the three touch targets', () => {
    for (const [name, value] of [
      ['--radius-control', '14px'], ['--radius-card', '18px'], ['--radius-pill', '99px'],
      ['--tap-primary', '60px'], ['--tap-option', '56px'], ['--tap-tertiary', '48px'],
    ]) {
      expect(css).toMatch(new RegExp(`${name}:\\s*${value}`))
    }
  })

  it('puts the font @import above every rule, or the browser drops it', () => {
    // The defect this guards actually shipped: the @import sat after the :root
    // blocks, which CSS forbids, so browsers dropped it and none of the three
    // families loaded. Nothing failed -- the page just rendered in fallbacks.
    // Asserting the URL is present is not enough; position is the bug.
    const fontImport = css.indexOf('@import url(')
    const firstRule = css.search(/^[.:@a-z[][^\n]*\{/m)
    expect(fontImport).toBeGreaterThan(-1)
    expect(fontImport).toBeLessThan(firstRule)
  })

  it('loads all three families, including the italic face the headline needs', () => {
    expect(css).toContain('Instrument+Serif:ital@0;1')
    expect(css).toContain('family=Geist:')
    expect(css).toContain('Geist+Mono')
    // Every family carries a real fallback stack, so a blocked font request
    // degrades to a system face rather than to nothing.
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
  it('the generated shadcn components meet the 48px floor too', () => {
    // shadcn ships h-9 (36px) on button, toggle and input. Without this the
    // three tap tokens would be declared and unused by anything shadcn renders.
    expect(css).toMatch(/\[data-slot="toggle"\][\s\S]{0,200}min-height:\s*var\(--tap-tertiary\)/)
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
