// R1, R6, R8, R9, R10 (spec 0011) — step 01, a search rather than a list.
//
// This screen used to render all 218 countries as buttons, 41 of them tagged
// `no series` and unpickable in effect. On the 480px column the app is built
// for that is about forty screens of scroll to reach a name the reader already
// knew. So: a text input over the 177 that carry a series, and the statement
// the `no series` tag used to make moved to where it actually lands — the
// answer to someone who types their own country and does not find it (R6).
//
// The control is a plain input, not shadcn `Command` (R8). `command` pulls
// `cmdk` as a runtime dependency and `dialog` as a registry dependency, and
// `dialog.jsx` would then sit in `src/components/ui/` imported by nothing a
// screen renders — which the unused-component guard in `wizard.render.test.jsx`
// fails unless a second by-name exemption joins `toggle`. An input and a
// filtered list cost less than that.
//
// The combobox keeps focus in the input and moves an *active descendant*,
// rather than moving DOM focus into the list. Typing therefore keeps working
// while arrowing, which is the whole point of a search box.
import { useId, useMemo, useRef, useState } from 'react'
import { searchCountries } from '@/utils/countrySearch'

// 0014 R5. `query` is a prop now, owned by WizardShell: this screen unmounts on
// every step change, so a locally-held search string meant a reader who came
// back to step 01 found all 177 rows again with their own selection somewhere
// below the fold. `active` stays local on purpose -- an arrow-key position is
// transient, not an answer, and restoring it would paint a focus ring nobody
// asked for on arrival.
export default function CountryScreen({ rows, iso3, excluded, query, onQuery, onPick, onNext, onBack }) {
  // -1, not 0: on open the reader has expressed nothing, so painting the accent
  // ring around Afghanistan — with no element focused — claims a keyboard
  // position nobody took, and `Enter` on an empty box would select it. Typing
  // sets 0, where highlighting the top match is a response to input rather than
  // an arbitrary pick.
  const [active, setActive] = useState(-1)
  const listId = useId()
  const optionId = (i) => `${listId}-opt-${i}`
  const listRef = useRef(null)

  const { matches, absent } = useMemo(() => searchCountries(rows, query), [rows, query])
  const total = useMemo(() => searchCountries(rows, '').matches.length, [rows])

  function move(delta) {
    if (matches.length === 0) return
    // From the untouched state, down opens at the first match and up at the
    // last, rather than wrapping arithmetic off a -1 that means "none".
    const next = active < 0
      ? (delta > 0 ? 0 : matches.length - 1)
      : (active + delta + matches.length) % matches.length
    setActive(next)
    const el = listRef.current?.children?.[next]
    // jsdom has no layout and no scrollIntoView; the guard keeps the test
    // asserting behaviour rather than tripping over the environment.
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (matches[active]) onPick(matches[active].iso3)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onQuery('')
      setActive(-1)
    }
  }

  return (
    <div
      className="wz-pad"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <div style={{ paddingTop: 40 }}>
        <p className="wz-eyebrow">Question 01</p>
        <h2 className="wz-h2">Where do you work?</h2>
        {/* R10. The provenance the per-row tag used to carry. Every row in this
            list has a series, so tagging all 177 identically said nothing; what
            is worth saying is what the list *is*. */}
        <p className="wz-body" style={{ margin: '16px 0 0' }}>
          The {total} countries that report an ISCO-08 occupation breakdown to
          ILOSTAT. Pre-filled from your locale where we can match it.
        </p>

        {/* R5. The reader's own country resolved, and has no series. Say so
            before they go looking for it — and stop saying it once they have
            picked somewhere else, since by then it explains an absence they
            are no longer looking at. */}
        {excluded && !iso3 && (
          <p className="wz-note" style={{ margin: '14px 0 0' }}>
            {excluded.name} reports no occupation breakdown to ILOSTAT, so it is
            not in this list.
          </p>
        )}

        <input
          value={query}
          onChange={(e) => { onQuery(e.target.value); setActive(0) }}
          onKeyDown={onKeyDown}
          placeholder="Search countries…"
          aria-label="Search countries"
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={matches[active] ? optionId(active) : undefined}
          style={{
            marginTop: 22, width: '100%', boxSizing: 'border-box',
            padding: '17px 18px', minHeight: 'var(--tap-option)',
            fontFamily: 'var(--font-body)', fontSize: 17,
            background: 'var(--surface)', color: 'var(--fg-strong)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
          }}
        />

        {/* R9. The count, announced rather than only shown. */}
        <p className="wz-sr-only" aria-live="polite">
          {matches.length} of {total} countries match
        </p>

        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Countries"
          style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {matches.map((c, i) => (
            <button
              key={c.iso3}
              id={optionId(i)}
              type="button"
              role="option"
              tabIndex={-1}
              className="wz-option"
              aria-selected={c.iso3 === iso3}
              data-active={i === active ? 'true' : undefined}
              onClick={() => onPick(c.iso3)}
            >
              <span>{c.name}</span>
            </button>
          ))}
        </div>

        {/* R6. A country we cannot answer for is named, not silently missing.
            Text, not a control: it is not tappable, not focusable, and carries
            no option semantics, so arrowing through the list never lands on it. */}
        {absent.map((c) => (
          <p key={c.iso3} className="wz-note" style={{ margin: '14px 0 0' }}>
            {c.name} is in the dataset but reports no occupation breakdown, so
            there is no result to give you.
          </p>
        ))}

        {matches.length === 0 && absent.length === 0 && (
          <p className="wz-note" style={{ margin: '14px 0 0' }}>
            No country matches that.
          </p>
        )}
      </div>

      {/* 0012 R4: `--anchored` keeps this dock sticky at every width. Steps 02
          and 03 un-dock above the breakpoint because their screens fit the
          viewport. This one does not: an empty query lists all 177 countries,
          and a static footer after that list puts "Continue" thousands of
          pixels below the fold on the step with no other way forward. */}
      <div className="wz-footer wz-footer--anchored">
        <button type="button" className="wz-cta" onClick={onNext} disabled={!iso3}>
          Continue →
        </button>
        {/* 0014 R1/R2. Back to the intro. In the footer rather than the header,
            for the three measured reasons spec 0014 R2 records. */}
        <div className="wz-actions" style={{ marginTop: 9 }}>
          <button
            type="button"
            className="wz-back"
            onClick={onBack}
            aria-label="Back to the introduction"
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  )
}
