// R8 (spec 0016) — the copy-link control on step 04.
//
// The rest of 0016 makes a result addressable. This is the part that makes it
// *noticed*: a capability nobody can see is worth nothing, and the reader's
// current alternative is to select the address bar on a phone.
//
// Two things here are deliberate rather than defensive boilerplate:
//
//   - **The failure path renders the URL.** `writeText` can be refused — an
//     insecure context, a permissions policy, a browser that has not granted
//     clipboard access — and it fails as a rejected promise, silently. A button
//     that appears to do nothing is worse than no button, so a refusal falls
//     back to showing the link in a selectable field, which is the thing the
//     reader was trying to get at anyway.
//   - **The confirmation is announced, not only shown.** A colour-and-label
//     change is invisible to a screen reader, and this control's entire output
//     is the confirmation that it worked. Spec 0008 was written about exactly
//     this class of failure.
import { useEffect, useRef, useState } from 'react'
import { Check, Link2 } from 'lucide-react'

const IDLE = 'idle'
const COPIED = 'copied'
const REFUSED = 'refused'

export default function CopyLink() {
  const [state, setState] = useState(IDLE)
  const fieldRef = useRef(null)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    const url = globalThis.location?.href ?? ''
    try {
      await globalThis.navigator?.clipboard?.writeText(url)
      setState(COPIED)
      clearTimeout(timer.current)
      // Long enough to be read, short enough that the control does not sit
      // permanently in a state that no longer describes anything.
      timer.current = setTimeout(() => setState(IDLE), 2600)
    } catch {
      setState(REFUSED)
    }
  }

  // Select the whole URL on arrival, so the fallback is one keystroke from
  // being useful rather than a text box the reader has to drag across.
  useEffect(() => {
    if (state === REFUSED) fieldRef.current?.select()
  }, [state])

  return (
    <div style={{ marginTop: 22 }}>
      <button
        type="button"
        onClick={copy}
        className="wz-tertiary"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-pill)',
          minHeight: 'var(--tap-tertiary)',
        }}
      >
        {state === COPIED
          ? <Check size={15} aria-hidden="true" />
          : <Link2 size={15} aria-hidden="true" />}
        {state === COPIED ? 'Link copied' : 'Copy link to this result'}
      </button>

      {/* The announcement. Separate from the button face because the face is a
          label and this is a status: a screen reader should hear that the copy
          happened without the button having to be re-read. */}
      <p className="wz-sr-only" role="status" aria-live="polite">
        {state === COPIED ? 'Link copied to the clipboard.' : ''}
        {state === REFUSED ? 'The clipboard is unavailable. The link is shown below to copy by hand.' : ''}
      </p>

      {state === REFUSED && (
        <>
          <p className="wz-note" style={{ margin: '10px 0 6px' }}>
            This browser would not let us reach the clipboard. Here is the link:
          </p>
          <input
            ref={fieldRef}
            readOnly
            value={globalThis.location?.href ?? ''}
            aria-label="Link to this result"
            onFocus={(e) => e.target.select()}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '13px 15px', minHeight: 'var(--tap-tertiary)',
              fontFamily: 'var(--font-mono)', fontSize: 12.5,
              background: 'var(--surface)', color: 'var(--fg)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
            }}
          />
        </>
      )}
    </div>
  )
}
