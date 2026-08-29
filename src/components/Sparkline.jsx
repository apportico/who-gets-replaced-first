/** R17. Inline trend chart for one country's series over the panel years. */
export default function Sparkline({ points, color = '#2f7ec1', width = 150, height = 34, unit = '%' }) {
  const clean = (points || []).filter((p) => p.value !== null && p.value !== undefined);
  if (clean.length < 2) {
    return <span className="text-[10px] text-gray-400">not enough years of data</span>;
  }
  const years = clean.map((p) => p.year);
  const values = clean.map((p) => p.value);
  const [x0, x1] = [Math.min(...years), Math.max(...years)];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.15 || 1;
  const [yLo, yHi] = [lo - pad, hi + pad];

  const px = (y) => ((y - x0) / (x1 - x0 || 1)) * (width - 4) + 2;
  const py = (v) => height - 4 - ((v - yLo) / (yHi - yLo || 1)) * (height - 8);
  const d = clean.map((p, i) => `${i ? 'L' : 'M'}${px(p.year).toFixed(1)},${py(p.value).toFixed(1)}`).join(' ');
  const first = clean[0];
  const last = clean[clean.length - 1];
  const delta = last.value - first.value;

  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={height} className="flex-shrink-0 overflow-visible">
        <path
          d={`${d} L${px(last.year).toFixed(1)},${height - 2} L${px(first.year).toFixed(1)},${height - 2} Z`}
          fill={color}
          opacity="0.10"
        />
        <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx={px(last.year)} cy={py(last.value)} r="2.5" fill={color} />
      </svg>
      <div className="text-[10px] leading-tight">
        <div className="font-mono tabular-nums text-gray-700">
          {first.value.toFixed(1)} → {last.value.toFixed(1)}
          {unit}
        </div>
        <div
          className="font-mono tabular-nums"
          style={{ color: delta > 0.05 ? '#2f9e44' : delta < -0.05 ? '#e03131' : '#868e96' }}
        >
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(1)} pp · {x0}–{x1}
        </div>
      </div>
    </div>
  );
}
