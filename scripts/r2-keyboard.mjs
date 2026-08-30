#!/usr/bin/env node
// Spec 0008 R2 — the keyboard walkthrough its acceptance asks for, driven.
//
// The acceptance is a list of things a person must be able to do "starting from
// a fresh load and using only Tab, Shift+Tab, arrows, Enter and Space". Reading
// the rendered tab order is not that, and the difference was not academic: an
// earlier pass verified reach by reading the DOM and the axe pass, marked R2
// done, and missed 206 Leaflet marker paths sitting ahead of the listbox. Only
// pressing the keys found them.
//
// So this presses the keys. Each check below maps to one clause of R2's
// acceptance and reports what it observed, not what the markup implies.
//
// Requires playwright-core and a system Chrome, both unsaved — see
// scripts/r11-measure.mjs for why that is compatible with the Non-goals.
/* global document, getComputedStyle */

import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL_ = process.env.APP_URL || 'http://localhost:5173/';
const EXPECTED_TITLE = 'WHO GETS REPLACED FIRST';
const MAX_TABS = 200;

const toLinear = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const relLum = (rgb) => { const [r, g, b] = rgb.map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const l1 = relLum(a), l2 = relLum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const parseRgb = (s) => {
  const m = /rgba?\(([^)]+)\)/.exec(s || '');
  if (!m) return null;
  const p = m[1].split(',').map((n) => parseFloat(n));
  if (p.length > 3 && p[3] === 0) return null; // fully transparent
  return [p[0], p[1], p[2]];
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(URL_, { waitUntil: 'networkidle' });
if (await page.title() !== EXPECTED_TITLE) {
  await browser.close();
  console.error(`ABORT: ${URL_} serves "${await page.title()}", not "${EXPECTED_TITLE}".`);
  process.exit(1);
}
await page.waitForTimeout(1500);

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (detail) console.log(`        ${detail}`);
};

const focused = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role'),
    id: el.id || null,
    name: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 52),
    outlineWidth: cs.outlineWidth,
    outlineColor: cs.outlineColor,
    // Walk up for a painted background to measure the ring against.
    bg: (() => {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
        n = n.parentElement;
      }
      return 'rgb(255, 255, 255)';
    })(),
    w: Math.round(r.width), h: Math.round(r.height),
  };
});

const fromTop = async () => {
  await page.evaluate(() => { const h = document.querySelector('h1'); h.setAttribute('tabindex', '-1'); h.focus(); });
};

console.log(`Spec 0008 R2 — keyboard walkthrough, driven\n${URL_}\n`);

// ---------- 1. Every stop is keyboard-reachable and shows a focus ring ----------
await fromTop();
const stops = [];
for (let i = 0; i < MAX_TABS; i++) {
  await page.keyboard.press('Tab');
  const f = await focused();
  if (f) stops.push(f);
}
const seen = new Set();
const unique = stops.filter((s) => { const k = `${s.tag}|${s.role}|${s.name}`; if (seen.has(k)) return false; seen.add(k); return true; });
const noRing = unique.filter((s) => s.outlineWidth === '0px' || parseFloat(s.outlineWidth) === 0);
record(
  'every focused element shows a visible focus indicator',
  noRing.length === 0,
  `${unique.length} distinct stops in ${MAX_TABS} presses; ${noRing.length} without an outline` +
  (noRing.length ? `\n        first: <${noRing[0].tag}> "${noRing[0].name}"` : ''),
);

const ringRatios = unique
  .map((s) => {
    const fg = parseRgb(s.outlineColor);
    const bg = parseRgb(s.bg);
    return fg && bg ? { name: s.name, ratio: contrast(fg, bg) } : null;
  })
  .filter(Boolean);
const weakRing = ringRatios.filter((r) => r.ratio < 3);
record(
  'focus indicator is at least 3:1 against its background',
  weakRing.length === 0,
  `measured ${ringRatios.length} rings; min ${Math.min(...ringRatios.map((r) => r.ratio)).toFixed(2)}:1` +
  (weakRing.length ? `\n        weakest: "${weakRing[0].name}" ${weakRing[0].ratio.toFixed(2)}:1` : ''),
);

// No SVG marker paths in the tab order — they are not keyboard-operable.
const pathStops = stops.filter((s) => s.tag === 'path').length;
record('no non-operable marker path is in the tab order', pathStops === 0, `${pathStops} path stops`);

// ---------- 2. The metric can be changed ----------
await fromTop();
const metricBefore = await page.evaluate(() => document.querySelector('[role="listbox"]')?.getAttribute('aria-label'));
let changedMetric = false;
for (let i = 0; i < MAX_TABS && !changedMetric; i++) {
  await page.keyboard.press('Tab');
  const f = await focused();
  if (f && f.tag === 'button' && /Professional core/.test(f.name)) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    changedMetric = true;
  }
}
const metricAfter = await page.evaluate(() => document.querySelector('[role="listbox"]')?.getAttribute('aria-label'));
record(
  'the metric can be changed by keyboard',
  changedMetric && metricBefore !== metricAfter,
  `"${metricBefore}"\n        -> "${metricAfter}"`,
);

// ---------- 3. A named country can be selected ----------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await fromTop();
await page.keyboard.press('Shift+Tab');       // the skip link is first
await page.keyboard.press('Enter');            // jump to the ranking listbox
await page.waitForTimeout(250);
const landedOn = await focused();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
const selection = await page.evaluate(() => {
  const lb = document.querySelector('[role="listbox"]');
  const id = lb?.getAttribute('aria-activedescendant');
  const opt = id ? document.getElementById(id) : null;
  const panel = document.querySelector('[role="region"][aria-label^="Country detail"], [role="dialog"][aria-label^="Country detail"]');
  return { option: opt?.getAttribute('aria-label') || null, panel: panel?.getAttribute('aria-label') || null };
});
record(
  'a named country can be selected by keyboard',
  Boolean(selection.option && selection.panel && !/nothing selected/.test(selection.panel)),
  `skip link -> ${landedOn?.role}#${landedOn?.id}\n        active option "${selection.option}"\n        panel "${selection.panel}"`,
);

// ---------- 4. The detail panel opens and closes ----------
let closed = null;
for (let i = 0; i < 40; i++) {
  await page.keyboard.press('Tab');
  const f = await focused();
  if (f && /^Close /.test(f.name)) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    closed = await page.evaluate(() => {
      const p = document.querySelector('[role="region"][aria-label^="Country detail"], [role="dialog"][aria-label^="Country detail"]');
      return p ? p.getAttribute('aria-label') : 'no panel';
    });
    break;
  }
}
record(
  'the detail panel can be opened and closed by keyboard',
  closed !== null && /nothing selected|no panel/.test(closed),
  `after activating the close control, the panel is: "${closed}"`,
);

// ---------- 5. The year scrubber can be moved ----------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await fromTop();
let movedYear = null;
for (let i = 0; i < MAX_TABS; i++) {
  await page.keyboard.press('Tab');
  const f = await focused();
  if (f && f.tag === 'input' && /Year/i.test(f.name)) {
    const before = await page.evaluate(() => document.activeElement.value);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => document.activeElement.value);
    movedYear = { before, after };
    break;
  }
}
record(
  'the year scrubber can be moved by keyboard',
  Boolean(movedYear && movedYear.before !== movedYear.after),
  movedYear ? `range value ${movedYear.before} -> ${movedYear.after}` : 'never reached the year input',
);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('failed:');
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
