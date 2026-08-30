import { useEffect, useRef } from 'react';

/** R13. Year scrubber driving the map and ranking from the time-series panel. */
export default function LaborTimeline({ years, year, onChange, playing, onTogglePlay, coverage }) {
  const timer = useRef(null);

  useEffect(() => {
    if (!playing) return undefined;
    timer.current = setInterval(() => {
      onChange((prev) => {
        if (prev === null) return years[0];
        const i = years.indexOf(prev);
        return i >= years.length - 1 ? years[0] : years[i + 1];
      });
    }, 900);
    return () => clearInterval(timer.current);
  }, [playing, years, onChange]);

  const isLatest = year === null;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-gray-100 bg-white flex-shrink-0">
      <button
        onClick={onTogglePlay}
        disabled={isLatest}
        className={`text-xs w-6 h-6 rounded flex items-center justify-center transition-colors ${
          isLatest
            ? 'text-[var(--text-disabled)] cursor-not-allowed'
            : 'text-[var(--text-body)] hover:bg-gray-100 cursor-pointer'
        }`}
        title={isLatest ? 'Pick a year to animate' : playing ? 'Pause' : 'Play'}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      <button
        onClick={() => onChange(null)}
        className={`text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors ${
          isLatest ? 'bg-gray-900 text-white' : 'text-[var(--text-muted)] hover:bg-gray-100'
        }`}
        title="Most recent year available per country — years differ between countries"
      >
        Latest
      </button>

      <input
        type="range"
        min={0}
        max={years.length - 1}
        step={1}
        value={isLatest ? years.length - 1 : years.indexOf(year)}
        onChange={(e) => onChange(years[Number(e.target.value)])}
        className="flex-1 cursor-pointer accent-gray-900"
      />

      <span className="text-xs font-mono font-bold tabular-nums w-24 text-right">
        {isLatest ? 'mixed years' : year}
      </span>

      {!isLatest && coverage != null && (
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            coverage < 50 ? 'bg-[var(--surface-alert)] text-[var(--text-alert)]' : 'bg-gray-100 text-[var(--text-muted)]'
          }`}
          title="Share of world employment covered by countries reporting occupation data this year. Low coverage means year-to-year movement is composition change, not real change."
        >
          {coverage.toFixed(0)}% cov
        </span>
      )}
    </div>
  );
}
