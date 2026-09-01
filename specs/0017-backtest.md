# 0017 — back-test the trend, publish the error

**Status:** in-review
**Depends on:** 0004 (regression suite), 0006 (panel + time series), 0010 (result screen)
**Issue:** [#80](https://github.com/apportico/who-gets-replaced-first/issues/80)
**Goal:** Publish a measured retrodiction error that says plainly why this site
states no replacement date, checked as:
1. `npm run pipeline` emits a per-country back-test, every field tiered — the
   retrodiction `MODELED`, the observed values it is scored against `DERIVED`.
2. The error **distribution** is published, not a headline mean, and every
   country whose direction is wrong is named individually.
3. Spec 0004's regression suite carries a committed expected fixture for it and
   runs offline.
4. A reader can reach the finding from the result screen.
5. `npm run verify` green, and the data non-negotiables hold throughout: no
   imputed country, no untiered figure, and **no replacement year in any tier**.

## Objective

The result screen tells the reader *"No displacement date is published for any
occupation, anywhere — so this page does not state one."* That refusal is
currently an **assertion**, resting on spec 0010 R13's source probe finding
nothing published. It is the right reason, but it is not a measured one: a critic
can reasonably answer "you did not publish a date because you did not try."

This spec answers that with a number. Fit the naive model — ordinary least
squares on each country's 2013–2019 occupation share — predict 2025, and score
it against the 2025 value the panel already holds. The question it lets us answer
that we cannot answer today is: **does trend extrapolation on this panel
retrodict a period that has already happened?** If it cannot, the refusal stops
being a judgement call and becomes a published measurement, and the back-test
accordion on the result screen stops saying "no back-test is claimed here" and
starts showing one.

The probes below already answer it, and the answer is no. That is the outcome
this spec exists to publish — per the issue, *"a published error figure that says
plainly why the site does not state a date"* is the success condition, not the
failure condition.

## Source verification

No new external source. The issue is explicit that Phase 1 needs none: the input
is the in-tree panel. Every row below was probed on **2026-09-01** against the
committed working tree at `4895def`.

| Source | Probed | Result |
|---|---|---|
| `pipeline/data/global_labor_panel.csv` | Read with `pipeline/csvio.ts` (the repo's own reader — a naive `split(',')` mis-parses the quoted `"Middle East, North Africa…"` region and invents an eighth `row_type`) | 2936 data rows × 38 columns; `row_type` = 2830 `country` / 92 `region` / 14 `world`; years 2013–2026 |
| Same — target field coverage | Counted non-empty `isco4_clerical_pct` per iso3 | **177** countries carry a clerical series (matches the 177 of spec 0011); **69** carry a 2025 value; per-year country counts run 106 (2013) → 115 (2019) → **69** (2025) |
| Same — fit-window coverage | Counted 2013–2019 observations per country | 72 countries have all 7; histogram `{0:5, 1:41, 2:23, 3:14, 4:9, 5:5, 6:8, 7:72}`. **64** countries have ≥3 fit-window observations *and* a 2025 value — the eligible set |
| Same — the ineligible-but-recent | Listed countries with a 2025 value but <3 fit observations | `AGO`(2) `BFA`(1) `GMB`(1) `IND`(2) `VUT`(1) — five countries scorable only if the fit floor is dropped below 3 |
| Same — Japan | Read JPN's whole clerical series | `2013=19.86 … 2023=21.19`, **no 2024 and no 2025 observation**. The design proposal's headline counter-example *cannot be back-tested at all* |
| Same — the other eight ISCO groups | Repeated the coverage count for `isco1`–`isco9` | Identical eligible set (64 countries) for all groups except `isco6_agricultural_pct` (62) — the panel emits the nine shares together |
| Back-test itself, clerical | Ran OLS 2013–2019 → 2025 over the 64 eligible countries | mean signed error **−0.055pp**, MAE **0.940pp**, RMSE **1.295pp**, median \|err\| 0.656, p90 1.795, max **5.057** (Georgia: predicted 8.77%, observed 3.71%) |
| Back-test, direction | Compared sign of (predicted − last fit obs) with (observed − last fit obs) | **31 of 64** clerical countries get the direction wrong |
| Back-test, no-trend baseline | Scored "carry the last fit-window observation forward" on the same 64 | MAE **0.645pp**, RMSE **0.843pp** — **the trend model is beaten by assuming no change at all** |
| Back-test, all nine groups pooled | Repeated over 574 country×group pairs | trend MAE **1.806pp** / RMSE **3.867pp**; persistence MAE **1.292pp** / RMSE **2.046pp**; trend wins on only **234/574** (40.8%) pairs; direction wrong on **241/574** (**42.0%**) |
| `src/components/wizard/ResultScreen.jsx` | Read lines 171–206 | An `AccordionItem value="backtest"` already exists, titled *"What this cannot tell you"*, rendering `BACKTEST_NOTE` |
| `src/utils/terms.js` | Read `BACKTEST_NOTE` | Ends *"No back-test is claimed here, because no displacement model ships."* — a sentence this spec makes false, asserted by `src/utils/wizard.test.js:536` |
| `pipeline/config.ts` + `pipeline/tests/tiers.test.ts` | Read the registry and its test | `FIELD_TIERS` is asserted **equal** to `run.COLUMNS`; a back-test artefact with its own columns therefore needs its own registry, not an extension of that one |

**Two probe results shape the requirements below and must not be lost.**

1. **A trend model on this panel is worse than no model.** Persistence beats OLS
   on MAE and RMSE, pooled and in 8 of the 9 groups. An error figure alone would
   not show this — 1.8pp sounds tolerable until it is set beside the 1.3pp you
   get by predicting nothing. R5 exists so the comparison ships.
2. **The proposal's own counter-examples are partly unscorable.** Japan has no
   2025 observation and India has two fit-window observations, so neither
   appears in the back-test. Reporting a 64-country error without saying that
   would overstate coverage of exactly the cases that motivated the ticket. R9
   exists for this.

## Requirements

### R1. [ ] Retrodict 2025 from 2013–2019, per country and per ISCO major group

A new `pipeline/backtest.ts` exports a pure function over panel rows: for each
country and each of the nine ISCO-08 major-group share fields, fit OLS on the
2013–2019 observations, evaluate the fitted line at 2025, and record it beside
the observed 2025 value.

Eligibility is **≥3 observations in 2013–2019 and a non-null 2025 observation**.
A country-group pair that misses either is **absent from the artefact** — not a
row of zeros, not an imputed fit. The fit uses only years actually observed; a
gap year is skipped, never interpolated.

Arithmetic goes through `pipeline/pynum.ts` (`pyRound`, `pySumFloat`, `pyStr`) on
the same terms as every other emitted number — this is pipeline output, and
`Math.round`/`toFixed` are not the project's arithmetic.

`run.ts` calls it with the in-memory panel rows during a full run and writes
`pipeline/data/backtest.csv`.

**Acceptance:** `npm run pipeline` writes `pipeline/data/backtest.csv` with
**574** data rows spanning **64** distinct `iso3` values and 9 distinct `group`
values (62 rows for `isco6_agricultural_pct`, 64 for the other eight). Every row
carries a non-null `retrodicted_2025_pct`, `observed_2025_pct` and
`error_pp`. `grep -c '^JPN,' pipeline/data/backtest.csv` returns 0, and so does
`^IND,`.

### R2. [ ] Every back-test field carries a tier, and `MODELED` never blurs into `DERIVED`

The retrodiction is an analyst-assigned model output and is `MODELED`. The
values it is scored against come from the panel's ISCO shares and are `DERIVED`.
The error is arithmetic on one of each and is therefore `MODELED` too — a
difference is only as measured as its least-measured term.

A `BACKTEST_FIELD_TIERS` registry in `pipeline/config.ts` records the tier of
every emitted back-test column, including `NOT_A_MEASUREMENT` for identity
columns (`iso3`, `country_name`, `group`). It is a separate registry because
`tiers.test.ts` asserts `FIELD_TIERS` is *equal* to `run.COLUMNS`, so extending
that one would fail on a column the snapshot does not have.

**Acceptance:** a test asserts `BACKTEST_FIELD_TIERS` keys are exactly the
back-test CSV header, that every value is in `TIERS ∪ {NOT_A_MEASUREMENT}`, that
`retrodicted_2025_pct` and `error_pp` are `MODELED`, and that
`observed_2025_pct` is `DERIVED`. `npm run test:pipeline` green.

### R3. [ ] Publish the error distribution, not a headline mean

`npm run pipeline` prints a `[backtest]` block, and the artefact is summarised in
`pipeline/data/backtest_summary.csv`, carrying **per group and pooled**: n, mean
signed error, MAE, RMSE, median |error|, p90 |error| and max |error| with the
country that produced it.

A mean alone hides the shape — the clerical mean signed error is −0.055pp, which
reads as an almost unbiased model while the median absolute error is 0.66pp and
the worst country is out by 5.06pp.

**Acceptance:** `npm run pipeline` prints `[backtest]` with a row per group plus
a pooled row. The pooled row reads MAE **1.806**, RMSE **3.867**, n **574**; the
`isco4_clerical_pct` row reads MAE **0.940**, RMSE **1.295**, n **64**, max
**5.057** (`GEO`). Figures are quoted from the 2026-09-01 probe and are what the
committed fixture must reproduce; a moved figure is a real change and must be
explained, not re-baselined silently.

### R4. [ ] Name every country whose direction is wrong, individually

A model that gets the *sign* wrong has failed in a way no error magnitude
reports. Each row carries `direction_correct`, comparing the sign of
(retrodicted − last fit-window observation) against (observed − last fit-window
observation). A pair whose observed change is exactly zero is recorded as
`direction_correct` null rather than forced to true or false.

`pipeline/README.md` gains a back-test section listing, by name and ISO3, **every
clerical country whose direction is wrong** — not a count.

**Acceptance:** `pipeline/README.md` names all **31**: `ARG BGR BOL BRA COL CYP
CZE DNK DOM ESP EST GEO GRC HUN ISL LCA LTU LVA MDA MKD MNG NOR PAK PAN POL PRY
PSE RWA SRB SVN SWE`. A test asserts the count of `direction_correct == false`
rows for `isco4_clerical_pct` in the artefact is 31, and **241** pooled across
all nine groups, so the README and the data cannot drift apart.

### R5. [ ] Score a no-trend baseline alongside, because it wins

Each row also carries `persistence_error_pp` — the error of carrying the last
fit-window observation forward unchanged — and the summary carries its MAE and
RMSE beside the trend's.

This is the requirement that makes the back-test decide anything. "MAE 1.8pp"
invites the reader to judge whether that is good; "MAE 1.8pp against 1.3pp for
predicting no change at all" does not.

**Acceptance:** the `[backtest]` pooled row carries persistence MAE **1.292**,
RMSE **2.046**, and the share of pairs on which the trend beats persistence:
**234/574 (40.8%)**. A test asserts persistence MAE < trend MAE pooled — the
finding, expressed as an assertion, so a future change that reverses it fails
loudly rather than quietly invalidating the published conclusion.

### R6. [ ] Regression-test it offline, with a committed expected fixture

The back-test joins spec 0004's suite: `pipeline/tests/backtest.test.ts` against
`pipeline/tests/fixtures/expected/backtest.csv`, driven from a committed panel
fixture. No network, no `pipeline/raw/`, sub-second — the suite's existing
contract.

**Acceptance:** `npm run test:pipeline` runs the new file with `pipeline/raw/`
absent and passes; the suite's test count rises above its current 158 and the new
tests are named in the output. Deleting a row from
`pipeline/tests/fixtures/expected/backtest.csv` makes it fail (checked, then
reverted).

### R7. [ ] The reader reaches the finding from the result screen

The existing `backtest` accordion currently reads *"No back-test is claimed here,
because no displacement model ships."* That sentence becomes false with this
spec and is replaced by the measurement: what was fitted, on what window, how far
it missed, that it was beaten by assuming no change, and that this is **why** the
page states no date.

Where the reader's country and group are in the eligible set, the accordion shows
that pair's own retrodicted vs observed 2025 figures with a `MODELED` badge on
the retrodiction and `DERIVED` on the observed. Where they are not — 113 of the
177 countries with a series, Japan among them — it says so plainly and shows the
pooled figure instead. No country is given a number it does not have.

The pipeline emits `src/data/backtest.json` so the payload cannot drift from the
code that writes it (spec 0009's rule).

**Acceptance:** a browser screenshot at 375×812 and 1440×900 of the result screen
with the accordion open, for one eligible pair (`GBR` clerical) and one absent
pair (`JPN` clerical). `src/utils/wizard.test.js`'s assertion on
`/No back-test is claimed/` is replaced by assertions on the new text.
`grep -c "No back-test is claimed" src/` returns 0.

### R8. [ ] Nothing here ships a year, and a test holds that line

The likeliest way this spec goes wrong is that a back-test with a published error
reads as a licence to publish the year it was back-testing toward. It is not —
the issue says so explicitly, and CLAUDE.md's *"no replacement year ships, in any
tier"* is unchanged by a measurement that argues against one.

**Acceptance:** no emitted back-test column names a replacement, displacement or
halving year; a test asserts the back-test CSV header and
`src/data/backtest.json` contain no key matching
`/replacement|displacement|halv|_year$/` other than the literal fit-window and
target-year metadata. The accordion states the conclusion in words and offers no
date.

### R9. [ ] Say which countries the back-test cannot score, and name the two that motivated it

**108** of the 177 countries with a clerical series have no 2025 observation, and
5 more have one but too short a fit window. Publishing a 64-country error without
that denominator would overstate the coverage of the finding.

`pipeline/README.md` and the accordion both state the eligible count against the
177, and name **Japan** (series ends 2023, no 2025 value) and **India** (2
fit-window observations) specifically — the two countries the design proposal
used to argue the model measures the wrong thing, and neither of which the
back-test can score.

**Acceptance:** `pipeline/README.md` contains "64" and "177" in the back-test
coverage sentence and names Japan and India with their reasons. A test asserts
`JPN` and `IND` are absent from the artefact, so the README's claim and the data
agree.

## Non-goals

- **Building a replacement year.** Not authorised here in any tier (R8). A
  favourable back-test would have been an input to a future spec with its own
  formula, sensitivity analysis and issue — and the back-test was not favourable.
- **A better model.** Fitting ARIMA, a hierarchical prior or a structural
  decomposition to beat OLS is a different ticket. This one asks whether the
  *naive* model — the one a reader would assume is behind any published date —
  retrodicts. It does not.
- **Separating displacement from the other forces in the net share.** That is the
  structural constraint the issue names, and it needs sources this project does
  not have (Phase 2: #45, #47, #11). This spec measures the net figure's
  extrapolability, and says that is what it measured.
- **Building the methodology page.** #78 is adding it. This spec puts the
  finding in the accordion the result screen already has; moving it onto that
  page when it lands is #78's business.
- **Dropping the fit floor below 3 observations** to recover `AGO`, `BFA`,
  `GMB`, `IND`, `VUT`. A two-point OLS fit has no residual and would enter the
  error distribution as a spuriously confident row.
- **Back-testing anything but the ISCO major-group shares.** The derived
  aggregates (`white_collar_pct`, `ai_exposure_weighted_score`) are functions of
  the nine, so scoring them adds correlated rows, not evidence.
