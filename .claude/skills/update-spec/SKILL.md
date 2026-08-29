---
name: update-spec
description: Update a spec — mark requirements done, not feasible, or revised, and move the spec's status with lifecycle enforcement.
argument-hint: "[spec number]"
allowed-tools: Read, Edit, Glob, Grep, Bash
---

You are running the `/update-spec` command. Your job is to update an existing spec while enforcing the project's lifecycle and its rules about requirement marks.

## Step 1 — Resolve the spec

`$ARGUMENTS` may be a number or a short name; match against `specs/[0-9]*.md`. With no argument, list every spec with its title, status, and mark tally, and ask which one.

## Step 2 — Show current state

Display: number, title, `**Status:**`, the first line of the Objective, and the requirement tally — how many `[ ]`, `[x]`, `[!]`, `[~]`.

## Step 3 — Ask what to change

1. **Mark a requirement** — `[x]` done, `[!]` not feasible, `[~]` revised
2. **Update status** — move the spec through its lifecycle
3. **Edit a section** — Objective, Source verification, a requirement, Non-goals
4. **Add a requirement** — a new ID on an existing spec
5. **Several of the above**

## Step 4a — Marking a requirement

The marks are the heart of this project's spec discipline. Enforce them:

| Mark | Meaning | What you must have before applying it |
|---|---|---|
| `[x]` | Done | The acceptance criterion was **run** and passed. Ask for the output. "It looks right" is not evidence. |
| `[!]` | Not feasible | A recorded **reason** — usually a probe that came back empty. Write what was probed and what came back. |
| `[~]` | Revised | **What changed and why.** Rewrite the requirement text to what was actually built, and keep the original intent visible. |

`[!]` and `[~]` are first-class outcomes — never talk the user out of them, and never quietly convert one into `[x]`. If the user marks `[x]` and the acceptance criterion has not been checked, say so and offer to run it.

Append the reason under the requirement, in the file:

```markdown
### R4. [!] Recover NZ and SA from OECD.Stat

**Not feasible (2026-08-29):** probed the OECD SDMX catalog — it carries no ISCO
occupation dataflow at all. Gap documented in `pipeline/README.md` instead.
```

## Step 4b — Status transitions

| From | Allowed to |
|---|---|
| draft | in-review |
| in-review | approved, draft |
| approved | in-progress |
| in-progress | done, approved |
| done | _(none)_ |

Reject anything else and list what is allowed.

Extra checks:

- **draft → in-review**: every source named in a requirement has a row in the *Source verification* table. If not, block — that is the project's first rule.
- **approved → in-progress**: an `## Implementation Plan` section exists. If not, suggest `/implement` but allow the user to proceed.
- **in-progress → done**: **no requirement may still be `[ ]`.** List every unmarked one and stop. Every requirement must end `[x]`, `[!]` or `[~]`. Then confirm each `[x]` had its acceptance check actually run.
- **in-review → draft** or **in-progress → approved**: ask for the reason and record it in the spec.

## Step 5 — Apply, index, publish

1. Edit the spec file.
2. Update the spec's row in the `specs/README.md` index — status, and the tally for a completed spec (e.g. `15 done · 1 revised · 1 not feasible`).
3. If a remote tracking branch exists (`git rev-parse --abbrev-ref --symbolic-full-name @{u}`), commit and push:
   - status change → `docs: NNNN status -> <status>`
   - requirement mark → `docs: mark NNNN R<n> <done|not feasible|revised>`
4. If there is no remote branch, skip silently.

## Step 6 — Confirm

Summarise what changed and the new tally. If the status became **done**, suggest `/evaluate` if it has not run, and opening or merging the PR. Ask whether there is anything else to update.
