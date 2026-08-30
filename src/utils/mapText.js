// Spec 0008 R3 — a text equivalent for the choropleth.
//
// A map of coloured circles conveys nothing to a screen reader, and the colour
// itself is unreliable even to sighted readers: the lightest ramp step sits
// ΔE00 3.7 from the no-data grey, so "low value" and "no data" look the same.
// This module is the non-visual path to the same information.
//
// Deliberately a pure function over rows and a metric, with no DOM: the
// component renders what it returns. Asserting over rendered Leaflet paths
// would couple the check to how Leaflet happens to lay out inside jsdom, and
// jsdom cannot report colour or size anyway.
// Explicit extension, unlike the rest of src/. This module is imported directly
// by `test/pure.test.mjs` under plain Node, with no Vite resolver in the way —
// which is the point of R3 being a pure function. Node does not resolve
// extensionless specifiers.
import { TIERS, fmtMetric } from './laborMetrics.js';

/**
 * One entry per row, in the order given.
 * Each carries the country name, the formatted value or the literal words
 * "no data", and the tier word — because a MODELED figure announced as a bare
 * number is the misleading case this requirement exists for.
 */
export function mapTextEntries(rows, metric) {
  const tier = TIERS[metric.tier];
  return rows.map((row) => {
    const value = row[metric.key];
    const hasData = value !== null && value !== undefined && !Number.isNaN(value);
    return {
      iso3: row.iso3,
      name: row.country_name,
      hasData,
      value: hasData ? fmtMetric(metric, value) : 'no data',
      tier: tier.label,
      // Read aloud as one line. The tier word follows the number so it is heard
      // as a qualifier on that number rather than as a category heading.
      text: hasData
        ? `${row.country_name}: ${fmtMetric(metric, value)} — ${tier.label}`
        : `${row.country_name}: no data`,
    };
  });
}

/**
 * The sentence that names the map itself: what is plotted, over how many
 * countries, and how many of them actually carry a figure. The count with data
 * is not decoration — partial coverage is the thing this project refuses to
 * paper over, and a reader who cannot see the grey circles has no other way to
 * know how much of the map is missing.
 */
export function mapSummary(rows, metric) {
  const withData = rows.filter((r) => {
    const v = r[metric.key];
    return v !== null && v !== undefined && !Number.isNaN(v);
  }).length;
  const tier = TIERS[metric.tier];
  return `${metric.label}, ${tier.label}. ${rows.length} countries plotted, ${withData} with data, ${rows.length - withData} without.`;
}
