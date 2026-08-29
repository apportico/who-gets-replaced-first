import { useState, useMemo, useCallback } from 'react';
import laborData from '../data/global_labor.json';
import { PANEL_YEARS, rowForYear, coverageForYear } from '../utils/laborPanel';
import LaborMap from './LaborMap';
import LaborSidebar from './LaborSidebar';
import LaborDetailPanel from './LaborDetailPanel';
import LaborTimeline from './LaborTimeline';
import { CORRIDOR_STATES } from '../utils/corridorStates';
import { METRICS, TIERS, fmt, fmtCompact, fmtMetric, colorFor, normalise } from '../utils/laborMetrics';

const ALL_ROWS = laborData.rows;
const COUNTRIES = ALL_ROWS.filter((r) => r.row_type === 'country');
const MAPPABLE = COUNTRIES.filter((r) => r.lat != null && r.lon != null);
const AGGREGATES = ALL_ROWS.filter((r) => r.row_type !== 'country');
const WORLD = AGGREGATES.find((r) => r.iso3 === 'WLD');

const REGIONS = [...new Set(COUNTRIES.map((r) => r.region))].filter(Boolean).sort();
const INCOME_GROUPS = [...new Set(COUNTRIES.map((r) => r.income_group))].filter(Boolean).sort();

const AGG_ORDER = ['WLD', 'NAC', 'ECS', 'EAS', 'SAS', 'MEA', 'LCN', 'SSF', 'EU27', 'OECD', 'G20'];
const SORTED_AGGREGATES = AGG_ORDER
  .map((code) => AGGREGATES.find((a) => a.iso3 === code))
  .filter(Boolean);

function HeadlineStat({ label, value, sub, tier }) {
  const t = tier ? TIERS[tier] : null;
  return (
    <div className="px-4 py-2 border-r border-gray-200 last:border-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
          {label}
        </span>
        {t && (
          <span
            className="text-[8px] font-bold px-1 py-px rounded"
            style={{ backgroundColor: `${t.color}1a`, color: t.color }}
          >
            {t.label}
          </span>
        )}
      </div>
      <div className="text-lg font-bold leading-tight tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 leading-tight">{sub}</div>}
    </div>
  );
}

export default function LaborPage() {
  const [metric, setMetric] = useState(METRICS[0]);
  const [selected, setSelected] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [activeRegions, setActiveRegions] = useState(new Set());
  const [activeIncome, setActiveIncome] = useState(new Set());
  const [requireIsco, setRequireIsco] = useState(false);
  const [year, setYear] = useState(null);          // null = latest per country
  const [playing, setPlaying] = useState(false);
  const [showCorridor, setShowCorridor] = useState(false);
  const [scenarioRate, setScenarioRate] = useState(30);
  const [scenarioBasis, setScenarioBasis] = useState('clerical_employed');

  const toggle = (setter) => (value) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MAPPABLE.map((r) => rowForYear(r, year)).filter((r) => {
      if (activeRegions.size && !activeRegions.has(r.region)) return false;
      if (activeIncome.size && !activeIncome.has(r.income_group)) return false;
      if (requireIsco && r.white_collar_pct == null) return false;
      if (q && !(r.country_name.toLowerCase().includes(q) || r.iso3.toLowerCase().includes(q)))
        return false;
      return true;
    });
  }, [search, activeRegions, activeIncome, requireIsco, year]);

  const ranked = useMemo(
    () =>
      filtered
        .filter((r) => r[metric.key] != null)
        .sort((a, b) => b[metric.key] - a[metric.key]),
    [filtered, metric],
  );

  const worldRow = useMemo(() => rowForYear(WORLD, year), [year]);
  const yearCoverage = coverageForYear(year);

  const handleSelect = useCallback((row) => {
    setSelected(row);
    if (row.lat != null) setFlyTarget({ lat: row.lat, lon: row.lon, iso3: row.iso3 });
  }, []);

  const reset = useCallback(() => {
    setSearch('');
    setActiveRegions(new Set());
    setActiveIncome(new Set());
    setRequireIsco(false);
    setYear(null);
    setPlaying(false);
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Global headline strip */}
      <div className="flex items-stretch border-b border-gray-200 bg-white overflow-x-auto flex-shrink-0">
        <HeadlineStat
          label="World population"
          value={fmtCompact(worldRow?.population_total)}
          sub={`${fmt(worldRow?.pop_0_14_pct)}% children · ${fmt(worldRow?.pop_65plus_pct)}% 65+`}
          tier="official"
        />
        <HeadlineStat
          label="Works at all"
          value={`${fmt(worldRow?.employed_share_of_population_pct)}%`}
          sub={`${fmtCompact(worldRow?.employed_total)} employed`}
          tier="derived"
        />
        <HeadlineStat
          label="White collar (ISCO 1–4)"
          value={`${fmt(worldRow?.white_collar_pct)}%`}
          sub={`of employment · ${fmt(worldRow?.isco_coverage_pct_of_employment, 0)}% coverage`}
          tier="official"
        />
        <HeadlineStat
          label="Professional core"
          value={`${fmt(worldRow?.professional_core_pct)}%`}
          sub="ISCO 1–2 only"
          tier="official"
        />
        <HeadlineStat
          label="Entry-level white collar"
          value={`${fmt(worldRow?.young_white_collar_pct)}%`}
          sub="employed 15–24 in ISCO 1–4"
          tier="proxy"
        />
        <HeadlineStat
          label="AI exposure index"
          value={fmt(worldRow?.ai_exposure_weighted_score, 3)}
          sub="weighted by occupation mix"
          tier="modeled"
        />
        <div className="flex-1 min-w-[220px] px-4 py-2 flex items-center">
          <p className="text-[10px] text-gray-500 leading-snug">
            <strong className="text-gray-700">Read the badges.</strong> OFFICIAL are published
            statistics. PROXY and MODELED are constructed stand-ins — the entry-level and AI
            exposure figures are not measurements. World occupation figures cover{' '}
            {fmt(worldRow?.isco_coverage_pct_of_employment, 0)}% of global employment; China
            publishes no ISCO breakdown.
          </p>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <LaborSidebar
          metric={metric}
          onMetricChange={setMetric}
          regions={REGIONS}
          activeRegions={activeRegions}
          onToggleRegion={toggle(setActiveRegions)}
          incomeGroups={INCOME_GROUPS}
          activeIncome={activeIncome}
          onToggleIncome={toggle(setActiveIncome)}
          search={search}
          onSearch={setSearch}
          requireIsco={requireIsco}
          onToggleRequireIsco={() => setRequireIsco((v) => !v)}
          aggregates={SORTED_AGGREGATES}
          onSelectRow={handleSelect}
          counts={{
            shown: filtered.length,
            total: MAPPABLE.length,
            withIsco: filtered.filter((r) => r.white_collar_pct != null).length,
          }}
          onReset={reset}
          showCorridor={showCorridor}
          onToggleCorridor={() => setShowCorridor((v) => !v)}
          corridorCount={CORRIDOR_STATES.size}
          scenario={{
            rate: scenarioRate, onRate: setScenarioRate,
            basis: scenarioBasis, onBasis: setScenarioBasis,
            rows: filtered, world: worldRow,
          }}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <LaborTimeline
            years={PANEL_YEARS}
            year={year}
            onChange={setYear}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            coverage={yearCoverage}
          />

          <div className="flex-1 min-h-0 relative">
            <LaborMap
              rows={filtered}
              metric={metric}
              selected={selected}
              onSelect={handleSelect}
              flyTarget={flyTarget}
              corridorStates={showCorridor ? CORRIDOR_STATES : null}
            />
          </div>

          {/* Ranking strip */}
          <div className="h-36 border-t border-gray-200 bg-white flex flex-col flex-shrink-0">
            <div className="px-3 py-1.5 border-b border-gray-100 flex items-center gap-2">
              <h3 className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">
                Ranked by {metric.short}
              </h3>
              <span className="text-[10px] text-gray-400">
                {ranked.length} countries with data · click to inspect
              </span>
            </div>
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="flex h-full items-end gap-px px-3 pb-2 pt-1">
                {ranked.map((r, i) => {
                  const h = Math.max(4, normalise(metric, r[metric.key]) * 100);
                  const isSel = selected?.iso3 === r.iso3;
                  return (
                    <button
                      key={r.iso3}
                      onClick={() => handleSelect(r)}
                      title={`${i + 1}. ${r.country_name} — ${fmtMetric(metric, r[metric.key])}`}
                      className="group relative flex-shrink-0 w-[9px] cursor-pointer flex flex-col justify-end h-full"
                    >
                      <div
                        style={{
                          height: `${h}%`,
                          backgroundColor: colorFor(metric, r[metric.key]),
                          outline: isSel ? '2px solid #111827' : 'none',
                        }}
                        className="w-full rounded-t-sm transition-all group-hover:brightness-90"
                      />
                      <span className="absolute -bottom-0 left-1/2 -translate-x-1/2 text-[7px] font-mono text-gray-400 rotate-0">
                        {isSel ? '▲' : ''}
                      </span>
                    </button>
                  );
                })}
                {!ranked.length && (
                  <p className="text-xs text-gray-400 self-center">
                    No countries match the current filters with data for this metric.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <LaborDetailPanel
          row={selected ? rowForYear(selected, year) : null}
          year={year}
          onCorridorBoard={selected ? CORRIDOR_STATES.has(selected.iso3) : false}
        onClose={() => setSelected(null)}
        />
      </div>
    </div>
  );
}
