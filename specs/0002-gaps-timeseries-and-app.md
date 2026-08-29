# 0002 — Coverage gaps, time series, derived measures, app features

Extends the v1 pipeline (snapshot dataset + map page) with gap fixes, a time
series, new derived measures, and app features. Every external source named
below was probed live before being specified — items marked **NOT FEASIBLE**
were investigated and found unavailable, and are recorded rather than dropped.

Legend: `[x]` done · `[!]` investigated, not feasible · `[~]` revised during implementation

**Status: 15 done · 1 revised · 1 not feasible.**

---

## Part 1 — Close the coverage gaps

### R1. [x] ISCO-88 fallback for countries with no ISCO-08 series
**Verified:** ILOSTAT carries ISCO-88 major groups for 10 areas that have no
ISCO-08 series at all: `BMU, CAN, MAC, NAM, NIC, TTO, TWN, UKR, YEM, ZAF`.

- Accept ISCO-88 major groups 1–9 when no usable ISCO-08 year exists.
- ISCO-88 and ISCO-08 major groups align 1:1 at this level (1 Managers,
  2 Professionals, 3 Technicians, 4 Clerks, 5 Service/sales, 6 Skilled
  agricultural, 7 Craft, 8 Operators, 9 Elementary), so the 1–4 white-collar cut
  carries over. The revision moved some ICT occupations between groups 2 and 3,
  so `professional_core_pct` is slightly less comparable than
  `white_collar_pct`.
- New column `isco_classification` = `ISCO-08` | `ISCO-88`. Prefer ISCO-08 always.
- Acceptance: Canada, Taiwan, South Africa and Ukraine all carry a
  `white_collar_pct`; occupation coverage rises from 167 to ~177 countries;
  world ISCO coverage of employment rises above 75%.

### R2. [!] New Zealand and Saudi Arabia — **NOT FEASIBLE from free sources**
**Verified:** absent from every ILOSTAT occupation dataflow, and OECD's SDMX
catalog contains no ISCO occupation dataflow at all (ALFS publishes employment
by ISIC industry and ICSE status only). Record as an open gap in the README with
the reason, rather than substituting a modeled figure.

### R3. [x] Manual override mechanism for national statistical offices
ILOSTAT's Armenia occupation series ends at **2017** and no other free source
carries it; the same will be true of other countries over time.

- Add `pipeline/manual_overrides.json`: per-ISO3 field values, each requiring
  `value`, `year`, `source_name`, `source_url`, `retrieved` and `note`.
- Merged after all API sources, tagged `data_source_override` in the row, and
  listed in the summary report so an overridden number is never mistaken for an
  API-sourced one.
- Ship the file with the schema and an Armenia entry commented as unfilled — do
  **not** invent Armenian figures.

### R4. [x] Eurostat cross-validation of EU-27 occupation shares
**Verified:** `lfsa_egais` ("Employed persons by professional status and
occupation") exposes an `isco08` dimension via the Eurostat dissemination API.

- Pull ISCO-08 major groups for EU-27, compute `white_collar_pct` independently.
- Emit `data/crosscheck_eurostat.csv` with ILO value, Eurostat value, delta.
- Fail loudly in the console if any country's delta exceeds 3pp.

### R5. [x] Outlier detection
Beyond v1's range and sum checks, flag values that are statistically improbable
rather than merely impossible.

- Robust z-score (median / MAD) per field across countries; flag |z| > 3.5.
- Also flag: white_collar_pct implying more white-collar workers than the
  services sector can hold; youth white-collar more than 25pp above all-ages.
- Write to `data/outliers_for_review.csv`. Never auto-correct.

---

## Part 2 — Time series

### R6. [x] Full panel instead of latest-year-only
The raw cache already holds World Bank 2010–2026 and ILOSTAT 2013–2025.

- Emit `data/global_labor_panel.csv`: one row per (iso3, year), carrying
  population, labor, sector and occupation fields for every year present.
- SQLite gets a second table `global_labor_panel`, indexed on (iso3, year).
- Aggregates recomputed per year, employment-weighted, with per-year coverage.
- App payload `src/data/global_labor_timeseries.json` — trimmed to the metrics
  the scrubber drives, to keep the bundle reasonable.
- Acceptance: can answer "has clerical (ISCO-4) share been falling since 2015?"
  per country and for the World aggregate.

---

## Part 3 — New measures

### R7. [x] Additional World Bank indicators
**Verified live, 265+ observations each:**

| Indicator | Field | Purpose |
|---|---|---|
| `NY.GDP.PCAP.PP.CD` | `gdp_per_capita_ppp` | wage-bill magnitude |
| `BX.GSR.CCIS.ZS` | `ict_service_exports_pct` | exposed labor sold abroad |
| `BX.GSR.NFSV.CD` | `service_exports_usd` | absolute export exposure |
| `SP.POP.1524.TO.UN` | `population_15_24` | youth cohort headcount |
| `SL.TLF.ADVN.ZS` | `labor_force_advanced_edu_pct` | white-collar feeder stock |

### R8. [x] Headcount metrics
Shares hide where the exposed jobs physically are. Add and expose in the app:
`clerical_employed`, `white_collar_employed`, `professional_core_employed`,
`young_white_collar_employed`.
Acceptance: ranking by clerical headcount puts India and Indonesia above
Luxembourg.

### R9. [x] Entry-level squeeze index
Composite, explicitly labeled **DERIVED**, combining per country:
youth cohort size, youth white-collar share, youth unemployment, and the
youth-vs-all-ages white-collar gap. Normalised 0–100. Published with its formula
in the README; component fields remain separately inspectable.

### R10. [x] Exposed wage bill (modeled)
`ai_exposure_weighted_score × employed_total × gdp_per_capita_ppp` as an
order-of-magnitude economic scale. Labeled **MODELED**, never presented as an
amount at risk.

### R11. [~] Career-stage bands (revised — 15–34 proved unbuildable)
**Revised after building it.** The first probe showed 10-year bands exist; a
second, closer probe showed those bands carry **skill level only, not ISCO**.
ISCO major groups appear only against the `AGE_AGGREGATE` / `AGE_YTHADULT`
bands, so neither 15–29 nor 15–34 is constructible. What is available is better:
the full career-stage profile.
- `prime_white_collar_pct` (25–54) and `late_career_white_collar_pct` (55–64),
  alongside the existing 15–24 field. 165 countries carry the prime-age band.
- Finding: youth are markedly less white-collar than prime-age workers almost
  everywhere (US 37% vs 64%).

### R12. [x] AI exposure sensitivity analysis
The weights are ours; the honest response is to show how much they matter.
- Define three named weight profiles in `ai_exposure_isco.json`:
  `balanced` (current), `clerical_heavy`, `cognitive_uniform`.
- Emit `data/ai_exposure_sensitivity.csv` — each country's score and rank under
  each profile, plus max rank movement.
- Report rank stability in the summary. If rankings are stable across profiles,
  the ordering is robust even though the cardinal values are not.

---

## Part 4 — App

### R13. [x] Time scrubber
Year slider (driven by the panel) above the ranking strip. Drives map colour and
the ranking order. Play/pause auto-advance, matching the Moves page idiom.

### R14. [x] New metrics in the picker
Headcount metrics (R8), squeeze index (R9), early-career (R11), exposed wage
bill (R10), advanced-education share (R7) — each with its correct tier badge.

### R15. [x] Scenario slider
"If X% of clerical/white-collar tasks automate…" → affected headcount per
country, recomputed live. Framed as a sensitivity tool, with a standing caveat
that it is arithmetic on a modeled index, not a forecast.

### R16. [x] Corridor-board fusion
This dataset shares a map with the corridor board. Add an optional overlay
marking corridor states, chokepoint states and sanctioned states from the
existing JSON, so labor exposure can be read against corridor exposure.
Acceptance: can see at a glance which corridor-critical states have young,
AI-exposed workforces.

### R17. [x] Trend sparklines in the detail panel
Per-country mini charts for white-collar, clerical and youth shares over the
panel years — the single clearest payoff from R6.

---

## Non-goals

- No forecasting or projection of future occupation shares.
- No imputation of missing countries. Nulls stay null and stay flagged.
- No claim that the AI exposure index predicts displacement.
