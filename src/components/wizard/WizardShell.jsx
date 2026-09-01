// R5. The shell: five screens, a sticky header, a four-segment progress bar.
//
// Step state is internal to this component. There is no router — 0010's
// Non-goals record that deliberately, and real routes stay issues #24 and #15.
//
// Every size here is a token from src/styles/index.css, which is what R2 means
// by "the canvas's tokens are the only source". A raw hex in this directory is
// a review finding.
import { useEffect, useMemo, useState } from 'react'

import payload from '@/data/global_labor.json'
import { loadCrossTabs } from '@/utils/crossTabs'
import { localeCountry } from '@/utils/countryList'
import { NOT_LOADED } from '@/utils/absence'

import IntroScreen from './IntroScreen'
import CountryScreen from './CountryScreen'
import OccupationScreen from './OccupationScreen'
import OptionalScreen from './OptionalScreen'
import ResultScreen from './ResultScreen'

const STEPS = ['intro', 'country', 'occupation', 'optional', 'result']

export default function WizardShell() {
  const rows = payload.rows

  const [step, setStep] = useState(0)
  // Lazy initialiser rather than an effect: the locale is known before the
  // first paint, so prefilling in an effect would render an empty selection and
  // then correct it. `localeCountry` returns null rather than a guess when the
  // locale does not resolve to a country the payload carries.
  // 0011 R5. `localeCountry` now returns `{ iso3, excluded }`: the country to
  // select, and -- when the locale resolved to one of the 41 with no series --
  // the country it resolved to, so step 01 can name it rather than opening on
  // an empty box a reader in China has no way to explain.
  const prefill = useMemo(
    () => localeCountry(payload.rows, globalThis.navigator?.language),
    [],
  )
  const [iso3, setIso3] = useState(prefill.iso3)
  const [group, setGroup] = useState(null)
  const [age, setAge] = useState(null)
  const [edu, setEdu] = useState(null)
  // 0014 R5. Step 01's search text and step 02's input state live here rather
  // than in the screens, because the screens are conditionally rendered and so
  // unmount on every step change. Probed 2026-09-01: returning to step 02 after
  // a remount left the input empty and no chip pressed, which would make R1's
  // back move land the reader under a resolution panel quoting a word the box no
  // longer holds.
  //
  // `occ.echo` is deliberately NOT derived from `occ.title`. It holds the string
  // the *current* resolution was made from, so it is set on a resolve and
  // cleared when a chip overrides -- R6. Derived from `title`, "type paralegal,
  // resolve, then pick Managers" would report that you typed `paralegal` to
  // reach Managers.
  //
  // `group` stays its own state: it is the answer. `occ` is how it was reached.
  const [query, setQuery] = useState('')
  const [occ, setOcc] = useState({ title: '', tried: false, echo: null })
  // Keyed by the country it belongs to, so "still loading" is derived rather
  // than written by the effect before the fetch starts. A stale result for a
  // country the reader has moved on from can never be shown.
  const [loaded, setLoaded] = useState({ iso3: null, state: NOT_LOADED, data: null })

  const row = useMemo(() => rows.find((r) => r.iso3 === iso3) ?? null, [rows, iso3])

  // R20. The cross-tabs arrive after step 01, not in the bundle the intro
  // screen waits on. The load carries its own state so a failure can never be
  // mistaken for the source publishing nothing.
  useEffect(() => {
    if (!iso3) return undefined
    let live = true
    loadCrossTabs(iso3).then((r) => { if (live) setLoaded({ iso3, ...r }) })
    return () => { live = false }
  }, [iso3])

  const cross = loaded.iso3 === iso3 ? loaded : { state: NOT_LOADED, data: null }

  const go = (n) => {
    setStep(n)
    globalThis.scrollTo?.(0, 0)
  }

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
          {/* 0014 R1/R3. Every `onBack` is `go(step - 1)` and nothing else. That
              is the whole of R3: a backwards move changes the step and touches
              no answer, so country, group, age and education all survive it.
              Contrast `onRestart` below, which is the one control that clears
              anything -- and, probed 2026-09-01, clears three of the four
              rather than all four: it never touches `iso3`. */}
          {step === 0 && <IntroScreen onStart={() => go(1)} />}
          {step === 1 && (
            <CountryScreen
              rows={rows} iso3={iso3} excluded={prefill.excluded}
              query={query} onQuery={setQuery}
              onPick={setIso3} onNext={() => go(2)} onBack={() => go(0)}
            />
          )}
          {step === 2 && (
            <OccupationScreen
              group={group} occ={occ} onOcc={setOcc}
              onPick={setGroup} onNext={() => go(3)} onBack={() => go(1)}
            />
          )}
          {step === 3 && (
            <OptionalScreen
              {...common}
              onAge={setAge} onEdu={setEdu}
              onNext={() => go(4)}
              onBack={() => go(2)}
              onSkip={() => { setAge(null); setEdu(null); go(4) }}
            />
          )}
          {step === 4 && (
            <ResultScreen
              {...common}
              onBack={() => go(3)}
              onRestart={() => {
                setGroup(null); setAge(null); setEdu(null)
                setQuery(''); setOcc({ title: '', tried: false, echo: null })
                go(0)
              }}
            />
          )}
        </main>
      </div>
    </div>
  )
}
