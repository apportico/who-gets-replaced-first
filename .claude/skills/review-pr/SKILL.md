---
name: review-pr
description: Review a GitHub PR against its spec — uses CodeRabbit if installed, falls back to manual review. Posts inline comments and a summary review.
argument-hint: "<pr-number-or-url>"
allowed-tools: Read, Glob, Grep, Bash, Agent
---

You are running the `/review-pr` command. Review a pull request's changes against its spec, then post inline comments and a summary review.

## Step 1 — Resolve the PR and repo

From `$ARGUMENTS`: a plain number, or a URL like `https://github.com/<owner>/<repo>/pull/123` — extract the number. With no argument, ask.

```bash
gh repo view --json owner,name -q '.owner.login + "/" + .name'
gh pr view <n> --json title,body,headRefName,baseRefName,files,commits,headRefOid
```

Never hardcode the owner/repo — take them from `gh repo view`.

## Step 2 — Find the spec

1. The PR body — a line naming `specs/NNNN-*.md`.
2. The branch name — `feat/NNNN-name` → `specs/NNNN-name.md`.
3. Any `specs/*.md` among the PR's changed files.

Read it: every requirement ID with its text, mark and acceptance criterion; the *Source verification* table; Non-goals.

With no spec, warn and do a general quality review — skip Steps 6–7. On this project a code PR with no spec is itself a finding: raise it.

## Step 3 — Diff

```bash
gh pr diff <n>
```

## Step 4 — CodeRabbit, if present

```bash
coderabbit --version 2>/dev/null && coderabbit auth status 2>&1
```

If available and authenticated:

```bash
git fetch origin pull/<n>/head:pr-<n> && git checkout pr-<n>
coderabbit review --plain --base <baseRefName>
git checkout - && git branch -D pr-<n>
```

Otherwise review manually. Either way, your own analysis is required — CodeRabbit supplements it, it does not replace it.

## Step 5 — What to look for

**Read `REVIEW.md` at the repo root and apply its passes.** It is the review
contract — the same one the PR workflow passes to the automated reviewer — so a
human review and an automated one reach the same verdict. Do not restate or
improvise the rules here; if a pass needs changing, change `REVIEW.md`.

It defines eight passes and their severities. The two that outrank everything
else in this repo:

- **Pass 1, the data non-negotiables** — an untiered number, an imputed country,
  an unweighted aggregate, an uncited override, a row presented as one vintage.
  Each is a Blocker on its own.
- **Pass 2, unprobed sources** — code reading a source with no row in its spec's
  verification table.

`REVIEW.md` also lists what is explicitly **out of scope** for review. Respect
it: findings spent on formatting or on re-litigating a decision the spec records
are noise.

## Step 6 — Requirements

| Req | Text | Status | Evidence |
|---|---|---|---|
| R1 | ... | Pass / Fail / Unclear | `file:line` and reasoning |

Rigorous: `Pass` means the diff clearly satisfies it. Uncertain → `Unclear`.

## Step 7 — Non-goals

Check nothing in the spec's Non-goals section got built anyway.

## Step 8 — Compile findings

Severity per finding:

- 🔴 **Bug** — wrong behaviour, validation gap, or a breach of a data non-negotiable
- 🟡 **Missing** — required by a requirement, not implemented
- 🟢 **Suggestion** — improvement, not blocking

Map each to a file and line.

## Step 9 — Post the review

```bash
gh api repos/<owner>/<repo>/pulls/<n>/reviews -X POST \
  --field commit_id="<headRefOid>" \
  --field event="<APPROVE|REQUEST_CHANGES|COMMENT>" \
  --field body="<summary>" \
  --field 'comments[][path]=<file>' \
  --field 'comments[][line]=<line>' \
  --field 'comments[][body]=<comment>'
```

- `REQUEST_CHANGES` — any Bug or Missing finding
- `APPROVE` — all requirements pass, no bugs
- `COMMENT` — spec-only PR, or suggestions only

Summary body: overall assessment, the requirement table, findings by severity, non-goal check. Inline comments lead with the severity emoji and a bold title, then a concrete fix.

Attribution: `🤖 Generated with [Claude Code](https://claude.com/claude-code)` — add `+ [CodeRabbit](https://coderabbit.ai)` if it was used.

## Step 10 — Report

Give the user the review URL and a count by severity with the verdict.
