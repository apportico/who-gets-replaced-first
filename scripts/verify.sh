#!/usr/bin/env bash
# R2 (spec 0003) — the single command that must pass before work is handed to
# a human. One command, one pass/fail exit code, so a session can iterate to
# green rather than a reviewer discovering the failure.
set -euo pipefail

fail() { echo ""; echo "verify FAILED at: $1"; exit 1; }

echo "==> lint"
npm run --silent lint || fail "lint"

echo ""
echo "==> build"
npm run --silent build || fail "build"

echo ""
# Spec 0010 R19. The JS suite. Added to `verify` in the same change that
# introduced it, per CLAUDE.md's rule that a check added to CI is added here —
# otherwise a contributor who is green locally lands red on the gate.
# Unconditional like the pipeline suite: vitest runs over pure functions and the
# committed payload, so it needs no network and no response cache.
echo "==> js tests"
npm run --silent test || fail "js tests"

echo ""
# Spec 0004's regression suite. Unconditional, unlike the pilot below: the
# gzipped fixture and the CSVs it reads are all in-tree, so it runs in a fresh
# clone with no network and no cache. This is the step that guards the numbers,
# and it is why `verify` and CI are the same gate rather than merely similar.
echo "==> pipeline tests"
npm run --silent test:pipeline || fail "pipeline tests"

echo ""
if [ -d pipeline/raw ] && [ -n "$(ls -A pipeline/raw 2>/dev/null)" ]; then
  # Write the pilot's output to a temp dir, never pipeline/data/. Verifying the
  # pipeline must not republish its artifacts: otherwise "verify passed" and
  # "the committed dataset changed" are the same event, and CI leaves a dirty
  # tree. Regenerating tracked data stays something a person asks for.
  PILOT_OUT="$(mktemp -d)"
  trap 'rm -rf "$PILOT_OUT"' EXIT
  echo "==> pipeline:pilot (cached responses; output to $PILOT_OUT, not pipeline/data/)"
  npm run --silent pipeline:pilot -- --out-dir "$PILOT_OUT" \
    || fail "pipeline:pilot — a regression anchor moved or validation found problems"
else
  echo "==> pipeline:pilot SKIPPED"
  echo "    No pipeline/raw/ cache in this checkout, so the pilot would fetch"
  echo "    from the network. This is expected in a fresh clone or a worktree."
  echo "    This gate is deliberately deterministic — no upstream API can fail"
  echo "    it. Run 'npm run verify:data' to check the regression anchors"
  echo "    against live data; that also populates the cache, after which"
  echo "    verify includes the anchors automatically."
fi

echo ""
echo "verify PASSED"
