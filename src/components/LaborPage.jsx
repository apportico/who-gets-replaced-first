import { useState, useMemo, useCallback } from 'react';
import laborData from '../data/global_labor.json';
import { PANEL_YEARS, rowForYear, coverageForYear } from '../utils/laborPanel';
import LaborMap from './LaborMap';
import LaborSidebar from './LaborSidebar';
import LaborDetailPanel from './LaborDetailPanel';
import LaborTimeline from './LaborTimeline';
import BottomSheet from './BottomSheet';
import { CORRIDOR_STATES } from '../utils/corridorStates';
import { mapTextEntries, mapSummary } from '../utils/mapText';
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
        <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
          {label}
        </span>
        {t && (
          <span
            className="text-[11px] font-bold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${t.color}1a`, color: t.color }}
          >
            {t.label}
          </span>
        )}
      </div>
      <div className="text-lg font-bold leading-tight tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-faint)] leading-tight">{sub}</div>}
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
          <p className="text-[10px] text-[var(--text-muted)] leading-snug">
            <strong className="text-[var(--text-body)]">Read the badges.</strong> OFFICIAL are published
            statistics. PROXY and MODELED are constructed stand-ins — the entry-level and AI
            exposure figures are not measurements. World occupation figures cover{' '}
            {fmt(worldRow?.isco_coverage_pct_of_employment, 0)}% of global employment; China
            publishes no ISCO breakdown.
          </p>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative">
        <BottomSheet title="Metric, filters and scenario">
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
        </BottomSheet>

        <div className="flex-1 flex flex-col min-w-0">
          <LaborTimeline
            years={PANEL_YEARS}
            year={year}
            onChange={setYear}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            coverage={yearCoverage}
          />

          {/* Spec 0008 R3. The choropleth conveys nothing to a screen reader,
              and its colour is unreliable to sighted readers too — the lightest
              ramp step sits ΔE00 3.7 from the no-data grey. This region names
              what is plotted and points at a text equivalent carrying every
              country's value and tier. Built by a pure function so the content
              is asserted without a DOM. */}
          <div
            className="flex-1 min-h-0 relative"
            role="region"
            aria-label={mapSummary(filtered, metric)}
          >
            <LaborMap
              rows={filtered}
              metric={metric}
              selected={selected}
              onSelect={handleSelect}
              flyTarget={flyTarget}
              corridorStates={showCorridor ? CORRIDOR_STATES : null}
            />
            {/* Its own labelled region, NOT the map's aria-describedby.
                `describedby` is announced as one continuous description, so
                pointing it at 218 entries would read the entire dataset aloud
                before the user could do anything. As a region it is navigable:
                a screen-reader user reaches it deliberately, and skips it just
                as deliberately. The map's own name already carries the summary
                and the coverage count. */}
            <section className="sr-only" aria-label={`${metric.label} by country — text equivalent`}>
              <ul>
                {mapTextEntries(filtered, metric).map((e) => (
                  <li key={e.iso3}>{e.text}</li>
                ))}
              </ul>
            </section>
          </div>

          {/* Ranking strip */}
          <div className="h-36 border-t border-gray-200 bg-white flex flex-col flex-shrink-0">
            <div className="px-3 py-1.5 border-b border-gray-100 flex items-center gap-2">
              <h2 className="text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
                Ranked by {metric.short}
              </h2>
              <span className="text-[10px] text-[var(--text-faint)]">
                {ranked.length} countries with data · click to inspect
              </span>
            </div>
            {/* Spec 0008 R2 + R6. This is the keyboard path to a country:
                Leaflet's CircleMarker is a bare SVG path with no tabindex and no
                keyboard option (only Marker has those), so the map can never be
                driven by keyboard and a list has to carry it. One tab stop for
                the whole strip, arrows to move, Enter or Space to select —
                which is how a listbox is expected to behave, rather than 218
                separate tab stops.

                Each option is 24px wide below `md` to meet R6's target size;
                the strip already scrolls horizontally, so the bars simply get
                wider rather than the chart losing entries. Above `md` they stay
                9px, where a mouse is the pointer. */}
            <div
              className="flex-1 overflow-x-auto overflow-y-hidden"
              role="listbox"
              tabIndex={0}
              aria-label={`Countries ranked by ${metric.label}, highest first`}
              aria-activedescendant={selected ? `rank-${selected.iso3}` : undefined}
              onKeyDown={(e) => {
                if (!ranked.length) return;
                const at = ranked.findIndex((r) => r.iso3 === selected?.iso3);
                let next = null;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = at < 0 ? 0 : Math.min(at + 1, ranked.length - 1);
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = at < 0 ? 0 : Math.max(at - 1, 0);
                else if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = ranked.length - 1;
                else if ((e.key === 'Enter' || e.key === ' ') && at >= 0) next = at;
                if (next === null) return;
                e.preventDefault();
                handleSelect(ranked[next]);
              }}
            >
              <div className="flex h-full items-end gap-px px-3 pb-2 pt-1">
                {ranked.map((r, i) => {
                  const h = Math.max(4, normalise(metric, r[metric.key]) * 100);
                  const isSel = selected?.iso3 === r.iso3;
                  return (
                    <button
                      key={r.iso3}
                      id={`rank-${r.iso3}`}
                      role="option"
                      aria-selected={isSel}
                      tabIndex={-1}
                      onClick={() => handleSelect(r)}
                      aria-label={`${i + 1}. ${r.country_name}, ${fmtMetric(metric, r[metric.key])}`}
                      title={`${i + 1}. ${r.country_name} — ${fmtMetric(metric, r[metric.key])}`}
                      className="group relative flex-shrink-0 w-6 md:w-[9px] cursor-pointer flex flex-col justify-end h-full"
                    >
                      <div
                        style={{
                          height: `${h}%`,
                          backgroundColor: colorFor(metric, r[metric.key]),
                          outline: isSel ? '2px solid #111827' : 'none',
                        }}
                        className="w-full rounded-t-sm transition-all group-hover:brightness-90"
                      />
                      <span className="absolute -bottom-0 left-1/2 -translate-x-1/2 text-[7px] font-mono text-[var(--text-faint)] rotate-0">
                        {isSel ? '▲' : ''}
                      </span>
                    </button>
                  );
                })}
                {!ranked.length && (
                  <p className="text-xs text-[var(--text-faint)] self-center">
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
