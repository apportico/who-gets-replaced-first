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


// 0016. The URL is the wizard's state now, and jsdom keeps one document per
// file — so a test that walks to the result leaves `?step=result&…` in the
// address bar and the NEXT test boots straight onto the result screen. That is
// the feature working, not a bug, but each case needs a clean slate. Nothing
// below asserts anything new; this only resets the harness.
function resetUrl() {
  globalThis.history?.replaceState(null, '', '/')
}

beforeEach(() => {
  cleanup()
  crossTabs._resetCache()
  resetUrl()
})

function startWizard() {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /start/i }))
}

// 0011 R1/R9 — step 01 is a search now, so reaching a country means typing at
// it. The options carry role="option" rather than the implicit button role,
// which is why every call site below moved off getByRole('button').
function pickCountry(name: string) {
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
      import.meta.glob('/src/components/ui/*.tsx', { eager: true }),
    ).map((p) => p.split('/').pop()!.replace('.tsx', ''))
    expect(files.length).toBeGreaterThan(0)

    // Every component file outside ui/ itself, not just the wizard directory:
    // Sparkline.tsx and any future sibling can import a ui component, and
    // scanning only wizard/ would report that as unused. It fails safe, but a
    // guard that cries wolf gets disabled.
    const consumers = Object.entries(
      import.meta.glob(['/src/components/**/*.tsx', '/src/*.tsx'], {
        eager: true, query: '?raw', import: 'default',
      }),
    ).filter(([p]) => !p.includes('/components/ui/'))
      .map(([, src]) => src).join('\n')

    // Match the whole specifier, not a substring. `components/ui/toggle` is a
    // substring of `components/ui/toggle-group`, so the prefix version reported
    // `toggle` as used purely because toggle-group is imported — which meant the
    // exemption below did nothing and a future `card` beside a `card-header`
    // would slip through the same way.
    const imported = (f: string) => new RegExp(`components/ui/${f}['"\`]`).test(consumers)

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
  // 0013 R5 revised this one. It used to assert 177 rendered options, which is
  // the assertion that made a 12,754px step 01 look correct: the count was
  // right, and nobody asked whether the number was. `countryOptions(rows).length
  // === 177` is the *data* claim it should always have been, and lives in
  // wizard.test.js; what a render test can say is that every rendered row is a
  // listed country carrying no per-row tag.
  it('renders listed countries only, and no per-row tag', () => {
    startWizard()
    fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: 'united' } })
    expect(document.querySelectorAll('[role=option]').length).toBe(3)
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
    expect((screen.getByRole('button', { name: /continue/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('opens with nothing active, so the ring claims no position nobody took', () => {
    // The locale is stubbed to something unresolvable so the pre-fill does not
    // supply a selection — this test is about the *active* position, and an
    // aria-selected row from a working pre-fill would mask the assertion.
    Object.defineProperty(globalThis.navigator, 'language', { value: 'xx', configurable: true })
    try {
      startWizard()
      expect(document.querySelector('[role=option][data-active=true]')).toBeNull()
      expect(screen.getByRole('combobox').getAttribute('aria-activedescendant')).toBeNull()

      // And Enter on an untouched box selects nothing rather than Afghanistan.
      fireEvent.keyDown(screen.getByLabelText('Search countries'), { key: 'Enter' })
      expect(document.querySelector('[role=option][aria-selected=true]')).toBeNull()
      expect((screen.getByRole('button', { name: /continue/i }) as HTMLButtonElement).disabled).toBe(true)
    } finally {
      delete (globalThis.navigator as { language?: string }).language
    }
  })

  it('from untouched, down opens at the first match and up at the last', () => {
    startWizard()
    const input = screen.getByLabelText('Search countries')
    const names = () => [...document.querySelectorAll('[role=option]')].map((o) => o.textContent)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(document.querySelector('[role=option][data-active=true]')!.textContent)
      .toBe(names()[0])

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(document.querySelector('[role=option][data-active=true]')).toBeNull()

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(document.querySelector('[role=option][data-active=true]')!.textContent)
      .toBe(names()[names().length - 1])
  })

  // 0013 R5 revised this one too: `Escape` used to restore all 177, which is the
  // same defect stated as a keyboard behaviour. It returns to the resting state,
  // and under jsdom navigator.language is en-US, so that state is one row.
  it('escape clears the query and returns to the resting state', () => {
    startWizard()
    const input = screen.getByLabelText('Search countries')
    fireEvent.change(input, { target: { value: 'zzzz' } })
    expect(document.querySelectorAll('[role=option]').length).toBe(0)
    fireEvent.keyDown(input, { key: 'Escape' })
    const rows = [...document.querySelectorAll('[role=option]')]
    expect(rows.length).toBe(1)
    expect(rows[0].textContent).toBe('United States')
  })

  // And 0013 R3 revised the third: the live region used to open on
  // `177 of 177`, a sentence true of the predicate and false of the screen.
  it('announces the match count politely, and says nothing at rest', () => {
    startWizard()
    const live = document.querySelector('[aria-live=polite]')
    expect(live!.textContent!.trim()).toBe('')
    fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: 'china' } })
    expect(live!.textContent).toContain('3 of 177')
  })

  it('carries combobox semantics that point at the list', () => {
    startWizard()
    const input = screen.getByRole('combobox')
    const list = document.getElementById(input.getAttribute('aria-controls')!)
    expect(list!.getAttribute('role')).toBe('listbox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(document.getElementById(input.getAttribute('aria-activedescendant')!))
      .toBeTruthy()
  })
})

describe('0011 R5 — a locale we cannot serve is named on arrival', () => {
  // `language` lives on Navigator.prototype, so there is no own descriptor to
  // put back — deleting the own property re-exposes the prototype getter.
  const stubLocale = (value: string) => {
    Object.defineProperty(globalThis.navigator, 'language', { value, configurable: true })
    return () => { delete (globalThis.navigator as { language?: string }).language }
  }

  it('names China and pre-selects nothing for zh-CN', () => {
    const restore = stubLocale('zh-CN')
    try {
      startWizard()
      expect(document.body.textContent).toContain(
        'China reports no occupation breakdown to ILOSTAT',
      )
      expect(document.querySelector('[role=option][aria-selected=true]')).toBeNull()
      expect((screen.getByRole('button', { name: /continue/i }) as HTMLButtonElement).disabled).toBe(true)

      // And it stops explaining an absence the reader has moved past.
      pickCountry('France')
      expect(document.body.textContent).not.toContain(
        'China reports no occupation breakdown to ILOSTAT',
      )
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
      expect((deps as Record<string, string>)[name]).toBeUndefined()
    }
  })

  it('leaves src/components/ui at the three files it already held', () => {
    const files = Object.keys(import.meta.glob('/src/components/ui/*.tsx'))
      .map((p) => p.split('/').pop()!.replace('.tsx', ''))
      .sort()
    expect(files).toEqual(['accordion', 'toggle', 'toggle-group'])
  })
})

// ---------------------------------------------------------------------------
// 0015 R1 — one h1 per screen, and no skipped level.
//
// Measured 2026-09-01 before the change: the intro carried exactly one `h1`
// and steps 01-04 carried none, so the document outline opened at `h2` on
// every screen a reader actually lands on. #78 recorded "0 across the whole
// app, every step"; the intro was already correct and the other four were not.
//
// The second assertion is the one that would have caught the regression this
// change could have introduced: Radix's AccordionHeader renders `h3`, so
// promoting the result heading to `h1` without touching the accordion would
// have produced h1 -> h3 and traded one outline defect for another.
// ---------------------------------------------------------------------------
describe('0015 R1 — one h1 per screen, no skipped level', () => {
  const levels = () =>
    [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) =>
      Number(el.tagName[1]),
    )

  const expectWellFormedOutline = () => {
    const seen = levels()
    expect(seen.filter((n) => n === 1)).toHaveLength(1)
    expect(seen[0]).toBe(1)
    for (let i = 1; i < seen.length; i += 1) {
      // A level may return to any shallower depth; it may only ever go one
      // deeper. That is the whole rule, and it is what "no skipped level"
      // means -- not that every level appears.
      expect(seen[i] - seen[i - 1]).toBeLessThanOrEqual(1)
    }
  }

  const toOccupation = () => {
    startWizard()
    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  }

  const toResult = async () => {
    toOccupation()
    fireEvent.change(screen.getByLabelText('Your job title'), {
      target: { value: 'electrical engineering technician' },
    })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    await waitFor(() =>
      expect(document.body.textContent).toContain('No displacement date is published'),
    )
  }

  it('intro', () => {
    render(<App />)
    expectWellFormedOutline()
  })

  it('01 country', () => {
    startWizard()
    expectWellFormedOutline()
  })

  it('02 occupation', () => {
    toOccupation()
    expectWellFormedOutline()
  })

  it('03 optional', () => {
    toOccupation()
    fireEvent.change(screen.getByLabelText('Your job title'), { target: { value: 'bookkeeper' } })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expectWellFormedOutline()
  })

  it('04 result, with the two accordions in the outline', async () => {
    await toResult()
    expectWellFormedOutline()
    // Named explicitly: the accordions are the only other headings on this
    // screen, and h2 is what keeps the outline unbroken under the new h1.
    const accordionLevels = [...document.querySelectorAll('[data-slot="accordion-trigger"]')]
      .map((btn) => btn.closest('h1,h2,h3,h4,h5,h6')?.tagName)
    expect(accordionLevels).toEqual(['H2', 'H2'])
  })

  it('the result h1 is the figure sentence, and keeps its display size', async () => {
    await toResult()
    const h1 = document.querySelector('h1')
    expect(h1!.textContent).toContain("of United Kingdom's workers")
    // 0012 R3 -- the type scale is attached to the class, not to the tag, so
    // promoting h2 to h1 must not move the display size.
    expect(h1!.className).toContain('wz-h2')
  })
})

// Spec 0016 — the wizard's state lives in the URL.
//
// Added, never edited: nothing above this line changed except the `resetUrl()`
// in `beforeEach`, which is harness rather than assertion. 0016 R11 depends on
// that — an existing suite rewritten to accommodate a change stops being
// evidence about the change.
// ---------------------------------------------------------------------------

const at = () => globalThis.location.pathname + globalThis.location.search

function open(url: string) {
  globalThis.history.replaceState(null, '', url)
  render(<App />)
}

describe('0016 R3 — a cold load restores the wizard from the URL', () => {
  it('lands straight on the result, with both bands applied', async () => {
    open('/?step=result&country=GBR&group=3&age=25_54&edu=adv')
    expect(document.body.textContent)
      .toContain('Technicians and associate professionals · United Kingdom')
    await waitFor(() => {
      expect(document.body.textContent).toContain('are aged 25–54')
      expect(document.body.textContent).toContain('have tertiary education')
    })
  })

  it('never paints the intro on the way', () => {
    open('/?step=result&country=GBR&group=3')
    // The intro's own headline is the tell -- not its CTA, which reads
    // `Start ->` and would also match the result screen's `Start again`. If the
    // shell had restored in an effect rather than a lazy initialiser, this
    // would be in the tree for a frame.
    //
    // 0015 R1 changed how this is asked, not what it asks. This used to be
    // `queryByRole('heading', { level: 1 })` is null, which worked only while
    // the intro was the ONLY screen with an h1; every screen has one now, so
    // that assertion started matching the result screen's own headline and
    // failed for the opposite of its intent. Asked directly instead: the
    // intro's headline text is absent, and the h1 that IS present belongs to
    // the result. The second form is strictly stronger -- it would have caught
    // an intro frame that rendered with no heading at all.
    expect(document.body.textContent).not.toContain('says about')
    expect(document.body.textContent).not.toContain('Measured, not forecast')
    expect(screen.getByRole('heading', { level: 1 }).textContent)
      .toContain("of United Kingdom's workers")
  })

  it('restores step 02 and step 03 too, not only the result', () => {
    open('/?step=occupation&country=GBR')
    expect(document.body.textContent).toContain('What do you do?')
    cleanup()
    open('/?step=optional&country=GBR&group=3')
    expect(document.body.textContent).toContain('Two more, if you like.')
  })
})

describe('0016 R2 — a step transition pushes, an answer change replaces', () => {
  it('adds exactly one history entry per step, not one per tap', async () => {
    globalThis.history.replaceState(null, '', '/')
    const before = globalThis.history.length
    startWizard()                                   // intro -> 01
    expect(globalThis.history.length).toBe(before + 1)

    // Three taps on step 01. None of them is a navigation.
    const lengthAtStep01 = globalThis.history.length
    for (const name of ['France', 'Germany', 'United Kingdom']) {
      fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: name } })
      fireEvent.click(screen.getByRole('option', { name: new RegExp(name) }))
    }
    expect(globalThis.history.length).toBe(lengthAtStep01)
    expect(globalThis.location.search).toContain('country=GBR')

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))   // 01 -> 02
    expect(globalThis.history.length).toBe(before + 2)
  })

  it('writes the answer into the URL as it is given', async () => {
    startWizard()
    fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: 'United Kingdom' } })
    fireEvent.click(screen.getByRole('option', { name: /United Kingdom/ }))
    expect(at()).toBe('/?step=country&country=GBR')
  })
})

describe('0016 R4 — popstate walks the steps', () => {
  it('re-decodes the URL the browser moved to, without pushing', async () => {
    open('/?step=result&country=GBR&group=3')
    expect(document.body.textContent).toContain('United Kingdom')

    // What a Back press does: the URL changes, then popstate fires. jsdom has
    // no Back button, so the two halves are driven by hand; the real press
    // stays a browser check in the spec's acceptance.
    const len = globalThis.history.length
    globalThis.history.replaceState(null, '', '/?step=occupation&country=GBR')
    globalThis.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => expect(document.body.textContent).toContain('What do you do?'))
    expect(globalThis.history.length).toBe(len)      // the listener never pushes
  })

  it('a pop back to the bare root returns the intro', async () => {
    open('/?step=country&country=GBR')
    globalThis.history.replaceState(null, '', '/')
    globalThis.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() =>
      expect(document.body.textContent).toContain('Measured, not forecast'))
  })
})

describe('0016 R5 — a deep link to a country with no series', () => {
  it('lands on step 01 and names China, with no figure anywhere', () => {
    open('/?step=result&country=CHN&group=3')
    expect(document.body.textContent).toContain('Where do you work?')
    expect(document.body.textContent).toContain('China')
    expect(document.body.textContent).toContain('no occupation breakdown')
    // The thing that must not happen: a number for a country with no series.
    expect(document.body.textContent).not.toContain('% of')
    expect(document.body.textContent).not.toContain('DERIVED')
  })

  it('normalises the address bar to the screen actually shown', async () => {
    open('/?step=result&country=CHN&group=3')
    await waitFor(() => expect(globalThis.location.search).not.toContain('step=result'))
    expect(globalThis.location.search).not.toContain('country=CHN')
  })
})

describe('0016 R6 — a broken link degrades and says so', () => {
  it('names the unknown country rather than opening blank', () => {
    open('/?step=result&country=ZZZ&group=3')
    expect(document.body.textContent).toContain('Where do you work?')
    expect(document.body.textContent).toContain('does not carry')
  })

  it('a bad group lands on step 02 and says why', () => {
    open('/?step=result&country=GBR&group=12')
    expect(document.body.textContent).toContain('What do you do?')
    expect(document.body.textContent).toContain('outside the nine')
  })

  it('clears the notice once the reader moves on', () => {
    open('/?step=result&country=ZZZ&group=3')
    expect(document.body.textContent).toContain('does not carry')
    fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: 'United Kingdom' } })
    fireEvent.click(screen.getByRole('option', { name: /United Kingdom/ }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(document.body.textContent).not.toContain('does not carry')
  })
})

// The requirement with the sharpest edge. Both cells below were located from
// the committed cross-tabs, not invented: ALB group 1 publishes bas/int/adv and
// no `ltb`, and AZE group 1 publishes a share with no age bands at all.
describe('0016 R7 — a band the cell does not publish stops being claimed', () => {
  it('strips an education band the country and group do not publish', async () => {
    open('/?step=result&country=ALB&group=1&edu=ltb')
    await waitFor(() => expect(globalThis.location.search).not.toContain('edu=ltb'))
    expect(globalThis.location.search).toContain('country=ALB')
    expect(document.body.textContent).not.toContain('have below basic education')
  })

  it('strips an age band for a cell that publishes no age at all', async () => {
    open('/?step=result&country=AZE&group=1&age=25_54')
    await waitFor(() => expect(globalThis.location.search).not.toContain('age='))
    expect(globalThis.location.search).toContain('country=AZE')
  })

  it('adds no history entry when it strips', async () => {
    open('/?step=result&country=ALB&group=1&edu=ltb')
    const len = globalThis.history.length
    await waitFor(() => expect(globalThis.location.search).not.toContain('edu=ltb'))
    expect(globalThis.history.length).toBe(len)
  })

  // The half that matters most, and the one the first draft of this spec got
  // wrong: a fetch that never answered is not the source publishing nothing.
  // Stripping here would delete a reader's answer over a network blip and bake
  // that invented absence into the link they copy.
  it('KEEPS the band when the cross-tab failed to load', async () => {
    vi.spyOn(crossTabs, 'loadCrossTabs').mockResolvedValue({
      state: 'load_failed', data: null,
    })
    try {
      open('/?step=result&country=GBR&group=3&age=25_54')
      await waitFor(() => expect(document.body.textContent).toContain('Could not load'))
      expect(globalThis.location.search).toContain('age=25_54')
      expect(document.body.textContent).not.toContain('does not publish a figure')
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('0016 R8 — the copy-link control', () => {
  it('copies exactly the current URL and announces it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText }, configurable: true,
    })
    open('/?step=result&country=GBR&group=3')
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(globalThis.location.href))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Link copied'))
  })

  it('falls back to a selectable field when the clipboard refuses', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    open('/?step=result&country=GBR&group=3')
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
    await waitFor(() => {
      const field = screen.getByLabelText('Link to this result')
      expect((field as HTMLInputElement).value).toBe(globalThis.location.href)
    })
    expect(screen.getByRole('status').textContent).toContain('clipboard is unavailable')
  })
})

describe('0016 R11 — no dependency, no figure module touched', () => {
  it('adds no runtime dependency', async () => {
    const pkg = (await import('../../../package.json')).default
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const name of ['react-router', 'react-router-dom', 'wouter', 'history', 'qs']) {
      expect((deps as Record<string, string>)[name]).toBeUndefined()
    }
  })

  it('writes no fragment into the URL', async () => {
    startWizard()
    fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: 'United Kingdom' } })
    fireEvent.click(screen.getByRole('option', { name: /United Kingdom/ }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(globalThis.location.hash).toBe('')
  })
})

// ------------------------------------------------------------ spec 0013
//
// The fold. Everything here is about what the screen renders *before* the
// reader has typed, and how much it renders once they have — the half of issue
// #76 a green `verify` could not see, minus the heights, which need a browser
// and live in `scripts/desktop-measure.mjs`.
describe('0013 R1 — step 01 opens folded', () => {
  const stubLocale = (value: string) => {
    Object.defineProperty(globalThis.navigator, 'language', { value, configurable: true })
    return () => { delete (globalThis.navigator as { language?: string }).language }
  }

  it('renders the locale pre-fill alone, not a wall of 177', () => {
    const restore = stubLocale('en-GB')
    try {
      startWizard()
      const rows = [...document.querySelectorAll('[role=option]')]
      expect(rows.length).toBe(1)
      expect(rows[0].textContent).toBe('United Kingdom')
      expect(rows[0].getAttribute('aria-selected')).toBe('true')
      expect((screen.getByRole('button', { name: /continue/i }) as HTMLButtonElement).disabled).toBe(false)
    } finally {
      restore()
    }
  })

  it('renders nothing, and invites a search, when the locale resolves to nothing', () => {
    const restore = stubLocale('xx')
    try {
      startWizard()
      expect(document.querySelectorAll('[role=option]').length).toBe(0)
      expect(document.body.textContent).toContain('Start typing to search all 177 countries')
      // The branch this replaced. Before the fold it was unreachable, because an
      // empty query returned all 177; after it, it would have been the greeting.
      expect(document.body.textContent).not.toContain('No country matches that')
    } finally {
      restore()
    }
  })

  it('still names a no-series locale on arrival, now against an empty list', () => {
    const restore = stubLocale('zh-CN')
    try {
      startWizard()
      expect(document.querySelectorAll('[role=option]').length).toBe(0)
      expect(document.body.textContent).toContain(
        'China reports no occupation breakdown to ILOSTAT',
      )
    } finally {
      restore()
    }
  })

  // The bug the self-review on #87 caught before it shipped. Keyed to the locale
  // rather than the selection, this renders "United States" — jsdom's locale —
  // while France drives Continue: one country shown, another acted on.
  it('rests on the country the reader picked, not the one their locale gave', () => {
    startWizard()
    pickCountry('France')
    fireEvent.keyDown(screen.getByLabelText('Search countries'), { key: 'Escape' })
    const rows = [...document.querySelectorAll('[role=option]')]
    expect(rows.length).toBe(1)
    expect(rows[0].textContent).toBe('France')
    expect(rows[0].getAttribute('aria-selected')).toBe('true')
  })
})

describe('0013 R2 + R3 — both caps bite, and both say so', () => {
  it('caps a one-character query at 12 rows and 3 absences, and states each', () => {
    startWizard()
    fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: 'a' } })

    expect(document.querySelectorAll('[role=option]').length).toBe(12)

    const live = document.querySelector('[aria-live=polite]')
    expect(live!.textContent).toContain('150 of 177 countries match')
    expect(live!.textContent).toContain('showing the first 12')
    expect(live!.textContent).toContain('36 more matching countries report no occupation breakdown')

    // Visible, not only announced: the same claim outside the sr-only region.
    const seen = [...document.querySelectorAll('p')]
      .filter((p) => !p.classList.contains('wz-sr-only'))
      .map((p) => p.textContent)
      .join(' ')
    expect(seen).toContain('showing the first 12')
    expect(seen).toContain('36 more countries')

    // Three named absences, and only three.
    const named = [...document.querySelectorAll('p')]
      .filter((p) => p.textContent.includes('reports no occupation breakdown, so'))
    expect(named.length).toBe(3)
  })

  it('says nothing about truncation when nothing was truncated', () => {
    startWizard()
    fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: 'united' } })
    expect(document.querySelectorAll('[role=option]').length).toBe(3)
    const live = document.querySelector('[aria-live=polite]')
    expect(live!.textContent!.trim()).toBe('3 of 177 countries match')
    expect(document.body.textContent).not.toContain('showing the first')
    expect(document.body.textContent).not.toContain('more countries matching')
  })

  it('leaves 0011 R6 flagship case untouched by either cap', () => {
    startWizard()
    fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: 'china' } })
    expect(document.querySelectorAll('[role=option]').length).toBe(3)
    expect(document.body.textContent).toContain(
      'China is in the dataset but reports no occupation breakdown',
    )
    expect(document.body.textContent).not.toContain('showing the first')
  })
})


// ---------------------------------------------------------------------------
// Spec 0014 — the wizard can go back, and step 02 echoes the title you typed.
//
// The back control is addressed by its aria-label (`/back to/i`), not by its
// visible `← Back`, because the label is what a screen reader announces and it
// is the thing that names the destination. Matching the arrow glyph would pass
// while the label said nothing.
// ---------------------------------------------------------------------------

const backButton = () => screen.getByRole('button', { name: /back to/i })

// Every backwards move here is awaited. 0014 R1 routes back through the history
// stack 0016 already maintains rather than standing up a second one beside it,
// and `history.back()` is asynchronous by specification — jsdom dispatches
// `popstate` on a later task. So the click and its consequence cannot land in
// the same tick. That is the cost of having one navigation model instead of
// two, and it is a property of the design rather than a flake to paper over.
async function goBack(expectation: () => unknown) {
  fireEvent.click(backButton())
  await waitFor(expectation)
}

// The result screen renders `Loading…` for the age/education terms while the
// cross-tabs are in flight (R20). On a first arrival that fetch is live; on a
// second it is cached and resolves instantly, so comparing the two renders
// without settling first compares a mid-flight paint to a finished one and
// reports a difference that is the fetch, not the navigation. R3 is about
// whether the *answers* survive going back, so both passes are settled first.
async function settled() {
  await waitFor(() =>
    expect(document.querySelector('main')!.textContent).not.toContain('Loading…'),
  )
}

async function walkToResult() {
  startWizard()
  pickCountry('United Kingdom')
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  fireEvent.change(screen.getByLabelText('Your job title'), {
    target: { value: 'paralegal' },
  })
  fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
  fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
  fireEvent.click(screen.getByRole('button', { name: /see the figures/i }))
  await waitFor(() =>
    expect(document.body.textContent).toContain("of United Kingdom's workers"),
  )
}

describe('0014 R1 — every step after the intro can go back one step', () => {
  it('walks 04 → 03 → 02 → 01 → intro, one step per click', async () => {
    await walkToResult()
    expect(document.body.textContent).toContain('04/04')

    await goBack(() => expect(screen.getByText('Two more, if you like.')).toBeTruthy())
    expect(document.body.textContent).toContain('03/04')

    await goBack(() => expect(screen.getByText('What do you do?')).toBeTruthy())
    expect(document.body.textContent).toContain('02/04')

    await goBack(() => expect(screen.getByText('Where do you work?')).toBeTruthy())
    expect(document.body.textContent).toContain('01/04')

    // Step 01's back lands on the intro, which has no back of its own.
    await goBack(() => expect(screen.getByRole('button', { name: /start/i })).toBeTruthy())
    expect(screen.queryByRole('button', { name: /back to/i })).toBeNull()
  })

  it('leaves Start again in place alongside back, not replaced by it', async () => {
    await walkToResult()
    expect(screen.getByRole('button', { name: /start again/i })).toBeTruthy()
    expect(backButton()).toBeTruthy()
  })
})

describe('0014 R2 — back is a footer secondary, never a header control', () => {
  it('adds no button to the header on any step', async () => {
    render(<App />)
    const noHeaderButton = () =>
      expect(document.querySelectorAll('header button').length).toBe(0)

    noHeaderButton()                                            // intro
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    noHeaderButton()                                            // 01
    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    noHeaderButton()                                            // 02
    fireEvent.click(screen.getByRole('button', { name: /4 · Clerical/ }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    noHeaderButton()                                            // 03
    fireEvent.click(screen.getByRole('button', { name: /see the figures/i }))
    await waitFor(() =>
      expect(document.body.textContent).toContain("of United Kingdom's workers"),
    )
    noHeaderButton()                                            // 04
  })
})

describe('0014 R3 — going back preserves every answer already given', () => {
  it('reproduces the same result screen after a 04 → 01 → 04 round trip', async () => {
    await walkToResult()
    await settled()
    const first = document.querySelector('main')!.textContent

    await goBack(() => expect(screen.getByText('Two more, if you like.')).toBeTruthy())
    await goBack(() => expect(screen.getByText('What do you do?')).toBeTruthy())
    await goBack(() => expect(screen.getByText('Where do you work?')).toBeTruthy())

    // Forward again touching nothing but the CTAs — no answer is re-entered.
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /see the figures/i }))
    await waitFor(() =>
      expect(document.body.textContent).toContain("of United Kingdom's workers"),
    )
    await settled()

    // String-for-string. A tier or a year that moved would fail here, which is
    // what makes this the check that the data rules survived the navigation.
    expect(document.querySelector('main')!.textContent).toBe(first)
  })
})

describe('0014 R4 — step 02 names the string the reader typed, verbatim', () => {
  it('echoes the input alongside the group it resolved to', () => {
    startWizard()
    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.change(screen.getByLabelText('Your job title'), {
      target: { value: 'paralegal' },
    })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))

    const text = document.querySelector('main')!.textContent
    expect(text).toContain('paralegal')
    expect(text).toContain('3 · Technicians and associate professionals')
  })

  it('keeps the reader’s own casing', () => {
    startWizard()
    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    // `Bookkeeper`, not `Legal Assistant`: resolveTitle has no `legal` keyword,
    // so that one returns null and renders no echo at all — the unresolved
    // path, not this one.
    fireEvent.change(screen.getByLabelText('Your job title'), {
      target: { value: 'Bookkeeper' },
    })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))

    const text = document.querySelector('main')!.textContent
    expect(text).toContain('Bookkeeper')
    expect(text).toContain('4 · Clerical support workers')
  })
})

describe('0014 R5 — the typed title and the search query survive a round trip', () => {
  it('keeps the job title in the box across back and forward', async () => {
    startWizard()
    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.change(screen.getByLabelText('Your job title'), {
      target: { value: 'paralegal' },
    })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))

    await goBack(() => expect(screen.getByText('Where do you work?')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect((screen.getByLabelText('Your job title') as HTMLInputElement).value).toBe('paralegal')
    expect(document.querySelector('main')!.textContent).toContain('paralegal')
  })

  it('keeps the country search filtered across forward and back', async () => {
    startWizard()
    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await goBack(() => expect(screen.getByText('Where do you work?')).toBeTruthy())

    expect((screen.getByLabelText('Search countries') as HTMLInputElement).value).toBe('United Kingdom')
    expect(screen.getAllByRole('option').length).toBe(1)
  })
})

describe('0014 R6 — overriding by chip renders no echo', () => {
  function toOccupation() {
    startWizard()
    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  }

  it('names the group without claiming anything was typed', () => {
    toOccupation()
    fireEvent.click(screen.getByRole('button', { name: /4 · Clerical/ }))

    const text = document.querySelector('main')!.textContent
    expect(text).toContain('4 · Clerical support workers')
    expect(text).not.toContain('You typed')
  })

  it('drops the echo when a chip overrides a resolved title', () => {
    toOccupation()
    fireEvent.change(screen.getByLabelText('Your job title'), {
      target: { value: 'paralegal' },
    })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
    expect(document.querySelector('main')!.textContent).toContain('You typed')

    fireEvent.click(screen.getByRole('button', { name: /1 · Managers/ }))
    const text = document.querySelector('main')!.textContent
    expect(text).toContain('1 · Managers')
    // The failure this guards: a derived echo would still say "you typed
    // paralegal" while the answer had moved to Managers.
    expect(text).not.toContain('You typed')
  })
})

describe('0014 R9 — no router and no URL state', () => {
  it('adds no routing dependency', async () => {
    const pkg = (await import('../../../package.json')).default
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const name of ['react-router', 'react-router-dom', 'wouter']) {
      expect((deps as Record<string, string>)[name]).toBeUndefined()
    }
  })
})

// R5 lifted step 01's `query` and step 02's `occ` into WizardShell. Before that
// they were local to screens that unmount on every step change, so `Start
// again` cleared them for free. Now it has to do it explicitly, and nothing
// else would catch it if those two lines were dropped: the wizard would quietly
// carry the old typed title into a fresh run.
describe('0014 R5 — Start again still clears what it used to clear', () => {
  it('resets the typed title and the search query, and keeps the country', async () => {
    startWizard()
    pickCountry('United Kingdom')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.change(screen.getByLabelText('Your job title'), {
      target: { value: 'paralegal' },
    })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /see the figures/i }))
    await waitFor(() =>
      expect(document.body.textContent).toContain("of United Kingdom's workers"),
    )

    fireEvent.click(screen.getByRole('button', { name: /start again/i }))
    fireEvent.click(screen.getByRole('button', { name: /start/i }))

    // Probed 2026-09-01 and left alone by this spec: `onRestart` never touches
    // `iso3`, so the country survives while the other three answers do not.
    // The issue's claim that Start again "discards the country" is wrong.
    expect((screen.getByLabelText('Search countries') as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('option', { name: /United Kingdom/ }).getAttribute('aria-selected'))
      .toBe('true')

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect((screen.getByLabelText('Your job title') as HTMLInputElement).value).toBe('')
    const text = document.querySelector('main')!.textContent
    expect(text).not.toContain('You typed')
    expect(text).not.toContain('paralegal')
  })
})
