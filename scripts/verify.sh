#!/usr/bin/env bash
# R2 (spec 0003) — the single command that must pass before work is handed to
# a human. One command, one pass/fail exit code, so a session can iterate to
# green rather than a reviewer discovering the failure.
set -euo pipefail

fail() { echo ""; echo "verify FAILED at: $1"; exit 1; }

echo "==> lint"
npm run --silent lint || fail "lint"

echo ""
# Spec 0007 R7/R11. `tsc` never emits -- the pipeline runs on Node 24's native
# type stripping, so there is no build step. This step exists for the four
# deliberately broken snippets in pipeline/tests/schema.types.ts, which are R7's
# whole acceptance: the types are not met by existing, only by rejecting those
# four. Added to `verify` in the same change that added it to CI, per CLAUDE.md.
echo "==> typecheck (0007 R7 -- the four @ts-expect-error cases)"
npm run --silent typecheck || fail "typecheck"

echo ""
# Spec 0007 R7's two-way check. Case 4 is only evidence for the `Int` brand if
# it STOPS erroring when the brand is removed -- a case that errors identically
# with `Int` aliased to `number` proves something about bigint-vs-number, not
# about the schema. This aliases the brand away in a temp copy and requires
# tsc to report TS2578 there.
echo "==> schema brand (0007 R7 -- case 4 with the brand removed)"
npm run --silent check:brand || fail "schema brand -- R7 case 4 no longer depends on the Int brand"

echo ""
echo "==> build"
npm run --silent build || fail "build"

echo ""
# Spec 0015 R4/R9. Runs HERE, after the build, because the defect it guards
# exists only in the built output: Vite applies the base path to a `rel="icon"`
# link and never to `meta content`, so a relative og:image is correct-looking in
# source and a 404 in production. A source-level test cannot see it, which is
# the same shape as the @import failure 0010 R2 shipped twice.
echo "==> built meta (0015 R2/R3/R4 -- og/twitter tags, absolute URLs, the refusal)"
npm run --silent check:meta || fail "built meta -- a social tag is missing, relative, or points at a file not in dist/"

echo ""
# Spec 0010 R19. The JS suite. Added to `verify` in the same change that
# introduced it, per CLAUDE.md's rule that a check added to CI is added here —
# otherwise a contributor who is green locally lands red on the gate.
# Unconditional like the pipeline suite: vitest runs over pure functions and the
# committed payload, so it needs no network and no response cache.
echo "==> js tests"
npm run --silent test || fail "js tests"

echo ""
# Spec 0004's regression suite, ported to TypeScript by 0007 R8. Unconditional,
# unlike the pilot below: the gzipped fixture and the CSVs it reads are all
# in-tree, so it runs in a fresh clone with no network and no cache. This is the
# step that guards the numbers, and it is why `verify` and CI are the same gate
# rather than merely similar.
#
# It also carries 0007 R1's 100,000 committed differential cases, frozen from
# the pinned CPython 3.13 before R10 deleted it -- the only remaining proof that
# the port's arithmetic is Python's.
echo "==> pipeline tests"
npm run --silent test:pipeline || fail "pipeline tests"

echo ""
# Spec 0008's node --test suite. Five of its six files went with the map that
# spec 0010 R1 deletes -- they imported LaborDetailPanel, the metric ramps or the
# light-theme text palette, none of which survive a dark-only wizard. What
# remains here is the lint-config guard, which is about where files run rather
# than what they assert.
#
# 0008's substantive guarantee did NOT go with them: the AA contrast rule it
# added moved to src/styles/contrast.test.js, which imports 0008's own
# scripts/palette-probe.mjs so the two cannot drift, and runs in the vitest step
# above.
echo "==> app tests (0008 lint-config guard)"
npm run --silent test:app || fail "app tests — the .mjs lint config block regressed"

echo ""
# Spec 0018 R5. Closes 0003 R4's acceptance, which had only ever been run by
# hand and had no `hooks` block to check until now: settings.json parses, every
# hook command takes the required shape and points at a file that exists, and
# R2's configured timeout is strictly greater than its own internal deadline.
# That last one is the fail-open the hooks reference warns about -- a timed-out
# command hook "doesn't block the tool call", so a lost race is a silent push.
echo "==> hook wiring (0018 R5 -- settings.json, hook paths, the deadline order)"
npm run --silent check:settings || fail "hook wiring — a hook path, shape or deadline is wrong"

echo ""
# Spec 0018 R6. Lives at .claude/hooks/tests/, deliberately outside test/**'s
# recursive glob: under test/ it would run twice per verify AND a hooks failure
# would surface as "the .mjs lint config block regressed" -- which R2's hook
# then quotes into its own deny reason. Unconditional like the pipeline suite:
# git, gh and npm are stubbed onto PATH, so no network and no response cache.
echo "==> hook tests (0018 R6 -- each hook denies its case and stays silent otherwise)"
npm run --silent test:hooks || fail "hook tests — a workflow hook denies the wrong thing, or nothing"

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
