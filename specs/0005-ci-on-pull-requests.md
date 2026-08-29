# 0005 — CI on pull requests

**Status:** in-progress
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
| Break reverted | [33272821035](https://github.com/apportico/who-gets-replaced-first/actions/runs/33272821035) | `verify` **pass**, 11s |

Observed on a real PR rather than inferred from the YAML — the failing case is
the one that matters, and a workflow that has only ever been seen passing has
not been tested.

The third row originally cited run `33272820922`, which is the **Claude review**
workflow on that commit, not CI. Caught in review. Worth recording rather than
silently correcting: a passing job is not evidence unless you know *which* job
passed, and `claude-review.yml` is precisely the workflow that goes green
without doing anything.

> **R2 was moved out of this spec, to #43.** It required
> `python3 -m unittest discover pipeline/tests` in the CI job — but that suite
> arrives with spec 0004, and the step is one unconditional line in the workflow
> this spec already created.
>
> The first attempt kept it here behind an `if [ -d pipeline/tests ]` guard that
> warned instead of running. Review caught that the guard had **no removal
> trigger**: once 0004 landed nothing would delete it, and a later rename of
> `pipeline/tests/` would turn the one status check gating `main` green again,
> with a `::warning::` visible only inside the run page and never on the PR
> checks list. That is the same green-when-absent failure this project keeps
> finding, deferred rather than avoided.
>
> So the scaffold is gone and the step belongs to 0004, where the suite it runs
> is being written. `setup-python` stays here, pinned, so the step lands in a
> pinned interpreter. The number is left unused rather than renumbered.

### R3. [x] CI is a required status check on `main`

Add the workflow's job as a `required_status_checks` context in branch
protection, so a PR with red CI cannot merge.

The probe confirmed `admin: true`, so this is doable from here.

**Acceptance (met 2026-08-30):**

```
before:  checks=null              enforce_admins=false
after:   checks=["verify"]        enforce_admins=true    strict=false
```

PR #48 reports `mergeStateStatus=BLOCKED` with `reviewDecision=REVIEW_REQUIRED`
and both checks green — blocked on the review, not the checks, which is the
protection behaving correctly. `strict: false` deliberately: requiring branches
to be up to date with `main` before merging would force a rebase on every
unrelated merge, which at this repo's rate is friction without safety.

### R4. [x] The admin-bypass decision is made and recorded

`enforce_admins` is `false`. Required status checks **do not apply to
administrators** while that is off, so R3 alone would satisfy its own acceptance
while an admin could still merge red CI — and on a repo this size admins are
most of the people merging, which makes the gap close to total.

Two honest resolutions, and the point of this requirement is that one of them is
*chosen* rather than defaulted into:

1. Set `enforce_admins: true`, matching R3's stated goal.
2. Retain the bypass deliberately, and record why in `CLAUDE.md` alongside the
   other declined practices, so the next reader does not file it as a bug.

**Decision (2026-08-30): option 1 — the gate binds everyone.**
`enforce_admins` is now `true`. Admins are most of the people merging here, so a
gate they walk past would be decoration. Disabling protection for a genuine
emergency stays possible and is then a deliberate, visible act rather than a
silent default.

**Acceptance (met):** live protection returns `enforce_admins: true`.

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
