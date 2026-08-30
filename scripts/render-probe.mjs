#!/usr/bin/env node
// Spec 0008 — render probe. Committed so the axe row in the spec's Source
// verification table can be re-run: `node scripts/render-probe.mjs`.
//
// Requires the devDependencies R9 introduces (`jsdom`, `axe-core`). Until R9
// lands, run it after `npm install --no-save jsdom axe-core`.
//
// The first draft of the spec probed axe against a hand-written FIXTURE and
// then wrote R9 as "axe over the rendered app", which is a different and
// unprobed claim. This script settles it. Two findings shape R9:
//
//  1. Order matters. Leaflet dereferences `window` at MODULE EVALUATION time
//     (leaflet-src.js:230), so importing App.jsx before jsdom globals exist
//     throws "window is not defined" and nothing renders. Globals first, then
//     import. With that order the whole tree — map included — mounts.
//  2. `target-size` reports a FALSE PASS over the real tree. jsdom has no
//     layout, so every box is empty and the rule finds nothing to fail. That is
//     more dangerous than the INAPPLICABLE it returns against a fixture, and it
//     is why R9 disables the rule explicitly rather than letting it report green.

import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});

// Globals BEFORE any application module is imported. See finding 1 above.
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'DOMParser', 'Image',
  'MouseEvent', 'Event', 'CustomEvent']) {
  if (dom.window[k] === undefined) continue;
  // Node 24 exposes `navigator` as a getter-only global, so plain assignment throws.
  try { globalThis[k] = dom.window[k]; }
  catch { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The app is JSX and imports CSS and JSON, so plain Node cannot load it. Vite is
// already a devDependency; its SSR transform handles all three with no bundler
// and no new dependency, which is what keeps R9's budget to jsdom + axe-core.
const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });

const App = (await vite.ssrLoadModule('/src/App.jsx')).default;
const React = await import('react');
const { createRoot } = await import('react-dom/client');

const root = createRoot(dom.window.document.getElementById('root'));
await React.act(async () => { root.render(React.createElement(App)); });

const doc = dom.window.document;
console.log('Spec 0008 render probe — full app under jsdom via vite.ssrLoadModule\n');
console.log(`  rendered DOM        ${doc.body.innerHTML.length} chars`);
console.log(`  .leaflet-container  ${!!doc.querySelector('.leaflet-container')}`);
console.log(`  <button> elements   ${doc.querySelectorAll('button').length}`);
console.log(`  aria-* attributes   ${doc.querySelectorAll('[aria-label],[aria-labelledby],[aria-pressed],[role]').length}`);

dom.window.eval(axe.source);
const results = await dom.window.axe.run(doc, {
  runOnly: {
    type: 'rule',
    values: ['color-contrast', 'target-size', 'button-name', 'region', 'label',
      'heading-order', 'link-name', 'aria-allowed-attr', 'image-alt'],
  },
});

const outcome = (id) => {
  const v = results.violations.find((x) => x.id === id);
  if (v) return `VIOLATION (${v.nodes.length} nodes)`;
  if (results.incomplete.find((x) => x.id === id)) return 'INCOMPLETE — axe could not decide';
  if (results.passes.find((x) => x.id === id)) return 'pass';
  return 'INAPPLICABLE — rule never ran';
};

console.log('\n  axe-core over the real component tree:');
for (const id of ['button-name', 'link-name', 'image-alt', 'region', 'label', 'heading-order',
  'aria-allowed-attr', 'color-contrast', 'target-size']) {
  console.log(`    ${id.padEnd(20)} ${outcome(id)}`);
}
console.log('\n  NOTE: `target-size` above is a FALSE PASS — jsdom has no layout engine, so');
console.log('  there are no boxes to measure. R9 disables it; R6/R11 measure it in a browser.');
console.log('  `color-contrast` is INCOMPLETE for the same class of reason (no canvas).');

await vite.close();
process.exit(0);
