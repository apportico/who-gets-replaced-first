// R5 + R14. The intro.
//
// The canvas opens on "a year — not a probability". It does not say that here,
// and that is a requirement rather than a wording preference: R13 is `[!]` —
// nothing publishes a displacement date per occupation — so no year arrives at
// step 04. An intro that promises one makes an honest result screen read as
// broken rather than as finished.
//
// The claim is what the wizard actually does: report what the statistics say
// about the reader's occupation group, measured rather than forecast. R14's
// acceptance checks this copy for a year, a date or a countdown, in words as
// well as digits.
//
// The canvas's three capability chips are not here. They asserted the wizard's
// own virtues ("Every figure tiered", "Gaps shown as gaps") on the one screen
// with no figures and no gaps on it yet — the reader has nothing to check them
// against, and both are demonstrated two screens later by the tier badges and
// the stated absences themselves. R5 lists them, so the screen table in
// CLAUDE.md is updated with them rather than left describing a row that is
// gone.
export default function IntroScreen({ onStart }) {
  return (
    <div
      className="wz-pad"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <div style={{ paddingTop: 44 }}>
        <p className="wz-eyebrow" style={{ color: 'var(--accent)' }}>
          Measured, not forecast
        </p>
        <h1 className="wz-h1">
          What the data
          <br />
          says about
          <br />
          <em style={{ fontStyle: 'italic', color: 'var(--accent-hover)' }}>your work.</em>
        </h1>
        <p className="wz-lede" style={{ margin: '26px 0 0', maxWidth: '22em' }}>
          Two questions. You get what official labour statistics actually record
          about your occupation group in your country — every figure with its
          source and its year.
        </p>
      </div>
      <div style={{ paddingTop: 40 }}>
        <button type="button" className="wz-cta" onClick={onStart}>
          Start →
        </button>
        <p className="wz-meta" style={{ margin: '14px 0 0', textAlign: 'center', color: 'var(--muted)' }}>
          No account · Nothing stored
        </p>
      </div>
    </div>
  )
}
