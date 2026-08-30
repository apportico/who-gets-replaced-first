// Metric definitions for the Global Labor page.
//
// `tier` is deliberately part of every metric: the dataset mixes official
// statistics with constructed proxies and one modeled overlay, and the UI is
// required to keep that distinction visible rather than blurring it.

// Spec 0008 R4 + R10. These four colours are constrained, not chosen freely, and
// `test/palette.test.mjs` fails the build if either constraint breaks:
//
//   R4   each colour on its own `${color}1a`-over-white badge >= 4.5:1
//   R10  every pair >= 15 dE00 under normal, protanopia, deuteranopia and
//        tritanopia (CIEDE2000, Machado 2009 sev-1.0 — see scripts/palette-probe.mjs)
//
// The previous palette (#2f9e44 / #1971c2 / #e8590c / #9c36b5) failed both:
// three of four badges were under 4.5:1, and DERIVED vs MODELED collapsed to
// dE00 2.4 under deuteranopia — the two tiers were the same colour, which is
// this project's measured-vs-constructed distinction disappearing.
//
// DERIVED is markedly more saturated than before because blue and purple share
// a hue under deuteranopia: with the hue channel gone, lightness and chroma are
// the only ones left to separate DERIVED from MODELED. That is why a subtler
// recolour is not available.
export const TIERS = {
  official: {
    label: 'OFFICIAL',
    color: '#306c54',
    blurb: 'Published national statistic (World Bank / ILOSTAT).',
  },
  derived: {
    label: 'DERIVED',
    color: '#2460f0',
    blurb: 'Computed arithmetically from official statistics.',
  },
  proxy: {
    label: 'PROXY',
    color: '#b4480c',
    blurb: 'A stand-in for something no source measures globally. Not a measurement.',
  },
  modeled: {
    label: 'MODELED',
    color: '#840c6c',
    blurb: 'Analyst-assigned model output. Rank order only — not official statistics.',
  },
};

// Sequential ramps, light -> saturated.
const RAMP_BLUE = ['#eaf2fb', '#c3dcf3', '#8fc0e6', '#5a9ed6', '#2f7ec1', '#1a5490'];
const RAMP_HEAT = ['#fdf3e3', '#fbdcae', '#f7bd6f', '#ef9440', '#dd6a21', '#b23c0e'];
const RAMP_TEAL = ['#e6f4f1', '#bde3dc', '#8bcdc2', '#55b3a4', '#2d9384', '#136b5f'];

// Exported so `test/palette.test.mjs` (spec 0008 R10) can assert over the ramps
// themselves rather than reaching them through METRICS, where each appears
// several times and a ramp used by no metric would go unchecked.
export const RAMPS_BY_NAME = { BLUE: RAMP_BLUE, HEAT: RAMP_HEAT, TEAL: RAMP_TEAL };

export const METRICS = [
  {
    key: 'white_collar_pct',
    label: 'White collar share',
    short: 'White collar',
    blurb: 'Share of employed people in ISCO-08 major groups 1–4 (managers, professionals, technicians, clerical support).',
    unit: '%',
    domain: [0, 70],
    ramp: RAMP_BLUE,
    tier: 'official',
    caveat: 'The occupation split is a real survey measurement; calling groups 1–4 "white collar" is a definitional choice.',
  },
  {
    key: 'professional_core_pct',
    label: 'Professional core',
    short: 'Prof. core',
    blurb: 'Stricter high-skill cut: ISCO groups 1–2 only (managers + professionals).',
    unit: '%',
    domain: [0, 55],
    ramp: RAMP_BLUE,
    tier: 'official',
  },
  {
    key: 'isco4_clerical_pct',
    label: 'Clerical support workers',
    short: 'Clerical',
    blurb: 'ISCO group 4 — the occupational group published research consistently finds most exposed to generative AI.',
    unit: '%',
    domain: [0, 14],
    ramp: RAMP_HEAT,
    tier: 'official',
  },
  {
    key: 'young_white_collar_pct',
    label: 'Entry-level white collar',
    short: 'Entry-level',
    blurb: 'Share of employed 15–24 year olds working in ISCO 1–4.',
    unit: '%',
    domain: [0, 60],
    ramp: RAMP_HEAT,
    tier: 'proxy',
    caveat: 'No global source tracks junior vs. senior within an occupation. Age 15–24 is a stand-in: it misses graduate entry at 25–29 and counts tenured young workers as entry-level.',
  },
  {
    key: 'ai_exposure_weighted_score',
    label: 'AI task-exposure score',
    short: 'AI exposure',
    blurb: 'Occupation shares weighted by per-ISCO-group generative-AI task exposure.',
    unit: '',
    decimals: 3,
    domain: [0.15, 0.6],
    ramp: RAMP_HEAT,
    tier: 'modeled',
    caveat: 'Weights are assigned by us, informed by published research. Only the rank order is defensible — read the value as an index, never as a probability of job loss.',
  },
  {
    key: 'employed_share_of_population_pct',
    label: 'Share of population employed',
    short: 'Works at all',
    blurb: 'Employed people as a share of the entire population — children and retirees included.',
    unit: '%',
    domain: [15, 60],
    ramp: RAMP_TEAL,
    tier: 'derived',
  },
  {
    key: 'lfp_rate_total',
    label: 'Labor force participation (15+)',
    short: 'LFP 15+',
    blurb: 'Share of the 15+ population in the labor force, working or looking for work.',
    unit: '%',
    domain: [35, 85],
    ramp: RAMP_TEAL,
    tier: 'official',
  },
  {
    key: 'emp_services_pct',
    label: 'Employment in services',
    short: 'Services',
    blurb: 'Broad-sector share. Included for contrast — it is a weak white-collar proxy.',
    unit: '%',
    domain: [10, 90],
    ramp: RAMP_TEAL,
    tier: 'official',
    caveat: 'Services includes retail, hospitality, transport and domestic work. The US is ~80% services but ~61% white collar — that gap is the whole point.',
  },
  {
    key: 'unemployment_rate_15_24',
    label: 'Youth unemployment (15–24)',
    short: 'Youth unemp.',
    blurb: 'Unemployment rate among 15–24 year olds.',
    unit: '%',
    domain: [0, 45],
    ramp: RAMP_HEAT,
    tier: 'official',
  },
  {
    key: 'pop_65plus_pct',
    label: 'Population 65+',
    short: '65+',
    blurb: 'Age proxy for "retirees".',
    unit: '%',
    domain: [1, 30],
    ramp: RAMP_BLUE,
    tier: 'official',
    caveat: 'An age band, not pension receipt. Says nothing about actual retirement age or work after 65.',
  },
  {
    key: 'clerical_employed',
    label: 'Clerical workers (headcount)',
    short: 'Clerical jobs',
    blurb: 'Number of people in ISCO group 4, not the share. Shares hide where the exposed jobs physically are.',
    unit: '',
    format: 'count',
    scale: 'log',
    domain: [10000, 60000000],
    ramp: RAMP_HEAT,
    tier: 'derived',
    caveat: 'Ranking by headcount reorders the map completely — India and Indonesia outrank Luxembourg.',
  },
  {
    key: 'white_collar_employed',
    label: 'White-collar workers (headcount)',
    short: 'White-collar jobs',
    blurb: 'Number of people in ISCO 1–4.',
    unit: '',
    format: 'count',
    scale: 'log',
    domain: [50000, 300000000],
    ramp: RAMP_BLUE,
    tier: 'derived',
  },
  {
    key: 'entry_level_squeeze_index',
    label: 'Entry-level squeeze index',
    short: 'Squeeze',
    blurb: 'Composite 0–100: youth cohort size, youth concentration in exposed occupations, youth unemployment, and whether youth are more white-collar than the workforce average.',
    unit: '',
    domain: [20, 90],
    ramp: RAMP_HEAT,
    tier: 'derived',
    caveat: 'A constructed composite of four percentile ranks, not a measured quantity. Its components are all inspectable separately in the panel.',
  },
  {
    key: 'prime_white_collar_pct',
    label: 'Prime-age white collar (25–54)',
    short: 'Prime 25–54',
    blurb: 'White-collar share among employed 25–54 year olds — where careers actually sit.',
    unit: '%',
    domain: [0, 70],
    ramp: RAMP_BLUE,
    tier: 'official',
  },
  {
    key: 'late_career_white_collar_pct',
    label: 'Late-career white collar (55–64)',
    short: 'Late 55–64',
    blurb: 'White-collar share among employed 55–64 year olds.',
    unit: '%',
    domain: [0, 70],
    ramp: RAMP_BLUE,
    tier: 'official',
  },
  {
    key: 'exposed_wage_bill_ppp',
    label: 'Exposed wage bill (PPP)',
    short: 'Wage bill',
    blurb: 'AI exposure score × employed × GDP per capita PPP — the economic scale of exposure rather than the job count.',
    unit: '',
    format: 'money',
    scale: 'log',
    domain: [100000000, 10000000000000],
    ramp: RAMP_HEAT,
    tier: 'modeled',
    caveat: 'An order-of-magnitude scale built on a modeled index. It is NOT an amount of money at risk.',
  },
  {
    key: 'labor_force_advanced_edu_pct',
    label: 'Labor force with advanced education',
    short: 'Advanced edu.',
    blurb: 'Share of the labor force with tertiary education — the feeder stock for white-collar work.',
    unit: '%',
    domain: [0, 80],
    ramp: RAMP_TEAL,
    tier: 'official',
  },
  {
    key: 'ict_service_exports_pct',
    label: 'ICT share of service exports',
    short: 'ICT exports',
    blurb: 'How much of a country\'s service exports are ICT — a proxy for white-collar labor sold abroad.',
    unit: '%',
    domain: [0, 70],
    ramp: RAMP_TEAL,
    tier: 'official',
    caveat: 'Countries whose exposed jobs are export-facing (India, the Philippines) carry a compounding risk a domestic-only workforce does not.',
  },
  {
    key: 'pop_0_14_pct',
    label: 'Population 0–14',
    short: 'Children',
    blurb: 'Age proxy for "children".',
    unit: '%',
    domain: [10, 50],
    ramp: RAMP_TEAL,
    tier: 'official',
  },
];

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m]));

export const ISCO_GROUPS = [
  { key: 'isco1_managers_pct', n: 1, label: 'Managers', collar: 'white', color: '#1a5490' },
  { key: 'isco2_professionals_pct', n: 2, label: 'Professionals', collar: 'white', color: '#2f7ec1' },
  { key: 'isco3_technicians_pct', n: 3, label: 'Technicians & associate professionals', collar: 'white', color: '#5a9ed6' },
  { key: 'isco4_clerical_pct', n: 4, label: 'Clerical support workers', collar: 'white', color: '#8fc0e6' },
  { key: 'isco5_service_sales_pct', n: 5, label: 'Service & sales workers', collar: 'other', color: '#f7bd6f' },
  { key: 'isco6_agricultural_pct', n: 6, label: 'Skilled agricultural, forestry & fishery', collar: 'other', color: '#c9a227' },
  { key: 'isco7_craft_pct', n: 7, label: 'Craft & related trades', collar: 'other', color: '#dd8452' },
  { key: 'isco8_operators_pct', n: 8, label: 'Plant & machine operators, assemblers', collar: 'other', color: '#b5651d' },
  { key: 'isco9_elementary_pct', n: 9, label: 'Elementary occupations', collar: 'other', color: '#8c6d4f' },
];

export const NO_DATA_COLOR = '#dfe3e8';

// Spec 0008 R5. A country with no data must not look like a country with a low
// measured value. Colour alone cannot carry that: the lightest BLUE step sits
// ΔE00 3.7 and 1.14:1 from this grey — indistinguishable for people with normal
// colour vision, before dichromacy is considered at all. That is this project's
// central non-negotiable failing at the point of delivery, so the distinction
// moves to a channel that is not colour: a dashed stroke.
//
// A pure function rather than inline ternaries in LaborMap, so R9 can assert it
// applies to exactly the null rows without rendering Leaflet inside jsdom.
export const NO_DATA_DASH = '3 2';

export function markerPropsFor(metric, row, isSelected = false) {
  const value = row[metric.key];
  const hasData = value !== null && value !== undefined && !Number.isNaN(value);
  return {
    hasData,
    fillColor: colorFor(metric, value),
    color: isSelected ? '#111827' : hasData ? '#ffffff' : '#8b929b',
    weight: isSelected ? 2.5 : hasData ? 1 : 1.5,
    fillOpacity: hasData ? 0.88 : 0.4,
    // The non-colour channel. Present only on no-data markers, and the thing
    // R9 asserts over.
    dashArray: hasData ? null : NO_DATA_DASH,
    className: hasData ? 'has-data' : 'no-data',
  };
}

// Headcount metrics span six orders of magnitude, so they need a log scale or
// every country below 10M collapses into the lightest bucket.
export function normalise(metric, value) {
  const [lo, hi] = metric.domain;
  if (metric.scale === 'log') {
    const l = Math.log10(Math.max(lo, 1));
    const h = Math.log10(Math.max(hi, 10));
    return Math.min(1, Math.max(0, (Math.log10(Math.max(value, 1)) - l) / (h - l)));
  }
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

export function colorFor(metric, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return NO_DATA_COLOR;
  const t = normalise(metric, value);
  const idx = Math.min(metric.ramp.length - 1, Math.floor(t * metric.ramp.length));
  return metric.ramp[idx];
}

/** Format a value the way its metric wants to be read. */
export function fmtMetric(metric, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (metric.format === 'count') return fmtCompact(value);
  if (metric.format === 'money') return `$${fmtCompact(value)}`;
  return `${Number(value).toFixed(metric.decimals ?? 1)}${metric.unit}`;
}

export function rampStops(metric) {
  const [lo, hi] = metric.domain;
  const step = (hi - lo) / metric.ramp.length;
  return metric.ramp.map((color, i) => ({
    color,
    from: lo + i * step,
    to: lo + (i + 1) * step,
  }));
}

export function fmt(value, decimals = 1, unit = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(decimals)}${unit}`;
}

export function fmtInt(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function fmtCompact(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const n = Number(value);
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

// Marker radius scales with headcount employed, so the map reads as "where the
// world's workers actually are" rather than "how many countries there are".
export function radiusFor(employed) {
  if (!employed) return 3.5;
  return Math.max(3.5, Math.min(26, Math.sqrt(employed) / 1400));
}

// Spec 0008 R7. These render as a badge in the same `${color}1a`-over-white
// pattern as TIERS, and all five were under AA — 2.99 to 4.39:1. They are
// darkened to the lightest value that clears 4.5:1, which holds every hue to
// within 2 degrees, so the badge still reads the same colour.
//
// They were missed by the first pass of R7 for the same reason the in-swatch
// labels were: the colour arrives through an inline `style` rather than a
// Tailwind utility, so no `text-*` grep reaches it. `test/text-palette.test.mjs`
// now asserts over this function directly rather than over class names.
// `data_quality_flag` is how the panel says how complete a country's data is —
// an unreadable "sparse" badge is the project's own non-negotiable failing.
export const QUALITY_TONES = {
  unknown: '#676d74',
  complete: '#257b35',
  aggregate: '#186ebc',
  sparse: '#ca2c2c',
  partial: '#b74609',
};

export function qualityTone(flag) {
  if (!flag) return { color: QUALITY_TONES.unknown, label: 'unknown' };
  if (flag.startsWith('complete')) return { color: QUALITY_TONES.complete, label: 'complete' };
  if (flag.startsWith('aggregate')) return { color: QUALITY_TONES.aggregate, label: 'aggregate' };
  if (flag.startsWith('sparse')) return { color: QUALITY_TONES.sparse, label: 'sparse' };
  return { color: QUALITY_TONES.partial, label: 'partial' };
}
