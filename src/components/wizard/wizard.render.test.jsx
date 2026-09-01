// R5, R14, R20 — the screens actually render, and the wizard walks.
//
// `CLAUDE.md` is explicit that a clean build is not evidence the page renders:
// a runtime error builds fine. These tests mount the real shell against the
// real payload and walk it end to end, which is the cheapest thing that would
// have caught a crash.
//
// This does NOT close R4 or R5's computed-style criteria. jsdom does not do
// layout, so `min-height` and the focus ring still need a browser and stay in
// the spec's Verification section. What it does close is "does it render at
// all", and it lets R14's intro-copy rule and R20's fetch-ordering rule be
// asserted rather than eyeballed.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

import App from '@/App'
import * as crossTabs from '@/utils/crossTabs'

beforeEach(() => {
  cleanup()
  crossTabs._resetCache()
})

function startWizard() {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /start/i }))
}

// 0011 R1/R9 — step 01 is a search now, so reaching a country means typing at
// it. The options carry role="option" rather than the implicit button role,
// which is why every call site below moved off getByRole('button').
function pickCountry(name) {
  fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: name } })
  fireEvent.click(screen.getByRole('option', { name: new RegExp(name) }))
}

describe('R5 — the shell renders and walks all five screens', () => {
  it('opens on the intro without throwing', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /start/i })).toBeTruthy()
    expect(document.body.textContent).toContain('The Replacement Date')
  })

  it('advances intro → country → occupation → optional → result', async () => {
    startWizard()
    expect(screen.getByText('Where do you work?')).toBeTruthy()

    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByText('What do you do?')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Your job title'), {
      target: { value: 'bookkeeper' },
    })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
    expect(document.body.textContent).toContain('Clerical support workers')

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(screen.getByText('Two more, if you like.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /see the figures/i }))
    await waitFor(() =>
      expect(document.body.textContent).toContain("of United Kingdom's workers"),
    )
  })

  // The chips the canvas puts under the headline are gone (R5, revised
  // 2026-09-01). Asserted on the rendered tree rather than on the source,
  // because the previous round of this spec produced five guards that could not
  // fail for the case they named — a source sweep does not see inline JSX.
  it('the intro carries the claim and one CTA, and no capability chips', () => {
    render(<App />)
    const text = document.body.textContent
    expect(text).toContain('Measured, not forecast')
    expect(screen.getByRole('button', { name: /start/i })).toBeTruthy()

    for (const chip of ['9 occupation groups', 'Every figure tiered', 'Gaps shown as gaps']) {
      expect(text).not.toContain(chip)
    }
    expect(document.querySelectorAll('.wz-chip').length).toBe(0)
  })

  it('shows the step counter and fills the progress bar', () => {
    render(<App />)
    expect(document.body.textContent).toContain('01/04')
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(document.body.textContent).toContain('01/04')
  })
})

describe('R14 — no year reaches the screen, in words or digits', () => {
  it('the intro claim promises no year, date or countdown', () => {
    render(<App />)
    const text = document.body.textContent
    expect(text).not.toMatch(/\b20(2[89]|[3-7][0-9])\b/)
    expect(text.toLowerCase()).not.toMatch(/countdown|how long you have|years? until/)
    // The claim it does make.
    expect(text).toContain('Measured, not forecast')
  })

  it('the result screen states that no displacement date is published', async () => {
    startWizard()
    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.change(screen.getByLabelText('Your job title'), { target: { value: 'bookkeeper' } })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))

    await waitFor(() =>
      expect(document.body.textContent).toContain('No displacement date is published'),
    )
    // No interval band, no adoption slider, no scenario control.
    expect(screen.queryByRole('slider')).toBeNull()
    expect(document.body.textContent.toLowerCase()).not.toContain('adoption')
  })

  it('renders the figures it does have, so the screen reads as finished', async () => {
    startWizard()
    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.change(screen.getByLabelText('Your job title'), { target: { value: 'bookkeeper' } })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))

    await waitFor(() => {
      const t = document.body.textContent
      expect(t).toContain('8.9%')      // R10, with its tier and vintage
      expect(t).toContain('2.99M')     // R11, derived
      expect(t).toContain('Share since 2013')  // R12
    })
  })

  it('every figure on the result screen carries a tier badge', async () => {
    // The census, replacing what the merge deleted with field-tiers.test.mjs.
    //
    // This exists because `toContain('DERIVED')` did not: one badge anywhere on
    // the screen satisfied it, so it was green on every SHA where the age and
    // education figures carried no tier at all. The check that was supposed to
    // cover this is the check that watched the defect ship.
    //
    // What this DOES carry: a dropped badge fails, which is the direction the
    // defect took. What it does not: a badge rendered beside an absent figure
    // still counts as one of the five. The JSX makes that hard to produce —
    // every badge sits inside the conditional that renders its own figure — so
    // the claim is trimmed rather than an assertion added for it.
    //
    // The 5 depends on Radix unmounting both AccordionContent bodies while
    // collapsed: `terms.map` renders a wz-badge per term carrying `t.tier`,
    // which matches the same regex. Correct today. If either panel ever
    // defaults to open, this fails for a reason with nothing to do with tier
    // badges — so read this note before debugging the number.
    startWizard()
    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.change(screen.getByLabelText('Your job title'), { target: { value: 'bookkeeper' } })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    // Pick a band on each dimension so the cross-tab figures render — they are
    // the two that shipped without a tier, so a census that skips them is the
    // old assertion with more steps.
    await waitFor(() =>
      expect(document.querySelectorAll('[data-slot="toggle-group-item"]').length)
        .toBeGreaterThan(0))
    const chips = screen.getAllByRole('radio')
    fireEvent.click(chips[0])
    fireEvent.click(chips[chips.length - 1])
    fireEvent.click(screen.getByRole('button', { name: /see the figures/i }))

    await waitFor(() => {
      const tiers = screen.getAllByText(/^(OFFICIAL|DERIVED|PROXY|MODELED)$/)
      // share, headcount, age, education, trend
      expect(tiers).toHaveLength(5)
    })
  })
})

describe('R20 — the cross-tabs are not fetched before a country is chosen', () => {
  it('the intro screen renders without loading any artefact', () => {
    const spy = vi.spyOn(crossTabs, 'loadCrossTabs')
    render(<App />)
    // The shell prefills from locale; under jsdom navigator.language is en-US,
    // which does not resolve to a payload country by name, so nothing loads.
    expect(screen.getByRole('button', { name: /start/i })).toBeTruthy()
    spy.mockRestore()
  })

  it('a failed load renders "could not load", never a source absence', async () => {
    vi.spyOn(crossTabs, 'loadCrossTabs').mockResolvedValue({
      state: 'load_failed', data: null,
    })
    startWizard()
    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.change(screen.getByLabelText('Your job title'), { target: { value: 'bookkeeper' } })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() =>
      expect(document.body.textContent).toContain('Could not load'),
    )
    // The distinction R20 exists for: a fetch failure must never be reported as
    // the source not publishing something the source does publish.
    expect(document.body.textContent).not.toContain('does not publish')
    vi.restoreAllMocks()
  })
})

describe('R3 — every installed component is actually rendered', () => {
  // The defect this guards hid for several rounds: six shadcn components were
  // installed, R4's "restyle by extending the cva variants" was written against
  // them, and nothing outside src/components/ui/ ever imported one. A CSS rule
  // targeting their data-slots applied to nothing, and R3 looked satisfied
  // because the files existed.
  //
  // `CLAUDE.md`: "Add only what a screen uses. `npx shadcn@latest add <x>` when
  // a requirement needs `<x>`, never a speculative batch." An installed
  // component nobody renders is that batch, arriving one file at a time.
  it('no component sits in src/components/ui unused', () => {
    const files = Object.keys(
      import.meta.glob('@/components/ui/*.jsx', { eager: true }),
    ).map((p) => p.split('/').pop().replace('.jsx', ''))
    expect(files.length).toBeGreaterThan(0)

    // Every component file outside ui/ itself, not just the wizard directory:
    // Sparkline.jsx and any future sibling can import a ui component, and
    // scanning only wizard/ would report that as unused. It fails safe, but a
    // guard that cries wolf gets disabled.
    const consumers = Object.entries(
      import.meta.glob(['@/components/**/*.jsx', '@/*.jsx'], {
        eager: true, query: '?raw', import: 'default',
      }),
    ).filter(([p]) => !p.includes('/components/ui/'))
      .map(([, src]) => src).join('\n')

    // Match the whole specifier, not a substring. `components/ui/toggle` is a
    // substring of `components/ui/toggle-group`, so the prefix version reported
    // `toggle` as used purely because toggle-group is imported — which meant the
    // exemption below did nothing and a future `card` beside a `card-header`
    // would slip through the same way.
    const imported = (f) => new RegExp(`components/ui/${f}['"\`]`).test(consumers)

    // `toggle` is exempt on its merits: toggle-group imports it internally, so
    // it is a dependency of a rendered component rather than an unrendered one.
    const unused = files.filter((f) => f !== 'toggle').filter((f) => !imported(f))
    expect(unused).toEqual([])

    // And the exemption is real rather than incidental: toggle genuinely is not
    // imported by any screen, which is why it needs exempting at all.
    expect(imported('toggle')).toBe(false)
  })
})

describe('R7 — an unresolvable title is said out loud', () => {
  it('shows "not resolved" and pre-selects nothing', () => {
    startWizard()
    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.change(screen.getByLabelText('Your job title'), { target: { value: 'zzzz' } })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))

    expect(document.body.textContent).toContain('Not resolved')
    // queryAllByRole, not getAllByRole: the latter throws when nothing matches,
    // which is the case this test exists to assert.
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })
})


// ------------------------------------------------------------ spec 0011
//
// Step 01 as a search. The pure functions are covered in `wizard.test.js`;
// what is here is what only a rendered tree can show — that the absence is
// text rather than a control, that the keyboard reaches the list, and that the
// screen no longer carries the vocabulary it stopped earning.
describe('0011 R1 + R10 — the list is the 177, and says what it is', () => {
  it('renders one option per listed country and no per-row tag', () => {
    startWizard()
    expect(document.querySelectorAll('[role=option]').length).toBe(177)
    expect(document.body.textContent).not.toContain('official series')
    expect(document.body.textContent).not.toContain('no series')
  })

  it('states what the list is, with its count and its source', () => {
    startWizard()
    const text = document.body.textContent
    expect(text).toContain('177')
    expect(text).toContain('ILOSTAT')
  })
})

describe('0011 R6 — a dropped country is named, as text not as a control', () => {
  it('china offers the three with a series and states the one without', () => {
    startWizard()
    fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: 'china' } })

    const options = [...document.querySelectorAll('[role=option]')]
    expect(options.length).toBe(3)
    expect(options.map((o) => o.textContent)).toEqual([
      'Hong Kong SAR, China', 'Macao SAR, China', 'Taiwan, China',
    ])

    // The statement is on the page...
    expect(document.body.textContent).toContain(
      'China is in the dataset but reports no occupation breakdown',
    )
    // ...and not inside anything a reader can pick or tab to.
    for (const o of options) expect(o.textContent).not.toContain('is in the dataset')
    expect(screen.queryByRole('option', { name: /^China$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /is in the dataset/ })).toBeNull()
  })

  it('a query matching nothing at all names no country', () => {
    startWizard()
    fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: 'zzzz' } })
    expect(document.querySelectorAll('[role=option]').length).toBe(0)
    expect(document.body.textContent).toContain('No country matches that')
    expect(document.body.textContent).not.toContain('is in the dataset')
  })
})

describe('0011 R9 — the search is operable by keyboard', () => {
  it('arrow down then enter selects the first match', () => {
    startWizard()
    const input = screen.getByLabelText('Search countries')
    fireEvent.change(input, { target: { value: 'united kingdom' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByRole('option', { name: /United Kingdom/ }).getAttribute('aria-selected'))
      .toBe('true')
    expect(screen.getByRole('button', { name: /continue/i }).disabled).toBe(false)
  })

  it('escape clears the query and restores the whole list', () => {
    startWizard()
    const input = screen.getByLabelText('Search countries')
    fireEvent.change(input, { target: { value: 'zzzz' } })
    expect(document.querySelectorAll('[role=option]').length).toBe(0)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(document.querySelectorAll('[role=option]').length).toBe(177)
  })

  it('announces the match count politely', () => {
    startWizard()
    const live = document.querySelector('[aria-live=polite]')
    expect(live.textContent).toContain('177 of 177')
    fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: 'china' } })
    expect(live.textContent).toContain('3 of 177')
  })

  it('carries combobox semantics that point at the list', () => {
    startWizard()
    const input = screen.getByRole('combobox')
    const list = document.getElementById(input.getAttribute('aria-controls'))
    expect(list.getAttribute('role')).toBe('listbox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(document.getElementById(input.getAttribute('aria-activedescendant')))
      .toBeTruthy()
  })
})

describe('0011 R5 — a locale we cannot serve is named on arrival', () => {
  // `language` lives on Navigator.prototype, so there is no own descriptor to
  // put back — deleting the own property re-exposes the prototype getter.
  const stubLocale = (value) => {
    Object.defineProperty(globalThis.navigator, 'language', { value, configurable: true })
    return () => { delete globalThis.navigator.language }
  }

  it('names China and pre-selects nothing for zh-CN', () => {
    const restore = stubLocale('zh-CN')
    try {
      startWizard()
      expect(document.body.textContent).toContain(
        'China reports no occupation breakdown to ILOSTAT',
      )
      expect(document.querySelector('[role=option][aria-selected=true]')).toBeNull()
      expect(screen.getByRole('button', { name: /continue/i }).disabled).toBe(true)
    } finally {
      restore()
    }
  })

  it('pre-selects the country when the locale resolves to one with a series', () => {
    const restore = stubLocale('ko-KR')
    try {
      startWizard()
      expect(screen.getByRole('option', { name: /Korea, Rep\./ }).getAttribute('aria-selected'))
        .toBe('true')
      expect(document.body.textContent).not.toContain('reports no occupation breakdown to ILOSTAT')
    } finally {
      restore()
    }
  })
})

describe('0011 R8 — the search cost no dependency and no fourth ui file', () => {
  it('adds neither cmdk nor a dialog primitive', async () => {
    const pkg = (await import('../../../package.json')).default
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const name of ['cmdk', '@radix-ui/react-dialog']) {
      expect(deps[name]).toBeUndefined()
    }
  })

  it('leaves src/components/ui at the three files it already held', () => {
    const files = Object.keys(import.meta.glob('@/components/ui/*.jsx'))
      .map((p) => p.split('/').pop().replace('.jsx', ''))
      .sort()
    expect(files).toEqual(['accordion', 'toggle', 'toggle-group'])
  })
})
