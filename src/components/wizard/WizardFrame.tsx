// Spec 0019 R17. The static frame, rendered by BOTH the Suspense fallback and
// the real header — extracted rather than duplicated.
//
// An earlier draft of R17 had `WizardChrome` render the header a second time
// and closed the drift with a test asserting "the two produce the same static
// markup". That test cannot pass: the real header always renders the NN/04
// counter and, because `shown` is `Math.max(step, 1)`, always fills at least
// one segment — while the fallback must render neither. Taking it literally
// would put `01/04` into out/index.html, which is precisely the failure
// signature R17's acceptance 3 names.
//
// So the split is on the DATA SEAM, not the visual one:
//
//   above (here, prerendered)      below (client, needs the URL)
//   - the pulsing live dot         - the NN/04 counter
//   - "The Replacement Date"       - the segment FILLS
//   - the <header> element         - the step body
//   - the four track ELEMENTS
//
// Only a track's `background` is step-derived, so the layout is static and the
// fill is not. `step` is null in the fallback and a number in the real header.
export default function WizardFrame({
  step = null,
  children = null,
}: {
  /** `null` in the prerendered fallback, a step index in the real header.
   *  That single distinction is the data seam this component is split on. */
  step?: number | null
  children?: React.ReactNode
}) {
  const shown = step === null ? null : Math.max(step, 1)

  return (
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
        {/* Below the seam: absent from the prerendered HTML by construction. */}
        {shown !== null && (
          <span className="wz-meta" style={{ color: 'var(--muted)' }}>
            {String(shown).padStart(2, '0')}/04
          </span>
        )}
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
              // Unfilled in the fallback. R17 records the residue: because the
              // real header uses Math.max(step, 1), the running app never
              // paints four unfilled tracks, so this is a frame the app itself
              // never shows — corrected on hydration. That is the accepted
              // price of a prerendered shell, and it is much milder than the
              // wrong step painted and corrected.
              background: shown !== null && i <= shown ? 'var(--accent)' : 'var(--border)',
              transition: 'background 0.4s ease',
            }}
          />
        ))}
      </div>
      {children}
    </header>
  )
}
