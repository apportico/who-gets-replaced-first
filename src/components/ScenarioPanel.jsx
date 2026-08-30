import { fmtCompact } from '../utils/laborMetrics';

/** R15. Sensitivity tool, not a forecast. */
export default function ScenarioPanel({ rate, onRate, basis, onBasis, rows, world }) {
  const BASES = [
    { key: 'clerical_employed', label: 'Clerical only (ISCO 4)' },
    { key: 'white_collar_employed', label: 'All white collar (ISCO 1–4)' },
    { key: 'young_white_collar_employed', label: 'Entry-level white collar (15–24)' },
  ];

  const affected = (r) => (r[basis] != null ? (r[basis] * rate) / 100 : null);
  const worldAffected = affected(world);
  const top = rows
    .filter((r) => affected(r) != null)
    .sort((a, b) => affected(b) - affected(a))
    .slice(0, 8);

  return (
    <div className="p-3 border-b border-gray-200 bg-[var(--surface-accent)]">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase">Scenario</h2>
        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[var(--surface-accent)] text-[var(--text-accent)]">
          SENSITIVITY TOOL
        </span>
      </div>

      <div className="space-y-1 mb-2">
        {BASES.map((b) => (
          <button
            key={b.key}
            onClick={() => onBasis(b.key)}
            aria-pressed={basis === b.key}
            className={`w-full text-left px-2 py-1.5 min-h-[24px] rounded text-[11px] cursor-pointer transition-colors ${
              basis === b.key ? 'bg-gray-900 text-white' : 'text-[var(--text-secondary)] hover:bg-white'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <label className="block text-[11px] text-[var(--text-body)] mb-1">
        If <strong className="font-mono">{rate}%</strong> of these jobs were automated…
      </label>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={rate}
        onChange={(e) => onRate(Number(e.target.value))}
        aria-label="Share of these jobs automated, for the scenario"
        aria-valuetext={`${rate} percent`}
        className="w-full h-6 cursor-pointer accent-purple-700 mb-2"
      />

      <div className="bg-white rounded border border-purple-200 p-2 mb-2">
        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Worldwide</div>
        <div className="text-lg font-bold tabular-nums leading-tight">
          {worldAffected != null ? fmtCompact(worldAffected) : '—'}
        </div>
        <div className="text-[10px] text-[var(--text-faint)]">jobs in scope of the scenario</div>
      </div>

      <div className="space-y-0.5">
        {top.map((r) => (
          <div key={r.iso3} className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-secondary)] flex-1 truncate">{r.country_name}</span>
            <span className="text-[10px] font-mono tabular-nums text-[var(--text-primary)]">
              {fmtCompact(affected(r))}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[9px] text-[var(--text-accent)] bg-[var(--surface-accent)] border border-purple-200 rounded p-1.5 leading-snug">
        This is arithmetic on an occupation count, not a prediction. It says how many
        people hold these jobs today — nothing about whether, when, or how those jobs
        change. Automation of tasks is not elimination of roles.
      </p>
    </div>
  );
}
