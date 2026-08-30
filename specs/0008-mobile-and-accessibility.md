# 0008 — mobile and accessibility

**Status:** draft
**Depends on:** none
**Issue:** [#18](https://github.com/apportico/who-gets-replaced-first/issues/18)

## Objective

The page cannot currently answer "what does this country look like?" for anyone
on a phone, anyone using a keyboard, or anyone who cannot resolve the colour
ramp — and the probes below show the third group includes people with normal
colour vision. At 375px the map element is allocated **zero width**; the 218
country markers are Leaflet `CircleMarker`s, which are not focusable, so there
is no keyboard path to a country at all; and the lightest ramp step sits
**ΔE 5.6** from the no-data grey, meaning a country *with* a low measured value
and a country with *no data* look the same. That last one is not a cosmetic
issue: it is the project's central non-negotiable — never blur measured and
constructed — failing at the point of delivery. This spec makes the page usable
at 375px, reachable by keyboard, and readable when colour is unavailable or
unreliable, and it puts the parts that can be checked deterministically into
`npm run verify` so they stay fixed.

This spec **produces no new figures**. Every number it touches keeps the tier it
already carries in `global_labor.json` and `src/utils/laborMetrics.js`
(`TIERS`); the requirements below govern how that tier is *rendered and
announced*, and R4/R5 exist specifically because the current rendering lets
`OFFICIAL` and `PROXY` values become visually indistinguishable.

## Source verification

The "sources" for a UI spec are the app's own rendered output and the WCAG
thresholds it is measured against. Every row below was run on this branch
(2026-08-30), against `HEAD` of the worktree, with the exact scripts noted.

| Source | Probed | Result |
|---|---|---|
| Responsive utilities in `src/` | `grep -rnoE '\b(sm\|md\|lg\|xl\|2xl):'` over `src/`, 2026-08-30 | **One** occurrence in the whole app: `hidden sm:block` at `src/components/Header.jsx:7`. Nothing else has a breakpoint. |
| Layout arithmetic at 375px | Read `App.jsx`, `LaborPage.jsx:190`, `LaborSidebar.jsx:19`, `LaborDetailPanel.jsx:253,266` | Root is `h-screen w-screen overflow-hidden`. Sidebar `w-72` (288px) is `flex-shrink-0`; detail panel `w-96` (384px) always renders (a placeholder when nothing is selected). The map column is `flex-1 min-w-0` → at 375px it resolves to **0px**, and `overflow-hidden` means it cannot be scrolled to. |
| ARIA / landmarks / keyboard handlers | `grep -rn "aria-\|role=\|<main\|<nav\|sr-only\|focus-visible\|tabIndex\|onKeyDown" src/` | **Zero** matches across every component. No landmarks, no labels, no focus management, no key handlers. |
| Leaflet 1.9.4 keyboard support for vector markers | Read `node_modules/leaflet/dist/leaflet-src.js`; class boundaries via `grep -n` | `keyboard: true` (L7715) and `icon.tabIndex = '0'` (L7915) are inside **`Marker`** (L7701–8108). `CircleMarker` (L8253) extends `Path` (L8108), which sets no tabindex and has no keyboard option. The SVG renderer never makes a path focusable. `Map.Keyboard` (L13970) focuses the *container* — pan and zoom only. **A country marker cannot be tabbed to or activated by Enter. Confirmed, not assumed.** |
| WCAG contrast of tier badges | `scratchpad/contrast.mjs` — WCAG 2.x relative-luminance formula, badge bg composited from `${color}1a` over white | At 8–9px bold (WCAG "normal text", needs 4.5:1): OFFICIAL `#2f9e44` **3.08:1 FAIL**, PROXY `#e8590c` **3.16:1 FAIL**, DERIVED `#1971c2` **4.39:1 FAIL**, MODELED `#9c36b5` 5.02:1 pass. |
| WCAG contrast of body text | same script | `gray-400 #9ca3af` = **2.54:1 FAIL** (used for most 10px secondary text), `gray-300 #d1d5db` = **1.47:1 FAIL** (disabled play button). `gray-500 #6b7280` = 4.83:1 pass. |
| Ramp vs no-data separation | `scratchpad/cvd.mjs` — CIELAB ΔE76 + WCAG contrast | Lightest ramp step vs no-data `#dfe3e8`: BLUE **ΔE 5.6**, TEAL **ΔE 7.4**, HEAT ΔE 13.4; contrast 1.14–1.17:1. Below the ~10 ΔE legibility threshold **for normal colour vision**, at marker sizes of 3.5–26px. |
| Ramps under dichromacy | same script — Viénot LMS-plane simulation | Min adjacent-step ΔE: BLUE 11.3–13.9, HEAT 10.7–17.7, **TEAL 7.2 under protanopia** (8.6 deuteranopia). TEAL's steps collapse. |
| Tier colours under dichromacy | same script | **DERIVED vs MODELED = ΔE 9.8 under protanopia** (indistinguishable). OFFICIAL vs PROXY degrades from ΔE 106 to **17.8 under protanopia**. OFFICIAL vs DERIVED = **10.8 under tritanopia**. The badges' text labels currently carry this distinction alone. |
| axe-core under jsdom | `scratchpad/axe-probe.mjs`, axe-core 4.13.0 + jsdom 30.0.1, fixture reproducing the real failures | Structural rules resolve: `button-name`, `image-alt`, `region` all returned **violations** correctly. But `color-contrast` → **INCOMPLETE** (jsdom has no `getContext`, so axe cannot sample pixels) and `target-size` → **INAPPLICABLE — the rule did not run at all** (no layout boxes). **jsdom cannot check the two rules this issue is most about.** |
| Node test runner | `node -v`; `node --test --help` | Node **v24.19.0**, `node --test` built in. A JS test runner can be added with **no new runner dependency** — only `axe-core` and `jsdom`. |
| `verify` offline guarantee | Read `scripts/verify.sh`, `.github/workflows/ci.yml` | `verify` is explicitly designed to run in a fresh clone with no network; CI runs the same command and never has `pipeline/raw/`. Any new gate must hold that property — which rules out a Playwright browser download. See *Non-goals*. |
| Live render at 375×812 | Attempted 2026-08-30 via Chrome extension; dev server up (HTTP 200 on `:5173`) | **BLOCKED — the Claude-in-Chrome extension is not connected.** No requirement below depends on a spec-time browser observation; the browser check is instead an *acceptance criterion* (R11), which is what the issue's definition of done asks for anyway. |

## Requirements

### R1. [ ] The app is usable at 375px: bottom sheet over a full-bleed map

Below the `md` breakpoint, the sidebar and detail panel stop being fixed side
columns. The map fills the viewport; the metric picker and year control collapse
into a compact bar; the sidebar's controls and the selected country's detail
move into a bottom sheet with peek / half / full positions. Above `md` the
current three-column desktop layout is unchanged.

**Acceptance:** at a 375×812 viewport, `document.querySelector('.leaflet-container').getBoundingClientRect().width >= 320`
and `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal
page scroll). At 1440×900 the sidebar, map and detail panel are all present and
the layout is byte-identical in structure to today's. Both verified in a real
browser per R11.

### R2. [ ] Every country is reachable and selectable by keyboard

Probing proved `CircleMarker` cannot be focused, so the map alone can never
satisfy this. Provide a focusable, list-based path to the same state the map
sets: the ranked strip becomes a real listbox (or the country list in the sheet
does), each entry reachable by `Tab`/arrow keys and activated by `Enter`/`Space`,
setting the same `selected` state the marker click sets. Focus moves to the
detail panel on selection and is restored on close.

**Acceptance:** starting from a fresh load and using only `Tab`, `Shift+Tab`,
arrows, `Enter` and `Space`: the metric can be changed, a named country can be
selected, the year scrubber can be moved, and the detail panel can be opened and
closed. No control is reachable only by pointer. Every focused element shows a
visible focus indicator of at least 3:1 against its background — note
`LaborSidebar.jsx` currently sets `focus:outline-none` on the search input with
only a `border-gray-400` change, which does not meet that.

### R3. [ ] The map has a text equivalent that carries the numbers and their tiers

A choropleth conveys nothing to a screen reader. Provide a programmatically
associated text equivalent listing each rendered country with its value for the
active metric, its tier, and its no-data state where applicable. The map
container gets an accessible name describing what is plotted and how many
countries carry data.

**Acceptance:** with the map focused, a screen reader announces the metric, the
country count and the count with data. The text equivalent contains one entry
per country in `filtered`, each carrying country name, formatted value (or the
words "no data"), and the tier word. Asserted in the R9 test against rendered
output, and confirmed by listening in R11.

### R4. [ ] Tier badges pass AA and are announced, not just coloured

Three of four tier badges fail AA at their current size (3.08 / 3.16 / 4.39:1).
Replace the four `TIERS` colours with AA-passing variants and raise badge text
from 8–9px to at least 11px. Because `TIERS` is one shared table, this fixes
`LaborPage`, `LaborSidebar` and `LaborDetailPanel` at once. Each badge carries
accessible text so `MODELED` is never announced as a bare number — per the
issue, that is the misleading case.

**Acceptance:** the R9 test asserts every tier's foreground on its own badge
background is **≥ 4.5:1**, and that no badge renders below 11px. A number
carrying a tier is never announced without its tier word — checked by asserting
each badge element has non-empty accessible text adjacent to the value it
qualifies.

### R5. [ ] A country with no data is distinguishable from a country with a low value

This is the project's non-negotiable, and it currently fails for **everyone**:
the lightest BLUE step sits ΔE 5.6 and 1.14:1 from the no-data grey. Distinguish
no-data by something other than hue and lightness alone — a dashed or hatched
marker stroke, or an explicit shape difference — so the distinction survives
both a small marker and colour-blind vision. The legend gains the same
treatment; it already carries the words "no data — kept, never imputed", and
that wording stays.

**Acceptance:** no-data markers differ from every ramp step by a non-colour
channel that is present in the DOM and assertable (e.g. a `dashArray` or a
distinct class on the marker path). The R9 test asserts the chosen encoding is
applied to exactly the rows where the active metric's value is `null`, and to no
others. Confirmed visually under a deuteranopia simulation in R11.

### R6. [ ] Interactive targets meet 24×24px

The ranking-strip bars are `w-[9px]` (`LaborPage.jsx:231`) — their only label is
a `title` attribute, and at 9px they fail WCAG 2.5.8. The "Latest" button
(`px-2 py-0.5` at 11px ≈ 20px tall), the native checkboxes and the two range
thumbs are all under 24px. Raise every interactive target to at least 24×24 CSS
px on touch viewports, using spacing where the visual bar must stay thin.

**Acceptance:** at 375×812, every element matching
`button, a, input, [role="option"], [tabindex="0"]` has a bounding box of at
least 24×24px, or a 24px exclusion zone around it. Measured in R11, since the
probe showed axe's `target-size` rule cannot run under jsdom.

### R7. [ ] All text meets AA contrast

`gray-400 #9ca3af` at 2.54:1 is used for most 10px secondary text, and
`gray-300` at 1.47:1 for the disabled play button. Replace the greys used for
text with AA-passing values (`gray-500 #6b7280` at 4.83:1 already passes), and
raise the 7–10px text sizes that carry meaning.

**Acceptance:** the R9 test asserts every colour in the app's text palette is
≥ 4.5:1 against the background it is used on (≥ 3:1 where the rendered size
qualifies as large text). Disabled controls are exempt from the ratio but must
not be the only signal of their state.

### R8. [ ] Landmarks and accessible names across the app

There are currently zero ARIA attributes. Add document structure — a `main`
landmark, a `nav` or labelled region for the sidebar controls, a labelled region
for the detail panel — and an accessible name for every control that has none.
Metric, region and income buttons are toggles and get `aria-pressed`; the
detail panel announces the selected country when it opens.

**Acceptance:** `npm run verify` runs axe (R9) and reports **zero violations**
for `region`, `button-name`, `link-name`, `label`, `aria-*` and
`heading-order`. Heading levels descend without skipping from the `h1` in
`Header.jsx`.

### R9. [ ] `verify` and CI gain automated accessibility checks that run offline

Add a `node --test` suite — Node 24's built-in runner, so the only new
devDependencies are `axe-core` and `jsdom` — wired into `scripts/verify.sh` and
therefore into CI, which runs the same command. It has two parts, split because
the probe showed one tool cannot do both:

1. **Structural axe under jsdom** over the rendered app. The probe confirmed
   `button-name`, `image-alt` and `region` resolve correctly here.
2. **A dependency-free palette assertion** over `TIERS`, the three ramps and the
   text greys, computing WCAG ratios and CIELAB ΔE directly — this is what
   actually guards R4, R5 and R7, and it needs no browser at all.

The suite must not require network or a browser download, preserving the
property `scripts/verify.sh` and `ci.yml` both depend on.

**Acceptance:** `npm run verify` runs the new suite and exits non-zero when it
fails — demonstrated by temporarily reverting one tier colour to `#2f9e44` and
observing the failure. It passes in a fresh clone with no network and no
`pipeline/raw/`. The suite documents in a comment that `color-contrast` is
INCOMPLETE and `target-size` INAPPLICABLE under jsdom, and that R4–R7 are
therefore guarded by part 2 and by R11 rather than by axe.

### R10. [ ] The ramps survive colour-vision deficiency, or stop relying on colour alone

TEAL's adjacent steps fall to ΔE 7.2 under protanopia, and DERIVED vs MODELED
falls to ΔE 9.8 — the two tier colours become the same colour. Either adjust the
ramp and tier palettes so the minimum separation holds under all three
dichromacies, or ensure the distinction is carried by a redundant non-colour
channel. The tier badges already carry text labels, which is why this is a
degradation rather than a WCAG 1.4.1 failure today; the requirement is to keep
that redundancy and fix the palette where it is cheap to do so.

**Acceptance:** the R9 palette test asserts minimum adjacent-step ΔE ≥ 10 for
every ramp under normal, protanopia, deuteranopia and tritanopia simulation, and
minimum pairwise ΔE ≥ 10 between the four tier colours under the same four. Any
pair that cannot meet it is recorded in the spec as `[~]` with the redundant
channel that covers it instead.

### R11. [ ] Verified in a real browser, not inferred from a clean build

Per `CLAUDE.md`: a clean build is not evidence the page renders. Load the app at
**375×812** and **1440×900**, exercise keyboard-only navigation end to end,
listen to the detail panel and tier badges with a screen reader, and measure
touch targets and rendered contrast — the two things the jsdom probe proved axe
cannot check.

**Acceptance:** the browser console is clean at both viewports (no errors, no
React warnings). A short written record is appended to this spec covering: the
two viewports, keyboard-only reach of every control, the screen reader used and
what it announced for one `OFFICIAL` and one `MODELED` figure, measured
target sizes for the ranking strip and the "Latest" button, and a deuteranopia
check of the no-data encoding from R5.

## Non-goals

- **Playwright, Puppeteer, or any headless browser in `verify` or CI.**
  `scripts/verify.sh` and `ci.yml` are both built on `verify` running in a fresh
  clone with no network; a browser download breaks that, and spec 0004
  deliberately made the offline suite unconditional for the same reason. The
  real-layout checks stay manual under R11 and are recorded there.
- **Waiting on #22 (TypeScript), #23 (Next.js) or #24 (routes).** All three are
  open and unstarted; blocking on them leaves the site unusable on phones
  indefinitely. Responsive CSS and ARIA attributes survive those migrations
  largely intact.
- **A visual redesign.** The desktop layout above `md` is unchanged apart from
  the palette and type-size corrections R4, R7 and R10 require.
- **Changing any figure, tier, or the data pipeline.** This spec renders what
  the dataset already carries. No value, tier assignment or `data_quality_flag`
  changes.
- **Offline support, a service worker, or mobile performance work.** #26 covers
  per-route data; bundle size is not in scope here.
- **WCAG AAA.** The target is AA. Where AAA is free it is welcome, but no
  requirement is written against it.
