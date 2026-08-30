import {
  ISCO_GROUPS, TIERS, fmt, fmtInt, fmtCompact, qualityTone,
} from '../utils/laborMetrics';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Sparkline from './Sparkline';
import { seriesFor } from '../utils/laborPanel';
import laborData from '../data/global_labor.json';

// Spec 0008 R4 + spec 0009. The tier of a field is NOT decided here: the
// pipeline writes it into the payload (`field_tiers`, 84 entries) from
// pipeline/config.py's registry, and spec 0009 guards the two against drift.
// Reading it from the payload rather than keeping a copy is the point — a
// second copy is exactly what 0009 exists to prevent.
const FIELD_TIERS = laborData.field_tiers;

// Spec 0008 R4. A Section's tier is the heading's claim; a Row's field decides
// the figure's. They are not always the same, and when they diverge the Section
// wins visually while being wrong — which is how `entry_level_squeeze_index`
// (MODELED in pipeline/config.py:290) came to sit under a DERIVED badge, and
// three PROXY career-stage figures under an OFFICIAL one. The Row now looks its
// own tier up in the pipeline's authoritative map and badges itself whenever it
// differs from the section around it.
const SectionTier = createContext(null);

const REAL_TIERS = ['OFFICIAL', 'DERIVED', 'PROXY', 'MODELED'];

// The tier the pipeline's registry gives a field, lowercased for `TIERS`.
// `NOT_A_MEASUREMENT` fields (a classification label, a count of reported
// groups) carry no tier and get no badge.
function tierOf(field) {
  const t = field ? FIELD_TIERS[field] : undefined;
  return t && REAL_TIERS.includes(t) ? t.toLowerCase() : undefined;
}

function TierBadge({ tier, className = 'ml-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded align-middle' }) {
  const t = tier ? TIERS[tier] : null;
  if (!t) return null;
  return (
    <span className={className} style={{ backgroundColor: `${t.color}1a`, color: t.color }}>
      {t.label}
    </span>
  );
}

// Badges a figure whenever its own tier differs from the heading's claim.
// Every component that renders its own markup uses this instead of repeating
// the badge: a fourth hand-written copy is how `Trends` and
// `OccupationBreakdown` came to announce fifteen constructed figures as
// OFFICIAL while `CareerStages`, fixed by hand in `0c7a59e`, was correct.
function FieldBadge({ field }) {
  const sectionTier = useContext(SectionTier);
  const tier = tierOf(field);
  return tier && tier !== sectionTier ? <TierBadge tier={tier} /> : null;
}

function Section({ title, tier, children }) {
  return (
    // `data-section-tier` is what lets the R4 guard scope itself to a section
    // and check the figures inside it, rather than trusting that whoever added
    // a figure remembered to annotate it.
    <div className="mb-5" data-section={title} data-section-tier={tier || undefined}>
      <div className="flex items-center gap-2 mb-2" data-section-heading="">
        <h3 className="text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase">{title}</h3>
        <TierBadge tier={tier} className="text-[11px] font-bold px-1.5 py-0.5 rounded" />
      </div>
      <SectionTier.Provider value={tier ?? null}>{children}</SectionTier.Provider>
    </div>
  );
}

// Spec 0008 R4. `tier` here is not decoration: a row whose tier differs from its
// Section's must say so on the row itself. Two figures were being presented
// under a badge stronger than their own — the AI exposure score (MODELED) under
// a DERIVED heading, and the exposed wage bill (MODELED) under an OFFICIAL one —
// with the real tier only in lowercase hint text. Announcing a constructed index
// under a DERIVED badge overstates it, which is exactly the blurring of measured
// and constructed this project refuses.
//
// Found by reading the accessibility tree (scripts/r11-announce.mjs), not by any
// test: the suite checked that badges carry text, never that a badge matches the
// number beneath it.
function Row({ label, value, strong, hint, tier, field }) {
  const sectionTier = useContext(SectionTier);
  // Explicit `tier` still wins; otherwise the field's own tier is used, and the
  // badge appears only when it differs from the section's.
  const effective = tier ?? tierOf(field);
  return (
    <div
      className="flex items-baseline justify-between py-1 border-b border-gray-100 last:border-0"
      data-field={field || undefined}
      data-tier={(effective ?? sectionTier) || undefined}
    >
      <span className={`text-xs ${strong ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
        {label}
        {effective && effective !== sectionTier && <TierBadge tier={effective} />}
        {hint && <span className="block text-[10px] text-[var(--text-faint)] leading-tight">{hint}</span>}
      </span>
      <span className={`text-xs font-mono tabular-nums ml-3 ${strong ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-body)]'}`}>
        {value}
      </span>
    </div>
  );
}

/** Population split into children / working age / 65+ */
function AgeBar({ row }) {
  const parts = [
    { pct: row.pop_0_14_pct, color: '#8bcdc2', label: '0–14', field: 'pop_0_14_pct' },
    { pct: row.pop_15_64_pct, color: '#2f7ec1', label: '15–64', field: 'pop_15_64_pct' },
    { pct: row.pop_65plus_pct, color: '#b5651d', label: '65+', field: 'pop_65plus_pct' },
  ].filter((p) => p.pct != null);
  if (!parts.length) return <p className="text-xs text-[var(--text-faint)]">No age structure data.</p>;
  return (
    <>
      <div className="flex h-6 rounded overflow-hidden mb-1.5">
        {parts.map((p) => (
          // Spec 0008 R7. The in-bar percentage that used to sit here was 9px
          // bold white on this swatch — 1.81:1 on the 0–14 teal, worse than the
          // grey the spec already calls a failure. Per-swatch foreground
          // selection cannot fix it: two of these three colours are mid-tones
          // where neither white nor near-black clears 4.5:1. The figure moved to
          // the legend below, which had to gain it first — deleting the label
          // while the legend carried only the band name would have taken a
          // country's 0–14 share off the page entirely, since nothing else
          // renders it.
          <div
            key={p.label}
            style={{ width: `${p.pct}%`, backgroundColor: p.color }}
            title={`${p.label}: ${p.pct.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="flex gap-3 text-[10px] text-[var(--text-muted)]">
        {parts.map((p) => (
          <span
            key={p.label}
            className="flex items-center gap-1"
            data-field={p.field}
            data-tier={tierOf(p.field)}
          >
            <i className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: p.color }} />
            {p.label}
            <span className="font-mono tabular-nums text-[var(--text-secondary)]">
              {p.pct.toFixed(1)}%
            </span>
            <FieldBadge field={p.field} />
          </span>
        ))}
      </div>
    </>
  );
}

/** Population -> working age -> labor force -> employed -> white collar */
function Funnel({ row }) {
  const pop = row.population_total;
  if (!pop) return <p className="text-xs text-[var(--text-faint)]">No population data.</p>;
  const workingAge = row.pop_15_64_pct != null ? (pop * row.pop_15_64_pct) / 100 : null;
  const steps = [
    { label: 'Total population', v: pop, color: '#cbd5e1', field: 'population_total' },
    // A headcount computed here from `population_total × pop_15_64_pct`, so it
    // is nobody's registry field. It carries its tier directly rather than
    // borrowing `pop_15_64_pct`'s OFFICIAL, which would announce this
    // pipeline's arithmetic as a published figure.
    { label: 'Working age (15–64)', v: workingAge, color: '#8bcdc2', tier: 'derived' },
    { label: 'In the labor force', v: row.labor_force_total, color: '#5a9ed6', field: 'labor_force_total' },
    { label: 'Employed', v: row.employed_total, color: '#2f7ec1', field: 'employed_total' },
    { label: 'White collar (ISCO 1–4)', v: row.white_collar_employed, color: '#1a5490', field: 'white_collar_employed' },
  ];
  return (
    <div className="space-y-1">
      {steps.map((s) => (
        <div key={s.label} data-field={s.field} data-tier={s.field ? tierOf(s.field) : s.tier}>
          <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mb-0.5">
            <span>
              {s.label}
              {s.field && <FieldBadge field={s.field} />}
            </span>
            <span className="font-mono tabular-nums">
              {fmtCompact(s.v)}
              {s.v != null && <span className="text-[var(--text-faint)]"> · {((s.v / pop) * 100).toFixed(1)}%</span>}
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
      <p className="text-xs text-[var(--text-muted)] bg-[var(--surface-warn)] border border-amber-200 rounded p-2">
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
          // Spec 0008 R7. The group digit that used to sit here was 9px bold
          // white on this swatch: seven of the nine ISCO colours were below AA
          // and five below even 3:1, the worst at 1.68:1 — and ISCO 4, clerical
          // support, is the group this project is about. It was already
          // redundant with the legend below, which carries number, name and
          // percentage for every group, so it is deleted rather than recoloured.
          <div
            key={g.key}
            style={{ width: `${g.pct}%`, backgroundColor: g.color }}
            title={`${g.n}. ${g.label}: ${g.pct.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-2">
        <span data-field="white_collar_pct" data-tier={tierOf('white_collar_pct')}>
          &larr; ISCO 1–4 white collar ({fmt(row.white_collar_pct)}%)
          <FieldBadge field="white_collar_pct" />
        </span>
        <span data-field="blue_collar_service_pct" data-tier={tierOf('blue_collar_service_pct')}>
          ISCO 5–9 ({fmt(row.blue_collar_service_pct)}%) &rarr;
          <FieldBadge field="blue_collar_service_pct" />
        </span>
      </div>
      <div className="space-y-0.5">
        {groups.map((g) => (
          <div
            key={g.key}
            className="flex items-center gap-2"
            data-field={g.key}
            data-tier={tierOf(g.key)}
          >
            <i className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: g.color }} />
            <span className="text-[11px] text-[var(--text-secondary)] flex-1 truncate" title={g.label}>
              {g.n}. {g.label}
            </span>
            <span className="text-[11px] font-mono tabular-nums text-[var(--text-primary)]">
              {g.pct.toFixed(1)}%
            </span>
            <FieldBadge field={g.key} />
          </div>
        ))}
      </div>
      {row.isco_groups_reported != null && row.isco_groups_reported < 9 && (
        <p
          className="mt-2 text-[10px] text-[var(--text-warn)] bg-[var(--surface-warn)] border border-amber-200 rounded p-1.5"
          data-field="isco_groups_reported"
        >
          Source reports only {row.isco_groups_reported} of 9 major groups — the national
          classification folds the missing group into another one.
        </p>
      )}
      {row.isco_classified_share_pct != null && row.isco_classified_share_pct < 90 && (
        <p
          className="mt-2 text-[10px] text-[var(--text-warn)] bg-[var(--surface-warn)] border border-amber-200 rounded p-1.5"
          data-field="isco_classified_share_pct"
          data-tier={tierOf('isco_classified_share_pct')}
        >
          Only {row.isco_classified_share_pct.toFixed(0)}% of employment is classified by
          occupation. Shares above describe the classified portion only.
          <FieldBadge field="isco_classified_share_pct" />
        </p>
      )}
    </>
  );
}

/** R11. White-collar share at each career stage — where the office jobs sit by age. */
// Spec 0008 R4. This section's heading was `tier="official"` and not one of the
// four figures under it is OFFICIAL: three are PROXY and one DERIVED, per the
// payload's `field_tiers`. It renders its own markup rather than using `Row`, so
// the per-row badge did not reach it and the automatic check could not see it
// either — the two failures had the same cause. Each stage now carries its
// field, badges itself from the registry, and is visible to the test.
function CareerStages({ row }) {
  const stages = [
    { label: 'Youth 15–24', field: 'young_white_collar_pct', v: row.young_white_collar_pct, color: '#f7bd6f' },
    { label: 'Prime 25–54', field: 'prime_white_collar_pct', v: row.prime_white_collar_pct, color: '#2f7ec1' },
    { label: 'Late 55–64', field: 'late_career_white_collar_pct', v: row.late_career_white_collar_pct, color: '#5a9ed6' },
    { label: 'All ages', field: 'white_collar_pct', v: row.white_collar_pct, color: '#1a5490' },
  ];
  if (!stages.some((s) => s.v != null)) {
    return <p className="text-xs text-[var(--text-faint)]">No career-stage breakdown published.</p>;
  }
  return (
    <div className="space-y-1">
      {stages.map((s) => (
        <div key={s.label} data-field={s.field} data-tier={tierOf(s.field)}>
          <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mb-0.5">
            <span>
              {s.label}
              <FieldBadge field={s.field} />
            </span>
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
        // The gap is arithmetic on two PROXY series, so it is PROXY: it can be
        // no stronger than the weaker of its inputs.
        <p className="text-[10px] text-[var(--text-muted)] pt-1 leading-snug" data-tier="proxy">
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
      <p className="text-xs text-[var(--text-faint)]">
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
          <div key={c.field} data-field={c.field} data-tier={tierOf(c.field)}>
            <div className="text-[10px] text-[var(--text-secondary)] mb-0.5">
              {c.label}
              <FieldBadge field={c.field} />
            </div>
            <Sparkline points={points} color={c.color} />
          </div>
        );
      })}
      <p className="text-[10px] text-[var(--text-muted)] leading-snug">
        Gaps between survey years are drawn as straight lines. A country that reports
        in only two years produces a two-point line, not a trend.
      </p>
    </div>
  );
}

export default function LaborDetailPanel({ row, year, onCorridorBoard, onClose }) {
  // Hooks before the early return: the placeholder branch below returns without
  // rendering a row, and React requires the same hook order on every render.
  const panelRef = useRef(null);
  const restoreFocusTo = useRef(null);
  const wasOpen = useRef(false);
  const iso3 = row?.iso3 ?? null;

  // `matchMedia().matches` is a snapshot. Read once, it decided `role` and
  // `aria-modal` from whatever the viewport happened to be at the last render —
  // rotate a phone or resize across 768px and the panel kept the old semantics
  // while looking like the new ones. Subscribing is what makes it live.
  const [isOverlay, setIsOverlay] = useState(() =>
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && !window.matchMedia('(min-width: 768px)').matches);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsOverlay(!mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    // Move focus into the panel when it opens as an overlay, and remember where
    // it came from. Without the first the keyboard user selects a country and
    // focus stays behind the sheet.
    //
    // The opener is captured only on a real open. Re-capturing on every run
    // pointed it at whatever was focused mid-sheet, so a later close handed
    // focus to a control inside the panel that no longer exists.
    if (!isOverlay || !iso3) return;
    if (!restoreFocusTo.current) restoreFocusTo.current = document.activeElement;
    panelRef.current?.focus();
  }, [isOverlay, iso3]);

  useEffect(() => {
    // Hand focus back on a real close, and only then. This was a cleanup on the
    // effect above, which React runs on every change to `isOverlay` or `iso3` —
    // so selecting a second country threw focus to the previous opener before
    // the body pulled it back in (two moves a screen reader announces for one
    // selection), and crossing 768px with a country open took focus out of the
    // panel entirely. Neither is a close.
    //
    // The panel is always mounted (`LaborPage.jsx:372` renders it with a null
    // row), so closing is `iso3` going null, not unmounting.
    if (iso3) { wasOpen.current = true; return; }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const target = restoreFocusTo.current;
    restoreFocusTo.current = null;
    if (target && target.isConnected && typeof target.focus === 'function') target.focus();
  }, [iso3]);

  if (!row) {
    return (
      <div
        className="panel-scroll hidden md:flex w-96 bg-gray-50 overflow-y-auto p-6 border-l border-gray-200 items-center"
        role="region"
        aria-label="Country detail — nothing selected"
      >
        <p className="text-[var(--text-faint)] text-sm text-center leading-relaxed">
          Select a country on the map, or a row in the ranking below, to see its full
          population and occupation breakdown.
        </p>
      </div>
    );
  }

  const tone = qualityTone(row.data_quality_flag);
  const isAggregate = row.row_type !== 'country';

  return (
    // Spec 0008 R8 + R2. The landmark lives here, on the panel's own root, in
    // both this branch and the placeholder above — not on a wrapper in
    // LaborPage. R9 part 1 renders this component standalone, and a wrapper
    // would not be in that tree, so `region` could never reach zero there and
    // the escape would be to scope the rule out.
    //
    // Below `md` this is `fixed inset-0` over the sheet and the map, which makes
    // it a modal in every respect. It was announced as one more landmark among
    // four, took no focus when it opened, and could not be dismissed by
    // keyboard. `role` and `aria-modal` now switch with the breakpoint, focus
    // moves to the panel on open, and Escape closes it.
    <div
      ref={panelRef}
      tabIndex={-1}
      className="panel-scroll fixed inset-0 z-[1100] w-full md:static md:z-auto md:w-96 bg-gray-50 overflow-y-auto md:border-l border-gray-200 text-[var(--text-primary)]"
      role={isOverlay ? 'dialog' : 'region'}
      aria-modal={isOverlay ? 'true' : undefined}
      aria-label={`Country detail: ${row.country_name}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { onClose(); return; }
        if (e.key !== 'Tab' || !isOverlay) return;
        // A dialog claiming aria-modal must actually contain focus, or the user
        // tabs into content their screen reader has been told is not there.
        const focusables = panelRef.current?.querySelectorAll(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          e.preventDefault(); last.focus();
        }
      }}
    >
      <div className="sticky top-0 bg-gray-50 px-4 pt-4 pb-3 border-b border-gray-200 z-10">
        {/* Spec 0008 R8. axe's button-name rule PASSES on a bare &times; — the
            glyph is text content — but a screen reader announces it as
            "multiplication sign". A rule passing is not the same as a usable
            name, so the name is explicit and the glyph is hidden from the
            accessibility tree. */}
        <button
          onClick={onClose}
          aria-label={`Close ${row.country_name} detail`}
          className="absolute top-3 right-3 text-[var(--text-faint)] hover:text-[var(--text-body)] text-lg leading-none cursor-pointer w-6 h-6 flex items-center justify-center"
        >
          <span aria-hidden="true">&times;</span>
        </button>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[10px] bg-gray-800 text-white px-1.5 py-0.5 rounded">
            {row.iso3}
          </span>
          {isAggregate && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--surface-info)] text-[var(--text-info)]">
              AGGREGATE
            </span>
          )}
          {onCorridorBoard && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--surface-accent)] text-[var(--text-accent)]">
              CORRIDOR BOARD
            </span>
          )}
          {year !== null && (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--surface-warn)] text-[var(--text-warn)]">
              {year}
            </span>
          )}
        </div>
        <h2 className="text-lg font-bold leading-tight pr-6">{row.country_name}</h2>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
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
            field="employed_share_of_population_pct"
            label="Share of population that works at all"
            value={`${fmt(row.employed_share_of_population_pct)}%`}
            strong
          />
          <Row
            field="white_collar_pct"
            label="Of those who work, white collar"
            value={`${fmt(row.white_collar_pct)}%`}
            strong
          />
          <Row
            field="young_white_collar_pct"
            label="Entry-level white collar (15–24)"
            value={`${fmt(row.young_white_collar_pct)}%`}
            tier="proxy"
            hint="age 15–24 is a stand-in; no source tracks seniority"
          />
          <Row
            field="ai_exposure_weighted_score"
            label="AI task-exposure score"
            value={fmt(row.ai_exposure_weighted_score, 3)}
            tier="modeled"
            hint="index 0–1, rank order only — not a probability"
          />
        </Section>

        <Section title="Population structure" tier="official">
          <AgeBar row={row} />
          <div className="mt-2">
            <Row
            field="population_total" label="Total population" value={fmtInt(row.population_total)} />
            <Row
            field="age_dependency_ratio" label="Age dependency ratio" value={fmt(row.age_dependency_ratio)} />
            <Row
            field="pop_65plus_pct"
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
          <Row
            field="lfp_rate_total" label="LFP, 15+" value={`${fmt(row.lfp_rate_total)}%`} />
          <Row
            field="lfp_rate_15_24" label="LFP, 15–24" value={`${fmt(row.lfp_rate_15_24)}%`} />
          <Row
            field="lfp_rate_25_54" label="LFP, 25–54" value={`${fmt(row.lfp_rate_25_54)}%`} />
          <Row
            field="lfp_rate_55_64" label="LFP, 55–64" value={`${fmt(row.lfp_rate_55_64)}%`} />
          <Row
            field="emp_to_pop_ratio_15plus" label="Employment-to-population, 15+" value={`${fmt(row.emp_to_pop_ratio_15plus)}%`} />
          <Row
            field="unemployment_rate_total" label="Unemployment" value={`${fmt(row.unemployment_rate_total)}%`} />
          <Row
            field="unemployment_rate_15_24" label="Youth unemployment (15–24)" value={`${fmt(row.unemployment_rate_15_24)}%`} />
          <Row
            field="employed_total" label="Employed (headcount)" value={fmtInt(row.employed_total)} />
        </Section>

        {/* Spec 0008 R4: the section carries no tier of its own — every figure in it
            badges itself from the payload registry, because they are not all one tier. */}
        <Section title="Career stage">
          <CareerStages row={row} />
        </Section>

        {/* Spec 0008 R4. Both of these read `tier="official"` while announcing
            fifteen constructed figures between them.

            "Trend over time" spans three tiers (DERIVED, PROXY and OFFICIAL),
            so no heading claim can be right for all four series: it carries
            none, and each series badges itself.

            "Occupation" is uniformly DERIVED — ILOSTAT publishes the
            headcounts, every share here is this pipeline's `100 * group / base`
            — so the heading states that once rather than repeating a chip on
            all twelve rows. The per-figure annotation is still there, so if any
            ISCO field ever stops being DERIVED its badge reappears on its own
            row without anyone noticing the heading went stale. */}
        {!isAggregate && (
          <Section title="Trend over time">
            <Trends iso3={row.iso3} />
          </Section>
        )}

        <Section title="Occupation — ISCO major groups" tier="derived">
          <OccupationBreakdown row={row} />
        </Section>

        <Section title="Broad sector" tier="official">
          <Row
            field="emp_agriculture_pct" label="Agriculture" value={`${fmt(row.emp_agriculture_pct)}%`} />
          <Row
            field="emp_industry_pct" label="Industry" value={`${fmt(row.emp_industry_pct)}%`} />
          <Row
            field="emp_services_pct"
            label="Services"
            value={`${fmt(row.emp_services_pct)}%`}
            hint="weak white-collar proxy — includes retail, hospitality, transport"
          />
        </Section>

        <Section title="Entry-level proxy" tier="proxy">
          <Row
            field="young_white_collar_pct"
            label="Employed 15–24 in ISCO 1–4"
            value={`${fmt(row.young_white_collar_pct)}%`}
            strong
          />
          <Row
            field="youth_age_band_used" label="Age band used" value={row.youth_age_band_used || '—'} />
          <Row
            field="entry_level_data_quality" label="Proxy status" value={row.entry_level_data_quality || '—'} />
          {row.young_white_collar_pct != null && row.white_collar_pct != null && (
            <Row
              label="Gap vs. all-ages white collar"
              value={`${(row.young_white_collar_pct - row.white_collar_pct >= 0 ? '+' : '')}${fmt(
                row.young_white_collar_pct - row.white_collar_pct,
              )} pp`}
            />
          )}
          <p
            className="mt-2 text-[10px] text-[var(--text-caution)] bg-[var(--surface-caution)] border border-orange-200 rounded p-1.5 leading-snug"
            data-tier="proxy"
          >
            Seniority is not tracked globally. This is age 15–24 crossed with occupation —
            a stand-in, not a measurement of junior roles.
          </p>
        </Section>

        <Section title="Entry-level squeeze index" tier="derived">
          <Row
            field="entry_level_squeeze_index"
            label="Squeeze index (0–100)"
            value={fmt(row.entry_level_squeeze_index, 1)}
            strong
          />
          <Row
            field="youth_cohort_share" label="Youth 15–24 as share of population" value={`${fmt(row.youth_cohort_share)}%`} />
          <Row
            field="young_white_collar_pct" label="Youth white-collar share" value={`${fmt(row.young_white_collar_pct)}%`} />
          <Row
            field="unemployment_rate_15_24" label="Youth unemployment" value={`${fmt(row.unemployment_rate_15_24)}%`} />
          <Row
            label="Youth vs all-ages white collar"
            value={row.youth_wc_gap != null ? `${row.youth_wc_gap >= 0 ? '+' : ''}${fmt(row.youth_wc_gap)} pp` : '—'}
          />
          <p className="mt-2 text-[10px] text-[var(--text-muted)] leading-snug">
            A composite of the four percentile ranks above, not a measured quantity.
            Every component is listed so the index can be taken apart.
          </p>
        </Section>

        <Section title="Economic context" tier="official">
          <Row
            field="gdp_per_capita_ppp" label="GDP per capita (PPP)" value={row.gdp_per_capita_ppp ? `$${fmtInt(row.gdp_per_capita_ppp)}` : '—'} />
          <Row
            field="labor_force_advanced_edu_pct"
            label="Labor force with advanced education"
            value={`${fmt(row.labor_force_advanced_edu_pct)}%`}
            hint="feeder stock for white-collar work"
          />
          <Row
            field="ict_service_exports_pct" label="ICT share of service exports" value={`${fmt(row.ict_service_exports_pct)}%`} />
          <Row
            field="ict_service_exports_usd"
            label="ICT service exports"
            value={row.ict_service_exports_usd ? `$${fmtCompact(row.ict_service_exports_usd)}` : '—'}
            hint="white-collar labor sold abroad"
          />
          <Row
            field="exposed_wage_bill_ppp"
            label="Exposed wage bill (PPP)"
            value={row.exposed_wage_bill_ppp ? `$${fmtCompact(row.exposed_wage_bill_ppp)}` : '—'}
            tier="modeled"
            hint="order-of-magnitude scale — not an amount at risk"
          />
        </Section>

        <Section title="Headcounts" tier="derived">
          <Row
            field="employed_total" label="Employed" value={fmtInt(row.employed_total)} />
          <Row
            field="white_collar_employed" label="White collar (ISCO 1–4)" value={fmtInt(row.white_collar_employed)} />
          <Row
            field="professionals_employed" label="Professionals (ISCO 2)" value={fmtInt(row.professionals_employed)} />
          <Row
            field="clerical_employed" label="Clerical support (ISCO 4)" value={fmtInt(row.clerical_employed)} strong />
          <Row
            field="young_white_collar_employed" label="Employed 15–24 in white collar" value={fmtInt(row.young_white_collar_employed)} />
        </Section>

        <Section title="Data vintage" tier="derived">
          <Row
            field="data_year_population" label="Population data" value={row.data_year_population || '—'} />
          <Row
            field="data_year_labor" label="Labor data" value={row.data_year_labor || '—'} />
          <Row
            field="data_year_sector" label="Sector data" value={row.data_year_sector || '—'} />
          <Row
            field="data_year_occupation" label="Occupation data" value={row.data_year_occupation || '—'} />
          <Row
            field="data_year_youth_occupation" label="Youth × occupation" value={row.data_year_youth_occupation || '—'} />
          <Row
            field="isco_classification"
            label="Occupation classification"
            value={row.isco_classification || '—'}
            hint={row.isco_classification === 'ISCO-88'
              ? 'fallback — this country publishes no ISCO-08 series'
              : undefined}
          />
          {row.data_source_override && (
            <Row
            field="data_source_override" label="Manual override applied" value={row.data_source_override} />
          )}
          {isAggregate && (
            <Row
            field="isco_coverage_pct_of_employment"
              label="ISCO coverage of employment"
              value={`${fmt(row.isco_coverage_pct_of_employment)}%`}
              hint="share of this group's employment in countries reporting occupation data"
            />
          )}
          <p className="mt-2 text-[10px] text-[var(--text-muted)] leading-snug">
            Years are not uniform across fields. Never read a row as a single-year snapshot.
          </p>
        </Section>
      </div>
    </div>
  );
}
