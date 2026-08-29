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
| A pilot fixture cache is small enough to commit | Sliced `pipeline/raw/` to the 6 `C.PILOT` areas (ARM, USA, DEU, CHN, IND, WLD) and measured | **Feasible.** World Bank 21 files 21.3MB → **0.47MB**; ILOSTAT 3 files 60MB → **1.80MB** (570 + 6,114 + 1,095 rows). **~2.27MB total uncompressed**, against an 80MB gitignored full cache. Committable, so a golden-master run works in CI. |
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
(`employed_total`, `employed_share_of_population_pct`, the ISCO band sums,
`entry_level_squeeze_index`) is `DERIVED`; the age-15–24 stand-in for
seniority (`young_white_collar_pct` and the entry-level family) is `PROXY`;
`ai_exposure_weighted_score` and `exposed_wage_bill_ppp` are `MODELED`.
Identifier and provenance columns (`iso3`, `country_name`, the `data_year_*`
and `data_quality_flag` fields) are not measurements and take no tier — the
registry must say so explicitly rather than leave them absent, so that "no
entry" always means "someone forgot".

Export the registry alongside the data so the app can read it: add it to the
app JSON payload written by `run.export_app_json()`.

**Acceptance:** `set(FIELD_TIERS) == set(run.COLUMNS)` — currently 89 columns —
asserted by a test, so adding a column to `COLUMNS` without a tier fails the
suite. Every value is in the closed set or `NOT_A_MEASUREMENT`. A test asserts
the four anchors above by name. The app JSON carries a `field_tiers` key whose
keys match the rows' keys.

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

Commit the 6-area slice of the response cache measured above (~2.27MB) as
`pipeline/tests/fixtures/raw/`, and a test that runs the real pilot pipeline
against it with no network and diffs the result against a committed expected
CSV. Unit tests over pure functions will not catch a change in number
formatting or column order; this will, and it is the proof #21 needs to show
its TypeScript port changed nothing.

The fixture must be a genuine slice of the real cached responses — filtered,
never hand-written — so it exercises the real parsing paths, including the
messy ones: Armenia's occupation series ending 2017, and China's and India's
partial coverage.

The `[validate]` anchors must hold: US services ≈79%, India ≈31.5%.

**Acceptance:** `python3 -m unittest discover pipeline/tests` passes with the
network unavailable (verified the way the probe above did it — patch
`socket.getaddrinfo` to raise — not merely by trusting the cache). The pilot
run reproduces the expected CSV byte for byte. Changing a rounding call in
`build.py` fails this test. The fixture directory is under 3MB.

### R8. [ ] Regenerate the stale pilot expected output, and record why

`pipeline/data/pilot_labor_dataset.csv` cannot serve as R7's expected output as
committed: it has 87 columns against `run.COLUMNS`'s 89, still carrying
`early_career_white_collar_pct` and `data_year_early_career` — the columns
0002 R11 replaced when it was revised `[~]` to the career-stage profile — and
missing `prime_white_collar_pct`, `late_career_white_collar_pct`,
`prime_white_collar_year` and `late_career_white_collar_year`. It is a
pre-revision artifact. `global_labor_dataset.csv` is current at 89 and is
unaffected.

Regenerate it, commit it as the expected output, and add a test that the
committed CSVs' headers match `run.COLUMNS` exactly — the check that would have
caught this drift when it happened.

**Acceptance:** the header of `pilot_labor_dataset.csv` equals `run.COLUMNS` in
both content and order, as does `global_labor_dataset.csv`. A test asserts this
for both files. The regenerated pilot row for USA carries a non-null
`prime_white_collar_pct`. The spec's implementation notes record the column
delta above, so the change is auditable rather than silent.

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
