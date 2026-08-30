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
| Whether a sub-2^53 fixture can test the integer branch | **200,000 random 6-element integer sums below 2^53**, BigInt accumulation against a naive fold | **0 differences.** Double addition on integers under the ceiling is exact, so the two branches are indistinguishable there. The same comparison at 2^53 separates them immediately (`...992` against `...996`). This is why R1's `≥2^53` fixture cases are the criterion rather than an edge of it, and why the loader must reach `bigint`: `Number("9007199254740993")` returns `...992`. |
| Interpreter vintage of the committed outputs | `python3.11 -m unittest discover pipeline/tests` against `python3.13`, this checkout | **The golden master is interpreter-specific.** Under **3.11.16** the suite fails `test_output_matches_the_golden_master_byte_for_byte` on the WLD row: `service_exports_usd` = `5554959302720.801` against the committed `5554959302720.8`. Under **3.13.1** all 107 pass. So the committed outputs were produced by **3.12 or later**, and CI's `python-version: '3.13'` pin is load-bearing, not incidental. |
| SQLite byte-reproducibility | Built the same table+index in `sqlite3` and `node:sqlite`, `cmp -l` | **Exactly 4 bytes differ, all in the 100-byte header**: change counter (offset 24), version-valid-for (92), and **`SQLITE_VERSION_NUMBER` (96) — 3048000 vs 3053003**. Page data byte-identical. Byte-identical SQLite is **impossible**: the runtimes bundle SQLite 3.48.0 and 3.53.3. |
| App JSON — `global_labor.json` | `JSON.parse` → `JSON.stringify` round-trip | 604,736 → **602,826 bytes, a loss of 1,910**. (602,610 is the UTF-16 code-unit count, a loss of 2,126 — on a spec claiming byte identity the two must not be conflated; the 216-unit gap between them *is* the escaping finding.) 779 `.0` values lose their decimal, and **108 `\uXXXX` escapes** are emitted raw. |
| App JSON — `global_labor_timeseries.json` | same | 326,519 → **320,649 bytes, a loss of 5,870** — three times the other file's, and **all of it number formatting: 0 escapes**. So this is the cleaner end-to-end `pyStr` test of the two, and **only `global_labor.json` exercises the escape set today** — a port could pass `cmp` here with a completely wrong escaping implementation. |
| `ensure_ascii` | byte scan of both files | **Both are pure ASCII, zero bytes above 0x7f.** `run.py:278` and `panel.py:173` both write with `separators=(",", ":")` and the default `ensure_ascii=True`. Neither output is **mentioned in issue #21's scope**. |
| The test suite | `pipeline/tests/context.py`, import graph, `python3 -m unittest discover` | **107 tests, 1,512 lines, pass in 0.292s.** They `import build` / `import config` through a `sys.path` shim — they bind to the **Python modules** and die with them. **Not mentioned in issue #21's scope.** |
| Response cache | `du -sh pipeline/raw` | **80MB present on the probing machine** (`eurostat`, `ilostat`, `worldbank`). But `pipeline/raw` is **gitignored and absent in a fresh clone** — so this row is machine-local, CI can never re-run R3/R4, and `CLAUDE.md` documents `verify` skipping the pilot when it is missing. R3 names the durable evidence and R8 the repeatable guard. |
| CLI surface | `grep add_argument pipeline/run.py` | **Three flags**: `--pilot`, `--no-app-json`, `--out-dir`. Issue #21 names only `--pilot`. |
| Golden-master surface | **Enumerated from the write sites in the pipeline source**, not from a directory listing | **11 tracked outputs**, each traced to the line that writes it: `crosscheck.py:82` → `crosscheck_eurostat.csv`; `crosscheck.py:141` → `ai_exposure_sensitivity.csv`; `panel.py:155` → `global_labor_panel.csv`; `panel.py:172` → `src/data/global_labor_timeseries.json`; `report.py:392` → `summary_report.md`; `run.py:202` → `global_labor_dataset.csv` / `pilot_labor_dataset.csv`; `run.py:277` → `src/data/global_labor.json`; `run.py:354` → `validation_report.txt`; `run.py:357` → `outliers_for_review.csv`; `run.py:215,234` → `global_labor_dataset.sqlite` (via `sqlite3.connect`, which an `open()` grep misses); `fetch.py:27` → `pipeline/raw/`, gitignored. **Directory listings were the wrong probe twice**: `pipeline/data/ src/data/` reported 9 and then 10, missing `validation_report.txt` and then `summary_report.md`. Widening to `git ls-files pipeline/ src/data/` does not fix it either — that returns 41 paths, including two inputs (`ai_exposure_isco.json`, `manual_overrides.json`) and 25 test fixtures, so getting to 11 is the same hand filter that lost the first two. Only the write-site enumeration answers the question the row asks. |
| `pipeline/summary_report.md` | `wc -l`, `report.py:76`, `README.md:43`, and a regeneration diff | **245 lines, tracked, and the only output that cannot be byte-compared**: `report.py:76` stamps `Generated {date.today()}`, and the committed file carries `Generated 2026-08-29` on line 3, so any fresh run differs daily. The root `README.md:43` points readers at it as the project's findings document. Written at `report.py:392`; the pipeline reaches it via `run.py:379`, while `report.py:398` is the `__main__` entry point. **Regenerating from the current Python and diffing with line 3 removed gives 4 differing lines, not 0** — two from the `sensitivity` invocation gap, two from tier drift on `main` ([#54](https://github.com/apportico/who-gets-replaced-first/issues/54)). R6 covers it, blocked on that issue. |
| `pipeline/tests/fixtures/expected/pilot_labor_dataset.csv` | `git ls-files pipeline/tests/fixtures/` | A **committed expected output**, and deliberately not a twelfth entry in the list above: it is spec 0004's in-tree golden master, an input to the test suite rather than something a pipeline run writes. **R8 covers it**, and names it as the only re-runnable evidence in this spec. |

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
  therefore selects a branch: **BigInt accumulation** for integer fields,
  **Neumaier** once a float appears, converting to `number` at the end.
  Without the float branch, R3 cannot pass on an aggregate row; without the
  integer branch, `pySum` is documented as something it is not.

  **The branch is chosen from the declared type, never from the value.** Once
  the pipeline is TypeScript, `clerical_employed` and `population_15_24` are
  both `number`, and `Number.isInteger(14455.0)` is `true` — so sniffing the
  value takes the BigInt branch for a Python float **by construction, not as an
  edge case**. The 1-arg-`round()` outputs therefore carry a branded `Int` in
  R7's shared schema, beside `Measured`, and `pySum` dispatches on the declared
  type of the field it is summing. The Python type distinction that exists
  today has to survive the port as a schema fact, or it is lost at the boundary.

  **`Int` is a branded `number` in the schema; `bigint` appears only at the
  helper boundary.** `pySum`'s integer branch takes `bigint`, and `Int` fields
  convert on the way in — lossless by the headroom row above, since every
  pipeline value is an ordinary double far below 2^53. Keeping `bigint` out of
  the schema keeps the row types plain at 296x of headroom; putting it at the
  boundary is what lets the helper be exercised at values the current data
  never reaches, which is the entire point of a differential fixture.

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

  **A JSON array of numbers cannot hold this fixture**, so the format is part
  of the requirement rather than an implementation detail. `JSON.parse("9007199254740993")`
  returns `9007199254740992` — the spec's own motivating input cannot be
  written as a JSON number literal, and a fixture that tried would assert the
  wrong expected value. And `[1.0, 2.0]` and `[1, 2]` are the same JSON text,
  so all-integer and all-float collapse into one case and "first float at
  varying positions" becomes unsayable. **Each element is stored as a string
  with an explicit `int` / `float` tag**, so exact integers survive and a
  Python float that happens to be integral stays distinguishable from an int.

  **The loader parses `int`-tagged elements — and the `int`-tagged `expected` —
  to `bigint`, not `number`.** The tag lets the fixture *spell*
  `9007199254740993`; `Number("9007199254740993")` still returns `...992`, so
  without this the value is lost a third time, at a third layer. `expected` is
  where the assertion lands and has no more right to be a `number` than the
  inputs do.

  **The cases at and above 2^53 are the whole criterion, not its edge.**
  Measured: across **200,000 random 6-element integer sums below the ceiling,
  BigInt accumulation and a naive fold agree on every one** — double addition
  on integers under 2^53 is exact. So a fixture that stays below it cannot
  distinguish the integer branch from the thing that branch exists to replace.
  Dropping those cases would not shrink this criterion, it would empty it.
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

  **The comparison is against a full `run.py` run, not `npm run report`.**
  `report.write(rows, out_path, sensitivity=None)` (`report.py:58`) gates the
  AI-exposure-sensitivity paragraph on `sensitivity` at `report.py:326`, and
  only `run.py:379` passes it. The `__main__` block at `report.py:398` — what
  `npm run report` and `pipeline/README.md:15` both invoke — passes nothing and
  silently drops `summary_report.md:212-213`. Naming the invocation is part of
  the criterion, or a contributor takes the documented path and gets a 3-line
  diff that has nothing to do with the port.

  **Blocked on [#54](https://github.com/apportico/who-gets-replaced-first/issues/54)
  until the committed report is regenerated.** Reproduced on this branch:
  regenerating from the *current* Python and diffing with the `Generated` line
  removed gives **4 differing lines, not 0**. Two are the invocation gap above.
  The other two are tier drift on `main`: `summary_report.md:231` says
  `DERIVED composite` where `report.py:363` says `MODELED composite`, changed in
  `ff507b0` and never regenerated. **That is not excluded here.** A second
  exclusion would launder exactly the tier drift `CLAUDE.md` exists to prevent,
  in the one document written for humans to quote from. It is fixed on `main`
  under #54, and R6 asserts against the corrected file.

### R7. [ ] A shared schema module, consumed on both sides

`Tier` as `'OFFICIAL' | 'DERIVED' | 'PROXY' | 'MODELED'`; `number | null`
wherever a country may be missing; a per-field vintage type pairing a value with
its year; and a branded **`Int`** for the 1-arg-`round()` outputs, which R1's
`pySum` dispatches on. `Int` is not cosmetic: it is the only surviving record
that `clerical_employed` was a Python `int` and `population_15_24` a Python
`float`, a distinction JavaScript's single `number` type erases and
`Number.isInteger` cannot recover.

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

**Acceptance:** **four** deliberately broken snippets **fail `tsc --noEmit`**:

1. a value assigned without a tier;
2. `v ?? 0` assigned to a `Measured<number>` field;
3. a value read without its year;
4. **`pySum`'s integer overload applied to a field that is not `Int`** — e.g.
   passing `population_15_24`, a Python float, where the integer branch is
   selected.

The requirement is not met by the types existing, only by them rejecting these
four; each is committed as a `// @ts-expect-error` case so a later refactor
that weakens them fails the build.

The fourth is what makes `Int` load-bearing rather than decorative. R1
delegates its branch selection to `Int`, so if `Int` were assignable from a
plain `number`, the brand and the value-sniffing R1 explicitly rejects would be
the same thing under different names, and the integer branch would silently
take float fields again. It is placed at the **call site** rather than on an
assignment because the call site is where the wrong branch would be taken.

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
