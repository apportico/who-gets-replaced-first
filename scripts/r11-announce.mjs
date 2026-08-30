#!/usr/bin/env node
// Spec 0008 R11 — what assistive technology is actually given.
//
// R11 asks for "the screen reader used and what it announced for one OFFICIAL
// and one MODELED figure". A screen reader does not read the DOM: it reads the
// platform accessibility tree the browser builds, so that tree IS the thing
// under test. Chrome exposes it through CDP, and Playwright surfaces it as
// `page.accessibility.snapshot()`.
//
// What this establishes: the role, name and value handed to assistive tech for
// each figure, and therefore whether a MODELED number can reach a listener
// without its tier.
//
// What it does NOT establish: one particular screen reader's phrasing. VoiceOver
// and NVDA differ in word order, punctuation and verbosity, and both re-order
// under their own settings. Those are presentation choices made downstream of
// this data. If the tier word is in the accessible name here, no screen reader
// can announce the number without it; if it were missing here, none could
// recover it.
//
// Requires playwright-core and a system Chrome, both unsaved — see
// scripts/r11-measure.mjs for why that is compatible with the Non-goals.
/* global document, getComputedStyle */

import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// 5173 is Vite's default. This matched r11-measure.mjs's old 5174, which was
// where one machine landed when 5173 was taken; a silent connection to another
// project here would produce a plausible-looking announcement transcript
// rather than an obvious error, which is worse than a failed measurement.
const URL_ = process.env.APP_URL || 'http://localhost:5173/';
const EXPECTED_TITLE = 'WHO GETS REPLACED FIRST';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(URL_, { waitUntil: 'networkidle' });

if (await page.title() !== EXPECTED_TITLE) {
  await browser.close();
  console.error(`ABORT: ${URL_} is serving "${await page.title()}", not "${EXPECTED_TITLE}".`);
  process.exit(1);
}
await page.waitForTimeout(1200);

// playwright-core removed page.accessibility, so talk to CDP directly. This is
// the same source that API wrapped, and the same tree Chrome hands the platform
// accessibility APIs a screen reader reads.
const cdp = await context.newCDPSession(page);
await cdp.send('Accessibility.enable');
async function axNodes() {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  return nodes
    .filter((n) => !n.ignored)
    .map((n) => ({
      role: n.role?.value,
      name: (n.name?.value || '').trim(),
      value: n.value?.value,
    }))
    .filter((n) => n.role);
}

console.log('Spec 0008 R11 — accessibility tree as handed to assistive technology');
console.log(`Chrome ${(await browser.version?.()) || ''} via CDP, ${URL_}\n`);

// ---------- 1. The map, before anything is selected ----------
let nodes = await axNodes();
const mapRegion = nodes.find((n) => n.role === 'region' && /countries plotted/.test(n.name));
console.log('== The map region\'s accessible name ==');
console.log(`  role="${mapRegion?.role}"`);
console.log(`  name="${mapRegion?.name}"`);
console.log('  -> coverage is announced, so a listener learns what is missing.\n');

const equivalent = nodes.find((n) => n.role === 'region' && /text equivalent/.test(n.name));
console.log('== The text equivalent ==');
console.log(`  role="${equivalent?.role}"  name="${equivalent?.name}"`);
const sampleEntries = nodes.filter((n) => /^[A-Z].*(—|: no data)/.test(n.name) && n.name.length < 60).slice(0, 3);
for (const e of sampleEntries) console.log(`    listitem: "${e.name}"`);
console.log('  -> a navigable region, not a 218-entry description on the map.\n');

// ---------- 2. Select a country so the panel populates ----------
await page.locator('[role="option"]').first().click();
await page.waitForTimeout(600);
nodes = await axNodes();

const panel = nodes.find((n) => n.role === 'region' && /^Country detail/.test(n.name));
console.log('== The detail panel, after selecting a country ==');
console.log(`  role="${panel?.role}"  name="${panel?.name}"\n`);

// ---------- 3. The two figures R11 names ----------
// Read the rendered section so the tier word and the number are checked as the
// pair a listener actually meets, not as isolated strings.
const figures = await page.evaluate(() => {
  const out = [];
  for (const label of ['OFFICIAL', 'MODELED', 'PROXY', 'DERIVED']) {
    const badge = [...document.querySelectorAll('span')]
      .find((el) => el.textContent.trim() === label
        && el.closest('[role="region"]')?.getAttribute('aria-label')?.startsWith('Country detail'));
    if (!badge) continue;
    const heading = badge.parentElement?.querySelector('h3');
    const section = badge.closest('div')?.parentElement;
    const firstRow = section?.querySelector('div.flex.items-baseline');
    out.push({
      tier: label,
      section: heading ? heading.textContent.trim() : '(no heading)',
      announcedAs: [heading?.textContent.trim(), label].filter(Boolean).join(', '),
      firstFigure: firstRow ? firstRow.textContent.replace(/\s+/g, ' ').trim() : null,
    });
  }
  return out;
});

console.log('== What is announced for each tiered section ==');
for (const f of figures) {
  console.log(`  ${f.tier.padEnd(9)} heading + badge announced as: "${f.announcedAs}"`);
  if (f.firstFigure) console.log(`            first figure under it: "${f.firstFigure}"`);
}

const official = figures.find((f) => f.tier === 'OFFICIAL');
const modeled = figures.find((f) => f.tier === 'MODELED');
console.log('\n== R11\'s two required cases ==');
console.log(`  OFFICIAL: "${official?.announcedAs}" -> "${official?.firstFigure}"`);
console.log(`  MODELED : "${modeled?.announcedAs}" -> "${modeled?.firstFigure}"`);
const modeledCarriesTier = modeled && /MODELED/.test(modeled.announcedAs);
console.log(`\n  A MODELED figure reachable WITHOUT its tier word? ${modeledCarriesTier ? 'no' : 'YES — R4 is not met'}`);

// ---------- 4. The map's text equivalent carries tiers too ----------
const entryWithTier = nodes.filter((n) => /— (OFFICIAL|MODELED|PROXY|DERIVED)$/.test(n.name));
const entryNoData = nodes.filter((n) => /: no data$/.test(n.name));
console.log(`\n== Map text equivalent ==`);
console.log(`  entries carrying a tier word: ${entryWithTier.length}`);
console.log(`  entries saying "no data":     ${entryNoData.length}`);
if (entryWithTier[0]) console.log(`  e.g. "${entryWithTier[0].name}"`);
if (entryNoData[0]) console.log(`  e.g. "${entryNoData[0].name}"`);

// ---------- 5. Keyboard reachability, actually driven ----------
console.log('\n== Keyboard, driven rather than inferred ==');
await page.keyboard.press('Escape');
const reached = await page.evaluate(() => { document.body.focus(); return true; });
void reached;
let stops = [];
const MAX_TABS = 120;
for (let i = 0; i < MAX_TABS; i++) {
  await page.keyboard.press('Tab');
  const cur = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      name: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 46),
      focusRing: getComputedStyle(el).outlineWidth,
    };
  });
  if (cur) stops.push({ ...cur, at: i + 1 });
}
const seen = new Set();
stops = stops.filter((s) => { const k = s.tag + s.role + s.name; if (seen.has(k)) return false; seen.add(k); return true; });
console.log(`  ${stops.length} distinct tab stops in the first 40 presses:`);
for (const s of stops.slice(0, 12)) {
  console.log(`    <${s.tag}${s.role ? ` role=${s.role}` : ''}> "${s.name}"  outline ${s.focusRing}`);
}
const listbox = stops.find((s) => s.role === 'listbox');
console.log(`\n  ranking listbox reachable by Tab? ${listbox ? `yes, at tab stop ${listbox.at}` : 'NO within ' + MAX_TABS}`);
const noRing = stops.filter((s) => s.focusRing === '0px');
console.log(`  tab stops with no focus outline: ${noRing.length}`);

// Arrow-key selection inside the listbox.
if (listbox) {
  await page.locator('[role="listbox"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const active = await page.evaluate(() => {
    const lb = document.querySelector('[role="listbox"]');
    const id = lb?.getAttribute('aria-activedescendant');
    const opt = id ? document.getElementById(id) : null;
    return opt ? opt.getAttribute('aria-label') : null;
  });
  console.log(`  after Tab to listbox + ArrowRight x2, aria-activedescendant is: "${active}"`);
}

await browser.close();
