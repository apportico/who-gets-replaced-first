import {
  ISCO_GROUPS, TIERS, fmt, fmtInt, fmtCompact, qualityTone,
} from '../utils/laborMetrics';
import Sparkline from './Sparkline';
import { seriesFor } from '../utils/laborPanel';

function Section({ title, tier, children }) {
  const t = tier ? TIERS[tier] : null;
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">{title}</h3>
        {t && (
          <span
            className="text-[9px] font-bold px-1.5 py-px rounded"
            style={{ backgroundColor: `${t.color}1a`, color: t.color }}
          >
            {t.label}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, strong, hint }) {
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-gray-100 last:border-0">
      <span className={`text-xs ${strong ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
        {label}
        {hint && <span className="block text-[10px] text-gray-400 leading-tight">{hint}</span>}
      </span>
      <span className={`text-xs font-mono tabular-nums ml-3 ${strong ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  );
}

/** Population split into children / working age / 65+ */
function AgeBar({ row }) {
  const parts = [
    { pct: row.pop_0_14_pct, color: '#8bcdc2', label: '0–14' },
    { pct: row.pop_15_64_pct, color: '#2f7ec1', label: '15–64' },
    { pct: row.pop_65plus_pct, color: '#b5651d', label: '65+' },
  ].filter((p) => p.pct != null);
  if (!parts.length) return <p className="text-xs text-gray-400">No age structure data.</p>;
  return (
    <>
      <div className="flex h-6 rounded overflow-hidden mb-1.5">
        {parts.map((p) => (
          <div
            key={p.label}
            style={{ width: `${p.pct}%`, backgroundColor: p.color }}
            className="flex items-center justify-center"
            title={`${p.label}: ${p.pct.toFixed(1)}%`}
          >
            {p.pct > 9 && (
              <span className="text-[9px] font-bold text-white">{p.pct.toFixed(0)}%</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-3 text-[10px] text-gray-500">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1">
            <i className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: p.color }} />
            {p.label}
          </span>
        ))}
      </div>
    </>
  );
}

/** Population -> working age -> labor force -> employed -> white collar */
function Funnel({ row }) {
  const pop = row.population_total;
  if (!pop) return <p className="text-xs text-gray-400">No population data.</p>;
  const workingAge = row.pop_15_64_pct != null ? (pop * row.pop_15_64_pct) / 100 : null;
  const steps = [
    { label: 'Total population', v: pop, color: '#cbd5e1' },
    { label: 'Working age (15–64)', v: workingAge, color: '#8bcdc2' },
    { label: 'In the labor force', v: row.labor_force_total, color: '#5a9ed6' },
    { label: 'Employed', v: row.employed_total, color: '#2f7ec1' },
    { label: 'White collar (ISCO 1–4)', v: row.white_collar_employed, color: '#1a5490' },
  ];
  return (
    <div className="space-y-1">
      {steps.map((s) => (
        <div key={s.label}>
          <div className="flex justify-between text-[10px] text-gray-600 mb-0.5">
            <span>{s.label}</span>
            <span className="font-mono tabular-nums">
              {fmtCompact(s.v)}
              {s.v != null && <span className="text-gray-400"> · {((s.v / pop) * 100).toFixed(1)}%</span>}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-sm overflow-hidden">
            <div
              className="h-full rounded-sm"
              style={{ width: `${s.v != null ? Math.min(100, (s.v / pop) * 100) : 0}%`, backgroundColor: s.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function OccupationBreakdown({ row }) {
  if (row.white_collar_pct == null) {
    return (
      <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded p-2">
        No ISCO-08 occupation breakdown published for this country. The row is kept
        with nulls rather than estimated — nothing here is imputed.
      </p>
    );
  }
  const groups = ISCO_GROUPS.map((g) => ({ ...g, pct: row[g.key] })).filter((g) => g.pct != null);
  return (
    <>
      <div className="flex h-7 rounded overflow-hidden mb-1">
        {groups.map((g) => (
          <div
            key={g.key}
            style={{ width: `${g.pct}%`, backgroundColor: g.color }}
            title={`${g.n}. ${g.label}: ${g.pct.toFixed(1)}%`}
          >
            {g.pct > 7 && (
              <span className="text-[9px] font-bold text-white block text-center leading-7">{g.n}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mb-2">
        <span>&larr; ISCO 1–4 white collar ({fmt(row.white_collar_pct)}%)</span>
        <span>ISCO 5–9 ({fmt(row.blue_collar_service_pct)}%) &rarr;</span>
      </div>
      <div className="space-y-0.5">
        {groups.map((g) => (
          <div key={g.key} className="flex items-center gap-2">
            <i className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: g.color }} />
            <span className="text-[11px] text-gray-600 flex-1 truncate" title={g.label}>
              {g.n}. {g.label}
            </span>
            <span className="text-[11px] font-mono tabular-nums text-gray-800">
              {g.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
      {row.isco_groups_reported != null && row.isco_groups_reported < 9 && (
        <p className="mt-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5">
          Source reports only {row.isco_groups_reported} of 9 major groups — the national
          classification folds the missing group into another one.
        </p>
      )}
      {row.isco_classified_share_pct != null && row.isco_classified_share_pct < 90 && (
        <p className="mt-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5">
          Only {row.isco_classified_share_pct.toFixed(0)}% of employment is classified by
          occupation. Shares above describe the classified portion only.
        </p>
      )}
    </>
  );
}

/** R11. White-collar share at each career stage — where the office jobs sit by age. */
function CareerStages({ row }) {
  const stages = [
    { label: 'Youth 15–24', v: row.young_white_collar_pct, color: '#f7bd6f' },
    { label: 'Prime 25–54', v: row.prime_white_collar_pct, color: '#2f7ec1' },
    { label: 'Late 55–64', v: row.late_career_white_collar_pct, color: '#5a9ed6' },
    { label: 'All ages', v: row.white_collar_pct, color: '#1a5490' },
  ];
  if (!stages.some((s) => s.v != null)) {
    return <p className="text-xs text-gray-400">No career-stage breakdown published.</p>;
  }
  return (
    <div className="space-y-1">
      {stages.map((s) => (
        <div key={s.label}>
          <div className="flex justify-between text-[10px] text-gray-600 mb-0.5">
            <span>{s.label}</span>
            <span className="font-mono tabular-nums">{fmt(s.v)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-sm overflow-hidden">
            <div
              className="h-full rounded-sm"
              style={{ width: `${s.v != null ? Math.min(100, s.v) : 0}%`, backgroundColor: s.color }}
            />
          </div>
        </div>
      ))}
      {row.young_white_collar_pct != null && row.prime_white_collar_pct != null && (
        <p className="text-[10px] text-gray-500 pt-1 leading-snug">
          Youth are{' '}
          <strong>
            {fmt(Math.abs(row.prime_white_collar_pct - row.young_white_collar_pct))}pp{' '}
            {row.young_white_collar_pct < row.prime_white_collar_pct ? 'less' : 'more'}
          </strong>{' '}
          white-collar than prime-age workers — entry-level work is
          {row.young_white_collar_pct < row.prime_white_collar_pct
            ? ' concentrated in service, sales and elementary jobs.'
            : ' unusually office-based here.'}
        </p>
      )}
    </div>
  );
}

/** R17. Trends over the panel years — the clearest payoff from the time series. */
function Trends({ iso3 }) {
  const charts = [
    { field: 'white_collar_pct', label: 'White collar (ISCO 1–4)', color: '#1a5490' },
    { field: 'isco4_clerical_pct', label: 'Clerical support (ISCO 4)', color: '#dd6a21' },
    { field: 'young_white_collar_pct', label: 'Youth white collar (15–24)', color: '#f59f00' },
    { field: 'emp_services_pct', label: 'Services employment', color: '#2d9384' },
  ];
  const anyData = charts.some((c) => seriesFor(iso3, c.field).length >= 2);
  if (!anyData) {
    return (
      <p className="text-xs text-gray-400">
        Not enough years of data to show a trend for this country.
      </p>
    );
  }
  return (
    <div className="space-y-2.5">
      {charts.map((c) => {
        const points = seriesFor(iso3, c.field);
        if (points.length < 2) return null;
        return (
          <div key={c.field}>
            <div className="text-[10px] text-gray-600 mb-0.5">{c.label}</div>
            <Sparkline points={points} color={c.color} />
          </div>
        );
      })}
      <p className="text-[10px] text-gray-500 leading-snug">
        Gaps between survey years are drawn as straight lines. A country that reports
        in only two years produces a two-point line, not a trend.
      </p>
    </div>
  );
}

export default function LaborDetailPanel({ row, year, onCorridorBoard, onClose }) {
  if (!row) {
    return (
      <div className="panel-scroll w-96 bg-gray-50 overflow-y-auto p-6 border-l border-gray-200 flex items-center">
        <p className="text-gray-400 text-sm text-center leading-relaxed">
          Select a country on the map, or a row in the ranking below, to see its full
          population and occupation breakdown.
        </p>
      </div>
    );
  }

  const tone = qualityTone(row.data_quality_flag);
  const isAggregate = row.row_type !== 'country';

  return (
    <div className="panel-scroll w-96 bg-gray-50 overflow-y-auto border-l border-gray-200 text-gray-900">
      <div className="sticky top-0 bg-gray-50 px-4 pt-4 pb-3 border-b border-gray-200 z-10">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-lg leading-none cursor-pointer"
        >
          &times;
        </button>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[10px] bg-gray-800 text-white px-1.5 py-0.5 rounded">
            {row.iso3}
          </span>
          {isAggregate && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
              AGGREGATE
            </span>
          )}
          {onCorridorBoard && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
              CORRIDOR BOARD
            </span>
          )}
          {year !== null && (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
              {year}
            </span>
          )}
        </div>
        <h2 className="text-lg font-bold leading-tight pr-6">{row.country_name}</h2>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {isAggregate
            ? `${row.member_count} member countries`
            : `${row.region}${row.income_group ? ` · ${row.income_group}` : ''}`}
        </p>
        <div className="flex items-start gap-1.5 mt-2">
          <i className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: tone.color }} />
          <span className="text-[10px] leading-tight" style={{ color: tone.color }}>
            {row.data_quality_flag}
          </span>
        </div>
      </div>

      <div className="p-4">
        <Section title="Headline" tier="derived">
          <Row
            label="Share of population that works at all"
            value={`${fmt(row.employed_share_of_population_pct)}%`}
            strong
          />
          <Row
            label="Of those who work, white collar"
            value={`${fmt(row.white_collar_pct)}%`}
            strong
          />
          <Row
            label="Entry-level white collar (15–24)"
            value={`${fmt(row.young_white_collar_pct)}%`}
            hint="proxy"
          />
          <Row
            label="AI task-exposure score"
            value={fmt(row.ai_exposure_weighted_score, 3)}
            hint="modeled index, 0–1"
          />
        </Section>

        <Section title="Population structure" tier="official">
          <AgeBar row={row} />
          <div className="mt-2">
            <Row label="Total population" value={fmtInt(row.population_total)} />
            <Row label="Age dependency ratio" value={fmt(row.age_dependency_ratio)} />
            <Row
              label="65+ share"
              value={`${fmt(row.pop_65plus_pct)}%`}
              hint="age proxy for retirees — not pension receipt"
            />
          </div>
        </Section>

        <Section title="From population to white collar" tier="derived">
          <Funnel row={row} />
        </Section>

        <Section title="Labor force participation" tier="official">
          <Row label="LFP, 15+" value={`${fmt(row.lfp_rate_total)}%`} />
          <Row label="LFP, 15–24" value={`${fmt(row.lfp_rate_15_24)}%`} />
          <Row label="LFP, 25–54" value={`${fmt(row.lfp_rate_25_54)}%`} />
          <Row label="LFP, 55–64" value={`${fmt(row.lfp_rate_55_64)}%`} />
          <Row label="Employment-to-population, 15+" value={`${fmt(row.emp_to_pop_ratio_15plus)}%`} />
          <Row label="Unemployment" value={`${fmt(row.unemployment_rate_total)}%`} />
          <Row label="Youth unemployment (15–24)" value={`${fmt(row.unemployment_rate_15_24)}%`} />
          <Row label="Employed (headcount)" value={fmtInt(row.employed_total)} />
        </Section>

        <Section title="Career stage" tier="official">
          <CareerStages row={row} />
        </Section>

        {!isAggregate && (
          <Section title="Trend over time" tier="official">
            <Trends iso3={row.iso3} />
          </Section>
        )}

        <Section title="Occupation — ISCO major groups" tier="official">
          <OccupationBreakdown row={row} />
        </Section>

        <Section title="Broad sector" tier="official">
          <Row label="Agriculture" value={`${fmt(row.emp_agriculture_pct)}%`} />
          <Row label="Industry" value={`${fmt(row.emp_industry_pct)}%`} />
          <Row
            label="Services"
            value={`${fmt(row.emp_services_pct)}%`}
            hint="weak white-collar proxy — includes retail, hospitality, transport"
          />
        </Section>

        <Section title="Entry-level proxy" tier="proxy">
          <Row
            label="Employed 15–24 in ISCO 1–4"
            value={`${fmt(row.young_white_collar_pct)}%`}
            strong
          />
          <Row label="Age band used" value={row.youth_age_band_used || '—'} />
          <Row label="Proxy status" value={row.entry_level_data_quality || '—'} />
          {row.young_white_collar_pct != null && row.white_collar_pct != null && (
            <Row
              label="Gap vs. all-ages white collar"
              value={`${(row.young_white_collar_pct - row.white_collar_pct >= 0 ? '+' : '')}${fmt(
                row.young_white_collar_pct - row.white_collar_pct,
              )} pp`}
            />
          )}
          <p className="mt-2 text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded p-1.5 leading-snug">
            Seniority is not tracked globally. This is age 15–24 crossed with occupation —
            a stand-in, not a measurement of junior roles.
          </p>
        </Section>

        <Section title="Entry-level squeeze index" tier="derived">
          <Row
            label="Squeeze index (0–100)"
            value={fmt(row.entry_level_squeeze_index, 1)}
            strong
          />
          <Row label="Youth 15–24 as share of population" value={`${fmt(row.youth_cohort_share)}%`} />
          <Row label="Youth white-collar share" value={`${fmt(row.young_white_collar_pct)}%`} />
          <Row label="Youth unemployment" value={`${fmt(row.unemployment_rate_15_24)}%`} />
          <Row
            label="Youth vs all-ages white collar"
            value={row.youth_wc_gap != null ? `${row.youth_wc_gap >= 0 ? '+' : ''}${fmt(row.youth_wc_gap)} pp` : '—'}
          />
          <p className="mt-2 text-[10px] text-gray-500 leading-snug">
            A composite of the four percentile ranks above, not a measured quantity.
            Every component is listed so the index can be taken apart.
          </p>
        </Section>

        <Section title="Economic context" tier="official">
          <Row label="GDP per capita (PPP)" value={row.gdp_per_capita_ppp ? `$${fmtInt(row.gdp_per_capita_ppp)}` : '—'} />
          <Row
            label="Labor force with advanced education"
            value={`${fmt(row.labor_force_advanced_edu_pct)}%`}
            hint="feeder stock for white-collar work"
          />
          <Row label="ICT share of service exports" value={`${fmt(row.ict_service_exports_pct)}%`} />
          <Row
            label="ICT service exports"
            value={row.ict_service_exports_usd ? `$${fmtCompact(row.ict_service_exports_usd)}` : '—'}
            hint="white-collar labor sold abroad"
          />
          <Row
            label="Exposed wage bill (PPP)"
            value={row.exposed_wage_bill_ppp ? `$${fmtCompact(row.exposed_wage_bill_ppp)}` : '—'}
            hint="MODELED scale — not an amount at risk"
          />
        </Section>

        <Section title="Headcounts" tier="derived">
          <Row label="Employed" value={fmtInt(row.employed_total)} />
          <Row label="White collar (ISCO 1–4)" value={fmtInt(row.white_collar_employed)} />
          <Row label="Professionals (ISCO 2)" value={fmtInt(row.professionals_employed)} />
          <Row label="Clerical support (ISCO 4)" value={fmtInt(row.clerical_employed)} strong />
          <Row label="Employed 15–24 in white collar" value={fmtInt(row.young_white_collar_employed)} />
        </Section>

        <Section title="Data vintage" tier="derived">
          <Row label="Population data" value={row.data_year_population || '—'} />
          <Row label="Labor data" value={row.data_year_labor || '—'} />
          <Row label="Sector data" value={row.data_year_sector || '—'} />
          <Row label="Occupation data" value={row.data_year_occupation || '—'} />
          <Row label="Youth × occupation" value={row.data_year_youth_occupation || '—'} />
          <Row
            label="Occupation classification"
            value={row.isco_classification || '—'}
            hint={row.isco_classification === 'ISCO-88'
              ? 'fallback — this country publishes no ISCO-08 series'
              : undefined}
          />
          {row.data_source_override && (
            <Row label="Manual override applied" value={row.data_source_override} />
          )}
          {isAggregate && (
            <Row
              label="ISCO coverage of employment"
              value={`${fmt(row.isco_coverage_pct_of_employment)}%`}
              hint="share of this group's employment in countries reporting occupation data"
            />
          )}
          <p className="mt-2 text-[10px] text-gray-500 leading-snug">
            Years are not uniform across fields. Never read a row as a single-year snapshot.
          </p>
        </Section>
      </div>
    </div>
  );
}
