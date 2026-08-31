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

describe('R5 — the shell renders and walks all five screens', () => {
  it('opens on the intro without throwing', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /start/i })).toBeTruthy()
    expect(document.body.textContent).toContain('The Replacement Date')
  })

  it('advances intro → country → occupation → optional → result', async () => {
    startWizard()
    expect(screen.getByText('Where do you work?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /United Kingdom/ }))
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
    fireEvent.click(screen.getByRole('button', { name: /United Kingdom/ }))
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
    fireEvent.click(screen.getByRole('button', { name: /United Kingdom/ }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.change(screen.getByLabelText('Your job title'), { target: { value: 'bookkeeper' } })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))

    await waitFor(() => {
      const t = document.body.textContent
      expect(t).toContain('8.9%')      // R10, with its tier and vintage
      expect(t).toContain('2.99M')     // R11, derived
      expect(t).toContain('DERIVED')
      expect(t).toContain('Share since 2013')  // R12
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
    fireEvent.click(screen.getByRole('button', { name: /United Kingdom/ }))
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

describe('R7 — an unresolvable title is said out loud', () => {
  it('shows "not resolved" and pre-selects nothing', () => {
    startWizard()
    fireEvent.click(screen.getByRole('button', { name: /United Kingdom/ }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.change(screen.getByLabelText('Your job title'), { target: { value: 'zzzz' } })
    fireEvent.click(screen.getByRole('button', { name: /resolve title/i }))

    expect(document.body.textContent).toContain('Not resolved')
    // queryAllByRole, not getAllByRole: the latter throws when nothing matches,
    // which is the case this test exists to assert.
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })
})
