# 0012 — desktop layout

**Status:** in-progress
**Depends on:** 0010 (the wizard this widens), 0008 (the touch-target, focus and
reduced-motion floors this must not regress)
**Issue:** [#67](https://github.com/apportico/who-gets-replaced-first/issues/67)

## Objective

Opened on a desktop browser the app is a phone screen pasted into the middle of
a monitor: the wizard is hard-capped at a 480px column with no adaptation above
it, so at 1440px **66.7% of the viewport is empty ground** and at 1920px **75%**
(measured, below). Spec 0010 rebuilt the UI mobile-first for good reasons, but
mobile-first was implemented as mobile-*only* — there is not one width
breakpoint anywhere in `src/`. This spec gives the app a desktop layout: one
column still, but a column that grows, a display scale that suits the wider
measure, and a call to action that stops docking itself to the bottom of a
screen that has no thumb near it. It also restores the browser-measurement path
spec 0010 deleted, because jsdom does no layout and this is the one spec whose
subject is layout.

**No requirement here produces a number.** The data contract — tiers, the
`no series` result, the coverage floor — is untouched at every width, and R9
asserts that rather than assuming it.

## Source verification

Every "source" here is in-tree or is the design canvas; all were probed on
**2026-09-01** against `main` at `91ec0f6`. The live measurements come from
`playwright-core` driving the installed Chrome — the same route spec 0008 R11
used — with `document.title` asserted before anything was measured.

| Source | Probed | Result |
|---|---|---|
| `src/styles/index.css` | `grep`, 2026-09-01 | `--column: 480px` at line 97 is the only layout width token. `@media` appears **once**, `prefers-reduced-motion` at line 213. Display sizes are fixed px: `--step-h1: 66px`, `--step-h2: 46px`, `--step-stat: 38px`. No `clamp()` anywhere |
| `src/components/wizard/WizardShell.jsx` | Read, 2026-09-01 | `maxWidth: 'var(--column)'` at line 79 on the only content wrapper, inside `display:flex; justifyContent:center` with `minHeight:'100vh'` on both the page and the column |
| `.wz-footer` in `index.css:382` | Read + measured | `position: sticky; bottom: 0` over `linear-gradient(to top, var(--bg) 62%, transparent)`. This is the CTA dock |
| **Live: the column at six viewports** | `playwright-core` + system Chrome, headless, 2026-09-01 | Column width is **480px at every viewport tested**. Empty ground: 375→0px, 480→0px, 768→288px (37.5%), 1024→544px (53.1%), 1440→**960px (66.7%)**, 1920→**1440px (75.0%)** |
| **Live: the display scale** | Same run | `.wz-h1` computes **66px at all six viewports**, and its box is 436px wide from 480px up — the headline never uses the extra 960px at 1440 |
| **Live: the CTA dock** | Same run, driven to step 01 | `.wz-footer` computes `position: sticky` at **both** 375 and 1440; its box bottom equals the viewport height (812 / 900) at both. The CTA is 60px tall and 331px (375) / 436px (≥480) wide. On the **intro** there is no dock at all — the intro CTA is inline already, so R4 changes steps 01–03 only |
| **Live: the header** | Same run | The sticky header measures **480px at 1440**, not 1440px — it is inside the column, not page chrome. See Non-goals |
| **Live: horizontal scroll and console** | Same run | `documentElement.scrollWidth === innerWidth` at all six viewports, and **zero** page errors at all six. Whatever is wrong on desktop, it is not overflow |
| **Live: media queries seen by the browser** | Same run, enumerating `CSSMediaRule`s in `document.styleSheets` | Exactly one: `(prefers-reduced-motion: reduce)`. Confirms the `grep` from inside the browser, which is the check `CLAUDE.md` insists on after the `@import` incident |
| `src/styles/tokens.test.js:210`, `src/components/wizard/computed.test.jsx:262` | Read | Both pin the width: the first asserts `--column:\s*480px` in the source, the second asserts the computed token is `480px`. Both move in this change (R10) |
| `scripts/` | `ls` + `git log`, 2026-09-01 | **The measurement path is gone.** `r11-measure.mjs`, `r2-keyboard.mjs`, `render-probe.mjs` were deleted by `ada3897` (spec 0010) — they measured the map. `scripts/` now holds `palette-probe.mjs` and `verify.sh`. `playwright-core` is **not** in `node_modules` and never was in `package.json` (0008 installed it `--no-save`) |
| `git show ada3897^:scripts/r11-measure.mjs` | Read, 2026-09-01 | The pattern is fully recoverable: `playwright-core` (never downloads a browser), `executablePath` from `CHROME_PATH` or the standard macOS path, `EXPECTED_TITLE` asserted before measuring, `--json` output. R6 restores it rather than reinventing it |
| System Chrome | `ls`, 2026-09-01 | `/Applications/Google Chrome.app` present at the path the recovered script defaults to |
| The design canvas ([5144650a](https://claude.ai/code/artifact/5144650a-4fe5-48af-b3c7-e887f7e6afde)) | `Artifact` read, 2026-09-01 | **Probe inconclusive, and recorded as such.** The 435,930-byte export is a bundler shell whose artboard markup rides inside compressed blobs; the whole file contains one literal `480` and one `Replacement Date`, both in the shell. Artboards could not be enumerated mechanically. What is known: the canvas is titled *Mobile landing page builder* and `CLAUDE.md`'s extracted contract records a single 480px column with no desktop artboard. **So there is nothing to implement against above 480px, and this spec states the desktop contract itself** (R11) |
| `.github/workflows/claude-review.yml` | Read, 2026-09-01 | The automated reviewer is **inert** — no GitHub App installation and no `ANTHROPIC_API_KEY` (issue #44), and the job passes when it skips. Its gate is `draft == false || label contains spec-review`, so a non-draft PR is admitted either way. Recorded because "CI green" on this PR is not evidence a review ran |

## Requirements

### R1. [x] One breakpoint, declared once, at 768px

The stylesheet gains a **single** `@media (min-width: 768px)` block, and every
desktop value in this spec lives inside it.

**On the precedent, corrected 2026-09-01 after review.** This requirement first
claimed 768 from spec 0008 R11's *"768px is R1's desktop baseline"*. That is a
misread: 0008's 768 is the measured **element width** of `.leaflet-container` at
a 1440 viewport (1440 − 288 − 384), not a viewport breakpoint, and the three
columns that arithmetic describes were deleted by 0010. The real precedent is
one requirement away — 0008 R1 wrote this app's desktop split at Tailwind's
`md:`, which *is* 768px (`BottomSheet.jsx` used `md:contents`, and R1's prose
says "below the `md` breakpoint"). That code is gone too: `git grep "md:"
91ec0f6 -- src/` returns only `--radius-md`. So 768 is a recorded decision of
this app's rather than a live one, and the self-standing argument is the probe:
768 already carries 37.5% empty ground.

**Acceptance:** enumerating `CSSMediaRule`s from inside the browser (the check
`CLAUDE.md` requires, not a `grep` of the source), the set of **`min-width`**
conditions is exactly `["(min-width: 768px)"]` at every viewport in R6's list.
Scoped to `min-width` on purpose: `index.css` imports `tailwindcss` and
`tw-animate-css`, and a utility class that later ships some other media
condition is not this requirement's business — a second *width* breakpoint is.
The script must also **count the stylesheets it could not read** and assert that
the sheet declaring `--column-wide` was among the ones it could: the Google
Fonts stylesheet is cross-origin and throws `SecurityError` on `.cssRules`, and
without that assertion a sheet skipped by an exception is indistinguishable from
a sheet with no media rules — the check would pass by not looking.

### R2. [x] The column grows to 640px above the breakpoint

`--column-wide: 640px` joins `--column: 480px` as a layout token, and the wrapper
in `WizardShell.jsx:79` resolves to the wide value above the breakpoint. Both are
tokens; neither is a literal in a component, per 0010 R2.

**Acceptance:** R6's script reports the measured column as **640** at 768, 1024,
1440 and 1920, and the viewport width capped at 480 below that — 480 at 480 and
767, and 375 at 375, because the wrapper is `width: 100%` under the cap.
`documentElement.scrollWidth === innerWidth` at all seven, so the wider column
introduces no horizontal scroll. **768 matters most here**: it is the
breakpoint's inclusive lower bound and the narrowest viewport the 640px column
is ever asked to fit inside, with 64px of ground each side.

### R3. [x] The display scale grows with the column

Above the breakpoint the display tokens are redefined: `--step-h1: 78px`,
`--step-h2: 54px`, `--step-stat: 44px`. Body, mono and every label size are
unchanged — the wider measure is a display-type problem, not a reading-size one,
and 0008 R4's 11px floor on mono labels is a floor, not a scale step.

**Redefined tokens inside the media query, not `clamp()`** — a deliberate
divergence from the option preview this spec was chosen from. `clamp()` makes
"mobile is unchanged" an arithmetic argument about where the curve starts;
redefinition inside `min-width: 768px` makes it an equality R5 can assert
exactly, and puts every desktop value in one place a reviewer can read.

**Acceptance:** R6's script reports `.wz-h1` computed `font-size` of **66px** at
375, 480 and 767 and **78px** at **768**, 1024, 1440 and 1920; `.wz-h2` **46px**
→ **54px**; a stat figure **38px** → **44px**. The h1 renders on no more than
three lines at 1440.

### R4. [~] The CTA un-docks above the breakpoint — on the steps that fit

`.wz-footer` drops to `position: static` above the breakpoint and loses its
gradient fade, so the primary action is an inline button in the flow rather than
a 640px slab pinned to the bottom of a 900px window. The intro is already inline
(probed) and does not change.

**`[~]` revised 2026-09-01, after review — this applies to steps 02 and 03 only.**
As first written it applied to all three, and that made step 01's primary action
**unreachable**. Step 01 lists every country with a series, `.wz-footer` renders
after that list, and with `position: static` the "Continue" button measured
`top: 15433` in a 900px viewport — 15,433px below the fold, on the one step with
no other way forward. Measured, not argued: the same run puts steps 02 and 03 at
`top: 814` and `757`, both comfortably on screen, because those screens fit the
viewport.

**Spec 0011's search (#68) landed mid-review and does not remove the need.**
Non-goals originally offered "land #66 first and R4 applies uniformly" as the
end state. It has landed, and step 01 is still **177 rows and 12,739px tall at
1440** with an empty query, because the search filters a list that is fully
rendered until someone types. Re-measured after merging `3b3f350`: the anchored
dock keeps the CTA at `top: 840` in a 900px viewport. The modifier stays, and
the end-state note is withdrawn rather than left as a promise the merge already
falsified.

Neither of this requirement's original criteria could see it. `position: static`
and "the dock's box bottom is not `innerHeight`" are *exactly* what an
unreachable CTA looks like, and R7 could not see it either — nothing overflows
and nothing errors. So the un-dock is scoped by a `wz-footer--anchored`
modifier on `CountryScreen`'s footer, and the rule becomes: **a screen that does
not fit the viewport keeps its dock.** If #66's search lands and step 01 stops
being a 15,519px page, the modifier comes off and R4 applies uniformly again.

**Acceptance (revised):** R6's script, driving to each of steps 01, 02 and 03 at
**all seven** viewports, reports:

- step **01**'s dock computes `sticky` at every width, and carries
  `wz-footer--anchored`;
- steps **02** and **03** compute `sticky` at 375/480/767 and `static` at
  768/1024/1440/1920;
- and on **every one of the three steps, at every viewport, the CTA's
  `getBoundingClientRect().top` is less than `innerHeight` with no scrolling.**
  This is the clause that fails when a primary action is off-screen at first
  paint, and without it R4 could go `[x]` on a screen nobody can get past.

The CTA's measured height is ≥ 60px at all seven throughout.

### R5. [x] Below the breakpoint, nothing moves

The phone layout is the primary surface and this change may not touch it. Every
viewport **below** the breakpoint — 375, 480 **and 767** — must match a baseline
captured from `main` before any CSS in this spec changed.

**Acceptance:** `scripts/desktop-baseline.json` is generated from a pristine
checkout of `main` at `91ec0f6` and committed. After the change, R6's script
re-run at 375, 480 and 767 produces rows **deep-equal** to that file, and exits
non-zero on any difference or on a row the baseline does not cover.

**It also survived a merge, which is the schema's first real test.** `main`
moved to `3b3f350` (spec 0011's country search) mid-review, and after merging it
the 375/480/767 rows are still deep-equal to the `91ec0f6` baseline — a change
that rewrote step 01 completely moved none of the eight keys. That is the
narrowing working as intended: had `optionCount` still been in the schema, R5
would have failed on 218 → 177, a change this spec did not make and is not
about.

**The compared schema is named, and it is deliberately narrow** (revised
2026-09-01 after review). Exactly eight keys, all computed styles, booleans or
counts:

`column` · `h1` · `h2` · `stat` · `ctaHeight` · `dockPosition` ·
`scrollEqualsViewport` · `errorCount`

Nothing that is a **text box measurement** is in it. The three fonts are fetched
from `fonts.googleapis.com` at run time over a real fallback stack, so a slow or
blocked font request silently re-lays out the headline; a baseline holding
`h1Lines` or `minOptionHeight` would then fail R5 on a network condition rather
than on a change to this repo, and Chrome version drift does the same to
sub-pixel rounding (R6 pins no Chrome version). The script asserts the committed
file's key set **is** this list, so the artefact cannot quietly grow a geometry
field. Nothing is lost by the narrowing: the focus ring is R8's and is asserted
at every width, and the rendered figures and tier badges are R9's and are
asserted across the breakpoint.

### R6. [x] The measure script is restored, committed and documented

`scripts/desktop-measure.mjs` returns the browser-measurement path `ada3897`
deleted, rebuilt around the wizard instead of the map: **seven** viewports (375,
480, 767, **768**, 1024, 1440, 1920), `playwright-core` installed `--no-save`, Chrome from
`CHROME_PATH` or the macOS default, `--json`, and **`EXPECTED_TITLE` asserted
before a single measurement is taken** — spec 0008 recorded a run that measured
a different project on port 5173 and produced entirely plausible numbers.

**Acceptance:** with `npm run dev` running,
`npm install --no-save playwright-core && node scripts/desktop-measure.mjs`
prints a row per viewport and exits **0**; it exits **non-zero** on a title
mismatch (verifiable by pointing `APP_URL` at any other page) and non-zero on any
R2–R5 threshold breach. `playwright-core` does **not** appear in `package.json`.

### R7. [~] The desktop layout is clean at every width

No horizontal scroll, no console errors, no overlapping or clipped elements at
any of the seven viewports.

**Acceptance:** at all seven, `documentElement.scrollWidth === innerWidth` and the
script's collected `pageerror` + `console.error` list is **empty**. Screenshots
at 375, 768, 1440 and 1920 are taken for the intro, step 01 and the result, and
reviewed before the requirement is marked.

**`[~]` revised 2026-09-01, after review — "attached to the PR" did not happen,
and the mark says so.** The original criterion said the four screenshots are
*attached to the implementation PR*. They were taken and reviewed at every round
— and they earned their place twice, first catching R12's clipped sparkline
after the automated check had passed against it, and again confirming after the
#68 merge that step 01's anchored dock keeps its CTA on screen. But they were
never attached, because this environment drives `gh` from a terminal and GitHub
accepts image uploads only through its web UI. Committing PNGs into a
data-pipeline repo to work around that is a worse trade than saying what
happened.

So the criterion is split, honestly:

- **Taken and reviewed** — done, every round, and the review notes are in this
  spec's evaluation rather than in an image.
- **Attached** — not done from here. Anyone with the browser can drag the four
  onto the PR; the reviewer's point that a reviewer cannot see what the browser
  painted stands, and this mark is what stops it being quietly buried.
- **The one thing a screenshot would have caught is now a runnable check.** The
  reviewer's own example — "a 1440 screenshot of step 01 would have shown it" —
  is R4's reachability clause: at every viewport, on all three steps, the CTA's
  `rect.top < innerHeight` with no scrolling. That is strictly better than a
  screenshot, because it fails a build instead of needing a reader.

### R8. [x] The accessibility floors hold at every width

Touch targets, the focus ring and reduced motion are width-independent. 0008's
floors and 0010 R5's targets survive: primary CTA ≥60px, options and secondary
≥56px, tertiary ≥48px, focus `2px solid #FF5A2B` with `outline-offset: 3px`, and
the four keyframes suppressed under `prefers-reduced-motion`.

**Acceptance:** `computed.test.jsx` and `tokens.test.js` stay green, and R6's
script additionally reports, at **all seven** viewports, `.wz-cta` height ≥60,
every `.wz-option` height ≥56, and a focused CTA computing `outline-width: 2px`
with `outline-color: rgb(255, 90, 43)`.

### R9. [~] The data surface is identical at every width

This is the rule `CLAUDE.md` puts hardest on the result screen: a layout change
must not alter a figure, a tier badge, a `no series` result or a stand-in
notice. Nothing here produces a number, and nothing here may change one.

**Acceptance:** R6's script drives to step 04 at 375 and at 1440 for **two named
countries** and asserts the rendered stat figures and the full set of tier badge
strings are **string-identical** between the two viewports. A figure that appears
at one width and not the other fails the requirement.

**The countries are named, not selected** (revised 2026-09-01 after review). A
run-time scan of the payload can pick a different country as the data refreshes,
and R9 would then compare two different result screens on different days while
still reporting pass.

- **GBR**, for the series side. `CLAUDE.md` records its clerical figures as the
  real dataset (`isco4_clerical_pct` 8.8633, 2,989,466 people), so a reviewer can
  eyeball the numbers the script prints.
- **NZL**, for the absence side. `CLAUDE.md` records New Zealand as deliberately
  unfilled in `manual_overrides.json`, and the committed payload carries no ISCO
  block for it — checked, 2026-09-01.
  **Armenia, named in that same `CLAUDE.md` sentence, is not a valid pick: it
  carries a series in the payload.** The review suggested any of the three; the
  payload settles which.

**Both sides are asserted non-vacuous before they are compared.** The series
country's figures and tier badges must be non-empty, and the absence must
actually be stated at **both** widths. Without that second assertion,
"string-identical" is satisfied by a screen that renders nothing at all, which
would make the weakest check in this spec the one guarding the rule `CLAUDE.md`
puts hardest on the result screen.

**`[~]` revised 2026-09-01 — the absence is checked at step 01, not step 04.**
Spec 0011 (#68) landed mid-review and a country with no series is no longer
selectable: the 41 are not rows any more, so the step 04 withdrawal is
unreachable for one and driving to it hangs. The rule is unchanged and the
statement still has to survive the breakpoint — `CLAUDE.md` now puts it as *"Spec
0011 moved where it says so … Dropping the row is allowed. Dropping the
statement is not."* So the script searches NZL at step 01 and asserts, at both
widths, that it is **named** (`reports no occupation breakdown`), that the
statement is **string-identical**, and that it is **not offered as a pickable
row** — 0011 R6 renders it as text, and a country you can select but cannot get
an answer for would be the failure this requirement exists to catch.

### R10. [x] The tests that pin 480px describe the new contract

`tokens.test.js:210` and `computed.test.jsx:262` currently assert a single 480px
column. They are updated to assert **both** tokens and the breakpoint's
existence, so the guard keeps working rather than being deleted to make the
build pass.

**Acceptance:** `tokens.test.js` asserts `--column: 480px`, `--column-wide:
640px` and a `min-width: 768px` media query in the stylesheet;
`computed.test.jsx` asserts the base computed token is still `480px` (jsdom
applies no media query, which is the honest jsdom-side check). `npm run verify`
is green.

### R11. [x] The desktop contract is written down where the canvas cannot say it

The canvas has no desktop artboard and could not be enumerated (probed above), so
`CLAUDE.md`'s *Shape* section — which currently reads `max-width: 480px centred`
as an unconditional contract — states the breakpoint, both column values, the
desktop display sizes and the un-docked CTA, and names the canvas divergence
explicitly. Spec 0010 R5's acceptance clause *"the column token is 480px"* is
re-marked `[~]` pointing at this spec.

**Acceptance:** `CLAUDE.md` line 65's *Shape* sentence — currently the
unconditional `` `max-width: 480px` centred `` — names **both** widths and the
breakpoint, so `grep -n "max-width: 480px" CLAUDE.md` returns a line that also
contains `768px`; the section carries a sentence naming the canvas as
mobile-only and this spec as the desktop authority; and spec 0010 R5 carries a
`[~]` note linking 0012. (Written as "the line also contains 768px" rather than
as a count of a prose phrase: `grep -c "480px centred"` returns 0 **today**,
because the file writes it as `` `max-width: 480px` centred `` with backticks —
a criterion that passes before the work is done is not a criterion.)

### R12. [x] The sparkline draws its whole width at the wider column

Added 2026-09-01, during implementation, from a screenshot the plan's step 7
required. `Sparkline.jsx` animates its trend with `stroke-dasharray="400"` and
`@keyframes draw`, and the path also carries `vector-effect: non-scaling-stroke`
— which puts the **dash pattern in screen pixels, not user units**. At the 480px
column the card is ~392px wide, so a 400px dash covered the whole path and the
defect was invisible. At 640px the card is ~596px wide: the trend line stops
dead at 400px and the accent "now" dot sits ~180px further right, unconnected.

This is not a new defect, and it is not cosmetic — it is a chart that stops
drawing part-way and leaves a marker floating away from the series it marks. The
fix is `pathLength="1"` with `stroke-dasharray="1"` and `draw` animating from
`1`, which normalises the dash to the path's own length at any rendered width.

**Acceptance:** at **all seven** viewports the script reports the path carrying
`pathLength` **and no `vector-effect`**, with a dash of at least one normalised
unit; where the path is not normalised, the dash must be at least its rendered
length. `tokens.test.js` still finds all four keyframes, and R5's baseline
comparison still passes — the evidence that the fix does not move the phone
rendering, where the path already fitted inside the 400px dash.

**The first version of this criterion was wrong and is recorded rather than
quietly replaced.** It compared the path's bounding-box right edge with the end
dot's centre, which passed at every viewport while a screenshot showed the line
stopping 180px short: a bounding box is the path's *geometry* and ignores the
dash entirely. The check now compares dash against rendered length in the same
units, and additionally forbids `vector-effect` alongside `pathLength` — because
the first attempted *fix* (normalising the dash while keeping
`non-scaling-stroke`) also passed the old check and still clipped the line, at
52% instead of 72%.

## Implementation Plan

**Planned:** 2026-09-01

### Files to create

| Path | Purpose |
|---|---|
| `scripts/desktop-measure.mjs` | R6. The browser-measurement path `ada3897` deleted, rebuilt around the wizard: seven viewports, `playwright-core` + system Chrome, `EXPECTED_TITLE` asserted before any measurement, `--json`, and `--baseline <file>` to diff the phone rows against R5's committed baseline. Exits non-zero on a title mismatch or any threshold breach |
| `scripts/desktop-baseline.json` | R5. The 375, 480 and 767 rows measured from a pristine `91ec0f6` checkout **before** any CSS in this spec changes, over R5's named eight-key schema, so "the phone layout did not move" is an equality against a committed artefact rather than a claim |

### Files to modify

| Path | Change |
|---|---|
| `src/styles/index.css` | `--column-wide: 640px` on `:root` beside `--column: 480px`; **one** `@media (min-width: 768px)` block (R1) that redefines `--column: var(--column-wide)` (R2), the three display tokens to 78/54/44 (R3), and `.wz-footer:not(.wz-footer--anchored)` to `position: static` with the gradient dropped (R4) |
| `src/components/wizard/CountryScreen.jsx` | R4. Its footer carries `wz-footer--anchored`, so step 01 — 15,519px tall at 1440 — keeps its dock at every width |
| `src/styles/tokens.test.js:209` | R10. "the column is capped at the canvas width" becomes the two-token, one-breakpoint contract |
| `src/components/wizard/computed.test.jsx:260` | R10. Keeps asserting the **base** computed token is `480px` — jsdom applies no media query, and saying so in the test name is the honest jsdom-side check |
| `CLAUDE.md` (*Shape*, line 65) | R11. The unconditional `` `max-width: 480px` centred `` gains the breakpoint and both widths, plus the sentence naming the canvas as mobile-only and this spec as the desktop authority |
| `specs/0010-mobile-first-redesign.md` (R5) | R11. A `[~]` note: its "the column token is 480px" acceptance clause is now conditional, superseded by 0012 |

**One component file changes, and only by a class name.** `WizardShell.jsx:79`
already reads `maxWidth: 'var(--column)'`, so redefining `--column` inside the
media query is the whole desktop *column* — a token change, which is what 0010
R2 asks for and what keeps a raw px out of `src/components/wizard/`. The single
exception is R4's `wz-footer--anchored` on `CountryScreen`, added after review:
which screens un-dock is a per-screen fact and cannot be expressed in a token.

### Sequence

1. **Write `scripts/desktop-measure.mjs`** (R6) — nothing else can be checked without it.
2. **Run it against the unchanged tree** and commit the output as `scripts/desktop-baseline.json` (R5). This step is order-critical: after step 3 the baseline can no longer be taken.
3. **The CSS** (R1–R4) — one `@media` block, four changes inside it.
4. **The tests** (R10).
5. **The docs** (R11) — `CLAUDE.md` and 0010 R5's revision note.
6. **Re-run the measure script** (R2, R3, R4, R5, R7, R8, R9) and paste the output into the PR.
7. **`npm run verify`** and screenshots at 375 / 768 / 1440 / 1920 (R7).

### Requirement mapping

| Req | How it will be satisfied | Where | How acceptance is checked |
|---|---|---|---|
| R1 | One `@media (min-width: 768px)` block, all desktop values inside it | `index.css` | Script enumerates `CSSMediaRule`s in-browser; the `min-width` set is exactly `["(min-width: 768px)"]`, unreadable sheets are counted, and the sheet declaring `--column-wide` is proven read |
| R2 | `--column-wide: 640px`; `--column: var(--column-wide)` inside the block | `index.css` | Script: column 640 at 768/1024/1440/1920, capped below that, `scrollWidth === innerWidth` at all seven |
| R3 | `--step-h1/h2/stat` → 78/54/44 inside the block | `index.css` | Script: `.wz-h1` 66→78, `.wz-h2` 46→54, stat 38→44 across the breakpoint; h1 ≤ 3 lines at 1440 |
| R4 | `.wz-footer:not(.wz-footer--anchored) { position: static; background: none }`, and the modifier on step 01 | `index.css`, `CountryScreen.jsx` | Script at steps 01/02/03: step 01 `sticky` and anchored everywhere; 02/03 `static` above the breakpoint; **and the CTA on screen at first paint on all three steps at all seven** |
| R5 | Baseline captured from a pristine `91ec0f6` worktree before step 3, diffed after | `scripts/desktop-baseline.json` | `--baseline` exits 0; non-zero on any difference across 375/480/767, on a missing row, or on a key set that is not the named eight |
| R6 | The recovered `ada3897^` pattern, rebuilt for the wizard | `scripts/desktop-measure.mjs` | Runs and exits 0; exits non-zero with `APP_URL` pointed elsewhere; `playwright-core` absent from `package.json` |
| R7 | Falls out of R2–R4; verified, not assumed | — | Script: `scrollWidth === innerWidth` and an empty error list at all seven; screenshots on the PR |
| R8 | No change — the floors are width-independent tokens | — | `computed.test.jsx` + `tokens.test.js` green; script re-checks 60/56 heights and the focus ring at **all seven** |
| R9 | No change — the layout never touches the data path | — | Script drives to step 04 at 375 and 1440 for **GBR and NZL**, asserts both sides non-vacuous (figures present; the withdrawal sentence rendered), then diffs figures and tier badge strings |
| R10 | Both width assertions rewritten to the new contract | the two test files | `npm run verify` green with the new assertions in place |
| R11 | *Shape* section and 0010 R5's note | `CLAUDE.md`, `specs/0010-*.md` | The `max-width: 480px` line also contains `768px`; 0010 R5 carries a `[~]` linking 0012 |
| R12 | `pathLength="1"`, `vector-effect` removed, `draw` from `1` | `Sparkline.jsx`, `index.css` | Script: dash covers the rendered path at all seven — compared in matching units, never by bounding box |

### Tier and vintage handling

**Not applicable, and that is the finding, not an omission.** No step here reads,
derives, or renders a figure — every change is a CSS token, a test assertion or a
line of prose. No tier is assigned, no vintage recorded, `manual_overrides.json`
is untouched, and no pipeline file is opened. R9 exists precisely so this claim is
checked at 375 and 1440 rather than asserted: if a figure or a tier badge differs
between the two widths, the layout has touched the data surface and R9 fails.

### Validation

- `npm run verify` — lint, build, and spec 0004's regression suite. The pilot
  batch **skips** in this worktree (`pipeline/raw/` is absent, as `verify` says
  loudly); CI on the PR runs the same command with the cache and covers it.
- `[validate]`, `[crosscheck]` and `[outliers]` are pipeline blocks and cover
  nothing here — no pipeline code or data changes.
- **The new check is `scripts/desktop-measure.mjs`**, and it deliberately does
  **not** join `verify` or CI (Non-goals).

### Risks

- **Two checkouts of this repo serve the same `document.title`.** Spec 0008's
  incident — measuring another project on port 5173 and getting plausible numbers
  — is only half-guarded by the title assertion here, because the parallel
  session's worktree is *this same app*. Mitigation: the worktree's dev server
  runs on an explicit `--port 5273 --strictPort`, so Vite fails loudly rather
  than falling through to a port serving another branch, and `APP_URL` is passed
  explicitly rather than defaulted.
- **R9 may be trivially satisfied on the no-series path.** If the withdrawal
  branch renders no stat figures at all, "string-identical at both widths" is
  true of two empty sets. The script therefore asserts the *series* country's
  figures are non-empty first, so the comparison has something to compare.
- **78/54/44 are design values, not measured ones.** They are the one part of
  this spec no probe can settle; if review prefers a different desktop scale, it
  is a token edit inside the one media query and R3's acceptance moves with it.
- **`playwright-core` is an unsaved install.** A fresh clone cannot run R6's
  script without `npm install --no-save playwright-core` first. That is the
  deliberate trade recorded in Non-goals, and the script says so when the import
  fails.


## Evaluation

**Round 3, 2026-09-01**, after review round 2 and after merging `3b3f350`
(spec 0011's country search). `npm run dev -- --port 5273 --strictPort`,
`node scripts/desktop-measure.mjs --baseline scripts/desktop-baseline.json`.
`NN:stic`/`NN:stat` is each step's computed dock position; `!OFF` would mark a
CTA off-screen at first paint:

```
 375  column 375  h1 66  h2 46  stat 38  01:stic 02:stic 03:stic  cta 60  errors 0
 480  column 480  h1 66  h2 46  stat 38  01:stic 02:stic 03:stic  cta 60  errors 0
 767  column 480  h1 66  h2 46  stat 38  01:stic 02:stic 03:stic  cta 60  errors 0
 768  column 640  h1 78  h2 54  stat 44  01:stic 02:stat 03:stat  cta 60  errors 0
1024  column 640  h1 78  h2 54  stat 44  01:stic 02:stat 03:stat  cta 60  errors 0
1440  column 640  h1 78  h2 54  stat 44  01:stic 02:stat 03:stat  cta 60  errors 0
1920  column 640  h1 78  h2 54  stat 44  01:stic 02:stat 03:stat  cta 60  errors 0

all checks passed
```

| Req | Verdict | Evidence |
|---|---|---|
| R1 | `[x]` | The `min-width` set is exactly `["(min-width: 768px)"]` at all seven; the one unreadable sheet (Google Fonts, cross-origin) is counted, and the sheet declaring `--column-wide` is proven read |
| R2 | `[x]` | Column 640 at 768/1024/1440/1920; capped below (480 at 480 and 767, 375 at 375). `scrollWidth === innerWidth` at all seven |
| R3 | `[x]` | h1 66→78, h2 46→54, stat 38→44 across the breakpoint, 768 measured. The h1 runs 3 lines at 1440 |
| R4 | `[~]` | Scoped to steps 02/03. Step 01 stays `sticky` and anchored at all seven; every step's CTA is on screen at first paint at every viewport. Re-measured after the #68 merge: step 01 is still 12,739px tall at 1440 and the anchor is still doing the work (`top: 840` in a 900px viewport) |
| R5 | `[x]` | The `91ec0f6` baseline over the named eight keys passes at 375, 480 and 767 — **including after merging #68**, a change that rewrote step 01 and moved none of the eight |
| R6 | `[x]` | Seven viewports; exits 0 here, 1 on a title mismatch and 1 on any threshold breach — both seen. `playwright-core` absent from `package.json`. Adapted to #68's search: the row is reached by typing, still matched on exact label text |
| R7 | `[~]` | Clean at all seven — no horizontal scroll, no console or page errors. Screenshots taken and reviewed at 375/768/1440/1920; **not attached**, and the mark records that rather than hiding it |
| R8 | `[x]` | CTA 60px, shortest option 62px, and a Tab-focused control computing `2px rgb(255, 90, 43)` at `3px` offset — at all seven |
| R9 | `[~]` | GBR's figures `["8.9%", "2.99M"]` and badges `["DERIVED","2025","DERIVED","2025","DERIVED"]` identical at 375 and 1440. NZL's absence now checked at **step 01**, where #68 moved it: named at both widths, string-identical, and not offered as a pickable row |
| R10 | `[x]` | Both tests rewritten to the new contract, including the scoped `.wz-footer:not(.wz-footer--anchored)` selector and the absence of the unqualified one. `npm run verify` green |
| R11 | `[x]` | `CLAUDE.md` carries both widths, the breakpoint, the desktop type scale, the un-dock and the canvas exception; spec 0010 R5 carries a third `[~]` note linking here |
| R12 | `[x]` | `pathLength` with no `vector-effect`; the dash covers the rendered path at all seven |

### What review caught

**Round 1 raised six threads and all six were valid**; round 2 raised three more,
two of which were the same findings restated against the shipped code.

- **R4 made step 01 unreachable** — `top: 15433` in a 900px viewport. Both of
  R4's original criteria described that state as success, and R7 could not see it
  either. The measurable lesson is now R4's own acceptance: *a criterion asserting
  a property of a control must also assert the control is on screen.*
- **R1 cited a precedent that says something else.** 0008's "768px is R1's
  desktop baseline" is a map element's width. The real precedent — 0008 R1's
  Tailwind `md:` split, also 768 — was one requirement away, and its code has
  since been deleted. The misquote had spread to `index.css` and the PR body;
  all three are corrected.
- **768 was missing from the viewport list** — the one width the spec is about.
- **R5's "deep-equal" had no named schema**, so it compared text-box geometry a
  slow webfont fetch would move. Narrowing it is what let the baseline survive
  the #68 merge unchanged.
- **R9 did not name its countries.** Naming them also caught that Armenia — one
  of the three `CLAUDE.md` lists as unfilled — carries a series and would have
  been the wrong pick.
- **"Exactly two media conditions" counted rules this spec does not own**, and
  could not tell a sheet with no media rules from one it was refused permission
  to read.
- **R7 was marked `[x]` with half its criterion unperformed.** Correct, and it is
  now `[~]`.

### Two findings from implementation, worth carrying forward

The measure script's first attempts at R8 and R4 reported failures that were not
defects — a programmatic `.focus()` does not match `:focus-visible`, and both
readings were taken mid-animation (`stepin` 0.5s, `.wz-option`'s `transition:
all 0.18s`). And R12's first acceptance criterion passed against a visibly
broken chart, as did its first attempted fix. In every direction the lesson is
the one `CLAUDE.md` draws about the font `@import`: a check that does not observe
what the browser paints will agree with you.

## Non-goals

- **The header does not go full-bleed.** Measured at 480px inside the column at
  1440, and it stays there. A four-segment progress bar spanning 1920px reads as
  a page loading bar, and the header belongs to the wizard, not to the page. This
  diverges from the option preview this spec was chosen from, deliberately.
- **No device frame, no split hero, no marketing column beside the wizard.** Those
  were the third option in #67 and were not chosen; a wide viewport keeps plain
  ground either side. If the ground still reads as unfinished after this ships,
  that is a new issue with its own canvas.
- **No multi-column composition of the steps.** The result screen's stat cards
  are *already* `gridTemplateColumns: '1fr 1fr'` at every width (probed,
  `ResultScreen.jsx:109`) — the desktop gain there is measure, not a new grid.
- **No light mode.** Dark-only stands.
- **The measure script does not join `npm run verify` or CI.** Spec 0008's
  Non-goal holds for the same reason: `verify` and `ci.yml` must run in a fresh
  clone with no network and no browser download. This is a manual one-off, and
  R6's install line is `--no-save` because of it.
- **No router, no routes, no Next.js.** Issues #24, #15 and #23 are untouched.
- **Step 01's list length is not this spec's problem.** It was 218 rows and
  15,519px tall at 1440 when this spec opened; #66 has since landed (#68) and it
  is a search over 177. It is **still** 12,739px tall at 1440 with an empty query, because the
  search filters a list that is fully rendered until someone types, so R4's
  `wz-footer--anchored` stays. Making step 01 render only its matches is a
  further change and belongs to whoever owns #66's follow-up, not here.
