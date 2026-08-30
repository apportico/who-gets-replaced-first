// Spec 0008 R9 part 1 — structural accessibility over the real component tree.
//
// Two surfaces, for a reason the probes made concrete:
//
//  1. The full app. It mounts with nothing selected, so LaborDetailPanel.jsx:251
//     returns the placeholder branch and neither bar renders. The baseline this
//     drives to zero — region 23, label 2, heading-order 1 — was measured over
//     that tree and therefore never covered the populated panel at all.
//  2. LaborDetailPanel rendered standalone with a fixture row. This is the only
//     way anything in the spec reaches AgeBar and OccupationBreakdown, and it
//     carries R7's legend assertion. It needs no map: the panel imports only
//     laborMetrics, Sparkline and laborPanel, none of which reach Leaflet.
//
// Order matters. Leaflet dereferences `window` at module-evaluation time
// (leaflet-src.js:230), so jsdom globals must exist before the first import or
// nothing loads at all.
//
// `target-size` is DISABLED below, deliberately. Over the real tree it reports
// `pass` — a false green, because jsdom has no layout boxes to fail. A rule
// that returns a misleading pass is worse than one that does not run. R6 sends
// that check to R11, where `scripts/r11-measure.mjs` measures it in a browser.
// `color-contrast` is INCOMPLETE here for the same class of reason (no canvas)
// and is guarded arithmetically by test/palette.test.mjs instead.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

import { FIXTURE_ROW, FIXTURE_AGE_BANDS, FIXTURE_ISCO_BANDS } from './fixtures.mjs';

const RULES = [
  'region', 'label', 'heading-order', 'button-name', 'link-name',
  'image-alt', 'aria-allowed-attr', 'aria-valid-attr-value', 'aria-required-attr',
];
// See the header: both are excluded because they mislead under jsdom rather
// than merely failing to run.
const DISABLED = { 'target-size': { enabled: false }, 'color-contrast': { enabled: false } };

let dom, vite, React, createRoot, App, LaborDetailPanel;

before(async () => {
  dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true, url: 'http://localhost/',
  });
  for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement',
    'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'DOMParser', 'Image',
    'MouseEvent', 'Event', 'CustomEvent']) {
    if (dom.window[k] === undefined) continue;
    // Node 24 exposes `navigator` as a getter-only global.
    try { globalThis[k] = dom.window[k]; }
    catch { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); }
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  App = (await vite.ssrLoadModule('/src/App.jsx')).default;
  LaborDetailPanel = (await vite.ssrLoadModule('/src/components/LaborDetailPanel.jsx')).default;
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  dom.window.eval(axe.source);
});

// Without this the run never exits: Vite's middleware server holds the event
// loop open, and Leaflet leaves animation frames and timers pending in jsdom.
after(async () => {
  if (vite) await vite.close();
  if (dom) dom.window.close();
});

async function renderInto(element) {
  // A fresh container per render. Reusing one and calling createRoot again
  // warns, and clearing innerHTML behind React's back leaves the old root
  // pointing at detached nodes.
  const host = dom.window.document.createElement('div');
  dom.window.document.body.innerHTML = '';
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  await React.act(async () => { root.render(element); });
  return host;
}

async function violationsFor(node) {
  const results = await dom.window.axe.run(node, { runOnly: { type: 'rule', values: RULES }, rules: DISABLED });
  return results.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`);
}

test('R8 — the full app has no structural accessibility violations', async () => {
  await renderInto(React.createElement(App));
  const violations = await violationsFor(dom.window.document.body);
  assert.deepEqual(violations, [], `axe over the mounted app:\n  ${violations.join('\n  ')}`);
});

test('R8 — the detail panel is self-contained when rendered alone', async () => {
  // The landmark has to live on LaborDetailPanel's own root, not on a wrapper in
  // LaborPage: rendered standalone the wrapper would not be in the tree, and
  // `region` could never reach zero here. Scoping the rule out to make this pass
  // is exactly what the header argues against for target-size.
  const host = await renderInto(React.createElement(LaborDetailPanel, {
    row: FIXTURE_ROW, year: null, onCorridorBoard: false, onClose: () => {},
  }));
  const violations = await violationsFor(host);
  assert.deepEqual(violations, [], `axe over the standalone panel:\n  ${violations.join('\n  ')}`);
});

test('R7 — every band renders its percentage as text outside its swatch', async () => {
  // The fixture carries all three age bands and all nine ISCO groups, so
  // neither half of this can pass over an empty set.
  const host = await renderInto(React.createElement(LaborDetailPanel, {
    row: FIXTURE_ROW, year: null, onCorridorBoard: false, onClose: () => {},
  }));
  const text = host.textContent;

  for (const band of FIXTURE_AGE_BANDS) {
    const rendered = `${band.pct.toFixed(1)}%`;
    assert.ok(
      text.includes(rendered),
      `age band ${band.label} (${rendered}) is not rendered as text — deleting the in-bar label without the legend carrying it takes an OFFICIAL figure off the page`,
    );
  }
  for (const band of FIXTURE_ISCO_BANDS) {
    const rendered = `${band.pct.toFixed(1)}%`;
    assert.ok(text.includes(rendered), `ISCO group ${band.n} (${rendered}) is not rendered as text`);
  }
});

test('R4 — every tier badge carries accessible text', async () => {
  const host = await renderInto(React.createElement(LaborDetailPanel, {
    row: FIXTURE_ROW, year: null, onCorridorBoard: false, onClose: () => {},
  }));
  const badges = [...host.querySelectorAll('span')]
    .filter((el) => /^(OFFICIAL|DERIVED|PROXY|MODELED)$/.test(el.textContent.trim()));
  assert.ok(badges.length > 0, 'no tier badges rendered in the panel — the fixture or the markup changed');
  for (const badge of badges) {
    assert.ok(badge.textContent.trim().length > 0, 'a tier badge has no text; a MODELED figure would be announced as a bare number');
  }
});
