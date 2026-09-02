#!/usr/bin/env node
// Spec 0018 R4 — deny `gh pr merge` unless the check named `verify` is green.
//
// Keys on `verify` BY NAME, never on "all checks are green". Probed 2026-09-02
// on PR #91: `review` reports SUCCESS while the repo has zero Actions secrets
// and claude-review.yml skips without reviewing. That workflow passes when it
// skips — its own header says so, and #44 is the fix. A hook that read the
// rollup as a whole would launder a skipped review into a merge condition.

import {
  readPayload,
  runsCommand,
  commandSegments,
  repoRoot,
  runIn,
  deny,
  silent,
} from "./lib.mjs";

const REQUIRED_CHECK = "verify";

// Everything below runs only when this file IS the hook. Importing it — which
// R5's check-settings.mjs does for DEADLINE_MS, and R6's suite does for
// validateSpec — must not read stdin, or the importer blocks forever waiting
// for a payload that is never coming.
if (import.meta.main) {
  const { toolName, command, cwd } = await readPayload();
  if (toolName !== "Bash" || !runsCommand(command, "gh pr merge")) silent();

  // Anchored on the payload's cwd, `gh pr view` with no argument infers the PR
  // from whatever repository that directory belongs to — and could read an
  // unrelated repository's green `verify`. That is worse than the trap above.
  const root = repoRoot(cwd);
  if (!root) silent();

  // Resolve the target the way gh does: pass through a number or URL when the
  // command carries one, otherwise let gh infer from the current branch. The bare
  // form is not an edge case — `gh pr merge --squash --delete-branch` is what
  // /sdlc Step 9 runs.
  const target = targetFrom(command);
  const args = ["pr", "view", ...(target ? [target] : []), "--json", "statusCheckRollup"];

  const result = runIn(root, "gh", args);
  if (result.status !== 0) {
    deny(
      `Refusing to merge: could not read the checks for this PR.\n\n` +
        `  gh ${args.join(" ")}\n  ${(result.stderr || "").trim()}\n\n` +
        `Without an answer there is no evidence 'verify' is green.\n\n(spec 0018 R4)`,
    );
  }

  let checks;
  try {
    checks = JSON.parse(result.stdout).statusCheckRollup ?? [];
  } catch {
    deny(
      `Refusing to merge: could not parse 'gh pr view --json statusCheckRollup'.\n\n` +
        `(spec 0018 R4)`,
    );
  }

  const verify = checks.find((c) => (c.name ?? c.context) === REQUIRED_CHECK);

  if (!verify) {
    deny(
      `Refusing to merge: no check named '${REQUIRED_CHECK}' on this PR.\n\n` +
        `Checks present: ${checks.map((c) => c.name ?? c.context).join(", ") || "(none)"}\n\n` +
        `'${REQUIRED_CHECK}' is the required status check on main. A rollup without ` +
        `it is not evidence of anything — note that 'review' passes when it skips ` +
        `(#44).\n\n(spec 0018 R4)`,
    );
  }

  const conclusion = verify.conclusion ?? verify.state;
  if (conclusion === "SUCCESS") silent();

  deny(
    `Refusing to merge: '${REQUIRED_CHECK}' is ${conclusion ?? "not finished"}, not SUCCESS.\n\n` +
      `Every other check being green is not a substitute — 'review' reports SUCCESS ` +
      `when it skips for want of an API key (#44).\n\n(spec 0018 R4)`,
  );

  // A PR number, a #-prefixed number, a URL, or a branch name given as the first
  // non-flag argument to `gh pr merge`.
  function targetFrom(command) {
    // commandSegments, not a private split: it strips heredoc bodies and
    // handles quoting, and R8 exists so there is one definition of "what counts
    // as a command here" rather than two that drift.
    const seg = commandSegments(command).find((s) => runsCommand(s, "gh pr merge"));
    if (!seg) return null;
    const words = seg.trim().split(/\s+/);
    const at = words.findIndex((w, i) => w === "merge" && words[i - 1] === "pr");
    for (const word of words.slice(at + 1)) {
      if (word.startsWith("-")) continue;
      return word.replace(/^#/, "");
    }
    return null;
  }
}
