// Spec 0008 R4 — a figure is never announced under a tier stronger than its own.
//
// The first attempt was a hand-written list of three field labels, which could
// only ever confirm the fix that prompted it. Four more figures were still
// mislabelled at the time: `entry_level_squeeze_index` (MODELED) under a DERIVED
// heading, and three PROXY career-stage figures under an OFFICIAL one. A list
// maintained by hand cannot find the case nobody thought of.
//
// So nothing here is hand-maintained, and nothing here owns a copy of the tier
// map either. Spec 0009 ships `field_tiers` inside the app payload, written by
// the pipeline from `pipeline/config.py`'s registry and guarded against drift by
// `pipeline/tests/test_tiers.py`. The panel reads that; this test reads that;
// there is one source. A new row with a wrong tier fails without anyone adding
// it to a list.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import laborData from '../src/data/global_labor.json' with { type: 'json' };
import { FIXTURE_ROW } from './fixtures.mjs';

const FIELD_TIERS = laborData.field_tiers;
const REAL_TIERS = new Set(['OFFICIAL', 'DERIVED', 'PROXY', 'MODELED']);

let dom, vite, React, createRoot, LaborDetailPanel;

before(async () => {
  dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true, url: 'http://localhost/',
  });
  for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement',
    'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'DOMParser', 'Image',
    'MouseEvent', 'Event', 'CustomEvent']) {
    if (dom.window[k] === undefined) continue;
    try { globalThis[k] = dom.window[k]; }
    catch { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); }
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  LaborDetailPanel = (await vite.ssrLoadModule('/src/components/LaborDetailPanel.jsx')).default;
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
});

after(async () => {
  if (vite) await vite.close();
  if (dom) dom.window.close();
});

test('R4 — the payload carries the tier registry the panel reads', () => {
  // If spec 0009's export ever stops emitting this, the panel would silently
  // fall back to section tiers — the exact state this requirement fixed.
  assert.ok(FIELD_TIERS, 'global_labor.json has no field_tiers block');
  const count = Object.keys(FIELD_TIERS).length;
  assert.ok(count >= 80, `field_tiers has only ${count} entries`);
  const constructed = Object.values(FIELD_TIERS).filter((t) => t === 'MODELED' || t === 'PROXY');
  assert.ok(constructed.length > 0, 'no MODELED or PROXY fields — the registry looks wrong');
});

test('R4 — every rendered figure is announced under its own tier', async () => {
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  await React.act(async () => {
    root.render(React.createElement(LaborDetailPanel, {
      row: FIXTURE_ROW, year: null, onCorridorBoard: false, onClose: () => {},
    }));
  });

  const rows = [...host.querySelectorAll('[data-field]')];
  assert.ok(rows.length >= 20, `expected the panel's rows to render, found ${rows.length}`);

  const wrong = [];
  for (const el of rows) {
    const field = el.getAttribute('data-field');
    const announced = (el.getAttribute('data-tier') || '').toUpperCase();
    const truth = FIELD_TIERS[field];
    if (!truth || !REAL_TIERS.has(truth)) continue; // NOT_A_MEASUREMENT fields carry no tier
    if (announced !== truth) {
      wrong.push(`${field}: announced ${announced || '(none)'}, the payload says ${truth}`);
    }
  }
  assert.deepEqual(wrong, [], `figures announced under the wrong tier:\n  ${wrong.join('\n  ')}`);
});

test('R4 — no constructed figure is announced as measured', async () => {
  // The direction that matters. Announcing OFFICIAL data under DERIVED
  // understates it; announcing a MODELED index under DERIVED or OFFICIAL
  // overstates its provenance, which is the blurring this project refuses.
  const STRENGTH = { MODELED: 0, PROXY: 1, DERIVED: 2, OFFICIAL: 3 };
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  await React.act(async () => {
    root.render(React.createElement(LaborDetailPanel, {
      row: FIXTURE_ROW, year: null, onCorridorBoard: false, onClose: () => {},
    }));
  });

  const overstated = [];
  for (const el of host.querySelectorAll('[data-field]')) {
    const field = el.getAttribute('data-field');
    const announced = (el.getAttribute('data-tier') || '').toUpperCase();
    const truth = FIELD_TIERS[field];
    if (!truth || !REAL_TIERS.has(truth) || !REAL_TIERS.has(announced)) continue;
    if (STRENGTH[announced] > STRENGTH[truth]) {
      overstated.push(`${field}: ${truth} announced as ${announced}`);
    }
  }
  assert.deepEqual(overstated, [], `constructed figures announced as something stronger:\n  ${overstated.join('\n  ')}`);
});
