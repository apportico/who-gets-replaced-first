# 0003 — AI-native SDLC

**Status:** in-progress
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

### R2. [~] A single verification command — revised

`npm run verify` runs everything that must pass before work is handed to a
human, so a session iterates until it is green rather than the human
discovering the failure. It must be one command with a pass/fail exit code.

**Revised (2026-08-29).** Two things changed during implementation, both
widening the requirement rather than narrowing it:

1. **`pipeline/run.py` had no exit-code logic at all** — `grep -c 'sys.exit'`
   returned 0. It printed `PASS` / `FAIL` per anchor and exited 0 regardless, so
   wrapping it in a verify command would have produced a green build with red
   anchors. Fixing the exit code became part of this requirement. Outliers are
   deliberately **not** gated — they are a standing review queue (4 on a healthy
   run), not a regression signal.
2. **The stated acceptance only tested breaking lint.** The case worth gating is
   a moved regression anchor, so the acceptance was widened to cover it.

Also added `scripts/verify.sh` rather than an inline `package.json` chain,
because the cache condition needs a real conditional.

**Acceptance (as widened, all four run 2026-08-29):**

| Check | Result |
|---|---|
| `npm run verify` on a clean checkout | exit **0** |
| Deliberately broken lint | exit **1** — `verify FAILED at: lint` |
| Pilot against the cache | exit **0** — `Pilot checks passed: 4 anchors on target, 0 validation problems` |
| Deliberately moved USA anchor (79.0 → 42.0) | exit **1** — `[FAIL] 1 regression anchor(s) moved` |

The last check is the one this requirement exists for, and it returned exit 0
before this change.

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

### R6. [ ] Automated review workflow is written and valid

Add `.github/workflows/claude-review.yml` so every PR receives the same passes
from `REVIEW.md`, with `@claude` able to address comments. Human approval stays
required — the agent writes, a human approves.

This requirement covers **writing the workflow**, which is entirely in our
control and checkable. Whether the review actually *runs* depends on the Claude
GitHub App being installed and a key added — an action only the account holder
can take, split out as R9 so this requirement can close on its own merits.

**Acceptance:** `.github/workflows/claude-review.yml` exists, parses as valid
YAML, references `REVIEW.md` as the review contract, and triggers on
`pull_request`.

> **R7 was moved out of this spec.** It required branch protection to name a CI
> job as a required status check — but that job is built by issue #3, which has
> not landed. Gating a check that does not yet exist is not implementable here,
> so the requirement moved to #3, where it belongs. The number is left unused
> rather than renumbered, so requirement IDs stay stable across the PR history.

### R8. [ ] `CLAUDE.md` records the SDLC

The workflow section added in #1 lists the skills. Extend it with what this spec
adds: the verify command, the review contract, the intent decision from R1, and
a short statement of which playbook practices were declined and why — so the
next person does not re-propose them.

**Acceptance:** `CLAUDE.md` names `npm run verify`, `REVIEW.md` and the
issues-as-intent decision, and carries the declined-practices list.

### R9. [ ] Automated review actually runs — BLOCKED on the account holder

The probe found no Claude GitHub App installed on this repo and no Actions
secret set (`gh secret list` returned empty; branch protection confirms no
status checks). Until `/install-github-app` has been run and the API key added,
the workflow from R6 sits inert.

**This cannot be worked on from inside the repo.** It is recorded as its own
requirement so the gap stays visible rather than being assumed away or quietly
folded into R6.

**Acceptance:** opening a test PR produces an automated review comment applying
`REVIEW.md`. Stays `[ ]` with the blocker recorded until the App is installed —
never `[x]` on the strength of the workflow file alone.

## Implementation Plan

**Planned:** 2026-08-29

### Findings that shaped this plan

Two things came out of reading the code, and both change what R2 has to do:

1. **`pipeline/run.py` has no exit-code logic at all** (`grep -c 'sys.exit'` returns 0).
   It prints `PASS` / `FAIL` per regression anchor and `[validate] N problems`, then
   exits 0 regardless. `npm run pipeline:pilot` therefore *cannot fail a build today*.
   A verify command wrapping it would be green while the anchors were red — the exact
   failure this spec exists to prevent. Fixing the exit code is a prerequisite, not a
   nicety.
2. **`pipeline/raw/` is gitignored**, so a clean checkout has no cache and the pilot
   would hit the network. This shapes what `verify` runs and when.

### Files to create

| Path | Purpose | Req |
|---|---|---|
| `REVIEW.md` | Review contract read by both humans and the PR action | R3 |
| `.claude/settings.json` | Permissions; `hooks` omitted until #4 lands | R4 |
| `.claude/agents/source-prober.md` | Read/fetch-only prober for the `/spec` verification step | R5 |
| `.claude/agents/data-diff-reviewer.md` | Reports what moved between two CSV vintages | R5 |
| `.github/workflows/claude-review.yml` | PR review workflow citing `REVIEW.md` | R6 |

### Files to modify

| Path | Change | Req |
|---|---|---|
| `pipeline/run.py` | Exit non-zero on a failed regression anchor or validate problem | R2 |
| `package.json` | Add `verify` = lint + build + pipeline:pilot | R2 |
| `specs/TEMPLATE.md` | Add an `**Issue:**` field | R1 |
| `.claude/skills/spec/SKILL.md` | Instruct filling `**Issue:**` at the write step | R1 |
| `.claude/skills/review-pr/SKILL.md` | Reference `REVIEW.md` rather than restating the rules | R3 |
| `CLAUDE.md` | Issues-as-intent, `npm run verify`, `REVIEW.md`, declined practices | R1, R2, R3, R8 |

### Sequence

1. **R2a** — `pipeline/run.py` exit codes. Everything else that claims to gate depends on this.
2. **R2b** — `npm run verify`.
3. **R3** — `REVIEW.md`, and point the review-pr skill at it.
4. **R1** — `**Issue:**` in the template and the `/spec` skill.
5. **R4** — `.claude/settings.json`.
6. **R5** — the two agent definitions.
7. **R6** — `claude-review.yml`, which cites the `REVIEW.md` from step 3.
8. **R8** — `CLAUDE.md`, last, because it documents everything above.
9. **R9** — blocked on the account holder; stays `[ ]`.

### Requirement mapping

| Req | How it will be satisfied | Where | How acceptance is checked |
|---|---|---|---|
| R1 | `**Issue:**` field added and the skill instructed to fill it | `specs/TEMPLATE.md`, `.claude/skills/spec/SKILL.md`, `CLAUDE.md` | `grep -c '^\*\*Issue:\*\*' specs/0003-ai-native-sdlc.md` returns 1 |
| R2 | Exit codes in the pipeline, then a single `verify` script | `pipeline/run.py`, `package.json` | `npm run verify` exits 0; breaking lint exits non-zero; a broken anchor exits non-zero |
| R3 | Review passes extracted into a shared contract | `REVIEW.md`, `.claude/skills/review-pr/SKILL.md` | `REVIEW.md` lists each pass with a severity; the skill references it rather than restating |
| R4 | Settings file in the verified shape | `.claude/settings.json` | `python3 -m json.tool` parses it; no `hooks` path points at a missing file |
| R5 | Two scoped subagent definitions | `.claude/agents/` | Valid frontmatter and `tools:`; the prober returns a filled verification row |
| R6 | Workflow file written and valid | `.github/workflows/claude-review.yml` | Parses as YAML, references `REVIEW.md`, triggers on `pull_request` |
| R8 | SDLC recorded for the next person | `CLAUDE.md` | Names `npm run verify`, `REVIEW.md`, the intent decision, and the declined list |
| R9 | — | — | **Blocked.** Opening a test PR produces an automated review. Stays `[ ]` until `/install-github-app` is run and a key added. |

### Tier and vintage handling

Not applicable. This spec produces no published figures, so the
`OFFICIAL` / `DERIVED` / `PROXY` / `MODELED` rules bind none of its requirements.
Recorded so a reviewer can see it was considered rather than skipped.

### Validation

`npm run verify` is itself the validation this spec adds, and it becomes the
check every later spec runs. The existing `[validate]`, `[crosscheck]` and
`[outliers]` blocks keep printing; the change is that a failed regression anchor
now returns a non-zero exit code instead of scrolling past.

No new data check is needed — this spec touches no data.

### Risks

- **R2 changes pipeline behaviour.** Making `run.py` exit non-zero is a real
  behaviour change: anything that shells out to it and ignored the exit code
  will now see a failure. Nothing in the repo currently does, but CI (#3) will.
- **R2's stated acceptance is too narrow.** It tests only that breaking lint
  fails. The valuable case is a failed regression anchor failing the build.
  Implementing that widens the requirement, so **R2 is expected to close `[~]`
  (revised) rather than `[x]`**, with the widened acceptance recorded.
- **The pilot needs the network without a cache.** `verify` will run lint and
  build unconditionally, run the pilot when `pipeline/raw/` is present, and skip
  it with a loud notice when it is not — fast and deterministic locally, with CI
  choosing its own fetch policy in #3.
- **R6 cannot be tested end to end** until the App is installed. That is exactly
  why R9 exists; do not let a valid YAML file be mistaken for a working review.
- **R5's acceptance requires actually invoking the agents**, which means a live
  API call for the prober. If that proves impractical in this environment, R5
  closes `[~]` with the check reduced to frontmatter validity, and the reason
  recorded.

## Non-goals

- **Continuous evals for skills and hooks** — substantial on its own, tracked as
  issue #34 and its own spec.
- **The hook scripts themselves** — issue #4. R4 only creates the settings file
  they plug into.
- **Making CI a required status check on `main`** — moved to issue #3. Branch
  protection today requires 1 approving review and sets no status checks, so a
  PR with red CI can still merge. But the check to require is the one #3 builds,
  so the gating belongs in that spec rather than this one.
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
