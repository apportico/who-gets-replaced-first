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

export default function CountryScreen({ rows, iso3, excluded, onPick, onNext }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const optionId = (i) => `${listId}-opt-${i}`
  const listRef = useRef(null)

  const { matches, absent } = useMemo(() => searchCountries(rows, query), [rows, query])
  const total = useMemo(() => searchCountries(rows, '').matches.length, [rows])

  function move(delta) {
    if (matches.length === 0) return
    const next = (active + delta + matches.length) % matches.length
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
      setQuery('')
      setActive(0)
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
          onChange={(e) => { setQuery(e.target.value); setActive(0) }}
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

      <div className="wz-footer">
        <button type="button" className="wz-cta" onClick={onNext} disabled={!iso3}>
          Continue →
        </button>
      </div>
    </div>
  )
}
