# 0005 — CI on pull requests

**Status:** draft
**Depends on:** 0003 (provides `npm run verify`); 0004 for the test step only
**Issue:** [#3](https://github.com/apportico/who-gets-replaced-first/issues/3)

## Objective

Nothing runs on a pull request. `.github/workflows/deploy.yml` triggers on push
to `main`, so the first time anything is checked is *after* the change is
already deployed. A PR can break the build, break lint, or move a regression
anchor, and the only thing standing between that and the published site is
whoever is reviewing remembering to run the checks locally.

Spec 0003 built the gate — `npm run verify`, which now exits non-zero when a
regression anchor moves. This spec makes it run on every pull request, and makes
`main` refuse a merge without it.

## Source verification

Probed 2026-08-30. Everything below is what came back, not what was expected.

| Source | Probed | Result |
|---|---|---|
| Existing CI shape | read `.github/workflows/deploy.yml` | `ubuntu-latest`, `actions/setup-node@v4` with `node-version: 24` and `cache: npm`, then `npm ci` and `npm run build`. A known-good shape to copy; no PR trigger anywhere in the repo. |
| `npm run verify` with no cache | ran it in a fresh worktree with no `pipeline/raw/` | exit **0** — lint and build run, pilot **skips** with a notice. This is exactly the CI case, so `verify` is deterministic there: no upstream API can fail it. |
| Repo permissions | `gh api repos/... --jq .permissions` | `{"admin": true, "maintain": true, "push": true, ...}`, repo is `PUBLIC`. **Admin is available**, so writing branch protection is possible — this is what makes R3 and R4 implementable here rather than another thing to hand to the account holder. |
| Branch protection on `main` | `gh api .../branches/main/protection` | `required_status_checks: null`, `enforce_admins: false`, 1 approving review. A PR with red CI can merge today, and required checks would not bind admins even once added. |
| Actions minutes | `gh repo view --json visibility` | `PUBLIC` — Actions are free, so CI cost is not a constraint on how often this runs. |
| Offline pipeline tests | read `specs/0004-pipeline-regression-tests.md` R7 on `origin/feat/0004-*` | 0004 commits a **gzipped 32-area fixture** (0.78MB) and runs the real pilot against it with the network patched out, diffing against a committed expected CSV. So **CI never needs the networked pilot** — the offline suite covers the anchors. This is why R2 waits on 0004 rather than duplicating it. |
| Stale refs in the review workflow | `grep -n R9 .github/workflows/claude-review.yml` on `main` | Two references to "R9" survive at lines 5 and 47, including the runtime `::notice::` text. R9 left spec 0003 and became #44. Drives R5. |

**Note on tiers:** this spec produces no published figures, so the
`OFFICIAL` / `DERIVED` / `PROXY` / `MODELED` rules bind no requirement here.
Recorded so a reviewer can see it was considered rather than skipped.

## Requirements

### R1. [x] Lint and build run on every pull request

A `ci.yml` workflow triggering on `pull_request` that runs `npm ci` then
`npm run verify`.

It runs `verify` rather than `npm run lint && npm run build` separately, so CI
and a developer's local gate are **the same command**. A check that CI runs but
nobody can reproduce locally is how green builds and broken checkouts diverge.

`verify` skips the pilot when `pipeline/raw/` is absent, which is always true in
CI, so this job is fully deterministic — no third-party API can turn it red.

**Acceptance (met 2026-08-30, observed on PR #48):**

| State | Run | Result |
|---|---|---|
| Clean | [33272749615](https://github.com/apportico/who-gets-replaced-first/actions/runs/33272749615) | `verify` **pass**, 11s |
| Deliberately broken lint | [33272786304](https://github.com/apportico/who-gets-replaced-first/actions/runs/33272786304) | `verify` **fail**, 9s |
| Break reverted | [33272820922](https://github.com/apportico/who-gets-replaced-first/actions/runs/33272820922) | `verify` **pass**, 11s |

Observed on a real PR rather than inferred from the YAML — the failing case is
the one that matters, and a workflow that has only ever been seen passing has
not been tested.

### R2. [ ] The offline pipeline test suite runs in CI

Add `python3 -m unittest discover pipeline/tests` to the same workflow, once
0004 lands it.

This is the step that actually guards the numbers. 0004 R7 runs the real pilot
against a committed gzipped fixture with the network patched out and diffs
against an expected CSV, so it catches a moved anchor, a changed number format
and a reordered column — offline, in seconds.

**Do not duplicate 0004's work here.** This requirement is one step in a
workflow; the fixture, the golden master and the patching all belong to 0004.

**Acceptance:** the CI job runs the suite and fails when it fails. Verified by
pointing a branch at a deliberately broken expectation and watching the job go
red. If 0004 has not landed when the rest of this spec is ready, this closes
`[~]` with the step written but unverified, and the reason recorded — never
`[x]` on an unrun suite.

### R3. [ ] CI is a required status check on `main`

Add the workflow's job as a `required_status_checks` context in branch
protection, so a PR with red CI cannot merge.

The probe confirmed `admin: true`, so this is doable from here.

**Acceptance:** `gh api repos/.../branches/main/protection` returns a
`required_status_checks` block naming the CI job. A PR with a failing check
shows a blocked merge button.

### R4. [ ] The admin-bypass decision is made and recorded

`enforce_admins` is `false`. Required status checks **do not apply to
administrators** while that is off, so R3 alone would satisfy its own acceptance
while an admin could still merge red CI — and on a repo this size admins are
most of the people merging, which makes the gap close to total.

Two honest resolutions, and the point of this requirement is that one of them is
*chosen* rather than defaulted into:

1. Set `enforce_admins: true`, matching R3's stated goal.
2. Retain the bypass deliberately, and record why in `CLAUDE.md` alongside the
   other declined practices, so the next reader does not file it as a bug.

**Acceptance:** either `enforce_admins` is `true` in the live protection
settings, or `CLAUDE.md` carries the recorded decision to retain the bypass with
its reason. Not both, and not neither.

### R5. [x] The review workflow stops citing a requirement that moved

`.github/workflows/claude-review.yml` refers to "R9" at lines 5 and 47,
including in the runtime `::notice::` a maintainer reads when the job skips. R9
left spec 0003 and became #44, so the notice points at a requirement that no
longer exists.

**Acceptance:** `grep -c 'R9' .github/workflows/claude-review.yml` returns 0,
and the skip notice names #44.

## Non-goals

- **The pipeline test suite itself** — issue #2 / spec 0004. R2 only adds the
  step that runs it.
- **Installing the Claude GitHub App** — #44, an account-holder action. This
  spec does not make the automated review work; it makes the *deterministic*
  checks gate merges.
- **Running the networked pipeline in CI.** 0004 R7's offline fixture removes
  the need, and a CI job that fetches from ILOSTAT and the World Bank on every
  PR would be slow, rate-limit-prone, and red for reasons unrelated to the
  change under review. `npm run verify:data` stays a local, deliberate command.
- **Caching `pipeline/raw/` in Actions.** Tempting, but the cache is ~80MB and
  the offline fixture is 0.78MB. Solving this in CI would duplicate 0004.
- **Deploy-time checks.** `deploy.yml` stays as it is; this spec adds a gate
  before merge, not after.
