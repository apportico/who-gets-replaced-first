---
name: implement
description: Turn an approved spec into an implementation plan mapped to requirement IDs, and append it to the spec file.
argument-hint: "[spec number]"
allowed-tools: Read, Edit, Glob, Grep, Bash, Agent
---

You are running the `/implement` command. Your job is to read a spec, analyse the codebase, produce a plan whose every step maps to a requirement ID, and append it to the spec file.

## Step 1 — Resolve the spec

`$ARGUMENTS` may be a number (`0003`, `3`) or a short name. Match against `specs/[0-9]*.md`.

If no argument: list every `specs/[0-9]*.md` with its title and `**Status:**`, and ask which one.

If nothing matches, say so and suggest `/spec`.

## Step 2 — Validate status

Read the `**Status:**` field:

- **approved** → proceed.
- **draft** / **in-review** → warn that planning against an unapproved spec risks wasted work; ask before continuing.
- **in-progress** → warn that a plan may already exist under `## Implementation Plan`; ask whether to regenerate.
- **done** → stop unless the user explicitly asks to proceed.

Also check the *Source verification* table. **If any source the requirements depend on has no probe result, stop.** Offer to probe it now — a plan built on an unverified source is a plan to invent numbers.

## Step 3 — Read the spec and the codebase

From the spec, extract: Objective, the Source verification table, every requirement with its ID and acceptance criterion, and Non-goals.

Then explore the codebase for what this touches. The relevant map:

| Area | Where |
|---|---|
| Fetching an API | `pipeline/fetch.py`, cache under `pipeline/raw/` |
| Building rows / derived fields | `pipeline/build.py`, `pipeline/panel.py` |
| Config, country lists, tiers | `pipeline/config.py` |
| Validation and cross-checks | `pipeline/crosscheck.py`, `pipeline/run.py` |
| Nationally-sourced figures | `pipeline/manual_overrides.json` |
| Field documentation | `pipeline/README.md` |
| App | `src/` (React + Vite, Leaflet map) |

Note existing patterns to reuse rather than duplicate. The pipeline is **stdlib only — no pip installs**; a plan that needs a third-party package needs a different plan.

Summarise the findings before proposing the plan.

## Step 4 — Produce the plan

Structure it as:

1. **Files to create** — path and purpose.
2. **Files to modify** — path and what changes.
3. **Sequence** — ordered steps with dependencies between them.
4. **Requirement mapping** — a row per requirement ID:

   | Req | How it will be satisfied | Where | How acceptance is checked |
   |---|---|---|---|
   | R1 | ... | `pipeline/build.py` | `npm run pipeline:pilot` prints ... |

   Every requirement must appear. If a step serves no requirement, it is scope creep — drop it or write the requirement.
5. **Tier and vintage handling** — for every new number: its tier, where the tier is recorded, and where its year is recorded.
6. **Validation** — which regression checks (`[validate]`, `[crosscheck]`, `[outliers]`) will cover this, and whether a new check is needed.
7. **Risks** — what could make a requirement infeasible, and which sources are shaky.

Present the plan and **wait for confirmation** before writing anything.

## Step 5 — Write the plan into the spec

After confirmation:

1. Append `## Implementation Plan` to the spec file, before `## Non-goals` if present, with `**Planned:** <YYYY-MM-DD>` and the subsections from Step 4.
2. Change `**Status:**` to `in-progress`.
3. Update the spec's row in the `specs/README.md` index.

## Step 6 — Publish

```bash
git add specs/NNNN-*.md specs/README.md
git commit -m "docs: add implementation plan for NNNN"
git push
```

If a PR exists for this branch (`gh pr view --json number`), update its body to list the requirement checklist and the plan summary.

## Step 7 — Hand off

Report the branch, the plan summary, and ask whether to start on step 1. During implementation:

- Mark each requirement `[x]` only once its acceptance check has actually been **run** and passed — paste the output.
- Mark `[!]` with the reason if it turns out infeasible, `[~]` with what changed and why if it needed revising. Both are correct outcomes.
- Run `npm run pipeline:pilot` (or the full `npm run pipeline`) and read the output before claiming a data change worked. `npm run build` passing is not evidence the page renders — load it.
