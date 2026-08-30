# 0009 — The app payloads cannot drift from the code that writes them

**Status:** in-review
**Depends on:** 0004 (the regression suite this extends, and whose `ff507b0`
introduced the drift); none blocking — the fix is additive and moves no figure.
**Issue:** [#57](https://github.com/apportico/who-gets-replaced-first/issues/57)

## Objective

`src/data/global_labor.json` has never been regenerated since the initial
commit, so it does not carry the `field_tiers` block `run.py:265` writes. The
question this spec lets us answer that we cannot today: **does the payload the
app receives still match the code that generates it?** Today nothing answers
that, and the reason is sharper than staleness — `pipeline/tests/test_tiers.py`
already carries six `AppPayload` tests asserting `field_tiers` is present,
complete, and correctly valued, and **all six pass against a committed file
that has no `field_tiers` key at all**, because `setUp` regenerates a payload
from two synthetic fixture rows into a temp file and asserts on that. The suite
tests the generator and never opens the artifact. So this is not a missing
guard; it is a guard aimed one inch to the left of the thing it names, which is
the same failure `test_report.py`'s docstring records for #54 and warns about
in its own earlier drafts.

## Source verification

Probed 2026-08-30 on `fix/0009-app-payload-drift` at `33fdcc5`, Python 3.13,
with the 80MB response cache present (`pipeline/raw/{eurostat,ilostat,worldbank}`).
Every row below is a command that was run, not an expectation.

| Source | Probed | Result |
|---|---|---|
| Committed `src/data/global_labor.json` | `json.load`, list top-level keys | `generated_from`, `sources`, `ai_exposure_weights`, `rows`. **No `field_tiers`.** 604,736 bytes; last touched at `9f75ad9`, the initial commit |
| `run.py` write site | `sed -n '250,280p'` | `export_app_json` writes `"field_tiers": {c: C.FIELD_TIERS[c] for c in keep}` at line 265, guarded by a `KeyError` for untiered columns. Confirms the issue's claim verbatim |
| **Full `npm run pipeline`, offline from cache** | 218 countries + 11 aggregates, exit 0, 4 anchors on target, 0 validation problems | **Exactly one tracked file changed: `src/data/global_labor.json`, 604,736 → 607,739 bytes (+3,003).** All 6 CSVs, `summary_report.md`, `validation_report.txt` and `outliers_for_review.csv` came back byte-identical |
| The delta, structurally | `json.load` both, compare key by key | **`field_tiers` added and nothing else.** `sources`, `ai_exposure_weights` and all **229 rows** compare equal. **No figure moves** |
| `field_tiers` contents | `Counter` over the regenerated block | **84 entries**, exactly the 84 keys of a row, 1:1 in both directions. DERIVED 27, `NOT_A_MEASUREMENT` 26, OFFICIAL 24, PROXY 4, MODELED 3 |
| `src/data/global_labor_timeseries.json` | same full run, `wc -c` | **326,519 bytes before and after — byte-identical, no drift.** The issue lists this file as unexamined; it is now examined and it is clean |
| **The existing guard, against the stale file** | `git checkout -- src/data/global_labor.json && npm run test:pipeline` | **114/114 pass, `OK`.** Including all six `test_tiers.py::AppPayload` tests. The suite is green against precisely the defect it appears to cover — this is the finding, not the staleness |
| Why it is green | Read `test_tiers.py:135-190` | `AppPayload.setUp` calls `run.export_app_json([fixtures.country("XXX"), fixtures.country("YYY")], tmp)` and asserts on the temp file. `src/data/global_labor.json` is never opened by any test in the suite |
| Offline reconstruction — `field_tiers` | Rebuilt from `run.COLUMNS` + `config.FIELD_TIERS`, compared to the true full-run output | **Identical.** It is a pure function of two in-tree constants and needs no rows, no cache and no network — so a guard on it is unconditional |
| Offline reconstruction — rows, byte-wise | Drove `export_app_json` from committed `global_labor_dataset.csv` the way `report.load()` does | **Fails: 13,096 cells come back as `str`** (9,490 should be `float`, 3,606 `int`). `report.load()` only maps `""` → `None`; it does not coerce types. Byte-identical offline regeneration is **not achievable** |
| Offline reconstruction — rows, by value | Same rows, keyed by `iso3`, compared under numeric normalisation | **0 of 19,236 cells disagree** (229 rows × 84 columns). The CSV carries all 84 `keep` columns. So the rows *are* checkable offline up to numeric equality, just not byte equality |
| Row order | Compared `iso3` sequences | **Not reconstructible.** The JSON is 218 `country` rows then `WLD`, 7 `region`, 3 `group` — and the countries are in neither `iso3` nor name order (the first divergence from `iso3` order is at index 199: the sequence runs `TUV, TZA` where sorted order puts `TWN` between them). `export_csv` sorts (aggregates first, then `iso3`); `export_app_json` does not sort at all. Order is whatever `run()` produced |
| Offline reconstruction — timeseries | Rebuilt `fields`/`years`/`series` from committed `global_labor_panel.csv` per `panel.py:163-172` | **Fully reconstructible: fields equal, 14 years equal, 226 series keys equal, 0 cells disagree** under the same normalisation |
| Payload header vs. its inputs | `payload["ai_exposure_weights"] == run.load_weights()`; `sources` against the literal at `run.py:266-272` | **Both agree today** — so widening R2 to the whole header is preventive, like R3, not a second live defect. `load_weights()` (`run.py:79-81`) is a plain read of in-tree `pipeline/ai_exposure_isco.json`, offline-reconstructible on exactly the terms `field_tiers` is. **No test in `pipeline/tests/` asserts on either payload key** |
| `global_labor_dataset.csv` coverage | Read `test_golden_master.py:47` and `test_columns.py:20-66` | **Values unguarded.** The golden master's `EXPECTED` is `pilot_labor_dataset.csv`, the 7-row pilot batch; `CommittedHeaders` does include the full dataset CSV but every assertion is on `header(name)`, which reads the first row only. Headers and order, no values |
| `verify` / CI reach | `cat scripts/verify.sh` | `npm run test:pipeline` is **unconditional** and documented as such; only the pilot is gated on `pipeline/raw/`. A test added under `pipeline/tests/` runs in a fresh clone with no network, and in CI |
| `verify` must not republish | `scripts/verify.sh:27-35` | The pilot writes to `mktemp -d` explicitly so that "verify passed" and "the committed dataset changed" are never the same event. **A guard here must compare and never write** |
| `pipeline/README.md` payload contract | `grep -n "field_tiers" pipeline/README.md` | **Lines 139-141 already state it**, including the 84-column filter and the `*_range` exclusion, almost verbatim. So the docs claim the block, `test_tiers.py` claims it, and only the artifact lacks it. **No line anywhere says the payloads are generated or must not be hand-edited** — `grep -i "regenerat|hand-edit"` returns one hit, line 15, and it is about `summary_report.md` |
| What the app actually reads | `grep -rn "global_labor" src --include='*.js' --include='*.jsx'` | **Three importers, not one.** `LaborPage.jsx:2` → `.rows` (line 11); `corridorStates.js:6` → `.rows` (line 42), keying on **`row_type` and `country_name`** to map the corridor board's colloquial names onto `iso3`; `laborPanel.js:4` imports the **timeseries** payload. So R4's guard protects two consumers and R3's protects a third. **Nothing in `src/` reads `field_tiers`, `sources` or `ai_exposure_weights`** |

### Two claims in the issue that the probes correct

1. The issue asks for "the same check for `global_labor_timeseries.json` — it
   was not examined here." It is now: that file is **byte-identical** after a
   full run. Its guard is preventive, not corrective, and R3 says so rather
   than implying a second defect exists.
2. The issue calls `field_tiers` "the tier map the app is meant to receive",
   and for the pipeline's intent that is right. But nothing in `src/` reads it,
   so shipping it does **not** put tiers in the UI. This spec makes the payload
   honest; rendering the tiers is #13/#14 and is a Non-goal here.

## Requirements

### R1. [ ] The committed app payload is what `run.py` writes today

`src/data/global_labor.json` is regenerated from a full `npm run pipeline` and
committed, so the file carries the `field_tiers` block.

**Tiers:** this requirement **produces no new figure**. It ships a metadata map
whose 84 values are drawn from `config.FIELD_TIERS`, the registry of record;
the map itself is provenance, not a measurement. Every row value is unchanged,
so no field's tier changes.

**Acceptance:**
- `python3 -c "import json;d=json.load(open('src/data/global_labor.json'));print(len(d['field_tiers']))"` prints `84`.
- The committed file is 607,739 bytes and `json.load` of it compares equal to
  the pre-change file on `sources`, `ai_exposure_weights` and all 229 `rows` —
  i.e. the diff adds `field_tiers` and changes nothing else. **Checkable with
  no cache**: serialising the block from `run.COLUMNS` + `config.FIELD_TIERS`
  gives 3,003 bytes against the current committed file, so any reviewer can
  re-derive `+3,003` and `607,739` without running the pipeline. Re-derived
  independently in review at `f8bc5d6`, to the byte.
- **Cache-gated:** `npm run pipeline` immediately after leaves
  `git status --porcelain` empty. This one needs the gitignored 80MB
  `pipeline/raw/`, so neither CI nor a fresh clone can execute it —
  `verify` skips the pilot for the same reason. A full run is inherently
  what R1 is; the two bullets above are the ones that survive a fresh clone.

### R2. [ ] A test opens the committed payload and fails when it is stale

A new test reads `src/data/global_labor.json` **from disk** and compares its
**whole non-`rows` header** — `generated_from`, `field_tiers`, `sources` and
`ai_exposure_weights` — against the same header rebuilt from `run.COLUMNS`,
`config.FIELD_TIERS` and `run.load_weights()`. Offline and unconditional, per
the probe showing every one of those needs no rows, no cache and no network.

`field_tiers` is the block #57 names, but scoping the guard to it would leave
the same defect class open for the other three, and `ai_exposure_weights` is
the one that matters most: `load_weights()` is a plain read of in-tree
`ai_exposure_isco.json`, so editing a weight without regenerating would ship a
**stale MODELED weight set to the app with nothing failing**. Those weights are
this project's own judgement, and the sensitivity analysis `CLAUDE.md` cites is
what backs the rank-order claim resting on them — a silently stale copy is a
worse outcome than a stale tier map. The probe confirms all four agree today,
so this half of R2 is **preventive**, like R3.

It must also assert the payload's row-key set equals its `field_tiers` key set,
so a column added to `COLUMNS` without a regeneration fails here rather than
shipping an unlabellable field to the app.

**Acceptance:**
- Reverting `src/data/global_labor.json` to its pre-R1 content makes
  `npm run test:pipeline` **fail**, naming `field_tiers` and #57. This is the
  bar `test_report.py` sets — the guard is verified by reintroducing the defect,
  because the existing six tests are green against it.
- Editing one weight in `pipeline/ai_exposure_isco.json` without regenerating
  the payload makes `npm run test:pipeline` **fail**. Verified by making the
  edit, not by inspection.
- The test passes in a checkout with `pipeline/raw/` absent and networking
  unavailable.
- It opens the file read-only; `git status --porcelain` is empty after the run.

### R3. [ ] The same guard for the timeseries payload

`src/data/global_labor_timeseries.json` gets an equivalent check, rebuilt from
the committed `global_labor_panel.csv` per `panel.py:163-172`: `fields` equal,
`years` equal, series keys equal, and every cell equal under numeric
normalisation.

This file has **no drift today** — it is byte-identical after a full run — so
this is a preventive guard, and it must be labelled as such rather than
implying a second defect was found.

**Acceptance:**
- The test passes unmodified against the current committed file.
- Deleting one `iso3` from the payload's `series`, or changing one value, makes
  `npm run test:pipeline` fail.
- Runs offline; writes nothing.

### R4. [ ] The row values are checked, not just the shape

R2 catches a stale tier map but not a moved number. The payload's 229 rows are
compared against committed `global_labor_dataset.csv` keyed by `iso3`, under the
numeric normalisation the probe validated (0 of 19,236 cells disagree today).

Byte identity is **out of scope and stated as such**: the probe found 13,096
cells that a CSV round-trip returns as strings, and a row order that is not
reconstructible from any in-tree file. Claiming byte identity here would be
claiming a check nothing can execute. Order is instead asserted structurally:
218 `country` rows followed by 11 aggregate rows.

**What this closes, and what it does not.** R4 compares the payload to
`global_labor_dataset.csv` — two artifacts from the same run, checked against
each other rather than either against the code. The CSV's *values* have no
in-tree guard: `test_golden_master.py:47` points `EXPECTED` at the 7-row
`pilot_labor_dataset.csv`, and `test_columns.py`'s `CommittedHeaders` asserts
only on `header(name)`. So R4 catches a hand-edited payload, and a payload not
regenerated when the CSV was; it **cannot** catch a payload and a CSV that are
stale together. That is 0007's byte-identity territory and a Non-goal here —
but R4 has to say so, or a reader concludes the rows are checked against the
pipeline. This spec's whole argument is about guards aimed one inch to the left
of what they name, and that discipline applies to its own requirements.

**Acceptance:**
- The test reports 0 disagreeing cells over 229 × 84 today.
- Editing one value in `src/data/global_labor.json` fails the suite.
- `[r["row_type"] for r in rows]` groups as `country` × 218, then `world` × 1,
  `region` × 7, `group` × 3 — contiguous and in that order.
- `row_type` and `country_name` are non-null on every `country` row.
  `corridorStates.js:42` keys on exactly this pair to resolve the corridor
  board's names to `iso3`, so the guard covers what the second consumer
  depends on rather than only what the first one renders.

### R5. [ ] The existing `AppPayload` tests say what they actually cover

`test_tiers.py::AppPayload` keeps its six generator-side tests — they are
correct about `export_app_json` — but its docstring records that it asserts on
a regenerated fixture payload and **not** on the committed artifact, and points
at the R2 test that does. Leaving it unannotated is what let a reader conclude
the artifact was covered.

**Acceptance:** `AppPayload`'s docstring names the committed file, says it does
not open it, and names the test class that does. `grep -c` for the R2 test
class name in `test_tiers.py` returns ≥ 1.

### R6. [ ] `pipeline/README.md` stops describing a payload that does not exist

The README is **not silent** here, which is the problem: lines 139-141 already
tell the reader the tiers "ship to the app in `global_labor.json` under
`field_tiers`, filtered to the 84 columns the payload actually carries". That
sentence is true of `run.py` and false of the committed file. So the drift has
three witnesses — the docs, the tests and the generator all describe a
`field_tiers` block that the artifact does not have — and only the artifact is
wrong.

R1 makes that sentence true. What the README still lacks is any statement that
the two app payloads are **generated**: there is exactly one regeneration line
in the file (line 15, `report.py`), and nothing tells the next person that
hand-editing `src/data/*.json` is the wrong move or which command republishes
them. Add that, and name the guard from R2-R4 so a reader knows what enforces it.

**Acceptance:**
- `pipeline/README.md` states that `src/data/global_labor.json` and
  `src/data/global_labor_timeseries.json` are generated by `npm run pipeline`,
  must not be hand-edited, and are enforced by the R2-R4 tests — naming the test
  module.
- No `grep` over `pipeline/README.md` passes today against a README that says
  none of those things, so the bullet above is non-vacuous on its own and R6
  needs no second criterion. An earlier draft added one asserting the committed
  payload carries its 84-entry `field_tiers` block — the right instinct in the
  wrong requirement: that is R1's outcome and R2's guard, and it never opened
  R6's own artifact. It would have let R6 pass or fail for reasons entirely
  outside its scope, and made R6 the only home for that assertion if R2 ever
  narrowed.

## Non-goals

- **Rendering tiers in the UI.** Nothing in `src/` reads `field_tiers` today
  and this spec does not change that. Shipping the map is a precondition;
  putting it in front of a reader is #13 and #14.
- **Byte-identical offline regeneration of the app payloads.** Ruled out by
  probe, not by preference: 13,096 cells lose their type through a CSV
  round-trip and the row order is not derivable from any in-tree file. R4
  checks values; spec 0007 R3/R4 own byte identity, against a full run.
- **Making `verify` regenerate the artifacts.** `verify.sh` writes pilot output
  to a temp dir precisely so verifying never republishes. The guards compare;
  regeneration stays a thing a person asks for.
- **Changing any figure, tier, or `config.FIELD_TIERS` entry.** The regenerated
  payload moves no number, and this spec must keep it that way.
- **Fixing spec 0007's R4 wording.** R1 makes its golden master current, which
  is what unblocks it; whether 0007 restates anything is 0007's call.
- **A general "every generated artifact has a guard" sweep.** `summary_report.md`
  got one in #56, the two app payloads get one here. The rest stay out of scope —
  but not because they are already covered. What 0004 actually gives is the pilot
  output byte-for-byte (`EXPECTED` = `pilot_labor_dataset.csv`) plus committed
  *headers* via `test_columns.py`. **`global_labor_dataset.csv`'s values are
  unguarded**, and that is the file R4 leans on, so the earlier wording of this
  bullet — that 0004's golden master covers the remaining outputs — was the
  sentence making R4's open edge invisible. Named here instead of ruled out.
