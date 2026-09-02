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
//
// 0013 folded it. The screen above renders `renderedCountries`, not
// `searchCountries`: at rest it shows the selected country alone, and a query
// renders at most 12 matches and 3 stated absences, with both truncations said
// out loud. Until then this screen rendered the predicate's answer to an empty
// query — all 177 rows, 12,754px, fifteen viewport heights on a phone — and
// three of 0011's own acceptance criteria asserted that it did.
import { useId, useMemo, useRef, useState } from 'react'
import { renderedCountries } from '@/utils/countrySearch'
import { countryOptions } from '@/utils/countryList'
import type { CountryScreenProps } from '@/types'

// 0014 R5. `query` is a prop now, owned by WizardShell: this screen unmounts on
// every step change, so a locally-held search string meant a reader who came
// back to step 01 found the folded list again rather than the search they had
// just run. `active` stays local on purpose -- an arrow-key position is
// transient, not an answer, and restoring it would paint a focus ring nobody
// asked for on arrival.
export default function CountryScreen({
  rows, iso3, excluded, notice, query, onQuery, onPick, onNext, onBack,
}: CountryScreenProps) {
  // -1, not 0: on open the reader has expressed nothing, so painting the accent
  // ring around Afghanistan — with no element focused — claims a keyboard
  // position nobody took, and `Enter` on an empty box would select it. Typing
  // sets 0, where highlighting the top match is a response to input rather than
  // an arbitrary pick.
  const [active, setActive] = useState(-1)
  const listId = useId()
  const optionId = (i: number) => `${listId}-opt-${i}`
  const listRef = useRef<HTMLDivElement | null>(null)

  const { matches, absent, matchCount, absentCount, truncated, absentTruncated, resting } =
    useMemo(() => renderedCountries(rows, query, iso3), [rows, query, iso3])
  const total = useMemo(() => countryOptions(rows).length, [rows])
  const absentRemaining = absentCount - absent.length

  function move(delta: number) {
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

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
        <h1 className="wz-h2">Where do you work?</h1>
        {/* R10. The provenance the per-row tag used to carry. Every row in this
            list has a series, so tagging all 177 identically said nothing; what
            is worth saying is what the list *is*. */}
        <p className="wz-body" style={{ margin: '16px 0 0' }}>
          The {total} countries that report an ISCO-08 occupation breakdown to
          ILOSTAT. Pre-filled from your locale where we can match it.
        </p>

        {/* 0016 R6. What the link asked for and did not get. Above the locale
            note on purpose: this one explains why the reader is on this screen
            at all, and the locale note explains a country they have not asked
            about yet. */}
        {notice && (
          <p className="wz-note" style={{ margin: '14px 0 0', color: 'var(--muted-strong)' }}>
            {notice}
          </p>
        )}

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
          onChange={(e) => { onQuery(e.target.value); setActive(e.target.value ? 0 : -1) }}
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

        {/* R9 (0011) + R3 (0013). The count, announced rather than only shown —
            and now the truncations with it, because a screen-reader user is
            exactly the reader who cannot see that a list was cut.

            Empty at rest, deliberately. `{total} of {total} countries match` is
            true of the predicate and false of the screen, and the gap between
            those two is the whole of issue #76. Empty is also the right
            `aria-live` semantic: nothing has changed yet, so the first keystroke
            produces the first announcement. */}
        <p className="wz-sr-only" aria-live="polite">
          {resting ? '' : (
            <>
              {matchCount} of {total} countries match
              {truncated && `, showing the first ${matches.length}`}
              {absentTruncated && `. ${absentRemaining} more matching countries report no occupation breakdown`}
            </>
          )}
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

        {/* R3 (0013). A cap that hides matches says so. A truncated list
            presented as a whole list is a false statement about the data, which
            is the user-interface form of this project's first rule. */}
        {truncated && (
          <p className="wz-note" style={{ margin: '14px 0 0' }}>
            {matchCount} matches — showing the first {matches.length}. Keep
            typing to narrow.
          </p>
        )}

        {/* R6. A country we cannot answer for is named, not silently missing.
            Text, not a control: it is not tappable, not focusable, and carries
            no option semantics, so arrowing through the list never lands on it. */}
        {absent.map((c) => (
          <p key={c.iso3} className="wz-note" style={{ margin: '14px 0 0' }}>
            {c.name} is in the dataset but reports no occupation breakdown, so
            there is no result to give you.
          </p>
        ))}

        {/* R2 + R3 (0013). The absences are capped at 3, and the remainder is
            stated as a count rather than dropped. CLAUDE.md allows dropping the
            row and forbids dropping the statement — a count is a statement, and
            it is the only reason capping these is available at all. */}
        {absentTruncated && (
          <p className="wz-note" style={{ margin: '14px 0 0' }}>
            {absentRemaining} more {absentRemaining === 1 ? 'country' : 'countries'} matching
            that search {absentRemaining === 1 ? 'is' : 'are'} in the dataset but
            {' '}report no occupation breakdown.
          </p>
        )}

        {/* R1 (0013). The resting state is not a failed search, and must not be
            reported as one. Before the fold this branch was unreachable — an
            empty query returned all 177 — so "No country matches that." would
            have become the greeting for every reader whose locale does not
            resolve. It is gated on a real query now. */}
        {resting && matches.length === 0 && (
          <p className="wz-note" style={{ margin: '14px 0 0' }}>
            Start typing to search all {total} countries.
          </p>
        )}

        {!resting && matches.length === 0 && absent.length === 0 && (
          <p className="wz-note" style={{ margin: '14px 0 0' }}>
            No country matches that.
          </p>
        )}
      </div>

      {/* 0012 R4: `--anchored` keeps this dock sticky at every width. Steps 02
          and 03 un-dock above the breakpoint because their screens fit the
          viewport. This one still does not, and 0013 R6 re-derived that rather
          than inheriting it: the fold cut the miss from 12,739px to roughly
          1,250px at 1440x900, but the listbox starts 341px down and twelve rows
          cost 832px, so a full result set is still taller than a 900px window
          and a static footer would still put "Continue" below the fold on the
          step with no other way forward. Smaller miss, same direction. */}
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
