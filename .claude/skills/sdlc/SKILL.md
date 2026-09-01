---
name: sdlc
description: Run the whole spec-driven loop for one ticket end to end — spec, review, approve, implement, evaluate, merge — babysitting the PR between phases and stopping only when the ticket's goal is met or a human is genuinely needed.
argument-hint: "<issue-number-or-slug> [cadence] [/goal <text>]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill, ScheduleWakeup, AskUserQuestion, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__computer, mcp__claude-in-chrome__read_page, mcp__claude-in-chrome__read_console_messages, mcp__claude-in-chrome__tabs_create_mcp, mcp__claude-in-chrome__tabs_context_mcp, mcp__claude-in-chrome__resize_window
---

You are running the `/sdlc` command. It drives one ticket through the entire
project loop — `/spec` → review → `/update-spec` → `/implement` → build →
`/evaluate` → review → merge — and keeps the PR moving between phases with
`/babysit` and `/address-reviews`.

**The operating rule: run to the end without asking.** The user invoked `/sdlc`
precisely so they would not be consulted at every step. Do not ask to confirm a
plan, to start implementing, to push, to post the evaluation, or to run the next
phase. Ask only at a **gate** (Step 12) — the short list of things that are
genuinely the user's call. Everything else you decide and do.

**The goal is the stop condition.** Not "the PR merged" — the goal. It is
derived from the issue (title + `## Definition of done`, or the whole body if
there is no such section) unless `/goal <text>` overrides it.

**Use `/goal` to hold it — do not re-implement goal tracking here.** `/sdlc`
sets the goal with `/goal` at Step 1, checks against it at every phase boundary,
and asks it for the final verdict at Step 9. `/sdlc` also mirrors the goal into
the spec's `**Goal:**` field and the PR body, because a loop iteration resumes in
a fresh turn and the spec is what survives — the file is the durable copy, `/goal`
is the tracker. A merged PR that does not meet the goal is not done.

## Phases

| # | Phase | Skill | Exits when |
|---|---|---|---|
| A | Spec | `/spec` | Spec written, **non-draft** PR open |
| B | Spec review | `/babysit` + `/address-reviews` | PR `reviewDecision: APPROVED` |
| C | Approve | `/update-spec` | Status `approved` |
| D | Plan + build | `/implement` | Every requirement marked, `npm run verify` green, pushed |
| E | Evaluate | `/evaluate` | Report + snapshots posted to the PR |
| F | Code review | `/babysit` + `/address-reviews` | PR `APPROVED`, CI green |
| G | Merge + close | `/update-spec`, `/goal` | Merged, spec `done`, issue closed, goal met |

## Step 0 — Parse the arguments

`$ARGUMENTS` is `<ticket> [cadence] [/goal <text>]`, in any order after the ticket.

| Token | Meaning |
|---|---|
| A bare integer, `#27`, or an issue URL | The ticket. Required. |
| A slug (`sex-disaggregated`, `country-search`) | The ticket, resolved by search |
| `Ns` / `Nm` / `Nh` / `N min` / `N mins` / `N minutes` | Babysit cadence |
| `/goal <rest of line>` | Custom goal — everything after `/goal` is the goal text |

**Cadence default is 5 minutes (300s).** Convert to seconds: `m`→×60, `h`→×3600,
clamp to `[60, 3600]`. Use the number the user gave; do not adjust it for cache
windows.

If no ticket was given, run `/next` to pick one, tell the user which it picked,
and continue — do not stop to ask.

## Step 1 — Resolve the ticket and fix the goal

```bash
gh repo view --json owner,name -q '.owner.login + "/" + .name'
gh issue view <n> --json number,title,body,labels,milestone,state,url
```

For a slug: `gh issue list --search "<slug>" --json number,title,state --limit 5`.
One open match → use it. Several → ask (this is a gate). None → say so and stop.

Then set the **goal contract** with `/goal` — three to six clauses, each one
checkable:

```
GOAL (issue #27 — feat: sex-disaggregated occupation data)
1. Per-sex ISCO shares exist with their own coverage figures.
2. The existing SEX_T totals are byte-identical to before.
3. pipeline/README.md documents the total-vs-disaggregated coverage difference.
4. Every new number carries a tier and a per-field year.
```

Take clauses from `## Definition of done` where the issue has one, from `##
Scope` otherwise. A `/goal` argument **replaces** the derived clauses — say so
in the output rather than merging the two silently. The last clause is always
present: this project's data non-negotiables are part of every goal, whether or
not the issue restates them.

Hand that block to `/goal`, and mirror it into the spec under `**Issue:**` (Step
3) and the PR body. It is now fixed for the whole run — **on resume, recover it
from the spec's `**Goal:**` field**, never by re-reading the issue, and re-arm
`/goal` with it if the loop has re-entered in a fresh session.

## Step 2 — Detect where this run already is

`/sdlc` re-enters itself on a loop, so **every run starts by working out which
phase it is in**. Never assume phase A.

```bash
git branch --show-current
ls specs/[0-9]*.md
gh pr list --search "<issue-number> in:body" --json number,headRefName,state --limit 5
gh pr view --json number,url,state,isDraft,reviewDecision,mergeable,mergeStateStatus,statusCheckRollup 2>/dev/null
```

Resolve the phase from what exists:

| Found | Phase |
|---|---|
| No spec naming this issue | A |
| Spec exists, status `draft`/`in-review`, PR open | B |
| PR `APPROVED`, spec still `in-review` | C |
| Spec `approved`, no `## Implementation Plan` | D (plan) |
| Plan exists, requirements still `[ ]`, or `verify` not green | D (build) |
| All requirements marked, no evaluation comment on the PR | E |
| Evaluation posted, PR not approved | F |
| PR `APPROVED` + CI green | G |

Announce the phase in one line, then run it. Phases are resumable and each is
idempotent — re-running a phase must not duplicate a commit, a comment or a
label.

## Step 3 (Phase A) — Spec, and **no draft**

Invoke `/spec` with the ticket. Two overrides to its normal behaviour:

1. **The PR is not a draft.** `/spec` step 7 runs `gh pr create --draft --label
   spec-review`. Drop `--draft`, keep `--label spec-review`. The automated
   reviewer (`.github/workflows/claude-review.yml`) gates on
   `draft == false || contains(labels, 'spec-review')`, so a ready PR is
   reviewed unconditionally — removing draft loses nothing and stops the PR
   sitting in a state nobody reviews. Keep the label: it still marks intent, and
   it is what makes a spec-only PR legible on the board.
2. **Answer `/spec`'s scoping questions from the issue** rather than putting them
   to the user. Objective, scope and non-goals are in the issue body; that is
   what the issue is for. Only ask if the issue is genuinely silent on something
   a requirement depends on.

`/spec`'s source-probing step is **not** overridable. A requirement naming an
unprobed source is the one thing this workflow will not produce, cadence or no
cadence. If a probe comes back empty, write the requirement as `[!]` with the
probe result — that is a correct outcome, not a blocker.

Then, defensively:

```bash
gh pr ready <n>                       # no-op if already ready
gh pr view <n> --json isDraft -q .isDraft   # must print false
```

If it still prints `true`, stop and report — a draft PR silently skips the one
review this workflow depends on.

Write the goal into the spec, directly under `**Issue:**`:

```markdown
**Goal:** <one line>, checked as:
1. ...
```

and append the same block to the PR body. Commit with the spec.

## Step 4 (Phase B) — Publish the spec and babysit it

```bash
/update-spec <NNNN>    # draft -> in-review
```

`/update-spec` blocks `draft → in-review` while any source named in a
requirement has no row in the *Source verification* table. If it blocks, go
probe the source — do not weaken the requirement to get past the gate.

Then run **one tick** of `/babysit <pr> <cadence>` per `/sdlc` loop iteration.
For any thread `/babysit` classifies as needing a code or spec change beyond a
mechanical fix, hand it to `/address-reviews <pr>` — that skill fixes, replies
and resolves properly, and it is the one the project's review contract is
written against.

**`/babysit` schedules its own next tick. `/sdlc` does not want that** — control
must come back here, not to a bare `/babysit`. So: take `/babysit`'s tick output,
suppress its re-schedule, and schedule the `/sdlc` re-entry yourself (Step 11).

Phase B exits when `gh pr view <pr> --json reviewDecision` is `APPROVED`.
`CHANGES_REQUESTED` keeps the loop running through `/address-reviews`.

## Step 5 (Phase C) — Approve the spec

```bash
/update-spec <NNNN>    # in-review -> approved
```

Record in the spec who approved it and the review URL.

## Step 6 (Phase D) — Plan, then build it, without asking

Invoke `/implement <NNNN>`. One override: its Step 4 ends "Present the plan and
**wait for confirmation**". Under `/sdlc` you **do not wait** — print the plan,
write it into the spec, move the status to `in-progress`, push, and start on step 1.
The user's confirmation was the `/sdlc` invocation.

Then execute the plan, in its own sequence order. While building:

- **Mark each requirement the moment its acceptance check has actually run** —
  `[x]` with the output pasted, `[!]` with the probe that came back empty, `[~]`
  with what changed and why. Do not batch the marks to the end; a run that dies
  mid-phase should leave the spec telling the truth about how far it got.
- `[!]` and `[~]` are successes. Never inflate one into `[x]` to keep the loop
  moving, and never invent a number to satisfy a requirement — that is the
  project's first rule and it outranks finishing.
- Check `/goal` before you call the build complete. A plan step that serves no
  requirement is scope creep; a goal clause no requirement covers is a missing
  requirement — add it via `/update-spec` rather than building it unspecced.

Phase D does not exit until:

```bash
npm run verify        # lint + build + pipeline tests + pilot — must be green
```

`verify` is the gate this project handed to CI, so a green local `verify` is what
makes the push safe. Iterate until it passes; do not push red and let the loop
find it. If `verify` skips the pilot because `pipeline/raw/` is absent, run
`npm run pipeline:pilot` once to populate the cache and re-run.

Then push:

```bash
git push
```

## Step 7 (Phase E) — Evaluate, and post the snapshots

Run `/evaluate <NNNN>`. Its Step 8 asks before posting to the PR; under `/sdlc`
**post without asking** — the evaluation is the evidence the reviewer in phase F
reads, and a report that stays in the terminal is a report nobody sees.

**Snapshots ship with the report.** What a snapshot is depends on what changed:

*App changes (`src/**`, `index.html`, `vite.config.js`)* — real screenshots.
`/evaluate` already loads the page in Chrome; save its captures rather than
describing them:

```bash
mkdir -p .snapshots/<NNNN>
# one PNG per affected screen per viewport, named <step>-<width>.png
git add .snapshots/<NNNN> && git commit -m "docs: NNNN evaluation snapshots" && git push
```

Then embed them in the PR comment by raw URL at the pushed SHA:

```markdown
![step 04 — 375px](https://raw.githubusercontent.com/<owner>/<repo>/<sha>/.snapshots/<NNNN>/step04-375.png)
```

375×812 and 1440×900 are the minimum pair — this project's design is
mobile-first with exactly one width breakpoint at 768px, so a change that is
only shown at one width is only half shown.

**Committing the PNGs is settled** (2026-09-01) — it is the only way an image
renders in a PR comment, since GitHub has no attachment API. `.snapshots/` sits
outside `src/` and `public/`, so nothing there reaches a build. Keep it that way:

- **PNG only**, and only of the screens the change actually touches. A snapshot
  of an unchanged screen is weight with no evidence in it.
- **One directory per spec**, `.snapshots/NNNN/`. Never a shared dump.
- **Re-evaluating overwrites** the existing files at the same names rather than
  adding `-v2`. The PR comment points at a SHA, so history keeps the old ones.
- If a capture comes out over ~500KB, it is a full-page shot of something that
  needed a viewport — retake it rather than committing it.

*Pipeline changes (`pipeline/**`)* — the snapshot is the numbers. Quote the
`[validate]`, `[crosscheck]` and `[outliers]` blocks verbatim in the comment,
with the four regression anchors (World ≈50%, US ≈79%, EU-27 ≈72%, India ≈31.5%)
called out as moved or held. Add the before/after null **mask** diff for any
touched field — a null count is invariant to a swap and will pass while
"never impute a missing country" is being broken.

Post one comment carrying the per-requirement verdict table, the checks you ran
with their output, and the snapshots:

```bash
gh pr comment <pr> --body-file <path>
```

If a requirement comes back `Fail` or `Unclear`, do **not** advance to phase F —
go back to phase D, fix it, and re-evaluate. Re-posting an evaluation replaces
the previous comment (edit it via `gh api -X PATCH`) rather than stacking a
third and fourth copy on the PR.

## Step 8 (Phase F) — Babysit the implementation PR

Same mechanics as phase B: one `/babysit <pr> <cadence>` tick per loop
iteration, `/address-reviews <pr>` for anything substantive, `/sdlc` owns the
re-schedule.

Two things to watch that phase B does not have:

- **CI.** `/babysit` auto-fixes lint and leaves typecheck/test/build failures to
  a human. Under `/sdlc` you own the branch, so fix those too — re-run
  `npm run verify` locally, fix, push. Escalate only if the failure needs a
  decision rather than a fix.
- **A review finding that contradicts the spec.** REVIEW.md puts re-litigating a
  decision the spec already records out of scope. Reply with the spec reference
  and the requirement ID; do not silently rebuild to match the comment.

## Step 9 (Phase G) — Merge and close out

Merge only when **all** of these hold — check them, do not assume:

```bash
gh pr view <pr> --json reviewDecision,mergeable,statusCheckRollup
```

1. `reviewDecision` is `APPROVED`.
2. Every check in `statusCheckRollup` is green (`verify` is a required check and
   `enforce_admins` is true — there is no merging around it).
3. No requirement in the spec is still `[ ]`.
4. Every clause of the goal contract is met, with the evidence named.

Then:

```bash
gh pr merge <pr> --squash --delete-branch
/update-spec <NNNN>            # in-progress -> done
gh issue close <n> --comment "Done in #<pr>. <one-line goal check>"
```

`/update-spec` refuses `in-progress → done` while any requirement is `[ ]`. If it
refuses, it is right and you merged too early — mark the requirement honestly.

Finally, run `/goal` for the verdict and print it: every clause, met or not,
with the evidence. That is the run's actual output — not the merge commit.

## Step 10 — Report each iteration

Every loop iteration ends with a compact block. Keep it grep-friendly — the next
iteration reads it for context:

```
/sdlc #27 — feat: sex-disaggregated occupation data
Spec:   specs/0013-sex-disaggregated.md (in-progress)
PR:     #71 — https://github.com/<owner>/<repo>/pull/71 (ready, APPROVED pending)
Phase:  D (build) — 4/7 requirements marked
CI:     verify green
Goal:   2/4 clauses met — (3) README coverage note outstanding
Next:   R5 per-sex coverage columns, then npm run verify
```

## Step 11 — Schedule the next iteration

`/sdlc` owns its loop. At the end of each iteration, either stop (Step 12) or
`ScheduleWakeup`:

- **prompt** — the original invocation, verbatim, including the cadence and any
  `/goal` text: `/sdlc 27 3m` or `/sdlc 27 /goal ship per-sex coverage only`.
  Step 2 re-detects the phase, so the same prompt resumes correctly at any point.
  Never pass the `<<autonomous-loop>>` sentinels — those belong to `/loop`.
- **delaySeconds** — the parsed cadence (default 300). While a phase is
  compute-bound rather than waiting on anyone (phase D building, phase E
  evaluating), do not sleep at all: continue straight into the next phase in the
  same turn. The cadence governs **waiting**, not working.
- **noop** — `true` when the iteration only looked (no new comment, no commit,
  no phase change), `false` when it changed something.
- **reason** — what the next tick is watching for: "waiting on spec review of
  #71", "polling CI after the R5 push".

## Step 12 — Stop conditions

Stop the loop and hand back — `ScheduleWakeup` with `stop: true` — when:

| Condition | Why it is yours to stop on |
|---|---|
| **Goal met, PR merged, spec `done`** | The run succeeded. Print the goal check. |
| PR closed without merging | Someone decided against it. |
| A source probe comes back empty and a goal clause depends on it | Requires `[!]` and a scope decision — the user's call. |
| `/update-spec` refuses a transition twice for the same reason | The lifecycle is telling you the work is not done. |
| A review thread disputes the spec, not the code | Re-litigating a recorded decision is out of scope for review and for you. |
| A non-trivial merge conflict, or a push rejected | Never force-push out of it. |
| A test/typecheck failure you have tried and failed to fix twice | Two attempts is enough; a third is thrashing. |
| The same phase repeats 3 iterations with no state change | You are stuck. Say what on. |
| Uncommitted work appears in the tree that you did not write | The user is editing. Never stomp it. |

On any stop, print the Step 10 block plus **Unblockers:** — the specific things a
human must decide, one line each.

## Guardrails

- **Never force-push. Never touch `main` directly. Never close the PR.**
- **Never merge without an approval**, even with green CI and every requirement
  marked. The approval is the human in this loop.
- **Never invent a number, impute a missing country, ship an untiered figure or
  add an uncited override** to make a phase pass. These outrank the loop
  absolutely — stop and report instead.
- **Never mark `[x]` on an acceptance check you did not run.** The whole workflow
  is only worth as much as that mark.
- **Never add a runtime dependency to the pipeline** to unblock a build; zero
  runtime dependencies needs its own requirement.
- The cadence is a **wait** interval. Never sleep between two steps you could
  just do.

## Examples

```
/sdlc 27
```
Issue #27, goal from its `## Definition of done`, babysit every 5 minutes,
straight through to merge.

```
/sdlc 27 3 min
```
Same, polling every 3 minutes.

```
/sdlc 27 /goal per-sex shares for the 40 best-covered countries only, no README changes
```
Same, but the stated goal replaces the issue's definition of done — and the spec
records that it did.

```
/sdlc country-search 10m
```
Resolves the slug to its issue first.
