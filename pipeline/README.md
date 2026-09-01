# Global Labor Structure & AI Exposure — Data Pipeline

One row per country/territory, plus World, regional and cross-cutting aggregate
rows, covering population structure, labor force participation, and the
occupational composition of employment — built so you can answer, per country
and globally: **what share of the population works at all, and of those who
work, what share sit in white-collar and entry-level occupations most exposed
to AI automation.**

## Run it

```bash
node pipeline/run.ts --pilot        # validation batch, prints regression checks
node pipeline/run.ts                # full run: all countries + 11 aggregates
node pipeline/report.ts             # regenerate summary_report.md from the CSV
npm run test:pipeline               # regression suite (specs 0004 and 0007)
```

There is **no build step**. Node 24 strips TypeScript types natively, so
`pipeline/run.ts` runs directly. `npm run typecheck` type-checks it; `tsc` never
emits.

**What `--pilot` actually does.** It *fetches* 32 areas — `set(C.PILOT) |
set(C.EU27)` — and *writes* 7 rows: WLD, EU27, and the six in `C.PILOT`. The
EU27 row is a weighted aggregate over all 27 members, so it cannot be produced
from a smaller slice. Earlier wording here called it a "6-area batch", which
described the output rows and misled at least one reader into sizing a test
fixture against the wrong scope.

**Zero runtime dependencies** (spec 0007 R9). This replaces the "standard
library only — no pip installs" rule the Python pipeline carried, and it is the
same rule in a different language: `node:sqlite`, `fetch`, `node:zlib` and
`node:util`'s `parseArgs` are all native on Node 24, and the CSV reader/writer
is hand-rolled in `csvio.ts`. `package.json` gains no runtime dependency for the
pipeline; `typescript` and `@types/node` are devDependencies, used by
`npm run typecheck` and by nothing at runtime.

Every API response is cached under `pipeline/raw/`, so re-runs are offline and
free. Delete a cached file to force a refresh of that one source. Live calls are
spaced 0.5s apart and retry with exponential backoff.

The test suite is `node --test`, runs offline, and takes under a second. Run it
before claiming a pipeline change worked.

### The number layer is not optional

`pynum.ts` exists because JavaScript's arithmetic and formatting are not
Python's, and the committed outputs were produced by Python. Every `round()` in
the old pipeline is `pyRound` / `pyRoundInt`; every `sum()` picks `pySumInt`,
`pySumFloat` or `pySum` **from the schema's declared `Int` brand at the call
site**, never from what the values look like at runtime; every float written to
a file goes through `pyStr`. Reaching for `Math.round`, `toFixed`, `reduce` or
`String(x)` instead changes published numbers:

| Instead of | You get |
|---|---|
| `pyRound(2.675, 2)` → `2.67` | `Math.round(x*100)/100` → `2.68` |
| `pyRoundInt(2.5)` → `2` | `Math.round` → `3`; `toFixed(0)` → `3` |
| `pyStr(79.0)` → `"79.0"` | `String(79.0)` → `"79"` (6,257 cells) |
| `pyStr(-0.0)` → `"-0.0"` | `String(-0.0)` → `"0"` (30 cells) |
| `pySumFloat` (Neumaier) | a naive fold differs on ~33% of 6-element sums |
| `pySumInt` (exact BigInt) | a double fold loses precision past 2^53 |

All five entry points are pinned by **100,000 committed differential cases**
under `tests/fixtures/pynum/`, generated once from CPython 3.13 by
`scripts/generate-pynum-fixtures.py` and frozen there because spec 0007 R10
deleted the interpreter. Regenerate them with that script if the toolchain pin
ever moves.

## Outputs

| Path | What |
|---|---|
| `pipeline/raw/worldbank/*.json` | cached World Bank API responses, one file per indicator page |
| `pipeline/raw/ilostat/*.csv` | cached ILOSTAT SDMX bulk pulls, one file per dataflow |
| `pipeline/data/global_labor_dataset.csv` | the snapshot table, 229 rows × 89 columns |
| `pipeline/data/global_labor_panel.csv` | the year-by-year panel, ~2.9k rows (R6) |
| `pipeline/data/crosscheck_eurostat.csv` | EU-27 occupation shares vs Eurostat's own LFS (R4) |
| `pipeline/data/ai_exposure_sensitivity.csv` | every country scored under 3 weight profiles (R12) |
| `pipeline/data/outliers_for_review.csv` | statistically improbable values, for human review (R5) |
| `pipeline/data/global_labor_dataset.sqlite` | tables `global_labor` (snapshot) and `global_labor_panel` (time series) |
| `pipeline/data/validation_report.txt` | every range/consistency problem found |
| `pipeline/data/pilot_labor_dataset.csv` | pilot batch output |
| `pipeline/summary_report.md` | human-readable findings + confidence section. Byte-identical across a regeneration except its `Generated <date>` line (0007 R6) |
| `src/data/global_labor.json` | snapshot payload consumed by the app's Labor page |
| `src/data/global_labor_timeseries.json` | compact panel driving the year scrubber and sparklines |

**The two `src/data/` payloads are generated. Never hand-edit them.** Both are
written by `npm run pipeline` -- `global_labor.json` by `run.ts`'s
`exportAppJson`, `global_labor_timeseries.json` by `panel.ts`'s `exportPanel` --
and the app imports them
directly, so an edit here is an edit to what every reader sees, with no source
behind it. Regenerate instead; if a figure looks wrong, the fix belongs upstream
in the pipeline or in `manual_overrides.json`, which requires a citation.

`pipeline/tests/app_payloads.test.ts` enforces this on every `npm run verify`
and in CI, offline and without the response cache: it compares the committed
`global_labor.json` header against what `export_app_json` writes, its rows
against `global_labor_dataset.csv`, and `global_labor_timeseries.json` against
`global_labor_panel.csv`. `global_labor.json` went unregenerated from the
initial commit until spec 0009 and so never carried the `field_tiers` block
described below (#57) -- the guard exists because the drift was silent for that
long, and because the generator-side tests in `tiers.test.ts` stayed green
throughout.

## Sources

All free, no authentication.

| Source | Endpoint | Used for |
|---|---|---|
| World Bank Open Data API v2 | `https://api.worldbank.org/v2/country/all/indicator/{CODE}?format=json&date=2010:2026` | sections A, B, C; the context joins; country reference table (ISO3, region, income group, capital lat/lon) |
| ILOSTAT SDMX | `https://sdmx.ilo.org/rest/data/ILO,{DATAFLOW},1.0/{key}?format=csv` | sections D, E, career stages, and LFP by age band |
| Eurostat dissemination API | `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/lfsa_egais` | independent cross-check of EU-27 occupation shares (R4) |

Dataflow IDs were confirmed against the **live** ILOSTAT catalog
(`https://sdmx.ilo.org/rest/dataflow/ILO`) rather than assumed, because ILO
periodically renames series:

| Dataflow | Contents |
|---|---|
| `DF_EMP_TEMP_SEX_OCU_NB` | employment by sex and occupation (ISCO-08 major groups), headcount in thousands |
| `DF_EMP_TEMP_SEX_AGE_OCU_NB` | employment by sex, age and occupation — the youth × occupation cross-tab |
| `DF_EAP_DWAP_SEX_AGE_RT` | labour force participation rate by sex and age band |

Only `SEX_T` (both sexes) is pulled.

**Sources investigated and not used, with reasons:**

- **UN Population Division data portal** — not needed. World Bank age-band
  coverage was complete for every area in scope.
- **OECD.Stat / OECD Data Explorer** — probed live. Its SDMX catalog contains
  **no ISCO occupation dataflow** at all; ALFS publishes employment by ISIC
  industry and ICSE status only. It cannot fill the New Zealand gap.
- **National statistical offices** — supported through
  `manual_overrides.json` (R3) rather than scraped. See "Known gaps" below.

## Field tiers

Every emitted column carries a tier in `config.FIELD_TIERS`, one entry per
column in `run.COLUMNS`. This is the machine-readable form of the rule that
`CLAUDE.md` states in prose: never blur measured and constructed.

| Tier | Meaning | Count |
|---|---|---|
| `OFFICIAL` | Published national statistic, as published | 24 |
| `DERIVED` | Arithmetic on official statistics | 27 |
| `PROXY` | A stand-in for something no source measures globally | 4 |
| `MODELED` | Analyst-assigned model output | 3 |
| `NOT_A_MEASUREMENT` | Identity and provenance — not a claim about the world | 31 |

Two things about it are deliberate:

- **`NOT_A_MEASUREMENT` is spelled out**, not left absent. A missing entry
  therefore always means someone forgot, never "this field is exempt". The
  suite asserts `set(FIELD_TIERS) == set(run.COLUMNS)`, and `export_app_json`
  refuses to write a payload containing an untiered column.
- **The ISCO percentage shares are `DERIVED`, not `OFFICIAL`.** ILOSTAT
  publishes headcounts in thousands; `_apply_occupation` computes
  `100 * group / base`. The counts are official, the shares are ours. Only
  `isco_armed_forces_thousands` passes through unchanged and stays `OFFICIAL`.

`entry_level_squeeze_index` is **relative to the run's cohort, not absolute**.
`squeeze_index` (`build.ts`'s `squeezeIndex`) percentile-ranks each component across the
countries *in the current run*, so the same country scores differently in a
pilot (31 areas) than in a full run (218) — USA is 49.19 in
`pilot_labor_dataset.csv` and 43.08 in `global_labor_dataset.csv`, and both are
correct. Compare it only within one run's output, never across the two files.
The same hazard applies to aggregate movement over time, which `report.ts`
describes: "the reporting country set changes year to year, so aggregate
movement is partly composition change".

`entry_level_squeeze_index` is `MODELED`. It percentile-ranks four components
and combines them with `SQUEEZE_COMPONENTS`' 0.25 / 0.30 / 0.25 / 0.20 —
weights this project assigned, exactly as it assigned the ISCO exposure
weights. It was previously labelled a "DERIVED composite" in `report.ts` with
the caveat carried in the prose beside it; a one-word enum cannot carry a
caveat, so the tier changed rather than the meaning. See spec 0004 R3.

The tiers ship to the app in `global_labor.json` under `field_tiers`, filtered
to the 84 columns the payload actually carries — the five `*_range` columns are
dropped from the payload, so it does not claim coverage it does not have.

## Field reference

### Identity

| Field | Source | Notes |
|---|---|---|
| `iso3` | World Bank country metadata | primary key; aggregates use `WLD`, `EU27`, `OECD`, `G20`, and World Bank region codes (`NAC`, `ECS`, `EAS`, `SAS`, `SSF`, `MEA`, `LCN`) |
| `iso2` | World Bank country metadata (`iso2Code`) | ISO 3166-1 alpha-2, carried for the app's country search — `Intl.DisplayNames` needs an alpha-2 to return the name a reader types. **Null for `TWN` alone.** `HKG` and `MAC` are in the Bank's country list and keep `HK`/`MO`; only Taiwan takes the synthesised `EXTRA_AREAS` path, because the Bank's response carries no Taiwan entity at all. It is not filled by hand |
| `country_name`, `region`, `income_group`, `capital` | World Bank country metadata | region labels are exactly as the Bank returns them today — note the Bank renamed MENA to "Middle East, North Africa, Afghanistan & Pakistan" and moved AFG/PAK out of South Asia |
| `lat`, `lon` | World Bank capital-city coordinates | for map placement only; null for aggregate rows. Six areas missing from the endpoint are filled from `config.FALLBACK_COORDS` |
| `row_type` | derived | `country` \| `world` \| `region` \| `group` |
| `member_count` | derived | aggregate rows only |

### A. Population structure — official statistics

| Field | Indicator | Notes |
|---|---|---|
| `population_total` | `SP.POP.TOTL` | |
| `pop_0_14_pct` | `SP.POP.0014.TO.ZS` | proxy for "children" |
| `pop_15_64_pct` | `SP.POP.1564.TO.ZS` | working age |
| `pop_65plus_pct` | `SP.POP.65UP.TO.ZS` | **age proxy for "retirees" — not pension-recipient data.** Says nothing about actual retirement age or post-65 work, which is very common in low-income countries |
| `age_dependency_ratio` | `SP.POP.DPND` | |

### B. Labor force / employment — official statistics (largely ILO-modelled)

| Field | Indicator | Notes |
|---|---|---|
| `lfp_rate_total` | `SL.TLF.CACT.ZS` | ages 15+ |
| `lfp_rate_15_24` | `SL.TLF.ACTI.1524.ZS` | |
| `lfp_rate_15_24_ilo`, `lfp_rate_25_54`, `lfp_rate_55_64` | ILOSTAT `DF_EAP_DWAP_SEX_AGE_RT` | age-band LFP the World Bank does not publish |
| `emp_to_pop_ratio_15plus` | `SL.EMP.TOTL.SP.ZS` | |
| `youth_employment_rate_15_24` | `SL.EMP.1524.SP.ZS` | employment-to-population ratio for 15–24 |
| `unemployment_rate_total` | `SL.UEM.TOTL.ZS` | |
| `unemployment_rate_15_24` | `SL.UEM.1524.ZS` | |
| `labor_force_total` | `SL.TLF.TOTL.IN` | headcount |
| `employed_total` | **derived** | `labor_force_total × (1 − unemployment_rate_total/100)`, rounded to whole people. Falls back to the ILOSTAT survey total where the World Bank inputs are missing; `employed_total_source` records which was used. Exists so aggregates can be employment-weighted |
| `employed_share_of_population_pct` | **derived** | `employed_total / population_total × 100` — the "what share of everyone works at all" number |

### C. Employment by broad sector — official, but a weak white-collar proxy

`emp_agriculture_pct` (`SL.AGR.EMPL.ZS`), `emp_industry_pct` (`SL.IND.EMPL.ZS`),
`emp_services_pct` (`SL.SRV.EMPL.ZS`).

**Do not read "services" as "white collar."** It includes retail, hospitality,
transport, cleaning and domestic work. The US figure is ~80% services but ~61%
white collar; the gap is the point. These fields are contextual only.

### D. Employment by occupation, ISCO-08 — the core white-collar measure

`isco1_managers_pct` … `isco9_elementary_pct`, each as a share of employment
classified into major groups 1–9.

| Field | Notes |
|---|---|
| `white_collar_pct` | **derived** — sum of ISCO 1–4 (managers, professionals, technicians & associate professionals, clerical support) |
| `professional_core_pct` | **derived** — ISCO 1–2 only, a stricter high-skill cut |
| `blue_collar_service_pct` | **derived** — sum of ISCO 5–9. `white_collar_pct + blue_collar_service_pct == 100` by construction |
| `white_collar_employed`, `professional_core_employed` | **derived** headcounts |
| `isco_source_employed_thousands` | the survey base the shares are computed over |
| `isco_armed_forces_thousands` | ISCO group 0. **Excluded from the percentage base** — footnoted here rather than distributed |
| `isco_unclassified_pct` | share of the reported employment total that the source left unclassified by occupation |
| `isco_classified_share_pct` | (groups 1–9 + armed forces) ÷ reported total × 100. Below ~90% means a large slice of employment is unclassified and the shares describe only the classified portion |
| `isco_groups_reported` | how many of the 9 major groups the source actually reports; below 9 means the national classification folds a group elsewhere |

**Year selection.** For each country we take the most recent year whose reported
major groups reconcile with the reported employment total. A year is rejected
when groups 1–9 plus armed forces *exceed* the reported total by more than
0.5% — that signals the source has dropped a group and folded it into another,
which silently distorts the white-collar share. Japan 2024–25 is the live
example: ISCO 3 and 7 vanish and group 8 absorbs them, so the pipeline uses
Japan 2023 instead. Years with at least 8 of 9 groups are preferred over more
recent years with only 7.

**ISCO-88 fallback (R1).** Ten areas publish ISCO-88 major groups and no
ISCO-08 series: `BMU, CAN, MAC, NAM, NIC, TTO, TWN, UKR, YEM, ZAF`. The two
revisions align 1:1 at the major-group level, so the 1–4 white-collar cut
carries over and these countries are included with `isco_classification` set to
`ISCO-88`. The revision did move some ICT occupations between groups 2 and 3,
which makes `professional_core_pct` slightly less comparable across the two
families than `white_collar_pct`. ISCO-08 is always preferred where it exists.
This fallback raised occupation coverage from 167 to 177 countries and world
employment coverage from 75% to 77%.

**The definitional caveat.** Grouping ISCO 1–4 as "white collar" is our choice,
not a statistical category. It is the best available global proxy, but ISCO 3
(technicians and associate professionals) contains plenty of field, lab and
technical trades work that nobody would call an office job.

### E. Entry-level proxy — **a proxy, not a measurement**

| Field | Notes |
|---|---|
| `young_white_collar_pct` | share of **employed 15–24 year olds** who work in ISCO 1–4, from `DF_EMP_TEMP_SEX_AGE_OCU_NB` |
| `youth_age_band_used` | which ILO age band was available (`Y15-24`) |
| `entry_level_data_quality` | `proxy_youth_15_24_x_isco` or `proxy_unavailable` |

**No global source tracks junior vs. senior seniority within an occupation.**
Age 15–24 is a stand-in with two known biases: it misses graduate-entry roles
filled at 25–29, and it counts a 23-year-old with five years' tenure as
entry-level. Where the cross-tab is unavailable the field is null and flagged —
never imputed.

**Why there is no 15–29 or 15–34 band.** We probed for one. The ILOSTAT
occupation cross-tab publishes ISCO major groups **only** against the
`AGE_AGGREGATE` and `AGE_YTHADULT` bands; the 10-year bands (15–24, 25–34, …)
carry skill level only, not ISCO. So neither 15–29 nor 15–34 is constructible.
What *is* available is the full career-stage profile, which is more informative:

| Field | Age band | Notes |
|---|---|---|
| `young_white_collar_pct` | 15–24 | the entry-level proxy |
| `prime_white_collar_pct` | 25–54 | where careers actually sit (165 countries) |
| `late_career_white_collar_pct` | 55–64 | |

In almost every country youth are markedly *less* white-collar than prime-age
workers — in the US, 37% against 64%. Entry-level work sits in service, sales
and elementary occupations, not in offices.

### F. AI exposure overlay — **modeled estimate, not official statistics**

`ai_exposure_weighted_score` = Σ (ISCO group share × that group's exposure
weight), producing a 0–1 index.

Weights live in `pipeline/ai_exposure_isco.json` and are **assigned by us**,
informed by Gmyrek/Berg/Bescond (ILO Working Paper 96, 2023), Felten/Raj/Seamans'
AIOE index, Webb (2020), and the occupational skew visible in the Anthropic
Economic Index. Only the **rank order** is defensible — clerical support most
exposed, then professionals and technicians, then managers, with agricultural
and elementary work least exposed. The cardinal values are illustrative. Swap
the JSON and re-run to substitute any published index; the score is linear in
those weights.

### Provenance and quality

| Field | Notes |
|---|---|
| `data_year_population`, `data_year_labor`, `data_year_sector`, `data_year_occupation`, `data_year_youth_occupation`, `data_year_lfp_age` | the year actually used per field group, per country. **Years are not uniform** — population may be 2025 while occupation is 2017. Never treat a row as a single-year snapshot |
| `*_range` | aggregate rows only: min–max vintage across members |
| `isco_coverage_pct_of_employment` | aggregate rows: share of the group's employment sitting in countries that actually report ISCO data |
| `youth_isco_coverage_pct_of_employment` | same for the youth cross-tab |
| `data_quality_flag` | `complete`, `partial — <reasons>`, `sparse — <reasons>`, or an aggregate coverage note |

## Aggregates

World, the 7 World Bank regions, EU-27, OECD and G20 are **computed by this
pipeline**, not taken from the Bank's published aggregate rows. Percentages are
weighted — by `employed_total` for occupation and sector fields, by
`population_total` for age structure and participation rates — never simple
averages of country percentages.

Each aggregate carries `isco_coverage_pct_of_employment`. The World figure
covers ~75% of global employment; the missing quarter is dominated by **China,
which has no ISCO-08 breakdown in ILOSTAT at all**. Non-reporting countries are
implicitly assumed to resemble the reporting countries in their weighting group,
which for East Asia (38% coverage) is a strong assumption. Read regional
white-collar numbers against that column.

## Validation

`run.ts` checks, and writes failures to `data/validation_report.txt`:

- every percentage field within [0, 100]
- `pop_0_14 + pop_15_64 + pop_65plus ≈ 100` (±1pp)
- `agriculture + industry + services ≈ 100` (±1.5pp)
- `white_collar_pct + blue_collar_service_pct == 100` (±0.5pp)

It also runs four regression checks against independently known published
figures — World services ≈50%, US ≈79%, EU-27 ≈72%, India ≈31.5% — and prints
PASS/FAIL for each. All four currently pass.

Countries with genuinely no data are kept as rows with nulls and a quality
flag. Nothing is fabricated or interpolated.

## Priority order

If API limits ever force partial runs, `config.ts` carries the country group
lists in the intended order: G20 → OECD → EU-27 → remaining countries with
population >20M → the rest. The current full run completes in well under a
minute against warm caches, so prioritisation has not been needed.


---

## Time series (R6)

`data/global_labor_panel.csv` and the `global_labor_panel` SQLite table carry one
row per (country, year) from 2013, built from the same cached responses as the
snapshot — no extra API calls, the pipeline just stops discarding years.

This answers the question the snapshot could not: **was clerical employment
already shrinking before generative AI?** Across countries with six or more
years of data, the clerical share fell by more than 0.5pp in 36 and rose by more
than 0.5pp in 30. The US declines steadily from 10.8% (2013) to 8.3% (2025)
while its overall white-collar share *rises*. Japan and Korea move the other
way. There is no single global direction, and where clerical work is shrinking
it has usually been shrinking since well before 2022 — a declining clerical
share is not by itself evidence of AI.

**Aggregate trend lines are not reliable and are labeled as such.** The set of
countries reporting occupation data changes from year to year, so movement in
the World or regional series is partly composition change rather than real
change. Each panel aggregate row carries `isco_coverage_pct_of_employment` for
that year so the effect is visible. Country-level series do not have this
problem.

## Derived measures

| Field | Tier | Definition |
|---|---|---|
| `clerical_employed`, `white_collar_employed`, `professionals_employed`, `young_white_collar_employed` | derived | Headcounts, not shares. Shares put Luxembourg first; headcounts put India first. Both are true, they answer different questions. |
| `entry_level_squeeze_index` | modeled composite | 0–100 from four percentile ranks: youth cohort share (0.25), youth white-collar share (0.30), youth unemployment (0.25), youth-vs-all-ages white-collar gap (0.20). Requires at least 3 of 4 components. **Not a measurement** — every component stays separately inspectable. |
| `exposed_wage_bill_ppp` | modeled | `ai_exposure_weighted_score × employed_total × gdp_per_capita_ppp`. An order of magnitude for the economic scale of exposure. **Never an amount at risk.** |
| `ict_service_exports_usd` | official | Service exports × ICT share — white-collar labor sold abroad. Countries whose exposed jobs are export-facing carry a compounding risk. |

## Back-test: what the trend can and cannot retrodict (0017)

The result screen states no replacement date. Spec 0010 R13 probed for one and
found nothing published anywhere, which is the right reason but not a measured
one. This is the measurement.

**Method.** For every country and each of the nine ISCO-08 major-group shares,
fit ordinary least squares on the observations in **2013–2019**, evaluate the
fitted line at **2025**, and score it against the 2025 value the panel already
holds. Only years actually observed take part; a gap year is skipped, never
interpolated. A pair needs **at least 3** fit-window observations and a non-null
2025 value, or it produces no row at all.

**Outputs.** `data/backtest.csv` (574 rows) and `data/backtest_summary.csv`
(nine groups plus `POOLED`), with `src/data/backtest.json` for the app.

| Field | Tier | Meaning |
|---|---|---|
| `last_fit_pct`, `observed_2025_pct` | derived | Panel ISCO shares |
| `retrodicted_2025_pct` | **modeled** | The fitted line at 2025 |
| `error_pp`, `persistence_error_pp`, `direction_correct` | **modeled** | A difference is only as measured as its least-measured term |
| `fit_start_year`, `fit_end_year`, `fit_obs`, `target_year` | not a measurement | Provenance |

### The result

| | Clerical, n=64 | Pooled, 9 groups, n=574 |
|---|---|---|
| Trend MAE / RMSE | 0.940 / 1.295 pp | **1.806 / 3.867 pp** |
| **Persistence** MAE / RMSE | **0.645 / 0.843 pp** | **1.292 / 2.046 pp** |
| Trend beats persistence on | — | **234 / 574 (40.8%)** |
| Direction wrong | **31 / 64** | **241 / 574 (42.0%)** |
| Worst case | `GEO` 5.06pp | `RWA` 58.39pp |

**The trend model is beaten by assuming nothing changes.** Persistence — carry
the last fit-window observation forward unchanged — wins on MAE and RMSE pooled
and in eight of the nine groups, and the trend improves on it for only 40.8% of
pairs. It also gets the *direction of travel* wrong 42% of the time, which is
close to a coin flip and is a failure no error magnitude reports.

A mean would hide this. The clerical mean signed error is −0.055pp, which reads
as an almost unbiased model while the worst country is out by 5.06pp.

**Why, and why a better fit would not help.** The observed employment share is a
**net** figure. It bundles displacement with demand growth, offshoring, ageing,
labour supply and reclassification. A model reading the net and calling it
displacement measures the wrong thing, and no amount of curve-fitting recovers
the components from the total.

**This is why no replacement year ships, in any tier.** Nothing here authorises
one; `pipeline/backtest.ts` emits no year column beyond the fit window and the
target year, and the test suite enforces that against an allowlist.

### The 31 clerical countries whose direction is wrong

Named individually rather than counted, because a country whose sign is wrong is
not a country with a slightly worse error:

Argentina (`ARG`), Bolivia (`BOL`), Brazil (`BRA`), Bulgaria (`BGR`), Colombia
(`COL`), Cyprus (`CYP`), Czechia (`CZE`), Denmark (`DNK`), Dominican Republic
(`DOM`), Estonia (`EST`), Georgia (`GEO`), Greece (`GRC`), Hungary (`HUN`),
Iceland (`ISL`), Latvia (`LVA`), Lithuania (`LTU`), Moldova (`MDA`), Mongolia
(`MNG`), North Macedonia (`MKD`), Norway (`NOR`), Pakistan (`PAK`), Panama
(`PAN`), Paraguay (`PRY`), Poland (`POL`), Rwanda (`RWA`), Serbia (`SRB`),
Slovenia (`SVN`), Spain (`ESP`), St. Lucia (`LCA`), Sweden (`SWE`), West Bank
and Gaza (`PSE`).

### Coverage: 64 of 177

**177** countries carry an ISCO series; only **64** can be back-tested. The other
**113** are unscorable — 108 have no 2025 observation, and 5 more (`AGO`, `BFA`,
`GMB`, `IND`, `VUT`) have a 2025 value but fewer than three fit-window
observations. The error figures above describe those 64 and no others.

Two of the missing ones matter more than the rest, because they are the cases
that motivated the exercise:

- **Japan** — the clerical series runs 2013 (19.86%) to 2023 (21.19%) and stops.
  There is no 2025 observation, so Japan cannot be scored at all. It is the
  headline counter-example for the net-figure problem: clerical work *grew* there
  across the whole window.
- **India** — two fit-window observations (2018, 2019). A two-point fit has no
  residual and would enter the distribution as a spuriously confident row, so it
  is excluded rather than fitted.

Reporting a 64-country error without that denominator would overstate the
coverage of exactly the cases the finding is about.

## Validation and cross-checks

Beyond v1's range and sum checks:

- **Eurostat cross-check (R4).** The ILOSTAT-derived white-collar share is
  compared against Eurostat's own LFS (`lfsa_egais`) for all EU-27 members.
  **27 of 27 agree within 3 percentage points**; the largest gap is Bulgaria at
  2.6pp, mostly a vintage difference (ILO 2025 vs Eurostat 2024).
- **Outlier review (R5).** Robust z-score (median/MAD) flags |z| > 3.5, plus two
  structural checks: white collar exceeding services employment by >12pp, and
  youth white collar exceeding all-ages by >25pp. Written to
  `data/outliers_for_review.csv`. Nothing is auto-corrected.
- **AI exposure sensitivity (R12).** Every country is scored under three
  plausible weight profiles (`balanced`, `clerical_heavy`, `cognitive_uniform`).
  The median country moves **4 places**, worst case 43. The ordering is robust
  even though the cardinal score is not — which is the only claim we make for it.

## Manual overrides (R3)

`manual_overrides.json` merges nationally-sourced figures that no free API
carries. Every entry requires `value`, `year`, `source_name`, `source_url`,
`retrieved` and `note`; applied values are tagged in `data_source_override` so a
national figure is never mistaken for an API-sourced one.

**Known gaps, deliberately left unfilled rather than invented:**

| Area | Gap | Why |
|---|---|---|
| Armenia | Occupation data ends 2017 | ILOSTAT's series stops there. armstat.am publishes LFS results but not as a machine-readable ISCO feed — filling this needs a human to read the published table and enter it with a citation. |
| New Zealand | No occupation data | Absent from every ILOSTAT occupation dataflow; OECD has no ISCO series. Stats NZ uses ANZSCO and would need a manual crosswalk. |
| Saudi Arabia | No occupation data | Absent from ILOSTAT; GASTAT publishes nationally only. |
| China | No occupation data | Publishes no ISCO breakdown to ILOSTAT. The single largest hole in the world figure. |
