# 0006 — ESLint ignores worktrees and nested build output

**Status:** done
**Depends on:** 0005 (made `npm run verify` the gate this defect breaks)
**Issue:** [#51](https://github.com/apportico/who-gets-replaced-first/issues/51)

## Objective

`npm run verify` fails at lint for anyone who has used a git worktree, for
reasons unrelated to their changes. Spec 0005 made that command the single gate
before work is handed to a human, and made CI require it — so a gate that fails
on unrelated grounds is worse than an inconvenience: it trains people to ignore
the one signal the project relies on, or to skip it entirely.

The divergence runs the wrong way from the usual case. CI is green because a
fresh clone has no worktrees; only the developer sees red. Spec 0005 R2's
lesson was *a local green that is not the gate*; this is its mirror — a local
red that CI cannot see.

## Source verification

Probed 2026-08-30 in the primary checkout, which has three worktrees on disk.

| Source | Probed | Result |
|---|---|---|
| `eslint.config.js` | read | `globalIgnores(['dist'])`. Flat-config ignore patterns are resolved **relative to the config file**, so a bare `dist` matches only the top-level directory — a nested `dist/` is not covered. |
| What ESLint actually walks | `npx eslint . -f json` | **63 files: 15 project, 48 under `.claude/worktrees/`** — 45 duplicate copies of `src/`, plus 3 minified Vite bundles. Most of the lint run is spent on copies of the project. |
| The failure | `npm run verify` | `✖ 339 problems (339 errors)`, then `verify FAILED at: lint`. All 339 come from the 3 bundles, 113 each — linting minified React and Leaflet. |
| ESLint v9 and `.gitignore` | ESLint v9 flat-config behaviour | v9 **does not read `.gitignore`**; ignores live in the config. So `.gitignore:6` (`.claude/*`) marking these untracked is not enough — untracked and ignored-by-lint are different things. |
| CI | run [33275720686](https://github.com/apportico/who-gets-replaced-first/actions/runs/33275720686) | Green. A fresh clone has no `.claude/worktrees/`, so CI never sees this. The break is local-only, which is why it survived 0005's review. |
| The fix | `globalIgnores(['**/dist', '.claude'])`, measured in the primary checkout | **15 files examined, 0 errors, `verify PASSED`.** Worktree files linted: 0. |

**Note on tiers:** this spec produces no published figures, so the
`OFFICIAL` / `DERIVED` / `PROXY` / `MODELED` rules bind no requirement here.

## Requirements

### R1. [x] `verify` passes in a checkout that has worktrees

`npm run verify` must exit 0 in a checkout containing `.claude/worktrees/`
holding built copies of the project — the state any contributor reaches after
one worktree and one `npm run build`.

`.claude/worktrees/` is not project source — it holds full checkouts of this
repo. `**/dist` covers nested build output wherever it appears, which is the
half that would still bite if worktrees moved elsewhere.

**Scoped to `worktrees`, not all of `.claude`.** The first version ignored the
whole directory. Review pointed out that `.gitignore` un-ignores
`.claude/hooks/`, `skills/`, `agents/` and `settings.json`, so a tracked hook
script would be real project code — and a blanket `.claude` would skip it
silently. Verified with a probe: a `.claude/hooks/probe.js` carrying two
deliberate errors is **invisible** to ESLint under `'.claude'` and **caught**
under `'.claude/worktrees'`, at no cost to the fix (15 project files either
way). Issue #4 is specifically about adding files to `.claude/hooks/`.

**Acceptance (met 2026-08-30, run in the primary checkout with three built
worktrees on disk):**

| Config | Result |
|---|---|
| `globalIgnores(['**/dist', '.claude'])` | `verify PASSED`, exit **0** |
| reverted to `globalIgnores(['dist'])` | `✖ 339 problems (339 errors)` → `verify FAILED at: lint` |

Checked in both directions, so the entry is demonstrably doing the work rather
than coinciding with a green run.

### R2. [x] ESLint examines project source only

Linting duplicate copies of `src/` is wasted work even when it passes, and a
worktree holding half-finished code would fail the primary checkout's lint for
changes that are not in it.

**Acceptance (met):** `npx eslint . -f json` → `total=15, under .claude/=0,
errors=0`. Before the fix: 63 files, 48 of them under `.claude/`. The
project-file count is unchanged at 15.

### R3. [x] The reason is recorded where the pattern is

The bare `dist` was not careless — it is what `npm create vite` generates, and
it is correct until a nested build directory exists. Someone tidying `**/dist`
back to `dist` would reintroduce this silently and CI would not catch it.

**Acceptance (met):** the comment above `globalIgnores` states all three.

## Non-goals

- **A test that guards the ESLint config.** Tempting after R3, but a test
  asserting the contents of an ignore list mostly restates the config, and the
  acceptance check in R1 (remove the entry, watch it fail) already demonstrates
  the entry works. Revisit if this regresses.
- **Reading `.gitignore` into ESLint** via `@eslint/compat`'s
  `includeIgnoreFile()`. It would couple lint scope to VCS scope, which is
  usually right but adds a dependency to solve a two-pattern problem — and
  `.gitignore` is deliberately more permissive here, un-ignoring
  `.claude/skills/`, `.claude/hooks/`, `.claude/agents/` and
  `.claude/settings.json` (`.gitignore:7-10`). Of those only `hooks/` could ever
  hold lintable code, and R1's scoping keeps it lintable.
- **Cleaning up the stale worktrees themselves.** Housekeeping, not a code
  change; done alongside but not specified here. The fix must work whether or
  not they exist.
- **Moving worktrees outside the repo.** Would sidestep the nested-`dist` half
  of this, but `.claude/worktrees/` is where the project's own tooling puts
  them, and `**/dist` is the more general fix.
