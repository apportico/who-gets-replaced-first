/** Inline trend chart for one country's series. Kept by 0010 R1 and reused by
 *  R12 rather than writing a second one.
 *
 *  Restyled onto the canvas tokens — it carried light-theme greys from the map.
 *  Two additions for R12: the generative-AI marker line, and the `draw`
 *  animation from the design's motion set.
 */
export default function Sparkline({
  points,
  width = 280,
  height = 58,
  unit = '%',
  markerYear = null,
}) {
  const clean = (points || []).filter((p) => p.value !== null && p.value !== undefined)
  if (clean.length < 2) {
    return <span className="wz-note">Not enough years of data to draw a trend.</span>
  }
  const years = clean.map((p) => p.year)
  const values = clean.map((p) => p.value)
  const [x0, x1] = [Math.min(...years), Math.max(...years)]
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo) * 0.15 || 1
  const [yLo, yHi] = [lo - pad, hi + pad]

  const px = (y) => ((y - x0) / (x1 - x0 || 1)) * (width - 4) + 2
  const py = (v) => height - 8 - ((v - yLo) / (yHi - yLo || 1)) * (height - 22)
  const d = clean
    .map((p, i) => `${i ? 'L' : 'M'}${px(p.year).toFixed(1)},${py(p.value).toFixed(1)}`)
    .join(' ')
  const first = clean[0]
  const last = clean[clean.length - 1]
  const delta = last.value - first.value

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height, overflow: 'visible' }}
        role="img"
        aria-label={`${first.value.toFixed(1)}${unit} in ${x0} to ${last.value.toFixed(1)}${unit} in ${x1}`}
      >
        {markerYear !== null && markerYear >= x0 && markerYear <= x1 && (
          <line
            x1={px(markerYear)} y1={2} x2={px(markerYear)} y2={height - 2}
            stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 4"
          />
        )}
        <path
          d={d} fill="none" stroke="var(--fg)" strokeWidth="1.6"
          strokeLinejoin="round" strokeDasharray="400"
          style={{ animation: 'draw 1.2s ease both' }}
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={px(last.year)} cy={py(last.value)} r="3.2" fill="var(--accent)" />
      </svg>
      <p className="wz-note" style={{ margin: '10px 0 0', fontFamily: 'var(--font-mono)' }}>
        {first.value.toFixed(1)} → {last.value.toFixed(1)}
        {unit} · {delta >= 0 ? '+' : ''}
        {delta.toFixed(1)} pp · {x0}–{x1}
      </p>
    </div>
  )
}
