---
name: spec
description: Create a new numbered spec — probe the sources first, then write requirements with checkable acceptance criteria. Use when starting any new piece of work.
argument-hint: "[spec name]"
allowed-tools: Read, Write, Bash, Edit, Glob, Grep, WebFetch, AskUserQuestion
---

You are running the `/spec` command. Your job is to produce a numbered spec in `specs/` that is ready to implement — meaning **every source it names has already been probed**.

Read `specs/README.md` and `CLAUDE.md` before you start. The project rule is: no code without a requirement ID, and no requirement naming an unverified source.

## Step 1 — Name, number, branch

1. **Name**: use `$ARGUMENTS` if given, else ask. Generate a lowercase hyphenated short name (`coverage-gaps`, `sector-drilldown`).
2. **Number**: take the next free number — `ls specs/[0-9]*.md | tail -1` — zero-padded to 4 digits.
3. **Branch**: never work on `main`. Create `feat/NNNN-short-name`, or use `EnterWorktree` with that name for an isolated worktree. If already on a feature branch or in a worktree, stay there and say so.

## Step 2 — Objective and scope

Ask, one at a time, waiting for each answer:

1. **Objective** — what question does this let us answer that we cannot answer today? (One paragraph. If the answer is "it makes the page nicer", push for the underlying question.)
2. **Depends on** — which earlier spec numbers must be done first?
3. **Sources** — which APIs, datasets or files would this need? Get names, not gestures.
4. **Non-goals** — what could be confused with this and should NOT be built now?

If the user says "skip", record `_None identified._` rather than dropping the section.

## Step 3 — Probe the sources (MANDATORY — do not skip)

This is the step that makes the spec real. For **every** source named in Step 2:

1. Actually hit it — `curl` the API, read the cached file under `pipeline/raw/`, or fetch the docs page.
2. Record what came back: does it carry the field, at the granularity and vintage the requirement needs?
3. Note the coverage — how many countries/areas, which years.

Fill in the spec's *Source verification* table with what you **saw**, not what you expect:

| Source | Probed | Result |
|---|---|---|
| ILOSTAT `EMP_TEMP_SEX_OCU_NB` | `curl` SDMX 2026-08-29 | ISCO-08 1-digit, 118 countries, latest 2023 |

A source that fails the probe is a finding, not a blocker — write the requirement as `[!] not feasible` with the reason, or drop it and say why in *Non-goals*. Recording the failure beats filling the gap with a guess.

**Do not proceed to Step 4 until every source has a row.** If a probe is impossible right now (rate limit, needs a key), say so explicitly in the table and mark the dependent requirement as blocked.

## Step 4 — Write the requirements

Each requirement gets:

- An ID: `### R1. [ ] <requirement>`
- **What it must do** — one short paragraph.
- **Acceptance:** a check that can be *run*. "Canada carries a non-null `white_collar_pct`" beats "the fallback works". "`npm run pipeline:pilot` prints `[validate] US services 79.x`" beats "the numbers look right".

Requirements that touch data must state the **tier** of every number they produce (`OFFICIAL` / `DERIVED` / `PROXY` / `MODELED`) and where the tier is recorded. A requirement that produces a number with no tier is not finished being written.

Apply the project's non-negotiables as you write:

- Never impute a missing country — nulls stay null with a `data_quality_flag`.
- Record the year per field; never present a row as one vintage.
- Weight aggregates; publish coverage alongside.
- New figures in `manual_overrides.json` need a citation, a year and a retrieval date.

## Step 5 — Write the file

Copy `specs/TEMPLATE.md` to `specs/NNNN-short-name.md` and fill in: title, `**Status:** draft`, `**Depends on:**`, Objective, the Source verification table from Step 3, the requirements from Step 4, and Non-goals.

Show the user the file path and a summary (number, title, requirement count, sources probed) before moving on.

## Step 6 — Add the spec to the index

Add a row to the *Index* table in `specs/README.md`:

```
| [NNNN](NNNN-short-name.md) | <one-line scope> | draft |
```

## Step 7 — Open a draft PR

So the spec can be reviewed before any code exists.

```bash
git add specs/NNNN-short-name.md specs/README.md
git commit -m "docs: add spec NNNN — <short name>"
git push -u origin feat/NNNN-short-name
gh pr view --json url 2>/dev/null   # skip creation if a PR already exists
```

Create the draft PR with the body:

```markdown
> **Spec review** — draft PR for reviewing the spec. No implementation code yet.

**Spec:** `specs/NNNN-short-name.md`
**Issue:** Closes #<n>   <!-- omit if no matching issue -->
**Status:** draft

## Objective
<objective>

## Sources probed
| Source | Result |
|---|---|

## Requirements
- [ ] R1 — ...
- [ ] R2 — ...

## Non-goals
- ...
```

Find a matching issue first with `gh issue list --search "<name>" --json number,title --limit 5`; omit the `Closes` line if none matches.

If `gh pr create` fails, tell the user the spec was written but the PR was not created, and why.

## Step 8 — Next steps

Report the file path, the branch, and the PR URL. Then offer:

- **Review** — share the PR; once agreed, `/update-spec NNNN` to move it to `approved`.
- **Plan** — `/implement NNNN` to turn an approved spec into an implementation plan.
