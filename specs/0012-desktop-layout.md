# 0012 — desktop layout

**Status:** approved
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

### R1. [ ] One breakpoint, declared once, at 768px

The stylesheet gains a **single** `@media (min-width: 768px)` block, and every
desktop value in this spec lives inside it. 768px is not a new number: spec 0008
R11 recorded *"768px is R1's desktop baseline"*, and the probe shows 768 is
already 37.5% empty ground, so it is where the phone layout has stopped being
the right answer.

**Acceptance:** enumerating `CSSMediaRule`s from inside the browser (the check
`CLAUDE.md` requires, not a `grep` of the source) returns exactly **two**
conditions — `(prefers-reduced-motion: reduce)` and `(min-width: 768px)` — at
every viewport in R6's list. A second width breakpoint is a review finding.

### R2. [ ] The column grows to 640px above the breakpoint

`--column-wide: 640px` joins `--column: 480px` as a layout token, and the wrapper
in `WizardShell.jsx:79` resolves to the wide value above the breakpoint. Both are
tokens; neither is a literal in a component, per 0010 R2.

**Acceptance:** R6's script reports the measured column as **640** at 1024, 1440
and 1920, and **480** at 375, 480 and 767. `documentElement.scrollWidth ===
innerWidth` at all six, so the wider column introduces no horizontal scroll.

### R3. [ ] The display scale grows with the column

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
375, 480 and 767 and **78px** at 1024, 1440, 1920; `.wz-h2` **46px** → **54px**;
a stat figure **38px** → **44px**. The h1 renders on no more than three lines at
1440.

### R4. [ ] The CTA un-docks above the breakpoint

`.wz-footer` drops to `position: static` above the breakpoint and loses its
gradient fade, so the primary action on steps 01–03 is an inline button in the
flow rather than a 640px slab pinned to the bottom of a 900px window. The intro
is already inline (probed) and does not change.

**Acceptance:** R6's script, driven to step 01, reports `.wz-footer` computed
`position` as **`sticky`** at 375/480/767 and **`static`** at 1024/1440/1920, at
all six the CTA's measured height is **≥ 60px**, and at 1440 the dock's box
bottom is **not** equal to `innerHeight`.

### R5. [ ] Below the breakpoint, nothing moves

The phone layout is the primary surface and this change may not touch it. The
375 and 480 rows of R6's report must match a baseline committed from `main`
before any CSS changes.

**Acceptance:** `scripts/desktop-baseline.json` is generated from `main` at
`91ec0f6` and committed. After the change, R6's script re-run at 375 and 480
produces rows **deep-equal** to that file — column 480, h1 66px, h2 46px, CTA
60px, dock `sticky`, `scrollWidth === innerWidth`, zero page errors — and the
script exits non-zero on any difference.

### R6. [ ] The measure script is restored, committed and documented

`scripts/desktop-measure.mjs` returns the browser-measurement path `ada3897`
deleted, rebuilt around the wizard instead of the map: six viewports (375, 480,
767, 1024, 1440, 1920), `playwright-core` installed `--no-save`, Chrome from
`CHROME_PATH` or the macOS default, `--json`, and **`EXPECTED_TITLE` asserted
before a single measurement is taken** — spec 0008 recorded a run that measured
a different project on port 5173 and produced entirely plausible numbers.

**Acceptance:** with `npm run dev` running,
`npm install --no-save playwright-core && node scripts/desktop-measure.mjs`
prints a row per viewport and exits **0**; it exits **non-zero** on a title
mismatch (verifiable by pointing `APP_URL` at any other page) and non-zero on any
R2–R5 threshold breach. `playwright-core` does **not** appear in `package.json`.

### R7. [ ] The desktop layout is clean at every width

No horizontal scroll, no console errors, no overlapping or clipped elements at
any of the six viewports.

**Acceptance:** at all six, `documentElement.scrollWidth === innerWidth` and the
script's collected `pageerror` + `console.error` list is **empty**. Screenshots
at 375, 768, 1440 and 1920 are attached to the implementation PR.

### R8. [ ] The accessibility floors hold at every width

Touch targets, the focus ring and reduced motion are width-independent. 0008's
floors and 0010 R5's targets survive: primary CTA ≥60px, options and secondary
≥56px, tertiary ≥48px, focus `2px solid #FF5A2B` with `outline-offset: 3px`, and
the four keyframes suppressed under `prefers-reduced-motion`.

**Acceptance:** `computed.test.jsx` and `tokens.test.js` stay green, and R6's
script additionally reports, at **all six** viewports, `.wz-cta` height ≥60,
every `.wz-option` height ≥56, and a focused CTA computing `outline-width: 2px`
with `outline-color: rgb(255, 90, 43)`.

### R9. [ ] The data surface is identical at every width

This is the rule `CLAUDE.md` puts hardest on the result screen: a layout change
must not alter a figure, a tier badge, a `no series` result or a stand-in
notice. Nothing here produces a number, and nothing here may change one.

**Acceptance:** R6's script drives to step 04 for one country with a series and
one without, at 375 and at 1440, and asserts the result card's rendered stat
figures and the full set of tier badge strings (`OFFICIAL` / `DERIVED` /
`PROXY` / `MODELED`) are **string-identical** between the two viewports. A
figure that appears at one width and not the other fails the requirement.

### R10. [ ] The tests that pin 480px describe the new contract

`tokens.test.js:210` and `computed.test.jsx:262` currently assert a single 480px
column. They are updated to assert **both** tokens and the breakpoint's
existence, so the guard keeps working rather than being deleted to make the
build pass.

**Acceptance:** `tokens.test.js` asserts `--column: 480px`, `--column-wide:
640px` and a `min-width: 768px` media query in the stylesheet;
`computed.test.jsx` asserts the base computed token is still `480px` (jsdom
applies no media query, which is the honest jsdom-side check). `npm run verify`
is green.

### R11. [ ] The desktop contract is written down where the canvas cannot say it

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
- **Step 01 stays a list of 218.** The scroll height is 15,511px at 1440 and that
  is genuinely bad, but it is issue #66's search, not a width problem.
