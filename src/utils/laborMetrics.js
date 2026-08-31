// Tier vocabulary and ISCO group definitions, shared by the wizard.
//
// 0010 R1 keeps exactly five exports from this module -- TIERS, ISCO_GROUPS,
// fmt, fmtCompact, qualityTone -- and deletes the other nine, all of which
// existed for the map: the metric registry and its lookup, the two colour-ramp
// helpers, the marker-radius and normalisation functions, the no-data colour,
// and the two formatters the sidebar used. They are named in spec 0010 R1
// rather than here, because R1's acceptance greps this tree for them.
//
// `tier` is deliberately part of the vocabulary: the dataset mixes official
// statistics with constructed proxies and one modeled overlay, and the UI is
// required to keep that distinction visible rather than blurring it.

export const TIERS = {
  official: {
    label: 'OFFICIAL',
    color: '#2f9e44',
    blurb: 'Published national statistic (World Bank / ILOSTAT).',
  },
  derived: {
    label: 'DERIVED',
    color: '#1971c2',
    blurb: 'Computed arithmetically from official statistics.',
  },
  proxy: {
    label: 'PROXY',
    color: '#e8590c',
    blurb: 'A stand-in for something no source measures globally. Not a measurement.',
  },
  modeled: {
    label: 'MODELED',
    color: '#9c36b5',
    blurb: 'Analyst-assigned model output. Rank order only — not official statistics.',
  },
};

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

export function fmt(value, decimals = 1, unit = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(decimals)}${unit}`;
}

export function fmtCompact(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const n = Number(value);
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  // Two decimals, matching the B and T cases above rather than the one it used
  // to carry. 0010's result screen renders a headcount as the reader's own
  // number -- GBR clerical is 2,989,466, and `3.0M` rounds away the fact that
  // it is under three million. The canvas shows `2.99M`.
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

export function qualityTone(flag) {
  if (!flag) return { color: '#868e96', label: 'unknown' };
  if (flag.startsWith('complete')) return { color: '#2f9e44', label: 'complete' };
  if (flag.startsWith('aggregate')) return { color: '#1971c2', label: 'aggregate' };
  if (flag.startsWith('sparse')) return { color: '#e03131', label: 'sparse' };
  return { color: '#e8590c', label: 'partial' };
}
