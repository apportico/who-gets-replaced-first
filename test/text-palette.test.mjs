// Spec 0008 R7 — the text palette gate.
//
// Three things have to hold together for this requirement to mean anything:
// the palette's colours clear AA, the CSS the browser actually renders carries
// the same values, and no component has gone back to a raw Tailwind colour
// utility behind the palette's back. The third is the one that matters most:
// R7 exists because 21 usages of a 2.54:1 grey sat in the app unnoticed, and a
// check that a new one cannot slip past is the whole point.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { contrast, over } from '../scripts/palette-probe.mjs';
import { TEXT, SURFACE, DISABLED_TEXT } from '../src/utils/textPalette.js';
import { QUALITY_TONES } from '../src/utils/laborMetrics.js';

const SRC = new URL('../src/', import.meta.url).pathname;
const CSS = readFileSync(join(SRC, 'styles/index.css'), 'utf8');

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const componentFiles = walk(SRC).filter((p) => /\.jsx?$/.test(p) && !p.endsWith('textPalette.js'));

test('R7 — every text colour clears AA against the background it is used on', () => {
  for (const [name, entry] of Object.entries(TEXT)) {
    const ratio = contrast(entry.hex, entry.on);
    const floor = entry.large ? 3 : 4.5;
    assert.ok(
      ratio >= floor,
      `TEXT.${name} (${entry.hex} on ${entry.on}) is ${ratio.toFixed(2)}:1, needs >= ${floor}`,
    );
  }
});

test('R7 — each tinted text role is paired with the surface it declares', () => {
  // Guards a specific way this could rot: someone changes SURFACE.warn without
  // changing TEXT.warn.on, and the ratio above then checks a background the app
  // no longer paints.
  for (const [name, surface] of Object.entries(SURFACE)) {
    assert.ok(TEXT[name], `SURFACE.${name} has no matching TEXT.${name}`);
    assert.equal(
      TEXT[name].on, surface.hex,
      `TEXT.${name}.on is ${TEXT[name].on} but SURFACE.${name} is ${surface.hex} — the ratio would be computed against a background the app does not paint`,
    );
  }
});

test('R7 — the rendered CSS carries exactly the palette values', () => {
  // The module is what the test reads; the CSS is what the browser paints.
  // Nothing keeps them in step except this.
  const entries = [
    ...Object.values(TEXT),
    ...Object.values(SURFACE),
    DISABLED_TEXT,
  ];
  for (const entry of entries) {
    const declared = new RegExp(`${entry.css}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(CSS);
    assert.ok(declared, `${entry.css} is not declared in src/styles/index.css`);
    assert.equal(
      declared[1].toLowerCase(), entry.hex.toLowerCase(),
      `${entry.css} is ${declared[1]} in index.css but ${entry.hex} in textPalette.js`,
    );
  }
});

test('R7 — no component uses a raw Tailwind text-colour utility', () => {
  // Over all of src/, not just src/components/: App.jsx carried a text-gray-900
  // that a components-only check would have missed.
  const offenders = [];
  for (const file of componentFiles) {
    const body = readFileSync(file, 'utf8');
    for (const m of body.matchAll(/\btext-(?:[a-z]+-\d{2,3}|black)\b/g)) {
      offenders.push(`${file.replace(SRC, 'src/')}: ${m[0]}`);
    }
    for (const m of body.matchAll(/\btext-\[#[0-9a-fA-F]{3,8}\]/g)) {
      offenders.push(`${file.replace(SRC, 'src/')}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `Raw text-colour utilities must come from textPalette.js:\n  ${offenders.join('\n  ')}`);
});

test('R7 — data-quality badges clear AA on their own badge background', () => {
  // These reach the DOM through an inline `style`, not a Tailwind utility, so
  // the grep above cannot see them — which is exactly how all five sat under AA
  // (2.99 to 4.39:1) unnoticed, and how the 1.68:1 in-swatch labels did too.
  // Asserting over the exported table is the only check that reaches them.
  for (const [name, hex] of Object.entries(QUALITY_TONES)) {
    const ratio = contrast(hex, over(hex, 0x1a / 255, '#ffffff'));
    assert.ok(
      ratio >= 4.5,
      `QUALITY_TONES.${name} (${hex}) is ${ratio.toFixed(2)}:1 on its badge background, needs >= 4.5:1`,
    );
  }
});

test('R7 — index.css declares no text colour outside the token block', () => {
  // The third place this blind spot appeared: `.leaflet-control-attribution`
  // set `color: #9ca3af` — the same 2.54:1 grey — in raw CSS, where neither the
  // Tailwind grep nor the exported tables reach. Every `color:` outside the
  // `:root` token block must therefore be a `var(--…)` reference.
  const withoutRoot = CSS.replace(/:root\s*\{[^}]*\}/s, '');
  const offenders = [...withoutRoot.matchAll(/(?<!-)\bcolor:\s*([^;]+);/g)]
    .map((m) => m[1].trim())
    .filter((v) => !v.startsWith('var(') && !/^(inherit|transparent|currentColor)$/i.test(v.replace(/\s*!important$/, '')))
    .filter((v) => !v.replace(/\s*!important$/, '').startsWith('var('));
  assert.deepEqual(offenders, [], `index.css sets a colour outside the token block:\n  ${offenders.join('\n  ')}`);
});

test('R7 — text-white appears only on the dark chips it is excluded for', () => {
  // The exclusion is four sites, not "text-white generally". Two others were
  // 9px labels on data-driven swatches, down to 1.68:1 — deleted by R7, and
  // this assertion is what stops them coming back.
  const EXPECTED = [
    'src/components/LaborDetailPanel.jsx',
    'src/components/LaborSidebar.jsx',
    'src/components/LaborTimeline.jsx',
    'src/components/ScenarioPanel.jsx',
  ];
  const found = [];
  for (const file of componentFiles) {
    const count = (readFileSync(file, 'utf8').match(/\btext-white\b/g) || []).length;
    for (let i = 0; i < count; i++) found.push(file.replace(SRC, 'src/'));
  }
  assert.deepEqual(
    found.sort(), EXPECTED.sort(),
    'text-white must appear exactly once in each of the four dark-chip components and nowhere else',
  );
});
