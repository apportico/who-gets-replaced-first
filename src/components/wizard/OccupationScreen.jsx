// R7. Step 02 — a job title resolves to an ISCO-08 major group, visibly.
//
// The resolution is shown and overridable. A title the table does not know
// produces an explicit "not resolved" state with nothing pre-selected — the
// resolver returns null rather than defaulting to clerical, and this screen
// shows that rather than papering over it.
import { useState } from 'react'
import { resolveTitle } from '@/utils/resolveTitle'
import { GROUPS, groupDisplay } from '@/utils/isco'

export default function OccupationScreen({ group, notice, onPick, onNext }) {
  const [title, setTitle] = useState('')
  const [tried, setTried] = useState(false)

  const attempt = () => {
    setTried(true)
    const hit = resolveTitle(title)
    onPick(hit)
  }

  const unresolved = tried && group === null

  return (
    <div
      className="wz-pad"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <div style={{ paddingTop: 40 }}>
        <p className="wz-eyebrow">Question 02</p>
        <h2 className="wz-h2">What do you do?</h2>
        <p className="wz-body" style={{ margin: '16px 0 0' }}>
          Type a title. It resolves to one of nine groups — the resolution is
          shown, never hidden, and you can override it.
        </p>

        {/* 0016 R6. Same slot and same wording rules as step 01. */}
        {notice && (
          <p className="wz-note" style={{ margin: '14px 0 0', color: 'var(--muted-strong)' }}>
            {notice}
          </p>
        )}

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') attempt() }}
          placeholder="paralegal, bookkeeper, driver…"
          aria-label="Your job title"
          style={{
            marginTop: 26, width: '100%', boxSizing: 'border-box',
            padding: '19px 18px', minHeight: 'var(--tap-option)',
            fontFamily: 'var(--font-display)', fontSize: 26,
            background: 'var(--surface)', color: 'var(--fg-strong)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
          }}
        />

        {group !== null && (
          <div className="wz-step" style={{ marginTop: 16 }}>
            <div
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 11,
                padding: '16px 17px', background: 'var(--accent-tint)',
                border: '1px solid var(--accent-edge)', borderRadius: 'var(--radius-control)',
              }}
            >
              <span
                style={{
                  flex: 'none', marginTop: 2, width: 18, height: 18, borderRadius: '50%',
                  background: 'var(--accent)', color: 'var(--bg)',
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--step-badge)', fontWeight: 500,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {group}
              </span>
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.4, color: 'var(--fg-strong)', textWrap: 'pretty' }}>
                Matched to <strong style={{ fontWeight: 500 }}>{groupDisplay(group)}</strong>
              </p>
            </div>
          </div>
        )}

        {unresolved && (
          <p className="wz-caveat wz-step" style={{ marginTop: 16 }}>
            Not resolved — we do not recognise that title. Pick a group below;
            nothing has been assumed.
          </p>
        )}

        <p className="wz-meta" style={{ margin: '18px 0 10px', color: 'var(--muted)' }}>
          {group !== null ? 'Wrong? Override' : 'Or pick a group'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {GROUPS.map((g) => (
            <button
              key={g.n}
              type="button"
              className="wz-chip"
              aria-pressed={g.n === group}
              onClick={() => { setTried(true); onPick(g.n) }}
            >
              {g.n} · {g.short}
            </button>
          ))}
        </div>
      </div>

      <div className="wz-footer">
        <button
          type="button"
          className="wz-cta"
          onClick={() => (group !== null ? onNext() : attempt())}
        >
          {group !== null ? 'Confirm →' : 'Resolve title →'}
        </button>
      </div>
    </div>
  )
}
