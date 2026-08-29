# 0003 — AI-native SDLC

**Status:** draft
**Depends on:** none (spec-level). Consumes output of issues #2, #3 and #4.
**Issue:** [#33](https://github.com/apportico/who-gets-replaced-first/issues/33)

## Objective

We can already answer "what is this change for, and did it meet its acceptance
criteria" — specs, requirement IDs and the `[x]` / `[!]` / `[~]` marks give us
that. What we cannot answer today is: **did the work pass its checks before a
human looked at it, and were the same review passes applied to every change?**

Both are currently a matter of whoever is at the keyboard remembering. There is
no single verification command in `package.json`, the review rules live inside a
skill body where a human and an automated reviewer would read different things,
and no `.claude/settings.json` exists to wire any guardrail at all.

This spec adopts the parts of the [AI-native SDLC
playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) that close those
gaps, and records the parts it deliberately declines.

## Source verification

Probed 2026-08-29. Everything below is what came back, not what was expected.

| Source | Probed | Result |
|---|---|---|
| AI-native SDLC playbook | WebFetch, 2026-08-29 | Six stages, artifact chain Intent → Spec → Plan → Diff+Tests → PR+Review → Incident → Intent. Per-stage artifacts, role changes and metrics. Basis for R1–R8. |
| `claude` CLI non-interactive | `claude --help`, 2026-08-29 | `-p/--print`, `--output-format`, `--allowed-tools`, `--agent`, `--agents <json>` all present. CI invocation is viable. |
| `anthropics/claude-code-action` | WebFetch, 2026-08-29 | Official action. PR-review mode, `@claude` mentions, automation mode. Works on public repos. Needs an API key, wired by `/install-github-app`. API usage billed to the account holder. |
| Claude GitHub App on this repo | `gh api repos/.../installation`, 2026-08-29 | **Not installed.** R6 cannot be verified until it is. |
| Repo Actions secrets | `gh secret list`, 2026-08-29 | **None set.** Org-level check returned HTTP 403 (not an org admin), so org secrets are unknown. |
| Branch protection on `main` | `gh api .../branches/main/protection`, 2026-08-29 | 1 required approving review; `enforce_admins: false`; **no `required_status_checks`**. CI cannot gate a merge today. Drives R7. |
| Repo visibility | `gh repo view`, 2026-08-29 | `PUBLIC` — GitHub Actions minutes are free, so CI cost is not a constraint. |
| `.claude/settings.json` schema | Read the working config in `CodeRadar`, 2026-08-29 | `hooks` supports `PreToolUse` / `PostToolUse`; `permissions` supports `allow` / `deny` / `additionalDirectories`. Known-good shape to copy. |
| `package.json` scripts | `node -e`, 2026-08-29 | `dev, build, preview, lint, pipeline, pipeline:pilot, report`. **No `test` and no `verify`.** Drives R2. |

**Note on tiers:** this spec produces no published figures, so the
`OFFICIAL` / `DERIVED` / `PROXY` / `MODELED` rules do not apply to any requirement
here. Recorded so a reviewer can see it was considered rather than skipped.

## Requirements

### R1. [ ] GitHub Issues are the source of truth for intent

The playbook's Plan stage wants an intent artifact. This repo has 33 GitHub
issues that already carry problem, scope, sources to probe and definition of
done. Creating `intent.md` files would duplicate them and guarantee drift, so
issues stay authoritative and the missing piece is the **link** in both
directions.

Add an `**Issue:**` field to `specs/TEMPLATE.md` and to the `/spec` skill's
write step, and record the decision in `CLAUDE.md` so it is not re-litigated.

**Acceptance:** `specs/TEMPLATE.md` contains an `**Issue:**` field;
`grep -c '^\*\*Issue:\*\*' specs/0003-ai-native-sdlc.md` returns 1; the `/spec`
skill instructs filling it; `CLAUDE.md` states the source-of-truth decision.

### R2. [ ] A single verification command

`npm run verify` runs everything that must pass before work is handed to a
human, so a session iterates until it is green rather than the human
discovering the failure. It must be one command with a pass/fail exit code.

Scope it to what exists today — `npm run lint`, `npm run build`, and
`npm run pipeline:pilot` with its regression anchors — and extend it when the
pipeline tests from #2 land.

**Acceptance:** `npm run verify` exits 0 on a clean checkout of `main`.
Deliberately breaking lint makes it exit non-zero. `CLAUDE.md` names it as the
command to run before declaring anything done.

### R3. [ ] `REVIEW.md` defines the review contract

Today the review rules live inside `.claude/skills/review-pr/SKILL.md`, so a
human reviewer and an automated one would read different things. Extract them
into a `REVIEW.md` both consume: the passes (correctness; the data
non-negotiables; unprobed sources; the dependency policy), severity
thresholds, and what is out of scope for review.

**Acceptance:** `REVIEW.md` exists and lists each pass with a severity;
`.claude/skills/review-pr/SKILL.md` references it rather than restating the
rules; the workflow in R6 passes it to Claude.

### R4. [ ] `.claude/settings.json` exists and wires permissions

No settings file exists, so nothing configures permissions or guardrails. Create
it using the shape verified in the probe: `permissions.allow` for the commands
this project routinely runs, `permissions.deny` for what it must not, and a
`hooks` block ready for the scripts from #4.

**Acceptance:** `.claude/settings.json` is valid JSON, `python3 -m json.tool`
parses it, and every path referenced in its `hooks` block exists on disk. If #4
has not landed, the `hooks` block is absent rather than dangling.

### R5. [ ] Subagent definitions for the jobs that recur

`--agent` and `--agents` are supported by the installed CLI. Define, in
`.claude/agents/`, the two jobs currently done ad hoc in the main session:

- a **source-prober** for the `/spec` verification step — scoped to read and
  fetch, so it cannot write while probing
- a **data-diff reviewer** for pipeline output changes — reads two CSV vintages
  and reports what moved, with the regression anchors called out

**Acceptance:** both files exist with valid frontmatter and a `tools:` list;
invoking the source-prober on a known API returns a filled verification row;
the data-diff reviewer run against two committed vintages of
`global_labor_dataset.csv` reports the changed countries.

### R6. [ ] Automated review on every pull request

Add `claude-code-action` so every PR receives the same passes from `REVIEW.md`,
with `@claude` able to address comments. Human approval stays required — the
agent writes, a human approves.

**This requirement is blocked on an action only the account holder can take:**
the probe found no Claude GitHub App installed and no repo secret. The workflow
file can be written now; the requirement cannot be marked `[x]` until
`/install-github-app` has been run and the key added.

**Acceptance:** `.github/workflows/claude-review.yml` exists and passes
`REVIEW.md`; opening a test PR produces an automated review comment. Until the
App is installed, this stays `[ ]` with the blocker recorded — not `[x]`.

### R7. [ ] CI gates merges to `main`

Branch protection currently requires 1 approving review but sets **no required
status checks**, so a PR with red CI can still merge. Once the PR workflow from
#3 exists, add it as a required status check.

**Acceptance:** `gh api repos/.../branches/main/protection` returns a
`required_status_checks` block naming the CI job. A PR with a failing check
cannot be merged through the UI.

### R8. [ ] `CLAUDE.md` records the SDLC

The workflow section added in #1 lists the skills. Extend it with what this spec
adds: the verify command, the review contract, the intent decision from R1, and
a short statement of which playbook practices were declined and why — so the
next person does not re-propose them.

**Acceptance:** `CLAUDE.md` names `npm run verify`, `REVIEW.md` and the
issues-as-intent decision, and carries the declined-practices list.

## Non-goals

- **Continuous evals for skills and hooks** — substantial on its own, tracked as
  issue #34 and its own spec.
- **The hook scripts themselves** — issue #4. R4 only creates the settings file
  they plug into.
- **Claude on-call / Claude Tag** — a static GitHub Pages site with no runtime
  has no incidents to respond to.
- **OpenTelemetry export, DORA metrics, approval-gate wait times** — org-scale
  instrumentation; noise at this size.
- **Claude Security scheduled scans** — enterprise beta, and the current surface
  is a static site plus a read-only pipeline. **Revisit if M5 lands**: payments
  and stored personal data change that answer completely.
- **Claude Design in the pipeline** — there is no design handoff step to
  automate.
- **Migrating specs to the playbook's `spec.md` shape** — the numbered specs with
  requirement IDs and the `[x]` / `[!]` / `[~]` marks are stricter than the
  playbook's baseline. Adopting its format would be a downgrade.
