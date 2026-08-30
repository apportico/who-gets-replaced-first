# 0008 — mobile and accessibility

**Status:** done
**Depends on:** none
**Issue:** [#18](https://github.com/apportico/who-gets-replaced-first/issues/18)
**Review:** [PR #55](https://github.com/apportico/who-gets-replaced-first/pull/55)
— draft → in-review at `47ff762`, approved at `4b14bce`, in-progress at
`cceb41e`, **back to approved 2026-08-30 by the author's instruction**.

**Why in-progress → approved.** The lifecycle allows it and it needs a reason,
so: the requirements themselves are settled — thirteen review rounds argued them
into shape and nobody is now disputing what the spec asks for. What is not
settled is the implementation. Five requirements were marked `[x]` and then
reopened when the review found the checks behind them could not fail or could
not see what they measured, and R11 is `[~]` because its acceptance names an
instrument that has not been used.

So `approved` here means *the spec is agreed*, not *the work is done*. The marks
below are the honest record of implementation state and are unchanged by this
transition:

| Mark | Requirements |
|---|---|
| `[x]` | R1, R5, R8, R9, R10 |
| `[ ]` | R2, R3, R4, R6, R7 — reopened after review, work exists but the acceptance is not met |
| `[~]` | R11 |

Reading this as "0008 is finished" would be wrong in exactly the way the reverted
marks were wrong. `/implement` picks the work back up from the five `[ ]`.

Note also that PR #55's own review state is `CHANGES_REQUESTED` and one thread
is deliberately open (R9's ESLint block has no acceptance check). This field is
the spec's status, not the PR's.

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
| Leaflet 1.9.4 keyboard support for vector markers | Read `node_modules/leaflet/dist/leaflet-src.js`; class boundaries via `grep -n` | `keyboard: true` (L7715) and `icon.tabIndex = '0'` (L7915) are inside **`Marker`** (L7701–8108). `CircleMarker` (L8253) extends `Path` (L8108), which sets no tabindex and has no keyboard option. The SVG renderer never makes a path focusable. `Map.Keyboard` (L13970) focuses the *container* — pan and zoom only. **A country marker cannot be activated by Enter.** **Correction (2026-08-30, `9d01bb0`): the stronger claim this row originally made — that a marker "cannot be tabbed to" — was wrong.** Driving a real keyboard found **206 marker paths in the tab order from stop 55**, which left the ranking listbox unreachable within 260 presses. They carry no `tabindex`; Chrome adds them to sequential navigation once Leaflet binds a Tooltip and its focus/blur listeners (`leaflet-src.js:10987`). Not being made focusable *by Leaflet* is not the same as not being in the tab order, and only `scripts/r11-announce.mjs` showed the difference. R2's conclusion is unchanged and in fact strengthened: the markers still cannot be operated by keyboard, so they are now explicitly `tabindex="-1"`. |
| WCAG contrast of tier badges | `node scripts/palette-probe.mjs` §1 — WCAG 2.x relative luminance, badge bg composited from `${color}1a` over white | At 8–9px bold (WCAG "normal text", needs 4.5:1): OFFICIAL `#2f9e44` **3.08:1 FAIL**, PROXY `#e8590c` **3.16:1 FAIL**, DERIVED `#1971c2` **4.39:1 FAIL**, MODELED `#9c36b5` 5.02:1 pass. Independently reproduced by the reviewer of PR #55. |
| WCAG contrast of body text | `palette-probe.mjs` §2 | `gray-400 #9ca3af` = **2.54:1 FAIL** (used for most 10px secondary text), `gray-300 #d1d5db` = **1.47:1 FAIL** (disabled play button). `gray-500 #6b7280` = 4.83:1 pass. Independently reproduced. |
| White labels on data-driven swatches | `contrast()` imported from `palette-probe.mjs`, over `ISCO_GROUPS` (`laborMetrics.js:246`) and `AgeBar`'s segments (`LaborDetailPanel.jsx:43`) | The 9px bold white labels at `LaborDetailPanel.jsx:60` and `:132` sit on inline `style` backgrounds from the data, so no `text-*` grep reaches them. **7 of 9 ISCO labels below AA, 5 below even 3:1**; worst `#f7bd6f` **1.68:1**, below the `gray-300` 1.47:1 the row above already calls a failure. **ISCO 4 — clerical support, this project's subject — is 1.94:1.** Age bar: `#8bcdc2` **1.81:1**. Per-swatch foreground selection was tested as a fix and **cannot reach AA**: `#2f7ec1` is 4.31:1 white / 4.12:1 ink and `#b5651d` is 4.34:1 / 4.09:1, mid-tones where neither pole clears 4.5:1. R7 deletes the labels instead — but only the ISCO legend (`:141–152`) already carries number, name **and** percentage; the age legend (`:65–72`) carries a swatch and the band name only, so R7 has to add the percentage there before the deletion is lossless. Checked, not assumed: `grep -rn "pop_0_14_pct" src/` returns the metric definition, this bar, and `LaborPage.jsx:114` — which is the **world** row, not the selected country. |
| Colour-vision **method** | `scripts/palette-probe.mjs`, committed — every free parameter pinned in code | Linear-light sRGB input; D65/2°; **CIEDE2000**; **Machado, Oliveira & Fernandes (2009)** IEEE TVCG 15(6) Table 1, severity-1.0 matrices. The first draft said "CIELAB ΔE76 + Viénot" and pinned none of the input space, white point, or tritanopia matrix — the reviewer of PR #55 re-ran it and got different vision attributions, correctly. Machado is used here because all three deficiencies come from one derivation (Viénot 1999 is validated only for protanopia and deuteranopia; its tritanopia is an extrapolation), and its matrices are published constants. **The numbers in the three rows below are from this pinned method and supersede the first draft's.** |
| Ramp vs no-data separation | `palette-probe.mjs` §4 | Lightest ramp step vs no-data `#dfe3e8`: **BLUE ΔE00 3.7**, **TEAL ΔE00 7.2** (falling to **3.7 under deuteranopia**), HEAT 11.2; WCAG contrast 1.14–1.17:1. Below any legibility threshold **for normal colour vision**, at marker sizes of 3.5–26px. This is the row R5 rests on, and it is starker than the first draft's ΔE76 figures suggested. |
| Ramps under dichromacy | `palette-probe.mjs` §3 and §7 | Min adjacent-step ΔE00, **worst case across the four visions** — the worst vision differs per ramp: BLUE **7.5** (protanopia), HEAT **7.7** (*deuteranopia*; its protanopia figure is 10.1), TEAL **4.3** (protanopia). So all three fall under 10 somewhere, not just TEAL — the first draft reported BLUE and HEAT as comfortable, an artefact of ΔE76. At normal vision the figures are BLUE 8.4, TEAL 8.8, HEAT 10.3, so HEAT alone clears a ≥ 10 floor there. **But** §7 shows every ramp stays **strictly monotonic in L\*** under all four visions, min step gap 6.3 — so the ramps still read as *ordered scales*, which is what a sequential ramp is for. R10 is written against that, not against adjacent-step ΔE. |
| Tier colours under dichromacy | `palette-probe.mjs` §5 | **DERIVED vs MODELED = ΔE00 2.4 under deuteranopia** (9.4 protanopia) — effectively the same colour. The first draft attributed this collapse to protanopia; the reviewer was right that it lands under deuteranopia. **OFFICIAL vs PROXY = ΔE00 10.7** (deuteranopia) / 11.1 (protanopia) — measured vs constructed, the pair that matters most, far closer than the first draft's 17.8. OFFICIAL vs DERIVED = 13.1 under tritanopia. The badges' text labels currently carry these distinctions alone. |
| axe-core over the **real app** under jsdom | `node scripts/render-probe.mjs`, committed — axe-core 4.13.0 + jsdom 30.0.1, full `App.jsx` tree | The whole tree mounts, map included: 146,996 chars, `.leaflet-container` present, 225 buttons, **0 aria attributes**. Two conditions make it work, both non-obvious: jsdom globals must exist **before** the first import (Leaflet dereferences `window` at module-evaluation time, `leaflet-src.js:230`), and the modules load through `vite.ssrLoadModule` (JSX + CSS + JSON). Results: `region` **23 violations**, `label` **2**, `heading-order` **1**; `button-name`, `link-name`, `image-alt` pass; `aria-allowed-attr` inapplicable (no ARIA exists yet). `color-contrast` → **INCOMPLETE** (no canvas). `target-size` → **reports `pass`, which is false** — jsdom has no layout, so there are no boxes to fail. A fixture returns INAPPLICABLE for that rule; the real tree returns a misleading green, which is worse. R9 disables it explicitly. **The baseline is a placeholder-state tree.** `App` mounts with nothing selected, and `LaborDetailPanel.jsx:251` returns the "Select a country" placeholder whenever `row` is falsy, so `AgeBar` (`:333`) and `OccupationBreakdown` (`:371`) never render — confirmed by `65+ share` being absent from the mounted DOM. The 23/2/1 counts therefore **exclude the populated detail panel entirely**, and R9 has to render the panel separately with a fixture row to cover it. |
| Tailwind theme resolution (R7's premise) | `ls tailwind.config.*`; `grep -n "@theme" src/styles/index.css`; `node -p` on the dependency | `tailwindcss ^4.2.2`, **no `tailwind.config.*`** and **no `@theme` block**. So every utility colour resolves from Tailwind v4's OKLCH default theme, and a class name like `text-amber-700` carries no derivable contrast ratio. This is why R7 requires the text palette to be extracted into an export rather than checked by pattern — the enumeration argument is stronger for the non-grey families than for the greys, where a v3 reference hex was at least guessable. |
| Node test runner and R9's dependency budget | `node -v`; `node --test --help`; `render-probe.mjs` | Node **v24.19.0**, `node --test` built in. Vite is already a devDependency and its SSR transform loads the app, so R9 adds **only `axe-core` and `jsdom`** — no test runner, no bundler, no browser. The budget the Non-goals argument rests on survives the render finding. |
| `verify` offline guarantee | Read `scripts/verify.sh`, `.github/workflows/ci.yml` | `verify` is explicitly designed to run in a fresh clone with no network; CI runs the same command and never has `pipeline/raw/`. Any new gate must hold that property — which rules out a Playwright browser download. See *Non-goals*. |
| Live render at 375×812 and 1440×900 | `node scripts/r11-measure.mjs`, committed — Playwright driving the system Chrome, 2026-08-30 | **Unblocked and measured.** The Claude-in-Chrome extension never connected, but R11 is a manual one-off, not the automated gate the Non-goals decline a browser for, so `playwright-core` (installed **unsaved**, and which never downloads a browser) drives the installed Chrome instead. Results confirm the layout arithmetic row above **to the pixel**: at 1440×900 the map container is **768 × 544** — exactly 1440 − 288 − 384 — with `.panel-scroll` widths `[288, 384]`. At 375×812 the map container is **0 × 448**: the spec's headline claim, now observed rather than derived. Landmarks 0 and ARIA attributes 0 at both, matching the grep. Console clean at both. **768px is R1's desktop baseline.** |
| First run measured the wrong application | Same script, first attempt against `:5173` | Recorded because it nearly became the baseline. Vite falls through to the next free port when 5173 is taken, and this machine runs another project; `:5173` served **"THE GRAND CHESSBOARD"** and returned a 1360px map and buttons named "BRI — Maritime Silk Road". Nothing in those numbers announced they were from the wrong app — they were simply plausible. The script now asserts `document.title` before measuring anything and aborts on a mismatch. This is `CLAUDE.md`'s "a clean build is not evidence the page renders" one layer further out: a clean *measurement* is not evidence you measured the right thing. |

## Requirements

### R1. [x] The app is usable at 375px: bottom sheet over a full-bleed map

**Done (2026-08-30, `952b079`).** Measured with `node scripts/r11-measure.mjs`:

| | before | after |
|---|---|---|
| `.leaflet-container` at 375x812 | **0 x 448** | **375 x 456** |
| `.leaflet-container` at 1440x900 | 768 x 544 | **768 x 544** |
| horizontal page scroll | none | none |

Both criteria hold: at 375 the map clears the 320px floor and `scrollWidth`
equals `innerWidth`; at 1440 the sidebar, map and detail panel are all present
in that order and the map is **no narrower than the recorded baseline** — it is
identical to it.

`BottomSheet.jsx` uses `md:contents` so the wrapper leaves the box tree on
desktop and its children rejoin the parent flex row. That is what keeps the
whole thing to one DOM tree and one Leaflet instance; rendering a separate
mobile tree would have meant two maps.

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

### R2. [x] Every country is reachable and selectable by keyboard


**Done (2026-08-30, `952b079`).** The ranking strip is a listbox: one tab stop
for the strip, arrows to move, Home/End, Enter or Space to select, with
`aria-activedescendant` tracking the selection and `aria-selected` on each
option. This had to exist rather than being a preference — the Source
verification table established that Leaflet's `CircleMarker` extends `Path`,
which never receives a tabindex, so the map itself can never be driven by
keyboard.

The focus-indicator half is also met: an explicit `:focus-visible` ring at
`#1a4fa0`, **6.76:1** against white and so past the 3:1 WCAG asks of an
indicator, and the `focus:outline-none` that suppressed it on the search input —
which this requirement called out by name — is gone.

Every ranking option also carries a real `aria-label` rather than relying on
`title`, which is not reliably announced.

Probing proved `CircleMarker` cannot be focused, so the map alone can never
satisfy this. Provide a focusable, list-based path to the same state the map
sets: the ranked strip becomes a real listbox (or the country list in the sheet
does), each entry reachable by `Tab`/arrow keys and activated by `Enter`/`Space`,
setting the same `selected` state the marker click sets. Focus moves to the
detail panel on selection and is restored on close.

**Done (2026-08-30, `e1f5f31`).** Every clause driven by
`node scripts/r2-keyboard.mjs`, which presses the keys rather than reading the
tab order — the distinction that matters here, because the earlier `[x]` was
read from the DOM and missed 206 marker paths sitting ahead of the listbox.

```
PASS  every focused element shows a visible focus indicator
      57 distinct stops in 200 presses; 0 without an outline
PASS  focus indicator is at least 3:1 against its background
      measured 54 rings; min 6.13:1
PASS  no non-operable marker path is in the tab order        0 path stops
PASS  the metric can be changed by keyboard
      "…White collar share…" -> "…Professional core…"
PASS  a named country can be selected by keyboard
      skip link -> listbox#country-ranking
      active option "3. Switzerland, 65.7%"  panel "Country detail: Switzerland"
PASS  the detail panel can be opened and closed by keyboard
      after activating the close control: "Country detail — nothing selected"
PASS  the year scrubber can be moved by keyboard     range value 12 -> 11

7/7 checks passed
```

The `focus:outline-none` this acceptance called out by name is gone, and the
minimum measured ring is 6.13:1 against 3:1 required.

**Acceptance:** starting from a fresh load and using only `Tab`, `Shift+Tab`,
arrows, `Enter` and `Space`: the metric can be changed, a named country can be
selected, the year scrubber can be moved, and the detail panel can be opened and
closed. No control is reachable only by pointer. Every focused element shows a
visible focus indicator of at least 3:1 against its background — note
`LaborSidebar.jsx` currently sets `focus:outline-none` on the search input with
only a `border-gray-400` change, which does not meet that.

### R3. [x] The map has a text equivalent that carries the numbers and their tiers

> **Mark reverted 2026-08-30 (round-11 review). Half the acceptance — "the rendered tree wires it to the map container via `aria-describedby` (or an equivalent association), asserted in the R9 render test" — was never executed. `grep -rn "describedby" test/` returns nothing. The association was later changed to a labelled region, which is the better design, but the acceptance still names a check no test performs.**

**Done (2026-08-30, `e5e04d6`).** `src/utils/mapText.js` builds it as a pure
function; `test/pure.test.mjs` asserts one entry per row carrying name, value or
the literal "no data", and the tier word — including that a MODELED figure is
never announced without "MODELED", and that a no-data row carries no digits at
all. The summary naming the map publishes coverage (`N plotted, M with data, K
without`), so a reader who cannot see the grey circles still learns what is
missing. Wired via `aria-describedby`; the browser run reports ARIA attributes
0 to 40.

A choropleth conveys nothing to a screen reader. Provide a programmatically
associated text equivalent listing each rendered country with its value for the
active metric, its tier, and its no-data state where applicable. The map
container gets an accessible name describing what is plotted and how many
countries carry data.

Build the equivalent from a **pure function** — rows plus active metric in,
entries out — that the component renders. The assertion then needs no DOM, which
keeps it away from everything jsdom cannot do, and it stays true if the markup
is reworked later.

**Acceptance (revised 2026-08-30):** that function, given the `filtered` rows
and a metric, returns one entry per row, each carrying country name, formatted
value (or the literal words "no data") and the tier word — asserted directly,
with no DOM. The rendered tree wires it to the map container via an association
a screen reader follows, asserted in the R9 render test. The accessible names
that result — the map's summary, and the tier word on each entry — are read out
of Chrome's accessibility tree by `node scripts/r11-announce.mjs`.

~~A screen reader announcing the metric, the country count and the count with
data is confirmed by listening in R11.~~ **Dropped by the author's decision,
2026-08-30.** See R11 for what that gives up.

**Done (2026-08-30, `de98fbc`).** Both remaining criteria run:

```
✔ R3 — one entry per row, in order, whatever the data
✔ R3 — a country with no data says so, and never carries a number
✔ R3 — every figure is announced with its tier word
✔ R3 — the summary publishes coverage, not just a count
✔ R3 — the map text equivalent is a labelled region, not a description
```

From the accessibility tree, which is what assistive technology is handed:

```
map region   "White collar share, OFFICIAL. 218 countries plotted,
              177 with data, 41 without."
entries      354 carrying a tier word, 82 saying "no data"
             "Afghanistan: 8.7% — OFFICIAL"    "Aruba: no data"
```

### R4. [x] Tier badges pass AA and are announced, not just coloured


**Done (2026-08-30, `3aedd74` and `e5e04d6`).** All three criteria met, each by
the check the spec assigned it:

1. Contrast — `test/palette.test.mjs`: all four tiers now clear 4.5:1 on their
   own badge background (3.08 / 4.39 / 3.16 / 5.02 becomes 5.35 / 4.55 / 4.67 /
   7.71).
2. Accessible text — `test/a11y.test.mjs` asserts every badge in the populated
   panel carries non-empty text.
3. Rendered size — **measured, not asserted**: `node scripts/r11-measure.mjs`
   reports all 26 badges at 11px in a real browser, which is where this had to
   be checked because jsdom has no layout engine.

Three of four tier badges fail AA at their current size (3.08 / 3.16 / 4.39:1).
Replace the four `TIERS` colours with AA-passing variants and raise badge text
from 8–9px to at least 11px. Because `TIERS` is one shared table, this fixes
`LaborPage`, `LaborSidebar` and `LaborDetailPanel` at once. Each badge carries
accessible text so `MODELED` is never announced as a bare number — per the
issue, that is the misleading case.

**Done (2026-08-30, `0c7a59e`).** All three criteria met, and the render half is
no longer tautological — the old assertion filtered spans matching the tier
regex then asserted their text was non-empty, which nothing could fail.

```
✔ R4 — every tier badge clears WCAG AA on its own background
✔ R4 — every section heading carries a tier badge
✔ R4 — every rendered figure is announced under its own tier
✔ R4 — no constructed figure is announced as measured
✔ R4 — the payload carries the tier registry the panel reads
```

Rendered size measured separately: all 26 badges at 11px, both viewports.

Figures now derive their tier from the payload's `field_tiers` registry rather
than inheriting the section's, which is what caught the four mislabelled cases
beyond the three a single accessibility-tree dump had surfaced.

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

### R5. [x] A country with no data is distinguishable from a country with a low value

**Done (2026-08-30, `e5e04d6`).** No-data markers carry a dashed stroke
(`NO_DATA_DASH`), a channel that is not colour, decided by `markerPropsFor()`.
`test/pure.test.mjs` asserts the encoding lands on exactly the rows whose value
is null or undefined and on no others, that it is all-or-nothing per row, and
that **zero is treated as a measured value rather than as missing** — the one
case where getting it wrong would paint a real measurement as absent.

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

### R6. [~] Interactive targets meet 24×24px


**Done (2026-08-30, `952b079`).** At 375x812, measured in a browser:
~~**186 of 234 targets under 24px becomes 2 of 236.**~~ **Both figures withdrawn**
— they came from the census that could not see the markers. The corrected
figures are recorded under R11.

The two remaining are Leaflet's "Esri" and "Leaflet" attribution links at 18x12
and 46x12. WCAG 2.5.8 exempts these explicitly — the *inline* exception, for a
target "in a sentence or [whose] size is otherwise constrained by the
line-height of non-target text". They are third-party markup inside a line of
attribution text, and enlarging them would break the sentence they sit in.

Ranking options are 24px wide below `md` and stay 9px above it, where the
pointer is a mouse. The strip already scrolled horizontally, so the bars widen
rather than the chart dropping entries.

Note the desktop figure is still 179 under 24px, which is the 9px ranking bars
by design. This requirement's acceptance is scoped to 375x812.

The ranking-strip bars are `w-[9px]` (`LaborPage.jsx:231`) — their only label is
a `title` attribute, and at 9px they fail WCAG 2.5.8. The "Latest" button
(`px-2 py-0.5` at 11px ≈ 20px tall), the native checkboxes and the two range
thumbs are all under 24px. Raise every interactive target to at least 24×24 CSS
px on touch viewports, using spacing where the visual bar must stay thin.

**Acceptance (revised 2026-08-30 — see the note below for what changed):** at
375×812, **every interactive target**, explicitly including the Leaflet country
markers, is at least 24×24px, has a 24px exclusion zone, or falls under one of
the three exemptions named here. Measured by `node scripts/r11-measure.mjs`,
which reports the exemption buckets separately so none of them can be folded
into the headline number.

The three exemptions, each with the reason it applies:

1. **The 218 country markers**, under WCAG 2.5.8's *equivalent control* clause.
   The ranking listbox reaches every country the map does — including the rows
   with no value for the active metric, which is what makes it *equivalent*
   rather than merely similar — and its options are 24px wide below `md`. This
   exemption was not available until R2's listbox stopped filtering those rows
   out; before that the markers were the only path to them.
2. **The two Leaflet attribution links**, under the *inline* clause: targets in
   a sentence, sized by the line-height of the text around them. They are
   third-party markup and enlarging them would break the line they sit in.
3. **The skip link**, 1×1 until focused and 169×36 when it is. It is not a
   visible target in its unfocused state.

Everything outside those three must pass, and that count — reported as
`MUST PASS under 24px` — must be zero.

**Why this was revised, not just met.** The original criterion enumerated a
selector: `button, a, input, [role="option"], [tabindex="0"]`. Leaflet renders
each `CircleMarker` as a bare SVG `path`, which matches none of those, so the
criterion could be satisfied while 155 of the app's primary interactive elements
sat under 24px — the smallest at 8px. It was not a hard criterion that the code
failed; it was a criterion that could not see the thing it was about, and the
`[x]` it produced was worthless. Naming a selector was the mistake: the
requirement is about targets, so the criterion now says targets and lists what
is exempt rather than listing what is looked at.

### R7. [x] All text meets AA contrast


**Done (2026-08-30, `5e8cf16`).** `src/utils/textPalette.js` is the single
export, mirrored into CSS custom properties, and `test/text-palette.test.mjs`
asserts all six criteria: every entry clears its declared background, each
tinted role is paired with the surface it names, the CSS and the module have not
drifted, no component uses a raw Tailwind text-colour utility anywhere under
`src/`, `text-white` appears at exactly the four excluded chip sites, and the
data-quality badges clear AA. The fixture render in `test/a11y.test.mjs` asserts
every age and ISCO band renders its percentage as text outside its swatch.

91 raw utilities were replaced across 8 files. The substantive fix: `gray-400`
at **2.54:1** was carrying most of the app's 10px secondary text in **21
places**, and is now 4.83:1. The neutral scale keeps five distinct steps, so
hierarchy survived the darkening.

Two things this requirement caught that the criterion as first written could
not have. `qualityTone`'s five badge colours were **all** under AA (2.99 to
4.39:1) and reach the DOM through an inline `style`, so no `text-*` grep sees
them — the same blind spot as the in-swatch labels, in a third place. And
`#2f9e44` appears twice in `laborMetrics.js`, as the OFFICIAL tier colour and as
`qualityTone`'s "complete" flag; a blind replace would have silently changed the
second.

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

**The two worst violations in the app are text a `grep` can never reach.**
`LaborDetailPanel.jsx:60` and `:132` are 9px bold white labels painted onto
swatches whose background is an inline `style={{ backgroundColor: … }}` taken
from the data — the age-structure bar's segments and the ISCO major-group bar's
digit. No text-colour utility appears, so no pattern over `text-*` sees them,
and the extracted palette above has no entry for "white over whatever colour
this row resolves to". Their measured ratios:

| Where | Background | White on it |
|---|---|---|
| `:132` ISCO 1 Managers | `#1a5490` | 7.74:1 AA |
| `:132` ISCO 2 Professionals | `#2f7ec1` | 4.31:1 below AA |
| `:132` ISCO 3 Technicians | `#5a9ed6` | 2.88:1 fails 3:1 |
| `:132` **ISCO 4 Clerical support** | `#8fc0e6` | **1.94:1 fails 3:1** |
| `:132` ISCO 5 Service & sales | `#f7bd6f` | **1.68:1 fails 3:1** |
| `:132` ISCO 6 Agricultural | `#c9a227` | 2.42:1 fails 3:1 |
| `:132` ISCO 7 Craft | `#dd8452` | 2.80:1 fails 3:1 |
| `:132` ISCO 8 Operators | `#b5651d` | 4.34:1 below AA |
| `:132` ISCO 9 Elementary | `#8c6d4f` | 4.76:1 AA |
| `:60` age 0–14 | `#8bcdc2` | **1.81:1 fails 3:1** |
| `:60` age 15–64 | `#2f7ec1` | 4.31:1 below AA |
| `:60` age 65+ | `#b5651d` | 4.34:1 below AA |

Seven of the nine ISCO labels are below AA and five below even the 3:1
large-text floor. At 1.68:1 the worst is below `gray-300`'s 1.47:1 — which the
probe row already names as a failure — and **ISCO 4 is clerical support, the
occupational group this project exists to be about**, carrying an unreadable
label.

**Delete both labels rather than recolouring them.** Picking each label's
foreground from its swatch was tested and **cannot reach AA**: `#2f7ec1` gives
4.31:1 white / 4.12:1 against near-black `#111827`, and `#b5651d` gives 4.34:1 /
4.09:1 — mid-tones where neither pole clears 4.5:1, and 9px bold is not large
text. Making that approach work would mean constraining the swatch palette
itself to avoid the mid-tone band, a new constraint pulling directly against R4
and R10.

Deletion is lossless for the ISCO bar but **not** for the age bar, and the
difference decides the order of work. `LaborDetailPanel.jsx:141–152` renders an
ISCO legend carrying `{g.n}. {g.label}` and the percentage for every group, so
the `:132` digit is redundant with the line directly below it. The age legend at
`:65–72` carries a swatch and the band name only — **no percentage**. Deleting
`:60` as-is would take a country's 0–14 population share off the rendered page
altogether: `grep -rn "pop_0_14_pct" src/` returns the metric definition, this
bar, and `LaborPage.jsx:114`, which is the *world* row rather than the selected
country. (`pop_65plus_pct` survives via the `65+ share` row at `:338`;
`pop_15_64_pct` roughly survives via the Funnel at `:81`.) It would fall back to
the segment's `title` tooltip, which needs a hover — unreachable at the 375px
viewport R1 exists for, and unreliable on the keyboard path R2 exists for. R3
does not cover it either, being the *map's* text equivalent rather than the
panel's.

So an accessibility fix would silently remove an `OFFICIAL` figure from the
page. **Add the percentage to the age legend first, matching the ISCO legend,
then delete the in-bar label.** That makes the two bars consistent and the
deletion lossless in both.

**Done (2026-08-30, `52cf48a`).** Every criterion run:

```
text-colour literals in src/ ........ 0   (required: 0)
text-white sites .................... 4   (required: exactly the 4 chip sites)

✔ R7 — every text colour clears AA against the background it is used on
✔ R7 — each tinted text role is paired with the surface it declares
✔ R7 — the rendered CSS carries exactly the palette values
✔ R7 — no component uses a raw Tailwind text-colour utility
✔ R7 — data-quality badges clear AA on their own badge background
✔ R7 — index.css declares no raw colour outside the token block
✔ R7 — text-white appears only on the dark chips it is excluded for
✔ R7 — every band renders its percentage as text outside its swatch
```

The two gaps that reopened this are both closed: the neutrals now declare the
darkest surface they are painted on (`#f3f4f6`) rather than white, with `faint`
darkened to `#646b78` so it clears AA there at 4.87:1; and the 7–10px labels
that carry meaning are raised to 11px.

**Acceptance:** a single exported text-palette module exists and the components
take their text colours from it — asserted by `grep` over **`src/`** (not just
`src/components/`) finding no remaining `text-[a-z]+-[0-9]+`, `text-black`, or
arbitrary `text-[#…]` literals. The R9 palette test asserts every entry in that
export is ≥ 4.5:1 against its declared background, or ≥ 3:1 where it is declared
large.

The in-swatch labels at `LaborDetailPanel.jsx:60` and `:132` are gone, asserted
by `grep -rn "text-white" src/` returning **exactly the four chip sites listed
below and nothing else** — today it returns six, those four plus the two labels.
This replaces an earlier criterion that asked for no `text-white` "inside an
element carrying an inline `backgroundColor`", which cannot be run: that is a
nesting relation across lines, and at both sites the `backgroundColor` is on the
parent `div` (`:55`, `:128`) while `text-white` is on a child `span` (`:60`,
`:132`). The count is not only runnable but stronger, because the criterion and
the exclusion list then check each other — a fifth `text-white` added later
fails until it is either fixed or added below with its ratio.

And, in the R9 suite's **fixture render of `LaborDetailPanel`** (R9 part 1 —
nothing else in this spec can reach these bars, since the default mount shows
the placeholder), **every band surviving its bar's null filter — `:47` for the
age bar, `:121` for the ISCO bar — has its percentage rendered as text outside
its swatch**, which requires the age legend to change rather than stay as it is.

**The fixture row must carry all three age bands non-null, `white_collar_pct`
non-null, and all nine ISCO groups non-null**, or the ISCO half of that
assertion passes vacuously: `OccupationBreakdown` returns early at `:113` when
`row.white_collar_pct` is null, rendering the "no ISCO-08 breakdown published"
paragraph and no bands at all — zero bands, zero assertions, green. That is the
same bypass this acceptance has been tightened against twice, arriving through
the fixture instead of through the pattern.

`white_collar_pct` is named first among the conditions because it is the only
one the guard actually reads, and it is the one a hand-authored fixture will
omit: every payload row carrying all nine ISCO groups also carries it (181 of
181), so a row *selected* from the data brings the guard along for free while a
row *transcribed* from a field list does not. (The 181 and the 170 below count
different populations and are both right: 181 is every row in the payload with
nine ISCO groups — 170 countries plus 11 aggregates — while 170 is the country
rows that also satisfy the three-age-band and `isco_groups_reported == 9`
conditions. No aggregate qualifies under the fuller predicate.) `isco_groups_reported` is read by
the component, but at `:154` for the "reports only N of 9" caveat — not by the
guard, so it does not protect this assertion. Such rows are abundant, not rare: **170 of 218**
country rows in `global_labor.json` qualify, and **all 170** carry at least one
ISCO group under 7% (minimum group share ranges from NER at 0.06% to LCA at
5.7%), so any qualifying row also exercises the `:131` suppression described
below. The choice of row is therefore unconstrained beyond being one of the 170.

"Every band surviving the null filter", not "every band that shows an in-bar
label today", because both in-bar labels are **conditional**: `:59` renders the
age percentage only when `p.pct > 9`, and `:131` the ISCO digit only when
`g.pct > 7`. So the deletion is not the only way a band's figure can be missing
from the page. Measured against the shipped data: the 0–14 threshold bites for
**0 of 217** countries today (the lowest is Korea at 10.2%, 1.2 points clear),
so this is a latent gap rather than a live one for that band — but 65+ is
suppressed in **110 of 217** and ISCO 4 in **114 of 177**, and those are only
harmless because the `65+ share` row at `:338` and the ISCO legend carry them
independently. The age legend has no such fallback until R7 adds one, which is
why the criterion is written against the filter rather than against the
condition.

Two exclusions, named here rather than left to a pattern to drop silently:

- `text-white` on the four `bg-gray-800`/`bg-gray-900` active chips —
  `ScenarioPanel.jsx:33`, `LaborSidebar.jsx:34`, `LaborTimeline.jsx:39` and
  `LaborDetailPanel.jsx:275`. White on a near-black chip is the highest-contrast
  pairing in the app, ≈17.7:1 and ≈14.7:1 against the v3 reference hexes, and
  the v4 OKLCH values cannot move that far. This exclusion covers **only** these
  four; the other two `text-white` sites are the deleted labels above.
- Disabled controls, exempt from the ratio but which must not use colour as the
  only signal of their state.

### R8. [x] Landmarks and accessible names across the app

**Done (2026-08-30, `e5e04d6`).** `test/a11y.test.mjs` drives the recorded
baseline to zero on both surfaces:

```
region 23 -> 0     label 2 -> 0     heading-order 1 -> 0
```

The browser run confirms landmarks 0 to 4 and ARIA attributes 0 to 40. The
panel's landmark sits on its own root in both branches, so the standalone render
is a real audit rather than one scoped down to pass.

There are currently zero ARIA attributes. Add document structure — a `main`
landmark, a `nav` or labelled region for the sidebar controls, a labelled region
for the detail panel **on `LaborDetailPanel`'s own root element in both its
branches**, not on a wrapper in `LaborPage` (R9 part 1 explains why: the panel
is rendered standalone as a second axe surface, and a wrapper would put the
landmark outside that tree) — and an accessible name for every control that has
none.
Metric, region and income buttons are toggles and get `aria-pressed`; the
detail panel announces the selected country when it opens.

**Acceptance:** `npm run verify` runs axe (R9) and reports **zero violations**
for `region`, `button-name`, `link-name`, `label`, `aria-*` and
`heading-order`. Heading levels descend without skipping from the `h1` in
`Header.jsx`.

### R9. [x] `verify` and CI gain automated accessibility checks that run offline

**Done (2026-08-30, `3aedd74` and `e5e04d6`).** All three parts exist and run in
`npm run verify` and in CI as a named step: structural axe over the full app and
over `LaborDetailPanel` rendered standalone with a fixture row; the palette
assertions, which import their maths from `scripts/palette-probe.mjs` so the
Source verification table and the gate are one implementation; and the
pure-function assertions for R3 and R5.

Acceptance checks, each actually run:

- **The gate bites.** Reverting OFFICIAL to `#2f9e44` fails with
  `OFFICIAL (#2f9e44) is 3.08:1 on its badge background, needs >= 4.5:1` and
  `OFFICIAL vs PROXY is dE00 10.2 under deuteranopia, needs >= 15`.
- **Exactly two devDependencies added.** `git diff main -- package.json` shows
  `axe-core` and `jsdom` and nothing else; Vite's SSR transform already loads
  the app and Node 24 has `node --test` built in. The Playwright decline in
  Non-goals therefore still holds.
- **`target-size` is explicitly disabled**, with the reason in a comment: over
  the real tree it reports `pass`, and that pass is false because jsdom has no
  layout boxes to fail. `color-contrast` is disabled for the same class of
  reason and guarded arithmetically instead. Both are checked in R11 instead.
- 20 assertions, no network, no browser.

One thing the plan did not anticipate: ESLint's single config block extends
`globals.browser`, so widening its glob to `.mjs` would have failed on
`process.exit(0)` in `scripts/render-probe.mjs` — and lint runs first in
`verify.sh` under `set -euo pipefail`, so that would have halted step 1 before
the suite ever ran. A second block scoped to `globals.node` was added instead.

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
   drive to zero is `region` 23, `label` 2, `heading-order` 1 — measured with
   **nothing selected**, so it covers the placeholder detail panel rather than
   the populated one.
   **The suite must therefore also render `LaborDetailPanel` directly with a
   fixture row**, which is the only way anything in this spec reaches `AgeBar`
   and `OccupationBreakdown` at all: `LaborDetailPanel.jsx:251` returns the
   placeholder whenever `row` is falsy, and both bars sit in the branch below
   it. That render is cheap and needs no map — the panel imports only
   `laborMetrics`, `Sparkline` and `laborPanel` (`:1–5`), so nothing pulls in
   Leaflet, and reading text content is what jsdom does reliably. The same
   fixture render carries R7's legend assertion and extends the axe pass to the
   panel's populated state.
   Because that makes the panel a **second axe surface**, R8's landmark for the
   detail panel must live on **`LaborDetailPanel`'s own root element, in both
   the placeholder and populated branches** (`:253` and the populated root
   below `:265`) — not on a wrapper added in `LaborPage`, where it is rendered
   as a bare sibling at `LaborPage.jsx:257`. R8's wording admits either, and the
   wrapper would leave the full-app pass green while the standalone render could
   never reach zero `region` violations, since the landmark would not be in the
   mounted tree. The likely escapes at that point are reworking R8 or scoping
   `region` out of the fixture render — and disabling a rule to make a check
   pass is exactly what this part argues against for `target-size` two
   paragraphs down. Putting the landmark on the panel's own root also keeps the
   panel's accessible identity in the component that owns it.
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

### R10. [x] The ramps survive colour-vision deficiency, or stop relying on colour alone

**Done (2026-08-30, `3aedd74`).** Both acceptance criteria are asserted in
`test/palette.test.mjs` and pass:

```
✔ R10 — tier colours stay distinguishable under every simulated vision
✔ R10 — every ramp reads as an ordered scale under every simulated vision
```

Criterion (1), tier pairwise ΔE00 ≥ 15 under all four visions: worst pair is now
**15.5** (PROXY/MODELED under tritanopia), against **2.4** before — that was
DERIVED vs MODELED under deuteranopia, the two tiers rendering as one colour.
The recolour is `#306c54` / `#2460f0` / `#b4480c` / `#840c6c`, chosen by a
constrained search holding the current hue families and minimising drift, not by
eye.

Criterion (2), ramp L\* strictly monotonic with min gap ≥ 5 under all four
visions: passes unchanged at 6.3, as the probe predicted. No ramp colour moved.

The gate was verified to bite before being trusted: reverting OFFICIAL to
`#2f9e44` fails with `OFFICIAL (#2f9e44) is 3.08:1 on its badge background,
needs >= 4.5:1` and `OFFICIAL vs PROXY is dE00 10.2 under deuteranopia, needs
>= 15`.

One finding worth keeping: DERIVED had to move furthest in saturation because
blue and purple share a hue under deuteranopia. With that channel gone,
lightness and chroma are the only ones left to separate DERIVED from MODELED, so
a subtler recolour is not available rather than merely not preferred.

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

### R11. [~] Verified in a real browser, not inferred from a clean build


**Done (2026-08-30, `9d01bb0`).** What changed from the requirement as written: it assumed a
person doing all of this by hand. Most of it is now **automated and repeatable**
via `scripts/r11-measure.mjs`, which drives the system Chrome through
`playwright-core` — installed unsaved, and which never downloads a browser, so
`package.json`, `verify.sh` and `ci.yml` are untouched and the Non-goals'
offline property holds. That is strictly better than eyeballing: the numbers are
reproducible and diffable.

The acceptance asks for "the screen reader used and what it announced for one
OFFICIAL and one MODELED figure". A screen reader reads the accessibility tree,
not the DOM, so that tree is the thing under test — and it is read directly
below, via CDP, rather than transcribed by ear.

| | 1440x900 | 375x812 |
|---|---|---|
| `.leaflet-container` | 768 x 544 | 375 x 456 |
| Horizontal page scroll | none | none |
| Landmarks / ARIA attributes | 4 / 220 | 4 / 220 |
| Targets under 24px | *withdrawn — see the corrected census below* | *withdrawn — see the corrected census below* |
| Tier badge rendered size | **11px** | **11px** |
| Console | clean | clean |

- **Pre-change baseline** (required before any change landed): map 768 x 544 at
  1440x900, and 0 x 448 at 375x812. Captured at `5e8cf16`.
- **Keyboard-only reach**: the ranking listbox reaches every country with data
  (arrows, Home/End, Enter/Space); metric, region, income and scenario-basis
  buttons are reachable and expose `aria-pressed`; both sliders are reachable
  and carry `aria-valuetext`; the detail panel opens and closes. Verified by
  reading the rendered tab order and the axe pass, **not** by driving a keyboard
  in the browser — see the caveat above.
- **Deuteranopia check of R5's no-data encoding**: the encoding is a dashed
  stroke, not a colour, so it is invariant under any colour-vision simulation by
  construction. `test/pure.test.mjs` asserts it lands on exactly the null rows.
- **Rendered badge size**: 11px, all 26 badges, at both viewports.
- **Interactive target sizes — the earlier figures here are withdrawn.** They
  read "186 of 234" and "2 of 236", and both came from a census whose selector
  (`button, a, input, [role="option"], [tabindex="0"]`) matched none of the 218
  Leaflet markers. Corrected census at 375×812, with exemptions reported
  separately rather than folded into one number:

  ```
  targets            434 total, 158 under 24px
    exempt: 155 markers (WCAG 2.5.8 equivalent control — the ranking listbox
            reaches every country, including the no-data rows), 3 inline
            attribution links, 1 sr-only skip link
    MUST PASS under 24px: 0
  ```

  Desktop still reports 218 must-pass under 24px: the 9px ranking bars, which
  R6's acceptance scopes to 375×812 deliberately.

### What assistive technology is actually handed

Done with `node scripts/r11-announce.mjs`, which reads Chrome's accessibility
tree over CDP. That tree is what a screen reader consumes: VoiceOver and NVDA
differ in phrasing, word order and verbosity, but all of them read *this*. If a
tier word is in the accessible name here, no screen reader can announce the
number without it; if it were missing here, none could invent it.

    map region   "White collar share, OFFICIAL. 218 countries plotted,
                  177 with data, 41 without."
    equivalent   region "White collar share by country — text equivalent"
                 354 entries carrying a tier word, 82 saying "no data"
                 e.g. "Afghanistan: 8.7% — OFFICIAL"   "Aruba: no data"
    panel        region "Country detail: Luxembourg"
    OFFICIAL     "Population structure, OFFICIAL" -> "Total population 686,970"
    MODELED      "AI task-exposure score, MODELED" -> index 0–1
    -> a MODELED figure reachable without its tier word? no

**This is what found the two bugs in `9d01bb0`.** Reading the tree rather than
the markup showed that three constructed figures were sitting under stronger
tier badges, and that 206 marker paths were consuming the tab order ahead of the
listbox. Neither was visible to the offline suite, and the second contradicted
the Leaflet row above.

### Keyboard, driven rather than inferred

    Shift+Tab  -> "Skip to the country list"  (first stop, 169x36 when focused)
    Enter      -> focus lands on #country-ranking, role=listbox
    ArrowRight x3 -> aria-activedescendant "3. Switzerland, 65.7%"
                  -> panel becomes "Country detail: Switzerland"

Two keystrokes from load to a country. Every tab stop carries a 2px focus
outline; zero stops have none.

### What was dropped, and what that costs

**The human screen-reader listen is dropped, by the author's decision on
2026-08-30.** This requirement is `[~]` rather than `[x]` because that is a
revision of the acceptance, not a completion of it.

What the revised requirement verifies: the accessibility tree — role, name and
value for every figure and region — read directly from Chrome over CDP. That is
the data every screen reader consumes, so if a tier word is in the accessible
name no reader can announce the number without it, and if it were missing none
could invent it. It is also more reproducible than one person's transcription,
and it earned its place by catching the mislabelled-tier bugs.

What is now **not** verified, and should not be claimed:

- **Nobody has heard this page.** Phrasing, reading order, verbosity and the
  cadence of 218 list entries are all decisions a screen reader makes downstream
  of the tree, and none of them has been observed.
- Announcement of live changes — selecting a country, changing the metric — is
  inferred from the resulting tree, not from hearing whether anything is spoken
  at the moment it changes.
- The three exemptions R6 claims (markers, inline links, skip link) are argued
  from WCAG's text and measured geometry, not from a user finding the equivalent
  control usable in practice.

If this ships to real users, that listen is still worth an hour of somebody's
time. It is a known gap, recorded here rather than closed.

Per `CLAUDE.md`: a clean build is not evidence the page renders. Load the app at
**375×812** and **1440×900**, exercise keyboard-only navigation end to end,
listen to the detail panel and tier badges with a screen reader, and measure the
things that need a layout engine — rendered target sizes, rendered font sizes
and rendered contrast. The probes established that jsdom can check none of the
three, and that for `target-size` it will actively report a false pass.

**Record the 1440×900 baseline first**, before any change lands: R1's desktop
criterion is defined against the map container's width today, so it has to be
measured while "today" still exists.

**Baseline recorded 2026-08-30, at `5e8cf16`, via `node scripts/r11-measure.mjs`:**

| | 1440×900 | 375×812 |
|---|---|---|
| `.leaflet-container` | **768 × 544** | **0 × 448** |
| `.panel-scroll` widths | `[288, 384]` | `[288, 87]` |
| Horizontal page scroll | no | no |
| Landmarks / ARIA attributes | 0 / 0 | 0 / 0 |
| Interactive targets under 24px | 186 of 234 | 187 of 234 |
| Tier badge rendered size *(not a baseline — see note)* | 11px | 11px |
| Console | clean | clean |

The 768px is what R1's desktop criterion compares against. The 0px at 375
confirms the Objective's headline claim by observation rather than derivation.

Taken at `5e8cf16` rather than at the branch point, which is sound for the width
comparison specifically: steps 2 and 3 changed colours, text tokens and badge
padding, and touched neither `w-72` on the sidebar nor `w-96` on the detail
panel, which are the only two things the map column's width is a remainder of.
The 186-of-234 target count is likewise pre-R6.

**The badge-size row is the exception and is not a baseline.** At the branch
point the badges were `text-[8px]` and `text-[9px]`; `5e8cf16` raised all five
to 11px, so that row records the *result* of R4 rather than the state before it.
It is kept here because that is where the measurement was taken, but nothing
should read it as a pre-change figure.

**The target count in this table is also superseded.** It was produced by a
census that could not see the map — see the R6 note and the corrected figures
there.

**Acceptance:** the browser console is clean at both viewports (no errors, no
React warnings). A short written record is appended to this spec covering: the
pre-change 1440×900 map-container width that R1 compares against; the two
viewports after the change; keyboard-only reach of every control; the screen
reader used and what it announced for one `OFFICIAL` and one `MODELED` figure;
measured target sizes for the ranking strip and the "Latest" button; the
rendered badge font size from R4; and a deuteranopia check of the no-data
encoding from R5.

## Implementation Plan

**Planned:** 2026-08-30

### Codebase findings

- **No JS test infrastructure exists.** Node 24's `node --test` is built in, and
  Vite's SSR transform already loads the app (proven by `scripts/render-probe.mjs`),
  so the R9 suite adds only `jsdom` and `axe-core`.
- **ESLint does not lint `.mjs`** — `eslint.config.js` has
  `files: ['**/*.{js,jsx}']`, which is why `scripts/palette-probe.mjs` passes
  lint without ever being read. A suite that `verify` runs but `lint` ignores is
  a gap. R9's step closed it with a **second config block** — applied in
  `a482013`, so this describes work already in the tree — not by widening the
  existing glob: that block extends `js.configs.recommended` with
  `globals.browser`, so adding `.mjs` to it makes `no-undef` fire on
  `process.exit(0)` at `scripts/render-probe.mjs:87` — verified, `'process' is
  not defined`. Lint runs first in `scripts/verify.sh` under `set -euo
  pipefail`, so that failure would halt step 1 before the new suite ever ran.
  The added block scopes `scripts/**/*.mjs` and `test/**/*.mjs` to
  `globals.node` and omits `reactRefresh.configs.vite`, which has no business
  applying to Node scripts.
- `TIERS` (`laborMetrics.js:7`) and `ISCO_GROUPS` (`:246`) are each a single
  exported table, so R4's and R10's recolour is one edit each.
- CI's `pipeline tests` step is the pattern to mirror: a named step so the new
  gate fails distinguishably from lint on the checks list.

### Files to create

| Path | Purpose | Req |
|---|---|---|
| `test/fixtures.mjs` | One fully-populated country row — all three age bands non-null, **`white_collar_pct` non-null** (the guard at `LaborDetailPanel.jsx:113`), all nine ISCO groups non-null, and `isco_groups_reported == 9`. One of the 170 qualifying rows, so neither bar's assertion can pass vacuously. `white_collar_pct` is the field that decides whether the ISCO half runs at all, and it is listed explicitly because this fixture is **hand-authored**: every payload row carrying all nine groups happens to carry it too (181 of 181), so transcribing only the other conditions produces a literal that renders the "no ISCO-08 breakdown published" paragraph and asserts over zero bands | R7, R9 |
| `test/a11y.test.mjs` | Structural axe over the full app **and** over `LaborDetailPanel` rendered standalone with the fixture row | R8, R9 |
| `test/palette.test.mjs` | Imports the functions and tables from `scripts/palette-probe.mjs` — badge AA, text palette, tier ΔE00, ramp L\* | R4, R7, R10 |
| `test/pure.test.mjs` | Text-equivalent builder and marker-props function, no DOM | R3, R5 |
| `src/utils/textPalette.js` | Exported text colours, each with declared background and large-text flag | R7 |
| `src/utils/mapText.js` | Pure text-equivalent builder — rows + metric in, entries out | R3 |
| `src/components/BottomSheet.jsx` | Peek / half / full sheet below `md` | R1 |

### Files to modify

`package.json` (two devDependencies, `test:a11y` script) · `scripts/verify.sh` ·
`.github/workflows/ci.yml` · `eslint.config.js` (lint `.mjs`) ·
`src/utils/laborMetrics.js` (TIERS recolour, no-data encoding, marker props) ·
`LaborDetailPanel.jsx` (landmark on own root in both branches, delete in-bar
labels, age-legend percentage, badge size) · `LaborMap.jsx` (no-data
`dashArray`, `aria-describedby`) · `LaborPage.jsx` (responsive layout, ranking
listbox, text-equivalent wiring) · `LaborSidebar.jsx` · `LaborTimeline.jsx` ·
`ScenarioPanel.jsx` · `Header.jsx` · `App.jsx`

### Sequence

| # | Step | Depends on |
|---|---|---|
| **0** | **R11 pre-change baseline** — record the 1440×900 map-container width | ~~Browser access~~ — done, `scripts/r11-measure.mjs` |
| 1 | R9 harness: devDependencies, `test/`, wire into `verify.sh` and CI, widen the ESLint glob | — |
| 2 | R7 text-palette export; R4 + R10 `TIERS` recolour (solved together) | 1 |
| 3 | R7 delete the two in-swatch labels and add the age-legend percentage; R5 no-data encoding | 1, 2 |
| 4 | R8 landmarks and names; R3 text equivalent | 1 |
| 5 | R1 responsive layout and bottom sheet | 0 |
| 6 | R2 keyboard listbox; R6 touch targets | 5 |
| 7 | R11 full browser verification | all |

Step 0 is first for a reason that is easy to lose: R1's acceptance compares the
desktop map width against a baseline that stops existing the moment step 5
lands.

### Requirement mapping

| Req | How it will be satisfied | Where | How acceptance is checked |
|---|---|---|---|
| R1 | Bottom sheet over a full-bleed map below `md`; three-column arrangement above it | `BottomSheet.jsx`, `LaborPage.jsx` | Browser at 375×812: `.leaflet-container` ≥ 320px, `scrollWidth <= innerWidth`; at 1440×900 all three present, in order, map no narrower than the step-0 baseline |
| R2 | Ranking strip becomes a listbox — arrow keys, `Enter`/`Space`, focus moved to the panel and restored on close | `LaborPage.jsx` | Keyboard-only walkthrough recorded in R11 |
| R3 | Pure builder, wired to the map container via `aria-describedby` | `mapText.js`, `LaborMap.jsx` | `test/pure.test.mjs` asserts one entry per row with name, value or "no data", and tier word; screen reader in R11 |
| R4 | Recolour `TIERS`, raise badge text to ≥ 11px, accessible text on every badge | `laborMetrics.js` + three components | `palette.test.mjs` (≥ 4.5:1), `a11y.test.mjs` (badge has accessible text), R11 (rendered px) |
| R5 | `dashArray` or distinct class on no-data markers, decided by a pure function | `laborMetrics.js`, `LaborMap.jsx` | `pure.test.mjs` — encoding applied to exactly the rows whose active-metric value is null |
| R6 | Every interactive target ≥ 24×24, spacing where the bar must stay thin | Timeline, Scenario, ranking strip | Measured in the browser in R11; axe's rule stays disabled |
| R7 | Text-palette export consumed by the components; delete both in-swatch labels; age legend gains the percentage | `textPalette.js`, `LaborDetailPanel.jsx` | `grep` over `src/` finds no **text-colour** literals (`text-[a-z]+-[0-9]+`, `text-black`, `text-[#…]`) and exactly four `text-white`; `a11y.test.mjs` fixture render asserts every surviving band's percentage renders outside its swatch |
| R8 | `main`, labelled sidebar region, panel landmark **on `LaborDetailPanel`'s own root in both branches**, `aria-pressed` on toggles | all components | `a11y.test.mjs` drives `region` 23 / `label` 2 / `heading-order` 1 to zero on both the full-app and the standalone-panel surface |
| R9 | `node --test` suite wired into `verify.sh` and CI; `target-size` disabled with the reason in a comment | `test/`, `verify.sh`, `ci.yml` | Revert one tier colour to `#2f9e44` and watch `npm run verify` exit non-zero; passes in a fresh clone with no network; `npm ls --depth=0` shows exactly two new devDependencies |
| R10 | Tier pairwise ΔE00 ≥ 15 under four visions; ramp L\* strictly monotonic, min gap ≥ 5 | `laborMetrics.js` | `palette.test.mjs`, using the algorithm pinned in `scripts/palette-probe.mjs` |
| R11 | Browser verification at both viewports, console clean | — | Written record appended to this spec, covering every item its acceptance lists |

### Tier and vintage handling

**This plan creates no new figures.** Every value keeps the tier it already
carries in `global_labor.json` and `TIERS`; no `data_quality_flag`, no per-field
year, and no pipeline output changes. R4 changes tier *colours*, never tier
*assignments*. The one place a rendered figure moves is R7's label deletion, and
it moves *into* the legend — which is exactly why the age legend gains its
percentage in the same step, before the label goes.

### Validation

No pipeline change, so `[validate]`, `[crosscheck]` and `[outliers]` are
untouched — but `npm run verify` still runs them, so a regression would surface
anyway. The new gate is the R9 suite, added to `verify` and to CI in the same
change, per `CLAUDE.md`.

### Risks

1. ~~**R11 is blocked.**~~ **Resolved 2026-08-30.** The Claude-in-Chrome
   extension never connected, but that was never the only route: `playwright-core`
   installed unsaved drives the system Chrome and downloads nothing, so
   `package.json`, `verify.sh` and `ci.yml` are untouched and the Non-goals'
   offline property holds. `scripts/r11-measure.mjs` and
   `scripts/r11-announce.mjs` take every measurement R11 asks for. The step-0
   baseline is recorded below.
2. **R4 and R10 may not both hold while keeping the tier hues.** They are
   jointly satisfiable — a grid search found sets with worst pairwise ΔE00 18.7
   and every badge clearing AA — but that solution was four dark blues and
   greens. Constrained to the current green / blue / orange / purple families,
   each family has candidates clearing badge AA (121 / 329 / 81 / 276), and
   whether a hue-preserving *set* satisfies R10 is unresolved: the exhaustive
   search over those pools did not terminate. Step 2 must run a bounded search
   before assuming the semantics survive. If none exists, R10 is the requirement
   that gets `[~]`, with the redundant non-colour channel recorded.
3. **R1 is the largest single piece** and the only requirement whose acceptance
   is entirely browser-side, with no test covering it.
4. **R8's baseline is a floor, not the true count.** `region` 23 / `label` 2 /
   `heading-order` 1 were measured with the detail panel in its placeholder
   branch, so the populated panel may add violations once step 4 renders it.

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
