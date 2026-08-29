# 0004 — Pipeline regression test suite

**Status:** draft
**Depends on:** none
**Issue:** #2

## Objective

The pipeline has regression *checks* — `[validate]`, `[crosscheck]` and
`[outliers]` blocks that print on a full run — but it has no **tests**. Every
non-negotiable in `CLAUDE.md` is currently enforced by care alone: that nulls
stay null, that aggregates are weighted and publish their coverage, that every
number carries a tier and a year, that a manual override without a citation is
refused. A refactor that quietly started imputing a missing country would pass
`npm run lint`, pass `npm run build`, and print entirely plausible numbers.

This spec makes those rules mechanical. It answers a question we cannot answer
today: **would we know if the pipeline started inventing figures?** Today the
honest answer is "only if someone noticed the number looked wrong." After this,
the answer is a suite that fails.

It is also the safety net #21 (the Python→TypeScript port) declares a hard
dependency: porting 1,925 lines of numerical code without tests is how a
rounding or null-handling change ships as a fact about the world.

## Source verification

This spec is internal — it names no external API. The probe burden is therefore
different in kind, not absent: what had to be verified is that the code under
test is reachable offline, and that the fixtures the suite needs can exist. All
probes run 2026-08-29 against the working tree at `43f30c1`.

| Source | Probed | Result |
|---|---|---|
| All 7 pipeline modules importable offline | `socket.getaddrinfo` patched to raise, then `__import__` each of `config`, `fetch`, `build`, `panel`, `crosscheck`, `report`, `run` | **All 7 import OK**, 0.000–0.027s. No module hits the network at import time. A stdlib suite needs no network and no pip installs. |
| Functions under test are plain, reachable functions | `grep '^def '` across `pipeline/*.py` | `derive`, `_wavg`, `make_aggregate`, `quality_flag`, `apply_overrides`, `validate`, `latest`, `num`, `_pick_occupation_year`, `find_outliers` all module-level. No class or import-time side effect to work around. |
| Per-field vintages exist in the output | Read header of `pipeline/data/global_labor_dataset.csv` | **Present.** `data_year_population`, `data_year_labor`, `data_year_sector`, `data_year_occupation`, `data_year_youth_occupation`, `data_year_lfp_age`, `data_year_context`, plus five `*_range` variants on aggregates. Directly assertable. |
| Coverage published alongside aggregates | Read `make_aggregate` in `build.py:440` | **Present.** `isco_coverage_pct_of_employment` and `youth_isco_coverage_pct_of_employment` are set from the `_wavg` denominator over `employed_total`. Assertable. |
| Manual overrides carry a citation contract | Read `apply_overrides` in `build.py:496` and `manual_overrides.json` | **Present.** Six keys required per entry (`value`, `year`, `source_name`, `source_url`, `retrieved`, `note`); an entry missing any is printed and skipped, never merged. `overrides` is `{}` — ARM, NZL, SAU sit in `_unfilled_gaps` on purpose. Assertable without inventing a figure. |
| A machine-readable field→tier map | `grep -c 'OFFICIAL\|DERIVED\|PROXY\|MODELED' pipeline/README.md` → **0**; `grep` across `pipeline/*.py` | **Does not exist.** Tiers appear only as prose in `report.py`'s methodology tables (lines 101–102, 360–367) and as a partial 5-entry `sources` dict in `run.py:232`. There is nothing for a test to assert against — the registry has to be built. See R3. |
| What scope `--pilot` actually fetches | Read `run.py:274-277`; evaluated `set(C.PILOT) \| set(C.EU27)` | **32 areas**, not 6 — `C.PILOT` is 6, EU27 adds 27, DEU overlaps. Output is then filtered to `set(C.PILOT) \| {"EU27","WLD"}` = **7 rows** (WLD, EU27, ARM, CHN, DEU, IND, USA), matching the committed CSV. The "6-area batch" in `run.py:4` and `CLAUDE.md` describes output rows, not fetch scope. EU27 is a weighted aggregate over all 27 members, so all 27 must be cached. |
| A pilot fixture cache is small enough to commit | Sliced `pipeline/raw/` to the **32-area** fetch scope and measured, raw and gzipped | **Feasible gzipped, not raw.** Raw slice **18.32MB** (ILOSTAT 15.70 / WB 2.51 / Eurostat 0.11) — too large to commit. **Gzipped: 0.78MB**, the SDMX-CSV being highly repetitive. An earlier draft of this spec measured 2.27MB against the wrong 6-area slice; that figure is withdrawn. Row-filtering to what the pipeline keeps would give 6.77MB raw / 0.39MB gzipped, but is rejected — it would bake today's `AGE`/`OCU` filter criteria into the fixture. |
| Where the pilot run writes, and where the cache is read from | Read `fetch.py:5`, `run.py:20`, `run.py:277` | **Both hardcoded module constants.** `fetch.RAW` and `run.DATA` take no argument and nothing redirects them; the pilot writes to `os.path.join(DATA, "pilot_labor_dataset.csv")`. So the expected output cannot live at that path or the test would diff the file against itself. `_get` (`fetch.py:16`) returns the cached file whenever it exists, so a populated fixture cache makes the run offline. |
| The four regression anchors are reachable in the pilot | Read `REGRESSION_CHECKS`, `run.py:71-76`, against the 7 output rows | **All four resolve** — WLD ≈50%, USA ≈79%, EU27 ≈72%, IND ≈31.5%, exactly the anchors `CLAUDE.md` names. An earlier draft committed only to US and India. |
| The committed pilot output is usable as a golden master | Compared `run.COLUMNS` (89) against the headers of both committed CSVs | **`global_labor_dataset.csv` is current** — 89 cols, exact match. **`pilot_labor_dataset.csv` is stale** — 87 cols, still carrying `early_career_white_collar_pct` and `data_year_early_career`, the columns 0002 R11 replaced when it was revised `[~]` to the career-stage profile. It is missing `prime_white_collar_pct`, `late_career_white_collar_pct`, `prime_white_collar_year`, `late_career_white_collar_year`. It must be regenerated before it can be an expected output. See R8. |

## Requirements

### R1. [ ] Derived arithmetic is pinned to known inputs and known outputs

Unit-test the arithmetic in `build.derive()` over synthetic rows with
hand-computed expected values: `employed_total = labour_force × (1 −
unemployment/100)`; `employed_share_of_population_pct = 100 × employed /
population`; the `emp_to_pop_ratio_15plus` fallback path when no headcount is
available; and the ISCO band sums (`white_collar_pct` over groups 1–4,
`professional_core_pct` over 1–2, `blue_collar_service_pct` over 5–9). Cover
`num()` and `latest()`, which decide what counts as a usable value and which
year wins.

Every number these produce is **DERIVED** — arithmetic on official statistics —
and R3 requires that to be recorded in the registry, not just here in prose.

**Acceptance:** with `labor_force_total=1000`, `unemployment_rate_total=10.0`,
`population_total=5000`, `derive()` yields `employed_total == 900` and
`employed_share_of_population_pct == 18.0`. A test asserts
`white_collar_pct == round(isco1+isco2+isco3+isco4, 4)` on a fixture whose four
group values are distinct and non-round. Mutating the `1 -` to `1 +` in
`build.py` fails at least one test.

### R2. [ ] A missing input produces a null and a flag — never a zero, never a guess

The single most important test in the suite. A country missing an input must
emerge with `None` in that field and a `data_quality_flag` naming the gap; it
must never emerge with `0`, and never with a value interpolated from its
neighbours, its region or its own other years.

Cover the guard specifically: `derive()` computes the ISCO bands through
`g = lambda code: groups.get(code) or 0.0`, which coerces a null group to `0.0`
inside the sum, and is safe **only** because the whole block is gated on
`have_isco = row.get("data_year_occupation") is not None`. That gate is exactly
the kind of line a refactor drops. Test that a row with no occupation year
yields `white_collar_pct is None` rather than `0.0`.

Also cover `build.quality_flag()`: `complete` when nothing is missing;
`partial — …` / `sparse — …` carrying the reason otherwise.

**Acceptance:** a fixture row with `data_year_occupation=None` and some ISCO
group values present yields `white_collar_pct is None`, and
`assertIsNot(row["white_collar_pct"], 0.0)` passes. A row with no population,
no labour force and no ISCO yields a flag beginning `sparse — `. Deleting the
`if have_isco else None` guard makes the suite fail rather than emit `0.0`.

### R3. [ ] Every emitted field carries a tier, in a registry the tests can read

**Probed and found absent** — the tier vocabulary exists today only as prose in
`report.py` and a 5-entry `sources` dict in `run.py:232`. `pipeline/README.md`
contains none of the four words. So this requirement builds what it then tests:
a machine-readable `FIELD_TIERS` map in `pipeline/config.py`, one entry per
emitted column, valued from the closed set `OFFICIAL | DERIVED | PROXY |
MODELED`.

The registry must agree with what `report.py` already tells the reader in prose
— that is the point of anchoring it rather than re-deciding it. The anchors:
World Bank and ILOSTAT figures as published are `OFFICIAL`; arithmetic on them
(`employed_total`, `employed_share_of_population_pct`, the ISCO band sums) is
`DERIVED`; the age-15–24 stand-in for seniority (`young_white_collar_pct` and
the entry-level family) is `PROXY`; `ai_exposure_weighted_score` and
`exposed_wage_bill_ppp` are `MODELED`.
Identifier and provenance columns (`iso3`, `country_name`, the `data_year_*`
and `data_quality_flag` fields) are not measurements and take no tier — the
registry must say so explicitly rather than leave them absent, so that "no
entry" always means "someone forgot".

**`entry_level_squeeze_index` is `MODELED`, not `DERIVED`.** This is the one
place the registry departs from `report.py`'s label, and the departure is the
point. `report.py:363` calls it a "**DERIVED composite**" and then hedges in
the same cell — "Four percentile ranks combined with chosen weights. Not
measured". Those weights are `SQUEEZE_COMPONENTS` in `build.py:343` — 0.25 /
0.30 / 0.25 / 0.20, assigned by this project, exactly as the ISCO exposure
weights are. `CLAUDE.md` defines `DERIVED` as "arithmetic on official
statistics" and `MODELED` as "analyst-assigned model output"; a weighted
composite of percentile ranks is the second. The hedge survives as a sentence
in a prose table but cannot survive as a one-word enum that the app renders
from, and leaving it `DERIVED` would put two composites with project-assigned
weights — this and `ai_exposure_weighted_score` — on different tiers. Fixing
the prose in `report.py` and the `squeeze_index` docstring (`build.py:353`,
which likewise says "DERIVED not measured") is in scope for this requirement,
since the registry and the prose must not disagree.

Export the registry alongside the data so the app can read it: add it to the
app JSON payload written by `run.export_app_json()`.

**Acceptance:** two distinct assertions, because the registry and the payload
cover different column sets and conflating them would make the requirement
unsatisfiable. Pipeline-side: `set(FIELD_TIERS) == set(run.COLUMNS)` — 89
columns — so adding a column to `COLUMNS` without a tier fails the suite.
Payload-side: `export_app_json` trims to `keep = [c for c in COLUMNS if not
c.endswith("_range")]`, which is **84** columns — the five `data_year_*_range`
fields are dropped — so the assertion is `set(payload["field_tiers"]) ==
set(keep)`, and `field_tiers` is exported filtered to `keep` rather than whole.
Every value is in the closed set or `NOT_A_MEASUREMENT`. A test asserts the
five anchors above by name, including `entry_level_squeeze_index == "MODELED"`.

### R4. [ ] Aggregates are weighted, and their coverage is published

Test `build._wavg()` and `build.make_aggregate()` on a fixture **constructed so
the weighted and simple-average answers differ materially** — a large country
with a low share and a small country with a high one — asserting we produce the
weighted figure. Assert that a member with a null value is excluded from the
numerator *and* the denominator rather than counted as zero, and that the
coverage percentage reports the share of employment actually covered.

`_wavg` returns `(None, 0.0)` when no member carries the field; the aggregate
must then be null, not `0`.

**Acceptance:** a two-member fixture — 900 employed at `white_collar_pct=20.0`,
100 employed at `80.0` — yields `white_collar_pct == 26.0` (weighted), not
`50.0` (simple mean). Adding a third member with `white_collar_pct=None` and
100 employed leaves the figure at `26.0` and sets
`isco_coverage_pct_of_employment == 90.91`. An all-null fixture yields
`white_collar_pct is None`.

### R5. [ ] A row is never presented as a single-year snapshot

Vintages differ per field — population may be 2025 while occupation is 2017.
Test that `build.latest()` selects the newest non-null year and returns it
alongside the value, that each `data_year_*` field survives to the emitted row
independently, and that `make_aggregate` records both the max year and the
`*_range` span across members rather than collapsing them to one year.

These fields are provenance, not measurements; R3's registry marks them
`NOT_A_MEASUREMENT`.

**Acceptance:** a fixture with `data_year_population=2025` and
`data_year_occupation=2017` emits both, unmodified, in the same row. An
aggregate over members with occupation years 2017 and 2023 yields
`data_year_occupation == 2023` and `data_year_occupation_range == "2017-2023"`.
`latest({2020: 5.0, 2023: None, 2021: 7.0})` returns `(7.0, 2021)`.

### R6. [ ] An override without a citation is refused, not merged

`build.apply_overrides()` requires six keys per entry — `value`, `year`,
`source_name`, `source_url`, `retrieved`, `note`. Test that a complete entry is
applied and tagged in `data_source_override`, and that an entry missing any one
of the six leaves the row's field **unchanged** rather than merging the value.
Test that an override for an unknown ISO3 is skipped without raising.

Use a temp-file fixture, not the real `manual_overrides.json` — the suite must
not require, or encourage, inventing a figure for ARM, NZL or SAU. Assert the
real file's `overrides` is a dict and that every entry in it, if any are ever
added, carries all six keys.

**Acceptance:** an entry missing `retrieved` leaves `row["white_collar_pct"]`
at its pre-override value and adds nothing to `data_source_override`. A
complete entry sets the value and appends
`"white_collar_pct=<v> (<year>, <source_name>)"`. A test over the committed
`manual_overrides.json` passes today with `overrides == {}` and would fail on a
future uncited entry.

### R7. [ ] A golden-master pilot run, offline, in CI

Commit a slice of the response cache as `pipeline/tests/fixtures/raw/`, and a
test that runs the real pilot pipeline against it with no network and diffs the
result against a committed expected CSV. Unit tests over pure functions will
not catch a change in number formatting or column order; this will, and it is
the proof #21 needs to show its TypeScript port changed nothing.

**The slice is 32 areas, not 6.** `run.py:274` sets the pilot fetch scope to
`set(C.PILOT) | set(C.EU27)` — 32 unique areas, since DEU is in both. Line 276
then filters the *output* to `set(C.PILOT) | {"EU27", "WLD"}`, which is why the
committed pilot CSV carries 7 rows (WLD, EU27, ARM, CHN, DEU, IND, USA). EU27
is a weighted aggregate over all 27 members, so producing that row needs cached
responses for all 27. The "6-area batch" wording in `run.py:4` and `CLAUDE.md`
describes the output rows, not the fetch scope. A 6-area fixture cannot
complete a pilot run: with `socket.getaddrinfo` patched to raise, it dies on
the first EU member.

**The fixture ships gzipped.** Re-measured on the correct 32-area scope: the
raw slice is 18.32MB (ILOSTAT 15.70, World Bank 2.51, Eurostat 0.11) — too
large to commit — but **0.78MB gzipped**, because the ILOSTAT SDMX-CSV is
extremely repetitive. Commit the gzipped slice and have the test decompress it
into a `tempfile.TemporaryDirectory()` at setUp. This keeps every row of the
32-area slice rather than pre-filtering rows the pipeline would discard, so the
fixture exercises the real `AGE` / `OCU` filters in `load_youth_occupation`
instead of quietly encoding today's filter criteria into the test data.

The fixture must be a genuine slice of the real cached responses — filtered by
area, never hand-written — so it exercises the real parsing paths, including
the messy ones: Armenia's occupation series ending 2017, and China's and
India's partial coverage.

**The run must not write where the expected output lives.** `fetch.RAW`
(`fetch.py:5`) and `run.DATA` (`run.py:20`) are both hardcoded module
constants, and `run.py:277` writes the pilot result to `os.path.join(DATA,
"pilot_labor_dataset.csv")`. If the expected output were that same file, the
test would run the pilot, overwrite the expected output, then diff the file
against itself — passing unconditionally while silently rewriting the golden
master and leaving what looks like an unrelated data change in the working
tree. That is the exact failure this spec exists to prevent. So:

- The expected output lives at `pipeline/tests/fixtures/expected/pilot_labor_dataset.csv`,
  a path nothing in the pipeline writes to.
- The test points `fetch.RAW` at the decompressed fixture directory and writes
  the run's output to a second temp directory. Patching the two module
  constants for the duration of the test is enough; if that proves awkward,
  thread an explicit directory through instead, but do not let the run touch
  `pipeline/data/`.
- The pilot scope and output filter currently live inline in `main()`. Extract
  them into a small named helper that both `main()` and the test call, so the
  test cannot drift from what `--pilot` actually does.

**All four regression anchors are checkable here**, not just two.
`REGRESSION_CHECKS` (`run.py:71-76`) is exactly the four `CLAUDE.md` names —
World services ≈50% (WLD), US ≈79% (USA), EU-27 ≈72% (EU27), India ≈31.5%
(IND) — and all four resolve inside the 7-row pilot output. Assert all four.

**Acceptance:** `python3 -m unittest discover pipeline/tests` passes with the
network unavailable (verified the way the probe above did it — patch
`socket.getaddrinfo` to raise — not merely by trusting the cache). The pilot
run reproduces `pipeline/tests/fixtures/expected/pilot_labor_dataset.csv` byte
for byte, and `pipeline/data/` is unmodified afterwards — asserted by
comparing its contents before and after, so a future refactor that redirects
output back into it fails the suite. All four `REGRESSION_CHECKS` pass within
tolerance. Changing a rounding call in `build.py` fails this test. The
committed fixture directory is under 1MB.

### R8. [ ] Regenerate the stale pilot expected output, and record why

`pipeline/data/pilot_labor_dataset.csv` cannot serve as R7's expected output as
committed: it has 87 columns against `run.COLUMNS`'s 89, still carrying
`early_career_white_collar_pct` and `data_year_early_career` — the columns
0002 R11 replaced when it was revised `[~]` to the career-stage profile — and
missing `prime_white_collar_pct`, `late_career_white_collar_pct`,
`prime_white_collar_year` and `late_career_white_collar_year`. It is a
pre-revision artifact. `global_labor_dataset.csv` is current at 89 and is
unaffected.

Regenerate it and add a test that the committed CSVs' headers match
`run.COLUMNS` exactly — the check that would have caught this drift when it
happened.

**This file is not R7's golden master.** An earlier draft of this spec had R8
commit it as R7's expected output; that is withdrawn, for the reason recorded
in R7 — the pilot run writes to this exact path, so using it as the expected
output makes the diff self-comparing. R8 stands on its own merits: the file is
a published artifact in the repo, it is stale, and the header check is the
guard that stops it going stale again. R7's expected output lives under
`pipeline/tests/fixtures/expected/`.

**Check whether PR #42 got there first.** #42 (`feat/0003-ai-native-sdlc`)
regenerates this same file as a side effect of `npm run verify` running the
pilot. If it merges before this spec is implemented, the column delta is
already applied, and R8's record must say the regeneration was inherited rather
than describe one it did not perform. The header test is still required either
way — that is the part #42 does not add.

**Acceptance:** the header of `pilot_labor_dataset.csv` equals `run.COLUMNS` in
both content and order, as does `global_labor_dataset.csv`. A test asserts this
for both files, and fails if either drifts. The pilot row for USA carries a
non-null `prime_white_collar_pct`. The implementation notes record the column
delta above and state whether this spec performed the regeneration or inherited
it from #42, so the change is auditable rather than silent.

### R9. [ ] The published invariants stay assertable

`build.validate()` already encodes the arithmetic that must hold — percentage
fields inside [0, 100], age bands summing to ~100, sector shares to ~100,
white-collar + blue-collar/service to 100. Test that it **catches** each
violation on a deliberately broken fixture, so the checker itself cannot rot
into returning an empty list.

**Acceptance:** a fixture with `white_collar_pct=60.0` and
`blue_collar_service_pct=60.0` produces a problem string naming the row and the
sum. A fixture with `lfp_rate_total=150.0` produces an out-of-range problem. A
clean fixture produces `[]`.

## Non-goals

- **Wiring the suite into CI.** That is #3, the companion issue — it adds the
  workflow that runs lint, build and `pipeline:pilot` on every PR. This spec
  makes the suite exist and pass locally; #3 makes it run on every push. R7 is
  written so that the suite is *CI-ready* (offline, small fixture) without
  taking on the workflow itself.
- **Fixing anything the tests expose.** If a test surfaces a real defect beyond
  R8's stale artifact, record it as a new issue rather than fixing it here.
  A suite whose first commit also changes behaviour cannot prove it changed
  nothing.

  Three changes to production code are in scope, and they are the exhaustive
  list: the `FIELD_TIERS` registry and its `export_app_json` entry (R3), the
  `report.py` / `squeeze_index` prose that must not contradict it (R3), and
  extracting the pilot scope and output filter out of `main()` into a helper
  the test can call (R7). None of the three alters a published figure, and R7's
  byte-identical diff is what proves it.
- **Testing the network layer.** `fetch.py`'s retry and gzip handling is
  deliberately out of scope; the suite runs offline against cached responses by
  design, and mocking HTTP would test the mock.
- **Testing the React app.** `src/` has no tests either, but that is a separate
  concern and lands with #22 / #23.
- **Porting anything to TypeScript.** This spec is the prerequisite for #21,
  not part of it. The suite is written in Python against the Python pipeline,
  and #21 must keep it passing — or replace it test-for-test.
- **Adding a test framework or any dependency.** Stdlib `unittest` only, per
  `CLAUDE.md`'s no-pip-installs rule. (#21 is the issue that revisits that
  rule; this spec lives under it.)
- **Filling ARM, NZL or SAU.** R6 tests the override *contract* with synthetic
  fixtures. The unfilled gaps stay unfilled.
