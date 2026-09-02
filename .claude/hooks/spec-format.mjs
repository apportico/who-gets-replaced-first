#!/usr/bin/env node
// Spec 0018 R3 — deny a commit that stages a malformed spec.
//
// Staged files only, never the tree. Probed 2026-09-02: 0002 carries no
// **Status:**, no **Issue:** and no Source verification, and 0001 uses
// `complete`, which is outside the lifecycle set. Both predate the process and
// are correct as they are; a repo-wide check would refuse every commit in the
// repository.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readPayload, runsCommand, repoRoot, runIn, deny, silent } from "./lib.mjs";

// The transition table in .claude/skills/update-spec/SKILL.md, and nothing
// else. No legacy allowance for 0001's `complete`: staged-only scoping already
// protects it, while an allowance would also let a *new* spec be committed with
// a status /update-spec has no transition out of.
export const VALID_STATUSES = ["draft", "in-review", "approved", "in-progress", "done"];

const FILENAME = /^\d{4}-[a-z0-9][a-z0-9-]*\.md$/;
const EXEMPT = new Set(["README.md", "TEMPLATE.md"]);

/**
 * Validate one spec's text. Returns an array of failure strings — empty means
 * it conforms. Exported so R6's suite and R5's corpus case can call it without
 * spawning a process.
 */
export function validateSpec(filename, text) {
  const problems = [];

  if (!FILENAME.test(filename)) {
    problems.push(
      `filename '${filename}' is not NNNN-short-name.md (four digits, then lowercase and hyphens)`,
    );
  }

  const status = text.match(/^\*\*Status:\*\*\s*(.+?)\s*$/m);
  if (!status) {
    problems.push("no **Status:** line");
  } else if (!VALID_STATUSES.includes(status[1])) {
    problems.push(
      `**Status:** '${status[1]}' is not one of ${VALID_STATUSES.join(", ")}`,
    );
  }

  if (!/^##\s+Source verification\s*$/im.test(text)) {
    problems.push("no '## Source verification' section");
  }

  problems.push(...requirementProblems(text));
  return problems;
}

// Check 4 is scoped by SECTION, not by pattern: a requirement heading is any
// `### R` followed by a digit between `## Requirements` and the next `##`.
//
// The digit matters. Without it `### Rationale` or `### Rollback` would be
// denied as a malformed requirement heading — the false-positive direction that
// gets a hook disabled.
//
// The section scoping matters too. Matching `^### R\d+\.` across the whole file
// would *skip* a malformed `### R2 [x]` instead of rejecting it, so the check
// would pass on the exact defect it exists to catch, while flagging the
// Implementation Plan lookalikes that are prose.
function requirementProblems(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^##\s+Requirements\s*$/i.test(l));
  if (start === -1) return ["no '## Requirements' section"];

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]) && !/^###/.test(lines[i])) {
      end = i;
      break;
    }
  }

  const problems = [];
  let count = 0;
  for (const line of lines.slice(start + 1, end)) {
    if (!/^###\s+R\d/.test(line)) continue;
    count++;
    if (!/^###\s+R\d+\.\s+\[[ x!~]\]\s+\S/.test(line)) {
      problems.push(
        `malformed requirement heading: '${line.trim()}' — expected '### R<n>. [<mark>] <text>' with <mark> one of ' ', 'x', '!', '~'`,
      );
    }
  }
  if (count === 0) problems.push("no requirements in the '## Requirements' section");
  return problems;
}

// Everything below runs only when this file IS the hook. Importing it — which
// R5's check-settings.mjs does for DEADLINE_MS, and R6's suite does for
// validateSpec — must not read stdin, or the importer blocks forever waiting
// for a payload that is never coming.
if (import.meta.main) {
  const { toolName, command, cwd } = await readPayload();
  if (toolName !== "Bash" || !runsCommand(command, "git commit")) silent();

  // Anchored on the payload's cwd, `git diff --cached` returns an empty index and
  // this hook's failing case becomes byte-identical to its conforming one.
  const root = repoRoot(cwd);
  if (!root) silent();

  const staged = runIn(root, "git", ["diff", "--cached", "--name-only"]);
  if (staged.status !== 0) silent();

  const specs = (staged.stdout || "")
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.startsWith("specs/") && p.endsWith(".md"))
    .filter((p) => !EXEMPT.has(p.slice("specs/".length)));

  if (!specs.length) silent();

  const failures = [];
  for (const path of specs) {
    let text;
    try {
      // The staged content, not the working tree — those differ, and it is the
      // staged bytes that are about to become a commit.
      const show = runIn(root, "git", ["show", `:${path}`]);
      text = show.status === 0 ? show.stdout : readFileSync(join(root, path), "utf8");
    } catch {
      continue;
    }
    const problems = validateSpec(path.slice("specs/".length), text);
    if (problems.length) failures.push({ path, problems });
  }

  if (!failures.length) silent();

  deny(
    `Refusing to commit a malformed spec (spec 0018 R3):\n\n` +
      failures
        .map((f) => `  ${f.path}\n` + f.problems.map((p) => `    - ${p}`).join("\n"))
        .join("\n\n") +
      `\n\nSee specs/README.md and specs/TEMPLATE.md.`,
  );
}
