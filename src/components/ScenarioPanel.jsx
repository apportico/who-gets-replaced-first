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
    <div className="p-3 border-b border-gray-200 bg-purple-50/40">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">Scenario</h3>
        <span className="text-[8px] font-bold px-1 py-px rounded bg-purple-100 text-purple-700">
          SENSITIVITY TOOL
        </span>
      </div>

      <div className="space-y-1 mb-2">
        {BASES.map((b) => (
          <button
            key={b.key}
            onClick={() => onBasis(b.key)}
            className={`w-full text-left px-2 py-1 rounded text-[11px] cursor-pointer transition-colors ${
              basis === b.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-white'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <label className="block text-[11px] text-gray-700 mb-1">
        If <strong className="font-mono">{rate}%</strong> of these jobs were automated…
      </label>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={rate}
        onChange={(e) => onRate(Number(e.target.value))}
        className="w-full cursor-pointer accent-purple-700 mb-2"
      />

      <div className="bg-white rounded border border-purple-200 p-2 mb-2">
        <div className="text-[10px] text-gray-500 uppercase tracking-wide">Worldwide</div>
        <div className="text-lg font-bold tabular-nums leading-tight">
          {worldAffected != null ? fmtCompact(worldAffected) : '—'}
        </div>
        <div className="text-[10px] text-gray-400">jobs in scope of the scenario</div>
      </div>

      <div className="space-y-0.5">
        {top.map((r) => (
          <div key={r.iso3} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-600 flex-1 truncate">{r.country_name}</span>
            <span className="text-[10px] font-mono tabular-nums text-gray-800">
              {fmtCompact(affected(r))}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[9px] text-purple-800 bg-purple-100/60 border border-purple-200 rounded p-1.5 leading-snug">
        This is arithmetic on an occupation count, not a prediction. It says how many
        people hold these jobs today — nothing about whether, when, or how those jobs
        change. Automation of tasks is not elimination of roles.
      </p>
    </div>
  );
}
