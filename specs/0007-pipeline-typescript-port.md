# 0007 — Port the data pipeline from Python to TypeScript

**Status:** draft
**Depends on:** 0004 (the 107-test regression suite — the safety net this port
requires); 0005 (CI runs `verify`, which must keep passing throughout)
**Issue:** [#21](https://github.com/apportico/who-gets-replaced-first/issues/21)

## Objective

The repo is two languages: `pipeline/` is 2,142 lines of Python, `src/` is
JavaScript. The split is not just an inconvenience — it means the project's
data non-negotiables are enforced by prose on one side of a boundary and by
nothing at all on the other. `CLAUDE.md` says never blur measured and
constructed, never coerce a null to zero, never present a row as one vintage;
today a reviewer checks that by reading. In one typed language those become a
`Tier` union, `number | null`, and a per-field vintage type — checked at compile
time on both sides of the pipeline/app boundary.

The question this lets us answer that we cannot today: **does a change to the
pipeline still produce the same numbers, provably?** The committed outputs are a
golden master, and a port that reproduces them byte for byte is the strongest
regression evidence this project has ever had — stronger than the anchors,
because it covers every value rather than four.

## Source verification

Probed 2026-08-30 on the primary checkout. Node v24.19.0, npm 11.17.0,
Python 3.13.1. CI pins `node-version: 24` and `python-version: '3.13'`
(`.github/workflows/ci.yml:33,41`).

| Source | Probed | Result |
|---|---|---|
| Pipeline size | `wc -l pipeline/*.py` | **2,142 lines across 7 modules** — `fetch` 77, `crosscheck` 153, `panel` 175, `config` 325, `run` 386, `report` 398, `build` 628. Issue #21 says 1,925; it has grown since. |
| Third-party Python deps | AST walk of all imports vs `sys.stdlib_module_names` | **None.** Stdlib only: `argparse`, `collections`, `csv`, `datetime`, `gzip`, `io`, `json`, `os`, `sqlite3`, `sys`, `time`, `urllib`. The issue's claim holds. |
| `node:sqlite` on Node 24 | `new DatabaseSync(':memory:')`, create/insert/select | **Works unflagged**, no warning, exit 0. Confirms the issue's "no dependency" assumption. |
| CSV dialect | `grep` + `head` of the committed CSVs | Default dialect, `newline=""` → **CRLF (`\r\n`) line endings in all 6 CSVs**. `csv.field_size_limit(10_000_000)` is set in `build.py:10`. |
| Float repr, Python vs JS | Parsed **all 78,257 numeric values** from the 6 committed CSVs, compared `str()` to `String()` | **6,286 differ**: 6,256 integral floats (`79.0` → `79`) and **30 negative zeros** (`-0.0` → `0`). **Zero other disagreements** — shortest-round-trip repr agrees on the remaining 71,971. |
| `round()` semantics | 8 hand-picked cases in both languages | Python `round` matches **neither** `Math.round(x*10**n)/10**n` **nor** `toFixed(n)`. `round(2.675,2)=2.67` (naive JS: 2.68); `round(2.5)=2` (naive: 3); `round(-2.5)=-2` (`toFixed`: -3). **37 call sites: 33 in `build.py`, 4 in `crosscheck.py:69,71,73,134`** — the latter inside R6's scope. |
| A Python-compatible `pyRound` in JS | Implemented via `toFixed(20)` + decimal-string half-to-even; **20,000 randomised differential cases against Python** | **0 mismatches.** The algorithm is proven before being specified. |
| `sum()` over floats | 20,000 random 6-element sums drawn `uniform(0, 1e12)`, `sum()` vs naive left fold, Python 3.13.1 | **33.1% differ.** Python 3.12 moved `sum()` to **Neumaier compensated summation**; a JS `reduce((a,b) => a+b)` is a naive fold. The rate is distribution-dependent — a different sampling gives 23.8% — so the percentage is illustrative and the *existence* of the divergence is the finding. |
| `sum()` over **ints** | `sum([9007199254740993,1,1,1])` in both languages | **Neumaier is only the float branch.** CPython's `sum()` accumulates an integer prefix in **exact arbitrary-precision** arithmetic and enters the float path at the first float: Python gives `9007199254740996`, a JS `reduce` gives `9007199254740992`. Compensated summation cannot recover this — the first value is not representable as a double. |
| Runtime types at `build.py:476` | Real offline build over spec 0004's committed fixtures, `type()` of each field on country rows | **5 of the 7 summed fields are Python `int`, not float**: `clerical_employed`, `professionals_employed`, `young_white_collar_employed`, `exposed_wage_bill_ppp`, `ict_service_exports_usd` — all produced by 1-arg `round()`, which returns `int`. Only `population_15_24` and `service_exports_usd` are floats. **So the majority of these sums take the exact integer branch, not Neumaier.** |
| Headroom on the integer sums | Column sums of the committed dataset against 2^53 | Largest is `exposed_wage_bill_ppp` at **3.05e13** against a `Number.MAX_SAFE_INTEGER` of **9.01e15** — about **296x** of headroom, so no live defect today. It is a latent hazard, not a bug, and R1 records it as such. |
| Interpreter vintage of the committed outputs | `python3.11 -m unittest discover pipeline/tests` against `python3.13`, this checkout | **The golden master is interpreter-specific.** Under **3.11.16** the suite fails `test_output_matches_the_golden_master_byte_for_byte` on the WLD row: `service_exports_usd` = `5554959302720.801` against the committed `5554959302720.8`. Under **3.13.1** all 107 pass. So the committed outputs were produced by **3.12 or later**, and CI's `python-version: '3.13'` pin is load-bearing, not incidental. |
| SQLite byte-reproducibility | Built the same table+index in `sqlite3` and `node:sqlite`, `cmp -l` | **Exactly 4 bytes differ, all in the 100-byte header**: change counter (offset 24), version-valid-for (92), and **`SQLITE_VERSION_NUMBER` (96) — 3048000 vs 3053003**. Page data byte-identical. Byte-identical SQLite is **impossible**: the runtimes bundle SQLite 3.48.0 and 3.53.3. |
| App JSON — `global_labor.json` | `JSON.parse` → `JSON.stringify` round-trip | 604,736 → **602,826 bytes, a loss of 1,910**. (602,610 is the UTF-16 code-unit count, a loss of 2,126 — on a spec claiming byte identity the two must not be conflated; the 216-unit gap between them *is* the escaping finding.) 779 `.0` values lose their decimal, and **108 `\uXXXX` escapes** are emitted raw. |
| App JSON — `global_labor_timeseries.json` | same | 326,519 → **320,649 bytes, a loss of 5,870** — three times the other file's, and **all of it number formatting: 0 escapes**. So this is the cleaner end-to-end `pyStr` test of the two, and **only `global_labor.json` exercises the escape set today** — a port could pass `cmp` here with a completely wrong escaping implementation. |
| `ensure_ascii` | byte scan of both files | **Both are pure ASCII, zero bytes above 0x7f.** `run.py:278` and `panel.py:173` both write with `separators=(",", ":")` and the default `ensure_ascii=True`. Neither output is **mentioned in issue #21's scope**. |
| The test suite | `pipeline/tests/context.py`, import graph, `python3 -m unittest discover` | **107 tests, 1,512 lines, pass in 0.292s.** They `import build` / `import config` through a `sys.path` shim — they bind to the **Python modules** and die with them. **Not mentioned in issue #21's scope.** |
| Response cache | `du -sh pipeline/raw` | **80MB present on the probing machine** (`eurostat`, `ilostat`, `worldbank`). But `pipeline/raw` is **gitignored and absent in a fresh clone** — so this row is machine-local, CI can never re-run R3/R4, and `CLAUDE.md` documents `verify` skipping the pilot when it is missing. R3 names the durable evidence and R8 the repeatable guard. |
| CLI surface | `grep add_argument pipeline/run.py` | **Three flags**: `--pilot`, `--no-app-json`, `--out-dir`. Issue #21 names only `--pilot`. |
| Golden-master surface | `git ls-files pipeline/ src/data/`, filtered to non-source files — **derived from what the pipeline writes, not from where we expected it to write** | **11 tracked outputs.** The first probe looked only in `pipeline/data/` and `src/data/` and reported 9, then 10; it could not see `pipeline/summary_report.md`, which `report.py:398` writes one level up. The list: 6 CSVs, `global_labor_dataset.sqlite`, `pipeline/data/validation_report.txt`, `pipeline/summary_report.md`, `src/data/global_labor.json`, `src/data/global_labor_timeseries.json`. (`port_data.json` and `sanctions_regimes.json` are also tracked but are the corridor-wars static snapshot `CLAUDE.md` records — out of scope.) Two gaps hid behind the narrow probe, one level apart, which is why the row now records the command that cannot miss rather than a corrected count. |
| `pipeline/summary_report.md` | `wc -l`, `report.py:76`, `README.md:43` | **245 lines, tracked, and the only output that cannot be byte-compared**: `report.py:76` stamps `Generated {date.today()}`, and the committed file carries `Generated 2026-08-29` on line 3, so any fresh run differs daily. The root `README.md:43` points readers at it as the project's findings document. R6 covers it with a named single-line exclusion. |

**Note on tiers.** This spec produces **no new figures**. Every number it emits
already exists and carries a tier; the port's whole obligation is to reproduce
those values and their tiers unchanged. That obligation is what R3–R5 check, so
the `OFFICIAL` / `DERIVED` / `PROXY` / `MODELED` rules bind here as an
*equality* requirement rather than an assignment one. No requirement in this
spec may introduce a value the Python did not already produce.

## Requirements

### R1. [ ] A number layer that reproduces Python's arithmetic and formatting

**Three** helpers, with the port using them everywhere the Python uses
`round()`, `sum()`, or writes a float:

- `pyRound(x, n)` — half-to-even on the double's exact decimal value.
- `pyStr(x)` — Python's `repr`: `.0` on integral floats, `-0.0` preserved.
- `pySum(values)` — CPython `sum()`, **both branches**. Not Neumaier alone:
  `sum()` accumulates an integer prefix in exact arbitrary-precision arithmetic
  and enters the float path at the first float. Measured on a real offline
  build, **5 of the 7 fields summed at `build.py:476` are Python `int`** —
  `clerical_employed`, `professionals_employed`, `young_white_collar_employed`,
  `exposed_wage_bill_ppp`, `ict_service_exports_usd`, all from 1-arg `round()`
  — so the majority of these sums never touch the float branch at all. `pySum`
  therefore dispatches on type: **BigInt accumulation** for integer input,
  **Neumaier** once a float appears, converting to `number` at the end.
  Without the float branch, R3 cannot pass on an aggregate row; without the
  integer branch, `pySum` is documented as something it is not.

  **Headroom, recorded rather than assumed:** the largest integer column sum is
  `exposed_wage_bill_ppp` at 3.05e13 against a 2^53 ceiling of 9.01e15 — about
  296x. So a naive double accumulation would pass R3 today. That makes this a
  latent hazard, and the reason the integer branch is specified now rather than
  after a future vintage grows a column past the ceiling.

**The differential cases are committed as fixtures, not generated at test time.**
R10 deletes the Python and R11 removes the interpreter from CI, so a test that
shells out to `python3` to compare has nothing left to compare against — and R8
requires the suite to run offline. Each helper's cases are frozen as
`(input, args, expected)` triples under `pipeline/tests/fixtures/`, generated
once from the pinned interpreter, with the generator committed alongside so
they can be regenerated if the pin moves.

**Acceptance:**
- `pyRound` matches **≥20,000 committed fixture cases**, 0 mismatches.
- `pySum` matches **≥20,000 committed fixture cases**, 0 mismatches. The
  fixture must span **all three shapes** — all-integer, all-float, and mixed
  with the first float at varying positions — and must include integer cases
  **either side of 2^53** and float cases where naive folding diverges. A
  float-only fixture would exercise only one branch and could not check the
  requirement it sits under.
- `pyStr` reproduces all **78,257** numeric strings in the committed CSVs from
  their parsed doubles, including the **6,256** `.0` and **30** `-0.0` values,
  0 mismatches. (Already fixture-backed: it reads the committed CSVs.)
- All three run **offline**, with no Python present.

### R2. [ ] A hand-rolled CSV reader/writer, zero runtime dependencies

Python's default dialect, CRLF terminators, `QUOTE_MINIMAL`, and a field-size
ceiling matching `csv.field_size_limit(10_000_000)`.

**Acceptance:** the reader/writer round-trips **all 6 committed CSVs byte for
byte** — read then write reproduces the input exactly, `cmp` clean, including
quoted fields and the CRLF terminators.

### R3. [ ] The 6 CSV outputs and `validation_report.txt` are byte-identical

Run against the same cached `pipeline/raw/`, the TypeScript pipeline reproduces
`global_labor_dataset.csv`, `global_labor_panel.csv`, `ai_exposure_sensitivity.csv`,
`crosscheck_eurostat.csv`, `outliers_for_review.csv`, `pilot_labor_dataset.csv`
and **`validation_report.txt`** — the last is tracked, regenerated by the run,
and is the human-readable record of the `[validate]` block, so letting it drift
silently would be the worst option available.

**A golden master is only golden relative to a runtime.** The committed outputs
were produced by Python **3.12 or later** (3.11 fails byte identity on the WLD
row — see Source verification), so the comparison is run against the pinned
`3.13` and that pin is recorded with the result.

**Acceptance:** `cmp` exits 0 for each of the 7 files against the committed
version. Not "diffs explained" — **zero bytes differ.** Any difference is
treated as a defect in the port until proven otherwise.

**Evidence, and its limits.** `pipeline/raw/` is gitignored and absent in a
fresh clone, so this check cannot run in CI and a reviewer cannot reproduce it
on demand. The durable artifact is therefore the **`cmp` transcript for all
tracked outputs, pasted into the implementation PR**, recorded alongside the
cache's provenance (when it was fetched, from which sources) and the
interpreter pin. The repeatable guard that outlives it is named in R8.

### R4. [ ] The app JSON outputs are byte-identical

`src/data/global_labor.json` (written by `run.py:278`) and
`global_labor_timeseries.json` (written by `panel.py:173`, through the same
`json.dump` path) are consumed by the app and tracked in git. A stock
`JSON.stringify` **loses 1,910 bytes** on the first one, so the port needs a
serialiser reproducing three things, not one:

- **numbers** via `pyStr`, so `79.0` does not become `79`;
- **`separators=(",", ":")`** spacing, no space after `,` or `:`;
- **`ensure_ascii=True` escaping** — both committed files are pure ASCII with
  zero bytes above 0x7f, which `JSON.stringify` would emit raw as UTF-8.
  Python's escape set is **not** JavaScript's, so the port must specify it
  rather than assume it: which code points escape, `\uXXXX` casing, and
  surrogate-pair handling above the BMP.

**The two files test different halves, and only one tests the escaping.** All
108 escapes live in `global_labor.json`; `global_labor_timeseries.json` has
**zero**, so it would pass `cmp` against a completely wrong escape set. Its
5,870-byte loss is pure number formatting, making it the cleaner end-to-end
`pyStr` check. The escaping requirement stays on both — a future vintage with a
non-ASCII country or source name would put escapes in either — but the port
must not read a green timeseries diff as evidence the escaping is right.

**Acceptance:** `cmp` exits 0 for both files. The app builds and the page
renders with no console error — per `CLAUDE.md`, a green build is not evidence
the page renders, so this is checked by loading it.

### R5. [ ] SQLite is content-identical, and the 4-byte gap is recorded

Byte-identical SQLite is **not achievable** — probing showed the header carries
`SQLITE_VERSION_NUMBER`, and Python bundles 3.48.0 where Node bundles 3.53.3.
This is recorded as a known, permanent divergence rather than discovered in a
diff.

**Acceptance:**
- Schema matches: same tables, columns, declared types, primary key and the
  indexes `idx_region`, `idx_rowtype`, `idx_panel`.
- Every row matches the committed database on every column, nulls included
  (a null must never arrive as `0` or `""`).
- The only byte differences are within the **100-byte header** — offsets 24,
  92 and 96. A difference in page data fails this requirement.

### R6. [ ] All 7 modules ported, CLI surface preserved

`config`, `fetch`, `build`, `panel`, `crosscheck`, `report`, `run`. The cache
under `pipeline/raw/` stays byte-compatible so re-runs remain offline and free.

**Acceptance:**
- `--pilot`, `--no-app-json` and `--out-dir` all behave as before (all three,
  not just `--pilot`).
- `npm run pipeline:pilot` prints its `[validate]`, `[crosscheck]` and
  `[outliers]` blocks, and the anchors land unchanged: **World services ≈50%,
  US ≈79%, EU-27 ≈72%, India ≈31.5%**. A moved anchor exits non-zero, as spec
  0003 established.
- **`pipeline/summary_report.md` is byte-identical after excluding exactly one
  line** — the `Generated <date>` line written by `report.py:76`. Without this,
  `report` would be the only module in the spec whose 245-line output nothing
  asserts, while the root `README.md:43` points readers at it. The exclusion is
  **one named line, not a general "diffs explained" allowance**: any second
  differing line fails this requirement.

### R7. [ ] A shared schema module, consumed on both sides

`Tier` as `'OFFICIAL' | 'DERIVED' | 'PROXY' | 'MODELED'`; `number | null`
wherever a country may be missing; a per-field vintage type pairing a value with
its year.

**`strictNullChecks` alone does not reach the rule that matters.** It rejects
`const x: number = maybeNull`, but every shape this project actually forbids
compiles clean — verified with `tsc --strict`, where only the bare assignment
errored:

```ts
const v: number | null = null;
const a: number = v ?? 0;      // compiles
const b: number = v || 0;      // compiles
const c: number = Number(v);   // compiles
```

Those are precisely the imputation shapes `CLAUDE.md`'s "never impute a missing
country" exists to stop. So the null half of this requirement is met by a
**branded `Measured<number>`**: `v ?? 0` yields a plain `number` that is not
assignable to a branded field, forcing the author through an explicit
constructor that has to say what it is doing.

**The vintage type is a change of shape, not an annotation.** A value is only
inaccessible without its year if the two are a **pair type**; the pipeline's
current shape is sibling `data_year_*` columns, which cannot enforce anything.
R4's serialiser must therefore flatten the pair back to sibling columns on the
way out, or the byte-identical outputs break.

**Acceptance:** three deliberately broken snippets **fail `tsc --noEmit`** — a
value assigned without a tier, `v ?? 0` assigned to a `Measured<number>` field,
and a value read without its year. The requirement is not met by the types
existing, only by them rejecting these three; each is committed as a
`// @ts-expect-error` case so a later refactor that weakens them fails the
build.

### R8. [ ] The 107 tests ported, still passing

The suite binds to the Python modules through `pipeline/tests/context.py` and
would be deleted along with them. It is the safety net #21 depends on, so it
ports in this spec rather than a later one.

**Acceptance:** all **107** tests pass against the TypeScript pipeline, offline,
in **under 2s** (Python: 0.292s). `npm run test:pipeline` runs them. No test is
dropped without being recorded here as `[~]` with its reason.

**This carries the only re-runnable evidence in the spec.** R3's `cmp`
transcript needs the gitignored 80MB cache; spec 0004's in-tree fixture golden
master — `pipeline/tests/fixtures/expected/pilot_labor_dataset.csv`, with its
committed `fixtures/raw/` — does not. `test_output_matches_the_golden_master_byte_for_byte`
must stay green against the TypeScript build and keep running in CI, because it
is the one part of this evidence a future contributor can reproduce. It is also
the test that already caught the interpreter divergence, which is the argument
for it in one sentence.

### R9. [ ] The dependency policy is written down

`CLAUDE.md`'s "stdlib only, no pip installs" describes a Python pipeline that
will no longer exist. It is replaced by an explicit Node policy: **zero runtime
dependencies** — `node:sqlite`, `fetch`, `node:zlib` and `node:util`'s
`parseArgs` are native on Node 24, and CSV is hand-rolled per R2.

**Acceptance:** `package.json` gains **no new runtime dependency**, and every
place the Python is described is updated — named here so a reviewer is not left
finding stragglers after R10 lands:

| File | What |
|---|---|
| `CLAUDE.md` | the stdlib rule, the layout section, the command list |
| `package.json:11-16` | five scripts shelling to `python3` — `pipeline`, `pipeline:pilot`, `test:pipeline`, `report`, and `verify:data` via the pilot |
| `pipeline/README.md:13-16` | the four documented `python3` commands |
| `pipeline/README.md:26` | **the "Standard library only — no pip installs" rule itself** — the sentence this requirement retires |
| `pipeline/README.md:31,38-39` | the stdlib `unittest` description and its invocation gotcha |
| `pipeline/README.md:61` | the `summary_report.md` row in the outputs table |
| `.github/workflows/ci.yml:36` | the comment explaining the pipeline is stdlib-only, next to the `python-version: '3.13'` pin at `:41` that R11 removes |

### R10. [ ] The Python is deleted, and only at the end

No permanent dual implementation. The Python comes out once R3, R4, R5 and R8
all pass — not before, so there is never a window with neither safety net.

**Acceptance:** no `.py` under `pipeline/` on the final commit, and
`npm run verify` passes on that commit. The deletion is its own commit, so it
can be reverted independently if the port is later found wanting.

### R11. [ ] `verify` and CI run the ported pipeline

Per `CLAUDE.md`: a check added to CI is added to `verify` in the same change.

**Acceptance:** `npm run verify` passes end to end; `.github/workflows/ci.yml`
runs the same command and passes on the PR. The Python setup step is removed
from CI only when R10 lands.

## Non-goals

- **Converting the app to TypeScript** (#22). This spec exports the shared
  schema module the app will consume, but changes no file under `src/` except
  the two regenerated JSON data files. #22 adopts the types.
- **The Vite → Next.js migration** (#23) and **per-route data** (#26). Both
  touch the same app files; sequencing them is their own decision.
- **Improving the pipeline while porting it.** Every bug, quirk and awkward
  helper ports as-is. A port that also fixes things cannot be verified by a
  byte-identical diff, which is the only strong evidence available here. Fixes
  come after, as their own specs with their own requirement IDs.
- **Byte-identical SQLite.** Probed and shown impossible (R5). Recorded as a
  finding rather than left to surface as a mystery diff.
- **Re-fetching from the live APIs.** The port is verified against the cached
  `pipeline/raw/`, so the comparison is offline and the sources are held fixed.
  A live refresh would change values and destroy the golden master as evidence.
- **Changing any published figure.** If the port reveals a genuine arithmetic
  bug in the Python, it is recorded as a finding and filed as its own issue —
  not fixed here, because doing so would make R3 unverifiable.
