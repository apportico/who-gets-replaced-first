# Global Labor Structure & AI Exposure — Summary Report

Generated 2026-08-29 from `pipeline/data/global_labor_dataset.csv`.

**Read the confidence section at the bottom before quoting any number.** Sections A–C are official statistics. Section D is an official statistic used as a *proxy* for "white collar." Sections E and F are constructed proxies and a modeled overlay respectively — they are not measurements.

## Headline global numbers

| Measure | Value | Basis |
|---|---:|---|
| World population | 8,192,078,152 | World Bank SP.POP.TOTL, 2025 |
| Children (0–14) | 24.4% | official |
| Working age (15–64) | 65.2% | official |
| 65+ ("retirees" — age proxy) | 10.4% | age proxy, not pension receipt |
| Labor force participation, 15+ | 60.9% | official (ILO modelled) |
| Employed people worldwide | 3,593,561,219 | derived: labor force × (1 − unemployment) |
| **Share of the whole population that works at all** | **43.9%** | derived from official inputs |
| Unemployment rate | 5.1% | official |
| Employment in services | 50.6% | official — **weak** white-collar proxy |
| **White collar (ISCO 1–4) share of employment** | **26.0%** | official occupation data, 77% of world employment covered |
| Professional core (ISCO 1–2) | 14.6% | same |
| Non-white-collar (ISCO 5–9) | 74.0% | same |
| Entry-level proxy: employed 15–24 in ISCO 1–4 | 18.1% | **PROXY**, 75% of employment covered |
| AI task-exposure score (0–1) | 0.306 | **MODELED**, see README |

In absolute terms: of roughly **3,593,561,219** employed people worldwide, about **934,045,619** work in ISCO major groups 1–4 — the managerial, professional, technical and clerical occupations that carry the most generative-AI task overlap.

The single most exposed group, clerical support workers (ISCO 4), is 4.8% of world employment (~174,018,202 people).

## Coverage

- Countries / territories in the dataset: **218**
- With ISCO-08 occupation data (section D): **177** (41 without)
- With the youth × occupation cross-tab (section E): **163**
- Aggregate rows: **11** (World, 7 World Bank regions, EU-27, OECD, G20)
- World white-collar figure is computed over **77%** of global employment.

Large countries (>20M people) with **no** occupation data — the main source of gap in the world figure:

- China (CHN) — 1,406,585,000 people
- Uzbekistan (UZB) — 37,053,428 people
- Saudi Arabia (SAU) — 36,973,555 people
- Korea, Dem. People's Rep. (PRK) — 26,571,036 people
- Syrian Arab Republic (SYR) — 25,620,427 people

## Top 15 countries by white-collar share of employment

_Restricted to countries with ≥90% of employment classified by occupation and occupation data from 2019 or later._

| # | Country | White collar (ISCO 1–4) % | Professional core (1–2) % | Clerical (4) % | Entry-level proxy % | Year |
|---:|---|---:|---:|---:|---:|---:|
| 1 | Luxembourg | 77.2 | 55.3 | 5.9 | 45.1 | 2025 |
| 2 | Singapore | 73.7 | 45.4 | 8.7 | 59.2 | 2025 |
| 3 | Switzerland | 65.7 | 36.2 | 11.8 | 49.2 | 2025 |
| 4 | Netherlands | 64.8 | 39.3 | 8.2 | 31.9 | 2025 |
| 5 | United Kingdom | 64.4 | 41.4 | 8.9 | 40.0 | 2025 |
| 6 | Sweden | 63.7 | 39.9 | 5.6 | 30.5 | 2025 |
| 7 | Belgium | 62.9 | 37.3 | 10.4 | 34.8 | 2025 |
| 8 | Israel | 61.7 | 40.0 | 6.5 | 33.7 | 2024 |
| 9 | Germany | 60.8 | 28.3 | 12.4 | 48.3 | 2025 |
| 10 | United States | 60.7 | 34.7 | 8.3 | 37.2 | 2025 |
| 11 | France | 59.3 | 33.5 | 7.9 | 41.3 | 2025 |
| 12 | Ireland | 59.1 | 38.8 | 8.3 | 32.1 | 2025 |
| 13 | Norway | 59.0 | 37.3 | 6.0 | 25.8 | 2025 |
| 14 | Australia | 58.6 | 36.7 | 8.5 | 30.5 | 2025 |
| 15 | Denmark | 57.7 | 33.1 | 7.7 | 21.5 | 2025 |

## Bottom 15 countries by white-collar share of employment

| # | Country | White collar (ISCO 1–4) % | Professional core (1–2) % | Agriculture emp % | Entry-level proxy % | Year |
|---:|---|---:|---:|---:|---:|---:|
| 1 | Niger | 2.6 | 1.4 | 73.0 | 7.4 | 2022 |
| 2 | Burundi | 3.1 | 2.2 | 85.3 | 0.4 | 2020 |
| 3 | Chad | 3.9 | 2.0 | 71.7 | 0.4 | 2022 |
| 4 | Tanzania | 4.3 | 2.1 | 64.6 | 1.3 | 2024 |
| 5 | Mozambique | 4.9 | 2.9 | 73.0 | 1.5 | 2022 |
| 6 | Ethiopia | 5.0 | 3.2 | 60.1 | 1.7 | 2021 |
| 7 | Madagascar | 5.1 | 2.9 | 69.2 | 1.6 | 2022 |
| 8 | Uganda | 5.6 | 3.4 | 64.9 | 1.4 | 2021 |
| 9 | Benin | 5.6 | 3.2 | 40.2 | 1.4 | 2022 |
| 10 | Guinea-Bissau | 6.7 | 4.3 | 61.1 | 1.4 | 2022 |
| 11 | Rwanda | 7.2 | 5.2 | 35.1 | 3.3 | 2025 |
| 12 | Cote d'Ivoire | 7.2 | 2.3 | 45.4 | 2.4 | 2022 |
| 13 | Mali | 7.6 | 2.6 | 63.0 | 3.5 | 2024 |
| 14 | Togo | 8.0 | 5.0 | 37.6 | 3.3 | 2022 |
| 15 | Myanmar | 8.2 | 3.9 | 45.0 | 6.9 | 2020 |

## Regional comparison

All aggregates are **employment-weighted**, never simple averages of country percentages. `ISCO coverage` is the share of that region's employment that sits in countries which actually report occupation data — read the white-collar figure with that number in mind.

| Region | Pop | Works at all % | LFP 15+ % | Services % | White collar % | Prof. core % | Entry-level proxy % | AI score | ISCO coverage |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| World | 8,192,078,152 | 43.9 | 60.9 | 50.6 | 26.0 | 14.6 | 18.1 | 0.306 | 77% |
| East Asia & Pacific | 2,367,527,180 | 52.2 | 65.3 | 49.8 | 25.3 | 12.7 | 19.7 | 0.323 | 39% |
| South Asia | 1,692,252,900 | 40.2 | 55.6 | 33.4 | 13.4 | 8.4 | 10.9 | 0.219 | 100% |
| Sub-Saharan Africa | 1,321,654,217 | 38.7 | 69.3 | 38.6 | 10.1 | 6.2 | 5.0 | 0.203 | 98% |
| Europe & Central Asia | 932,525,035 | 45.5 | 58.0 | 69.3 | 50.8 | 29.2 | 35.9 | 0.449 | 96% |
| Middle East, North Africa, Afghanistan & Pakistan | 828,025,185 | 29.8 | 47.1 | 51.9 | 21.6 | 12.8 | 12.4 | 0.287 | 88% |
| Latin America & Caribbean | 666,592,570 | 46.1 | 62.7 | 66.8 | 30.1 | 15.1 | 23.6 | 0.353 | 97% |
| North America | 383,501,065 | 49.2 | 62.0 | 79.6 | 60.2 | 33.8 | 37.2 | 0.491 | 100% |
| European Union (27) | 451,127,411 | 46.2 | 57.3 | 72.9 | 54.6 | 29.1 | 37.1 | 0.473 | 100% |
| G20 members | 4,744,611,663 | 46.8 | 60.8 | 52.2 | 31.3 | 17.4 | 23.2 | 0.337 | 66% |
| OECD members | 1,402,243,571 | 48.1 | 60.6 | 74.0 | 51.3 | 28.0 | 34.5 | 0.457 | 100% |

## Entry-level (proxy) vs. overall white collar

`young_white_collar_pct` is the share of **employed 15–24 year olds** who work in ISCO 1–4. Where it sits *below* the all-ages white-collar share, young workers are concentrated in service, sales and elementary jobs rather than in offices — the normal pattern almost everywhere.

| | Country | All-ages white collar % | Youth (15–24) white collar % | Gap (pp) |
|---|---|---:|---:|---:|
| widest gap | Denmark | 57.7 | 21.5 | -36.3 |
| widest gap | Iceland | 56.1 | 22.7 | -33.4 |
| widest gap | Norway | 59.0 | 25.8 | -33.2 |
| widest gap | Sweden | 63.7 | 30.5 | -33.2 |
| widest gap | Netherlands | 64.8 | 31.9 | -32.9 |
| widest gap | Luxembourg | 77.2 | 45.1 | -32.0 |
| widest gap | Brunei Darussalam | 51.0 | 21.4 | -29.6 |
| widest gap | Belgium | 62.9 | 34.8 | -28.2 |
| narrowest / inverted | Korea, Rep. | 55.0 | 64.1 | +9.1 |
| narrowest / inverted | Naoero | 45.0 | 51.7 | +6.7 |
| narrowest / inverted | Jamaica | 32.5 | 39.1 | +6.5 |
| narrowest / inverted | Maldives | 45.4 | 50.5 | +5.1 |
| narrowest / inverted | Niger | 2.6 | 7.4 | +4.8 |

## White collar by career stage

The occupation cross-tab carries ISCO major groups for the aggregate age bands, so the white-collar share can be read at each career stage. (Neither 15–29 nor 15–34 is constructible — the 10-year bands are published against skill level only, not ISCO.)

| Country | Youth 15–24 | Prime 25–54 | Late 55–64 | All ages | Prime − youth |
|---|---:|---:|---:|---:|---:|
| World | 18.1 | 28.2 | 22.9 | 26.0 | +10.1 |
| Denmark | 21.5 | 65.1 | 58.8 | 57.7 | +43.7 |
| Netherlands | 31.9 | 72.1 | 65.5 | 64.8 | +40.2 |
| Iceland | 22.7 | 62.7 | 62.2 | 56.1 | +40.0 |
| Norway | 25.8 | 65.1 | 62.0 | 59.0 | +39.3 |
| Sweden | 30.5 | 69.6 | 64.2 | 63.7 | +39.0 |
| Australia | 30.5 | 65.1 | 59.4 | 58.6 | +34.6 |
| Israel | 33.7 | 67.3 | 60.0 | 61.7 | +33.6 |
| Ireland | 32.1 | 65.8 | 58.4 | 59.1 | +33.6 |
| Luxembourg | 45.1 | 77.0 | 71.0 | 77.2 | +31.9 |
| Brunei Darussalam | 21.4 | 53.0 | 59.6 | 51.0 | +31.6 |

Prime-age white-collar shares are published for **165** countries. In almost every one, youth are markedly *less* white-collar than prime-age workers — entry-level work sits in service, sales and elementary occupations, not in offices.

## Trends — is clerical work already shrinking?

Built from the year-by-year panel. This is the question the snapshot could not answer: whether the occupations most exposed to AI were already in decline before generative AI arrived.

| Country | Clerical (ISCO 4) | White collar (ISCO 1–4) | Period |
|---|---:|---:|---:|
| United States | 10.8 → 8.3 (-2.5 pp) | +4.4 pp | 2013–2025 |
| Germany | 13.4 → 12.4 (-0.9 pp) | +4.1 pp | 2013–2025 |
| United Kingdom | 10.0 → 8.9 (-1.2 pp) | +6.5 pp | 2013–2025 |
| France | 9.2 → 7.9 (-1.3 pp) | +5.2 pp | 2013–2025 |
| Japan | 19.9 → 21.2 (+1.3 pp) | +4.1 pp | 2013–2023 |
| Korea, Rep. | 10.4 → 12.5 (+2.1 pp) | +6.6 pp | 2013–2025 |
| Spain | 10.2 → 9.8 (-0.4 pp) | +2.9 pp | 2013–2025 |
| Italy | 12.3 → 11.9 (-0.4 pp) | +1.5 pp | 2013–2025 |
| Poland | 6.7 → 7.9 (+1.2 pp) | +10.5 pp | 2013–2025 |
| India | 2.2 → 2.3 (+0.1 pp) | -5.5 pp | 2018–2025 |
| Brazil | 8.5 → 8.5 (+0.0 pp) | +3.1 pp | 2013–2025 |
| Mexico | 5.9 → 6.2 (+0.4 pp) | +1.8 pp | 2013–2025 |

Across countries with at least six years of occupation data, clerical employment share **fell by more than 0.5pp in 36** and **rose by more than 0.5pp in 30**. Where it is falling it has usually been falling steadily since well before 2022, which matters for attribution: a declining clerical share is not by itself evidence of AI.

**Aggregate trend lines are not reliable.** The set of countries reporting occupation data changes from year to year, so movement in the World or regional series is partly composition change. The panel carries `isco_coverage_pct_of_employment` per year so this can be seen; country series do not have this problem.

## Entry-level squeeze index

A **derived composite** (not a measurement) of four percentile ranks: youth cohort size, youth white-collar concentration, youth unemployment, and whether youth are more white-collar than the workforce average. All four components stay separately inspectable in the dataset.

| # | Country | Squeeze | Youth cohort % | Youth white collar % | Youth unemployment % |
|---:|---|---:|---:|---:|---:|
| 1 | Djibouti | 90.0 | 16.7 | 47.1 | 76.8 |
| 2 | St. Lucia | 80.3 | 16.6 | 35.8 | 20.3 |
| 3 | Guyana | 79.9 | 16.1 | 31.8 | 24.9 |
| 4 | Mauritius | 78.2 | 16.7 | 38.6 | 17.4 |
| 5 | Jamaica | 77.3 | 18.9 | 39.1 | 10.8 |
| 6 | Grenada | 77.3 | 20.1 | 21.7 | n/a |
| 7 | Georgia | 77.0 | 14.5 | 34.4 | 30.3 |
| 8 | Bhutan | 74.8 | 18.5 | 28.3 | 17.1 |
| 9 | Albania | 73.0 | 23.7 | 17.4 | 25.6 |
| 10 | Armenia | 72.4 | 14.5 | 31.5 | 26.2 |
| 11 | Somalia, Fed. Rep. | 72.0 | 10.7 | 40.7 | 34.2 |
| 12 | South Africa | 71.8 | 15.4 | 29.0 | 59.9 |

The index is dominated by small states and island economies, where a large youth cohort meets a thin formal labour market. Read it alongside the headcount table below, which shows where the *number* of exposed workers is largest.

## Where the exposed jobs actually are — headcounts

Shares put Luxembourg at the top. Headcounts put India there. Both are true; they answer different questions.

| # | Country | Clerical workers | White-collar workers | Clerical % | 
|---:|---|---:|---:|---:|
| 1 | Japan | 14,360,796 | 28,778,454 | 21.2 |
| 2 | United States | 13,856,141 | 101,743,964 | 8.3 |
| 3 | India | 13,717,272 | 80,620,624 | 2.3 |
| 4 | Brazil | 8,666,661 | 35,345,487 | 8.5 |
| 5 | Indonesia | 5,935,126 | 21,842,791 | 4.2 |
| 6 | Germany | 5,215,719 | 25,500,673 | 12.4 |
| 7 | Philippines | 3,838,878 | 10,976,607 | 7.5 |
| 8 | Mexico | 3,819,137 | 16,699,379 | 6.4 |
| 9 | Korea, Rep. | 3,640,737 | 15,990,965 | 12.5 |
| 10 | United Kingdom | 2,989,466 | 21,736,931 | 8.9 |
| 11 | Italy | 2,870,440 | 11,934,500 | 11.9 |
| 12 | Canada | 2,590,180 | 11,889,755 | 12.2 |

## Independent validation

**Eurostat cross-check.** Our ILOSTAT-derived white-collar share was compared against Eurostat's own Labour Force Survey (`lfsa_egais`) for all EU-27 members. **27 of 27** agree within 3 percentage points. Largest disagreement: Bulgaria at 2.62pp (ILO 46.87% for 2025 vs Eurostat 44.25% for 2024), which is mostly a vintage difference. Full table in `data/crosscheck_eurostat.csv`.

**AI exposure sensitivity.** The exposure weights are ours, so the honest test is how much the country ordering depends on them. Scoring all 177 countries under 3 plausible weightings (balanced, clerical_heavy, cognitive_uniform) moves the median country by only **4 places**; the worst case is 43 places (Macao SAR, China). **The ranking is robust even though the cardinal score is not** — which is exactly the claim the README makes for it. Full table in `data/ai_exposure_sensitivity.csv`.

**Outlier review.** 4 values were flagged as statistically improbable (robust z-score beyond ±3.5, or structurally inconsistent with the country's sector mix). Nothing is auto-corrected — see `data/outliers_for_review.csv`.

## Confidence — what is solid and what is constructed

| Field group | Status | Why |
|---|---|---|
| A. Population by age band, dependency ratio | **Official statistic** | World Bank / UN Population Division. Near-universal coverage. |
| 65+ as "retirees" | **Official stat used as a proxy** | It is an age band, not pension receipt. Actual retirement ages and informal work after 65 vary enormously. |
| B. LFP, employment ratio, unemployment | **Official statistic** (largely ILO-modelled) | Modelled estimates fill country gaps; they are official but they are model output, not raw survey counts. |
| Total employed persons (headcount) | **Derived** | labor force × (1 − unemployment rate). Used only for weighting aggregates. |
| C. Agriculture / industry / services shares | **Official statistic** | But *services* is a poor white-collar proxy — it includes retail, hospitality, transport and domestic work. Do not use it as the white-collar number. |
| D. ISCO-08 major groups 1–9 | **Official statistic, used as a proxy** | The occupational split is a real survey measurement. Calling groups 1–4 "white collar" is our definitional choice, and it is imperfect: ISCO 3 (technicians) includes many field and technical trades. |
| D. World / regional white-collar aggregates | **Partly estimated** | Only 77% of world employment is covered by countries reporting ISCO data. Non-reporting countries (notably China) are assumed to resemble the covered countries in their weighting group. |
| E. Entry-level share | **PROXY — not a measurement** | No global source tracks junior vs. senior seniority within an occupation. Age 15–24 is a stand-in: it misses graduate-entry roles at 25–29 and counts long-tenure young workers as entry-level. |
| ISCO-88 fallback countries | **Official statistic, older revision** | 10 areas publish ISCO-88 only. Major groups align 1:1 with ISCO-08, so the 1–4 cut carries over; the revision moved some ICT occupations between groups 2 and 3, making `professional_core_pct` slightly less comparable than `white_collar_pct`. |
| Career-stage shares (25–54, 55–64) | **Official statistic** | Same survey source as the headline occupation split. |
| Entry-level squeeze index | **DERIVED composite** | Four percentile ranks combined with chosen weights. Not measured; all components separately available. |
| Exposed wage bill | **MODELED** | A modeled index multiplied by two official statistics. An order of magnitude, never an amount at risk. |
| Time-series country trends | **Official statistic** | Same source, more years. |
| Time-series AGGREGATE trends | **Unreliable** | The reporting country set changes year to year, so aggregate movement is partly composition change. Per-year coverage is published so this can be seen. |
| F. AI exposure score | **MODELED ESTIMATE** | Weights per ISCO major group are assigned by us, informed by published research. Only the rank order is defensible; treat the value as an index, not a probability of displacement. |

### Known limitations

- **Mixed vintages.** Occupation data ranges across years by country; every row records `data_year_occupation` separately from `data_year_population` and `data_year_labor`. Never treat a row as a single-year snapshot.
- **24 countries** have occupation data older than 2019 (ARM, AZE, BMU, CAN, CYM, DJI, DZA, FSM, IMN, KAZ, KWT, LBR, MAR, MYS, NAM, NIC, NPL, SLB, SLE, STP, SUR, TJK, VEN, YEM). They carry a `data_quality_flag` and are excluded from the rankings above.
- **8 countries** classify less than 90% of employment by occupation (COM, CUW, FSM, LBR, NGA, SEN, SLB, TLS); their white-collar share is computed over the classified portion only.
- **7 countries** report fewer than 9 ISCO major groups (HKG, IMN, JPN, LUX, MAC, TWN, VEN); a missing group is folded elsewhere by the national classification.
- **China has no ISCO-08 breakdown in ILOSTAT**, which is the single largest hole in the global white-collar figure.
- Countries with no data are retained as rows with nulls and a `data_quality_flag`, never dropped and never imputed.

