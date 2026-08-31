// Spec 0008 R9 — the `.mjs` files are inside a lint config block.
//
// `npm run lint` proves the scripts and the suite are clean *if* they are
// linted. Nothing proved they are. Deleting the `scripts/**/*.mjs` +
// `test/**/*.mjs` block from eslint.config.js was silently green: no rule then
// matches those files, so lint stays clean precisely because it has stopped
// looking, and `verify` passes. That is the state `scripts/palette-probe.mjs`
// sat in for six rounds, and its symptom is a passing lint rather than a
// failing one.
//
// This asserts coverage rather than cleanliness, which is the half that went
// missing. It reads the config as a plain module and never invokes ESLint: a
// lint run inside a `node --test` run that `verify` already gates on lint would
// be circular, and the glob assertion catches the failure mode (silent
// deletion) at a fraction of the cost.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import config from '../eslint.config.js';

test('R9 — the .mjs scripts and suite are inside a lint config block', () => {
  // `defineConfig` expands each `extends` into its own block but carries
  // `files` onto every one, so a plain scan over the flattened array is enough.
  const covered = (glob) => config.some((b) => (b.files || []).includes(glob));

  assert.ok(
    covered('scripts/**/*.mjs'),
    'scripts/**/*.mjs is in no config block, so nothing lints the probe and measurement scripts',
  );
  assert.ok(
    covered('test/**/*.mjs'),
    'test/**/*.mjs is in no config block, so the suite lints itself out of existence',
  );
});

test('R9 — that block gives the .mjs files their Node globals', () => {
  // The globals are what make the widened glob survive `no-undef`: without
  // them, covering the files would turn every `process` and `console` into an
  // error, and the tempting fix is to narrow the glob again.
  // `defineConfig` emits one block per `extends` entry alongside the authored
  // one, and only the authored block carries `languageOptions` — so this asks
  // whether ANY block covering the glob declares the globals, not the first.
  // `globals.node` marks a read-only global as `false`, which is a declaration,
  // so the test is for presence of the key rather than for a truthy value.
  const blocks = config.filter((b) => (b.files || []).includes('scripts/**/*.mjs'));
  assert.ok(blocks.length > 0, 'no config block covers scripts/**/*.mjs');
  assert.ok(
    blocks.some((b) => 'process' in (b.languageOptions?.globals || {})),
    'no block covering the .mjs files declares the Node globals, so covering them would fail no-undef on `process`',
  );
});
