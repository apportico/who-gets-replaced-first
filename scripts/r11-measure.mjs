#!/usr/bin/env node
// Spec 0008 R11 — the browser measurements the offline suite cannot take.
//
// Requires `playwright-core` and a system Chrome. INSTALL IT UNSAVED:
//     npm install --no-save playwright-core
// It is deliberately absent from package.json. Spec 0008's Non-goals decline a
// headless browser in `verify` and CI, because `scripts/verify.sh` and
// `ci.yml` both depend on running in a fresh clone with no network and no
// browser download. That argument is about the automated gate. R11 is a manual,
// one-off verification, and driving a browser to take its measurements is not
// the thing the Non-goal declines — it is how R11 gets done accurately rather
// than by eye.
//
// playwright-core (not `playwright`) never downloads a browser; it drives the
// Chrome already installed on the machine.
//
// Usage:  npm run dev    # in another shell
//         node scripts/r11-measure.mjs [--json out.json]

// The `page.evaluate` callbacks below are serialised and run inside the page, so
// they legitimately use browser globals. Declared per-file rather than adding
// globals.browser to the Node ESLint block, which would stop that block
// catching a real browser-global mistake in an actual Node script.
/* global document, window, getComputedStyle */

import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// 5173 is Vite's default. An earlier version defaulted to 5174, which is only
// where this machine happened to land when 5173 was already taken — the
// documented two-step usage then failed, or worse measured another project.
const URL_ = process.env.APP_URL || 'http://localhost:5173/';

// Vite falls through to the next free port when 5173 is taken, and this machine
// runs more than one project. The first run of this script measured "THE GRAND
// CHESSBOARD" on 5173 and reported a 1360px map and buttons named "BRI —
// Maritime Silk Road", none of which exist here. Nothing in the numbers said
// they were from the wrong app. So the title is checked before anything is
// measured, and a mismatch aborts rather than producing a plausible baseline.
const EXPECTED_TITLE = 'WHO GETS REPLACED FIRST';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const report = { url: URL_, when: new Date().toISOString(), viewports: {} };

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(URL_, { waitUntil: 'networkidle' });

  const title = await page.title();
  if (title !== EXPECTED_TITLE) {
    await browser.close();
    console.error(`\nABORT: ${URL_} is serving "${title}", not "${EXPECTED_TITLE}".`);
    console.error('Another Vite project is probably on that port. Start this app and set APP_URL.');
    process.exit(1);
  }

  await page.waitForTimeout(1200); // let Leaflet lay the map out

  const measured = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) };
    };
    // Interactive targets, for R6's 24x24 floor.
    // `path.leaflet-interactive` is the important one and was missing: the 218
    // country markers are Leaflet CircleMarkers, which render as bare SVG paths
    // and match none of the HTML selectors. Clicking one is the app's primary
    // interaction, so a target census that excludes them is not a census — the
    // first version of this script reported "2 of 236" while 155 markers sat
    // under 24px, the smallest at 8px.
    const targets = [...document.querySelectorAll('button, a, input, [role="option"], [tabindex="0"], path.leaflet-interactive')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        return {
          w: Math.round(r.width), h: Math.round(r.height),
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().slice(0, 40),
          marker: el.tagName.toLowerCase() === 'path',
        };
      })
      .filter(Boolean);

    // Rendered font size of the tier badges, for R4.
    const badges = [...document.querySelectorAll('span')]
      .filter((el) => /^(OFFICIAL|DERIVED|PROXY|MODELED)$/.test(el.textContent.trim()))
      .map((el) => ({
        text: el.textContent.trim(),
        px: parseFloat(getComputedStyle(el).fontSize),
        color: getComputedStyle(el).color,
      }));

    return {
      map: box('.leaflet-container'),
      sidebar: box('.panel-scroll'),
      panels: [...document.querySelectorAll('.panel-scroll')].map((el) => Math.round(el.getBoundingClientRect().width)),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
      ariaCount: document.querySelectorAll('[aria-label],[aria-labelledby],[aria-pressed],[role]').length,
      landmarks: document.querySelectorAll('main, nav, [role="main"], [role="navigation"], [role="region"]').length,
      // Reported in three buckets so an exemption is visible rather than folded
      // into one number. WCAG 2.5.8 exempts a target whose function is available
      // through another control on the same page that does meet the size floor:
      //  - markers: every country, including the no-data ones, is selectable in
      //    the ranking listbox, whose options are 24px below `md`.
      //  - inline: the Leaflet attribution links, exempt as inline text
      //    constrained by the line-height of the sentence they sit in.
      //  - sr-only: 1x1 until focused; the skip link measures 169x36 when it is.
      // Everything else has to pass, and `mustPassUnder24` is the number R6 is
      // judged on.
      targetsTotal: targets.length,
      markersUnder24: targets.filter((t) => t.marker && (t.w < 24 || t.h < 24)).length,
      inlineExempt: targets.filter((t) => !t.marker && t.tag === 'a' && t.h < 16 && t.w < 60).length,
      srOnlyExempt: targets.filter((t) => t.w <= 1 && t.h <= 1).length,
      mustPassUnder24: targets.filter((t) => !t.marker && !(t.w <= 1 && t.h <= 1)
        && !(t.tag === 'a' && t.h < 16 && t.w < 60) && (t.w < 24 || t.h < 24)).length,
      targetsUnder24: targets.filter((t) => t.w < 24 || t.h < 24).length,
      smallestTargets: targets.filter((t) => !t.marker && !(t.w <= 1 && t.h <= 1)
        && !(t.tag === 'a' && t.h < 16 && t.w < 60) && (t.w < 24 || t.h < 24))
        .sort((a, b) => a.w * a.h - b.w * b.h).slice(0, 6),
      badges,
    };
  });

  measured.consoleErrors = consoleErrors;
  report.viewports[vp.name] = measured;

  console.log(`\n=== ${vp.name}  ${vp.width}x${vp.height} ===`);
  console.log(`  map container      ${measured.map ? `${measured.map.w} x ${measured.map.h}` : 'ABSENT'}`);
  console.log(`  .panel-scroll widths  [${measured.panels.join(', ')}]`);
  console.log(`  horizontal scroll  ${measured.horizontalScroll} (scrollWidth ${measured.scrollWidth} vs innerWidth ${measured.innerWidth})`);
  console.log(`  landmarks          ${measured.landmarks}   aria attributes ${measured.ariaCount}`);
  console.log(`  targets            ${measured.targetsTotal} total, ${measured.targetsUnder24} under 24px`);
  console.log(`    exempt: ${measured.markersUnder24} markers (equivalent control), ${measured.inlineExempt} inline links, ${measured.srOnlyExempt} sr-only`);
  console.log(`    MUST PASS under 24px: ${measured.mustPassUnder24}`);
  for (const t of measured.smallestTargets) console.log(`      ${String(t.w).padStart(4)} x ${String(t.h).padStart(3)}  <${t.tag}> ${t.label}`);
  console.log(`  tier badges        ${measured.badges.length ? measured.badges.map((b) => `${b.text} ${b.px}px`).join(', ') : 'none rendered'}`);
  console.log(`  console            ${consoleErrors.length ? consoleErrors.length + ' message(s)' : 'clean'}`);
  for (const e of consoleErrors.slice(0, 5)) console.log(`      ${e.slice(0, 140)}`);

  await context.close();
}

await browser.close();

const jsonFlag = process.argv.indexOf('--json');
if (jsonFlag !== -1 && process.argv[jsonFlag + 1]) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.argv[jsonFlag + 1], JSON.stringify(report, null, 2));
  console.log(`\nwrote ${process.argv[jsonFlag + 1]}`);
}
