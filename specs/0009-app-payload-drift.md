# 0009 — The app payloads cannot drift from the code that writes them

**Status:** done
**Depends on:** 0004 (the regression suite this extends, and whose `ff507b0`
introduced the drift); none blocking — the fix is additive and moves no figure.
**Issue:** [#57](https://github.com/apportico/who-gets-replaced-first/issues/57)
**Approved:** 2026-08-30 — @syymza, PR [#58](https://github.com/apportico/who-gets-replaced-first/pull/58),
at `0ae3338`. Moved draft -> in-review -> approved. Three review rounds, ten
findings, all re-run at HEAD by the reviewer rather than read. Every finding
held except one assertion count, which was corrected back and conceded.

**Where the risk sits.** Six of the ten findings were about a guard or a
criterion that could not fail on the thing it named — the defect this spec
exists to remove — and three of those were in text written while fixing the
previous instance. R2 was re-specified in all three rounds: widened from
`field_tiers` to the whole header, then changed from an ingredient list to
driving `export_app_json([], tmp)` because two of the four keys are literals no
constant can rebuild, then corrected because the widening carried its
quantifiers along unchecked. **The author recommends** the R2 test be written
against the committed artifact first, and each guard demonstrated failing by
reintroducing its defect before the requirement is marked `[x]` — the bar
`pipeline/tests/test_report.py` sets, and the one the six pre-existing
`AppPayload` tests did not meet.

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
| Payload header vs. the generator | `export_app_json([], tmp)`, then compared its non-`rows` keys to the committed payload's | **Works, and three of the four agree today — not four.** The generator returns `generated_from`, `field_tiers`, `sources`, `ai_exposure_weights` with `rows: []`; the committed payload has **three** non-`rows` keys, and `field_tiers` is absent, which is this table's first row and the spec's founding premise. `generated_from`, `sources` and `ai_exposure_weights` are each equal, so **those three are preventive**, like R3; the `field_tiers` half is **corrective**, and is the only half that is. No rows means no cache and no network, so R2's guard stays unconditional either way. **No test in `pipeline/tests/` asserts on those three** — grep returns nothing for any of them. It does not hold for `field_tiers`: `test_tiers.py::AppPayload` asserts on it six times (lines 150, 155, 156, 162, 168 and the loop at 171) and passes anyway, which is the finding the Objective is built on |
| Why the header must be driven, not rebuilt | `grep -rn "SOURCES" pipeline/*.py` | **No match.** `generated_from` (`run.py:260`) and `sources` (`run.py:266-272`) are literals inside `export_app_json`; only `field_tiers` and `ai_exposure_weights` come from constants (`run.COLUMNS` + `config.FIELD_TIERS`, and `load_weights()` at `run.py:79-81`, a plain read of in-tree `ai_exposure_isco.json`). An earlier draft of this row checked `sources` *against the literal* — a transcription, not a rebuild, and exactly the copy that would go stale silently in a test |
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

### R1. [x] The committed app payload is what `run.py` writes today

**Done (2026-08-30):** `npm run pipeline` regenerated the payload; 4 anchors on
target, 0 validation problems. Every criterion run:

```
field_tiers entries: 84
bytes:              607739
keys added: ['field_tiers'] | removed: []
sources equal: True   ai_exposure_weights equal: True
all 229 rows equal: True | n: 229
```

The cache-gated bullet holds too: the run left every other tracked artifact
byte-identical, so `git status --porcelain` showed only this file.

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

### R2. [x] A test opens the committed payload and fails when it is stale

**Done (2026-08-30):** `test_app_payloads.CommittedHeaderMatchesTheGenerator`.
All three failure bullets demonstrated by making the edit, not by inspection:

```
pre-R1 payload   -> missing=['field_tiers'] ... "A missing `field_tiers` is #57"
weight edited    -> changed=['ai_exposure_weights']
sources edited   -> changed=['sources']          (the ONLY failure in the suite)
```

That third run is the load-bearing one: nothing else in 125 tests catches a
stale `sources` literal, which is exactly the half a transcribed expected value
would have left green.

**Caveat found while running these, worth recording because this requirement
prescribes the edit-run-revert cycle that triggers it:** reverting `run.py` with
`git checkout --` after an edit of the *same byte length* can leave a stale
`__pycache__/run.cpython-313.pyc` in play, so the suite keeps reporting
`changed=['sources']` against a reverted file. `find pipeline -name __pycache__
-exec rm -rf {} +` clears it. Not a defect in the guard or the data — but it
looks exactly like one, and it cost a diagnosis here.

A new test reads `src/data/global_labor.json` **from disk** and compares its
**whole non-`rows` header** — `generated_from`, `field_tiers`, `sources` and
`ai_exposure_weights` — against the header the generator produces, obtained by
calling **`export_app_json([], tmp)`** and reading back its non-`rows` keys.

**Where the expected header comes from is part of the requirement, not an
implementation detail.** Only two of the four keys can be rebuilt from
constants: `field_tiers` from `run.COLUMNS` + `config.FIELD_TIERS`, and
`ai_exposure_weights` from `run.load_weights()`. `generated_from`
(`run.py:260`) and `sources` (`run.py:266-272`) are literals inside
`export_app_json` with no module-level constant — `grep -rn "SOURCES"
pipeline/*.py` returns nothing. So an implementer given an ingredient list
would transcribe the `sources` dict into the test, and **that copy is a third
witness that goes stale silently**: edit the literal in `run.py` without
regenerating, and the test's copy agrees with the committed payload while both
disagree with the code, suite green. That is this spec's own named failure,
reproduced inside its own guard.

Driving the generator instead transcribes nothing and covers all four keys in
one call. It stays offline and unconditional: the header needs no rows, so
`export_app_json([], tmp)` needs no cache and no network — verified, it returns
all four keys with `rows: []`. Three of them equal the committed payload's;
`field_tiers` does not, because the committed payload does not have it. It writes
only to a temp path, so R2's read-only criterion holds, and
`test_tiers.py::AppPayload.setUp` already drives `export_app_json` into a temp
file for the same reason. Lifting the two literals to module constants would
also work but is a code change this spec has scoped out, and buys nothing this
does not.

`field_tiers` is the block #57 names, but scoping the guard to it would leave
the same defect class open for the other three, and `ai_exposure_weights` is
the one that matters most: `load_weights()` is a plain read of in-tree
`ai_exposure_isco.json`, so editing a weight without regenerating would ship a
**stale MODELED weight set to the app with nothing failing**. Those weights are
this project's own judgement, and the sensitivity analysis `CLAUDE.md` cites is
what backs the rank-order claim resting on them — a silently stale copy is a
worse outcome than a stale tier map. The probe confirms those three agree
today, so **that** part of the widening is preventive, like R3. The
`field_tiers` half is **corrective** — it is absent from the committed payload,
which is what #57 is and what R2's first acceptance bullet assumes when it
requires that reverting the payload fails the suite naming `field_tiers`. An
earlier draft said the probe confirmed all four, which cannot be true of a
spec whose premise is that one of them is missing.

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
- Editing the `sources` literal in `run.py` without regenerating the payload
  makes `npm run test:pipeline` **fail**. Also verified by making the edit.
  Without this bullet the two above exercise `field_tiers` and
  `ai_exposure_weights` and nothing exercises the other half of the widening —
  and it is the half a transcribed expected value would leave green.
- The test passes in a checkout with `pipeline/raw/` absent and networking
  unavailable.
- It opens the file read-only; `git status --porcelain` is empty after the run.
  Observed by `GuardsDoNotWriteWhatTheyCheck`, which digests `src/data/` in
  `setUpModule`, runs the three guard classes, and compares. **Two vacuous
  versions preceded it**, both caught rather than reasoned about: the first
  stat-ed the payloads around a `json.load` and so asserted only that reading
  does not write; the second took its baseline inside the test, where
  alphabetical ordering means the guards have already run, so a guard writing a
  deterministic file was baked into the baseline and recreated identically.
  A deliberate write into `src/data/` from a guard's `setUp` passes the second
  and fails the third. The **fourth** version watches `pipeline/data/` as well
  and carries mtimes, not just content — see below.
- The clean-tree criterion is observed by that guard **and nothing else**:
  `git status --porcelain` appears nowhere in `scripts/verify.sh` or in CI, and
  `test_golden_master`'s own `run.DATA` guard takes its baseline in
  `setUpClass`, after discovery has already run `test_app_payloads` first. So
  the criterion is exactly as strong as this one class, which is why it watches
  both trees: `CommittedTimeseriesMatchesThePanel` drives `panel.export`, and
  `panel.py:154` writes `global_labor_panel.csv` unconditionally — a real write
  of the CSV another guard compares against, kept out of the tracked tree only
  by the `tmp` argument.
- **A content digest does not observe that write.** Handing `panel.export`
  `run.DATA` rewrites the panel CSV from rows read out of that same file, and
  the round-trip is byte-perfect — `_read_csv` maps `""` to None and the
  DictWriter writes None back as `""` — so the digest is unchanged and
  `git status` is clean. Probed: the digest-only version stayed **green**
  against exactly that defect. The guard therefore records mtimes too. The
  write's harmlessness is accidental and holds only while the CSV round-trips
  byte-perfectly, which is a property of today's values rather than a guarantee;
  the float-repr divergences spec 0007 catalogued are the obvious way to lose
  it.
- `test_field_tiers_covers_every_key_a_row_ships` unions all 229 rows rather
  than reading `rows[0]`. One row suffices against the generator, which builds
  every row from the same `keep` list, but this class opens the artifact and the
  threat model R6's README paragraph names is a hand-edit, which can add a key
  to any row. Probe: a key added to row 5 was invisible before and now fails
  with `'hand_edited_extra'`.

### R3. [x] The same guard for the timeseries payload

**Done (2026-08-30):** `test_app_payloads.CommittedTimeseriesMatchesThePanel`,
four tests. Passes unmodified against the committed file, confirming the
preventive framing. Both negative checks demonstrated:

```
dropped series key ARE      -> test_every_series_key_is_present_and_no_extras FAILS
changed ARE/2013[4] by 1.0  -> "disagrees with ... global_labor_panel.csv at [('ARE','2013')]"
dropped ARE's 2013 YEAR     -> "disagrees with ... at [('ARE','years')]"
```

**Revised twice in review, and the second revision is the one that matters.**

The first version iterated the committed payload's own years, so a country-year
*dropped from the payload* was never visited and all four tests passed — a
partially regenerated payload passing the guard that exists to catch one. R3's
acceptance bullet ("deleting one `iso3`") held as written; R3's own wider summary
("every cell equal") did not, and the summary is the claim a reader believes.

The deeper problem was that the rebuild **transcribed** `panel.export`'s
assembly by hand — precisely what R2's prose forbids for the header, for
precisely the reason it gives. Change how `panel.export` builds the payload
without regenerating, and the transcribed copy still agrees with the committed
file while both disagree with the code. So R3 now drives `P.export(rows, [],
tmp, app_path)`, which takes both output paths and so writes only under the temp
dir. That transcribes nothing and subsumes the year gap: comparing two real
payloads catches a dropped country-year in both directions, and fails with a
message instead of raising `KeyError` on the inverse case. Verified it
reproduces the committed payload exactly under `_num` before adopting it.

R3's class docstring now also carries the payload-versus-CSV caveat R4 had and
it did not — the rows still come from the committed panel CSV, so the input side
has the same edge. The asymmetry was an omission, not a decision.

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

### R4. [x] The row values are checked, not just the shape

**Done (2026-08-30):** `test_app_payloads.CommittedRowsMatchTheDataset`, four
tests. 0 disagreeing cells over 229 x 84. Negative check demonstrated:

```
ABW.lat 12.5167 -> 13.5167 : "disagrees with ... global_labor_dataset.csv at [('ABW','lat')] (1 cells)"
```

Row grouping asserted with `itertools.groupby`, which collapses only adjacent
runs, so a country row after the aggregates fails rather than passing on a
count. `country_name` asserted non-null on all 218 country rows — half the pair
`corridorStates.js:42` keys on. The `row_type` half was dropped in review as
vacuous: the loop filters on `row_type == "country"` before asserting, so it
could not have been null there, and
`test_row_types_are_contiguous_and_in_the_written_order` covers it for real.

Also added in review: `setUp` asserts the dataset CSV has no duplicate `iso3`.
Keying by `iso3` collapses one silently, and `test_the_same_countries_are_present`
compares sets, which is invariant to that — so a dropped row would have left the
229 x 84 comparison without failing anything. Clean today (229 rows, 229 unique),
so preventive. Probe: `230 != 229 : duplicate iso3 in global_labor_dataset.csv`.

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

### R5. [x] The existing `AppPayload` tests say what they actually cover

**Done (2026-08-30):** `AppPayload`'s docstring now opens by saying it covers
what `export_app_json` writes and **not** what `src/data/global_labor.json`
contains, records that all six passed for the life of #57, and names
`test_app_payloads.CommittedHeaderMatchesTheGenerator` as the class that opens
the artifact. `grep -c "CommittedHeaderMatchesTheGenerator" test_tiers.py`
returns `1`; `grep -c "src/data/global_labor.json"` returns `2`.

`test_tiers.py::AppPayload` keeps its six generator-side tests — they are
correct about `export_app_json` — but its docstring records that it asserts on
a regenerated fixture payload and **not** on the committed artifact, and points
at the R2 test that does. Leaving it unannotated is what let a reader conclude
the artifact was covered.

**Acceptance:** `AppPayload`'s docstring names the committed file, says it does
not open it, and names the test class that does. `grep -c` for the R2 test
class name in `test_tiers.py` returns ≥ 1.

### R6. [x] `pipeline/README.md` stops describing a payload that does not exist

**Done (2026-08-30):** a paragraph after the outputs table states both payloads
are written by `npm run pipeline` (`run.py:277`, `panel.py:172` — both line
numbers checked against the actual `open(...)` calls), must never be
hand-edited, that a wrong figure is fixed upstream or in `manual_overrides.json`
with a citation, and that `pipeline/tests/test_app_payloads.py` enforces it
offline on every `verify` and in CI. R1 makes the pre-existing line 139 sentence
true.

Also corrected the suite's test count where the repo states it: `CLAUDE.md:131`
and `pipeline/README.md:38`, 114 -> 125.

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

## Implementation Plan

**Planned:** 2026-08-30

### Ordering — the one thing that cannot be resequenced

**R2 is built before R1.** R2's first acceptance bullet requires that the guard
fails against `src/data/global_labor.json`'s pre-R1 content. That content is the
file on `main` today, so writing the test first makes the demonstration free and
exact. Regenerating first would leave that criterion checkable only by reverting
a file the same commit just fixed — the weaker evidence, and the one this spec
argues against everywhere else. Steps 1 and 2 are therefore in this order on
purpose.

### Files to create

| Path | Purpose | Requirements |
|---|---|---|
| `pipeline/tests/test_app_payloads.py` | The guards that open the committed artifacts: header vs. generator, timeseries vs. panel CSV, rows vs. dataset CSV | R2, R3, R4 |

### Files to modify

| Path | Change | Requirements |
|---|---|---|
| `src/data/global_labor.json` | Regenerated from a full `npm run pipeline` — gains `field_tiers`, +3,003 bytes, no row value changes | R1 |
| `pipeline/tests/test_tiers.py` | `AppPayload` docstring records that it asserts on a regenerated fixture payload, not the committed artifact, and names the class that does | R5 |
| `pipeline/README.md` | States the two app payloads are generated by `npm run pipeline`, must not be hand-edited, and names the enforcing test module | R6 |

### Sequence

1. **R2, R3, R4** — write `test_app_payloads.py`. Run it against the *current*
   committed payload and record R2 failing on `field_tiers`, R3 and R4 passing.
   R3/R4 passing here is expected and is itself evidence: the timeseries has no
   drift and the rows agree with the CSV, so only the header guard is corrective.
2. **R1** — `npm run pipeline`, commit `src/data/global_labor.json`. Suite goes
   green. Confirm the diff adds `field_tiers` and touches nothing else.
3. **R2 bullets 2-3** — edit one weight in `ai_exposure_isco.json`, run the
   suite, record the failure, revert. Repeat for the `sources` literal in
   `run.py`. Both by making the edit, per the requirement.
4. **R3/R4 negative checks** — delete an `iso3` from the timeseries `series` and
   change one payload row value; record both failures; revert.
5. **R5** — `test_tiers.py` docstring.
6. **R6** — `pipeline/README.md`.
7. `npm run verify`, then mark each requirement from the output actually seen.

### Requirement mapping

| Req | How it will be satisfied | Where | How acceptance is checked |
|---|---|---|---|
| R1 | Full offline run regenerates the payload | `src/data/global_labor.json` | `len(d["field_tiers"])` prints `84`; file is 607,739 bytes; `sources`, `ai_exposure_weights` and all 229 rows compare equal to the pre-change file |
| R2 | `CommittedHeaderMatchesTheGenerator` compares the committed non-`rows` keys to `export_app_json([], tmp)` | `pipeline/tests/test_app_payloads.py` | Suite fails against the pre-R1 payload naming `field_tiers` and #57; fails again on a weight edit and on a `sources` edit, each demonstrated |
| R3 | `CommittedTimeseriesMatchesThePanel` rebuilds `fields`/`years`/`series` from `global_labor_panel.csv` | same | Passes unmodified today; fails when an `iso3` is dropped or a value changed |
| R4 | `CommittedRowsMatchTheDataset` compares 229 × 84 keyed by `iso3` under numeric normalisation, plus the `row_type` grouping and the `row_type`/`country_name` non-null pair | same | 0 disagreeing cells; fails on one edited value; grouping asserted contiguous |
| R5 | Docstring rewrite | `pipeline/tests/test_tiers.py` | Docstring names the committed file, says it does not open it, names the R2 class; `grep -c` for that class name ≥ 1 |
| R6 | New paragraph in the outputs section | `pipeline/README.md` | `grep` finds the generated / do-not-hand-edit / test-module sentences |

### Tier and vintage handling

**This plan produces no new figure, and no field's tier or vintage changes.**
`field_tiers` is a metadata map whose 84 values are read from
`config.FIELD_TIERS`, the registry of record; the map is provenance, not a
measurement. R1's regeneration was probed to leave all 229 rows equal, so every
per-field `data_year_*` column is untouched. The guards are read-only and assert
on existing values, adding none.

### Validation

The new tests join spec 0004's suite under `pipeline/tests/`, which
`scripts/verify.sh` runs **unconditionally** — no cache, no network — so they
run in a fresh clone and in CI. They compare and never write, per
`verify.sh:27-35`'s rule that verifying must not republish. No new `[validate]`,
`[crosscheck]` or `[outliers]` check is needed: R1 moves no number, so the four
regression anchors and the 27-member Eurostat cross-check are unaffected, and a
full run confirming them is R1's own cache-gated criterion.

### Risks

1. **R2's failure message must name `field_tiers` and #57**, or its first
   acceptance bullet is unmet even with a red suite. The assertion carries the
   text rather than relying on a diff.
2. **R4 compares two artifacts from the same run.** Recorded in the requirement;
   the guard cannot catch both being stale together, and nothing in this plan
   pretends otherwise.
3. **The R3/R4 negative checks edit tracked data files.** Each is reverted
   immediately and `git status --porcelain` is checked empty before moving on;
   an unreverted edit would silently republish a figure, which is the one thing
   this spec must not do.
4. **`export_app_json([], tmp)` is load-bearing for R2.** Probed working, but if
   a future change makes the header depend on rows, R2's design needs revisiting
   rather than patching — it would become an ingredient list again.

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
