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
**ΔE00 3.7** from the no-data grey, meaning a country *with* a low measured value
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
| WCAG contrast of tier badges | `node scripts/palette-probe.mjs` §1 — WCAG 2.x relative luminance, badge bg composited from `${color}1a` over white | At 8–9px bold (WCAG "normal text", needs 4.5:1): OFFICIAL `#2f9e44` **3.08:1 FAIL**, PROXY `#e8590c` **3.16:1 FAIL**, DERIVED `#1971c2` **4.39:1 FAIL**, MODELED `#9c36b5` 5.02:1 pass. Independently reproduced by the reviewer of PR #55. |
| WCAG contrast of body text | `palette-probe.mjs` §2 | `gray-400 #9ca3af` = **2.54:1 FAIL** (used for most 10px secondary text), `gray-300 #d1d5db` = **1.47:1 FAIL** (disabled play button). `gray-500 #6b7280` = 4.83:1 pass. Independently reproduced. |
| Colour-vision **method** | `scripts/palette-probe.mjs`, committed — every free parameter pinned in code | Linear-light sRGB input; D65/2°; **CIEDE2000**; **Machado, Oliveira & Fernandes (2009)** IEEE TVCG 15(6) Table 1, severity-1.0 matrices. The first draft said "CIELAB ΔE76 + Viénot" and pinned none of the input space, white point, or tritanopia matrix — the reviewer of PR #55 re-ran it and got different vision attributions, correctly. Machado is used here because all three deficiencies come from one derivation (Viénot 1999 is validated only for protanopia and deuteranopia; its tritanopia is an extrapolation), and its matrices are published constants. **The numbers in the three rows below are from this pinned method and supersede the first draft's.** |
| Ramp vs no-data separation | `palette-probe.mjs` §4 | Lightest ramp step vs no-data `#dfe3e8`: **BLUE ΔE00 3.7**, **TEAL ΔE00 7.2** (falling to **3.7 under deuteranopia**), HEAT 11.2; WCAG contrast 1.14–1.17:1. Below any legibility threshold **for normal colour vision**, at marker sizes of 3.5–26px. This is the row R5 rests on, and it is starker than the first draft's ΔE76 figures suggested. |
| Ramps under dichromacy | `palette-probe.mjs` §3 and §7 | Min adjacent-step ΔE00, **worst case across the four visions** — the worst vision differs per ramp: BLUE **7.5** (protanopia), HEAT **7.7** (*deuteranopia*; its protanopia figure is 10.1), TEAL **4.3** (protanopia). So all three fall under 10 somewhere, not just TEAL — the first draft reported BLUE and HEAT as comfortable, an artefact of ΔE76. At normal vision the figures are BLUE 8.4, TEAL 8.8, HEAT 10.3, so HEAT alone clears a ≥ 10 floor there. **But** §7 shows every ramp stays **strictly monotonic in L\*** under all four visions, min step gap 6.3 — so the ramps still read as *ordered scales*, which is what a sequential ramp is for. R10 is written against that, not against adjacent-step ΔE. |
| Tier colours under dichromacy | `palette-probe.mjs` §5 | **DERIVED vs MODELED = ΔE00 2.4 under deuteranopia** (9.4 protanopia) — effectively the same colour. The first draft attributed this collapse to protanopia; the reviewer was right that it lands under deuteranopia. **OFFICIAL vs PROXY = ΔE00 10.7** (deuteranopia) / 11.1 (protanopia) — measured vs constructed, the pair that matters most, far closer than the first draft's 17.8. OFFICIAL vs DERIVED = 13.1 under tritanopia. The badges' text labels currently carry these distinctions alone. |
| axe-core over the **real app** under jsdom | `node scripts/render-probe.mjs`, committed — axe-core 4.13.0 + jsdom 30.0.1, full `App.jsx` tree | The whole tree mounts, map included: 146,996 chars, `.leaflet-container` present, 225 buttons, **0 aria attributes**. Two conditions make it work, both non-obvious: jsdom globals must exist **before** the first import (Leaflet dereferences `window` at module-evaluation time, `leaflet-src.js:230`), and the modules load through `vite.ssrLoadModule` (JSX + CSS + JSON). Results: `region` **23 violations**, `label` **2**, `heading-order` **1**; `button-name`, `link-name`, `image-alt` pass; `aria-allowed-attr` inapplicable (no ARIA exists yet). `color-contrast` → **INCOMPLETE** (no canvas). `target-size` → **reports `pass`, which is false** — jsdom has no layout, so there are no boxes to fail. A fixture returns INAPPLICABLE for that rule; the real tree returns a misleading green, which is worse. R9 disables it explicitly. |
| Node test runner and R9's dependency budget | `node -v`; `node --test --help`; `render-probe.mjs` | Node **v24.19.0**, `node --test` built in. Vite is already a devDependency and its SSR transform loads the app, so R9 adds **only `axe-core` and `jsdom`** — no test runner, no bundler, no browser. The budget the Non-goals argument rests on survives the render finding. |
| `verify` offline guarantee | Read `scripts/verify.sh`, `.github/workflows/ci.yml` | `verify` is explicitly designed to run in a fresh clone with no network; CI runs the same command and never has `pipeline/raw/`. Any new gate must hold that property — which rules out a Playwright browser download. See *Non-goals*. |
| Live render at 375×812 | Attempted 2026-08-30 via Chrome extension; dev server up (HTTP 200 on `:5173`) | **BLOCKED — the Claude-in-Chrome extension is not connected.** No requirement below depends on a spec-time browser observation; the browser check is instead an *acceptance criterion* (R11), which is what the issue's definition of done asks for anyway. |

## Requirements

### R1. [ ] The app is usable at 375px: bottom sheet over a full-bleed map

Below the `md` breakpoint, the sidebar and detail panel stop being fixed side
columns. The map fills the viewport; the metric picker and year control collapse
into a compact bar; the sidebar's controls and the selected country's detail
move into a bottom sheet with peek / half / full positions.

Above `md` the three-column desktop arrangement stays as it is. That is an
intent, not a criterion — R4, R7 and R10 change the palette and type sizes and
R8 adds landmarks and ARIA to this same tree, so the desktop markup necessarily
changes. What must not change is the *arrangement*: no column is removed,
reordered, or made narrower than it is today.

**Acceptance:** at a 375×812 viewport,
`document.querySelector('.leaflet-container').getBoundingClientRect().width >= 320`
and `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal
page scroll). At 1440×900: the sidebar, the map container and the detail panel
each have a non-zero width; they appear in that left-to-right order; and the map
container is **no narrower than the 1440×900 baseline recorded in R11 before any
change lands**. Both viewports verified in a real browser per R11.

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

Build the equivalent from a **pure function** — rows plus active metric in,
entries out — that the component renders. The assertion then needs no DOM, which
keeps it away from everything jsdom cannot do, and it stays true if the markup
is reworked later.

**Acceptance:** that function, given the `filtered` rows and a metric, returns
one entry per row, each carrying country name, formatted value (or the literal
words "no data") and the tier word — asserted directly, with no DOM. The
rendered tree wires it to the map container via `aria-describedby` (or an
equivalent association), asserted in the R9 render test. A screen reader
announcing the metric, the country count and the count with data is confirmed by
listening in R11.

### R4. [ ] Tier badges pass AA and are announced, not just coloured

Three of four tier badges fail AA at their current size (3.08 / 3.16 / 4.39:1).
Replace the four `TIERS` colours with AA-passing variants and raise badge text
from 8–9px to at least 11px. Because `TIERS` is one shared table, this fixes
`LaborPage`, `LaborSidebar` and `LaborDetailPanel` at once. Each badge carries
accessible text so `MODELED` is never announced as a bare number — per the
issue, that is the misleading case.

**Acceptance:** three checks, each attached to something that can actually run
it. (1) The R9 **palette** test asserts every tier's foreground on its own badge
background is **≥ 4.5:1** — pure arithmetic over `TIERS`, no DOM. (2) The R9
**render** test asserts every badge element has non-empty accessible text, so a
number carrying a tier is never announced without its tier word. (3) The
**rendered** badge size of ≥ 11px is measured in the browser under R11, not
asserted under jsdom — jsdom has no layout engine, which is the same reason the
probe found `target-size` unusable there. A test on the class or style string
would assert what the markup *says*, not what it renders, and would go stale the
moment a parent rule overrode it.

### R5. [ ] A country with no data is distinguishable from a country with a low value

This is the project's non-negotiable, and it currently fails for **everyone**:
the lightest BLUE step sits **ΔE00 3.7** and 1.14:1 from the no-data grey, and
TEAL falls to the same 3.7 under deuteranopia. Distinguish
no-data by something other than hue and lightness alone — a dashed or hatched
marker stroke, or an explicit shape difference — so the distinction survives
both a small marker and colour-blind vision. The legend gains the same
treatment; it already carries the words "no data — kept, never imputed", and
that wording stays.

**Acceptance:** no-data markers differ from every ramp step by a non-colour
channel (e.g. a `dashArray` or a distinct class on the marker path). The
decision is made by a **pure function** — row plus metric in, marker props out —
and the R9 test asserts, with no DOM, that the encoding is applied to exactly
the rows whose value for the active metric is `null` and to no others. Keeping
this off rendered output matters here specifically: the markers are Leaflet
paths, and asserting over them would couple the check to how Leaflet happens to
render inside jsdom. Confirmed visually under a deuteranopia simulation in R11.

### R6. [ ] Interactive targets meet 24×24px

The ranking-strip bars are `w-[9px]` (`LaborPage.jsx:231`) — their only label is
a `title` attribute, and at 9px they fail WCAG 2.5.8. The "Latest" button
(`px-2 py-0.5` at 11px ≈ 20px tall), the native checkboxes and the two range
thumbs are all under 24px. Raise every interactive target to at least 24×24 CSS
px on touch viewports, using spacing where the visual bar must stay thin.

**Acceptance:** at 375×812, every element matching
`button, a, input, [role="option"], [tabindex="0"]` has a bounding box of at
least 24×24px, or a 24px exclusion zone around it. Measured in R11, in a
browser. It cannot be measured under jsdom: the probe found axe's `target-size`
rule reports a **false `pass`** over the real tree, because there are no layout
boxes for it to fail, which is why R9 disables the rule outright.

### R7. [ ] All text meets AA contrast

`gray-400 #9ca3af` at 2.54:1 is used for most 10px secondary text, and
`gray-300` at 1.47:1 for the disabled play button. Replace the greys used for
text with AA-passing values (`gray-500 #6b7280` at 4.83:1 already passes), and
raise the 7–10px text sizes that carry meaning.

**This requirement also has to create the thing it checks.** Unlike `TIERS` —
one exported table at `src/utils/laborMetrics.js:7`, which is exactly why R4's
contrast check is cheap — the text greys are inline Tailwind classes scattered
across the components. There is no module to enumerate, and no record of which
background or rendered size each grey is used against, which the threshold
choice needs. Left as-is, the R9 test would become a hand-maintained list that
components are free to drift away from, and a `text-gray-400` added later would
pass a green suite — the exact failure this requirement exists to prevent. So
extract the text palette into one exported module the components consume, each
entry naming its colour, its intended background, and whether it is large text.

**The greys are not the whole problem.** Alongside them sit 17 non-grey text
utilities across five components, several at 8–10px on tinted backgrounds —
`text-amber-700` on `bg-amber-50` (`LaborDetailPanel.jsx:155,161`),
`text-orange-700` on `bg-orange-50` (`:400`), `text-blue-700` and
`text-purple-700` on their 100-weight backgrounds (`:279,284`),
`text-amber-800` on `bg-amber-100` (`:289`), `text-purple-700` at 8px and
`text-purple-800` on `bg-purple-100/60` at 9px (`ScenarioPanel.jsx:22,73`),
`text-blue-900` on `bg-blue-100` (`LaborSidebar.jsx:187,202`), `text-red-700` on
`bg-red-50` (`LaborTimeline.jsx:63`) — plus `text-gray-900` at `src/App.jsx:6`,
outside `src/components/` entirely. These are the same 10px-secondary-text
problem in a different colour family. They also make the extraction argument
stronger rather than weaker: the repo is on `tailwindcss ^4.2.2` with **no
`tailwind.config.*` and no `@theme` block**, so these resolve from Tailwind v4's
OKLCH default theme and their contrast ratios are not derivable from the class
name at all.

**Acceptance:** a single exported text-palette module exists and the components
take their text colours from it — asserted by `grep` over **`src/`** (not just
`src/components/`) finding no remaining `text-[a-z]+-[0-9]+`, `text-black`, or
arbitrary `text-[#…]` literals. The R9 palette test asserts every entry in that
export is ≥ 4.5:1 against its declared background, or ≥ 3:1 where it is declared
large. Two exclusions, named here rather than left to a pattern to drop
silently: `text-white` on the `bg-gray-800`/`bg-gray-900` active chips (six
sites — white on a near-black chip is the highest-contrast pairing in the app,
≈14.7:1 and ≈17.7:1 against the v3 reference hexes, and the v4 OKLCH values
cannot move that far), and disabled controls, which are exempt from the ratio
but must not use colour as the only signal of their state.

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
therefore into CI, which runs the same command. Three parts, split along the
lines the probes actually drew:

1. **Structural axe over the full rendered app.** `scripts/render-probe.mjs`
   confirmed the whole tree mounts under jsdom, map included, on two conditions
   that the suite must reproduce: jsdom globals installed **before** the first
   import (Leaflet dereferences `window` at module-evaluation time,
   `leaflet-src.js:230`), and modules loaded through `vite.ssrLoadModule` —
   Vite is already a devDependency, so this adds nothing. The baseline it must
   drive to zero is `region` 23, `label` 2, `heading-order` 1.
   **`target-size` must be explicitly disabled in the axe config**, with a
   comment saying why: over the real tree it reports `pass`, and that pass is
   false, because jsdom has no layout boxes to fail. A rule that returns a
   misleading green is worse than one that does not run, and R6 sends that check
   to R11 instead. `color-contrast` stays INCOMPLETE for the same class of
   reason (no canvas) and is guarded by part 2.
2. **A dependency-free palette assertion** over `TIERS`, the three ramps and
   R7's new text-palette export. `scripts/palette-probe.mjs` is already this
   code — it graduates into the test rather than being rewritten, so the numbers
   in the Source verification table and the numbers the gate enforces are
   produced by one implementation. It pins the algorithm (linear sRGB, D65,
   CIEDE2000, Machado 2009 severity 1.0) so R4, R5 and R10 have a defined unit.
   The script **exports** its functions and palette tables and guards its report
   behind `import.meta.main`, so the test imports them rather than re-deriving
   them — without that the "one implementation" property is a claim the next
   person has to re-establish, and re-derivation is exactly how the first
   draft's numbers drifted from anyone else's.
3. **Pure-function assertions** for R3's text equivalent and R5's marker
   encoding, needing no DOM at all.

The suite must not require network or a browser download, preserving the
property `scripts/verify.sh` and `ci.yml` both depend on.

**Acceptance:** `npm run verify` runs the new suite and exits non-zero when it
fails — demonstrated by temporarily reverting one tier colour to `#2f9e44` and
observing the failure. It passes in a fresh clone with no network and no
`pipeline/raw/`. `npm ls --depth=0` shows exactly two devDependencies added
beyond today's. The suite documents in a comment which axe rules are disabled or
INCOMPLETE under jsdom and where each is checked instead.

### R10. [ ] The ramps survive colour-vision deficiency, or stop relying on colour alone

Under the pinned algorithm, **DERIVED vs MODELED collapses to ΔE00 2.4 under
deuteranopia** — the two tier colours are the same colour, and that is the
project's measured-vs-constructed distinction disappearing. OFFICIAL vs PROXY,
the pair that matters most, sits at 10.7. Those must be fixed, and R4's recolour
is where it happens.

The ramps are a different case, and the first draft got the criterion wrong.
Adjacent-step ΔE00 falls under 10 for all three ramps somewhere across the four
visions, but that is what a *sequential* ramp looks like: it is read as an
ordered scale against a legend, not by discriminating neighbouring buckets.
Demanding ΔE ≥ 10 between adjacent steps would fail **two of the three ramps at
normal vision** — BLUE 8.4 and TEAL 8.8, with HEAT clearing it at 10.3 — and all
three once dichromacy is included, forcing a palette nobody asked for. What must
survive colour-vision deficiency is the **order**, and
§7 of the probe shows it does — every ramp is strictly monotonic in L\* under
all four visions, minimum step gap 6.3. So the ramp criterion guards that
property rather than inventing a new one, and the readable-value path is R3's
text equivalent, which does not depend on colour at all.

**Acceptance:** the R9 palette test, using the algorithm pinned in
`scripts/palette-probe.mjs`, asserts (1) minimum pairwise **ΔE00 ≥ 15** between
the four tier colours under normal, protanopia, deuteranopia and tritanopia —
currently 2.4, so this fails until R4 lands; and (2) every ramp is strictly
monotonic in L\* under all four visions with a minimum adjacent gap of **≥ 5**
— currently 6.3, so this passes today and guards against a regression. No
adjacent-step ΔE floor is asserted, for the reason above. Any pair that cannot
meet (1) is recorded as `[~]` with the redundant non-colour channel that covers
it instead.

### R11. [ ] Verified in a real browser, not inferred from a clean build

Per `CLAUDE.md`: a clean build is not evidence the page renders. Load the app at
**375×812** and **1440×900**, exercise keyboard-only navigation end to end,
listen to the detail panel and tier badges with a screen reader, and measure the
things that need a layout engine — rendered target sizes, rendered font sizes
and rendered contrast. The probes established that jsdom can check none of the
three, and that for `target-size` it will actively report a false pass.

**Record the 1440×900 baseline first**, before any change lands: R1's desktop
criterion is defined against the map container's width today, so it has to be
measured while "today" still exists.

**Acceptance:** the browser console is clean at both viewports (no errors, no
React warnings). A short written record is appended to this spec covering: the
pre-change 1440×900 map-container width that R1 compares against; the two
viewports after the change; keyboard-only reach of every control; the screen
reader used and what it announced for one `OFFICIAL` and one `MODELED` figure;
measured target sizes for the ranking strip and the "Latest" button; the
rendered badge font size from R4; and a deuteranopia check of the no-data
encoding from R5.

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
