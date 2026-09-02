// Spec 0018 R8 — the one place the four hooks agree.
//
// Four copies of the compound-command rule is what rounds 1 and 2 of the spec
// review caught twice: a fix lands in one hook and stays open in the other
// three. The copies that are wrong are *silent* — they under-match, so the hook
// simply does not fire and looks exactly like a hook with nothing to say.
//
// Zero dependencies, per CLAUDE.md. Node 24 only.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Read the PreToolUse payload from stdin.
 *
 * Probed 2026-09-02 against Claude Code 2.1.258: the payload carries
 * session_id, transcript_path, cwd, prompt_id, permission_mode, effort,
 * hook_event_name, tool_name, tool_input, tool_use_id. The command is at
 * tool_input.command.
 *
 * A malformed or empty payload returns an empty shape rather than throwing —
 * a hook that crashes on a payload it did not expect is a hook that stops
 * guarding, and nothing upstream would report it.
 */
export async function readPayload(stream = process.stdin) {
  let raw = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) raw += chunk;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { toolName: "", command: "", cwd: "", permissionMode: "" };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { toolName: "", command: "", cwd: "", permissionMode: "" };
  }
  const input = parsed.tool_input;
  return {
    toolName: typeof parsed.tool_name === "string" ? parsed.tool_name : "",
    command:
      input && typeof input === "object" && typeof input.command === "string"
        ? input.command
        : "",
    cwd: typeof parsed.cwd === "string" ? parsed.cwd : "",
    permissionMode:
      typeof parsed.permission_mode === "string" ? parsed.permission_mode : "",
  };
}

// A heredoc body is DATA, not commands. Strip it before anything else.
//
// Found the hard way on this hook's first live use (2026-09-02): posting a PR
// comment with `gh pr comment --body-file` and a heredoc whose text discussed
// `gh pr merge` was denied by pre-merge-verify, which had read the prose as an
// invocation. That is the false-positive direction — a hook that blocks real
// work is one that gets switched off, which costs more than the case it caught.
//
// Handles <<WORD, <<-WORD (leading tabs stripped from the terminator) and the
// quoted forms <<'WORD' / <<"WORD". `<<<` here-strings do not match, since the
// character after `<<<` is not a word character.
function stripHeredocs(command) {
  const lines = command.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i++];
    out.push(line);
    const openers = [...line.matchAll(/<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/g)];
    for (const [, dash, , word] of openers) {
      while (i < lines.length) {
        const body = lines[i++];
        if ((dash ? body.replace(/^\t+/, "") : body) === word) break;
      }
    }
  }
  return out.join("\n");
}

// Split a shell command into the segments that could each start a fresh
// invocation: && || ; | newline, and the insides of $( ) and back-ticks.
// Quoted regions are dropped, so `echo "git commit"` carries no invocation —
// a mention of a command is not a use of it.
function segments(command) {
  const out = [];
  let buf = "";
  let quote = null;
  const push = () => {
    if (buf.trim()) out.push(buf.trim());
    buf = "";
  };

  for (let i = 0; i < command.length; i++) {
    const c = command[i];

    if (quote) {
      // Inside double quotes a $( ) substitution still runs.
      if (quote === '"' && c === "$" && command[i + 1] === "(") {
        const end = matchParen(command, i + 1);
        if (end !== -1) {
          out.push(...segments(command.slice(i + 2, end)));
          i = end;
          continue;
        }
      }
      if (c === "\\" && quote === '"') {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }

    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }

    if (c === "\\") {
      i++;
      continue;
    }

    if (c === "$" && command[i + 1] === "(") {
      const end = matchParen(command, i + 1);
      if (end !== -1) {
        out.push(...segments(command.slice(i + 2, end)));
        i = end;
        continue;
      }
    }

    if (c === "`") {
      const end = command.indexOf("`", i + 1);
      if (end !== -1) {
        out.push(...segments(command.slice(i + 1, end)));
        i = end;
        continue;
      }
    }

    if (c === "&" || c === "|") {
      // && and || and a bare pipe all end a segment.
      push();
      if (command[i + 1] === c) i++;
      continue;
    }

    if (c === ";" || c === "\n") {
      push();
      continue;
    }

    buf += c;
  }
  push();
  return out;
}

function matchParen(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Strip leading `FOO=bar` assignments and `env`-style prefixes from a segment.
function stripAssignments(words) {
  let i = 0;
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
  return words.slice(i);
}

// Global flags that take a value, so `git -C path commit` resolves to
// `git commit` rather than to `git -C`. Probed as a review finding: a
// substring match on "git commit" returns false for `git -C p commit`,
// which is the silent under-match this module exists to prevent.
const VALUED_GLOBAL_FLAGS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

/**
 * Does `command` invoke `target` ("git commit", "git push", "gh pr merge")?
 *
 * True across `&&`, `||`, `;`, `|`, newlines, `$( )`, back-ticks, leading
 * environment assignments, and git's valued global flags. False for a quoted
 * mention, and false for a longer command that merely starts with the same
 * letters (`git commit-tree` is not `git commit`).
 */
/**
 * The invocable segments of a shell command, heredoc bodies removed.
 *
 * Exported so a hook that needs to look *inside* the matching segment — R4
 * reading the PR argument out of `gh pr merge` — uses this splitting rather
 * than rolling a second, naive one. R8's whole point is one definition: a
 * private `command.split(/;|&&/)` would miss the heredoc stripping and the
 * quote handling, and would drift from `runsCommand` silently.
 */
export function commandSegments(command) {
  if (typeof command !== "string" || !command) return [];
  return segments(stripHeredocs(command));
}

export function runsCommand(command, target) {
  if (typeof command !== "string" || !command) return false;
  const want = target.trim().split(/\s+/);

  for (const segment of commandSegments(command)) {
    let words = stripAssignments(segment.split(/\s+/).filter(Boolean));
    if (!words.length) continue;

    // `sudo git commit`, `command git commit`, `env git commit`.
    while (words.length && ["sudo", "command", "env", "nice"].includes(words[0])) {
      words = stripAssignments(words.slice(1));
    }
    if (!words.length) continue;

    // Compare the program name by its basename, so /usr/bin/git counts.
    const program = words[0].split("/").pop();
    if (program !== want[0]) continue;

    // Drop git's valued global flags and any bare -flag before the subcommand.
    let rest = words.slice(1);
    while (rest.length) {
      if (VALUED_GLOBAL_FLAGS.has(rest[0])) rest = rest.slice(2);
      else if (rest[0].startsWith("-")) rest = rest.slice(1);
      else break;
    }

    if (want.slice(1).every((w, i) => rest[i] === w)) return true;
  }
  return false;
}

/**
 * The repository the hooks guard.
 *
 * $CLAUDE_PROJECT_DIR, falling back to the payload's cwd only when unset.
 * Probed 2026-09-02: cwd came back as a scratchpad directory *outside* this
 * repository, and the hooks reference records that ${CLAUDE_PROJECT_DIR}
 * "stays put even when Claude enters a worktree". Anchored on cwd, each hook
 * fails open in its own way — git diff --cached returns an empty index, a bare
 * `gh pr view` resolves an unrelated repository's PR.
 */
export function repoRoot(payloadCwd = "") {
  const fromEnv = process.env.CLAUDE_PROJECT_DIR;
  const dir = fromEnv && fromEnv.trim() ? fromEnv : payloadCwd;
  if (!dir) return null;
  const abs = resolve(dir);
  return existsSync(abs) ? abs : null;
}

/** Run a command in the repository root. Never inherits the hook's own cwd. */
export function runIn(root, file, args, options = {}) {
  return spawnSync(file, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
}

/**
 * Emit the deny and exit.
 *
 * Probed shape, confirmed end-to-end against the installed binary: exit 0 with
 * this JSON on stdout blocks the tool call. Exit 2 also blocks, but one deny
 * path is easier to test than two.
 */
export function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }) + "\n",
  );
  process.exit(0);
}

/** Say nothing. The default for every state a hook does not own. */
export function silent() {
  process.exit(0);
}
