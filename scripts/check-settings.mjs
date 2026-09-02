#!/usr/bin/env node
// Spec 0018 R5 — guard the hook wiring.
//
// This also closes spec 0003 R4's acceptance, which had only ever been run by
// hand ("python3 -m json.tool parses it; no hooks path points at a missing
// file") and which had no `hooks` block to check until 0018.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS = join(ROOT, ".claude/settings.json");

// A hook `command` is a shell string, not a path. Rather than write a shell
// parser, R5 REQUIRES the fixed shape and asserts it before existence — the
// same willingness to be specific about a pattern that R3's check 2 shows.
const COMMAND_SHAPE = /^node "\$\{CLAUDE_PROJECT_DIR\}\/(\.claude\/hooks\/[a-z0-9-]+\.mjs)"$/;

// lib.mjs is imported by the hooks, never registered as one.
const NOT_A_HOOK = new Set(["lib.mjs"]);

const problems = [];
const fail = (m) => problems.push(m);

let settings;
try {
  settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
} catch (err) {
  console.error(`check-settings: .claude/settings.json does not parse — ${err.message}`);
  process.exit(1);
}

const entries = [];
for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
  for (const group of groups ?? []) {
    for (const hook of group.hooks ?? []) entries.push({ event, hook });
  }
}

const registered = new Set();

for (const { event, hook } of entries) {
  const cmd = hook.command ?? "";
  const match = COMMAND_SHAPE.exec(cmd);
  if (match) registered.add(match[1].split("/").pop());

  if (!match) {
    fail(
      `${event}: command is not the required shape\n` +
        `    got:      ${cmd}\n` +
        `    expected: node "\${CLAUDE_PROJECT_DIR}/.claude/hooks/<name>.mjs"`,
    );
    continue;
  }

  if (!existsSync(join(ROOT, match[1]))) {
    fail(`${event}: ${match[1]} does not exist on disk`);
  }

  if (typeof hook.timeout !== "number") {
    fail(`${event}: ${match[1]} has no numeric timeout`);
  }
}

// Every hook script on disk must actually be registered. `existsSync` above
// catches a script deleted out from under a settings entry; this catches the
// other direction — a hook entry deleted from settings.json, which otherwise
// left `verify` green while printing "3 hooks wired, all paths and deadlines
// OK". A guard reporting success on precisely the state it exists to detect is
// the silent-guard shape this spec keeps finding. It also means the next hook
// cannot be added and left unwired.
// Report rather than throw: an uncaught ENOENT here exits before the collected
// problems are printed, so `verify` fails with a stack trace instead of this
// guard's own message. It still fails either way — this is about the guard
// being legible when it does.
let onDisk = [];
try {
  onDisk = readdirSync(join(ROOT, ".claude/hooks"))
    .filter((f) => f.endsWith(".mjs") && !NOT_A_HOOK.has(f))
    .sort();
} catch (err) {
  fail(`.claude/hooks/ could not be read — ${err.code ?? err.message}`);
}

for (const file of onDisk) {
  if (!registered.has(file)) {
    fail(
      `.claude/hooks/${file} exists but is not registered in .claude/settings.json — ` +
        `an unwired hook guards nothing`,
    );
  }
}

// R2's hook: timeout >= 120 AND strictly greater than its own internal
// deadline. A floor alone is not enough — an internal deadline of 120s inside a
// configured timeout of 120s satisfies "timeout >= 120" and still races, and
// losing that race is the discarded-output fail-open R2 exists to close:
// "a timed-out command hook doesn't block the tool call".
const pushHook = entries.find(({ hook }) =>
  (hook.command ?? "").includes("pre-push-verify.mjs"),
)?.hook;

if (!pushHook) {
  fail("no pre-push-verify hook is registered");
} else {
  // Imported, never parsed out of the source. Wrapped for the same reason as
  // readdirSync above: an unresolvable import throws ERR_MODULE_NOT_FOUND and
  // exits before the collected problems print, turning this guard's failure
  // into a stack trace.
  let DEADLINE_MS;
  let imported = false;
  try {
    ({ DEADLINE_MS } = await import(join(ROOT, ".claude/hooks/pre-push-verify.mjs")));
    imported = true;
  } catch (err) {
    fail(`could not import .claude/hooks/pre-push-verify.mjs — ${err.code ?? err.message}`);
  }

  // Track whether the import succeeded; do NOT infer it from DEADLINE_MS being
  // undefined. `import()` resolves to a namespace object, so destructuring a
  // name the module does not carry yields undefined *without throwing* — and
  // inferring from the value would then skip the assertions below and print the
  // success line on exactly the state this guard exists to detect. Removing or
  // renaming the export has to fail here, not pass quietly.
  if (!imported) {
    // Already reported by the catch above; nothing further to assert.
  } else if (typeof DEADLINE_MS !== "number") {
    fail("pre-push-verify.mjs does not export a numeric DEADLINE_MS");
  } else {
    if (DEADLINE_MS < 120_000) {
      fail(`pre-push-verify DEADLINE_MS is ${DEADLINE_MS}ms, below the 120s floor`);
    }
    if (!(pushHook.timeout * 1000 > DEADLINE_MS)) {
      fail(
        `pre-push-verify: timeout (${pushHook.timeout}s) must be strictly greater than ` +
          `DEADLINE_MS (${DEADLINE_MS / 1000}s). Equal values race, and a lost race is ` +
          `a silently allowed push.`,
      );
    }
  }
}

if (problems.length) {
  console.error("check-settings FAILED:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}

console.log(
  `check-settings: ${entries.length} hooks wired (${onDisk.length} on disk, all registered), ` +
    `paths and deadlines OK`,
);
