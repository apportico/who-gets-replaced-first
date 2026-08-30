// Spec 0008 R7 / R9 — the fixture row the detail panel is rendered with.
//
// Hand-authored rather than selected from the payload at run time, so the test
// does not depend on any particular country still being in the data. That makes
// the field list load-bearing, and one field in particular:
//
//   `white_collar_pct` MUST be non-null.
//
// `OccupationBreakdown` returns early at LaborDetailPanel.jsx:113 when it is
// null, rendering the "no ISCO-08 breakdown published" paragraph and no bands at
// all. A fixture missing it satisfies "every band surviving the null filter"
// over an empty set — zero bands, zero assertions, green. Every payload row
// carrying all nine ISCO groups happens to carry this field too (181 of 181),
// so a row *selected* from the data brings the guard along for free while a row
// *transcribed* from a field list does not. That is the whole reason it is
// called out here.
//
// Values are Portugal's, one of the 170 country rows carrying all three age
// bands, all nine ISCO groups and isco_groups_reported === 9. Portugal also has
// groups under the 7% threshold that used to suppress the in-bar digit
// (isco6 at 2.0%), so it exercises that path rather than avoiding it.

export const FIXTURE_ROW = {
  iso3: 'PRT',
  country_name: 'Portugal',
  row_type: 'country',
  region: 'Europe & Central Asia',
  income_group: 'High income',
  lat: 38.7072,
  lon: -9.13552,

  population_total: 10804871,
  pop_0_14_pct: 12.7139902880698,
  pop_15_64_pct: 62.3433903356215,
  pop_65plus_pct: 24.9426193763087,

  employed_total: 5147135,
  labor_force_total: 5485246,
  employed_share_of_population_pct: 47.6372,

  // The guard. Without this the ISCO half of R7's assertion passes vacuously.
  white_collar_pct: 50.7148,
  white_collar_employed: 2610359,
  professional_core_pct: 29.6676,
  blue_collar_service_pct: 49.2852,

  isco1_managers_pct: 6.073,
  isco2_professionals_pct: 23.5946,
  isco3_technicians_pct: 11.8007,
  isco4_clerical_pct: 9.2465,
  isco5_service_sales_pct: 18.741,
  isco6_agricultural_pct: 2.0057,
  isco7_craft_pct: 12.6375,
  isco8_operators_pct: 7.4707,
  isco9_elementary_pct: 8.4303,

  isco_groups_reported: 9,
  isco_classified_share_pct: 100,
  data_quality_flag: 'complete',
  ai_exposure_weighted_score: 0.46,
};

/** The three age bands the fixture renders, for R7's legend assertion. */
export const FIXTURE_AGE_BANDS = [
  { label: '0–14', pct: FIXTURE_ROW.pop_0_14_pct },
  { label: '15–64', pct: FIXTURE_ROW.pop_15_64_pct },
  { label: '65+', pct: FIXTURE_ROW.pop_65plus_pct },
];

/** The nine ISCO bands the fixture renders, for R7's legend assertion. */
export const FIXTURE_ISCO_BANDS = [
  { n: 1, pct: FIXTURE_ROW.isco1_managers_pct },
  { n: 2, pct: FIXTURE_ROW.isco2_professionals_pct },
  { n: 3, pct: FIXTURE_ROW.isco3_technicians_pct },
  { n: 4, pct: FIXTURE_ROW.isco4_clerical_pct },
  { n: 5, pct: FIXTURE_ROW.isco5_service_sales_pct },
  { n: 6, pct: FIXTURE_ROW.isco6_agricultural_pct },
  { n: 7, pct: FIXTURE_ROW.isco7_craft_pct },
  { n: 8, pct: FIXTURE_ROW.isco8_operators_pct },
  { n: 9, pct: FIXTURE_ROW.isco9_elementary_pct },
];
