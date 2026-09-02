#!/usr/bin/env node
// Spec 0018 R2 — deny `git push` while `npm run verify` is red.
//
// Gates on `verify`, not on lint+build as issue #4 worded it: verify is a
// strict superset, it is the command CLAUDE.md names as the gate, and it is
// what CI runs. Gating on less lets a contributor be green locally and land red
// on the check that protects main. Probed cost: 9.589s.

import { readPayload, runsCommand, repoRoot, runIn, deny, silent } from "./lib.mjs";

// The hook owns its deadline; the settings `timeout` field cannot deliver this.
// The hooks reference is explicit that a timed-out command hook "doesn't block
// the tool call ... don't count on a stalled hook to act as a gate" — output
// discarded, no decision, which IS failing open. So we deny ourselves, well
// inside the configured timeout.
//
// R5's check-settings.mjs imports this constant and asserts
// `timeout * 1000 > DEADLINE_MS`, so the two numbers cannot drift into the
// wrong order. Overridable only for the test suite, which cannot wait 120s.
export const DEADLINE_MS = Number(process.env.HOOK_VERIFY_DEADLINE_MS) || 120_000;

function tail(text, lines = 20) {
  return text.trim().split("\n").slice(-lines).join("\n");
}

// Everything below runs only when this file IS the hook. Importing it — which
// R5's check-settings.mjs does for DEADLINE_MS, and R6's suite does for
// validateSpec — must not read stdin, or the importer blocks forever waiting
// for a payload that is never coming.
if (import.meta.main) {
  const { toolName, command, cwd } = await readPayload();
  if (toolName !== "Bash" || !runsCommand(command, "git push")) silent();

  // Anchored on the payload's cwd this would run whatever `verify` script that
  // directory happens to have, or none at all.
  const root = repoRoot(cwd);
  if (!root) silent();

  const result = runIn(root, "npm", ["run", "--silent", "verify"], {
    timeout: DEADLINE_MS,
  });

  // spawnSync sets .error with code ETIMEDOUT when it kills the child. Deny —
  // an unfinished gate is not a passed gate, and this is the failure nobody
  // would notice, because failing open looks exactly like passing.
  if (result.error && result.error.code === "ETIMEDOUT") {
    deny(
      `Refusing to push: 'npm run verify' did not finish within ${DEADLINE_MS / 1000}s ` +
        `and was killed.\n\nAn unfinished gate is not a passed gate. Run it by hand ` +
        `to see where it hangs.\n\n(spec 0018 R2)`,
    );
  }

  if (result.status === 0) silent();

  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const step = output.match(/^verify FAILED at: (.+)$/m);

  deny(
    `Refusing to push: 'npm run verify' is red` +
      (step ? ` — failed at: ${step[1]}` : "") +
      `.\n\nCI runs the same command, so this push would land red on the check ` +
      `that gates main. Fix it and push again.\n\n` +
      tail(output) +
      `\n(spec 0018 R2)`,
  );
}
