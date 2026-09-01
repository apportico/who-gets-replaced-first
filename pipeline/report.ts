/**
 * Generate summary_report.md from the built dataset.
 *
 * 0007: ported from `report.py`. Every `f"{x:,.1f}"` becomes `pyFormatFixed`,
 * because `toFixed` rounds half away from zero where Python's format rounds
 * half to even, and because JavaScript has no thousands separator in a format
 * string. This is the one output R6 compares with a single line excluded --
 * the `Generated <date>` line -- so a rounding difference anywhere in 245
 * lines fails that requirement rather than hiding.
 *
 * This module imports no other pipeline module, deliberately: `crosscheck`
 * imports `summariseSensitivity` from here rather than the other way round, so
 * `npm run report` never acquires a dependency on the network module it has
 * never needed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pyFormatFixed } from './pynum.ts';
import { readCsvDict } from './csvio.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export type ReportRow = Record<string, string | null>;

/** `f(v, nd, suffix)` -- "n/a" for an absent value, grouped digits otherwise. */
export function f(v: number | string | null | undefined, nd = 1, suffix = ''): string {
  if (v === null || v === undefined || v === '' || v === 'None') return 'n/a';
  const x = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(x)) return String(v);
  return pyFormatFixed(x, nd, { grouping: true }) + suffix;
}

export function load(): ReportRow[] {
  const rows = readCsvDict(
    readFileSync(path.join(HERE, 'data', 'global_labor_dataset.csv'), 'utf8'),
  );
  return rows.map((r) => {
    const out: ReportRow = {};
    for (const [k, v] of Object.entries(r)) out[k] = v === '' ? null : v;
    return out;
  });
}

export function num(r: ReportRow, k: string): number | null {
  const v = r[k];
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isNaN(x) ? null : x;
}

export function loadPanel(): ReportRow[] {
  const p = path.join(HERE, 'data', 'global_labor_panel.csv');
  if (!existsSync(p)) return [];
  const rows = readCsvDict(readFileSync(p, 'utf8'));
  return rows.map((r) => {
    const out: ReportRow = {};
    for (const [k, v] of Object.entries(r)) out[k] = v === '' ? null : v;
    return out;
  });
}

/** [first_year, first_value, last_year, last_value, delta] or null. */
export function trend(
  panel: ReportRow[],
  iso3: string,
  field: string,
  minYears = 6,
): [number, number, number, number, number] | null {
  const pts = panel
    // `r.get(field)` is a STRING here, so "0.0" is truthy and only null is not.
    .filter((r) => r.iso3 === iso3 && !!r[field] && parseInt(r.year as string, 10) <= 2025)
    .map((r) => [parseInt(r.year as string, 10), Number(r[field])] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (pts.length < minYears) return null;
  return [pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1],
    pts[pts.length - 1][1] - pts[0][1]];
}

export interface SensitivitySummary {
  median_rank_movement: number;
  max_rank_movement: number;
  worst_country: string;
  n: number;
  profiles: string[];
}

/** `f"{x:+.1f}"` -- the signed one-place format the report uses for gaps. */
function signed1(x: number): string {
  return pyFormatFixed(x, 1, { sign: true });
}

export function write(
  rows: ReportRow[],
  outPath: string,
  sensitivity?: SensitivitySummary | null,
  today?: string,
): void {
  const idx = new Map(rows.map((r) => [r.iso3 as string, r]));
  const countries = rows.filter((r) => r.row_type === 'country');
  const regions = rows.filter((r) => r.row_type === 'region');
  const groups = rows.filter((r) => r.row_type === 'group');
  const w: ReportRow = idx.get('WLD') ?? {};
  const withIsco = countries.filter((r) => num(r, 'white_collar_pct') !== null);
  const withYouth = countries.filter((r) => num(r, 'young_white_collar_pct') !== null);
  // only rank countries whose occupation data is recent and well classified
  const rankable = withIsco.filter(
    (r) =>
      (num(r, 'isco_classified_share_pct') ?? 100) >= 90 &&
      parseInt(r.data_year_occupation as string, 10) >= 2019,
  );
  const byWc = [...rankable].sort(
    (a, b) => -(num(a, 'white_collar_pct') as number) - -(num(b, 'white_collar_pct') as number),
  );

  const L: string[] = [];
  const A = (line: string) => L.push(line);
  A('# Global Labor Structure & AI Exposure — Summary Report');
  A('');
  A(`Generated ${today ?? new Date().toLocaleDateString('en-CA')} from \`pipeline/data/global_labor_dataset.csv\`.`);
  A('');
  A(
    '**Read the confidence section at the bottom before quoting any number.** ' +
      'Sections A–C are official statistics. Section D is an official statistic ' +
      'used as a *proxy* for "white collar." Sections E and F are constructed ' +
      'proxies and a modeled overlay respectively — they are not measurements.',
  );
  A('');

  // ------------------------------------------------------------- headline
  A('## Headline global numbers');
  A('');
  A('| Measure | Value | Basis |');
  A('|---|---:|---|');
  A(`| World population | ${f(num(w, 'population_total'), 0)} | World Bank SP.POP.TOTL, ${w.data_year_population} |`);
  A(`| Children (0–14) | ${f(num(w, 'pop_0_14_pct'))}% | official |`);
  A(`| Working age (15–64) | ${f(num(w, 'pop_15_64_pct'))}% | official |`);
  A(`| 65+ ("retirees" — age proxy) | ${f(num(w, 'pop_65plus_pct'))}% | age proxy, not pension receipt |`);
  A(`| Labor force participation, 15+ | ${f(num(w, 'lfp_rate_total'))}% | official (ILO modelled) |`);
  A(`| Employed people worldwide | ${f(num(w, 'employed_total'), 0)} | derived: labor force × (1 − unemployment) |`);
  A(`| **Share of the whole population that works at all** | **${f(num(w, 'employed_share_of_population_pct'))}%** | derived from official inputs |`);
  A(`| Unemployment rate | ${f(num(w, 'unemployment_rate_total'))}% | official |`);
  A(`| Employment in services | ${f(num(w, 'emp_services_pct'))}% | official — **weak** white-collar proxy |`);
  A(`| **White collar (ISCO 1–4) share of employment** | **${f(num(w, 'white_collar_pct'))}%** | official occupation data, ${f(num(w, 'isco_coverage_pct_of_employment'), 0)}% of world employment covered |`);
  A(`| Professional core (ISCO 1–2) | ${f(num(w, 'professional_core_pct'))}% | same |`);
  A(`| Non-white-collar (ISCO 5–9) | ${f(num(w, 'blue_collar_service_pct'))}% | same |`);
  A(`| Entry-level proxy: employed 15–24 in ISCO 1–4 | ${f(num(w, 'young_white_collar_pct'))}% | **PROXY**, ${f(num(w, 'youth_isco_coverage_pct_of_employment'), 0)}% of employment covered |`);
  A(`| AI task-exposure score (0–1) | ${f(num(w, 'ai_exposure_weighted_score'), 3)} | **MODELED**, see README |`);
  A('');
  const wc = num(w, 'white_collar_pct');
  const emp = num(w, 'employed_total');
  if (wc && emp) {
    A(
      `In absolute terms: of roughly **${f(emp, 0)}** employed people worldwide, ` +
        `about **${f((emp * wc) / 100, 0)}** work in ISCO major groups 1–4 — the ` +
        'managerial, professional, technical and clerical occupations that ' +
        'carry the most generative-AI task overlap.',
    );
    A('');
    A(
      'The single most exposed group, clerical support workers (ISCO 4), is ' +
        `${f(num(w, 'isco4_clerical_pct'))}% of world employment ` +
        `(~${f((emp * (num(w, 'isco4_clerical_pct') as number)) / 100, 0)} people).`,
    );
  }
  A('');

  // ------------------------------------------------------------- coverage
  A('## Coverage');
  A('');
  A(`- Countries / territories in the dataset: **${countries.length}**`);
  A(
    `- With ISCO-08 occupation data (section D): **${withIsco.length}** ` +
      `(${countries.length - withIsco.length} without)`,
  );
  A(`- With the youth × occupation cross-tab (section E): **${withYouth.length}**`);
  A(`- Aggregate rows: **${rows.length - countries.length}** (World, 7 World Bank regions, EU-27, OECD, G20)`);
  A(
    '- World white-collar figure is computed over ' +
      `**${f(num(w, 'isco_coverage_pct_of_employment'), 0)}%** of global employment.`,
  );
  A('');
  const missingBig = countries
    .filter(
      (r) => num(r, 'white_collar_pct') === null && (num(r, 'population_total') ?? 0) > 20_000_000,
    )
    .sort((a, b) => -(num(a, 'population_total') ?? 0) - -(num(b, 'population_total') ?? 0));
  if (missingBig.length) {
    A(
      'Large countries (>20M people) with **no** occupation data — the main ' +
        'source of gap in the world figure:',
    );
    A('');
    for (const r of missingBig) {
      A(`- ${r.country_name} (${r.iso3}) — ${f(num(r, 'population_total'), 0)} people`);
    }
    A('');
  }

  // ------------------------------------------------------------- rankings
  A('## Top 15 countries by white-collar share of employment');
  A('');
  A(
    '_Restricted to countries with ≥90% of employment classified by occupation ' +
      'and occupation data from 2019 or later._',
  );
  A('');
  A('| # | Country | White collar (ISCO 1–4) % | Professional core (1–2) % | Clerical (4) % | Entry-level proxy % | Year |');
  A('|---:|---|---:|---:|---:|---:|---:|');
  byWc.slice(0, 15).forEach((r, i) => {
    A(
      `| ${i + 1} | ${r.country_name} | ${f(num(r, 'white_collar_pct'))} | ` +
        `${f(num(r, 'professional_core_pct'))} | ${f(num(r, 'isco4_clerical_pct'))} | ` +
        `${f(num(r, 'young_white_collar_pct'))} | ${r.data_year_occupation} |`,
    );
  });
  A('');
  A('## Bottom 15 countries by white-collar share of employment');
  A('');
  A('| # | Country | White collar (ISCO 1–4) % | Professional core (1–2) % | Agriculture emp % | Entry-level proxy % | Year |');
  A('|---:|---|---:|---:|---:|---:|---:|');
  byWc.slice(-15).reverse().forEach((r, i) => {
    A(
      `| ${i + 1} | ${r.country_name} | ${f(num(r, 'white_collar_pct'))} | ` +
        `${f(num(r, 'professional_core_pct'))} | ${f(num(r, 'emp_agriculture_pct'))} | ` +
        `${f(num(r, 'young_white_collar_pct'))} | ${r.data_year_occupation} |`,
    );
  });
  A('');

  // ------------------------------------------------------------- regional
  A('## Regional comparison');
  A('');
  A(
    'All aggregates are **employment-weighted**, never simple averages of ' +
      'country percentages. `ISCO coverage` is the share of that region\'s ' +
      'employment that sits in countries which actually report occupation data — ' +
      'read the white-collar figure with that number in mind.',
  );
  A('');
  A('| Region | Pop | Works at all % | LFP 15+ % | Services % | White collar % | Prof. core % | Entry-level proxy % | AI score | ISCO coverage |');
  A('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const regionOrder = [
    w,
    ...[...regions].sort(
      (a, b) => -(num(a, 'population_total') ?? 0) - -(num(b, 'population_total') ?? 0),
    ),
    ...groups,
  ];
  for (const r of regionOrder) {
    A(
      `| ${r.country_name} | ${f(num(r, 'population_total'), 0)} | ` +
        `${f(num(r, 'employed_share_of_population_pct'))} | ${f(num(r, 'lfp_rate_total'))} | ` +
        `${f(num(r, 'emp_services_pct'))} | ${f(num(r, 'white_collar_pct'))} | ` +
        `${f(num(r, 'professional_core_pct'))} | ${f(num(r, 'young_white_collar_pct'))} | ` +
        `${f(num(r, 'ai_exposure_weighted_score'), 3)} | ${f(num(r, 'isco_coverage_pct_of_employment'), 0)}% |`,
    );
  }
  A('');

  // ------------------------------------------------------- entry level cut
  A('## Entry-level (proxy) vs. overall white collar');
  A('');
  A(
    '`young_white_collar_pct` is the share of **employed 15–24 year olds** who ' +
      'work in ISCO 1–4. Where it sits *below* the all-ages white-collar share, ' +
      'young workers are concentrated in service, sales and elementary jobs ' +
      'rather than in offices — the normal pattern almost everywhere.',
  );
  A('');
  const both = rankable.filter((r) => num(r, 'young_white_collar_pct') !== null);
  const gap = [...both].sort(
    (a, b) =>
      (num(a, 'young_white_collar_pct') as number) - (num(a, 'white_collar_pct') as number) -
      ((num(b, 'young_white_collar_pct') as number) - (num(b, 'white_collar_pct') as number)),
  );
  A('| | Country | All-ages white collar % | Youth (15–24) white collar % | Gap (pp) |');
  A('|---|---|---:|---:|---:|');
  for (const [lbl, subset] of [
    ['widest gap', gap.slice(0, 8)],
    ['narrowest / inverted', gap.slice(-5).reverse()],
  ] as [string, ReportRow[]][]) {
    for (const r of subset) {
      const d =
        (num(r, 'young_white_collar_pct') as number) - (num(r, 'white_collar_pct') as number);
      A(
        `| ${lbl} | ${r.country_name} | ${f(num(r, 'white_collar_pct'))} | ` +
          `${f(num(r, 'young_white_collar_pct'))} | ${signed1(d)} |`,
      );
    }
  }
  A('');

  // ------------------------------------------------------ career stage
  A('## White collar by career stage');
  A('');
  A(
    'The occupation cross-tab carries ISCO major groups for the aggregate age ' +
      'bands, so the white-collar share can be read at each career stage. ' +
      '(Neither 15–29 nor 15–34 is constructible — the 10-year bands are ' +
      'published against skill level only, not ISCO.)',
  );
  A('');
  const stageRows = rankable.filter(
    (r) => num(r, 'prime_white_collar_pct') !== null && num(r, 'young_white_collar_pct') !== null,
  );
  stageRows.sort(
    (a, b) =>
      -((num(a, 'prime_white_collar_pct') as number) - (num(a, 'young_white_collar_pct') as number)) -
      -((num(b, 'prime_white_collar_pct') as number) - (num(b, 'young_white_collar_pct') as number)),
  );
  A('| Country | Youth 15–24 | Prime 25–54 | Late 55–64 | All ages | Prime − youth |');
  A('|---|---:|---:|---:|---:|---:|');
  for (const r of [idx.get('WLD'), ...stageRows.slice(0, 10)]) {
    if (!r) continue;
    const y = num(r, 'young_white_collar_pct');
    const p = num(r, 'prime_white_collar_pct');
    const g2 = y !== null && p !== null ? signed1(p - y) : 'n/a';
    A(
      `| ${r.country_name} | ${f(y)} | ${f(p)} | ` +
        `${f(num(r, 'late_career_white_collar_pct'))} | ${f(num(r, 'white_collar_pct'))} | ${g2} |`,
    );
  }
  A('');
  A(
    `Prime-age white-collar shares are published for **${countries.filter((r) => num(r, 'prime_white_collar_pct') !== null).length}** ` +
      'countries. In almost every one, youth are markedly *less* white-collar than ' +
      'prime-age workers — entry-level work sits in service, sales and elementary ' +
      'occupations, not in offices.',
  );
  A('');

  // ------------------------------------------------------------- trends
  const panel = loadPanel();
  if (panel.length) {
    A('## Trends — is clerical work already shrinking?');
    A('');
    A(
      'Built from the year-by-year panel. This is the question the snapshot ' +
        'could not answer: whether the occupations most exposed to AI were ' +
        'already in decline before generative AI arrived.',
    );
    A('');
    A('| Country | Clerical (ISCO 4) | White collar (ISCO 1–4) | Period |');
    A('|---|---:|---:|---:|');
    const watch = ['USA', 'DEU', 'GBR', 'FRA', 'JPN', 'KOR', 'ESP', 'ITA', 'POL', 'IND', 'BRA', 'MEX'];
    for (const iso3 of watch) {
      const tc = trend(panel, iso3, 'isco4_clerical_pct');
      const tw = trend(panel, iso3, 'white_collar_pct');
      if (!tc) continue;
      const name = idx.get(iso3)?.country_name ?? iso3;
      const wcTxt = tw ? `${signed1(tw[4])} pp` : 'n/a';
      A(
        `| ${name} | ${pyFormatFixed(tc[1], 1)} → ${pyFormatFixed(tc[3], 1)} (${signed1(tc[4])} pp) | ${wcTxt} ` +
          `| ${tc[0]}–${tc[2]} |`,
      );
    }
    A('');
    const falling: [string, number][] = [];
    const rising: [string, number][] = [];
    for (const r of countries) {
      const t = trend(panel, r.iso3 as string, 'isco4_clerical_pct');
      if (t && t[4] < -0.5) falling.push([r.country_name as string, t[4]]);
    }
    for (const r of countries) {
      const t = trend(panel, r.iso3 as string, 'isco4_clerical_pct');
      if (t && t[4] > 0.5) rising.push([r.country_name as string, t[4]]);
    }
    A(
      'Across countries with at least six years of occupation data, clerical ' +
        `employment share **fell by more than 0.5pp in ${falling.length}** and ` +
        `**rose by more than 0.5pp in ${rising.length}**. Where it is falling it has ` +
        'usually been falling steadily since well before 2022, which matters for ' +
        'attribution: a declining clerical share is not by itself evidence of AI.',
    );
    A('');
    A(
      '**Aggregate trend lines are not reliable.** The set of countries ' +
        'reporting occupation data changes from year to year, so movement in the ' +
        'World or regional series is partly composition change. The panel carries ' +
        '`isco_coverage_pct_of_employment` per year so this can be seen; country ' +
        'series do not have this problem.',
    );
    A('');
  }

  // ------------------------------------------------- squeeze + headcounts
  A('## Entry-level squeeze index');
  A('');
  A(
    'A **modeled composite** (not a measurement) of four percentile ranks, ' +
      'combined with weights we assigned (0.25 / 0.30 / 0.25 / 0.20): youth ' +
      'cohort size, youth white-collar concentration, youth unemployment, and ' +
      'whether youth are more white-collar than the workforce average. All four ' +
      'components stay separately inspectable in the dataset.',
  );
  A('');
  const sq = countries
    .filter((r) => num(r, 'entry_level_squeeze_index') !== null)
    .sort(
      (a, b) =>
        -(num(a, 'entry_level_squeeze_index') as number) -
        -(num(b, 'entry_level_squeeze_index') as number),
    );
  A('| # | Country | Squeeze | Youth cohort % | Youth white collar % | Youth unemployment % |');
  A('|---:|---|---:|---:|---:|---:|');
  sq.slice(0, 12).forEach((r, i) => {
    A(
      `| ${i + 1} | ${r.country_name} | ${f(num(r, 'entry_level_squeeze_index'))} | ` +
        `${f(num(r, 'youth_cohort_share'))} | ${f(num(r, 'young_white_collar_pct'))} | ` +
        `${f(num(r, 'unemployment_rate_15_24'))} |`,
    );
  });
  A('');
  A(
    'The index is dominated by small states and island economies, where a large ' +
      'youth cohort meets a thin formal labour market. Read it alongside the ' +
      'headcount table below, which shows where the *number* of exposed workers is ' +
      'largest.',
  );
  A('');

  A('## Where the exposed jobs actually are — headcounts');
  A('');
  A(
    'Shares put Luxembourg at the top. Headcounts put India there. Both are true; ' +
      'they answer different questions.',
  );
  A('');
  const hc = countries
    .filter((r) => num(r, 'clerical_employed') !== null)
    .sort((a, b) => -(num(a, 'clerical_employed') as number) - -(num(b, 'clerical_employed') as number));
  A('| # | Country | Clerical workers | White-collar workers | Clerical % | ');
  A('|---:|---|---:|---:|---:|');
  hc.slice(0, 12).forEach((r, i) => {
    A(
      `| ${i + 1} | ${r.country_name} | ${f(num(r, 'clerical_employed'), 0)} | ` +
        `${f(num(r, 'white_collar_employed'), 0)} | ${f(num(r, 'isco4_clerical_pct'))} |`,
    );
  });
  A('');

  // ---------------------------------------------------------- validation
  A('## Independent validation');
  A('');
  const xc = path.join(HERE, 'data', 'crosscheck_eurostat.csv');
  if (existsSync(xc)) {
    const cc = readCsvDict(readFileSync(xc, 'utf8'));
    const ok = cc.filter((r) => r.within_tolerance === 'True').length;
    let worst = cc[0];
    for (const r of cc) {
      if (Math.abs(Number(r.delta_pp)) > Math.abs(Number(worst.delta_pp))) worst = r;
    }
    A(
      '**Eurostat cross-check.** Our ILOSTAT-derived white-collar share was ' +
        "compared against Eurostat's own Labour Force Survey (`lfsa_egais`) for " +
        `all EU-27 members. **${ok} of ${cc.length}** agree within 3 percentage ` +
        `points. Largest disagreement: ${worst.country_name} at ` +
        `${worst.delta_pp}pp (ILO ${worst.ilo_white_collar_pct}% for ` +
        `${worst.ilo_year} vs Eurostat ${worst.eurostat_white_collar_pct}% ` +
        `for ${worst.eurostat_year}), which is mostly a vintage difference. ` +
        'Full table in `data/crosscheck_eurostat.csv`.',
    );
    A('');
  }
  if (sensitivity) {
    A(
      '**AI exposure sensitivity.** The exposure weights are ours, so the ' +
        'honest test is how much the country ordering depends on them. Scoring ' +
        `all ${sensitivity.n} countries under ` +
        `${sensitivity.profiles.length} plausible weightings ` +
        `(${sensitivity.profiles.join(', ')}) moves the median country by only ` +
        `**${sensitivity.median_rank_movement} places**; the worst case is ` +
        `${sensitivity.max_rank_movement} places ` +
        `(${sensitivity.worst_country}). **The ranking is robust even though ` +
        'the cardinal score is not** — which is exactly the claim the README ' +
        'makes for it. Full table in `data/ai_exposure_sensitivity.csv`.',
    );
    A('');
  }
  const ol = path.join(HERE, 'data', 'outliers_for_review.csv');
  if (existsSync(ol)) {
    const outs = readCsvDict(readFileSync(ol, 'utf8'));
    A(
      `**Outlier review.** ${outs.length} values were flagged as statistically ` +
        'improbable (robust z-score beyond ±3.5, or structurally inconsistent ' +
        "with the country's sector mix). Nothing is auto-corrected — see " +
        '`data/outliers_for_review.csv`.',
    );
    A('');
  }

  // ------------------------------------------------------------ confidence
  A('## Confidence — what is solid and what is constructed');
  A('');
  A('| Field group | Status | Why |');
  A('|---|---|---|');
  A('| A. Population by age band, dependency ratio | **Official statistic** | World Bank / UN Population Division. Near-universal coverage. |');
  A('| 65+ as "retirees" | **Official stat used as a proxy** | It is an age band, not pension receipt. Actual retirement ages and informal work after 65 vary enormously. |');
  A('| B. LFP, employment ratio, unemployment | **Official statistic** (largely ILO-modelled) | Modelled estimates fill country gaps; they are official but they are model output, not raw survey counts. |');
  A('| Total employed persons (headcount) | **Derived** | labor force × (1 − unemployment rate). Used only for weighting aggregates. |');
  A('| C. Agriculture / industry / services shares | **Official statistic** | But *services* is a poor white-collar proxy — it includes retail, hospitality, transport and domestic work. Do not use it as the white-collar number. |');
  A('| D. ISCO-08 major groups 1–9 | **Official statistic, used as a proxy** | The occupational split is a real survey measurement. Calling groups 1–4 "white collar" is our definitional choice, and it is imperfect: ISCO 3 (technicians) includes many field and technical trades. |');
  A(`| D. World / regional white-collar aggregates | **Partly estimated** | Only ${f(num(w, 'isco_coverage_pct_of_employment'), 0)}% of world employment is covered by countries reporting ISCO data. Non-reporting countries (notably China) are assumed to resemble the covered countries in their weighting group. |`);
  A('| E. Entry-level share | **PROXY — not a measurement** | No global source tracks junior vs. senior seniority within an occupation. Age 15–24 is a stand-in: it misses graduate-entry roles at 25–29 and counts long-tenure young workers as entry-level. |');
  A('| ISCO-88 fallback countries | **Official statistic, older revision** | 10 areas publish ISCO-88 only. Major groups align 1:1 with ISCO-08, so the 1–4 cut carries over; the revision moved some ICT occupations between groups 2 and 3, making `professional_core_pct` slightly less comparable than `white_collar_pct`. |');
  A('| Career-stage shares (25–54, 55–64) | **Official statistic** | Same survey source as the headline occupation split. |');
  A('| Entry-level squeeze index | **MODELED composite** | Four percentile ranks combined with weights we assigned (0.25 / 0.30 / 0.25 / 0.20). Not measured; all components separately available. |');
  A('| Exposed wage bill | **MODELED** | A modeled index multiplied by two official statistics. An order of magnitude, never an amount at risk. |');
  A('| Time-series country trends | **Official statistic** | Same source, more years. |');
  A('| Time-series AGGREGATE trends | **Unreliable** | The reporting country set changes year to year, so aggregate movement is partly composition change. Per-year coverage is published so this can be seen. |');
  A('| F. AI exposure score | **MODELED ESTIMATE** | Weights per ISCO major group are assigned by us, informed by published research. Only the rank order is defensible; treat the value as an index, not a probability of displacement. |');
  A('');
  A('### Known limitations');
  A('');
  const stale = withIsco.filter((r) => parseInt(r.data_year_occupation as string, 10) < 2019);
  const lowcls = withIsco.filter((r) => (num(r, 'isco_classified_share_pct') ?? 100) < 90);
  const partialGroups = withIsco.filter((r) => (num(r, 'isco_groups_reported') ?? 9) < 9);
  A(
    '- **Mixed vintages.** Occupation data ranges across years by country; ' +
      'every row records `data_year_occupation` separately from ' +
      '`data_year_population` and `data_year_labor`. Never treat a row as a ' +
      'single-year snapshot.',
  );
  A(
    `- **${stale.length} countries** have occupation data older than 2019 ` +
      `(${stale.map((r) => r.iso3 as string).sort().join(', ')}). They carry a ` +
      '`data_quality_flag` and are excluded from the rankings above.',
  );
  A(
    `- **${lowcls.length} countries** classify less than 90% of employment by ` +
      `occupation (${lowcls.map((r) => r.iso3 as string).sort().join(', ')}); their ` +
      'white-collar share is computed over the classified portion only.',
  );
  A(
    `- **${partialGroups.length} countries** report fewer than 9 ISCO major ` +
      `groups (${partialGroups.map((r) => r.iso3 as string).sort().join(', ')}); a ` +
      'missing group is folded elsewhere by the national classification.',
  );
  A(
    '- **China has no ISCO-08 breakdown in ILOSTAT**, which is the single ' +
      'largest hole in the global white-collar figure.',
  );
  A(
    '- Countries with no data are retained as rows with nulls and a ' +
      '`data_quality_flag`, never dropped and never imputed.',
  );
  A('');
  writeFileSync(outPath, L.join('\n') + '\n', 'utf8');
  process.stdout.write(`      wrote ${outPath}\n`);
}

/**
 * The one definition of the sensitivity summary, shared by both callers.
 *
 * `crosscheck.sensitivity()` calls this with its freshly scored rows;
 * `loadSensitivity()` calls it with the same rows parsed back from the CSV.
 * Having a single expression is the point: two implementations of "the median
 * country moves N places" would agree on odd `n` and diverge on even, and `n`
 * is the count of countries carrying `white_collar_pct`, so its parity flips
 * whenever one country gains or loses occupation data.
 *
 * Note this is the **upper-middle** value for even `n`, not a true median.
 * That is the historical definition and it is what the published figures were
 * produced with; changing it here would silently restate them.
 */
export function summariseSensitivity(
  rows: { max_rank_movement: string; country_name: string }[],
  profiles: string[],
): SensitivitySummary {
  const moves = rows.map((r) => parseInt(r.max_rank_movement, 10)).sort((a, b) => a - b);
  // Python's `max` returns the FIRST maximal element.
  let worst = rows[0];
  for (const r of rows) {
    if (parseInt(r.max_rank_movement, 10) > parseInt(worst.max_rank_movement, 10)) worst = r;
  }
  return {
    median_rank_movement: moves[Math.floor(moves.length / 2)],
    max_rank_movement: moves[moves.length - 1],
    worst_country: worst.country_name,
    n: moves.length,
    profiles,
  };
}

/**
 * Rebuild the sensitivity summary from the committed artifacts.
 *
 * Both files are committed, so a missing one is a broken checkout rather than
 * a normal state: the reads are left to throw. Returning null here would feed
 * `write(sensitivity=null)`, whose gate skips the paragraph -- reinstating the
 * silent drop this exists to remove, behind a different condition, while still
 * printing `wrote ...` as though nothing were wrong.
 */
export function loadSensitivity(): SensitivitySummary {
  const rows = readCsvDict(
    readFileSync(path.join(HERE, 'data', 'ai_exposure_sensitivity.csv'), 'utf8'),
  );
  const profiles = JSON.parse(
    readFileSync(path.join(HERE, 'ai_exposure_isco.json'), 'utf8'),
  ).profiles as Record<string, unknown>;
  return summariseSensitivity(
    rows as unknown as { max_rank_movement: string; country_name: string }[],
    Object.keys(profiles),
  );
}

if (import.meta.filename === process.argv[1]) {
  write(load(), path.join(HERE, 'summary_report.md'), loadSensitivity());
}
