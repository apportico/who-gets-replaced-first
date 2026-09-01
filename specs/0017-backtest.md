# 0017 — back-test the trend, publish the error

**Status:** done
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

**Approved:** 2026-09-02 by Dani, given **directly in the `/sdlc` run rather than
as a GitHub review**. The PR is self-authored, so GitHub cannot record an
approval on it and `reviewDecision` stays `REVIEW_REQUIRED` — on this spec that
field is not a meaningful signal. Review round 1 (five findings, all on
acceptance criteria that could not be run as written) was addressed at `30777a7`:
<https://github.com/apportico/who-gets-replaced-first/pull/86>

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

### R1. [x] Retrodict 2025 from 2013–2019, per country and per ISCO major group

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

**Acceptance:** run against the **committed** `pipeline/data/global_labor_panel.csv`,
so the check reproduces in a fresh clone with no `pipeline/raw/` cache — the
environment CI and every worktree actually have. The back-test emits **574** rows
spanning **64** distinct `iso3` values and 9 distinct `group` values (62 rows for
`isco6_agricultural_pct`, 64 for the other eight; `62 + 64x8 = 574`). Every row
carries a non-null `retrodicted_2025_pct`, `observed_2025_pct` and `error_pp`,
and no row exists for `JPN` or `IND`. `npm run pipeline` writes the same content
to `pipeline/data/backtest.csv` as its integration path — that run is how the
artefact ships, not how the requirement is evidenced.

**Done (2026-09-02):** run against the committed panel — `574` rows, `64` distinct
`iso3`, `9` groups, per-group `[64,64,64,64,64,62,64,64,64]` (`62 + 64x8 = 574`),
zero rows for `JPN` or `IND`, and no row with a null `retrodicted_2025_pct`,
`observed_2025_pct` or `error_pp`. `AGO`/`BFA`/`GMB`/`VUT` are absent rather than
zero-filled, and the gapped-fit test confirms a hole is skipped, not interpolated.

### R2. [x] Every back-test field carries a tier, and `MODELED` never blurs into `DERIVED`

The retrodiction is an analyst-assigned model output and is `MODELED`. The
values it is scored against come from the panel's ISCO shares and are `DERIVED`.
The error is arithmetic on one of each and is therefore `MODELED` too — a
difference is only as measured as its least-measured term.

A `BACKTEST_FIELD_TIERS` registry in `pipeline/config.ts` records the tier of
every emitted back-test column, including `NOT_A_MEASUREMENT` for identity
columns (`iso3`, `country_name`, `group`). It is a separate registry because
`tiers.test.ts` asserts `FIELD_TIERS` is *equal* to `run.COLUMNS`, so extending
that one would fail on a column the snapshot does not have.

The same registry drives the app payload. `src/data/backtest.json` (R7) carries
a `field_tiers` block on the terms `exportAppJson` already uses for
`global_labor.json`, because the payload is the copy the reader actually sees and
a tier that stops at the CSV is a tier the screen cannot render.

**Acceptance:** a test asserts `BACKTEST_FIELD_TIERS` keys are exactly the
back-test CSV header, that every value is in `TIERS ∪ {NOT_A_MEASUREMENT}`, that
`retrodicted_2025_pct` and `error_pp` are `MODELED`, and that
`observed_2025_pct` is `DERIVED`. A second assertion covers
`src/data/backtest.json`: its `field_tiers` keys equal the keys it actually
emits, and agree with `BACKTEST_FIELD_TIERS` on every shared key.
`npm run test:pipeline` green.

**Done (2026-09-02):** `BACKTEST_FIELD_TIERS` keys equal the union of both CSV
headers; every value is in `TIERS ∪ {NOT_A_MEASUREMENT}`; `retrodicted_2025_pct`,
`error_pp` and `persistence_error_pp` are `MODELED` and `observed_2025_pct` /
`last_fit_pct` are `DERIVED`. `src/data/backtest.json`'s `field_tiers` agrees with
the registry on every key. `exportBacktest` throws on an untiered column before
writing anything.

### R3. [x] Publish the error distribution, not a headline mean

`npm run pipeline` prints a `[backtest]` block, and the artefact is summarised in
`pipeline/data/backtest_summary.csv`, carrying **per group and pooled**: n, mean
signed error, MAE, RMSE, median |error|, p90 |error| and max |error| with the
country that produced it.

A mean alone hides the shape — the clerical mean signed error is −0.055pp, which
reads as an almost unbiased model while the median absolute error is 0.66pp and
the worst country is out by 5.06pp.

**Acceptance:** the summary carries a row per group plus a pooled row, each with
all seven statistics, and `npm run pipeline` prints them as `[backtest]`. The
figures **reproduce the committed R6 fixture exactly**, and match the 2026-09-01
probe to **±0.005pp**: pooled MAE 1.806, RMSE 3.867, n 574; `isco4_clerical_pct`
MAE 0.940, RMSE 1.295, n 64, max 5.057 (`GEO`).

The tolerance is not slack, it is the probe's own precision. The probe used
plain JavaScript arithmetic while R1 requires `pipeline/pynum.ts`, and those two
layers differ by design — `pipeline/README.md` tabulates by how much. The
committed fixture, produced by the implementation, is the pass condition; the
probe figures are the 2026-09-01 measurement the fixture has to agree with. A
figure that moves beyond the tolerance is a real change and must be explained,
never re-baselined silently.

**Done (2026-09-02):** `[backtest]` prints nine group rows plus `POOLED`, and
`backtest_summary.csv` carries all seven statistics per row. Measured pooled
MAE `1.806438`, RMSE `3.866665`, n `574`; clerical MAE `0.940160`, RMSE
`1.295288`, max `5.056471` (`GEO`) — every one inside the ±0.005pp tolerance
against the 2026-09-01 probe, and byte-equal to the committed fixture. The
clerical mean signed error is `-0.054759`, which is the case for publishing the
distribution rather than the mean.

### R4. [x] Name every country whose direction is wrong, individually

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

**Done (2026-09-02):** `direction_correct == false` on `31` clerical rows and
`241` pooled, matching `direction_wrong_n` in the summary. `pipeline/README.md`
names all 31 by country and ISO3, asserted per-code by the test so the prose and
the data cannot drift. No pair in the real data has a zero observed change, so
the null branch is unit-tested directly instead.

### R5. [x] Score a no-trend baseline alongside, because it wins

Each row also carries `persistence_error_pp` — the error of carrying the last
fit-window observation forward unchanged — and the summary carries its MAE and
RMSE beside the trend's.

This is the requirement that makes the back-test decide anything. "MAE 1.8pp"
invites the reader to judge whether that is good; "MAE 1.8pp against 1.3pp for
predicting no change at all" does not.

**Acceptance:** the `[backtest]` pooled row carries persistence MAE **1.292**,
RMSE **2.046** (same ±0.005pp tolerance and same committed-fixture rule as R3),
and the share of pairs on which the trend beats persistence: **234/574 (40.8%)**.
A test asserts persistence MAE < trend MAE pooled — the finding, expressed as an
assertion, so a future change that reverses it fails loudly rather than quietly
invalidating the published conclusion.

**If that assertion ever fails, the fix is not to bump the number.** It would go
red on a data refresh that touched no code, and the correct response is to work
out what moved in the panel and republish the conclusion — including retiring it,
if the trend genuinely started winning. Re-baselining the test to green would
leave the result screen still asserting a finding the data no longer supports,
which is the exact failure this requirement exists to prevent.

**Done (2026-09-02):** pooled persistence MAE `1.291857` / RMSE `2.045843`
against the trend's `1.806438` / `3.866665` — **the no-trend baseline wins** — and
the trend improves on it for only `234/574` (40.8%) of pairs. Asserted as
`persistence_mae_pp < mae_pp`, so a future reversal fails the build. Every row's
`persistence_error_pp` is checked against `last_fit_pct - observed_2025_pct`.

### R6. [x] Regression-test it offline, with a committed expected fixture

The back-test joins spec 0004's suite: `pipeline/tests/backtest.test.ts` against
`pipeline/tests/fixtures/expected/backtest.csv`, driven from a committed panel
fixture. No network, no `pipeline/raw/`, sub-second — the suite's existing
contract.

**Acceptance:** `npm run test:pipeline` runs the new file with `pipeline/raw/`
absent and passes; the suite's test count rises above its current 158 and the new
tests are named in the output. Deleting a row from
`pipeline/tests/fixtures/expected/backtest.csv` makes it fail (checked, then
reverted).

**Done (2026-09-02):** `pipeline/tests/backtest.test.ts`, 21 tests, driven from
the committed panel with `pipeline/raw/` absent — no network. Suite went
**159 → 180**. Proved the fixture actually binds rather than merely existing:
deleting one row from `fixtures/expected/backtest.csv` failed the run (20 pass /
1 fail), and restoring it returned 21/21.

### R7. [x] The reader reaches the finding from the result screen

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

**Done (2026-09-02):** verified in Chrome at both viewports, not from a green
build. `GBR` clerical renders "predicted **9.6%** for 2025" `MODELED` against
"published figure is **8.9%**" `DERIVED`, "Out by +0.71pp" — matching the probe's
`pred=9.57 obs=8.86 err=0.71`. `JPN` renders the absence: it names Japan, says it
cannot be back-tested, states 64 of 177, and shows **no retrodicted number** —
the pooled figure is labelled as pooled rather than borrowed. `grep -c "No
back-test is claimed" src/` returns 0 and the app suite asserts its absence.
Snapshots in `.snapshots/0017/`.

**Fixed during verification:** at 375px the `MODELED` badge clipped to "MODEL" —
`.wz-meta` is `nowrap`, so the eyebrow pushed it past the card edge. Added
`flexWrap` and `whiteSpace: normal`; re-measured `badge.right = 133 < 375`. This
is exactly the class of defect a passing build does not catch.

### R8. [x] Nothing here ships a year, and a test holds that line

The likeliest way this spec goes wrong is that a back-test with a published error
reads as a licence to publish the year it was back-testing toward. It is not —
the issue says so explicitly, and CLAUDE.md's *"no replacement year ships, in any
tier"* is unchanged by a measurement that argues against one.

**Acceptance:** a test asserts that every key in the back-test CSV header and in
`src/data/backtest.json` matching `/replacement|displacement|halv|_year$/` is a
member of an explicit allowlist — `fit_start_year`, `fit_end_year`,
`target_year` — and fails on anything else. An **allowlist a new column has to be
added to** is a guard; a prose exemption for "fit-window and target-year
metadata" is a suggestion, and any column ending `_year` could be argued into it.
The accordion states the conclusion in words and offers no date.

**Done (2026-09-02):** the test walks every key of both CSV headers and every key
of `backtest.json` (including its top level) against
`/replacement|displacement|halv|_year$/` and requires each match to be in the
allowlist, which is asserted to be exactly `['fit_start_year', 'fit_end_year',
'target_year']`. No date is offered anywhere in the accordion.

### R9. [x] Say which countries the back-test cannot score, and name the two that motivated it

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

**Done (2026-09-02):** `coverage()` measures `177` countries with a series, `64`
eligible, `113` unscorable. `JPN` and `IND` carry zero rows and
`pipeline/README.md` names both with their reasons — Japan's series ends 2023 so
there is no 2025 value to score against; India has two fit-window observations.
The accordion states 64 of 177 to the reader as well.

## Implementation Plan

**Planned:** 2026-09-02

### Files to create

| Path | Purpose |
|---|---|
| `pipeline/backtest.ts` | The whole computation. Pure functions over panel rows: `backtest()` returns the per-country-per-group rows, `backtestSummary()` the per-group and pooled statistics. Zero runtime dependencies, arithmetic through `pynum.ts`. |
| `pipeline/tests/backtest.test.ts` | R1, R2, R4, R5, R8, R9 acceptance, offline, driven from the committed panel. |
| `pipeline/tests/fixtures/expected/backtest.csv` | The committed golden master R3 and R5 are scored against. |
| `src/utils/backtest.js` | App-side reader: `backtestFor(iso3, group)`, `BACKTEST_SUMMARY`, and the rewritten `BACKTEST_NOTE`. |
| `pipeline/data/backtest.csv`, `pipeline/data/backtest_summary.csv`, `src/data/backtest.json` | Emitted artefacts. |

### Files to modify

| Path | Change |
|---|---|
| `pipeline/config.ts` | Add `BACKTEST_FIELD_TIERS`, covering the union of both CSV headers. Separate from `FIELD_TIERS`, which `tiers.test.ts:44` asserts equal to `run.COLUMNS`. |
| `pipeline/run.ts` | Call the back-test in `main()` after `exportPanel`, print `[backtest]`, write the two CSVs and the app payload. |
| `pipeline/README.md` | The back-test section: method, the error distribution, all 31 wrong-direction clerical countries by name, and the 64-of-177 coverage with Japan and India named. |
| `src/utils/terms.js` | `BACKTEST_NOTE` re-exported from `backtest.js`; the "No back-test is claimed here" sentence goes. |
| `src/components/wizard/ResultScreen.jsx` | The existing `backtest` accordion renders the measurement instead of the note alone. |
| `src/utils/wizard.test.js` | Replace the two `BACKTEST_NOTE` assertions. |

### Sequence

1. `pipeline/backtest.ts` — the computation, and the column lists both CSVs use.
2. `BACKTEST_FIELD_TIERS` in `config.ts` (R2 depends on the column lists from 1).
3. Wire into `run.ts`; generate the artefacts by running the back-test against the committed panel.
4. Commit `pipeline/tests/fixtures/expected/backtest.csv` from that output, then `pipeline/tests/backtest.test.ts` against it.
5. `pipeline/README.md` — the numbers come from step 3, so this follows it.
6. App: `src/utils/backtest.js`, the accordion, the test updates.
7. `npm run verify`.

### Requirement mapping

| Req | How it will be satisfied | Where | How acceptance is checked |
|---|---|---|---|
| R1 | OLS on observed 2013–2019 years, evaluated at 2025; `>=3` fit obs and a non-null 2025 value or the pair is absent | `pipeline/backtest.ts` | Run against the committed panel: 574 rows, 64 iso3, 9 groups, no `JPN`/`IND` |
| R2 | `BACKTEST_FIELD_TIERS` + `field_tiers` in the app payload | `pipeline/config.ts`, `run.ts` | `backtest.test.ts` asserts key equality and the four specific tiers |
| R3 | Seven statistics per group plus pooled | `backtestSummary()`, `[backtest]` block | Fixture equality, and ±0.005pp against the probe figures |
| R4 | `direction_correct` per row, null on a zero observed change; every wrong-direction country named in the README | `backtest.ts`, `pipeline/README.md` | Test asserts 31 clerical / 241 pooled, and that the README names all 31 |
| R5 | `persistence_error_pp` per row; MAE/RMSE and the win rate in the summary | `backtest.ts` | Test asserts persistence MAE < trend MAE pooled |
| R6 | Golden-master test against a committed fixture, no network | `pipeline/tests/backtest.test.ts` | `npm run test:pipeline` with `pipeline/raw/` absent; count rises from **159** |
| R7 | Accordion renders the reader's own pair, or says it has none | `src/utils/backtest.js`, `ResultScreen.jsx` | Browser screenshots at 375×812 and 1440×900 for `GBR` and `JPN` |
| R8 | Allowlist test over both artefacts | `backtest.test.ts` | Only `fit_start_year`, `fit_end_year`, `target_year` may match the pattern |
| R9 | Coverage sentence and the two named countries | `pipeline/README.md`, accordion | Test asserts `JPN`/`IND` absent and the README names them |

### Tier and vintage handling

| Column | Tier | Why |
|---|---|---|
| `iso3`, `country_name`, `group` | `NOT_A_MEASUREMENT` | Identity |
| `fit_start_year`, `fit_end_year`, `target_year`, `fit_obs` | `NOT_A_MEASUREMENT` | Provenance, not a claim about the world |
| `last_fit_pct`, `observed_2025_pct` | `DERIVED` | Panel ISCO shares, arithmetic on official statistics |
| `retrodicted_2025_pct` | `MODELED` | An analyst-chosen model's output |
| `error_pp`, `persistence_error_pp`, `direction_correct` | `MODELED` | A difference is only as measured as its least-measured term |

Vintage is explicit in the column names rather than a sibling `data_year_*`: the
fit window and the target year are the same for every row by construction, and
they are emitted per row so the artefact cannot be read without them.

### Validation

`[backtest]` prints on every full run beside `[validate]`, `[crosscheck]` and
`[outliers]`. It does **not** gate the build on the error figures themselves —
those are a published finding, not an anchor. The one assertion that does gate is
R5's persistence-beats-trend comparison, in the test suite rather than the run,
for the reason R5 records.

### Risks

- **`pipeline/raw/` is absent and ILOSTAT's SDMX endpoint was unreachable on
  2026-09-02**, so `npm run pipeline` cannot be executed end to end here. This is
  why R1 and R3's acceptance were re-anchored to the committed panel in review
  round 1; the `run.ts` wiring is verified by construction and by the unit tests,
  not by a full run.
- **`pynum` arithmetic may shift the last decimal** against the probe figures.
  R3's ±0.005pp tolerance covers it; a larger move is a real finding.
- **The 2025 column is the thinnest year in the panel** (69 countries against 115
  in 2019). If a future refresh backfills 2025, the eligible set grows and every
  committed figure moves. That is a real change and R3 requires it be explained.

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
