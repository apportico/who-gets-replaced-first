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
| `round()` semantics | 8 hand-picked cases in both languages | Python `round` matches **neither** `Math.round(x*10**n)/10**n` **nor** `toFixed(n)`. `round(2.675,2)=2.67` (naive JS: 2.68); `round(2.5)=2` (naive: 3); `round(-2.5)=-2` (`toFixed`: -3). 36 `round()` call sites in `build.py`. |
| A Python-compatible `pyRound` in JS | Implemented via `toFixed(20)` + decimal-string half-to-even; **20,000 randomised differential cases against Python** | **0 mismatches.** The algorithm is proven before being specified. |
| SQLite byte-reproducibility | Built the same table+index in `sqlite3` and `node:sqlite`, `cmp -l` | **Exactly 4 bytes differ, all in the 100-byte header**: change counter (offset 24), version-valid-for (92), and **`SQLITE_VERSION_NUMBER` (96) — 3048000 vs 3053003**. Page data byte-identical. Byte-identical SQLite is **impossible**: the runtimes bundle SQLite 3.48.0 and 3.53.3. |
| App JSON | `JSON.parse` → `JSON.stringify` round-trip of the tracked `src/data/global_labor.json` | **Not byte-identical**: 604,736 → 602,610 bytes. 779 `.0` values lose their decimal. `run.py:278` writes it with `separators=(",", ":")`. This output is **not mentioned in issue #21's scope**. |
| The test suite | `pipeline/tests/context.py`, import graph, `python3 -m unittest discover` | **107 tests, 1,512 lines, pass in 0.292s.** They `import build` / `import config` through a `sys.path` shim — they bind to the **Python modules** and die with them. **Not mentioned in issue #21's scope.** |
| Response cache | `du -sh pipeline/raw` | **80MB present** (`eurostat`, `ilostat`, `worldbank`) — the golden-master comparison can run offline. |
| CLI surface | `grep add_argument pipeline/run.py` | **Three flags**: `--pilot`, `--no-app-json`, `--out-dir`. Issue #21 names only `--pilot`. |
| Golden-master surface | `git ls-files pipeline/data/ src/data/` | **9 tracked outputs**: 6 CSVs, `global_labor_dataset.sqlite`, `validation_report.txt`, plus `src/data/global_labor.json` and `global_labor_timeseries.json`. |

**Note on tiers.** This spec produces **no new figures**. Every number it emits
already exists and carries a tier; the port's whole obligation is to reproduce
those values and their tiers unchanged. That obligation is what R3–R5 check, so
the `OFFICIAL` / `DERIVED` / `PROXY` / `MODELED` rules bind here as an
*equality* requirement rather than an assignment one. No requirement in this
spec may introduce a value the Python did not already produce.

## Requirements

### R1. [ ] A number layer that reproduces Python's arithmetic and formatting

Two helpers, with the port using them everywhere the Python uses `round()` or
writes a float:

- `pyRound(x, n)` — half-to-even on the double's exact decimal value.
- `pyStr(x)` — Python's `repr`: `.0` on integral floats, `-0.0` preserved.

**Acceptance:**
- `pyRound` matches Python on **≥20,000 randomised differential cases**, 0
  mismatches. (Verified above for the draft implementation; the check moves
  into the test suite.)
- `pyStr` reproduces all **78,257** numeric strings in the committed CSVs from
  their parsed doubles, including the **6,256** `.0` values and the **30**
  `-0.0` values, 0 mismatches.

### R2. [ ] A hand-rolled CSV reader/writer, zero runtime dependencies

Python's default dialect, CRLF terminators, `QUOTE_MINIMAL`, and a field-size
ceiling matching `csv.field_size_limit(10_000_000)`.

**Acceptance:** the reader/writer round-trips **all 6 committed CSVs byte for
byte** — read then write reproduces the input exactly, `cmp` clean, including
quoted fields and the CRLF terminators.

### R3. [ ] The 6 CSV outputs are byte-identical

Run against the same cached `pipeline/raw/`, the TypeScript pipeline reproduces
`global_labor_dataset.csv`, `global_labor_panel.csv`, `ai_exposure_sensitivity.csv`,
`crosscheck_eurostat.csv`, `outliers_for_review.csv` and `pilot_labor_dataset.csv`.

**Acceptance:** `cmp` exits 0 for each of the 6 files against the committed
version. Not "diffs explained" — **zero bytes differ.** Any difference is
treated as a defect in the port until proven otherwise.

### R4. [ ] The app JSON outputs are byte-identical

`src/data/global_labor.json` and `global_labor_timeseries.json` are consumed by
the app and tracked in git. A stock `JSON.stringify` **loses 2,126 bytes** on
the first one, so the port needs a serialiser using `pyStr` for numbers and
Python's `separators=(",", ":")` spacing.

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

**Acceptance:** `--pilot`, `--no-app-json` and `--out-dir` all behave as before
(all three, not just `--pilot`). `npm run pipeline:pilot` prints its
`[validate]`, `[crosscheck]` and `[outliers]` blocks, and the anchors land
unchanged: **World services ≈50%, US ≈79%, EU-27 ≈72%, India ≈31.5%**. A moved
anchor exits non-zero, as spec 0003 established.

### R7. [ ] A shared schema module, consumed on both sides

`Tier` as `'OFFICIAL' | 'DERIVED' | 'PROXY' | 'MODELED'`; `number | null`
wherever a country may be missing; a per-field vintage type pairing a value with
its year.

**Acceptance:** a value assigned without a tier, a null coerced to `0`, and a
value used without its year each **fail `tsc --noEmit`**. Demonstrated by three
deliberately broken snippets that must not compile — the requirement is not met
by the types existing, only by them rejecting these three.

### R8. [ ] The 107 tests ported, still passing

The suite binds to the Python modules through `pipeline/tests/context.py` and
would be deleted along with them. It is the safety net #21 depends on, so it
ports in this spec rather than a later one.

**Acceptance:** all **107** tests pass against the TypeScript pipeline, offline,
in **under 2s** (Python: 0.292s). `npm run test:pipeline` runs them. No test is
dropped without being recorded here as `[~]` with its reason.

### R9. [ ] The dependency policy is written down

`CLAUDE.md`'s "stdlib only, no pip installs" describes a Python pipeline that
will no longer exist. It is replaced by an explicit Node policy: **zero runtime
dependencies** — `node:sqlite`, `fetch`, `node:zlib` and `node:util`'s
`parseArgs` are native on Node 24, and CSV is hand-rolled per R2.

**Acceptance:** `package.json` gains **no new runtime dependency**. `CLAUDE.md`'s
stdlib rule, layout section and command list reflect the ported pipeline.

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
