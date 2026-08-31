// R6. Step 01 — country, tagged by what the data actually carries.
//
// The tag comes from `countryTag`, which reads "any of the nine ISCO fields
// non-null". Every country appears, including the 41 with no ISCO block: a
// country is never hidden for lacking data, because "we have nothing for you"
// is a result the reader is entitled to and a silently missing row is not.
import { useMemo } from 'react'
import { countryOptions, OFFICIAL_SERIES } from '@/utils/countryTag'

export default function CountryScreen({ rows, iso3, onPick, onNext }) {
  const options = useMemo(() => countryOptions(rows), [rows])

  return (
    <div
      className="wz-pad"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <div style={{ paddingTop: 40 }}>
        <p className="wz-eyebrow">Question 01</p>
        <h2 className="wz-h2">Where do you work?</h2>
        <p className="wz-body" style={{ margin: '16px 0 0' }}>
          Pre-filled from your locale where we can match it. The primary key for
          every source in the stack.
        </p>
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map((c) => (
            <button
              key={c.iso3}
              type="button"
              className="wz-option"
              aria-pressed={c.iso3 === iso3}
              onClick={() => onPick(c.iso3)}
            >
              <span>{c.name}</span>
              <span
                className="wz-meta"
                style={{
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  color: c.iso3 === iso3 ? 'color-mix(in srgb, var(--bg) 55%, transparent)' : 'var(--muted)',
                }}
              >
                {c.tag}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="wz-footer">
        <button type="button" className="wz-cta" onClick={onNext} disabled={!iso3}>
          Continue →
        </button>
        {iso3 && options.find((c) => c.iso3 === iso3)?.tag !== OFFICIAL_SERIES && (
          <p className="wz-note" style={{ margin: '12px 0 0', textAlign: 'center' }}>
            This country reports no occupation breakdown. You can continue — the
            result will say what is missing rather than estimate it.
          </p>
        )}
      </div>
    </div>
  )
}
