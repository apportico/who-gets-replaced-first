---
name: next
description: Pick the next task off the GitHub project board, ranked by dependencies, milestone, priority and effort.
allowed-tools: Read, Bash, AskUserQuestion
---

You are running the `/next` command. Query the project's GitHub board and recommend what to work on.

## Step 0 — Discover the repo and board

Never hardcode these.

```bash
gh repo view --json owner,name -q '.owner.login + "/" + .name'
gh project list --owner <owner> --format json
```

Pick the project whose title matches this repo. If several match, ask. If the owner has no project board, say so and fall back to plain issues:

```bash
gh issue list --state open --json number,title,labels,milestone,body --limit 100
```

— then skip to Step 3, using labels for priority and the milestone for ordering.

## Step 1 — Fetch board items

```bash
gh project item-list <number> --owner <owner> --format json --limit 100
```

## Step 2 — Fetch open PRs

```bash
gh pr list --state open --json number,title,body --limit 100
```

Parse each body and title for `Closes #n` / `Fixes #n` / `Resolves #n` / `#n` and for a `specs/NNNN-*.md` path. Build the set of issues that already have work in flight.

## Step 3 — Parse each item

Extract: title, issue number, URL, status (Todo / In Progress / Done), priority, milestone, effort, labels, and **dependencies** — `#n` references in a Dependencies section of the issue body.

Also map each item to a spec if one exists: an issue whose title or body names `specs/NNNN-*.md`, or a spec whose title matches. Note the spec's `**Status:**` — an issue whose spec is already `in-progress` is further along than the board says.

## Step 4 — Dependency status

For each Todo item, resolve its dependencies against the board:

- **satisfied** — referenced issue is Done (or `gh issue view <n> --json state` says closed)
- **partially satisfied** — referenced issue is In Progress
- **blocked** — referenced issue is still Todo

Classify each item **Unblocked**, **Partially blocked** or **Blocked**.

Spec dependencies count too: an issue whose spec declares `**Depends on:** 0003` is blocked while spec 0003 is not `done`.

## Step 5 — Filter

Keep Todo and In Progress. Drop Done. Set aside anything with an open PR and list it separately as in-flight.

## Step 6 — Rank

In this order:

1. **Blocking status** — Unblocked > Partially blocked > Blocked
2. **Dependency depth** — foundational work (data pipeline, schema) before what consumes it
3. **Milestone** — earlier milestones first
4. **Status** — In Progress above Todo; finish what you started
5. **Priority** — Critical > High > Medium > Low (missing → Low)
6. **Effort** — among equals, smaller first

## Step 7 — Present

```
# Next task

## Recommended: <title>
- **Issue:** #<n> (<url>)
- **Priority / Milestone / Effort:** ...
- **Spec:** specs/NNNN-*.md (<status>) — or "none yet"
- **Dependencies:** all satisfied / <list with status>
- **Why this one:** <1-2 sentences>

### Action
<`/spec <name>` if no spec exists · `/implement NNNN` if the spec is approved · `/evaluate NNNN` if it is in-progress>

## Other candidates (ranked)
| # | Issue | Title | Priority | Effort | Status | Blocked by |

## In-flight (open PR)
| Issue | Title | PR |
```

Show up to 10 candidates and note the total.

## Step 8 — Offer to act

Suggest the concrete next command and **wait** for the user before running it.
