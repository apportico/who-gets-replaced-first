---
name: babysit
description: Keep a PR moving — on a loop. Resolves conflicts, fixes red CI where mechanically fixable, addresses review comments (reply + resolve threads on inline comments). Takes an optional cadence; otherwise self-paces based on PR state. Stops when the PR is clean, merged, closed, or needs human judgment.
metadata:
  context: pr, babysit, review, ci, conflicts, github, loop
  auto-trigger: false
---

# /babysit — PR Maintenance Loop

> **Vendored into this repo (2026-09-01, PR #74).** `/sdlc` phases B and F are
> built on this skill, so it lives here rather than in a personal `~/.claude/skills/`
> where a contributor would not have it. Divergences from the personal copy, per
> the "generated components are ours" rule in `CLAUDE.md`:
>
> - The autofix and check commands are this repo's (`npm`, and `npm run verify`
>   as the single gate), not the generic pnpm/biome examples.
> - A **Composing with `/sdlc`** section at the bottom.
> - The "never mark a draft ready" guardrail is scoped: it binds `/babysit`, not
>   `/sdlc`, which owns the PR it opened and readies it deliberately in its Step 3.
>
> Keep those in mind before overwriting this file from the personal copy.

Looping by default. One tick of /babysit runs the flow below; at the end, the skill schedules the next tick via ScheduleWakeup unless a stop condition is met. An interval can be passed explicitly; otherwise the skill self-paces based on what the PR is currently waiting on.

## Usage

```
/babysit                     # resolve PR from current worktree; self-paced cadence
/babysit <number>            # explicit PR number; self-paced cadence
/babysit <number> <interval> # explicit PR number + fixed cadence (e.g. 10m, 30m, 1h)
/babysit <interval>          # PR from worktree + fixed cadence
```

`<interval>` accepts the same units as /loop: `Ns`, `Nm`, `Nh` (e.g. `300s`, `15m`, `1h`). No interval → self-paced.

## Tick flow

Steps 1–5 run once per tick. Step 6 schedules the next tick (or stops).

### 1. Resolve the PR

- If a number was passed as the first arg, use it.
- Else: `gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --json number,headRefName --jq '.[0].number'`.
- From the primary checkout on main with no PR argument: enumerate `git worktree list`, ask which branch to babysit (first tick only; subsequent ticks already have the PR number in the re-fire prompt).
- Fetch state:
  ```bash
  gh pr view <num> --json number,headRefName,baseRefName,state,mergeable,mergeStateStatus,isDraft,statusCheckRollup,url,title
  ```
- *Stop conditions that end the loop (don't re-schedule):*
  - `state` is `MERGED` or `CLOSED` → print `PR #<num> is <state>, stopping.` and exit.
- If `isDraft`, still proceed (draft PRs get CI and may have reviews).

### 2. Ensure a worktree

All fixes need a checkout of the PR branch. Per the user's global rule, work happens under `.claude/worktrees/<type>+<slug>/`.

- Derive worktree path from the branch: `feat/foo-bar` → `.claude/worktrees/feat+foo-bar/`. Replace `/` with `+`.
- If the worktree already exists, `cd` into it.
- If not: `git fetch origin <branch> && git worktree add .claude/worktrees/<type>+<slug> -b <branch> origin/<branch>` (or without `-b` if the branch is already local).
- Cross-repo PRs (from forks) aren't supported — report and *stop* (don't re-schedule; nothing changes).
- *Uncommitted changes in the worktree* → the user has work in progress. Report and *stop* (don't stomp their edits on a loop tick).
- After `cd`, echo `pwd` and `git rev-parse --abbrev-ref HEAD` to verify.

### 3. Conflicts

Check `mergeable` from step 1.

- `MERGEABLE` → skip to step 4.
- `CONFLICTING`:
  1. `git fetch origin <baseRefName>`
  2. `git merge "origin/<baseRefName>"` (don't rebase — merge preserves review comment anchors).
  3. If clean, `git push` and move on.
  4. If conflicts:
     - List conflicting files: `git diff --name-only --diff-filter=U`.
     - *Auto-resolve* trivial categories:
       - Lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `Cargo.lock`): take theirs, then regenerate (`pnpm install` / `npm install` / `cargo build`).
       - Generated files (anything under `dist/`, `.next/`, or matching patterns listed in `.gitattributes` as generated): take ours from the feature branch, then regen.
       - Import-order-only churn: re-run the project's linter/formatter.
     - If only trivial conflicts remained and resolution succeeded: commit with `chore: resolve trivial conflicts with <base>`, push.
     - If any non-trivial conflict remains: `git merge --abort`, report the files, and *stop* (don't re-schedule — needs human input).
- `UNKNOWN` → GitHub hasn't computed it yet; note "mergeability pending" and move on (the next tick will recheck).

### 4. CI

```bash
gh pr checks <num> --json name,state,link,workflow --jq '.'
```

Tally: PASS, FAIL, PENDING, SKIPPED. Record the counts for the report.

For each failing check, fetch the failing log:

```bash
RUN_ID=$(gh run list --branch <branch> --workflow <workflow> --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$RUN_ID" --log-failed
```

Classify the failure:

- *Lint / formatter*: this repo lints with ESLint — run `npm run lint -- --fix` from the worktree root. Commit, push.
- *PR title regex*: if a check that validates the PR title fails, the title (not the commits) is the input. Rename via `gh pr edit <num> --title "<new>"` — do not amend commits.
- *Typecheck*: do not auto-fix — report only.
- *Test*: do not auto-fix — report the failing test names and the first assertion error. This repo has three suites behind `verify`: `test:pipeline` (the 158-test regression suite that guards the numbers), `test:app`, and the pilot's `[validate]` / `[crosscheck]` anchors. A moved anchor is never a flake.
- *Build*: do not auto-fix — report the first error.
- *Missing snapshot / snapshot drift*: report only (don't auto-update — snapshots need human review).

Rule of thumb: only auto-fix if the project has a deterministic "fix it" command for that check. Everything else → report in the final summary.

Before pushing any fix, run the repo's single gate — `npm run verify` — rather than the one script that was failing. `CLAUDE.md` makes it the gate precisely because CI runs the same command.

### 5. Review comments

Fetch all unresolved threads + loose comments.

*Unresolved inline threads* (the ones with "Resolve thread" buttons):

```bash
gh api graphql -f query='
query($owner:String!, $repo:String!, $num:Int!) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$num) {
      reviewThreads(first:100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first:50) {
            nodes { id databaseId body author{login} createdAt }
          }
        }
      }
    }
  }
}' -f owner=<owner> -f repo=<repo> -F num=<num>
```

Filter `isResolved == false`. For each:

1. *Classify* the thread (read the full comment chain — latest comment wins if multiple):
   - `actionable` — reviewer wants a code change.
   - `question` — reviewer asked something; needs a text reply, no code change.
   - `nit` — style preference; apply if trivial, else reply with rationale.
   - `outdated` — thread is `isOutdated: true` and the concern is already addressed → resolve with a brief "addressed in <sha>" note.
   - `skip` — disagreement or out-of-scope; reply with reasoning, don't resolve (leave for human).
2. *Fix* (if `actionable` or trivial `nit`): make the code change in the worktree, commit (`fix: address review feedback on <path>`), push.
3. *Reply* — post a reply comment on the thread. Use the thread's last comment id as the reply target:
   ```bash
   gh api -X POST "repos/<owner>/<repo>/pulls/<num>/comments/<last_comment_databaseId>/replies" \
     -f body="<reply text>"
   ```
   Reply content:
   - Actionable → "Fixed in <sha>." (one sentence; add detail only if the fix deviates from what was asked).
   - Question → the answer.
   - Nit applied → "Applied in <sha>."
   - Nit declined → one-sentence rationale.
   - Outdated → "This is already handled in <sha>."
   - Skip → rationale, no resolution.
4. *Resolve the thread* (inline comments only) unless classification was `skip`:
   ```bash
   gh api graphql -f query='
   mutation($id:ID!) { resolveReviewThread(input:{threadId:$id}) { thread { id isResolved } } }' \
     -f id=<threadId>
   ```

*Loose comments* — review summary bodies and issue comments (these have no thread to resolve):

```bash
# Review summaries
gh api "repos/<owner>/<repo>/pulls/<num>/reviews" --jq '.[] | select(.body != "") | {id, user: .user.login, body, state}'
# PR-level issue comments
gh api "repos/<owner>/<repo>/issues/<num>/comments" --jq '.[] | {id, user: .user.login, body}'
```

Track which of these /babysit has already replied to (see "Idempotency" below). For each new one:
- Post a reply as a new issue comment on the PR: `gh pr comment <num> --body "@<user> <reply>"`.
- No thread to resolve.

### 6. Report and schedule the next tick

Print a compact status block. This is what the next tick greps for context — make it grep-friendly:

```
PR #<num> — <title>
URL: <url>
Branch: <head> → <base>
Worktree: .claude/worktrees/<dir>

Conflicts:  <resolved | none | BLOCKED: files...>
CI:         <N passing, M failing, K pending> <fixed: lint | action needed: typecheck, test>
Reviews:    <X threads resolved, Y replied, Z need human>

Next action: <nothing | wait for CI | human review needed on: ...>
```

Then decide whether to re-fire. *Stop* (do not re-schedule) when any of these hold:

- *PR is clean* — no conflicts, no failing CI, no pending CI, no unresolved threads, not draft: print `PR #<num> is clean — stopping.` and exit.
- *PR is merged or closed* (from step 1).
- *Human judgment needed* — unresolvable conflict, a failing test/typecheck/build with no deterministic autofix, an unresolved `skip` thread, or a review thread classified as `actionable` that the skill couldn't fix (e.g. require domain decisions). Print `PR #<num> needs human — stopping. Unblockers: <list>` and exit.
- *Uncommitted user work* in the worktree (from step 2) — always a stop.

Otherwise, schedule the next tick with ScheduleWakeup:

- *prompt*: the exact `/babysit` invocation with the resolved PR number (and explicit interval if one was passed). Example: `/babysit 773` or `/babysit 773 15m`. Never pass the autonomous-loop sentinels — those belong to the /loop skill, not this one.
- *delaySeconds*:
  - If the user passed an explicit interval, use it (convert m→×60, h→×3600; clamp to [60, 3600]).
  - Otherwise self-pace based on what the PR is waiting on:
    - *CI is actively pending* (any check still pending/in_progress): **180–270s**. Cache stays warm, and CI usually moves inside that window.
    - *Blocked on review* (no CI pending, no fixable work, waiting on human reviewers): **1200–1800s** (20–30 min). Don't poll a human.
    - *Bot review still running* (e.g. CodeRabbit "Review in progress"): **300–600s** on the first loop, then fall to the review-blocked cadence once stable.
    - *Freshly pushed commits, CI not yet scheduled*: **90–120s**.
  - Never pick exactly 300s — that's the cache-TTL cliff. Pick ≤270s or ≥600s. See ScheduleWakeup's description for the cache-window reasoning.
- *reason*: one short sentence stating what the next tick is watching for (e.g. "waiting on bff_codequality + CodeRabbit", "polling mergeability"). Shown back to the user in telemetry.

## Idempotency

Each tick must not duplicate work from prior ticks:

- *Don't re-reply* to comments already replied to. Detect this by checking whether the thread has a reply from the current authenticated GitHub user (`gh api user --jq '.login'`) that comes after the latest reviewer comment.
- *Don't re-apply* code fixes. The commit message convention `fix: address review feedback on <path>` + checking `git log --grep` between the reviewer's comment timestamp and HEAD prevents duplicate commits.
- *Don't re-attempt* a merge if the branch is already up to date with base.
- *Don't post duplicate* PR-level comments. Before replying to a review-summary or issue comment, check for an existing reply body that contains the original comment's first line as a quote.

## Guardrails

- *Never force-push.* If a normal push is rejected, stop and report (human judgment).
- *Never mark the PR ready for review* if it's a draft — leave that to the author. (This binds `/babysit`. `/sdlc` readies the PR it opened itself, in its own Step 3, and is the author in that sense — the two are not in conflict.)
- *Never approve or request changes* on the PR — /babysit is an assistant, not a reviewer.
- *Never close the PR.*
- *Don't touch main* or any branch other than the PR head.
- *Uncommitted user edits* in the worktree → stop immediately (no merge, no push, no re-schedule).

## Non-goals

- Spec compliance (use /evaluate or project-local review skills for that).
- Deciding whether to merge (that's a human call).
- Writing new tests beyond what's needed to unblock CI.

## Composing with /sdlc

`/sdlc` runs one tick of this skill per iteration of its own loop and **owns the
re-schedule**. So when invoked from `/sdlc`:

- Run steps 1–5 and print the step 6 report, then **stop without calling
  ScheduleWakeup**. `/sdlc` schedules the next tick with its own re-entry prompt,
  which is what carries the ticket, the goal and the phase detection forward. A
  `/babysit` re-schedule here would strand the run in this skill.
- Hand any thread needing more than a mechanical fix to `/address-reviews`, which
  is what this project's `REVIEW.md` contract is written against.
- The stop conditions in step 6 still apply — report them and let `/sdlc` decide,
  rather than deciding for it.

Invoked directly by a human, none of that applies: self-loop as normal.

## Composing with /loop

/babysit self-loops, so composing with /loop is rarely needed. If you want /loop's own cadence semantics (e.g. you prefer a strict fixed interval that ignores what the PR is waiting on), use `/loop <interval> /babysit <num>` and expect /babysit to behave one-shot because it will see a non-stop state and exit before its own re-schedule runs — or pass `<interval>` to /babysit directly and skip /loop.
