#!/usr/bin/env node
// Spec 0012 R6 — the browser measurements the offline suite cannot take.
//
// This is the path spec 0008 R11 opened and spec 0010 deleted: `ada3897` removed
// `r11-measure.mjs`, `r2-keyboard.mjs` and `render-probe.mjs` along with the map
// they measured. 0012's whole subject is layout, jsdom does no layout, and
// `CLAUDE.md` is explicit that a clean build is not evidence a page renders — so
// the path comes back, rebuilt around the wizard.
//
// Requires `playwright-core` and a system Chrome. INSTALL IT UNSAVED:
//     npm install --no-save playwright-core
// It is deliberately absent from package.json. Spec 0008's Non-goal — which
// 0012 restates — is that `verify` and `ci.yml` must run in a fresh clone with
// no network and no browser download. That argument is about the automated
// gate. This is a manual check, and driving a real browser is how it gets done
// accurately rather than by eye.
//
// playwright-core (not `playwright`) never downloads a browser; it drives the
// Chrome already installed on the machine.
//
// Usage:  npm run dev -- --port 5273 --strictPort      # in another shell
//         APP_URL=http://localhost:5273/ node scripts/desktop-measure.mjs \
//           --baseline scripts/desktop-baseline.json
//
//         # before touching any CSS, to capture R5's baseline:
//         APP_URL=... node scripts/desktop-measure.mjs --write-baseline scripts/desktop-baseline.json
//
// The `page.evaluate` callbacks are serialised and run inside the page, so they
// legitimately use browser globals. Declared per-file rather than widening the
// Node block in eslint.config.js, which would stop that block catching a real
// browser-global mistake in an actual Node script.
/* global document, window, getComputedStyle */

import { writeFileSync, readFileSync } from 'node:fs'

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL_ = process.env.APP_URL || 'http://localhost:5173/';

// Spec 0008 recorded a run that measured a *different project* on port 5173 and
// produced entirely plausible numbers, so the title is asserted before anything
// is measured. Note the guard is weaker here than it was there, and knowingly
// so: this repo is currently checked out more than once (worktrees under
// .claude/worktrees/), and every checkout serves this same title. Pin the port
// with --strictPort and pass APP_URL rather than trusting the default, so Vite
// fails loudly instead of falling through to a port serving another branch.
const EXPECTED_TITLE = 'WHO GETS REPLACED FIRST';

// R1. One breakpoint. Every "wide" expectation below is derived from this
// single number rather than restated, so the script cannot drift from the CSS
// by disagreeing with itself.
const BREAKPOINT = 768;

// Seven, not six. 768 is the breakpoint's inclusive lower bound -- the exact
// place an off-by-one lives, and the narrowest viewport the 640px column is
// ever asked to fit inside (64px of ground each side).
const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '480', width: 480, height: 900 },
  { name: '767', width: 767, height: 900 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
];

// R2, R3. The contract, in one place.
const COLUMN = { narrow: 480, wide: 640 };
const TYPE = {
  narrow: { h1: 66, h2: 46, stat: 38 },
  wide: { h1: 78, h2: 54, stat: 44 },
};
// R8. Width-independent floors, re-checked at every width rather than assumed
// from the jsdom suite.
const TAP = { cta: 60, option: 56 };
const RING = { width: '2px', color: 'rgb(255, 90, 43)', offset: '3px' };

// R9. Both countries are NAMED rather than selected by scanning the payload: a
// run-time scan can pick a different country as the data refreshes, and R9
// would then compare two different result screens and still report pass. Both
// are matched on exact row text, because "China" is a prefix of three other
// rows in the payload.
//
// GBR because CLAUDE.md records its clerical figures as the real dataset, so
// the numbers this prints are eyeballable. NZL because the payload carries no
// ISCO block for it at all, and CLAUDE.md records it as deliberately unfilled
// in manual_overrides.json -- a stable absence rather than a transient gap.
// Armenia is named in that same CLAUDE.md sentence but is NOT a valid pick: it
// carries a series in the committed payload. Checked, not assumed.
const SERIES_COUNTRY = 'United Kingdom';
const NO_SERIES_COUNTRY = 'New Zealand';
// The absence in words. Spec 0011 (#68) moved where this is said: a country
// with no series is no longer *selectable* at step 01, so the step 04
// withdrawal is unreachable for one, and the statement is now made on step 01
// when a search matches it. Same rule, new location -- CLAUDE.md puts it as
// "Spec 0011 moved *where* it says so ... Dropping the row is allowed.
// Dropping the statement is not." Asserted so that "string-identical at both
// widths" cannot be satisfied by a screen that says nothing at all.
const WITHDRAWAL = 'reports no occupation breakdown';
const R9_VIEWPORTS = ['375', '1440'];

// Spec 0013. The fold: how much of step 01 renders before the reader has typed,
// and how much a query is allowed to render. These are the numbers a green
// `npm run verify` could not see -- the suite counts DOM nodes and jsdom does no
// layout, so `body.scrollHeight` has to come from a real browser or from nowhere.
const FOLD = { matchLimit: 12, absentLimit: 3, maxViewports: 2 };

// Every screen mounts with `stepin` (0.4-0.5s) and `.wz-option` carries
// `transition: all 0.18s`, so a measurement taken the instant a screen appears
// reads the *start* of an animation. Both cost a real debugging round here: the
// CTA dock measured 62px off the viewport floor, and a Tab-focused option
// reported the 3px UA ring instead of the 2px accent one, because the outline
// was still transitioning. Neither was a defect in the app. `getAnimations()`
// cannot be waited on — the header dot's `pulse` runs forever — so these are
// fixed settles, sized from the keyframes in index.css.
const MOUNT_SETTLE = 700;
// The sparkline's `draw` runs 1.2s, and R12 measures where the stroke ended.
const DRAW_SETTLE = 1500;
const TRANSITION_SETTLE = 300;

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('playwright-core is not installed. It is deliberately not a');
  console.error('dependency — see the header of this file. Run:');
  console.error('    npm install --no-save playwright-core');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

const intro = () => {
  const col = document.querySelector('main').parentElement;
  const h1 = document.querySelector('.wz-h1');
  const lh = h1 ? parseFloat(getComputedStyle(h1).lineHeight) : 0;

  // Enumerated from the stylesheets the browser actually parsed, not grepped
  // from source. CLAUDE.md's font @import incident is exactly this: the file
  // said one thing and the browser was asked for another.
  //
  // Two refinements over the first version. It counts only `min-width`
  // conditions, because index.css imports tailwindcss and tw-animate-css and a
  // utility shipping some other media condition is not this spec's business.
  // And it *counts the sheets it could not read*: the Google Fonts stylesheet
  // is cross-origin and throws SecurityError on .cssRules, so a sheet skipped
  // by an exception must not be indistinguishable from a sheet with no media
  // rules -- otherwise this check passes by not looking.
  let unreadable = 0;
  let sawOwnSheet = false;
  const conditions = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = [...sheet.cssRules] } catch { unreadable += 1; continue }
    // Our stylesheet is the one declaring the layout tokens. Proving it was
    // read is what makes "exactly one min-width condition" mean anything.
    if (rules.some((r) => r.cssText && r.cssText.includes('--column-wide'))) sawOwnSheet = true;
    for (const rule of rules) {
      if (rule instanceof window.CSSMediaRule) conditions.push(rule.conditionText);
    }
  }
  const media = {
    minWidth: conditions.filter((c) => c.includes('min-width')).sort(),
    all: conditions.sort(),
    unreadable,
    sawOwnSheet,
  };

  return {
    viewport: window.innerWidth,
    column: Math.round(col.getBoundingClientRect().width),
    h1: parseFloat(getComputedStyle(h1).fontSize),
    // R3's "no more than three lines at 1440". Height over line-height is the
    // honest count for a block with no other children.
    h1Lines: lh ? Math.round(h1.getBoundingClientRect().height / lh) : null,
    scrollWidth: document.documentElement.scrollWidth,
    media,
  };
};

const stepOne = () => {
  const cta = document.querySelector('.wz-cta');
  const options = [...document.querySelectorAll('.wz-option')];
  return {
    h2: parseFloat(getComputedStyle(document.querySelector('.wz-h2')).fontSize),
    ctaHeight: Math.round(cta.getBoundingClientRect().height),
    // `null`, not `Math.min(...[])`. An empty spread is Infinity, which sails
    // through a `>= 56` check while measuring nothing -- a tap-target check that
    // passes by having no targets, which is the same shape of false green that
    // let a 12,754px step 01 ship. Under 0013 this screen can legitimately
    // render zero options, so the empty case has to be explicit.
    minOptionHeight: options.length
      ? Math.min(...options.map((o) => Math.round(o.getBoundingClientRect().height)))
      : null,
    optionCount: options.length,
  };
};

// Spec 0013 R1, R2, R7. What step 01 costs the page.
//
// `body.scrollHeight / innerHeight` is the measurement the issue is written in,
// and the one no offline check can take. The absence count is measured off the
// rendered copy rather than off a class, because 0011 R6 renders those as plain
// text on purpose -- they are statements, not controls.
const fold = () => {
  const list = document.querySelector('[role=listbox]');
  const notes = [...document.querySelectorAll('p')]
    .filter((n) => n.textContent.includes('reports no occupation breakdown, so'));
  return {
    options: document.querySelectorAll('[role=option]').length,
    absences: notes.length,
    listHeight: list ? Math.round(list.getBoundingClientRect().height) : 0,
    scrollHeight: document.body.scrollHeight,
    innerHeight: window.innerHeight,
    viewports: +(document.body.scrollHeight / window.innerHeight).toFixed(2),
    live: (document.querySelector('[aria-live="polite"]')?.textContent ?? '').trim(),
  };
};

// R4, per step -- because the answer differs per step: a screen that does not
// fit the viewport keeps its dock. `onScreen` is the criterion that matters. A
// static footer under 218 country rows put "Continue" 15,433px below the fold
// at 1440, and neither `position: static` nor "nothing overflows" could see it.
const stepDock = () => {
  const cta = document.querySelector('.wz-cta');
  const dock = cta.closest('.wz-footer');
  const r = cta.getBoundingClientRect();
  return {
    dock: dock ? getComputedStyle(dock).position : 'none',
    anchored: dock ? dock.classList.contains('wz-footer--anchored') : null,
    ctaTop: Math.round(r.top),
    innerHeight: window.innerHeight,
    onScreen: r.top < window.innerHeight && r.bottom > 0,
    // Reported, not asserted. Steps 02 and 03 are short screens whose padded
    // container puts ~26px below the docked CTA even on a phone, so "the dock
    // sits on the viewport floor" is false there at every width and says
    // nothing about whether the dock is doing its job. What matters is the
    // computed position and whether the CTA is on screen, both asserted above.
    dockOnViewportFloor: dock
      ? Math.round(dock.getBoundingClientRect().bottom) === window.innerHeight
      : null,
  };
};

// R8. Read off whatever a real Tab lands on, not off a programmatic .focus().
// The ring is declared on `:focus-visible`, and Chrome does not match that for
// script-driven focus after a mouse interaction — the first version of this
// script called cta.focus() and read back the 3px UA outline in the page
// background colour at every viewport, which looks exactly like a regression
// and is not one. The rule is `:where(a, button, input, select, textarea,
// [tabindex])`, so any focusable element is a valid witness.
const ring = () => {
  const s = getComputedStyle(document.activeElement);
  return {
    ringOn: document.activeElement.className || document.activeElement.tagName,
    ringWidth: s.outlineWidth,
    ringColor: s.outlineColor,
    ringOffset: s.outlineOffset,
  };
};

const result = () => {
  const stat = document.querySelector('.wz-stat');
  return {
    stat: stat ? parseFloat(getComputedStyle(stat).fontSize) : null,
    // R9. The data surface, as strings. A layout change may not move any of it.
    // The headline is carried too, because a no-series country renders no
    // figures and no badges at all: without it, "identical at both widths"
    // would be a comparison of two empty sets.
    headline: document.querySelector('.wz-h2')?.textContent.trim() ?? null,
    figures: [...document.querySelectorAll('.wz-stat')].map((e) => e.textContent.trim()),
    badges: [...document.querySelectorAll('.wz-badge')].map((e) => e.textContent.trim()),
    text: document.querySelector('main')?.innerText ?? '',
    // R12. NOT a bounding box: a bbox is the path's geometry and ignores the
    // dash entirely, so the first version of this check passed while the line
    // was visibly clipped in a screenshot. What matters is whether the dash is
    // long enough to cover the path *as rendered*, so both are put in the same
    // units — the dash in user units, and the path's length scaled by the
    // stretch the viewBox is under.
    spark: (() => {
      const svg = document.querySelector('.wz-card svg') ?? document.querySelector('svg');
      const path = svg?.querySelector('path');
      if (!path) return null;
      const dash = parseFloat(getComputedStyle(path).strokeDasharray);
      const viewBoxWidth = svg.viewBox.baseVal.width || 1;
      const scale = svg.getBoundingClientRect().width / viewBoxWidth;
      const scaled = path.hasAttribute('vector-effect') ? scale : 1;
      return {
        dash,
        // getTotalLength() is in user units; the dash is compared in whichever
        // space the stroke lives in, which is what `scaled` selects.
        needed: +(path.getTotalLength() * scaled).toFixed(1),
        // pathLength="1" makes the dash "one whole path" by definition; record
        // it so the report says why a dash of 1 is enough.
        normalised: path.hasAttribute('pathLength'),
        // The two must not coexist: vector-effect pulls the dash out of the
        // viewBox's coordinate system, which is exactly what made a normalised
        // dash clip the line at 52% of its width.
        nonScalingStroke: path.hasAttribute('vector-effect')
          || getComputedStyle(path).vectorEffect === 'non-scaling-stroke',
      };
    })(),
  };
};

// Step 01 became a search when spec 0011 landed (#68), so the row is reached by
// typing rather than by scrolling to it. Exact text match on the row's own
// label either way: "China" is a prefix of three other rows in the payload.
async function pickCountry(page, name) {
  const search = page.locator('input[role="combobox"]');
  if (await search.count()) {
    await search.fill(name);
    await page.waitForFunction((wanted) => [...document.querySelectorAll('.wz-option')]
      .some((b) => b.querySelector('span')?.textContent.trim() === wanted), name, { timeout: 10000 });
  }
  const index = await page.evaluate((wanted) => [...document.querySelectorAll('.wz-option')]
    .findIndex((b) => b.querySelector('span')?.textContent.trim() === wanted), name);
  if (index === -1) throw new Error(`no country row named exactly "${name}"`);
  await page.locator('.wz-option').nth(index).click();
}

// intro -> 01 country -> 02 occupation -> 03 optional (skipped) -> 04 result
//
// Every click waits for the screen it produced. The steps are internal state
// with a `stepin` animation on mount, so clicking the next `.wz-cta` straight
// away lands on the previous screen's button — which is silent, because the
// selector still matches. The first version of this script did exactly that and
// timed out at step 02 with the CTA still reading "Resolve title".
const atStep = (page, counter) => page.waitForFunction(
  (c) => document.body.innerText.includes(c), counter, { timeout: 15000 });
const ctaReads = (page, text) => page.waitForFunction(
  (t) => document.querySelector('.wz-cta')?.textContent.includes(t), text, { timeout: 15000 });

// Every country this drives is one with a series, so step 04 always renders
// badges. `expectBadges` used to make that optional, for a no-series drive that
// 0011 removed the route to -- see R9's revision note. A parameter with one
// caller and one value is a branch nothing exercises, so it is gone.
async function driveToResult(page, country, { steps = null } = {}) {
  await page.click('.wz-cta');
  await page.waitForSelector('.wz-option');
  await page.waitForTimeout(MOUNT_SETTLE);
  if (steps) steps['01'] = await page.evaluate(stepDock);

  await pickCountry(page, country);
  await page.click('.wz-cta');
  await atStep(page, '02/04');
  await page.waitForTimeout(MOUNT_SETTLE);
  if (steps) steps['02'] = await page.evaluate(stepDock);

  await page.locator('.wz-chip').nth(3).click();   // ISCO major group 4, clerical
  await ctaReads(page, 'Confirm');
  await page.click('.wz-cta');
  await atStep(page, '03/04');
  await page.waitForTimeout(MOUNT_SETTLE);
  if (steps) steps['03'] = await page.evaluate(stepDock);

  await ctaReads(page, 'See the figures');
  await page.click('.wz-cta');                     // bands skipped
  await atStep(page, '04/04');
  await page.waitForSelector('.wz-badge');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const report = { url: URL_, when: new Date().toISOString(), viewports: {} };

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(URL_, { waitUntil: 'networkidle' });
  const title = await page.title();
  if (title !== EXPECTED_TITLE) {
    console.error(`Refusing to measure: expected "${EXPECTED_TITLE}", got "${title}" at ${URL_}`);
    process.exit(1);
  }

  await page.waitForTimeout(MOUNT_SETTLE);
  const row = await page.evaluate(intro);
  await page.click('.wz-cta');
  // The combobox, not `.wz-option`. Spec 0013 folds this list, so a context
  // whose locale resolves to nothing renders zero options at rest and a wait on
  // an option hangs until it times out -- the one place the fold can break an
  // already-green check, and a change to this script rather than to the app.
  await page.waitForSelector('input[role="combobox"]');
  await page.waitForTimeout(MOUNT_SETTLE);
  Object.assign(row, await page.evaluate(stepOne));

  // 0013. Three states, in the order the reader meets them: the resting screen,
  // a one-character query (the worst case for both caps), and a settled one.
  row.fold = { rest: await page.evaluate(fold) };
  await page.locator('input[role="combobox"]').fill('a');
  await page.waitForTimeout(TRANSITION_SETTLE);
  row.fold.oneChar = await page.evaluate(fold);
  await page.locator('input[role="combobox"]').fill('united');
  await page.waitForTimeout(TRANSITION_SETTLE);
  row.fold.settled = await page.evaluate(fold);
  await page.locator('input[role="combobox"]').fill('');
  await page.waitForTimeout(TRANSITION_SETTLE);

  await page.keyboard.press('Tab');
  await page.waitForTimeout(TRANSITION_SETTLE);
  Object.assign(row, await page.evaluate(ring));

  await page.goto(URL_, { waitUntil: 'networkidle' });
  row.steps = {};
  await driveToResult(page, SERIES_COUNTRY, { steps: row.steps });
  await page.waitForTimeout(DRAW_SETTLE);
  Object.assign(row, await page.evaluate(result));

  if (R9_VIEWPORTS.includes(vp.name)) {
    // R9's absence side, at step 01 rather than step 04 -- see WITHDRAWAL.
    await page.goto(URL_, { waitUntil: 'networkidle' });
    await page.click('.wz-cta');
    await page.waitForSelector('.wz-option');
    await page.waitForTimeout(MOUNT_SETTLE);
    await page.locator('input[role="combobox"]').fill(NO_SERIES_COUNTRY);
    await page.waitForTimeout(TRANSITION_SETTLE);
    row.noSeries = await page.evaluate((wanted) => {
      const text = document.querySelector('main').innerText;
      return {
        // The country is named, and it is named as text rather than as a
        // pickable row: 0011 R6 renders it as a <p>, not a control.
        selectable: [...document.querySelectorAll('.wz-option')]
          .some((b) => b.querySelector('span')?.textContent.trim() === wanted),
        statement: (text.split('\n').find((l) => l.includes(wanted)) ?? '').trim(),
      };
    }, NO_SERIES_COUNTRY);
    row.noSeries.statesAbsence = row.noSeries.statement.includes(WITHDRAWAL);
  }

  row.errors = errors;
  report.viewports[vp.name] = row;
  await context.close();
}

await browser.close();

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

const failures = [];
const check = (req, ok, detail) => { if (!ok) failures.push(`${req}: ${detail}`) };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const vp of VIEWPORTS) {
  const r = report.viewports[vp.name];
  const wide = vp.width >= BREAKPOINT;
  const w = wide ? 'wide' : 'narrow';
  const at = `at ${vp.name}`;

  // R1. One *width* breakpoint, plus proof the enumeration read our own sheet.
  check('R1', eq(r.media.minWidth, [`(min-width: ${BREAKPOINT}px)`]),
    `${at} the min-width conditions are ${JSON.stringify(r.media.minWidth)}, want exactly ["(min-width: ${BREAKPOINT}px)"]`);
  check('R1', r.media.sawOwnSheet,
    `${at} the stylesheet declaring --column-wide was never read (${r.media.unreadable} sheet(s) unreadable) — this check would pass by not looking`);
  // The wrapper is `width: 100%` capped by the token, so below the cap the
  // column is simply the viewport. 375 is a 375px column, not a broken 480.
  const wantColumn = Math.min(vp.width, COLUMN[w]);
  check('R2', r.column === wantColumn, `${at} column is ${r.column}, want ${wantColumn}`);
  check('R3', r.h1 === TYPE[w].h1, `${at} h1 is ${r.h1}px, want ${TYPE[w].h1}px`);
  check('R3', r.h2 === TYPE[w].h2, `${at} h2 is ${r.h2}px, want ${TYPE[w].h2}px`);
  check('R3', r.stat === TYPE[w].stat, `${at} stat figure is ${r.stat}px, want ${TYPE[w].stat}px`);
  if (vp.name === '1440') check('R3', r.h1Lines <= 3, `at 1440 the h1 runs ${r.h1Lines} lines, want <= 3`);
  // R4, per step. Step 01 opens as the whole country list and does not fit the
  // viewport, so it keeps its dock at every width; 02 and 03 fit, and un-dock
  // above the breakpoint.
  check('R4', r.steps['01'].dock === 'sticky' && r.steps['01'].anchored === true,
    `${at} step 01's dock is ${r.steps['01'].dock} (anchored: ${r.steps['01'].anchored}) — it must stay sticky, its screen does not fit the viewport`);
  for (const step of ['02', '03']) {
    check('R4', r.steps[step].dock === (wide ? 'static' : 'sticky'),
      `${at} step ${step}'s dock is ${r.steps[step].dock}`);
  }
  // The clause that would have caught what the first version of R4 shipped.
  for (const step of ['01', '02', '03']) {
    check('R4', r.steps[step].onScreen,
      `${at} step ${step}'s CTA is at top ${r.steps[step].ctaTop} in a ${r.steps[step].innerHeight}px viewport — off-screen at first paint`);
  }
  check('R7', r.scrollWidth === r.viewport, `${at} scrollWidth ${r.scrollWidth} != innerWidth ${r.viewport}`);
  check('R7', r.errors.length === 0, `${at} ${r.errors.length} console/page errors: ${r.errors.join(' | ')}`);
  check('R12', r.spark && (r.spark.normalised
    ? r.spark.dash >= 1 && !r.spark.nonScalingStroke
    : r.spark.dash >= r.spark.needed),
  `${at} the trend dash is ${r.spark?.dash} against a rendered path of ${r.spark?.needed} (normalised: ${r.spark?.normalised}, non-scaling-stroke: ${r.spark?.nonScalingStroke}) — the line would be clipped`);
  check('R8', r.ctaHeight >= TAP.cta, `${at} the CTA is ${r.ctaHeight}px, want >= ${TAP.cta}`);
  check('R8', r.minOptionHeight === null || r.minOptionHeight >= TAP.option,
    `${at} the shortest option is ${r.minOptionHeight}px, want >= ${TAP.option}`);

  // ---- spec 0013: the fold ----
  //
  // Reported per state so a failure says WHICH one grew, rather than "step 01 is
  // too tall". The resting count is 0 or 1 by construction: `renderedCountries`
  // returns the selected country alone, and the selection on a cold load is
  // whatever the locale pre-filled, which is 1 for a context Chrome gives a
  // resolvable locale and 0 otherwise. Both are correct; 2 is not.
  const f = r.fold;
  check('0013 R1', f.rest.options <= 1,
    `${at} step 01 rests on ${f.rest.options} options, want 0 or 1`);
  check('0013 R1', f.rest.live === '',
    `${at} the live region reads "${f.rest.live}" at rest, want empty`);
  check('0013 R1', f.rest.viewports < FOLD.maxViewports,
    `${at} the resting page is ${f.rest.scrollHeight}px = ${f.rest.viewports} viewports, want < ${FOLD.maxViewports}`);

  check('0013 R2', f.oneChar.options <= FOLD.matchLimit,
    `${at} a one-character query renders ${f.oneChar.options} options, want <= ${FOLD.matchLimit}`);
  check('0013 R2', f.oneChar.absences <= FOLD.absentLimit,
    `${at} a one-character query renders ${f.oneChar.absences} absence lines, want <= ${FOLD.absentLimit}`);
  check('0013 R2', f.oneChar.viewports < FOLD.maxViewports,
    `${at} a one-character query makes the page ${f.oneChar.scrollHeight}px = ${f.oneChar.viewports} viewports, want < ${FOLD.maxViewports}`);
  // The count is still announced, and the truncation with it -- the half of
  // 0011 R6 that a cap could have silently swallowed.
  check('0013 R3', /^150 of 177 countries match/.test(f.oneChar.live)
    && f.oneChar.live.includes('showing the first 12'),
    `${at} the live region reads "${f.oneChar.live}"`);

  check('0013 R2', f.settled.options === 3 && !f.settled.live.includes('showing the first'),
    `${at} "united" renders ${f.settled.options} options and announces "${f.settled.live}"`);
  check('0013 R1', f.settled.viewports < FOLD.maxViewports,
    `${at} a settled query makes the page ${f.settled.viewports} viewports, want < ${FOLD.maxViewports}`);
  check('R8', r.ringWidth === RING.width && r.ringColor === RING.color && r.ringOffset === RING.offset,
    `${at} the focus ring on ${r.ringOn} is ${r.ringWidth} ${r.ringColor} at ${r.ringOffset}, want ${RING.width} ${RING.color} at ${RING.offset}`);
}

// R9. The data surface is identical across the breakpoint — same figures, same
// tiers, same withdrawal. Asserted non-empty first, or two empty sets would
// satisfy "identical" and prove nothing.
const [a, b] = R9_VIEWPORTS.map((n) => report.viewports[n]);
check('R9', a.figures.length > 0, `no stat figures rendered at ${R9_VIEWPORTS[0]} — nothing to compare`);
check('R9', a.badges.length > 0, `no tier badges rendered at ${R9_VIEWPORTS[0]} — nothing to compare`);
check('R9', a.noSeries.statesAbsence && b.noSeries.statesAbsence,
  `${NO_SERIES_COUNTRY}'s absence is not stated ("${WITHDRAWAL}") at both widths — "string-identical" could be satisfied by a screen that says nothing`);
check('R9', a.noSeries.selectable === false && b.noSeries.selectable === false,
  `${NO_SERIES_COUNTRY} is offered as a pickable row — a country with no series must be named, not selectable (0011 R6)`);
check('R9', eq(a.figures, b.figures), `figures differ across the breakpoint: ${JSON.stringify(a.figures)} vs ${JSON.stringify(b.figures)}`);
check('R9', eq(a.badges, b.badges), `tier badges differ: ${JSON.stringify(a.badges)} vs ${JSON.stringify(b.badges)}`);
check('R9', eq(a.noSeries, b.noSeries), `the no-series statement differs across the breakpoint: ${JSON.stringify(a.noSeries)} vs ${JSON.stringify(b.noSeries)}`);

// R5. The phone layout may not move -- at every viewport below the breakpoint,
// which is 375, 480 and 767.
//
// The compared schema is named here and in the requirement, and holds only
// computed styles, booleans and counts. Deliberately NOT in it: anything whose
// value is a *text box measurement*. The three fonts are fetched from
// fonts.googleapis.com at run time over a real fallback stack, so a slow or
// blocked font request silently re-lays out the headline -- and a baseline
// holding `h1Lines` or `minOptionHeight` would then fail R5 on a network
// condition rather than on a change to this repo. Chrome version drift does the
// same to sub-pixel rounding, and this script pins no Chrome version.
//
// Nothing is lost by the narrowing: the focus ring is R8's and is asserted at
// every width, and the rendered figures and tier badges are R9's and are
// asserted across the breakpoint.
const BASELINE_KEYS = ['column', 'h1', 'h2', 'stat', 'ctaHeight', 'dockPosition',
  'scrollEqualsViewport', 'errorCount'];
const phoneShape = (r) => ({
  column: r.column,
  h1: r.h1,
  h2: r.h2,
  stat: r.stat,
  ctaHeight: r.ctaHeight,
  dockPosition: r.steps['01'].dock,
  scrollEqualsViewport: r.scrollWidth === r.viewport,
  errorCount: r.errors.length,
});
const phones = Object.fromEntries(VIEWPORTS.filter((v) => v.width < BREAKPOINT)
  .map((v) => [v.name, phoneShape(report.viewports[v.name])]));

const writeBaseline = flag('--write-baseline');
if (writeBaseline) {
  writeFileSync(writeBaseline, `${JSON.stringify(phones, null, 2)}\n`);
  console.log(`baseline written: ${writeBaseline} (keys: ${BASELINE_KEYS.join(', ')})`);
}

const baseline = flag('--baseline');
if (baseline) {
  const want = JSON.parse(readFileSync(baseline, 'utf8'));
  const wantRows = Object.keys(want).sort();
  const gotRows = VIEWPORTS.filter((v) => v.width < BREAKPOINT).map((v) => v.name).sort();
  check('R5', eq(wantRows, gotRows),
    `the baseline covers ${JSON.stringify(wantRows)} but the viewports below the breakpoint are ${JSON.stringify(gotRows)}`);
  for (const name of wantRows) {
    check('R5', eq(Object.keys(want[name]).sort(), [...BASELINE_KEYS].sort()),
      `the baseline row ${name} holds ${JSON.stringify(Object.keys(want[name]))}, not the named schema`);
    check('R5', eq(phones[name], want[name]),
      `the phone layout moved at ${name}\n     was: ${JSON.stringify(want[name])}\n     now: ${JSON.stringify(phones[name])}`);
  }
}

const json = flag('--json');
if (json) writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);

for (const vp of VIEWPORTS) {
  const r = report.viewports[vp.name];
  const docks = ['01', '02', '03']
    .map((st) => `${st}:${r.steps[st].dock.slice(0, 4)}${r.steps[st].onScreen ? '' : '!OFF'}`).join(' ');
  console.log(`${vp.name.padStart(4)}  column ${String(r.column).padStart(3)}  h1 ${r.h1}  h2 ${r.h2}  stat ${r.stat}  ${docks}  cta ${r.ctaHeight}  errors ${r.errors.length}`);
  // 0013. Printed rather than only checked: the numbers are the evidence the
  // issue is written in, and a bound that only ever prints "passed" tells you
  // nothing about how close it came.
  const f = r.fold;
  console.log(`      fold  rest ${f.rest.options}opt ${String(f.rest.scrollHeight).padStart(5)}px ${f.rest.viewports}vp`
    + ` | "a" ${f.oneChar.options}opt ${f.oneChar.absences}abs ${String(f.oneChar.scrollHeight).padStart(5)}px ${f.oneChar.viewports}vp`
    + ` | "united" ${f.settled.options}opt ${String(f.settled.scrollHeight).padStart(5)}px ${f.settled.viewports}vp`);
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nall checks passed');
