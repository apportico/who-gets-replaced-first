#!/usr/bin/env node
// Spec 0018 R1 — deny `git commit` on the default branch.
//
// Silent on a feature branch, and silent on anything that is not a commit.

import { readPayload, runsCommand, repoRoot, runIn, deny, silent } from "./lib.mjs";

const PROTECTED = new Set(["main", "master"]);

// Everything below runs only when this file IS the hook. Importing it — which
// R5's check-settings.mjs does for DEADLINE_MS, and R6's suite does for
// validateSpec — must not read stdin, or the importer blocks forever waiting
// for a payload that is never coming.
if (import.meta.main) {
  const { toolName, command, cwd } = await readPayload();
  if (toolName !== "Bash" || !runsCommand(command, "git commit")) silent();

  // $CLAUDE_PROJECT_DIR first — see repoRoot(). Anchored on the payload's cwd
  // this hook would read some other repository's branch, or none, and stay quiet
  // on a real commit to main.
  const root = repoRoot(cwd);
  if (!root) silent();

  // `branch --show-current`, NOT `rev-parse --abbrev-ref HEAD`. Probed
  // 2026-09-02: on a repository with no commits yet, rev-parse exits 128
  // ("ambiguous argument 'HEAD'") while show-current prints `main` and exits 0.
  // The rev-parse form therefore stays silent on the *first* commit to main,
  // which is the fail-open this hook exists to prevent. show-current also
  // prints nothing on a detached HEAD, which is correctly not a protected
  // branch.
  const branch = runIn(root, "git", ["branch", "--show-current"]);
  if (branch.status !== 0) silent();

  const name = (branch.stdout || "").trim();
  if (!PROTECTED.has(name)) silent();

  deny(
    `Refusing to commit on '${name}'. This project never commits to the default ` +
      `branch — see CLAUDE.md. Create a feature branch first:\n\n` +
      `  git checkout -b <type>/<nnnn>-<short-name>\n\n` +
      `(spec 0018 R1)`,
  );
}
