// R8 / R9, on screen. Step 03 — the two optional dimensions.
//
// Both are real cross-tabulated cells, not decoration: ILOSTAT publishes ISCO
// major group crossed with age (164 areas) and with education (162), and R8/R9
// derive a share per group from each. Selecting a band lands on a different
// published cell, which is what makes the step worth having.
//
// Skipping is not "widen the interval" — no interval ships (R14). It means the
// result is reported for the group as a whole.
//
// A band that is absent is not offered. For education that is R9's coverage
// floor doing its job: below 90% of EDU_AGGREGATE_TOTAL the dimension is
// withheld rather than rendered as chips describing a minority of the base.
import { ageBands, eduBands } from '@/utils/crossTabs'
import { PRESENT, WITHHELD, LOAD_FAILED, NOT_LOADED, absenceMessage } from '@/utils/absence'

function BandRow({ title, result, value, onPick, columns }) {
  if (result.state === NOT_LOADED) {
    return <p className="wz-note" style={{ margin: '10px 0 0' }}>{absenceMessage(NOT_LOADED)}</p>
  }
  if (result.state === LOAD_FAILED) {
    // Never "the source does not publish it": that would be an invented
    // absence, which is the failure R20 exists to prevent.
    return <p className="wz-note" style={{ margin: '10px 0 0' }}>{absenceMessage(LOAD_FAILED)}</p>
  }
  if (result.state !== PRESENT) {
    return (
      <p className="wz-note" style={{ margin: '10px 0 0' }}>
        {result.state === WITHHELD
          ? absenceMessage(WITHHELD)
          : 'Not published for this country and group.'}
      </p>
    )
  }
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }}>
        {result.bands.map((b) => (
          <button
            key={b.key}
            type="button"
            className="wz-chip"
            style={{ minHeight: 'var(--tap-option)', borderRadius: 'var(--radius-control)', fontSize: 12 }}
            aria-pressed={value === b.key}
            onClick={() => onPick(value === b.key ? null : b.key)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <p className="wz-note" style={{ margin: '8px 0 0' }}>
        {title} · {result.year} · {result.tier}
      </p>
    </>
  )
}

export default function OptionalScreen({ group, cross, age, edu, onAge, onEdu, onNext, onSkip }) {
  const data = cross?.state === PRESENT ? cross.data : null
  const ages = data ? ageBands(data, group) : { state: cross?.state ?? NOT_LOADED, bands: [] }
  const edus = data ? eduBands(data, group) : { state: cross?.state ?? NOT_LOADED, bands: [] }

  return (
    <div
      className="wz-pad"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <div style={{ paddingTop: 40 }}>
        <p className="wz-eyebrow">Optional — narrows the answer</p>
        <h2 className="wz-h2">Two more, if you like.</h2>
        <p className="wz-body" style={{ margin: '16px 0 0' }}>
          Both are real cross-tabulated dimensions in the source, so each answer
          lands on a different published cell.
        </p>

        <p className="wz-meta" style={{ margin: '30px 0 10px', color: 'var(--muted)' }}>Age band</p>
        <BandRow title="Age" result={ages} value={age} onPick={onAge} columns={3} />

        <p className="wz-meta" style={{ margin: '26px 0 10px', color: 'var(--muted)' }}>Education</p>
        <BandRow title="Education" result={edus} value={edu} onPick={onEdu} columns={2} />
      </div>

      <div className="wz-footer" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <button type="button" className="wz-cta" onClick={onNext}>See the figures →</button>
        <button type="button" className="wz-tertiary" onClick={onSkip}>
          Skip — report the group as a whole
        </button>
      </div>
    </div>
  )
}
