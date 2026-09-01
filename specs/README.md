# Specs

This project is spec-driven: **no code without a requirement ID.**

## How it works

1. A spec is a numbered file here — `NNNN-short-name.md`.
2. Every requirement gets an ID (`R1`, `R2`, …), a statement of what it must do,
   and **acceptance criteria** that can be checked, not just asserted.
   The header carries `**Status:**`, `**Depends on:**` and `**Issue:**`, plus
   `**Goal:**` — the checkable clauses the work must satisfy — when the spec was
   opened by `/sdlc`, which reads that field back to resume a run.
3. **Sources are probed before they are specified.** If a spec says "pull X from
   API Y", someone has already confirmed Y returns X. A spec is not a wishlist.
4. Every requirement ends in one of three states, marked in the file itself:

   | Mark | Meaning |
   |---|---|
   | `[x]` | Done, acceptance criteria met |
   | `[!]` | Investigated and **not feasible** — with the reason recorded |
   | `[~]` | **Revised** during implementation — with what changed and why |

5. `[!]` and `[~]` are first-class outcomes, not failures. A spec that ends up
   all `[x]` usually means the requirements were written to be easy.

## Why the marks matter

Two real examples from `0002`:

- **R2** was specced as "recover New Zealand and Saudi Arabia from OECD.Stat."
  Probing OECD's SDMX catalog showed it carries **no ISCO occupation dataflow
  at all**. Marked `[!]` with the reason. The gap is now documented in the
  README instead of being quietly filled with a modelled guess.
- **R11** was specced as "add a 15–34 early-career band." A first probe showed
  10-year age bands existed; a closer one showed those bands carry *skill level
  only, not ISCO*. Marked `[~]` and replaced with the career-stage profile
  (25–54, 55–64), which is available and more informative.

Both would have become silent bugs or invented numbers under a
build-first-document-later approach.

## Index

| Spec | Scope | Status |
|---|---|---|
| [0001](0001-labor-dataset.md) | Core dataset + map page | complete (written retrospectively) |
| [0002](0002-gaps-timeseries-and-app.md) | Coverage gaps, time series, derived measures, app features | 15 done · 1 revised · 1 not feasible |
| [0003](0003-ai-native-sdlc.md) | AI-native SDLC — verify command, review contract, settings, subagents, automated review | done — 4 done · 3 revised |
| [0004](0004-pipeline-regression-tests.md) | Pipeline regression test suite — tiers, nulls, weighting, vintages, golden master | done — 8 done · 1 revised |
| [0005](0005-ci-on-pull-requests.md) | CI on pull requests, merge gating, admin-bypass decision | done — 5 done |
| [0006](0006-eslint-worktree-ignores.md) | ESLint ignores worktrees and nested build output | done — 3 done |
| [0007](0007-pipeline-typescript-port.md) | Port the pipeline Python → TypeScript, verified byte-identical against the committed outputs | done — 9 done · 2 revised (R8 count, R10 one file outside `pipeline/`) · merged at `4c51b3b` |
| [0008](0008-mobile-and-accessibility.md) | Mobile layout, keyboard access, screen-reader equivalents, contrast and colour-vision | done — 9 done · 2 revised · evaluated at 58cef78 |
| [0009](0009-app-payload-drift.md) | The app payloads cannot drift from the code that writes them — regenerate `global_labor.json`, guard both | done — 6 done |
| [0010](0010-mobile-first-redesign.md) | Mobile-first rebuild — the Replacement Date wizard on shadcn/ui, map and corridor overlay deleted | in-progress — 15 done · 5 revised · 1 not feasible |
| [0011](0011-country-search.md) | Step 01 becomes a folded search over the 177 countries with an official series; `iso2` carried from the World Bank so `Intl.DisplayNames` supplies the alternates | done — 8 done · 3 revised (R1/R3/R9 by 0013) |
| [0012](0012-desktop-layout.md) | Desktop layout — one breakpoint at 768px, a 640px column, display scale, un-docked CTA, and the browser-measurement path restored | in-progress — 9 done · 3 revised, review rounds 1–2 addressed |
| [0013](0013-country-fold.md) | Step 01 opens folded — the selected country alone, a 12-row cap on matches and a 3-row cap on the stated absences, both truncations stated; and the 0011 criteria that passed against a 12,294px list tightened | in-progress |

## Starting a new spec

Copy `TEMPLATE.md`, take the next number, write the requirements **before**
writing code, and probe every source you intend to name.
