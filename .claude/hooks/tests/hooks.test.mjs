// Spec 0018 R6 — each hook blocks its case and stays silent otherwise.
//
// Lives here, not under test/, because package.json runs test:app as
// `node --test "test/**/*.test.mjs"` and that glob is recursive: a suite under
// test/ would run twice per verify, and a genuine hooks failure would surface
// as "app tests — the .mjs lint config block regressed". That text is not
// cosmetic — R2's hook quotes verify's own `verify FAILED at: <step>` line into
// its deny reason, so a broken hook would deny a push while blaming the lint
// config guard. pipeline/tests/ is the precedent for tests beside their code.
//
// Every hook is driven the way Claude Code drives it: spawn the script, write
// the real PreToolUse payload to stdin, read stdout and the exit code. No
// network, no pipeline/raw/, no live gh — git, gh and npm are stubbed onto PATH.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOKS = resolve(HERE, "..");
const ROOT = resolve(HOOKS, "../..");

const PAYLOAD_KEYS = {
  session_id: "test",
  transcript_path: "/dev/null",
  prompt_id: "test",
  permission_mode: "default",
  effort: { level: "high" },
  hook_event_name: "PreToolUse",
  tool_use_id: "toolu_test",
};

function payload(command, { cwd = ROOT, toolName = "Bash" } = {}) {
  return JSON.stringify({ ...PAYLOAD_KEYS, cwd, tool_name: toolName, tool_input: { command } });
}

/** Run a hook exactly as the harness does. */
function runHook(script, input, { env = {}, projectDir = ROOT, cwd } = {}) {
  const r = spawnSync(process.execPath, [join(HOOKS, script)], {
    input,
    encoding: "utf8",
    cwd: cwd ?? tmpdir(), // never the repo — the hook must not rely on its own cwd
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, ...env },
  });
  return r;
}

function decisionOf(result) {
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);
  if (!result.stdout.trim()) return null;
  return JSON.parse(result.stdout).hookSpecificOutput;
}

function assertDenied(result, matching) {
  const d = decisionOf(result);
  assert.ok(d, "expected a deny, got silence");
  assert.equal(d.permissionDecision, "deny");
  assert.equal(d.hookEventName, "PreToolUse");
  if (matching) assert.match(d.permissionDecisionReason, matching);
  return d;
}

function assertSilent(result) {
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);
  assert.equal(result.stdout.trim(), "", `expected silence, got: ${result.stdout}`);
}

// ---------------------------------------------------------------------------
// Fixtures: a throwaway git repo, and stub git/gh/npm on PATH.
// ---------------------------------------------------------------------------

const temps = [];
function tempDir(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}
process.on("exit", () => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));

function stubRepo(branch = "main") {
  const dir = tempDir("hooks-repo-");
  const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  git("init", "-q", "-b", branch);
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "T");
  // A real commit, so "silent on a feature branch" is not passing vacuously:
  // on an unborn branch every branch lookup is degenerate, and a test that
  // passes because the repo is empty proves nothing about the branch check.
  git("commit", "-q", "--allow-empty", "-m", "init");
  return dir;
}

/** A directory holding an executable stub, prepended to PATH. */
function stubBin(name, script) {
  const dir = tempDir("hooks-bin-");
  const p = join(dir, name);
  writeFileSync(p, script);
  chmodSync(p, 0o755);
  return dir;
}

// ---------------------------------------------------------------------------
// R8 — runsCommand, the parser every hook shares
// ---------------------------------------------------------------------------

const { runsCommand, repoRoot } = await import(join(HOOKS, "lib.mjs"));

test("R8: runsCommand sees git commit through the forms commits actually take", () => {
  assert.equal(runsCommand("git commit -m x", "git commit"), true);
  assert.equal(runsCommand("git add -A && git commit -m x", "git commit"), true);
  assert.equal(runsCommand("cd foo; git commit", "git commit"), true);
  assert.equal(runsCommand("FOO=bar git commit", "git commit"), true);
  // A substring match on "git commit" returns false here — the silent
  // under-match R8 exists to prevent.
  assert.equal(runsCommand("git -C some/path commit -m x", "git commit"), true);
  assert.equal(runsCommand("echo hi && git   commit  -m x", "git commit"), true);
  assert.equal(runsCommand("/usr/bin/git commit", "git commit"), true);
  assert.equal(runsCommand("echo $(git commit -m x)", "git commit"), true);
});

test("R8: runsCommand does not fire on a mention or a longer command", () => {
  assert.equal(runsCommand('echo "git commit"', "git commit"), false);
  assert.equal(runsCommand("echo 'git commit'", "git commit"), false);
  assert.equal(runsCommand("git commit-tree", "git commit"), false);
  assert.equal(runsCommand("git log --oneline", "git commit"), false);
  assert.equal(runsCommand("git push", "git commit"), false);
  assert.equal(runsCommand("", "git commit"), false);
});

test("R8: a heredoc body is data, not commands", () => {
  // Found on this hook's first live use (2026-09-02): posting the evaluation
  // with `gh pr comment --body-file` and a heredoc whose PROSE discussed the
  // merge command was denied by pre-merge-verify, which read the prose as an
  // invocation. A hook that blocks real work is one that gets switched off,
  // which costs more than the case it caught.
  const mergeCmd = ["gh", "pr", "merge"].join(" ");
  const withHeredoc = [
    "cat > /tmp/eval.md <<EOF",
    "The bare form `" + mergeCmd + " --squash --delete-branch` is what /sdlc runs.",
    "Also: git commit -m x, and git push.",
    "EOF",
    "gh pr comment 92 --body-file /tmp/eval.md",
  ].join("\n");
  assert.equal(runsCommand(withHeredoc, mergeCmd), false);
  assert.equal(runsCommand(withHeredoc, "git commit"), false);
  assert.equal(runsCommand(withHeredoc, "git push"), false);

  // The quoted and tab-stripped forms too.
  const quoted = ["run <<'EOF'", "git push", "EOF", "echo done"].join("\n");
  assert.equal(runsCommand(quoted, "git push"), false);
  const dashed = ["run <<-EOF", "\tgit push", "\tEOF", "echo done"].join("\n");
  assert.equal(runsCommand(dashed, "git push"), false);

  // A real command AFTER the heredoc terminator still counts.
  const after = ["cat <<EOF", "just text", "EOF", "git push -u origin x"].join("\n");
  assert.equal(runsCommand(after, "git push"), true);
});

test("R8: runsCommand handles push and gh pr merge", () => {
  assert.equal(runsCommand("git push", "git push"), true);
  assert.equal(runsCommand("git push -u origin feat/x", "git push"), true);
  assert.equal(runsCommand("git pushall", "git push"), false);
  assert.equal(runsCommand("gh pr merge --squash --delete-branch", "gh pr merge"), true);
  assert.equal(runsCommand("gh pr merge 92 --squash", "gh pr merge"), true);
  assert.equal(runsCommand("gh pr view 92", "gh pr merge"), false);
});

test("R8: repoRoot prefers CLAUDE_PROJECT_DIR over the payload cwd", () => {
  const before = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = ROOT;
  assert.equal(repoRoot("/definitely/not/a/repo"), ROOT);
  delete process.env.CLAUDE_PROJECT_DIR;
  assert.equal(repoRoot(ROOT), ROOT);
  assert.equal(repoRoot(""), null);
  if (before !== undefined) process.env.CLAUDE_PROJECT_DIR = before;
});

test("R8: each hook imports the shared module rather than re-implementing it", () => {
  for (const script of ["no-main.mjs", "spec-format.mjs", "pre-push-verify.mjs", "pre-merge-verify.mjs"]) {
    const src = readFileSync(join(HOOKS, script), "utf8");
    assert.match(src, /from "\.\/lib\.mjs"/, `${script} must import ./lib.mjs`);
    assert.doesNotMatch(
      src,
      /function\s+runsCommand|const\s+runsCommand\s*=/,
      `${script} re-implements runsCommand — R8 exists so there is one copy`,
    );
    assert.doesNotMatch(
      src,
      /process\.env\.CLAUDE_PROJECT_DIR/,
      `${script} resolves the repo root itself — use repoRoot() from lib.mjs`,
    );
  }
});

// ---------------------------------------------------------------------------
// R1 — no-main
// ---------------------------------------------------------------------------

test("R1: denies git commit on main, and on master", () => {
  for (const branch of ["main", "master"]) {
    const repo = stubRepo(branch);
    const r = runHook("no-main.mjs", payload("git commit -m x"), { projectDir: repo });
    assertDenied(r, new RegExp(`Refusing to commit on '${branch}'`));
  }
});

test("R1: denies inside a compound command", () => {
  const repo = stubRepo("main");
  assertDenied(
    runHook("no-main.mjs", payload("git add -A && git commit -m x"), { projectDir: repo }),
    /Refusing to commit/,
  );
});

test("R1: silent on a feature branch", () => {
  const repo = stubRepo("feat/x");
  assertSilent(runHook("no-main.mjs", payload("git commit -m x"), { projectDir: repo }));
});

test("R1: denies on a repository with no commits yet", () => {
  // `git rev-parse --abbrev-ref HEAD` exits 128 on an unborn branch, so a hook
  // written that way stays silent on the FIRST commit to main — the fail-open
  // this hook exists to prevent. `git branch --show-current` prints `main`.
  const dir = tempDir("hooks-unborn-");
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir, stdio: "pipe" });
  assertDenied(
    runHook("no-main.mjs", payload("git commit -m x"), { projectDir: dir }),
    /Refusing to commit on 'main'/,
  );
});

test("R1: silent on a non-commit command, and on a non-Bash tool", () => {
  const repo = stubRepo("main");
  assertSilent(runHook("no-main.mjs", payload("git log --oneline"), { projectDir: repo }));
  assertSilent(
    runHook("no-main.mjs", payload("git commit -m x", { toolName: "Read" }), { projectDir: repo }),
  );
});

test("R1: wrong-cwd — resolves the repo from CLAUDE_PROJECT_DIR, not the payload cwd", () => {
  const repo = stubRepo("main");
  const elsewhere = tempDir("hooks-elsewhere-");
  // cwd is outside the repository, exactly as the 2026-09-02 payload probe saw.
  // Anchored on cwd this returns silence; anchored on CLAUDE_PROJECT_DIR, a deny.
  assertDenied(
    runHook("no-main.mjs", payload("git commit -m x", { cwd: elsewhere }), { projectDir: repo }),
    /Refusing to commit on 'main'/,
  );
});

// ---------------------------------------------------------------------------
// R3 — spec-format
// ---------------------------------------------------------------------------

const { validateSpec } = await import(join(HOOKS, "spec-format.mjs"));

const GOOD_SPEC = `# 0099 — a conforming fixture

**Status:** draft
**Issue:** none

## Source verification

| Source | Probed | Result |
|---|---|---|
| x | y | z |

## Requirements

### R1. [ ] does a thing

**Acceptance:** it can be run.

## Non-goals

- nothing
`;

test("R3: rejects a spec missing Source verification", () => {
  const bad = GOOD_SPEC.replace("## Source verification", "## Sources");
  assert.match(validateSpec("0099-x.md", bad).join("\n"), /Source verification/);
});

test("R3: rejects a status outside the transition set, including `complete`", () => {
  for (const status of ["finished", "complete"]) {
    const bad = GOOD_SPEC.replace("**Status:** draft", `**Status:** ${status}`);
    assert.match(validateSpec("0099-x.md", bad).join("\n"), /is not one of/);
  }
});

test("R3: rejects a malformed requirement heading inside the Requirements window", () => {
  for (const heading of ["### R2. [X] capital mark", "### R2 [x] no dot"]) {
    const bad = GOOD_SPEC.replace("### R1. [ ] does a thing", heading);
    assert.match(validateSpec("0099-x.md", bad).join("\n"), /malformed requirement heading/);
  }
});

test("R3: rejects a bad filename", () => {
  assert.match(validateSpec("spec-nine.md", GOOD_SPEC).join("\n"), /is not NNNN-short-name/);
});

test("R3: accepts a conforming fixture", () => {
  assert.deepEqual(validateSpec("0099-a-fixture.md", GOOD_SPEC), []);
});

test("R3: an Implementation Plan lookalike outside the window is silent", () => {
  const withPlan =
    GOOD_SPEC.replace("## Non-goals", "## Implementation Plan\n\n### R8 `[~]` — the count\n\n### R3 / R4 / R5 — the cmp transcript\n\n## Non-goals");
  assert.deepEqual(validateSpec("0099-a-fixture.md", withPlan), []);
});

test("R3: an R-word subsection inside the window is not a requirement heading", () => {
  // `### Rationale` matches `### R…` but not `### R<digit>` — the
  // false-positive direction that would get this hook disabled.
  const withRationale = GOOD_SPEC.replace(
    "**Acceptance:** it can be run.",
    "**Acceptance:** it can be run.\n\n### Rationale\n\nbecause.",
  );
  assert.deepEqual(validateSpec("0099-a-fixture.md", withRationale), []);
});

test("R3: corpus — passes every committed spec except 0001 and 0002, and rejects those two", () => {
  // Enumerated at run time. A hard-coded count goes stale the moment a spec is
  // added, and it was already stale at 16 when this was written.
  const dir = join(ROOT, "specs");
  const names = execFileSync("ls", [dir], { encoding: "utf8" })
    .split("\n")
    .filter((n) => /^\d{4}-.*\.md$/.test(n));
  assert.ok(names.length >= 18, `expected the corpus, found ${names.length}`);

  const legacy = names.filter((n) => n.startsWith("0001-") || n.startsWith("0002-"));
  assert.equal(legacy.length, 2, "0001 and 0002 must both be present");

  for (const name of names) {
    const problems = validateSpec(name, readFileSync(join(dir, name), "utf8"));
    if (legacy.includes(name)) {
      // Rejection is the checkable direction: it is the direct evidence that
      // staged-only scoping is load-bearing rather than incidental.
      assert.ok(problems.length > 0, `${name} should be rejected by the validator`);
    } else {
      assert.deepEqual(problems, [], `${name} should conform: ${problems.join("; ")}`);
    }
  }
});

test("R3: denies a commit staging a malformed spec, silent when it conforms", () => {
  for (const [body, expect] of [
    [GOOD_SPEC.replace("## Source verification", "## Sources"), "deny"],
    [GOOD_SPEC, "silent"],
  ]) {
    const repo = stubRepo("feat/x");
    mkdirSync(join(repo, "specs"), { recursive: true });
    writeFileSync(join(repo, "specs/0099-fixture.md"), body);
    execFileSync("git", ["add", "specs/0099-fixture.md"], { cwd: repo, stdio: "pipe" });

    const r = runHook("spec-format.mjs", payload("git commit -m x"), { projectDir: repo });
    if (expect === "deny") assertDenied(r, /Refusing to commit a malformed spec/);
    else assertSilent(r);
  }
});

test("R3: silent when nothing under specs/ is staged", () => {
  const repo = stubRepo("feat/x");
  writeFileSync(join(repo, "notes.txt"), "hi");
  execFileSync("git", ["add", "notes.txt"], { cwd: repo, stdio: "pipe" });
  assertSilent(runHook("spec-format.mjs", payload("git commit -m x"), { projectDir: repo }));
});

test("R3: wrong-cwd — the failing case is not laundered into silence", () => {
  // Anchored on cwd, `git diff --cached` returns an empty index and this case
  // is byte-identical to a conforming spec. That is why it needs its own test.
  const repo = stubRepo("feat/x");
  mkdirSync(join(repo, "specs"), { recursive: true });
  writeFileSync(join(repo, "specs/0099-fixture.md"), GOOD_SPEC.replace("## Source verification", "## Sources"));
  execFileSync("git", ["add", "specs/0099-fixture.md"], { cwd: repo, stdio: "pipe" });

  const elsewhere = tempDir("hooks-elsewhere-");
  assertDenied(
    runHook("spec-format.mjs", payload("git commit -m x", { cwd: elsewhere }), { projectDir: repo }),
    /Refusing to commit a malformed spec/,
  );
});

// ---------------------------------------------------------------------------
// R2 — pre-push-verify
// ---------------------------------------------------------------------------

const NPM_RED = `#!/bin/sh
echo "$@" >> "$CALLLOG"
echo ""
echo "verify FAILED at: pipeline tests"
exit 1
`;
const NPM_GREEN = `#!/bin/sh
echo "$@" >> "$CALLLOG"
echo "verify PASSED"
exit 0
`;
const NPM_HANG = `#!/bin/sh
echo "$@" >> "$CALLLOG"
sleep 30
`;

function withNpm(script) {
  const calls = join(tempDir("hooks-calls-"), "calls");
  return { bin: stubBin("npm", script), calls };
}

test("R2: denies a push when verify is red, quoting the failing step", () => {
  const { bin, calls } = withNpm(NPM_RED);
  const r = runHook("pre-push-verify.mjs", payload("git push"), {
    env: { PATH: `${bin}:${process.env.PATH}`, CALLLOG: calls },
  });
  assertDenied(r, /verify' is red — failed at: pipeline tests/);
});

test("R2: silent when verify is green", () => {
  const { bin, calls } = withNpm(NPM_GREEN);
  assertSilent(
    runHook("pre-push-verify.mjs", payload("git push"), {
      env: { PATH: `${bin}:${process.env.PATH}`, CALLLOG: calls },
    }),
  );
});

test("R2: does not invoke verify for a non-push command", () => {
  const { bin, calls } = withNpm(NPM_RED);
  assertSilent(
    runHook("pre-push-verify.mjs", payload("git status"), {
      env: { PATH: `${bin}:${process.env.PATH}`, CALLLOG: calls },
    }),
  );
  assert.throws(() => readFileSync(calls, "utf8"), /ENOENT/, "verify must not have been called");
});

test("R2: a hanging verify DENIES rather than failing open", () => {
  // The requirement. The hooks reference says a timed-out command hook
  // "doesn't block the tool call" — output discarded, no decision — so the hook
  // must own its deadline. Injected short here; 120s in production.
  const { bin, calls } = withNpm(NPM_HANG);
  const r = runHook("pre-push-verify.mjs", payload("git push"), {
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      CALLLOG: calls,
      HOOK_VERIFY_DEADLINE_MS: "1500",
    },
  });
  assertDenied(r, /did not finish within 1.5s and was killed/);
});

test("R2: wrong-cwd — verify runs in the project dir, not the payload cwd", () => {
  const { bin, calls } = withNpm(NPM_RED);
  const elsewhere = tempDir("hooks-elsewhere-");
  assertDenied(
    runHook("pre-push-verify.mjs", payload("git push", { cwd: elsewhere }), {
      env: { PATH: `${bin}:${process.env.PATH}`, CALLLOG: calls },
    }),
    /verify' is red/,
  );
});

// ---------------------------------------------------------------------------
// R4 — pre-merge-verify
// ---------------------------------------------------------------------------

function ghStub(rollup, { exit = 0, stderr = "" } = {}) {
  const calls = join(tempDir("hooks-calls-"), "calls");
  const script =
    `#!/bin/sh\n` +
    `echo "$@" >> "${calls}"\n` +
    (exit !== 0
      ? `echo "${stderr}" >&2\nexit ${exit}\n`
      : `cat <<'EOF'\n${JSON.stringify({ statusCheckRollup: rollup })}\nEOF\n`);
  return { bin: stubBin("gh", script), calls };
}

test("R4: denies when verify is FAILURE even though review is SUCCESS", () => {
  // The probed trap: review reports SUCCESS while claude-review.yml skips for
  // want of an API key (#44). "All green" is not a safe merge condition.
  const { bin } = ghStub([
    { name: "verify", conclusion: "FAILURE" },
    { name: "review", conclusion: "SUCCESS" },
  ]);
  assertDenied(
    runHook("pre-merge-verify.mjs", payload("gh pr merge 92 --squash"), {
      env: { PATH: `${bin}:${process.env.PATH}` },
    }),
    /'verify' is FAILURE, not SUCCESS/,
  );
});

test("R4: silent when verify is SUCCESS", () => {
  const { bin } = ghStub([
    { name: "verify", conclusion: "SUCCESS" },
    { name: "review", conclusion: "SUCCESS" },
  ]);
  assertSilent(
    runHook("pre-merge-verify.mjs", payload("gh pr merge 92 --squash"), {
      env: { PATH: `${bin}:${process.env.PATH}` },
    }),
  );
});

test("R4: denies when the rollup carries no verify entry", () => {
  const { bin } = ghStub([{ name: "review", conclusion: "SUCCESS" }]);
  assertDenied(
    runHook("pre-merge-verify.mjs", payload("gh pr merge"), {
      env: { PATH: `${bin}:${process.env.PATH}` },
    }),
    /no check named 'verify'/,
  );
});

test("R4: denies when gh itself fails, quoting stderr", () => {
  const { bin } = ghStub(null, { exit: 1, stderr: "no pull requests found" });
  assertDenied(
    runHook("pre-merge-verify.mjs", payload("gh pr merge"), {
      env: { PATH: `${bin}:${process.env.PATH}` },
    }),
    /no pull requests found/,
  );
});

test("R4: a bare `gh pr merge --squash --delete-branch` is guarded, with no PR argument", () => {
  // The exact command /sdlc Step 9 runs. A hook that only guarded the numbered
  // form would miss every merge this project performs.
  const { bin, calls } = ghStub([{ name: "verify", conclusion: "FAILURE" }]);
  assertDenied(
    runHook("pre-merge-verify.mjs", payload("gh pr merge --squash --delete-branch"), {
      env: { PATH: `${bin}:${process.env.PATH}` },
    }),
    /'verify' is FAILURE/,
  );
  const logged = readFileSync(calls, "utf8").trim();
  assert.equal(
    logged,
    "pr view --json statusCheckRollup",
    "gh pr view must be called with no PR argument so gh infers from the branch",
  );
});

test("R4: does not invoke gh for a non-merge command", () => {
  const { bin, calls } = ghStub([{ name: "verify", conclusion: "FAILURE" }]);
  assertSilent(
    runHook("pre-merge-verify.mjs", payload("gh pr view 91"), {
      env: { PATH: `${bin}:${process.env.PATH}` },
    }),
  );
  assert.throws(() => readFileSync(calls, "utf8"), /ENOENT/, "gh must not have been called");
});

// ---------------------------------------------------------------------------
// R7 — the boundary is written down
// ---------------------------------------------------------------------------

test("R7: the README states the probed bypassPermissions answer, not merely the word", () => {
  const readme = readFileSync(join(HOOKS, "README.md"), "utf8");
  for (const path of [
    /terminal/i,
    /editor/i,
    /web interface|GitHub web/i,
    /\bCI\b/,
    /core\.hooksPath/,
  ]) {
    assert.match(readme, path, `README must name the uncovered path: ${path}`);
  }
  // The claim, not the word. A string-presence check on `bypassPermissions`
  // passes a README that says the opposite of what was probed.
  assert.match(
    readme,
    /hooks (still )?(do )?fire[^.]*bypassPermissions|bypassPermissions[^.]*hooks (still )?fire/i,
    "README must state that hooks DO fire under bypassPermissions (probed 2026-09-02)",
  );
});

test("R7: CLAUDE.md points at the hooks README and repeats the boundary", () => {
  const claudeMd = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
  assert.match(claudeMd, /\.claude\/hooks\/README\.md/);
  assert.match(claudeMd, /Workflow hooks/i);
});
