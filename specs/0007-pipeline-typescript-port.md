# 0007 — Port the data pipeline from Python to TypeScript

**Status:** in-progress
**Depends on:** 0004 (the 107-test regression suite — the safety net this port
requires); 0005 (CI runs `verify`, which must keep passing throughout)
**Issue:** [#21](https://github.com/apportico/who-gets-replaced-first/issues/21)
**Approved:** 2026-08-30 — @syymza, PR [#53](https://github.com/apportico/who-gets-replaced-first/pull/53), at `76dd949`.
Moved draft -> in-review -> approved. Eight review rounds; every blocking finding
was re-derived on this checkout before being accepted, and two were rejected in
favour of a different fix once measurement contradicted the proposed one.

**Where the risk sits.** R1 was re-specified in six consecutive rounds — fixture
format, loader type, return type, missing mixed entry point, the transition add,
and the elements after it — each fix exposing the next layer. The rest of the
spec has been stable since round 4. Two things **the author recommends** before
R1 is built — raised in the round-6 comment on `34622be` and again as
pre-approval conditions on `76dd949`, and **endorsed by @syymza in the
re-review of `f07fd01`**: a second reviewer on R1 specifically, and
implementing the summation helpers against the real committed columns
**first**, so R1 is validated by execution rather than by review.

**R6 is blocked** on [#54](https://github.com/apportico/who-gets-replaced-first/issues/54)
— `summary_report.md` labels a `MODELED` composite `DERIVED`, a tier defect on
`main` that R6's own acceptance criterion surfaced.

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
| What the integer sum must return | `sum([9007199254740993,2,2,2])` in Python against BigInt accumulation, narrowed and not | **`pySumInt` cannot return `number`.** Python gives `...999`; exact BigInt accumulation gives `...999n`; `Number()` of that gives `...1000`; the naive fold gives `...998`. So narrowing inside the helper makes a *correct* implementation fail its own fixture, and fail it differently from the fold it replaces. The value cannot even be written as a JS number literal — `9007199254740999` parses to `...1000` — which is the same wall as the JSON literal, one layer further out. |
| Whether `Int` can be checked by `tsc` at a `pySumInt` call site | `tsc --strict --noEmit` on the case, run **with the brand and with `Int` aliased to `number`** | **Discriminates**, using **column arrays** (`rows.map(r => r.population_15_24)`), not the scalar fields: with `Int` branded the `Int` column compiles and the float column is rejected; with the brand removed the rejection disappears and `tsc` reports **TS2578, unused `@ts-expect-error`**. Three phrasings measured and rejected as non-discriminating: `number`-vs-`bigint` (rejects `Int` columns too), an overloaded `pySum` (rejects nothing), and `.map` on the **scalar** field (TS2339 with and without the brand). |
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

### R1. [x] A number layer that reproduces Python's arithmetic and formatting

**Five** entry points — `pyRound`, `pyStr`, `pySumInt`, `pySumFloat`, `pySum`,
plus the `toBigInt` converter — with the port using them everywhere the Python
uses `round()`, `sum()`, or writes a float:

- `pyRound(x, n)` — half-to-even on the double's exact decimal value.
- `pyStr(x)` — Python's `repr`: `.0` on integral floats, `-0.0` preserved.
- **The summation trio** — CPython `sum()` is **not Neumaier alone**:
  `sum()` accumulates an integer prefix in exact arbitrary-precision arithmetic
  and enters the float path at the first float. Measured on a real offline
  build, **5 of the 7 fields summed at `build.py:476` are Python `int`** —
  `clerical_employed`, `professionals_employed`, `young_white_collar_employed`,
  `exposed_wage_bill_ppp`, `ict_service_exports_usd`, all from 1-arg `round()`
  — so the majority of these sums never touch the float branch at all. The
  integer path is therefore **its own named entry point**, not an internal
  branch that narrows on the way out:

  ```ts
  type PyNum = { kind: 'int';   value: bigint }
             | { kind: 'float'; value: number }

  toBigInt(v: Int): bigint                       // the only route from row data in
  pySumInt(values: readonly bigint[]): bigint    // exact, returns bigint
  pySumFloat(values: readonly number[]): number  // Neumaier
  pySum(values: readonly PyNum[]): number        // mixed, see the transition step below
  ```

  **`PyNum` is an explicit runtime tag, and it has to be.** The two shorter
  spellings fail, both verified with `tsc`:

  - **`Int | number` collapses.** `Int` is a branded `number`, so a plain
    `number` is assignable to the union and back out again — nothing is
    rejected (`tsc` reports TS2578 on a `@ts-expect-error` over it), and at
    runtime there is no tag to switch on. That is the `Number.isInteger` wall
    one layer further out.
  - **`bigint | number`** discriminates, but then `pySum` is not callable on
    row data without the caller already knowing which elements were ints —
    which is exactly what it does not know, since that is what `JSON.parse`
    erased.

  The tag is what the fixture's tagged strings deserialise into, and — via the
  override clause below — it has a real producer in the pipeline rather than
  being a fixture-only construct.

  Without the float path, R3 cannot pass on an aggregate row; without the
  integer path, the helper is documented as something it is not.

  **`pySum` is the mixed case, and its transition step is not what it looks
  like.** CPython's integer fast path does not hand over to a compensated loop.
  On meeting the first float it materialises the prefix, performs **one
  ordinary uncompensated addition**, and only then initialises the float loop
  with `c = 0.0`. The residual of that single transition add is **discarded**.
  So compensation starts after the prefix *and the first float* — not after the
  prefix. Written as pseudocode, because every other phrasing of this has been
  wrong:

  ```
  prefix = exact integer sum of the leading ints    // BigInt
  f = Number(prefix) + firstFloat                   // ONE plain add, no compensation
  c = 0
  for x in elements after firstFloat:
      if x is int:  f = f + Number(x)               // ALSO uncompensated, c untouched
      else:         Neumaier(f, c, x)
  return f + c
  ```

  An all-float sum never loses that residual, because `sum()` starts from the
  integer `0` and its transition add is `0 + x0`, which is exact.

  **The `if x is int` branch is not a detail — it is the same finding one
  element further along.** Inside CPython's float loop only `PyFloat_CheckExact`
  items go through Neumaier; an exact `int` is added with a plain
  `f_result += (double)value` and `c` is left untouched. So compensation is
  suspended for *every* integer after the transition, not just the transition
  itself. Compensating them instead diverges from `sum()`, and diverges on
  exactly the shape the override path produces:

  | Shape (200,000 lists each, elements under 1e12) | Compensating ints | Uncompensated, as above |
  |---|---|---|
  | int prefix, then all floats | **0** | **0** |
  | `Int` column, one float override at a random position | **3,370** | **0** |
  | float column, one int override at a random position | **10,270** | **0** |

  Rates are distribution-dependent, as with the `sum()` row above; the counts
  are illustrative and the separation is the finding. Smallest case, at
  ordinary project magnitudes, and one showing it compounds with the number of
  trailing ints:

  ```python
  sum([84.84239393266276, 387, 570])   # CPython 1041.8423939326626, compensating ...628
  sum([10**16, 0.5, 1, 1, 1])          # CPython 1e+16,              compensating 1.0000000000000004e+16
  ```

  The first row of that table is the shape this spec measured for two rounds,
  and it cannot separate the two algorithms at all — which is why the
  acceptance below now names the shape that can.

  Measured, over 200,000 random 6-element lists with the first float at a
  random position, `sum(mixed)` against `sum(float(v) for v in mixed)`:

  | Element magnitudes | Differences |
  |---|---|
  | under 1e12, **integral** floats | **0** |
  | under 1e12, **fractional** floats | **24,142** |
  | drawn above 2^53 | **42,631** |

  The middle row is why the mixed path is specified rather than dropped: it
  diverges at **this project's magnitudes**, not only past the ceiling, and
  `service_exports_usd` is fractional (`2988845686.27002`).

  **And the transition step is worth the same magnitude again.** Implementing
  "exact prefix, then Neumaier over every remaining element" — the obvious
  reading, and what an earlier revision of this spec said — differs from
  `sum()` on **24,130 of the same 200,000 lists (12.1%)**. Smallest case found:

  ```python
  sum([796, 0.6403143822699731, 7.582302462868173])
  #   CPython:              804.2226168451381
  #   compensating too early: 804.2226168451382
  ```

  The pseudocode above gives **0 differences** over the same 200,000. So a port
  that gets the transition wrong reproduces mixed rows about as badly as the
  naive fold this entry point exists to replace, and R3 would surface it as a
  one-ulp mystery diff on an aggregate row rather than as a known gap.

  **What actually calls `pySum`: the override path, and only it.** Every one of
  the 7 columns at `build.py:472-476` is homogeneous by construction — the 5
  integer ones from 1-arg `round()` (`build.py:309,317,333,338`), the other two
  through `num()`, which is `float(x)` at `build.py:24-28`. Those columns select
  `pySumInt` or `pySumFloat` at the call site and never reach the mixed path.

  The one thing that breaks homogeneity is `apply_overrides`, which assigns the
  raw JSON value (`build.py:520`, `row[field] = spec["value"]`, no `num()`) and
  runs at `run.py:115`, **before** the aggregation at `run.py:119`. In Python
  that distinction is real — `json.loads` yields `int` for `15000000` and
  `float` for `15000000.0` — so an override written without a decimal point
  makes its column mixed and changes what `sum()` returns.

  **`JSON.parse` cannot see it.** Both arrive as `number` with
  `Number.isInteger` true, which is the erasure already recorded above. So a
  port that reads overrides through `JSON.parse` would select `pySumFloat` and
  **return a different number from the Python for the same
  `manual_overrides.json`** — and R3 could not catch it, because `overrides` is
  `{}` today, so byte identity passes and the divergence ships unseen.

  The port therefore **types override numbers from the raw JSON token text** —
  a literal containing `.`, `e` or `E` is a float, otherwise an integer — the
  same reason R2 hand-rolls a CSV reader rather than trusting a stock one. A
  column carrying any overridden value is then summed through `pySum` over
  `PyNum` elements, and that is `pySum`'s pipeline caller. Without this clause
  the mixed entry point would be reachable only from its own fixture.

  Scope note: this is a **deliberate addition** beyond issue #21, taken because
  `manual_overrides.json` is the documented mechanism for nationally-sourced
  figures — `CLAUDE.md` records Armenia, New Zealand and Saudi Arabia sitting
  there unfilled on purpose — so the empty-today argument is a statement about
  when this breaks, not whether. Checked so as not to overstate the surface:
  `ai_exposure_isco.json`'s 36 weights are **all written with a decimal point**,
  and `build.py:324` multiplies through `/100.0` first, so that site is float
  either way. The override path is the only live instance.

  **`pySumInt` returns `bigint`, and the narrowing to `number` happens at the
  pipeline call site** — `Number(pySumInt(fields.map(toBigInt)))` — where the
  296x headroom row above is the stated licence for it rather than an unstated
  assumption. Narrowing inside the helper would lose the value a **fourth**
  time, and lose it in a way that breaks the fixture rather than the data:
  Python's `sum([9007199254740993,2,2,2])` is `...999`, exact BigInt
  accumulation gives `...999n`, and `Number()` of that is `...1000` — so a
  *correct* implementation would fail its own fixture, and fail it differently
  from the naive fold it exists to replace (`...998`).

  **The branch is chosen from the declared type, never from the value.** Once
  the pipeline is TypeScript, `clerical_employed` and `population_15_24` are
  both `number`, and `Number.isInteger(14455.0)` is `true` — so sniffing the
  value takes the BigInt branch for a Python float **by construction, not as an
  edge case**. The 1-arg-`round()` outputs therefore carry a branded `Int` in
  R7's shared schema, beside `Measured`, and **the path is selected at the call
  site from that declared type** — `Number(pySumInt(col.map(toBigInt)))` for an
  `Int` column, `pySumFloat(col)` for a float one — not by a helper inspecting
  what it was handed. The Python type distinction that exists today has to
  survive the port as a schema fact, or it is lost at the boundary.

  **`Int` is a branded `number` in the schema; `bigint` appears only at the
  helper boundary.** `pySumInt` takes `bigint`, and `Int` fields convert
  through `toBigInt` on the way in — lossless by the headroom row above, since
  every pipeline value is an ordinary double far below 2^53. Keeping `bigint`
  out of the schema keeps the row types plain at 296x of headroom; putting it
  at the boundary is what lets the helper be exercised at values the current
  data never reaches, which is the entire point of a differential fixture.

  **`Int`'s constructor validates at runtime; it does not merely assert the
  brand.** `BigInt()` throws `RangeError` on a non-integral `number`, so
  `toBigInt` is total only if nothing non-integral can carry the brand — which
  requires a `Number.isInteger` check where `Int` is minted, not a bare cast.
  A throw is the right failure mode, and much better than a silent wrong figure
  reaching a published column; the point is that it should be a *stated* one,
  since a brand that is only asserted leaves the integer path one mislabelled
  field away from a runtime error.

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
- The summation helpers match **≥20,000 committed fixture cases each — 60,000
  in total**, 0 mismatches, one block per entry point so a green run cannot
  mean one path was never exercised:
  - `pySumInt`: all-integer, including cases **either side of 2^53**;
  - `pySumFloat`: all-float, including cases where naive folding diverges;
  - `pySum`: mixed, with the first float at varying positions, fractional
    floats at ordinary magnitudes, and — **the case without which this bullet
    checks nothing** — **at least one integer element *after* the first float,
    with the trailing-int count varied**.

    An int prefix followed only by floats is the shape where a wrongly
    compensated implementation and `sum()` agree on all 200,000 cases, so a
    fixture built to "first float at varying positions" alone **passes a wrong
    implementation**. The separating shapes are the two the pipeline actually
    produces, per the override clause above: an `Int` column with one float
    override, and a float column with one int override, both at a random
    non-final position. Varying the trailing-int count matters because a single
    trailing int often cancels in the final `f + c` and the divergence only
    appears from two or three onward. This paragraph states the *why* so a
    later revision does not simplify the case back out — it has been
    simplified out once already.

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
  inputs do. The integer assertion is therefore **`bigint` against `bigint`**,
  which is only possible because `pySumInt` returns `bigint`: comparing a
  `number` result against a `bigint` expectation is rejected outright by
  `tsc` (TS2367, no overlap) and false at runtime under `===` even when the
  two agree.

  **The cases at and above 2^53 are the whole criterion, not its edge.**
  Measured: across **200,000 random 6-element integer sums below the ceiling,
  BigInt accumulation and a naive fold agree on every one** — double addition
  on integers under 2^53 is exact. So a fixture that stays below it cannot
  distinguish the integer branch from the thing that branch exists to replace.
  Dropping those cases would not shrink this criterion, it would empty it.
- `pyStr` reproduces all **78,257** numeric strings in the committed CSVs from
  their parsed doubles, including the **6,256** `.0` and **30** `-0.0` values,
  0 mismatches. (Already fixture-backed: it reads the committed CSVs.)
- **The override loader types numbers from the raw JSON token text**, checked
  by a committed fixture overrides file rather than by inspection. The same
  field written `15000000` for one country and `15000000.0` for another yields
  `{ kind: 'int' }` and `{ kind: 'float' }` respectively; and an aggregate over
  a column carrying one of them reproduces `sum()` against a committed expected
  value generated from the pinned interpreter.

  Without this the clause that gives `pySum` its only pipeline caller is the
  one clause with nothing asserting it: R1's other criteria do not touch it,
  and R3 cannot, because `overrides` is `{}`. An implementer reaching for
  `JSON.parse` would get a green R1, a green R3, and the divergence recorded
  above. The second half of the criterion is the load-bearing part — it
  exercises `pySum` end to end on a real column instead of only through its own
  fixture.
- **All five entry points** run **offline**, with no Python present.

### R2. [x] A hand-rolled CSV reader/writer, zero runtime dependencies

Python's default dialect, CRLF terminators, `QUOTE_MINIMAL`, and a field-size
ceiling matching `csv.field_size_limit(10_000_000)`.

**Acceptance:** the reader/writer round-trips **all 6 committed CSVs byte for
byte** — read then write reproduces the input exactly, `cmp` clean, including
quoted fields and the CRLF terminators.

### R3. [x] The 6 CSV outputs and `validation_report.txt` are byte-identical

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

### R4. [x] The app JSON outputs are byte-identical

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

### R5. [x] SQLite is content-identical, and the 4-byte gap is recorded

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

### R6. [x] All 7 modules ported, CLI surface preserved

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

### R7. [x] A shared schema module, consumed on both sides

`Tier` as `'OFFICIAL' | 'DERIVED' | 'PROXY' | 'MODELED'`; `number | null`
wherever a country may be missing; a per-field vintage type pairing a value with
its year; and a branded **`Int`** for the 1-arg-`round()` outputs, which R1's
call sites select a summation path from. `Int` is not cosmetic: it is the only
surviving record
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
4. **a non-`Int` column routed into the integer sum** —

   ```ts
   const col: readonly number[] = rows.map(r => r.population_15_24);  // Python float
   // @ts-expect-error
   const bad = pySumInt(col.map(toBigInt));
   ```

   Note the **column**, not the field. `population_15_24` is a scalar on a row
   — `build.py:472-476` sums it *across* member rows — so a literal
   `population_15_24.map(...)` would fail with TS2339 (`Property 'map' does not
   exist on type 'number'`), and fail identically with the brand removed. That
   is the very failure mode the two-way check below exists to catch, so the
   snippet has to be committed in this shape to be worth anything.

The requirement is not met by the types existing, only by them rejecting these
four; each is committed as a `// @ts-expect-error` case so a later refactor
that weakens them fails the build.

**Case 4 must be checked with the brand removed, not only with it present.**
`toBigInt(v: Int): bigint` being the only route from row data into `pySumInt`
is what gives the case its power: the brand is the sole reason the float field
is rejected. Verified both ways — with `Int` branded, the file compiles clean;
with `Int` aliased to a plain `number`, `tsc` fails with **TS2578, unused
`@ts-expect-error` directive**, because nothing rejects it any more.

That two-way check is the requirement, because the obvious phrasings do not
survive it. Had case 4 been "pass `population_15_24` to a `pySum` taking
`bigint`", it would fail `tsc` for `number`-vs-`bigint` — but so would passing
`clerical_employed`, which *is* `Int`, since a branded `number` is still a
`number`. A case that errors identically with the brand deleted is not evidence
for the brand. And had `pySum` been overloaded with a `readonly number[]`
float signature, passing the float field would resolve to that overload with no
error at all, failing instead on the unused directive.

It stays at the **call site** rather than on an assignment because the call
site is where the wrong branch would be taken.

### R8. [~] The 107 tests ported, still passing

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

### R9. [x] The dependency policy is written down

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

### R10. [~] The Python is deleted, and only at the end

No permanent dual implementation. The Python comes out once R3, R4, R5 and R8
all pass — not before, so there is never a window with neither safety net.

**Acceptance:** no `.py` under `pipeline/` on the final commit, and
`npm run verify` passes on that commit. The deletion is its own commit, so it
can be reverted independently if the port is later found wanting.

### R11. [x] `verify` and CI run the ported pipeline

Per `CLAUDE.md`: a check added to CI is added to `verify` in the same change.

**Acceptance:** `npm run verify` passes end to end; `.github/workflows/ci.yml`
runs the same command and passes on the PR. The Python setup step is removed
from CI only when R10 lands.

## Implementation

**Implemented:** 2026-09-01. Branch `feat/0007-pipeline-typescript-port`,
three commits: the port, the suite and toolchain, then the deletion on its own
so it can be reverted independently (R10).

**The pre-approval conditions were met before R1 was built.** The author
recommended implementing the summation helpers against the real committed
columns first, so R1 is validated by execution rather than by review. That is
what happened: `pynum.ts` and its 100,000 committed cases were green before a
single pipeline module was ported, and the first end-to-end pilot run then
reproduced the golden master byte for byte on its first attempt.

### What the port is

| File | What |
|---|---|
| `pynum.ts` | R1. `pyRound`, `pyRoundInt`, `pyStr`, `pySumInt`, `pySumFloat`, `pySum`, `toBigInt`, `pyFormatFixed` |
| `csvio.ts` | R2. Python's default dialect, CRLF, QUOTE_MINIMAL, plus a streaming column reader for the 55MB ILO flows |
| `pyjson.ts` | R4. `json.dump`'s serialiser, and the tokenising reader R1's override clause needs |
| `schema.ts` | R7. `Tier`, `Measured`, `Vintage`, the branded `Int`, and `INT_COLUMNS` |
| `columns.ts` | Where a row value becomes a byte — the one place the `Int` brand decides `2989466` against `2989466.0` |
| `overrides.ts` | The `WeakMap` recording what `JSON.parse` would have erased |
| `config` `fetch` `build` `panel` `crosscheck` `report` `run` | R6. The seven modules |

**`pyRound` is implemented exactly, not by the probe's approximation.** R1 asks
for "half-to-even on the double's exact decimal value"; the source verification
recorded `toFixed(20)` + decimal half-to-even matching over 20,000 cases. The
port decomposes the IEEE-754 double into `mantissa * 2^exp` and computes the
exact terminating decimal expansion with BigInt, so the rounding decision is
made on the real value rather than on 20 places of it. Same answers on the
fixture, no approximation behind them.

### R3 / R4 / R5 — the `cmp` transcript

Interpreter that produced the golden master: **Python 3.13.1** (CI pin `3.13`).
Cache: `pipeline/raw/`, 133MB, from World Bank v2 + ILOSTAT SDMX + Eurostat.
The Python at `14a42df` was run first and reproduced every committed output with
zero diff, establishing that the golden master is current; the port was then run
against the same cache.

```
cmp pipeline/data/global_labor_dataset.csv       identical
cmp pipeline/data/global_labor_panel.csv         identical
cmp pipeline/data/ai_exposure_sensitivity.csv    identical
cmp pipeline/data/crosscheck_eurostat.csv        identical
cmp pipeline/data/outliers_for_review.csv        identical
cmp pipeline/data/pilot_labor_dataset.csv        identical
cmp pipeline/data/validation_report.txt          identical
cmp src/data/global_labor.json                   identical
cmp src/data/global_labor_timeseries.json        identical
cmp src/data/crosstabs/                          identical (218 files)
cmp pipeline/summary_report.md                   identical, excluding the one Generated line
cmp pipeline/data/global_labor_dataset.sqlite    6 bytes differ, all in the 100-byte header
```

**R5, in full.** Schema identical (same tables, columns, declared types,
primary key, and `idx_region` / `idx_rowtype` / `idx_panel`). All 229 snapshot
rows and 2,936 panel rows identical on every column *including runtime type*,
with 46,671 NULLs preserved as NULL — never `0`, never `""`. The six differing
bytes fall inside exactly the three fields the spec predicted:

| Offset | Field | Python | Node |
|---|---|---|---|
| 24 | change counter | 4 | 3170 |
| 92 | version-valid-for | 4 | 3170 |
| 96 | `SQLITE_VERSION_NUMBER` | 3048000 (3.48.0) | 3053003 (3.53.3) |

Page data is byte-identical.

**R4's render check.** A green build is not evidence the page renders, so the
page was loaded — `playwright-core` against system Chrome at 1440x900, the same
pattern `scripts/desktop-measure.mjs` uses. The wizard was driven intro → 01 →
02 → 03 → result. **Zero console errors, zero page errors, zero failed
requests.** The result screen renders `8.3%`, `13.86M` and `10.8 → 8.3% · -2.5
pp · 2013–2025` against payload values `8.2726`, `13856141` and `10.7501` →
`8.2726`, each with its `DERIVED` badge and its 2025 vintage.

### R6 — the CLI surface

All three flags, not just `--pilot`. `--pilot --out-dir <tmp>` wrote a
byte-identical pilot CSV to the temp directory and left `pipeline/data/`
untouched; `--no-app-json` left `src/data/global_labor.json` unmodified (the
timeseries write is not gated on it in the Python either, and is not here);
the bare run produced the eleven outputs above. `npm run report` reaches
`report.ts`'s entry point and passes `loadSensitivity()`, so the documented
path produces the same document the pipeline does.

### R8 `[~]` — the count, and two mechanism changes

**The suite is 137 tests, not 107.** It grew on `main` between this spec's
approval and its implementation; `CLAUDE.md` said 126 and was also stale. All
137 are ported and pass. With R1's and R2's own blocks the file count is **158
tests, 0 failures, 0.94s** offline — inside R8's 2s bound, against Python's
0.292s for the 137.

No test was dropped. Two changed mechanism, because the language does not offer
the lever the Python used, and both are recorded here rather than left for a
reviewer to find:

1. **The offline proof.** Python patched `socket.getaddrinfo`; Node's `fetch`
   does not go through it. The port replaces `globalThis.fetch` with a throwing
   stub instead. Same criterion — a live fetch raises, and the `cached` /
   `fetched` log assertion is unchanged.
2. **The delegation assertion.** `test_crosscheck_delegates_to_the_shared_summariser`
   patched `report.summarise_sensitivity` and checked `crosscheck.sensitivity`
   returned the sentinel — asserting the delegation itself rather than that two
   calls to one function agree, which stays green against the change it exists
   to catch. An ES module's exported bindings are read-only, so `report.ts`
   exposes `hooks.summariseSensitivity` and `crosscheck` calls through it. The
   test is unchanged in what it asserts.

`test_country_rows_carry_the_pair_corridorstates_keys_on` names
`src/utils/corridorStates.js`, which spec 0010 R1 deleted with the map. The
assertion — a country row carries a non-null `country_name` — outlived its
original consumer and now guards `countrySearch.js`, so it ports with its
rationale corrected rather than being dropped.

### R10 `[~]` — the deletion is total inside `pipeline/`, and one file survives outside it

No `.py` under `pipeline/`, and `npm run verify` passes on the deletion commit.
Two Python files did not simply disappear, and neither is a dual implementation:

- **`pipeline/tests/make_fixture.py` → `pipeline/tests/make-fixture.ts`.** It
  regenerates the golden-master cache, and a fixture nobody can regenerate is a
  fixture nobody can trust. Verified head-to-head against the Python on the same
  cache *before* the Python was deleted: **25 of 25 files byte-identical after
  decompression.** That took two fixes, and the second is this spec's own R1
  finding biting a maintenance script — the reader was re-emitting CRLF where
  Python's text mode had normalised it (63,281 extra bytes on one flow), and
  `JSON.parse` was erasing the int/float distinction so every World Bank integer
  came back spelled `1.0` (1,032 extra bytes per indicator file). The gzip
  *container* still differs from Python's and cannot be made to match; the
  fixture is read by decompressing and is never compared as bytes. **The
  committed fixture is not regenerated by this change.**
- **`scripts/generate-pynum-fixtures.py` is new, and is Python on purpose.** R1
  requires its cases be "generated once from the pinned interpreter, with the
  generator committed alongside so they can be regenerated if the pin moves" —
  which cannot be written in the language being verified. It sits under
  `scripts/`, not `pipeline/`, so R10's acceptance holds literally; it is never
  run by `verify` or by CI, and nothing imports it. It is the one thing a
  contributor needs if the toolchain pin ever changes.

### R9 — every place the Python was described

`CLAUDE.md` (layout, the stdlib rule, the command list, the toolchain section,
and a new note on why the number layer is load-bearing), `package.json` (all
five scripts, plus `typecheck` and `check:brand`), `pipeline/README.md` (the run
block, the "standard library only" sentence, the `unittest` description and its
invocation gotcha, the outputs table, and every `*.py` module reference),
`.github/workflows/ci.yml` (the stdlib comment and the `python-version` pin,
both removed). `package.json` gains **no runtime dependency**; `typescript` and
`@types/node` are devDependencies and nothing imports them at runtime.

**There is no build step.** Node 24 strips types natively, so `node
pipeline/run.ts` runs the pipeline directly. `tsconfig.json` sets
`erasableSyntaxOnly`, which refuses the constructs Node's stripper cannot erase
— so nothing can type-check here and fail to start there.

### A finding, recorded rather than fixed

Per the Non-goals, the port fixes nothing. One thing is worth naming: the
`_range` companions and `data_year_context` are computed but `data_year_context`
is never assigned by any loader — `load_worldbank` writes `data_year_*` for
`population`, `labor` and `sector` only, though `WB_INDICATORS` maps five
indicators to a `context` group. The column is therefore always null. The port
reproduces that exactly. It is a latent gap in provenance rather than a wrong
number, and it belongs in its own issue.

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
