---
name: evaluate
description: Check the current branch's changes against its spec's acceptance criteria and produce a pass/fail report per requirement.
argument-hint: "[spec number]"
allowed-tools: Read, Edit, Glob, Grep, Bash, Agent, Skill, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__computer, mcp__claude-in-chrome__read_page, mcp__claude-in-chrome__read_console_messages, mcp__claude-in-chrome__tabs_create_mcp, mcp__claude-in-chrome__tabs_context_mcp, mcp__claude-in-chrome__resize_window
---

You are running the `/evaluate` command. Review the branch against its spec and produce a verdict **per requirement ID**, backed by evidence you actually generated.

The rule for this whole skill: **a criterion passes only if you ran its check and read the output.** Reading the diff and reasoning that it should work is `Unclear`, not `Pass`.

## Step 1 — Resolve the spec

`$ARGUMENTS`, else derive from the branch (`feat/NNNN-name` → `specs/NNNN-name.md`), else list the specs and ask.

## Step 2 — Validate state

Check `**Status:**` — in-progress is the normal case; warn for draft/in-review/approved; note but proceed for done (useful post-merge).

```bash
git rev-list --count main..HEAD
```

If 0, warn that there is nothing to evaluate and stop unless the user insists.

## Step 3 — Read the spec and the diff

From the spec: every requirement ID, its text, its acceptance criterion, its current mark; the Source verification table; Non-goals.

```bash
git diff main...HEAD --stat
git diff main...HEAD
```

## Step 4 — Run the checks

Work out which of these the diff touches and run them. Do not skip a check because the change "obviously" works.

### 4a — Pipeline changes (`pipeline/**`)

```bash
npm run pipeline:pilot
```

Read the `[validate]`, `[crosscheck]` and `[outliers]` blocks and quote them in the report. The known regression anchors are World services ≈50%, US ≈79%, EU-27 ≈72%, India ≈31.5%, plus the Eurostat cross-check of all 27 EU members. A moved anchor is a finding, not noise.

If the change affects the full run rather than the pilot set, say so and ask before running `npm run pipeline` (it is slower, though cached).

Then check the data discipline directly on the output — these are the project's non-negotiables and they are checkable:

- No country that was null before is now non-null without a source. Compare the per-`(country, field)` null **mask** before and after, not the null count — a count is invariant to a swap, so one country gaining an imputed value while another loses one passes a count check while breaking "never impute a missing country". Every cell flipping null → populated needs an attributable source; every cell flipping populated → null is a finding too.
- Every new field carries a tier (`OFFICIAL` / `DERIVED` / `PROXY` / `MODELED`) and a per-field year.
- Any new entry in `manual_overrides.json` has a citation, a year and a retrieval date.
- Aggregates are weighted and publish their coverage.

### 4b — App changes (`src/**`, `index.html`, `vite.config.js`)

```bash
npm run lint && npm run build
```

**A clean build is not evidence the page renders** — a runtime error builds fine. So also load it:

1. Start the dev server yourself if it is not up: check `lsof -ti :5173`, else `npm run dev` in the background and poll `http://localhost:5173` for up to 30s.
2. Open it with the Chrome tools (`tabs_create_mcp` then `navigate`), take a screenshot, and **read the console** (`read_console_messages`) — report any errors.
3. Check the viewports the change affects — 1440×900 desktop and 375×812 mobile at minimum, via `resize_window`.
4. If the change touches the map, confirm tiles actually load (Esri light gray canvas, `{z}/{y}/{x}`), not just that the container renders.

If you are debugging the production build instead, serve `dist/` with a plain static server — `vite preview` caches `index.html` in memory and will happily serve a stale page.

## Step 5 — Verdict per requirement

| Req | Criterion | Status | Evidence |
|---|---|---|---|
| R1 | ... | Pass / Fail / Unclear | command output, `file:line`, screenshot |

`Pass` needs the acceptance check run and its output quoted. If a requirement turned out infeasible or was revised mid-flight, say so and recommend `[!]` or `[~]` via `/update-spec` — do not score it Fail.

## Step 6 — Scope and sources

- **Out of scope**: changed files that serve no requirement, and anything listed in Non-goals that got built anyway. Informational, but state it.
- **Sources**: any source used in the code that has no row in the *Source verification* table. This is a blocker under the project rules — flag it as such.

## Step 7 — Report

```
# Evaluation — NNNN <title>

**Branch:** <branch>   **Commits ahead of main:** <n>

## Requirements
| Req | Status | Evidence |

**Summary:** X pass · Y unclear · Z fail

## Checks run
- `npm run pipeline:pilot` → <the validate/crosscheck lines>
- `npm run lint && npm run build` → <result>
- Page loaded at localhost:5173 → <console clean? screenshot>

## Out of scope
## Unverified sources
## Overall assessment
```

## Step 8 — Optionally post to the PR

Ask before posting. If yes: `gh pr view --json number,isDraft`, then `gh pr comment <n> --body "<report>"`. If the PR is a draft and nothing failed, offer `gh pr ready <n>`.

Finally, offer to apply the resulting marks with `/update-spec NNNN`.
