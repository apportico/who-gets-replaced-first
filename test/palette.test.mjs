// Spec 0008 R9 part 2 — the palette gate.
//
// This imports its maths from `scripts/palette-probe.mjs` rather than
// re-deriving it, so the numbers in the spec's Source verification table and
// the numbers this test enforces come from one implementation. The first draft
// of that table was not reproducible precisely because the probe was untracked
// and its algorithm unpinned; re-derivation here would reintroduce that.
//
// No DOM, no browser, no network — this is the half of R9 that can check what
// jsdom cannot (see `test/a11y.test.mjs` for the other half and why).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contrast, over, dE, labOf, linOf, VISIONS } from '../scripts/palette-probe.mjs';
import { TIERS, RAMPS_BY_NAME, NO_DATA_COLOR } from '../src/utils/laborMetrics.js';

const TIER_KEYS = Object.keys(TIERS);
const BADGE_BG = (color) => over(color, 0x1a / 255, '#ffffff');

test('R4 — every tier badge clears WCAG AA on its own background', () => {
  for (const key of TIER_KEYS) {
    const { color, label } = TIERS[key];
    const ratio = contrast(color, BADGE_BG(color));
    assert.ok(
      ratio >= 4.5,
      `${label} (${color}) is ${ratio.toFixed(2)}:1 on its badge background, needs >= 4.5:1`,
    );
  }
});

test('R10 — tier colours stay distinguishable under every simulated vision', () => {
  // The pair that matters most is OFFICIAL vs PROXY: measured vs constructed.
  // DERIVED vs MODELED is the one that collapsed to 2.4 before the recolour.
  for (let i = 0; i < TIER_KEYS.length; i++) {
    for (let j = i + 1; j < TIER_KEYS.length; j++) {
      const a = TIERS[TIER_KEYS[i]];
      const b = TIERS[TIER_KEYS[j]];
      for (const vision of VISIONS) {
        const d = dE(a.color, b.color, vision);
        assert.ok(
          d >= 15,
          `${a.label} vs ${b.label} is dE00 ${d.toFixed(1)} under ${vision}, needs >= 15`,
        );
      }
    }
  }
});

test('R10 — every ramp reads as an ordered scale under every simulated vision', () => {
  // Deliberately NOT an adjacent-step dE floor: a sequential ramp is read
  // against a legend, not by discriminating neighbours, and every ramp here is
  // under dE00 10 on adjacent steps somewhere. What has to survive is the
  // ORDER, so this asserts strictly monotonic lightness instead.
  for (const [name, ramp] of Object.entries(RAMPS_BY_NAME)) {
    for (const vision of VISIONS) {
      const lightness = ramp.map((c) => labOf(linOf(c, vision))[0]);
      for (let i = 1; i < lightness.length; i++) {
        const gap = lightness[i - 1] - lightness[i];
        assert.ok(
          gap >= 5,
          `${name} step ${i - 1}->${i} under ${vision}: L* gap ${gap.toFixed(1)}, needs >= 5 and descending`,
        );
      }
    }
  }
});

test('R5 — no-data grey is not reachable by colour alone from any ramp', () => {
  // This does not assert separation, because no colour can be far enough from
  // every ramp step at these marker sizes. It records the fact that motivates
  // R5's non-colour channel: the lightest step of two of the three ramps sits
  // under dE00 10 from the no-data grey, for people with normal colour vision.
  const collisions = [];
  for (const [name, ramp] of Object.entries(RAMPS_BY_NAME)) {
    const d = dE(ramp[0], NO_DATA_COLOR, 'normal');
    if (d < 10) collisions.push(`${name} ${d.toFixed(1)}`);
  }
  assert.ok(
    collisions.length > 0,
    'Expected the no-data grey to still collide with light ramp steps — if this fails the ramps changed and R5\'s non-colour encoding should be re-justified',
  );
});
