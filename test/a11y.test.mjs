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

test('R4 — no MODELED or PROXY figure sits under a stronger tier badge', async () => {
  // The gap this closes: the old assertion checked that badges carry text, never
  // that a badge matches the number beneath it. Three figures were mislabelled —
  // the AI exposure score and the exposed wage bill (both MODELED) under DERIVED
  // and OFFICIAL headings, and the entry-level share (PROXY) under DERIVED —
  // with their real tier only in lowercase hint text. A badge stronger than the
  // figure is worse than a missing one: it is an overstatement of provenance,
  // which is the blurring of measured and constructed this project refuses.
  const host = await renderInto(React.createElement(LaborDetailPanel, {
    row: FIXTURE_ROW, year: null, onCorridorBoard: false, onClose: () => {},
  }));

  // Field -> the tier it genuinely is, per METRICS in laborMetrics.js.
  const CONSTRUCTED = [
    { label: 'AI task-exposure score', tier: 'MODELED' },
    { label: 'Exposed wage bill (PPP)', tier: 'MODELED' },
    { label: 'Entry-level white collar (15–24)', tier: 'PROXY' },
  ];

  for (const { label, tier } of CONSTRUCTED) {
    const row = [...host.querySelectorAll('div')]
      .find((el) => el.children.length === 2 && el.textContent.trim().startsWith(label));
    if (!row) continue; // not rendered for this fixture
    assert.ok(
      row.textContent.includes(tier),
      `"${label}" is rendered without its ${tier} badge — it would be announced under whatever tier its section carries`,
    );
  }
});

test('R4 — every section heading carries a tier badge', async () => {
  // The assertion this replaces was tautological: it selected spans whose
  // trimmed text already matched /^(OFFICIAL|DERIVED|PROXY|MODELED)$/, then
  // asserted that same text was non-empty. No panel state could fail it.
  //
  // What R4 actually needs is that a figure cannot be announced without its
  // provenance, so the check is now positional: every section heading in the
  // panel must be accompanied by a tier badge. Delete a Section's `tier` prop
  // and this fails, which the old one did not.
  const host = await renderInto(React.createElement(LaborDetailPanel, {
    row: FIXTURE_ROW, year: null, onCorridorBoard: false, onClose: () => {},
  }));
  const TIER = /^(OFFICIAL|DERIVED|PROXY|MODELED)$/;
  const headings = [...host.querySelectorAll('h3')];
  assert.ok(headings.length >= 10, `expected the panel's sections to render, found ${headings.length} headings`);

  // A section may legitimately carry no badge of its own — "Career stage" holds
  // three PROXY figures and one DERIVED, so a single heading badge would have to
  // be wrong about three of them. What must hold is that provenance is stated
  // somewhere a listener meets it: either on the heading, or on every figure
  // beneath it. Requiring a heading badge unconditionally is what pushed the
  // wrong one onto that section in the first place.
  const unbadged = headings
    .filter((h) => {
      const headingRow = [...(h.parentElement?.children || [])];
      if (headingRow.some((el) => el !== h && TIER.test(el.textContent.trim()))) return false;

      // No heading badge: every figure in the section must badge itself.
      const section = h.closest('div')?.parentElement;
      const fields = [...(section?.querySelectorAll('[data-field]') || [])];
      return fields.length === 0 || !fields.every((el) => el.getAttribute('data-tier'));
    })
    .map((h) => h.textContent.trim());

  assert.deepEqual(unbadged, [], `sections stating provenance neither on the heading nor on every figure:\n  ${unbadged.join('\n  ')}`);
});

test('R3 — the map text equivalent is a labelled region, not a description', async () => {
  // R3's acceptance named `aria-describedby` (or an equivalent association) and
  // said the render test would assert it. Nothing did — `grep -rn describedby
  // test/` returned nothing — so R3 was marked done on an unexecuted criterion.
  //
  // The association also changed during implementation, for a reason worth
  // keeping: a description is flattened into one string, so pointing it at 218
  // entries announced the whole dataset in the slot meant for a sentence. It is
  // a labelled region now, which is navigable and skippable. This asserts the
  // association that actually ships.
  const host = await renderInto(React.createElement(App));

  const regions = [...host.querySelectorAll('[role="region"], section')];
  const equivalent = regions.find((el) => /text equivalent/i.test(el.getAttribute('aria-label') || ''));
  assert.ok(equivalent, 'no labelled region for the map text equivalent');

  const items = equivalent.querySelectorAll('li');
  assert.ok(items.length > 0, 'the text equivalent renders no entries');

  // Every entry carries a value-and-tier or says "no data" — the property R3
  // exists for, asserted on rendered output rather than only on the builder.
  const bad = [...items]
    .map((li) => li.textContent.trim())
    .filter((t) => !/(—\s(OFFICIAL|DERIVED|PROXY|MODELED)|:\sno data)$/.test(t));
  assert.deepEqual(bad.slice(0, 5), [], `entries missing a tier word or a "no data" statement:\n  ${bad.slice(0, 5).join('\n  ')}`);

  // And the map itself must not point a description at that list.
  const mapRegion = regions.find((el) => /countries plotted/.test(el.getAttribute('aria-label') || ''));
  assert.ok(mapRegion, 'the map region has no accessible name carrying its coverage');
  assert.equal(
    mapRegion.getAttribute('aria-describedby'), null,
    'the map must not describe itself with the full country list — a description is announced as one uninterrupted string',
  );
});
