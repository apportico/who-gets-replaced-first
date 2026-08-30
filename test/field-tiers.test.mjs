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

async function renderPanel(row = FIXTURE_ROW) {
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  await React.act(async () => {
    root.render(React.createElement(LaborDetailPanel, {
      row, year: null, onCorridorBoard: false, onClose: () => {},
    }));
  });
  return host;
}

// Every figure inside a Section must be reachable from a provenance statement.
// A `[data-field]` the registry calls NOT_A_MEASUREMENT counts: the registry
// itself is saying the number carries no tier, which is a declaration rather
// than an omission. An unknown field does not count, so this is not a way to
// silence the check.
function figuresWithoutProvenance(host) {
  const missing = [];
  for (const section of host.querySelectorAll('[data-section]')) {
    for (const el of section.querySelectorAll('*')) {
      if (el.children.length > 0) continue;               // leaves only, no double counting
      if (el.closest('[data-section-heading]')) continue;  // the heading and its own badge
      const text = el.textContent.trim();
      if (!/\d/.test(text)) continue;                      // not a figure
      if (el.closest('[data-tier]')) continue;             // tier stated
      const declared = el.closest('[data-field]');
      if (declared && FIELD_TIERS[declared.getAttribute('data-field')] === 'NOT_A_MEASUREMENT') continue;
      missing.push(`${section.getAttribute('data-section')}: "${text.slice(0, 60)}"`);
    }
  }
  return missing;
}

test('R4 — the payload carries the tier registry the panel reads', () => {
  // If spec 0009's export ever stops emitting this, the panel would silently
  // fall back to section tiers — the exact state this requirement fixed.
  assert.ok(FIELD_TIERS, 'global_labor.json has no field_tiers block');
  const count = Object.keys(FIELD_TIERS).length;
  assert.ok(count >= 80, `field_tiers has only ${count} entries`);
  const constructed = Object.values(FIELD_TIERS).filter((t) => t === 'MODELED' || t === 'PROXY');
  assert.ok(constructed.length > 0, 'no MODELED or PROXY fields — the registry looks wrong');
});

test('R4 — every metric announces the tier the registry gives its field', async () => {
  // The panel test below walks the detail panel and never reaches METRICS, so
  // six of the nineteen metric badges disagreed with the registry unnoticed —
  // all six overstating: three OFFICIAL where config.py says DERIVED, the
  // squeeze index DERIVED where it says MODELED, and two career-stage metrics
  // OFFICIAL where they are PROXY.
  //
  // The blast radius is what makes this worth its own assertion. A metric's
  // tier is not only a sidebar badge: `mapSummary` puts it in the map's
  // accessible name and `mapTextEntries` puts it on every entry of the text
  // equivalent, so one wrong tier is announced 354 times.
  const { METRICS } = await import('../src/utils/laborMetrics.js');
  const wrong = [];
  for (const m of METRICS) {
    const truth = FIELD_TIERS[m.key];
    if (!truth || !REAL_TIERS.has(truth)) continue;
    if (m.tier !== truth.toLowerCase()) {
      wrong.push(`${m.key}: metric says ${m.tier.toUpperCase()}, registry says ${truth}`);
    }
  }
  assert.deepEqual(wrong, [], `metric tiers disagreeing with the registry:\n  ${wrong.join('\n  ')}`);
});

test('R3 — the text equivalent carries the registry tier, not a declared one', async () => {
  // The consequence of the above, asserted where a listener meets it.
  const { METRIC_BY_KEY } = await import('../src/utils/laborMetrics.js');
  const { mapTextEntries, mapSummary } = await import('../src/utils/mapText.js');
  const metric = METRIC_BY_KEY.white_collar_pct;
  const truth = FIELD_TIERS[metric.key];
  const rows = [{ iso3: 'PRT', country_name: 'Portugal', white_collar_pct: 50.7 }];

  assert.equal(mapTextEntries(rows, metric)[0].tier, truth,
    `the text equivalent announces ${mapTextEntries(rows, metric)[0].tier} for a ${truth} field`);
  assert.ok(mapSummary(rows, metric).includes(truth),
    `the map summary does not name the field's real tier (${truth})`);
});

test('R4 — every rendered figure is announced under its own tier', async () => {
  const host = await renderPanel();
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

test('R4 — no figure inside a section escapes the annotation', async () => {
  // The guard over the guard, and the reason this round exists. The two tests
  // above walk `[data-field]`, so they can only ever see figures someone
  // remembered to annotate — the hand-maintained-list problem one level up.
  // `Trends` and `OccupationBreakdown` rendered their own markup with no
  // `data-field` on it, so fifteen DERIVED and PROXY figures sat under
  // `tier="official"` headings and both assertions passed over them.
  //
  // This one is framed over the rendered tree instead: every leaf carrying a
  // digit, anywhere inside a Section, must descend from something that states
  // provenance. A new component that renders its own figures fails here rather
  // than being skipped, which is the property the `[data-field]` walk lacks.
  const host = await renderPanel();
  const missing = figuresWithoutProvenance(host);
  assert.deepEqual(missing, [], `figures rendered with no provenance a listener could reach:\n  ${missing.join('\n  ')}`);
});

test('R4 — the partial-coverage caveats state provenance too', async () => {
  // The base fixture is a complete country: `isco_groups_reported: 9` and
  // `isco_classified_share_pct: 100`, so BOTH caveat paragraphs in
  // `OccupationBreakdown` are branches the guard above never renders. Loading
  // the real page found the gap — Luxembourg reports 8 of 9 groups, and the
  // resulting paragraph was the one figure on the page with no provenance.
  // A guard whose fixture cannot reach a branch does not cover that branch.
  const host = await renderPanel({
    ...FIXTURE_ROW, isco_groups_reported: 8, isco_classified_share_pct: 62.4,
  });

  const text = host.textContent;
  assert.match(text, /8 of 9 major groups/, 'the reported-groups caveat did not render, so this asserts nothing');
  assert.match(text, /62% of employment is classified/, 'the classified-share caveat did not render, so this asserts nothing');

  const missing = figuresWithoutProvenance(host);
  assert.deepEqual(missing, [], `figures rendered with no provenance a listener could reach:\n  ${missing.join('\n  ')}`);
});

test('R4 — no constructed figure is announced as measured', async () => {
  // The direction that matters. Announcing OFFICIAL data under DERIVED
  // understates it; announcing a MODELED index under DERIVED or OFFICIAL
  // overstates its provenance, which is the blurring this project refuses.
  const STRENGTH = { MODELED: 0, PROXY: 1, DERIVED: 2, OFFICIAL: 3 };
  const host = await renderPanel();

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
