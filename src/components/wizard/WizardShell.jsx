// R5 (0010). The shell: five screens, a sticky header, a four-segment progress bar.
//
// **The URL is the state** (spec 0016). The five atoms the wizard holds — step,
// country, group, and the two optional bands — live in `location.search`, and
// this component follows the URL rather than keeping a second copy in sync with
// it. That is what makes a result linkable, a reload survivable, and browser
// Back a step backwards instead of a way off the site.
//
// There is still no router. 0010's Non-goals record that, and it holds: the
// browser's own History API does everything R2 and R4 need, and #24's real
// routes stay open with these five parameters as the thing a future migration
// carries rather than re-invents.
//
// **One navigation seam** (0016 R10, `[~]`). `go` and `set` are the only ways
// the wizard moves, and `commit` is the only place state and history are
// written. The spec also asked for a `back()`; it is deliberately not here,
// because nothing renders a control that would call it and an exported
// function with no caller is the dead artifact REVIEW.md flags. #77 owns that
// control and adds `back()` in the same change — `commit(next, 'pop')` is the
// hook it lands on, and browser Back already works through it (R4).
//
// Every size here is a token from src/styles/index.css, which is what R2 means
// by "the canvas's tokens are the only source". A raw hex in this directory is
// a review finding.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import payload from '@/data/global_labor.json'
import { ageBands, eduBands, loadCrossTabs } from '@/utils/crossTabs'
import { localeCountry } from '@/utils/countryList'
import { NOT_LOADED, PRESENT } from '@/utils/absence'
import { STEPS, decode, encode, noticeFor } from '@/utils/urlState'

import IntroScreen from './IntroScreen'
import CountryScreen from './CountryScreen'
import OccupationScreen from './OccupationScreen'
import OptionalScreen from './OptionalScreen'
import ResultScreen from './ResultScreen'

const search = () => globalThis.location?.search ?? ''
const pathname = () => globalThis.location?.pathname ?? ''

export default function WizardShell() {
  const rows = payload.rows

  // R3. Decoded in a lazy initialiser, not an effect: the URL is known before
  // the first paint, so restoring in an effect would render the intro and then
  // correct it — a visible flash on every shared link, and a result screen that
  // is briefly not the thing the link pointed at.
  //
  // The locale pre-fill (0011 R5) still runs, but only for a link that asked
  // for no country at all. A link that named one has said what it wants, and
  // silently substituting the reader's own country would be worse than useless
  // — it would answer a question nobody asked, about a different country.
  const boot = useMemo(() => {
    const url = decode(search(), rows)
    const askedForCountry =
      url.iso3 !== null || url.absent !== null || url.dropped.includes('country')
    const prefill = askedForCountry
      ? { iso3: null, excluded: null }
      : localeCountry(rows, globalThis.navigator?.language)
    return {
      state: {
        step: url.step,
        iso3: url.iso3 ?? prefill.iso3,
        group: url.group,
        age: url.age,
        edu: url.edu,
      },
      excluded: prefill.excluded,
      notice: noticeFor(url),
    }
  }, [rows])

  const [state, setState] = useState(boot.state)
  // The seam's functions must be stable: they are effect dependencies below,
  // and a `go`/`set` that changed identity on every render would re-run the
  // cross-tab effect on every render, which re-sets `loaded`, which renders
  // again. The ref is what breaks that cycle — `commit` keeps it current, so
  // the callbacks can close over nothing and still read the latest state.
  const stateRef = useRef(boot.state)
  // R6. What the link asked for and did not get, said out loud on the step the
  // clamp landed on. Cleared by the first deliberate move: by then it explains
  // a screen the reader has left.
  const [notice, setNotice] = useState(boot.notice)
  const { step, iso3, group, age, edu } = state

  /**
   * The only `setState` in this file, and the only place history is written.
   *
   * `mode` is the whole of R2. A **step transition pushes**, so Back walks the
   * four steps; an **answer change replaces**, so Back does not walk backwards
   * through every country the reader tapped on the way to the one they meant.
   * `pop` writes nothing at all — the browser has already moved, and pushing
   * there would fight the user's own Back button.
   */
  const commit = useCallback((next, mode) => {
    stateRef.current = next
    setState(next)
    if (mode === 'pop') return
    // R9. `location.pathname + encode(...)`, never a reconstructed path. The
    // production base is `/who-gets-replaced-first/`, and a hand-built absolute
    // URL is the failure that works in dev and breaks on Pages — the same one
    // crossTabs.js documents for asset paths.
    const url = pathname() + encode(next)
    if (mode === 'push') globalThis.history?.pushState(null, '', url)
    else globalThis.history?.replaceState(null, '', url)
  }, [])

  const go = useCallback((nextStep, patch = {}) => {
    setNotice(null)
    commit({ ...stateRef.current, ...patch, step: nextStep }, 'push')
    globalThis.scrollTo?.(0, 0)
  }, [commit])

  const set = useCallback((patch) => {
    commit({ ...stateRef.current, ...patch }, 'replace')
  }, [commit])

  // R6. Normalise on arrival, so the address bar shows what is actually on
  // screen. A link carrying `country=ZZZ` opens step 01 and the URL says step
  // 01 — a URL still claiming a result nobody is looking at is the same lie
  // R7 is about, just at load time. `replaceState`, so the reader's Back still
  // leaves the site rather than returning to the broken link.
  useEffect(() => {
    if (encode(boot.state) !== search()) {
      globalThis.history?.replaceState(null, '', pathname() + encode(boot.state))
    }
  }, [boot.state])

  // R4. Back and Forward. The listener re-decodes rather than popping a stack
  // this component keeps, so there is exactly one source of truth and a
  // hand-edited URL behaves the same as a Back press.
  useEffect(() => {
    const onPop = () => {
      const url = decode(search(), rows)
      commit(
        { step: url.step, iso3: url.iso3, group: url.group, age: url.age, edu: url.edu },
        'pop',
      )
      setNotice(noticeFor(url))
      globalThis.scrollTo?.(0, 0)
    }
    globalThis.addEventListener?.('popstate', onPop)
    return () => globalThis.removeEventListener?.('popstate', onPop)
  }, [commit, rows])

  const row = useMemo(() => rows.find((r) => r.iso3 === iso3) ?? null, [rows, iso3])

  // Keyed by the country it belongs to, so "still loading" is derived rather
  // than written by the effect before the fetch starts. A stale result for a
  // country the reader has moved on from can never be shown.
  const [loaded, setLoaded] = useState({ iso3: null, state: NOT_LOADED, data: null })

  // R20 (0010). The cross-tabs arrive after step 01, not in the bundle the
  // intro screen waits on. The load carries its own state so a failure can
  // never be mistaken for the source publishing nothing.
  //
  // **0016 R7 rides in the same callback**, and that is not tidiness: the
  // moment the fetch answers is exactly the moment we learn whether the bands
  // a link asked for exist. Doing it here rather than in a second effect also
  // keeps the `setState` inside a callback from an external system, which is
  // the shape `react-hooks/set-state-in-effect` is asking for.
  useEffect(() => {
    if (!iso3) return undefined
    let live = true
    loadCrossTabs(iso3).then((r) => {
      if (!live) return
      setLoaded({ iso3, ...r })

      // R7. A band the chosen cell does not publish stops being claimed by the
      // URL, so a copied link cannot promise a figure the screen does not show.
      //
      // **Only on a resolved source absence.** `NOT_LOADED` and `LOAD_FAILED`
      // mean the fetch has not answered, not that ILOSTAT publishes nothing —
      // stripping on either would let one offline moment silently delete an
      // answer the reader gave, and bake that invented absence into the link
      // they then copy. This is 0010 R20's boundary, one layer up, in the
      // address bar.
      if (r.state !== PRESENT || !group) return
      const patch = {}
      if (age) {
        const a = ageBands(r.data, group)
        if (a.state !== PRESENT || !a.bands.some((b) => b.key === age)) patch.age = null
      }
      if (edu) {
        const e = eduBands(r.data, group)
        if (e.state !== PRESENT || !e.bands.some((b) => b.key === edu)) patch.edu = null
      }
      if (Object.keys(patch).length) set(patch)
    })
    return () => { live = false }
  }, [iso3, group, age, edu, set])

  const cross = loaded.iso3 === iso3 ? loaded : { state: NOT_LOADED, data: null }

  const shown = Math.max(step, 1)
  const common = { row, iso3, group, age, edu, cross }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--fg)',
        fontFamily: 'var(--font-body)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 'var(--column)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <div
            style={{
              padding: '14px var(--gutter) 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span className="wz-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--accent)',
                  animation: 'pulse 2.6s ease-in-out infinite',
                }}
              />
              The Replacement Date
            </span>
            <span className="wz-meta" style={{ color: 'var(--muted)' }}>
              {String(shown).padStart(2, '0')}/04
            </span>
          </div>
          <div style={{ display: 'flex', padding: '0 var(--gutter) 12px' }}>
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: 2,
                  marginRight: 4,
                  borderRadius: 2,
                  background: i <= shown ? 'var(--accent)' : 'var(--border)',
                  transition: 'background 0.4s ease',
                }}
              />
            ))}
          </div>
        </header>

        <main key={STEPS[step]} className="wz-step" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {step === 0 && <IntroScreen onStart={() => go(1)} />}
          {step === 1 && (
            <CountryScreen
              rows={rows} iso3={iso3} excluded={boot.excluded} notice={notice}
              onPick={(v) => set({ iso3: v })} onNext={() => go(2)}
            />
          )}
          {step === 2 && (
            <OccupationScreen
              group={group} notice={notice}
              onPick={(v) => set({ group: v })} onNext={() => go(3)}
            />
          )}
          {step === 3 && (
            <OptionalScreen
              {...common}
              onAge={(v) => set({ age: v })} onEdu={(v) => set({ edu: v })}
              onNext={() => go(4)}
              onSkip={() => go(4, { age: null, edu: null })}
            />
          )}
          {step === 4 && (
            <ResultScreen
              {...common}
              onRestart={() => go(0, { group: null, age: null, edu: null })}
            />
          )}
        </main>
      </div>
    </div>
  )
}
