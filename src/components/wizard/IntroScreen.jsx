// R5 + R14. The intro.
//
// The canvas opens on "a year — not a probability". It does not say that here,
// and that is a requirement rather than a wording preference: R13 is `[!]` —
// nothing publishes a displacement date per occupation — so no year arrives at
// step 04. An intro that promises one makes an honest result screen read as
// broken rather than as finished.
//
// **What the claim must not do is read as reassurance.** R5's fourth revision
// note records the round that got this wrong. "No date is published" is true,
// and framed as the headline it argues the reader is safe, which is the
// opposite of what this screen exists to say. The absence of a date is not an
// absence of a trajectory: some of the nine group series are already falling
// (UK clerical runs 10.0% in 2013 to 8.9% in 2025, DERIVED, and the result
// screen draws it), and the number is the last place the fall shows up. It is
// a net figure, so displacement offsets against demand growth inside it (see
// `ResultScreen`, the back-test panel), and the occupation vintage runs years
// behind the reader.
//
// So the claim is the site's own question, in the direction the series point:
// nine groups, one of them goes first, and the lede says why the count will
// reach the reader late. What it must not do is name a date for it.
//
// R14's acceptance still holds over every word of it: no year, no date and no
// countdown, in words as well as digits.
//
// The canvas's three capability chips are deliberately not here — R5's second
// revision note says why, and `wizard.render.test.jsx` holds them out.
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
          Nine groups.
          <br />
          One goes first.
          <br />
          <em style={{ fontStyle: 'italic', color: 'var(--accent-hover)' }}>Is yours next?</em>
        </h1>
        <p className="wz-lede" style={{ margin: '26px 0 0', maxWidth: '22em' }}>
          Some of these nine lines are already falling. But official statistics
          count you years late, and net your losses against someone else&apos;s
          gains, so the fall reaches you before it reaches the number. Two
          questions, and you see your group&apos;s line.
        </p>
      </div>
      <div style={{ paddingTop: 40 }}>
        {/* The face names what the reader receives. `Start →` named the
            mechanism and left the object to be guessed, and it is also the
            string the result screen's `Start again` carries — the two are now
            distinguishable by name, which is how the tests select them. */}
        <button type="button" className="wz-cta" onClick={onStart}>
          Find my group →
        </button>
        <p className="wz-meta" style={{ margin: '14px 0 0', textAlign: 'center', color: 'var(--muted)' }}>
          No account · Nothing stored
        </p>
      </div>
    </div>
  )
}
