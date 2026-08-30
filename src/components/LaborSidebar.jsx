import { METRICS, TIERS, rampStops, fmtMetric, NO_DATA_COLOR } from '../utils/laborMetrics';
import ScenarioPanel from './ScenarioPanel';

export default function LaborSidebar({
  metric, onMetricChange,
  regions, activeRegions, onToggleRegion,
  incomeGroups, activeIncome, onToggleIncome,
  search, onSearch,
  requireIsco, onToggleRequireIsco,
  aggregates, onSelectRow,
  counts, onReset,
  showCorridor, onToggleCorridor, corridorCount,
  scenario,
}) {
  const tier = TIERS[metric.tier];
  const stops = rampStops(metric);

  return (
    <div
      className="panel-scroll w-72 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0"
      role="region"
      aria-label="Map controls: metric, aggregates, scenario and filters"
    >
      {/* Metric picker */}
      <div className="p-3 border-b border-gray-200">
        <h2 className="text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-2">
          Metric
        </h2>
        <div className="space-y-0.5">
          {METRICS.map((m) => {
            const active = m.key === metric.key;
            const t = TIERS[m.tier];
            return (
              <button
                key={m.key}
                onClick={() => onMetricChange(m)}
                aria-pressed={active}
                className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 cursor-pointer transition-colors ${
                  active ? 'bg-gray-900 text-white' : 'text-[var(--text-body)] hover:bg-gray-100'
                }`}
              >
                <span className="flex-1 truncate">{m.label}</span>
                <span
                  className="text-[11px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{
                    backgroundColor: active ? 'rgba(255,255,255,0.18)' : `${t.color}1a`,
                    color: active ? '#fff' : t.color,
                  }}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected metric explainer + legend */}
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-[11px] font-bold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${tier.color}1a`, color: tier.color }}
          >
            {tier.label}
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">{tier.blurb}</span>
        </div>
        <p className="text-[11px] text-[var(--text-body)] leading-snug mb-2">{metric.blurb}</p>
        {metric.caveat && (
          <p
            className="text-[10px] leading-snug rounded p-1.5 mb-2 border"
            style={{
              color: tier.color,
              backgroundColor: `${tier.color}0f`,
              borderColor: `${tier.color}33`,
            }}
          >
            {metric.caveat}
          </p>
        )}
        <div className="flex h-3 rounded overflow-hidden">
          {stops.map((s) => (
            <div key={s.color} className="flex-1" style={{ backgroundColor: s.color }} />
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-[var(--text-muted)] mt-0.5 font-mono">
          <span>{fmtMetric(metric, metric.domain[0])}</span>
          <span>
            {fmtMetric(metric, metric.domain[1])}+
            {metric.scale === 'log' && <span className="text-[var(--text-faint)]"> (log)</span>}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <i
            className="w-3 h-3 rounded-full border border-gray-300"
            style={{ backgroundColor: NO_DATA_COLOR }}
          />
          <span className="text-[10px] text-[var(--text-muted)]">no data — kept, never imputed</span>
        </div>
        <p className="text-[10px] text-[var(--text-faint)] mt-1.5 leading-snug">
          Circle size = number of employed people.
        </p>
      </div>

      {/* Aggregates */}
      <div className="p-3 border-b border-gray-200">
        <h2 className="text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-2">
          Aggregates
        </h2>
        <p className="text-[10px] text-[var(--text-faint)] mb-2 leading-snug">
          Employment-weighted, not simple averages. Coverage = share of the group&apos;s
          employment in countries reporting occupation data.
        </p>
        <div className="space-y-0.5">
          {aggregates.map((a) => (
            <button
              key={a.iso3}
              onClick={() => onSelectRow(a)}
              className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 cursor-pointer flex items-center gap-2"
            >
              <span className="text-[11px] text-[var(--text-body)] flex-1 truncate">{a.country_name}</span>
              <span className="text-[11px] font-mono tabular-nums font-semibold text-[var(--text-primary)]">
                {fmtMetric(metric, a[metric.key])}
              </span>
              {a.isco_coverage_pct_of_employment != null && (
                <span className="text-[9px] font-mono text-[var(--text-faint)] w-8 text-right">
                  {a.isco_coverage_pct_of_employment.toFixed(0)}%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {scenario && (
        <ScenarioPanel
          rate={scenario.rate}
          onRate={scenario.onRate}
          basis={scenario.basis}
          onBasis={scenario.onBasis}
          rows={scenario.rows}
          world={scenario.world}
        />
      )}

      {/* Filters */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase">Filters</h2>
          <button
            onClick={onReset}
            className="text-[10px] text-[var(--text-faint)] hover:text-[var(--text-body)] cursor-pointer"
          >
            reset
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search country or ISO3…"
          aria-label="Search countries by name or ISO3 code"
          className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded mb-2 focus:outline-none focus:border-gray-400"
        />
        <label className="flex items-center gap-2 mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showCorridor}
            onChange={onToggleCorridor}
            className="cursor-pointer"
          />
          <span className="text-[11px] text-[var(--text-body)]">
            Ring the {corridorCount} corridor-board states
          </span>
        </label>
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={requireIsco}
            onChange={onToggleRequireIsco}
            className="cursor-pointer"
          />
          <span className="text-[11px] text-[var(--text-body)]">Only countries with occupation data</span>
        </label>

        <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Region</h3>
        <div className="space-y-0.5 mb-3">
          {regions.map((r) => (
            <button
              key={r}
              onClick={() => onToggleRegion(r)}
              aria-pressed={activeRegions.has(r)}
              className={`w-full text-left px-2 py-1 rounded text-[11px] cursor-pointer transition-colors ${
                activeRegions.has(r) ? 'bg-[var(--surface-info)] text-[var(--text-info)] font-medium' : 'text-[var(--text-secondary)] hover:bg-gray-100'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">Income group</h3>
        <div className="space-y-0.5">
          {incomeGroups.map((g) => (
            <button
              key={g}
              onClick={() => onToggleIncome(g)}
              aria-pressed={activeIncome.has(g)}
              className={`w-full text-left px-2 py-1 rounded text-[11px] cursor-pointer transition-colors ${
                activeIncome.has(g) ? 'bg-[var(--surface-info)] text-[var(--text-info)] font-medium' : 'text-[var(--text-secondary)] hover:bg-gray-100'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 text-[10px] text-[var(--text-muted)] leading-snug">
        <p className="mb-1">
          <strong className="text-[var(--text-body)]">{counts.shown}</strong> of {counts.total} countries
          shown · <strong className="text-[var(--text-body)]">{counts.withIsco}</strong> with occupation data
        </p>
        <p className="text-[var(--text-faint)]">
          Sources: World Bank Open Data (population, labor, sector) and ILOSTAT SDMX
          (occupation, youth × occupation, LFP by age). AI exposure weights are ours,
          not official statistics. Full field documentation in{' '}
          <code className="text-[var(--text-muted)]">pipeline/README.md</code>.
        </p>
      </div>
    </div>
  );
}
