# 0004 — Pipeline regression test suite

**Status:** done
**Depends on:** none
**Issue:** #2
**Completed:** 2026-08-30 — 8 done · 1 revised. 107 tests, offline, 0.29s.
**Amended:** 2026-08-30 after @syymza's re-review of `ab27337` — R2's acceptance
clause named an assertion that cannot fail, R7 shrank once #42 landed, and R8's
"inherit from #42" branch was factually wrong and inverted the requirement.
**Approved:** 2026-08-29 — @syymza, PR #43, re-review at `b4eed82`. Moved draft -> in-review -> approved; all four review findings resolved before approval, and the `setUpClass` refinement landed in `fcaf633`.

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

### R1. [x] Derived arithmetic is pinned to known inputs and known outputs

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

**Done (2026-08-30):** `test_derive.py` — 16 tests. `employed_total == 900` and `employed_share_of_population_pct == 18.0` reproduced; ISCO bands summed from distinct non-round values (34.90 / 18.78 / 65.10, partitioning to 100.0). Mutation check run: flipping `1 -` to `1 +` in `build.py:282` fails 3 tests (`1100 != 900`, `22.0 != 18.0`). `num()` and `latest()` covered, including that a measured `0.0` is not treated as missing.

### R2. [x] A missing input produces a null and a flag — never a zero, never a guess

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
`assertNotEqual(row["white_collar_pct"], 0.0)` passes. (An earlier revision of
this clause named `assertIsNot`, which **cannot fail** here — the pipeline's
zero comes out of `round(sum(...), 4)`, a freshly allocated float that is never
the same object as the literal, so the assertion passes even when the value is
`0.0`. Corrected 2026-08-30 after review; equality is the check that does the
work.) A row with no population,
no labour force and no ISCO yields a flag beginning `sparse — `. Deleting the
`if have_isco else None` guard makes the suite fail rather than emit `0.0`.

**Done (2026-08-30):** `test_nulls.py` — 11 tests. A row with `data_year_occupation=None` and ISCO groups present yields `white_collar_pct is None`; the all-null-groups row — the real production shape — also yields `None`. Mutation check run: removing the `if have_isco else None` guard fails with `AssertionError: 0.0 is not None` and `30.0 is not None`, i.e. it fabricates exactly the number the requirement names. `quality_flag` covered for complete / partial / sparse, stale vintage and ISCO-88 fallback.

### R3. [x] Every emitted field carries a tier, in a registry the tests can read

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

**Done (2026-08-30):** `config.FIELD_TIERS` — 89 entries, exactly matching `run.COLUMNS`: 24 OFFICIAL, 27 DERIVED, 4 PROXY, 3 MODELED, 31 NOT_A_MEASUREMENT. `test_tiers.py` — 21 tests. Both assertions hold: `set(FIELD_TIERS) == set(run.COLUMNS)` (89) and `set(payload["field_tiers"]) == set(keep)` (84). Mutation check run: appending an untiered column to `COLUMNS` fails the registry test *and* makes `export_app_json` raise, so an untiered column cannot ship. That surfaced as a bare `KeyError` from a dict comprehension, so a guard was added naming the offending columns and pointing at `NOT_A_MEASUREMENT`. One finding while assigning tiers: the ISCO percentage shares are `DERIVED`, not `OFFICIAL` — ILOSTAT publishes headcounts in thousands and `_apply_occupation` computes `100 * group / base`, so the shares are ours; only `isco_armed_forces_thousands` passes through unchanged. Prose aligned at `report.py:363` and `build.py:353`, and asserted by `ProseAgreesWithRegistry`. Documented in `pipeline/README.md` under *Field tiers*, where the misleading "6-area batch" description of `--pilot` was also corrected.

### R4. [x] Aggregates are weighted, and their coverage is published

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

**Done (2026-08-30):** `test_aggregates.py` — 12 tests. 900 @ 20.0% and 100 @ 80.0% yields `26.0`, asserted `!= 50.0`; adding a null member with 100 employed holds `26.0` and sets `isco_coverage_pct_of_employment == 90.91`; an all-null fixture yields `None` and a `0/2 members with ISCO data` flag.

### R5. [x] A row is never presented as a single-year snapshot

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

**Done (2026-08-30):** `test_vintages.py` — 9 tests. Population 2025 and occupation 2017 both survive on one row, as do four differing vintages at once. Aggregate over 2017 and 2023 members yields `data_year_occupation == 2023` with `data_year_occupation_range == "2017-2023"`; all five tracked vintage fields carry a span. `latest({2020: 5.0, 2023: None, 2021: 7.0})` returns `(7.0, 2021)`.

### R6. [x] An override without a citation is refused, not merged

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

**Done (2026-08-30):** `test_overrides.py` — 12 tests, all fixtures written to a `tempfile.TemporaryDirectory()`. Dropping any one of the six required keys leaves the field at its pre-override value and `data_source_override` at `None` — parameterised over all six via `subTest`. A complete entry sets the value and tags `white_collar_pct=42.5 (2024, Test Statistical Office)`. An unknown ISO3 is skipped without raising. Tests over the committed `manual_overrides.json` pass with `overrides == {}` and assert ARM, NZL and SAU stay documented in `_unfilled_gaps` rather than filled.

### R7. [~] A golden-master pilot run, offline, in CI

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
into a `tempfile.TemporaryDirectory()` in **`setUpClass`**, not `setUp` — the
expansion is 18.32MB, so a per-method `setUp` would pay it again for every test
in the class. This keeps every row of the
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
  the run's output to a second temp directory. **Only `fetch.RAW` needs
  patching.** #42 (merged 2026-08-29T20:06Z, after this requirement was
  written) added `--out-dir` to `main()` and made `run()` return a fifth value,
  `failures`, already evaluated against the `REGRESSION_CHECKS` tolerances. So
  the output side is a supported argument rather than a patched constant, and
  the anchors are read from `failures` rather than scraped from stdout. Do not
  let the run touch `pipeline/data/` by either route.
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

**Revised (2026-08-30):** the requirement got *smaller* than written. It specified patching both `fetch.RAW` and `run.DATA`; #42 merged after it was written and supplied the output side properly — `--out-dir` on `main()`, and `run()` returning `failures` already evaluated against the tolerances. So the built version patches `fetch.RAW` only, passes an explicit path to `export_csv`, and asserts `failures == []` instead of scraping stdout. Original intent unchanged: the run must not write where the master is compared from. Requirement text above rewritten to match.

**Done (2026-08-30):** `test_golden_master.py` — 15 tests, plus `make_fixture.py` committed so the slice is reproducible rather than an opaque blob. Fixture is **0.68MB gzipped** (18.32MB raw), inside the 1MB bound, sliced by area only and covering all 32 areas `--pilot` fetches. The whole suite is 107 tests in 0.29s.

The fixture run reproduces `fixtures/expected/pilot_labor_dataset.csv` byte for byte, and — the cross-check the plan's risk section called for — that expected file is itself **byte-identical to the output of a real run against the full 80MB cache**, verified with `cmp`. So the slice is faithful, not merely self-consistent. Offline is proven rather than assumed: `getaddrinfo` is patched to raise for the duration, and the run logs 24 cache hits and 0 fetches. All four anchors hold — WLD 48.2, USA 79.6, EU27 72.9, IND 32.6 — asserted via the `failures` list `run()` now returns (a #42 addition), so no stdout scraping.

Mutation check run: changing `white_collar_pct`'s rounding from 4 to 2 decimals fails with `line 2 differs`. The self-comparison failure mode is now structurally impossible — output goes to a `TemporaryDirectory` and the master lives under `fixtures/expected/`, a path nothing writes to — and `test_pipeline_data_directory_is_untouched` guards it with a content digest, verified sensitive to a one-line rewrite.

Two parts of the plan were already done upstream: #42 added `--out-dir`, which is the injectable output the review asked for, and changed `run()` to return `failures` as a fifth value. `pilot_scope()` and `pilot_rows()` were extracted from `main()` so the test drives exactly what `--pilot` drives.

### R8. [x] Regenerate the stale pilot expected output, and record why

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

**#42 does not regenerate this file — R8 must.** An earlier revision of this
requirement said #42 might get there first. That was wrong, and it inverted the
requirement. #42 does the opposite: it added `--out-dir` and pointed
`scripts/verify.sh` at a `mktemp -d` *precisely so* verify never rewrites a
tracked artifact. Confirmed at merged `main` on 2026-08-30 — the committed
`pilot_labor_dataset.csv` is still 87 columns with both pre-R11 fields. Left
uncorrected, an implementer could run verify, see green, and conclude the file
was already fixed. There is no inherit branch: regenerate it here. The header
test is required regardless — that is the part #42 does not add.

**Acceptance:** the header of `pilot_labor_dataset.csv` equals `run.COLUMNS` in
both content and order, as does `global_labor_dataset.csv`. A test asserts this
for both files, and fails if either drifts. The pilot row for USA carries a
non-null `prime_white_collar_pct`. The implementation notes record the column
delta above, so the change is auditable rather than silent.

**Done (2026-08-30):** regeneration **performed by this spec, not inherited**. #42 merged 2026-08-29T20:06Z but left the file stale — `origin/main`'s copy is still 87 columns and still carries both retired columns, so the `npm run verify` side effect the review anticipated did not materialise. Regenerated here via `npm run pipeline:pilot`: 7 rows x 89 cols, header equal to `run.COLUMNS` in content and order, as is `global_labor_dataset.csv`. USA now carries `prime_white_collar_pct = 64.1707` and `late_career_white_collar_pct = 63.4621`; `early_career_white_collar_pct` and `data_year_early_career` are gone. `test_columns.py` — 7 tests, asserting both headers, naming the two retired columns so their return is a failure rather than an archaeology exercise, and pinning the 7 pilot rows including EU27. Drift check run: renaming one header column back to `early_career_white_collar_pct` fails 3 tests and errors a fourth. All four regression anchors passed on the regenerating run — WLD 48.2, USA 79.6, EU27 72.9, IND 32.6 — with 0 range/consistency problems.

### R9. [x] The published invariants stay assertable

`build.validate()` already encodes the arithmetic that must hold — percentage
fields inside [0, 100], age bands summing to ~100, sector shares to ~100,
white-collar + blue-collar/service to 100. Test that it **catches** each
violation on a deliberately broken fixture, so the checker itself cannot rot
into returning an empty list.

**Acceptance:** a fixture with `white_collar_pct=60.0` and
`blue_collar_service_pct=60.0` produces a problem string naming the row and the
sum. A fixture with `lfp_rate_total=150.0` produces an out-of-range problem. A
clean fixture produces `[]`.

**Done (2026-08-30):** `test_validate.py` — 10 tests. `white_collar_pct=60.0` with `blue_collar_service_pct=60.0` produces `BAD: white+blue collar = 120.00, not 100`; `lfp_rate_total=150.0` and `-5.0` both produce `outside [0,100]`; age bands and sector shares caught at 115.00 and 125.00. A clean row and an all-null row both produce `[]`, and the tolerances that allow real-world rounding are pinned.

## Implementation Plan

**Planned:** 2026-08-30

Two findings from reading the pilot path close over the fixture's shape, and
both were checked rather than assumed:

- **`countries.json` ships whole, not sliced.** `build_reference` (`build.py:41`)
  iterates all 295 areas from `fetch.wb_country_metadata()` and filters by scope
  afterwards, and it keys on `id`, not the `countryiso3code` the indicator slice
  filters on. 0.11MB raw / **0.01MB gzipped**, so shipping it intact is free.
- **The pilot never touches Eurostat.** `crosscheck.eurostat_check` and
  `crosscheck.sensitivity` are called only in `main()`'s full branch, never from
  `run(scope, "pilot")`. The 0.11MB Eurostat cache is therefore dead weight in
  the fixture and is excluded.

Net fixture ≈ **0.68MB gzipped**, inside R7's 1MB bound. Reconciling that
against the 0.78MB in the source-verification table: 0.78 − 0.11 (Eurostat,
dropped) + 0.01 (`countries.json`, added whole) = 0.68. `make_fixture.py`
prints the measured total on every run.

### Files to create

| Path | Purpose | Req |
|---|---|---|
| `pipeline/tests/__init__.py` | Package marker for `unittest discover` | — |
| `pipeline/tests/context.py` | Puts `pipeline/` on `sys.path` once — the modules import flat (`import config as C`) | — |
| `pipeline/tests/fixtures.py` | Shared synthetic row builders, so nine modules do not each hand-roll a row | — |
| `pipeline/tests/test_derive.py` | Arithmetic, `num()`, `latest()` | R1 |
| `pipeline/tests/test_nulls.py` | Null propagation, the `have_isco` gate, `quality_flag` | R2 |
| `pipeline/tests/test_tiers.py` | `FIELD_TIERS` completeness, closed set, anchors, payload subset | R3 |
| `pipeline/tests/test_aggregates.py` | `_wavg`, `make_aggregate`, coverage | R4 |
| `pipeline/tests/test_vintages.py` | Per-field years, `*_range` spans | R5 |
| `pipeline/tests/test_overrides.py` | Six-key contract, temp-file fixtures | R6 |
| `pipeline/tests/test_golden_master.py` | Offline pilot run, byte diff, four anchors | R7 |
| `pipeline/tests/test_columns.py` | Committed CSV headers vs `COLUMNS` | R8 |
| `pipeline/tests/test_validate.py` | `validate()` catches each violation | R9 |
| `pipeline/tests/make_fixture.py` | Regenerates the fixture from a full `pipeline/raw/` — committed so the slice is reproducible rather than a mystery blob | R7 |
| `pipeline/tests/fixtures/raw/**.gz` | 32-area gzipped slice, ~0.68MB | R7 |
| `pipeline/tests/fixtures/expected/pilot_labor_dataset.csv` | Golden master, on a path nothing in the pipeline writes to | R7 |

### Files to modify

| Path | Change | Req |
|---|---|---|
| `pipeline/config.py` | Add `FIELD_TIERS` (89 entries) and the `NOT_A_MEASUREMENT` sentinel | R3 |
| `pipeline/run.py` | Export `field_tiers` filtered to `keep` in `export_app_json`; extract the pilot scope and output filter out of `main()` into a helper the test can call | R3, R7 |
| `pipeline/report.py:363` | `DERIVED composite` -> `MODELED` for the squeeze index | R3 |
| `pipeline/build.py:353` | `squeeze_index` docstring "DERIVED not measured" -> MODELED | R3 |
| `pipeline/data/pilot_labor_dataset.csv` | Regenerate to 89 columns | R8 |
| `pipeline/README.md` | Document `FIELD_TIERS`, how to run the suite, and that `make_fixture.py` needs a populated `raw/` | R3, R7 |

### Sequence

1. **Scaffold** — `tests/`, `context.py`, `fixtures.py`. Enabler for everything below.
2. **R1, R2, R4, R5, R9** — pure-function tests over synthetic rows. Zero
   production changes, so they land and prove themselves before anything is
   touched. R2 first within the group; it is the one that matters most.
3. **R6** — override contract, temp-file fixtures only.
4. **R3** — registry, app-JSON export, prose alignment. The first production change.
5. **R8** — check whether #42 landed the regeneration; regenerate if not; add the header test.
6. **R7** — `make_fixture.py`, commit the slice, golden master. Last, because it
   locks in output that steps 4 and 5 change.


### Requirement mapping

| Req | How it will be satisfied | Where | How acceptance is checked |
|---|---|---|---|
| R1 | `derive()` over synthetic rows with hand-computed values | `test_derive.py` | `employed_total == 900`, `share == 18.0`; flipping `1 -` to `1 +` fails |
| R2 | Row with `data_year_occupation=None` and ISCO groups present | `test_nulls.py` | `white_collar_pct is None`, not `0.0`; flag prefix `sparse — `; deleting the `have_isco` guard fails |
| R3 | `FIELD_TIERS` in config, two distinct assertions | `config.py`, `run.py`, `test_tiers.py` | `set(FIELD_TIERS)==set(COLUMNS)` (89); `set(payload["field_tiers"])==set(keep)` (84); five anchors incl. squeeze == MODELED |
| R4 | 900@20.0 + 100@80.0 fixture, then a null member | `test_aggregates.py` | `26.0` not `50.0`; coverage `90.91`; all-null yields `None` |
| R5 | Mixed-vintage row; two-member aggregate | `test_vintages.py` | 2025/2017 both survive; range `"2017-2023"`; `latest(...) == (7.0, 2021)` |
| R6 | Temp-file override JSON, complete and incomplete entries | `test_overrides.py` | Missing `retrieved` leaves the field unchanged; complete entry tags `data_source_override`; real file's `overrides == {}` passes |
| R7 | Gzipped 32-area fixture into a tempdir; `fetch.RAW` and output both redirected | `test_golden_master.py`, `make_fixture.py`, `run.py` | Byte-identical against `expected/`; `pipeline/data/` unchanged afterwards; four anchors pass; DNS patched to raise |
| R8 | Regenerate plus the header test | `pilot_labor_dataset.csv`, `test_columns.py` | Both CSV headers equal `COLUMNS` in content and order; USA carries a non-null `prime_white_collar_pct` |
| R9 | Deliberately broken fixtures | `test_validate.py` | 60+60 yields "white+blue collar = 120.00"; `lfp_rate_total=150.0` yields a range problem; clean yields `[]` |

### Tier and vintage handling

No new *numbers* are produced — this spec adds tests plus a registry over
fields that already exist. The one tier change is `entry_level_squeeze_index`:
`DERIVED` -> **`MODELED`**, recorded in `FIELD_TIERS` (`config.py`), in the app
JSON payload, and in the prose at `report.py:363` and `build.py:353`.
Provenance columns (`iso3`, the `data_year_*` family, `data_quality_flag`) take
the explicit `NOT_A_MEASUREMENT` sentinel, so an absent entry always means
someone forgot rather than that the field is exempt. No vintage changes — R5
asserts only what is already recorded.

### Validation

R7 runs the real pilot and asserts all four `REGRESSION_CHECKS` — WLD ~50%,
USA ~79%, EU27 ~72%, IND ~31.5% — reading the values from the rows `run()`
returns rather than scraping stdout, so `run()` itself needs no change.
`[crosscheck]` and `[sensitivity]` are not reachable from a pilot run, so they
stay uncovered by this suite; that is a stated gap, not an omission.

### Risks

- **Byte-identical is strict.** If `pipeline/data/` and the fixture disagree on
  any float repr, R7 fails on a difference that is not a regression. Mitigation:
  generate `expected/` from the fixture run itself, then verify it matches the
  committed full-run CSV across the seven shared rows.
- **PR #42 collision.** ~~It regenerates `pilot_labor_dataset.csv` as a side
  effect of `npm run verify`.~~ **Wrong — corrected 2026-08-30.** #42 points
  `scripts/verify.sh` at a `mktemp -d` so verify never rewrites a tracked
  artifact; merged `main` still carries the stale 87-column file. The real
  collision was `specs/README.md`'s index table and `pipeline/run.py`, both
  resolved by merging `main` in `fca877a`.
- **`make_fixture.py` needs a populated `pipeline/raw/`**, which is gitignored
  and absent from a fresh clone. The script is committed so the slice is
  reproducible, but only by someone who has run the full pipeline once. Stated
  in `pipeline/README.md`.
- **Registry drift is the point, and it will bite.** `set(FIELD_TIERS) ==
  set(COLUMNS)` means any future spec adding a column fails the suite until a
  tier is assigned. Intended, and worth saying in the PR so it does not read as
  a broken test.

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
