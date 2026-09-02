# 0018 — workflow enforcement hooks

**Status:** in-progress
**Depends on:** 0003 (wrote `.claude/settings.json` in the verified shape and
deliberately left the `hooks` block out until this spec — see its R4 and its
"Practices deliberately declined"), 0005 (made `verify` a required check, which
is what R2 and R4 enforce locally)
**Issue:** [#4](https://github.com/apportico/who-gets-replaced-first/issues/4)
**Approved:** Dani (@syymza), 2026-09-02, as a GitHub review on PR
[#92](https://github.com/apportico/who-gets-replaced-first/pull/92) —
[round 3](https://github.com/apportico/who-gets-replaced-first/pull/92#pullrequestreview-5086784465),
after two rounds that found the same defect class both times: a requirement
disagreeing with a probe recorded in the same file. Four non-blocking FYIs from
that review are folded in below rather than deferred.
**Goal:** The workflow rules stop being advisory. Checked as:

Clauses 2–5 are scoped to **a Bash command issued by a Claude Code session in
this repository** — that is what a `PreToolUse` hook governs, and R7 exists to
say so. Writing the scope into the goal rather than only into R7 keeps a resumed
run from ratifying clause 2 on evidence that never covered the terminal.

1. Four hooks live in `.claude/hooks/`, wired through `.claude/settings.json`.
2. A commit on the default branch is refused; a commit on a feature branch is not.
3. Committing a spec that is missing its *Source verification* table — or its
   `**Status:**`, or a well-formed requirement heading — is refused; a
   conforming spec is not.
4. A push is refused while `npm run verify` is red, and silent when it is green.
5. `gh pr merge` is refused while the PR's `verify` check is not `SUCCESS`,
   including the bare form that carries no PR number.
6. Every hook demonstrably stays silent on its non-triggering case, proved by a
   suite that runs inside `npm run verify`.
7. What the hooks do **not** cover is written down rather than implied.

## Objective

`.claude/skills/` describes this project's workflow and `CLAUDE.md` states its
rules, but nothing executes either. Today the only mechanical gates are CI
(`verify` on a PR) and branch protection — both of which act *after* a push, and
neither of which can stop a commit landing on `main`, a malformed spec being
committed, or a merge going through on a check that passed by skipping. Every
rule between "the session decides to do it" and "CI sees it" is enforced by the
model choosing to follow prose.

This spec closes that window for the agent that does most of the work here, by
adding `PreToolUse` hooks that inspect the Bash command about to run and deny it
when it breaks a rule the project has already written down. It answers a
question we cannot answer today: *did the workflow hold, or did it merely get
described?* — because a denied tool call is an event, and a followed instruction
is not.

It deliberately does not claim more than that. See R7 and *Non-goals*: a
`PreToolUse` hook governs Claude Code sessions in this repo, not a person typing
`git commit` into their own terminal. Stating that boundary is the same rule as
never blurring a measured number with a constructed one.

## Source verification

| Source | Probed | Result |
|---|---|---|
| Claude Code hooks reference, `https://code.claude.com/docs/en/hooks` | WebFetch, 2026-09-02 | `PreToolUse` is a real event. `matcher` filters **tool names only**; the separate `if` field filters tool *and* command content. Blocking is either exit code 2, or exit 0 with `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}` on stdout. `${CLAUDE_PROJECT_DIR}` is available in `command` and as an env var. `timeout` is in **seconds**, default 600. |
| `PreToolUse` deny, end-to-end against the installed binary (2.1.258) | `claude -p` with a throwaway `--settings` carrying a hook, 2026-09-02 | **Deny fires and the command never runs.** Session reported "it was blocked, not executed … error `PROBE_DENY_FIRED` — no stdout, the echo never ran." Confirms the JSON contract against the shipped binary, not just the docs. |
| `PreToolUse` silent path, same probe | `claude -p` with a non-matching command, 2026-09-02 | Hook ran (logged the payload) and returned no decision; `echo PROBE_ALLOWED_OK` executed normally and its stdout came back. Confirms "stays silent otherwise" is achievable with exit 0 + no stdout. |
| `PreToolUse` stdin payload, same probe | logged from inside the hook, 2026-09-02 | Exactly these keys: `session_id`, `transcript_path`, `cwd`, `prompt_id`, `permission_mode`, `effort`, `hook_event_name`, `tool_name`, `tool_input`, `tool_use_id`. The command is at `tool_input.command`. `cwd` is the session's working directory, which is **not** necessarily the repo root. |
| `PreToolUse` under `permission_mode: "bypassPermissions"` | `claude -p --permission-mode bypassPermissions` with the same throwaway `--settings`, 2026-09-02 | **Hooks fire, and the deny is honoured.** The payload logged `permission_mode: "bypassPermissions"`, and in that session the deny case never executed ("the command was blocked before executing … the echo never executed") while the silent case ran and returned its stdout. So the four gates are **not** switched off by bypass mode — R7 states this rather than asking the implementer to guess. |
| `jq` on PATH | `command -v jq`, 2026-09-02 | `/usr/bin/jq`, 1.7.1. Present here, but **not** pinned by this repo — CI pins Node 24 and nothing else. Hooks are therefore written in Node, not jq+bash. |
| `.claude/settings.json` as it stands | read, 2026-09-02 | `permissions.allow/deny/additionalDirectories` only. **No `hooks` key** — 0003 R4 left it out on purpose so no path could dangle before this spec. |
| `npm run verify` wall time | `time npm run verify` on this branch, 2026-09-02 | **9.589s total**, exit 0, pilot included (the `pipeline/raw/` cache is present). Cheap enough to gate a push on the whole gate rather than a subset. |
| `gh pr view --json statusCheckRollup` | PR #91, 2026-09-02 | Returns `[{name, status, conclusion}]` — `verify COMPLETED SUCCESS`, `review COMPLETED SUCCESS`. |
| Repo Actions secrets | `gh api repos/:owner/:repo/actions/secrets`, 2026-09-02 | `total_count: 0`. So `claude-review.yml` is inert, **yet `review` reports `SUCCESS` on PR #91** — a live instance of the trap #44 documents. "All checks green" is therefore not a safe merge condition in this repo; R4 keys on `verify` by name. |
| `main` branch protection | `gh api .../branches/main/protection`, 2026-09-02 | `required_status_checks.contexts: ["verify"]`, `strict: false`, **`enforce_admins.enabled: false`**. |
| Default-branch resolution inside a hook | `gh repo view --json defaultBranchRef` and `git symbolic-ref refs/remotes/origin/HEAD`, 2026-09-02 | `gh` says `main`; `origin/HEAD` is **unset in this clone**. A hook must not depend on `origin/HEAD` existing, and must not shell out to `gh` on every commit. |
| Existing spec corpus, 17 files | scripted conformance scan, 2026-09-02 | 15 of 17 carry `**Status:**`, `**Issue:**` and `## Source verification`. **`0002` carries none of the three**; **`0001` uses `**Status:** complete`**, which is outside the lifecycle set. Requirement headings are `### R<n>. [ x!~] …`, but Implementation Plan sections contain lookalikes (`### R8 \`[~]\` — the count…`, `### R3 / R4 / R5 — the cmp transcript`) that a loose `^### R` match would flag. |
| Valid status set | `.claude/skills/update-spec/SKILL.md` transition table, 2026-09-02 | `draft`, `in-review`, `approved`, `in-progress`, `done`. `complete` appears only in `0001` and is not in the table. |
| Existing guard for 0003 R4 | `grep -rn 'settings.json' test/ scripts/`, 2026-09-02 | **No test exists.** 0003 R4's acceptance ("`python3 -m json.tool` parses it; no `hooks` path points at a missing file") has only ever been run by hand — and it had no `hooks` block to check. |

### One probe result this spec does not act on

`enforce_admins.enabled` is **`false`**, while `CLAUDE.md` states it is `true`
and cites 0005 R3/R4 for it. That is real drift between the documented gate and
the live one, and it makes R4 more load-bearing rather than less — an
administrator merging red is currently a thing GitHub permits. Fixing branch
protection is outside issue #4's scope, so this spec records the finding and
does not widen to cover it. It needs its own issue.

## Requirements

### Common to all four hooks

Stated once here rather than four times, because the first review round found the
same defect in R1 and the second found it unfixed in R2, R3 and R4:

**Every hook resolves the repository from `$CLAUDE_PROJECT_DIR`, falling back to
the payload's `cwd` only when that is unset, and spawns every subprocess with
that directory as its working directory.** The payload probe is the reason: `cwd`
came back as `/private/tmp/.../scratchpad/hookprobe`, outside this repository,
and the docs row records that `${CLAUDE_PROJECT_DIR}` "stays put even when Claude
enters a worktree". Anchored on `cwd` instead, each hook fails open in its own
way — `git diff --cached` returns nothing so R3's wrong-cwd case is byte-identical
to its conforming case; a bare `gh pr view` resolves *another repository's* PR and
can read its green `verify`; `npm run verify` runs whatever `verify` that
directory happens to have, or none.

So **R1, R2, R3 and R4 each carry the same acceptance case**: a payload whose
`cwd` is outside the repository, with `CLAUDE_PROJECT_DIR` set to a stub, still
reaches the correct verdict.

Command parsing and repo-root resolution live in **one shared module** (R8), not
four copies. R1 and R3 both need "does this run `git commit`", R2 needs `git
push`, R4 needs `gh pr merge`; that is one definition, and R1's compound-command
rule is exactly the part that would be right in one copy and wrong in the others.

### R1. [~] `no-main` denies a commit on the default branch

**Done, revised (2026-09-02).** `.claude/hooks/no-main.mjs`. Revised on one
point found by its own acceptance case: the branch is read with
`git branch --show-current`, **not** `git rev-parse --abbrev-ref HEAD`. Probed
2026-09-02 — on a repository with no commits yet, `rev-parse` exits 128
(`ambiguous argument 'HEAD'`) while `show-current` prints `main` and exits 0. The
`rev-parse` form was written first and stayed silent on the *first* commit to
`main`, which is the fail-open this hook exists to prevent. A case for the unborn
branch is now in the suite.

Also revised: the stub repository in the suite makes an empty initial commit, so
`R1: silent on a feature branch` is not passing vacuously — on an unborn branch
every branch lookup is degenerate and that test proved nothing.

**Acceptance — run:** `npm run test:hooks` → `pass 35, fail 0`, including
`R1: denies git commit on main, and on master`, `R1: denies inside a compound
command`, `R1: denies on a repository with no commits yet`, `R1: silent on a
feature branch`, `R1: silent on a non-commit command, and on a non-Bash tool`,
and `R1: wrong-cwd — resolves the repo from CLAUDE_PROJECT_DIR, not the payload
cwd`.


A `PreToolUse` hook on `Bash` that inspects `tool_input.command`. If the command
would run `git commit` **and** the repository's current branch is `main` or
`master`, deny with a reason naming the branch and suggesting a feature branch.
Anything else: exit 0, no stdout.

It must see `git commit` inside a compound command — `git add -A && git commit
-m x`, `cd foo; git commit`, and a leading env assignment — because that is how
commits are actually issued.

**It resolves the branch inside `$CLAUDE_PROJECT_DIR`, falling back to the
payload's `cwd` only when that is unset.** The probe recorded in the table above
is the reason: `cwd` came back as `/private/tmp/.../scratchpad/hookprobe`, which
is not this repository — `cwd` is wherever the session happens to be, and the
docs row notes `${CLAUDE_PROJECT_DIR}` "stays put even when Claude enters a
worktree". Anchoring on `cwd` would resolve to no repository, or to a *different*
one, and the hook would then stay silent on a real `main` commit — failing open
in exactly the case R1 exists to catch. It must not shell out to `gh` (a network
call on every commit) or depend on `origin/HEAD` (probed: unset in this clone).

**Acceptance:** `npm run test:hooks` includes cases proving all of:
`{"tool_name":"Bash","tool_input":{"command":"git commit -m x"}}` with a stubbed
branch of `main` → stdout parses and `permissionDecision === "deny"`; the same
with branch `feat/x` → empty stdout, exit 0; `git add -A && git commit -m x` on
`main` → deny; `git commit` on `master` → deny; `git log --oneline` on `main` →
empty stdout, exit 0. Plus the case the probe exposed: a payload whose `cwd` is a
directory **outside the repository**, with `CLAUDE_PROJECT_DIR` set to a stub
repo on `main` → deny, proving the anchor is `CLAUDE_PROJECT_DIR` and not `cwd`.

### R2. [x] `pre-push-verify` denies a push while the gate is red

**Done (2026-09-02).** `.claude/hooks/pre-push-verify.mjs`, internal
`DEADLINE_MS` 120s inside a configured `timeout` of 300s.

**Acceptance — run:** `npm run test:hooks` → `R2: denies a push when verify is
red, quoting the failing step`, `R2: silent when verify is green`, `R2: does not
invoke verify for a non-push command` (asserted by the stub's call log being
absent), `R2: a hanging verify DENIES rather than failing open` (deadline
injected at 1500ms; deny reason `did not finish within 1.5s and was killed`), and
`R2: wrong-cwd — verify runs in the project dir, not the payload cwd`. The
`timeout > DEADLINE_MS` relationship is asserted by R5's check.


A `PreToolUse` hook that, on a command that would run `git push`, runs
`npm run verify` and denies the push if it exits non-zero, quoting the failing
step from `verify`'s own `verify FAILED at: <step>` line. Green → exit 0, no
stdout.

**This is a deliberate widening of the issue's wording** and is recorded as such:
#4 says "without `npm run lint` and `npm run build` passing … plus the pipeline
tests when they exist". `npm run verify` is a strict superset of all three, it is
the single command `CLAUDE.md` names as the gate, and it is what CI runs — so
gating on anything narrower would let a contributor be green locally and land red
on the check that protects `main`, which is the exact failure `CLAUDE.md` says
`verify` exists to prevent. Probed cost: 9.589s.

**The hook owns its own deadline; the `timeout` field cannot deliver this one.**
A gate that fails open is not a gate, but the hooks reference probed above says
that on timeout a command hook's "output is discarded; no decision is made" —
which *is* failing open, and raising `timeout` only widens the window before it
happens. So the hook spawns `npm run verify` under an internal deadline and, on
expiry, emits `deny` itself while still comfortably inside the configured
`timeout`. Two numbers, the inner one strictly smaller: internal deadline `120s`
against a configured `timeout` of `300s`, both far above the probed 9.589s so a
cold clone installing nothing is not mistaken for a hang.

**Acceptance:** `npm run test:hooks` proves: a push command with a stubbed
`verify` exiting 1 → `permissionDecision === "deny"` and the reason contains the
stub's failing-step text; the same with `verify` exiting 0 → empty stdout, exit
0; a non-push git command → `verify` is **not invoked** (asserted by the stub
recording no call); a payload whose `cwd` is outside the repository, with
`CLAUDE_PROJECT_DIR` pointing at a stub repo whose `verify` fails → deny,
proving the subprocess ran in the project directory and not in `cwd`; and a
stubbed `verify` that **hangs** → the hook exits 0
having printed `permissionDecision === "deny"`, within a test-injected deadline
of a second or two. That last case is the requirement — without it the
fail-closed claim is an assertion, and it is the failure nobody would notice,
because a gate that fails open looks exactly like a gate that passed. Separately,
`.claude/settings.json` gives this hook `timeout >= 120` and strictly greater
than the hook's internal deadline, asserted by R5's settings test.

### R3. [x] `spec-format` denies a commit staging a malformed spec

**Done (2026-09-02).** `.claude/hooks/spec-format.mjs`; `validateSpec` is
exported so the corpus case calls it without spawning a process.

**Acceptance — run:** `npm run test:hooks` → the five fixture cases (missing
*Source verification*; `**Status:** finished` **and** `complete`; `### R2. [X]`
and `### R2 [x]`; filename `spec-nine.md`; a conforming fixture), both scoping
cases (an Implementation Plan lookalike outside the window is silent; an
`### Rationale` subsection *inside* the window is not treated as a requirement
heading), the corpus case — enumerated at run time, 18 specs found, every one
except `0001` and `0002` passes and **both of those are rejected** — plus
`R3: denies a commit staging a malformed spec, silent when it conforms`,
`R3: silent when nothing under specs/ is staged`, and `R3: wrong-cwd — the
failing case is not laundered into silence`.


On a command that would run `git commit`, the hook inspects the **staged** files
(`git diff --cached --name-only`). For each staged path under `specs/` that is
not `README.md` or `TEMPLATE.md`, it requires:

1. The filename matches `^\d{4}-[a-z0-9][a-z0-9-]*\.md$`.
2. A `**Status:**` line whose value is one of `draft`, `in-review`, `approved`,
   `in-progress`, `done` — the transition table's set, and **nothing else**. No
   legacy allowance for `0001`'s `complete`: the staged-only rule already
   protects it, while an allowance would also let a *new* spec be committed as
   `complete`, a status `/update-spec` has no transition out of.
3. A `## Source verification` heading.
4. At least one requirement, and **every** requirement heading well-formed:
   `### R<n>. [<mark>] <text>` with `<mark>` one of ` `, `x`, `!`, `~`.

**Check 4 is scoped by section, not by pattern.** A requirement heading is any
`### R` **followed by a digit** between the `## Requirements` heading and the
next `##`-level heading;
every one inside that window must be well-formed, and `### R…` outside it is not
a requirement heading at all. The probed lookalikes (`### R8 \`[~]\` — the
count…`, `### R3 / R4 / R5 — the cmp transcript`) live in Implementation Plan
sections and are therefore silent by construction. The digit is what keeps an
R-word subsection — `### Rationale`, `### Rollback`, or this spec's own
`### Common to all four hooks`'s neighbours — from being denied as a malformed
requirement heading; that is the false-positive direction this requirement is
otherwise careful about, and it would be the one that gets the hook disabled.
Scoping by pattern instead —
matching only `^### R\d+\.` and ignoring the rest — would *skip* a malformed
`### R2 [x]` rather than reject it, so the check would pass on the exact defect
it exists to catch.

Anything failing is denied with the path and the specific failure. Nothing
staged under `specs/` → exit 0, no stdout.

**Only staged files are checked, never the tree.** Probed: `0002` carries no
`**Status:**`, no `**Issue:**` and no *Source verification* section, and `0001`
uses the out-of-set `complete`. Both predate the process and are correct as they
are; a repo-wide check would refuse every commit in the repository. Check 4 must
also not be fooled by Implementation Plan headings that begin with `### R` but
are not requirements (probed: `### R8 \`[~]\` — the count`, `### R3 / R4 / R5 —
the cmp transcript`) — those are prose, and flagging them would make the hook
cry wolf until someone disables it.

**Acceptance:** `npm run test:hooks` proves, against fixture spec files: a spec
missing `## Source verification` → deny naming that section; a spec with
`**Status:** finished` → deny naming the valid set; a spec with `### R2. [X] …`
(capital X) → deny naming the heading; a filename `spec-nine.md` → deny; a
conforming fixture → empty stdout, exit 0. Plus the two scoping cases: a
malformed `### R2 [x]` (no dot) **inside** the Requirements section → deny, and
an `### R8 \`[~]\` — …` heading inside an Implementation Plan section → silent.
Plus the wrong-cwd case: a payload whose `cwd` is outside the repository, with
`CLAUDE_PROJECT_DIR` pointing at a stub repo that has a malformed spec staged →
deny. Anchored on `cwd` this case returns an empty index and is byte-identical
to the conforming case, so it is the one that proves the anchor.
Plus a **corpus** case in both directions: the validator **passes** every
committed spec under `specs/` except `0001` and `0002` — enumerated at run time,
never a hard-coded count, which goes stale the moment a spec is added — and
**rejects** `0001` (status `complete`) and
`0002` (no `**Status:**`, no *Source verification*). Rejecting them is the
direct evidence that staged-only scoping is load-bearing rather than
incidental — neither is ever staged, so neither is ever checked in anger.

### R4. [x] `pre-merge-verify` denies `gh pr merge` while `verify` is not green

**Done (2026-09-02).** `.claude/hooks/pre-merge-verify.mjs`.

**Acceptance — run:** `npm run test:hooks` → `R4: denies when verify is FAILURE
even though review is SUCCESS`, `R4: silent when verify is SUCCESS`, `R4: denies
when the rollup carries no verify entry`, `R4: denies when gh itself fails,
quoting stderr`, `R4: does not invoke gh for a non-merge command`, and
`R4: a bare 'gh pr merge --squash --delete-branch' is guarded, with no PR
argument` — that last one asserts the stub's call log is exactly
`pr view --json statusCheckRollup`, i.e. `gh` was left to infer the PR from the
branch.


On a command that would run `gh pr merge`, the hook reads
`gh pr view --json statusCheckRollup` for the target PR and denies unless the
check **named `verify`** has `conclusion === "SUCCESS"`. A missing `verify` entry
denies. A `gh` call that fails denies, with the error quoted.

**The target PR is resolved the way `gh` itself resolves it.** If the command
carries a PR number or URL, pass it through; otherwise call `gh pr view` with no
argument and let `gh` infer the PR from the current branch. The bare form is not
an edge case — `gh pr merge --squash --delete-branch`, with no number, is what
`/sdlc` Step 9 runs and what `/babysit` reaches for, so a hook that only guarded
the numbered form would miss every merge this project's own workflow performs.

It keys on `verify` by name rather than on "every check is green" because probed
on PR #91: `review` reports `SUCCESS` while the repo has zero Actions secrets and
`claude-review.yml` skips without reviewing. Treating that as evidence is exactly
the trap `claude-review.yml`'s own header and issue #44 describe, and a hook that
fell for it would launder a skipped review into a merge condition.

**Acceptance:** `npm run test:hooks` proves, with `gh` stubbed: rollup
`[{"name":"verify","conclusion":"FAILURE"},{"name":"review","conclusion":"SUCCESS"}]`
→ deny; rollup with `verify` `SUCCESS` → empty stdout, exit 0; rollup containing
only `review: SUCCESS` → deny (no `verify` entry); `gh` exiting non-zero → deny
with the stderr quoted; a non-merge `gh` command (`gh pr view 91`) → `gh` is not
invoked and stdout is empty; and **a bare `gh pr merge --squash --delete-branch`
with no PR number**, red `verify` → deny, with the stub recording that `gh pr
view` was called without a PR argument; and the wrong-cwd case — `cwd` outside
the repository, `CLAUDE_PROJECT_DIR` set to a stub whose `verify` is red → deny,
with the stub asserting `gh` was spawned in the project directory. Anchored on
`cwd`, `gh` would infer an unrelated repository's PR and could read its green
`verify` — a worse outcome than the skipped-review trap R4 exists to avoid.

### R5. [x] The hooks are wired, and the wiring is guarded

**Done (2026-09-02).** `.claude/settings.json` `hooks.PreToolUse`;
`scripts/check-settings.mjs`, wired into `verify` as `check:settings`.

One thing the build found: importing `pre-push-verify.mjs` for `DEADLINE_MS`
originally **hung forever**, because the hook read stdin at module top level. All
four hooks now guard their body behind `if (import.meta.main)`, so importing one
is side-effect free. Without that, R5's own assertion could not be written.

**Acceptance — run, in both directions:**

- Passing: `npm run verify` prints
  `==> hook wiring (0018 R5 ...)` → `check-settings: 4 hooks wired, all paths and deadlines OK`.
- Missing script: `check-settings FAILED: - PreToolUse: .claude/hooks/no-main.mjs does not exist on disk`, non-zero. Restored → green.
- Equal deadlines: `check-settings FAILED: - pre-push-verify: timeout (120s) must be strictly greater than DEADLINE_MS (120s). Equal values race, and a lost race is a silently allowed push.` Restored → green.
- Off-shape command (`bash -c "node .claude/hooks/no-main.mjs"`): `check-settings FAILED: - PreToolUse: command is not the required shape`. Restored → green.


`.claude/settings.json` grows a `hooks.PreToolUse` block registering all four
scripts under `matcher: "Bash"`, each path written with `${CLAUDE_PROJECT_DIR}`
so it resolves from any cwd (probed: `cwd` in the payload is the session
directory, not necessarily the repo root).

This also finally closes 0003 R4's acceptance, which has only ever been run by
hand and had no `hooks` block to check (probed: no test references
`settings.json`). Add `scripts/check-settings.mjs`, wired into `verify`, that
asserts: the file parses as JSON; every hook `command` resolves to a file that
exists on disk; every hook carries a `timeout`; and R2's hook has `timeout >= 120`
**and strictly greater than that hook's own internal deadline**.

Three things this requirement has to pin down, because the assertions are not
implementable until it does:

- **The relationship, not a floor.** R2's fail-closed behaviour depends on the
  hook's `deny` being emitted *before* the outer cancel, and the probed reference
  is explicit that a timed-out hook "doesn't block the tool call … don't count on
  a stalled hook to act as a gate". An internal deadline of `120` inside a
  configured `timeout` of `120` satisfies a floor and still races, and a lost
  race is the discarded-output fail-open R2 exists to close. Assert
  `timeout * 1000 > DEADLINE_MS`.
- **How the check reads the inner number.** It must not parse hook source. The
  hook exports `export const DEADLINE_MS`, and `check-settings.mjs` imports it —
  "assert the inner is strictly smaller" is not writable until the inner number
  has an address.
- **How the check gets a path out of a command.** A hook `command` is a shell
  string (`node "${CLAUDE_PROJECT_DIR}/.claude/hooks/no-main.mjs"`), not a path.
  Rather than write a shell parser, **require the commands to take a fixed
  shape** — exactly `node "${CLAUDE_PROJECT_DIR}/.claude/hooks/<name>.mjs"` — and
  have the check assert that shape first, then existence. R3's check 2 is the
  precedent for how specific this spec is willing to be about a pattern.

**Acceptance:** `npm run verify` runs the new step and prints it. Each of these,
recorded in the evaluation in **both** directions — a guard proven only in the
passing direction is not proven: deleting one hook script → non-zero naming that
path, restored → green; setting R2's `timeout` equal to `DEADLINE_MS / 1000` →
non-zero naming the relationship, restored → green; rewriting one `command` to a
shape the pattern does not match → non-zero.

### R6. [x] Each hook is proved to block its case and stay silent otherwise

**Done (2026-09-02).** `.claude/hooks/tests/hooks.test.mjs`, `npm run test:hooks`,
wired into `verify`. 35 cases, every hook with at least one deny and one silent.
Unconditional: `git`, `gh` and `npm` are stubbed onto `PATH`, no network and no
response cache.

**Acceptance — run, in both directions:**

- `npm run test:hooks` → `pass 35, fail 0`, and `npm run verify` runs it as
  `==> hook tests (0018 R6 ...)`.
- Mutation: changing R1's `PROTECTED` set to `new Set([])` turns the suite red —
  `pass 31, fail 4`, failing exactly the four R1 deny cases. Restored →
  `pass 35, fail 0`. A suite that cannot fail proves nothing.


The Definition of done in #4 is "each hook demonstrably blocks its case and stays
silent otherwise". Make that mechanical rather than a claim:
`.claude/hooks/tests/hooks.test.mjs` run by `npm run test:hooks`, driving each
hook the way Claude Code does — spawn
the script, write the real `PreToolUse` payload shape to stdin (the ten keys
probed above), read stdout and the exit code.

Every hook gets **both** directions: at least one deny case and at least one
silent case. A hook with only deny cases is untested for the failure mode that
actually matters — a hook that blocks work it should not, which is how enforcement
gets switched off.

**It lives beside the hooks, not under `test/`.** `package.json` already runs
`test:app` as `node --test "test/**/*.test.mjs"`, and that glob is recursive, so
`test/hooks.test.mjs` — or `test/hooks/` — would run twice per `verify` and
surface a genuine hooks failure under `scripts/verify.sh`'s fixed text "app
tests — the .mjs lint config block regressed". That text is not cosmetic: R2's
hook quotes `verify`'s own `verify FAILED at: <step>` line into its deny reason,
so a broken hook would deny a push while blaming the lint-config guard.
`.claude/hooks/tests/` also follows the repo's own precedent of tests beside the
code they cover (`pipeline/tests/`), and keeps `test:hooks` a single step.

`test:hooks` is added to `scripts/verify.sh` in the same change, per `CLAUDE.md`:
a check added to CI is added to `verify`. It must be **unconditional** — no
network, no `pipeline/raw/`, no live `gh` — so it runs in a fresh clone. `gh`,
`git` and `npm run verify` are stubbed via `PATH` injection, never called for
real.

**Acceptance:** `npm run test:hooks` exits 0 with at least two cases per hook
(one deny, one silent), and `npm run verify` includes the step. Inverting any one
hook's condition in the source makes the suite go red — recorded in the
evaluation for at least one hook, since a suite that cannot fail proves nothing.

### R7. [x] The hooks state what they do not cover

**Done (2026-09-02).** `.claude/hooks/README.md`; `CLAUDE.md` gains a
*Workflow hooks* subsection under *The workflow*.

The `bypassPermissions` question is answered from the probe rather than guessed:
**hooks fire and their deny is honoured**, so the four gates are not switched off
by bypass mode. Stated positively in the README, since the reasonable assumption
is the opposite.

**Acceptance — run:** `npm run test:hooks` → `R7: the README states the probed
bypassPermissions answer, not merely the word` (matches the *claim*, so a README
saying the opposite fails) and `R7: CLAUDE.md points at the hooks README and
repeats the boundary`.


`.claude/hooks/README.md` records, in the same register `CLAUDE.md` uses for
tiers: these are **Claude Code `PreToolUse` hooks**. They govern Bash commands
issued by a Claude Code session in this repository. They do **not** govern a
person typing `git commit` in a terminal, a push from an editor's UI, a merge
through the GitHub web interface, or CI. Git's own `.git/hooks` are not
committed and this spec does not install `core.hooksPath`.

It must also record the **probed** answer on bypass mode, not a guess: a session
run with `--permission-mode bypassPermissions` still fires these hooks and still
honours their `deny` (row added to the table above, probed 2026-09-02). So the
four gates stay on in bypass mode — which is worth stating positively, because a
reader's reasonable assumption is the opposite, and if it had gone the other way
this paragraph would have been the only place anyone learned the gates were off.

Without this, R1's goal clause reads as "a commit to `main` is refused" full
stop, which is broader than what was built. Overstating a guarantee is the same
defect as shipping an untiered number.

**Acceptance:** `.claude/hooks/README.md` exists and names all five uncovered
paths above; `CLAUDE.md` gains a short *Workflow hooks* subsection pointing at
it and repeating the boundary in one sentence. Checked by reading, and by a
`test:hooks` case asserting the README states that hooks **do** fire under
`bypassPermissions` — the claim, not merely the word. A string-presence check on
`bypassPermissions` passes a README that says the opposite of what was probed,
which is the same defect as a tier badge that renders whatever it is handed.

### R8. [~] One shared module, not four copies of the same parser

**Done, revised (2026-09-02).** `.claude/hooks/lib.mjs` — `readPayload`,
`runsCommand`, `repoRoot`, `runIn`, `deny`, `silent`.

**Revised: a heredoc body is data, not commands.** Found on the hooks' first
live use, which is the only place it could have been found. Posting this spec's
own evaluation with `gh pr comment --body-file` and a heredoc whose *prose*
discussed the merge command was **denied** by `pre-merge-verify`, which had read
the prose as an invocation:

```
Refusing to merge: could not read the checks for this PR.
  gh pr view `gh --json statusCheckRollup
  no pull requests found for branch "\`gh"
```

`runsCommand` now strips heredoc bodies (`<<WORD`, `<<-WORD`, `<<'WORD'`,
`<<"WORD"`) before segmenting. This is the **false-positive** direction R3
already worried about in its "cry wolf until someone disables it" sentence, and
it turned out to bite R4 first: a hook that blocks real work is one that gets
switched off, which costs more than the case it caught. It also blocked the
command that would have fixed it, so the fix had to be applied without a shell.

**Acceptance — run:** `npm run test:hooks` → three `runsCommand` cases covering
every form in the requirement, including `git -C some/path commit -m x` → true
and the false directions (`echo "git commit"`, `git commit-tree`,
`git log --oneline`, `git pushall`, `gh pr view 92`); `R8: repoRoot prefers
CLAUDE_PROJECT_DIR over the payload cwd`; and `R8: each hook imports the shared
module rather than re-implementing it`, which greps each of the four scripts and
fails if any re-implements `runsCommand` or reads `process.env.CLAUDE_PROJECT_DIR`
itself — the import guard, on the model of `wizard.render.test.jsx`. Plus
`R8: a heredoc body is data, not commands`, covering all three heredoc forms and
asserting that a real command *after* the terminator still counts.


`.claude/hooks/lib.mjs` carries the four things every hook needs, and each hook
imports rather than re-implements:

1. **Reading the payload** — parse stdin, return `tool_input.command` and
   `permission_mode`; a malformed or empty payload is silent, never a crash.
2. **`runsCommand(command, "git commit")`** — the compound-command rule in one
   place: `&&`, `||`, `;`, `|`, a leading env assignment, and `$( )`. R1 and R3
   both ask "does this run `git commit`", R2 asks `git push`, R4 asks
   `gh pr merge`. That is one definition with four callers.
3. **`repoRoot()`** — `$CLAUDE_PROJECT_DIR`, falling back to the payload's `cwd`,
   as *Common to all four hooks* requires, plus the `spawnSync` options that put
   every subprocess there.
4. **`deny(reason)`** — emit the exact `hookSpecificOutput` shape probed above
   and exit 0. One place where the contract with the binary lives.

The reason is the shape of the first two review rounds: the `cwd` anchor was
fixed in R1 and stayed broken in R2, R3 and R4, because there were four places to
fix it. Four copies of the compound-command rule would repeat that, and the
copies that are wrong are silent — they under-match, so the hook simply does not
fire and looks exactly like a hook that had nothing to say.

**Acceptance:** `npm run test:hooks` tests `runsCommand` directly, and each of
the four hook scripts imports it — asserted by a case that greps each script for
its own re-implementation of command splitting and fails if one appears, the same
shape as `wizard.render.test.jsx`'s import guard. `runsCommand` cases:
`git commit -m x` → true; `git add -A && git commit -m x` → true;
`cd foo; git commit` → true; `FOO=bar git commit` → true;
`git -C some/path commit -m x` → **true** — a substring match on `git commit`
returns false here, which is exactly the silent under-match R8 exists to
prevent; `echo "git commit"` → **false** (a quoted mention is not an
invocation); `git commit-tree` → **false**; `git log --oneline` → false.


## Implementation Plan

Sequence order. R8 is first because R1–R4 import it — building a hook before the
shared module means writing the parser twice, which is the defect R8 exists to
prevent.

| Step | Requirement | Files |
|---|---|---|
| 1 | R8 | `.claude/hooks/lib.mjs` — `readPayload`, `runsCommand`, `repoRoot`, `deny` |
| 2 | R1 | `.claude/hooks/no-main.mjs` |
| 3 | R3 | `.claude/hooks/spec-format.mjs` |
| 4 | R2 | `.claude/hooks/pre-push-verify.mjs` (exports `DEADLINE_MS`) |
| 5 | R4 | `.claude/hooks/pre-merge-verify.mjs` |
| 6 | R5 | `.claude/settings.json` hooks block; `scripts/check-settings.mjs` |
| 7 | R6 | `.claude/hooks/tests/hooks.test.mjs`; `package.json` `test:hooks`; `scripts/verify.sh` |
| 8 | R7 | `.claude/hooks/README.md`; `CLAUDE.md` *Workflow hooks* |

Notes that bind the build:

- Every hook is `node` with **zero dependencies**, reading stdin, writing at most
  one JSON object to stdout, always exiting 0. Exit 2 is available but unused —
  one deny path is easier to test than two.
- Silence is the default. Any unexpected state (unparseable payload, `git` not
  found, a repo root that does not resolve) exits silently rather than denying,
  **except** where a requirement says otherwise: R2 on timeout and R4 on a failed
  `gh` call both deny, because there the absence of an answer is the risk.
- The test suite stubs `git`, `gh` and `npm` by prepending a fixture directory to
  `PATH`. Nothing in it touches the network, `pipeline/raw/`, or the real repo.

## Non-goals

- **Git hooks via `core.hooksPath`.** Would cover humans too, but needs a
  per-clone opt-in step that nothing enforces, and #4 scopes the work to
  `.claude/hooks/` wired through `.claude/settings.json`. Recorded here so the
  gap in R7 is a decision, not an oversight.
- **Fixing `enforce_admins`.** Probed false against `CLAUDE.md`'s claim of true.
  Real, and someone else's ticket.
- **Installing the Claude GitHub App / `ANTHROPIC_API_KEY`.** That is #44, an
  account-holder action. R4 works around its consequence rather than fixing it.
- **The three CodeRadar hooks #4 excludes** — `pre-commit-lint` (subsumed by
  R2), `post-commit-datebump` (these specs carry no `updated:` field),
  `pre-implement-guard` (`/implement` already validates status and sources).
- **Enforcing anything about tiers, imputation or citations.** The data
  non-negotiables are reviewed by `REVIEW.md` Pass 1 and tested by the pipeline
  suite. A Bash-command hook is the wrong instrument.
- **Narrowing the hooks with the `if` field.** The table probed it — `if` takes
  permission-rule syntax (`"Bash(git commit*)"`), is evaluated on `PreToolUse`,
  and would stop four Node processes spawning on every `ls`. All four are wired
  on `matcher: "Bash"` anyway, deliberately: narrowing at the settings layer puts
  the "is this my command?" decision somewhere R6's suite cannot reach, and that
  decision — R1's compound-command rule especially — is the exact part most
  likely to be subtly wrong. Keeping it inside the hook keeps it tested. Revisit
  if the spawn cost ever shows up as latency; the four processes read stdin,
  decide, and exit.

- **Blocking `git push --force` or `git reset --hard`.** Already denied by
  `permissions.deny` in `.claude/settings.json`; duplicating them in a hook would
  give two places to keep in sync.
