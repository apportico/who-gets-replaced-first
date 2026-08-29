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
if [ -d pipeline/raw ] && [ -n "$(ls -A pipeline/raw 2>/dev/null)" ]; then
  echo "==> pipeline:pilot (against the cached responses in pipeline/raw/)"
  npm run --silent pipeline:pilot || fail "pipeline:pilot — a regression anchor moved or validation found problems"
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
