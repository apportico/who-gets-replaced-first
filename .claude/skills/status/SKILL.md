---
name: status
description: Dashboard of every spec — status, requirement marks, and what is actionable next.
allowed-tools: Read, Glob, Grep, Bash
---

You are running the `/status` command. Scan the specs and show where the project stands.

## Step 1 — Discover

Glob `specs/*.md`, excluding `README.md` and `TEMPLATE.md`. If none, say so and suggest `/spec`.

## Step 2 — Parse each spec

Extract:

- **Number and title** — from the `# NNNN — <name>` heading
- **Status** — from `**Status:**` (draft, in-review, approved, in-progress, done)
- **Depends on** — from `**Depends on:**`
- **Requirement marks** — count `[ ]`, `[x]`, `[!]`, `[~]` across the `### R<n>.` headings
- **Unprobed sources** — rows in the *Source verification* table with an empty Result

Missing status → treat as Unknown.

## Step 3 — Display

```
# Who Gets Replaced First — spec status

## in-progress (N)
- **0003** — sector drilldown — 4/9 done, 1 revised, 4 open  (`feat/0003-sector-drilldown`)

## approved (N)
- **0004** — ...  (depends on 0003)

## draft / in-review / done (N)
- ...
```

Order the groups by what is actionable: in-progress, approved, in-review, draft, done, unknown. Show only non-empty groups.

Then check the branches: `git branch --list 'feat/*'` and `git worktree list`, and mark which in-progress specs have a live branch, plus the branch you are on now.

## Step 4 — Flag the things that block

Call these out explicitly, they are the project's own rules:

- Any spec at **in-review or later** with an unprobed source in its verification table.
- Any spec marked **done** that still has a `[ ]` requirement.
- Any requirement marked `[!]` or `[~]` whose reason line is missing.

## Step 5 — Suggest next actions

- **draft** → refine, then `/update-spec NNNN` to in-review
- **in-review** → awaiting review; note the open PR if `gh pr list` shows one for its branch
- **approved** → `/implement NNNN`
- **in-progress** → resume on its branch; `/evaluate NNNN` to check it against its acceptance criteria
- **nothing open** → suggest `/next` to pick the next task off the board, or `/spec` to write one
