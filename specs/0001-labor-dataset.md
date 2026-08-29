# 0001 — Core labor dataset and map page

**Status:** complete
**Note:** written retrospectively. This spec documents what was built from the
original brief before the spec process existed; `0002` onward were written
before implementation, as the process requires.

## Objective

Produce one clean dataset — one row per country plus World/regional aggregates —
covering population structure, labour force participation, and a breakdown of
employment into occupational bands, so that two questions can be answered per
country and globally: **what share of the population works at all**, and **of
those who work, what share sit in the occupations most exposed to AI**.

Be explicit throughout about which numbers are official statistics and which are
constructed proxies. Never blur the two.

## Source verification

| Source | Probed | Result |
|---|---|---|
| World Bank API v2 | `country/all/indicator/{CODE}` | Works, no key, one bulk call per indicator covers every country |
| ILOSTAT SDMX | `sdmx.ilo.org/rest/dataflow/ILO` | Works. Dataflow IDs confirmed live rather than assumed |
| ILOSTAT bulk files | `webapps.ilo.org/ilostat-files/...` | **404 — dead.** SDMX is the working path |

Confirmed dataflow IDs: `DF_EMP_TEMP_SEX_OCU_NB` (occupation),
`DF_EMP_TEMP_SEX_AGE_OCU_NB` (age × occupation), `DF_EAP_DWAP_SEX_AGE_RT`
(participation by age band).

## Requirements

### R1. [x] Population structure
Total population, 0–14, 15–64, 65+, age dependency ratio, per country.
**Acceptance:** 217/218 areas carry population data. 65+ is labelled an age
proxy for "retirees", never pension receipt.

### R2. [x] Labour force and employment status
Participation rate (total and by age band), employment-to-population ratio,
unemployment, youth unemployment, and an employed **headcount**.
**Acceptance:** headcount exists so aggregates can be employment-weighted rather
than simple-averaged.

### R3. [x] Employment by broad sector
Agriculture / industry / services.
**Acceptance:** present, and explicitly labelled a *weak* white-collar proxy —
the US is ~80% services but ~61% white collar.

### R4. [x] Employment by occupation (ISCO-08 major groups)
Groups 1–9 as shares, plus derived `white_collar_pct` (1–4),
`professional_core_pct` (1–2), `blue_collar_service_pct` (5–9).
**Acceptance:** `white_collar_pct + blue_collar_service_pct == 100` for every
country carrying occupation data.

### R5. [x] Entry-level proxy
Share of employed 15–24 year olds in ISCO 1–4.
**Acceptance:** flagged `proxy_youth_15_24_x_isco`, or `proxy_unavailable` where
the cross-tab is missing. Never imputed.

### R6. [x] AI exposure overlay
Occupation shares weighted by per-group exposure.
**Acceptance:** labelled MODELED wherever it appears, with the weights in a
swappable JSON file.

### R7. [x] Aggregates
World, 7 World Bank regions, EU-27, OECD, G20.
**Acceptance:** employment-weighted, never simple averages, and each carries
`isco_coverage_pct_of_employment` so partial coverage is visible.

### R8. [x] Validation and regression checks
**Acceptance:** all percentages in [0,100]; age bands sum to ~100; sector shares
sum to ~100; and four independent published figures reproduce — World services
≈50%, US ≈79%, EU-27 ≈72%, India ≈31.5%. All four pass.

### R9. [x] Deliverables
Cached raw responses, flat CSV, SQLite, README documenting every field and its
limitations, and a human-readable summary report.

### R10. [x] Map page
The dataset rendered on a map, with every metric carrying a tier badge
(OFFICIAL / DERIVED / PROXY / MODELED) so the distinction is visible in the UI,
not just the docs.

## Non-goals

- No forecasting of future occupation shares.
- No imputation of missing countries — nulls stay null and stay flagged.
- No claim that the exposure index predicts displacement.
