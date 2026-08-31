// R4 and R5 — the computed halves, closed as far as an engine without layout
// can close them.
//
// The plan recorded these as manual because jsdom does no layout. That is true
// of layout, and it is NOT true of the cascade: jsdom resolves selector
// matching, specificity and inheritance, and it resolves custom properties on
// :root. What it does not do is substitute `var()` inside a declaration —
// `getComputedStyle(el).minHeight` comes back as the literal string
// `"var(--tap-primary)"`. So this suite resolves the indirection in one explicit
// step: read the declaration off the real element, then read the token off
// :root.
//
// That is materially stronger than the text grep in tokens.test.js, because it
// fails on the things a grep cannot see — a selector that does not match the
// element, a rule another rule overrides, a token that is never defined, or a
// class the component stopped applying. A file can contain the right CSS and
// still not apply it to anything.
//
// What is still outstanding, honestly: real layout (does a 60px min-height
// button actually paint 60px tall against its content and box model), real font
// loading, and the painted colour. Those need a browser. The Verification
// section says so.
import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import App from '@/App'

// jsdom cannot fetch `@import`ed sheets, and Tailwind's own layer is generated
// at build time, so those lines are dropped. Everything this suite asserts is
// plain CSS written by hand in index.css — the tokens and the .wz-* rules.
const RAW = readFileSync(path.resolve('src/styles/index.css'), 'utf8')
const CSS = RAW.split('\n').filter((l) => !l.trimStart().startsWith('@import')).join('\n')

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)
})

/** Resolve a declaration that is written as `var(--token)`. */
function resolved(el, prop) {
  const declared = getComputedStyle(el).getPropertyValue(prop).trim()
  const m = declared.match(/^var\((--[\w-]+)\)$/)
  if (!m) return declared
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim()
}

describe('R4 — the palette actually reaches the elements', () => {
  it('the page ground is the canvas background, not shadcn stone', () => {
    cleanup()
    render(<App />)
    // Read from :root the way the rules do, and confirm the mapped shadcn name
    // resolves to the same colour rather than to a default.
    const root = getComputedStyle(document.documentElement)
    expect(root.getPropertyValue('--bg').trim()).toBe('#0D0C0A')
    expect(root.getPropertyValue('--background').trim()).toBe('var(--bg)')
    expect(root.getPropertyValue('--primary').trim()).toBe('var(--accent)')
    expect(root.getPropertyValue('--accent').trim()).toBe('#FF5A2B')
    expect(resolved(document.body, 'background')).toBe('#0D0C0A')
  })

  it('renders dark with no .dark class anywhere in the tree', () => {
    cleanup()
    const { container } = render(<App />)
    expect(document.documentElement.className).not.toMatch(/\bdark\b/)
    expect(container.querySelector('.dark')).toBeNull()
  })

  it('the card radius resolves to 18px, not the 99px pill', () => {
    // The defect this pins: --radius-xl was mapped to the pill while card.jsx
    // is `rounded-xl`, so every stat card rendered as a lozenge.
    //
    // --radius-card is a real custom property on :root, so jsdom resolves it.
    // --radius-xl is not: it lives in `@theme inline`, a Tailwind v4 at-rule
    // that jsdom does not evaluate, so getComputedStyle returns ''. Asserted
    // from the stylesheet text instead, and said out loud rather than quietly
    // asserting the empty string against nothing.
    const root = getComputedStyle(document.documentElement)
    expect(root.getPropertyValue('--radius-card').trim()).toBe('18px')
    expect(root.getPropertyValue('--radius-pill').trim()).toBe('99px')
    expect(CSS).toMatch(/--radius-xl:\s*var\(--radius-card\)/)
    expect(CSS).not.toMatch(/--radius-xl:\s*var\(--radius-pill\)/)
  })
})

describe('R5 — the touch targets and focus ring reach real elements', () => {
  it('the primary CTA computes a 60px floor', () => {
    cleanup()
    render(<App />)
    const cta = screen.getByRole('button', { name: /start/i })
    // Asserted on the element, not on the file: this fails if the class stops
    // being applied or another rule wins.
    expect(resolved(cta, 'min-height')).toBe('60px')
  })

  it('country options compute a 56px floor', () => {
    cleanup()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    const option = screen.getByRole('button', { name: /United Kingdom/ })
    expect(resolved(option, 'min-height')).toBe('56px')
  })

  it('the tertiary action computes a 48px floor', () => {
    cleanup()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    fireEvent.click(screen.getByRole('button', { name: /United Kingdom/ }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.change(screen.getByLabelText('Your job title'), { target: { value: 'bookkeeper' } })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    const skip = screen.getByRole('button', { name: /skip/i })
    expect(resolved(skip, 'min-height')).toBe('48px')
  })

  it('no interactive element anywhere in the wizard is missing a floor', () => {
    // The first version of this was the inverse of its own rule. `resolved()`
    // returns '' when nothing declares min-height, and the filter said
    // `mh && ...`, so the empty string short-circuited and `auto` failed
    // `endsWith('px')`. The one case it existed to catch — a new interactive
    // element reaching no `.wz-*` rule and carrying no floor at all — passed
    // silently. Only an element that declared a floor AND declared it too small
    // could trip it.
    //
    // A missing declaration is now a failure, not a skip. It also walks all
    // five screens rather than the intro, which had exactly one button.
    const offenders = []
    // Counted PER SWEEP, not across all five. A single total against a
    // threshold of 200 was satisfied by the country screen alone — it renders
    // 218 options — so every later screen contributed nothing the assertion
    // could see, and a ResultScreen rendering no interactive element at all
    // would have passed with offenders [] and visited 219.
    //
    // Third time in three rounds I have written a guard that cannot fail for
    // the case it names. The pattern each time: assert a total where the thing
    // that can break is a part.
    const sweep = (where) => {
      let seen = 0
      for (const el of document.querySelectorAll('button, input, a[href], [tabindex]')) {
        seen += 1
        const mh = resolved(el, 'min-height')
        const label = `${where}: ${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').slice(0, 28)}"`
        if (!mh || mh === 'auto' || mh === '0px') offenders.push([label, 'no floor declared'])
        else if (mh.endsWith('px') && parseFloat(mh) < 48) offenders.push([label, mh])
      }
      expect(seen, `${where} rendered no interactive elements`).toBeGreaterThan(0)
    }

    cleanup(); render(<App />)
    sweep('intro')
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    sweep('country')
    fireEvent.click(screen.getByRole('button', { name: /United Kingdom/ }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    sweep('occupation')
    fireEvent.change(screen.getByLabelText('Your job title'), { target: { value: 'bookkeeper' } })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    sweep('optional')
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    sweep('result')

    expect(offenders).toEqual([])
  })

  it('a band chip computes the 56px option floor, not the 48px tertiary one', async () => {
    // A grep for the declaration could not see this: `.wz-chip` and an unscoped
    // `[data-slot="toggle-group-item"]` are both (0,1,0), so source order gave
    // every band chip the tertiary floor while the rule above it said option.
    // Resolved off the rendered element, which is the whole point of this file.
    cleanup()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    fireEvent.click(screen.getByRole('button', { name: /United Kingdom/ }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.change(screen.getByLabelText('Your job title'), { target: { value: 'bookkeeper' } })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    // The chips only exist once the per-country cross-tab resolves (R20), so
    // this waits rather than asserting on the "Loading…" state. Without the
    // wait the querySelectorAll returned nothing and the loop passed vacuously
    // — caught by the length guard, which is why it is there.
    await waitFor(() => {
      expect(document.querySelectorAll('[data-slot="toggle-group-item"]').length)
        .toBeGreaterThan(0)
    })
    const chips = [...document.querySelectorAll('[data-slot="toggle-group-item"]')]
    for (const chip of chips) expect(resolved(chip, 'min-height')).toBe('56px')
  })

  it('the column is capped at 480px and the tokens carry the canvas values', () => {
    const root = getComputedStyle(document.documentElement)
    expect(root.getPropertyValue('--column').trim()).toBe('480px')
    expect(root.getPropertyValue('--tap-primary').trim()).toBe('60px')
    expect(root.getPropertyValue('--tap-option').trim()).toBe('56px')
    expect(root.getPropertyValue('--tap-tertiary').trim()).toBe('48px')
  })
})
