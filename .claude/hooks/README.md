# Workflow enforcement hooks

Spec [0018](../../specs/0018-workflow-hooks.md), issue
[#4](https://github.com/apportico/who-gets-replaced-first/issues/4).

Four `PreToolUse` hooks that make `CLAUDE.md`'s rules mechanical instead of
advisory. Each one reads the Bash command about to run, and either denies it or
says nothing.

| Hook | Denies | Requirement |
|---|---|---|
| `no-main.mjs` | `git commit` while on `main` or `master` | R1 |
| `spec-format.mjs` | `git commit` staging a malformed spec | R3 |
| `pre-push-verify.mjs` | `git push` while `npm run verify` is red | R2 |
| `pre-merge-verify.mjs` | `gh pr merge` while the check named `verify` is not `SUCCESS` | R4 |

`lib.mjs` (R8) holds the payload reader, the command parser, the repo-root
resolution and the deny shape — one copy, four callers. `tests/hooks.test.mjs`
(R6) drives each hook the way Claude Code does and proves **both** directions:
it denies its case, and it stays silent otherwise. `scripts/check-settings.mjs`
(R5) guards the wiring.

## What these do not cover

This is the honest boundary, and it is written here rather than implied because
overstating a guarantee is the same defect as shipping an untiered number.

These are **Claude Code `PreToolUse` hooks**. They govern Bash commands issued by
a Claude Code session in this repository. They do **not** govern:

- **A person typing `git commit` in a terminal.** Nothing is intercepted.
- **A commit or push from an editor's UI** — VS Code's source control panel,
  JetBrains, a GUI client.
- **A merge through the GitHub web interface.** `pre-merge-verify` guards the
  `gh pr merge` command, not the green button.
- **CI.** The workflows run on GitHub's runners, where none of this exists.
- **Git's own hooks.** `.git/hooks` is not committed and this spec does not
  install `core.hooksPath`, so there is no per-clone hook either. That was
  considered and declined in 0018's *Non-goals*: it would cover humans, but it
  needs a per-clone opt-in step that nothing enforces.

The gates that *do* apply to everyone are branch protection on `main` (the
`verify` required status check) and CI. These hooks sit in front of those, so a
session finds out in one second rather than after a push.

## Under `bypassPermissions`

**The hooks still fire, and their `deny` is still honoured.** Probed 2026-09-02
against Claude Code 2.1.258: a session started with
`--permission-mode bypassPermissions` logged `permission_mode:
"bypassPermissions"` in the hook payload, the deny case never executed, and the
silent case ran normally. Both directions, so this is not merely "the hook
process started".

Worth stating positively, because the reasonable assumption is the opposite. If
it had gone the other way, a session in bypass mode would have had all four gates
off and this paragraph would have been the only place anyone learned it.

## How they behave

- **Silence is the default.** Any unexpected state — an unparseable payload, no
  `git`, a repo root that does not resolve — exits silently. A hook that denies
  on confusion gets switched off, and a switched-off hook guards nothing.
- **Two exceptions deny instead**, because there the absence of an answer *is*
  the risk: `pre-push-verify` when `verify` exceeds its deadline, and
  `pre-merge-verify` when the `gh` call fails. An unfinished gate is not a
  passed gate.
- **They never call the network** except `pre-merge-verify`, which runs
  `gh pr view` — and only on a command that would actually merge.
- **`pre-merge-verify` keys on the check named `verify`,** never on "all checks
  are green". `claude-review.yml` passes when it skips (see
  [#44](https://github.com/apportico/who-gets-replaced-first/issues/44)), so a
  green rollup is not evidence a review ran.

## Deadlines

`pre-push-verify` runs the full `npm run verify` (~10s warm). It owns an internal
`DEADLINE_MS` of 120s and is configured with a `timeout` of 300s.

The two numbers must stay in that order, and `check-settings.mjs` asserts it. The
hooks reference is explicit that a timed-out command hook "doesn't block the tool
call … don't count on a stalled hook to act as a gate" — so if the outer timeout
won the race, the hook's `deny` would be discarded and the push would proceed.
Failing open looks exactly like passing, which is why it is asserted rather than
assumed.

## Changing them

They are wired in `.claude/settings.json` under `hooks.PreToolUse`, all on
`matcher: "Bash"`. The command must take the shape
`node "${CLAUDE_PROJECT_DIR}/.claude/hooks/<name>.mjs"` — `check-settings.mjs`
asserts the shape before it checks the file exists, so that it never has to parse
a shell string.

Adding a hook means adding a requirement to a spec first, then its script, then
its cases in `tests/hooks.test.mjs` — **both** directions, or the new hook is
untested for the failure mode that matters most, which is blocking work it
should not.
