# 0014 — the wizard can go back

**Status:** in-review
**Depends on:** 0010, 0011, 0012
**Issue:** [#77](https://github.com/apportico/who-gets-replaced-first/issues/77)
**Goal:** the wizard is navigable backwards without losing an answer, and step 02
shows the reader their own words, checked as:
1. From step 04, going back to step 01 and forward again reproduces the same
   result screen without re-entering any answer — verified in a browser at
   1440×900 and 390×844.
2. Typing `paralegal` on step 02 renders that word on screen next to
   `3 · Technicians and associate professionals`.
3. `npm run verify` is green.
4. The data non-negotiables hold — no figure loses its tier, no country is
   imputed, no number is invented to make a screen read better.

## Objective

Today the wizard is a one-way street. A reader who picks the wrong country on
step 01 and notices on step 04 cannot correct it: the only backward move in the
product is **Start again**, and there is no back affordance on any step — a
`grep -n "onBack\|Back" src/components/wizard/WizardShell.jsx` returns one hit
and it is `WebkitBackdropFilter`. There is no router either, so the browser's own
Back button leaves the site. This spec lets a reader revise one answer without
re-entering the other three.

The second half is the same problem one level down. Step 02 renders
`Matched to 3 · Technicians and associate professionals` without naming the word
it read. `CLAUDE.md`'s step-02 contract is that "the resolution is **shown** and
overridable by chip, never silent" — but a reader who typed `legal assistant` and
got `Technicians` cannot tell, from that copy, whether the resolver read their
input or fell back to a default. Naming the input is what makes the resolution
checkable, which is the same rule the tier badges enforce one screen later.

## Source verification

The sources here are the running app and the code that produces it, not an
external API. Every row below was observed on 2026-09-01 against `npm run dev`
at `4895def` + `origin/main`, driven in Chrome and read out of the DOM.

| Source | Probed | Result |
|---|---|---|
| `src/components/wizard/WizardShell.jsx` | `grep -n "onBack\|Back"` | One hit, `WebkitBackdropFilter`. No back control exists |
| Live app, every step | enumerated `button` per step in the DOM | 01: 177 options + `Continue →` · 02: 9 chips + `Resolve title →` · 03: 7 chips + `See the figures →` + `Skip` · 04: 2 accordion triggers + `Start again`. **No back on any step** |
| Live app, header | `document.querySelectorAll('header button').length` | `0` on all five steps — the header carries the dot, the title and `NN/04` and no controls at all |
| Step 02 resolution copy | typed `paralegal`, clicked `Resolve title →` | Rendered `Matched to 3 · Technicians and associate professionals`. The string `paralegal` appears nowhere in `main` |
| `Start again` on step 04 | clicked, then walked forward to 01 | Country **survives** — `United Kingdom` still `aria-selected="true"`, `Continue` enabled. Group, age and education are cleared. **The issue's claim that it "discards the country" is wrong**; it discards three of the four answers |
| Screen-local state across an unmount | after `Start again`, returned to step 02 | Input value `""`, no chip `aria-pressed`. `title` and `tried` are `useState` inside `OccupationScreen`, which is conditionally rendered, so they die with the component |
| Header / footer geometry | `getBoundingClientRect()` at 1512×806 | Header `57.5px` tall on a `640px` column (0012 R2's desktop width); `.wz-footer` `78px`; `.wz-cta` `60px` |
| Router / URL state | `location.href` and `history.length` after reaching step 04 | URL unchanged at `http://localhost:5188/`; `history.length === 2`. There is no route to reuse and browser Back leaves the site — that is issue #79 / spec 0016, and this spec must work without it |

## Requirements

### R1. [ ] Every step after the intro can go back one step

Steps 01, 02, 03 and 04 each carry a control that returns the reader to the
previous step. Step 01 returns to the intro. The control is a single step
backwards, not a reset: `Start again` keeps its current meaning on step 04 and
sits alongside the new control rather than being replaced by it.

**Acceptance:** in a browser, on each of steps 01–04, a control whose accessible
name matches `/back/i` exists and is not in `<header>`; clicking it lands on the
previous step, asserted by the header counter reading `01/04`, `02/04`, `03/04`
respectively (step 01's back lands on the intro, where the counter reads `01/04`
and the `Start →` button is present). Also asserted in
`wizard.render.test.jsx` by walking `04 → 03 → 02 → 01 → intro`.

### R2. [ ] Back is a footer secondary, and the placement decision is recorded

The issue asks for the header-vs-footer call to be made and written down. It is
made here: **back is a secondary control in the step's footer, next to the
primary CTA — not a header control.** Three reasons, all measured in *Source
verification*:

1. The header carries **zero** controls today. It is the wizard's identity and
   position display, and spec 0012's Non-goals keep it column-width and minimal.
   Giving it its first button makes it a toolbar.
2. It is `57.5px` tall and **sticky**, so its height is paid at every scroll
   position on every step including the intro. A control at the 48px touch floor
   makes that ~88px — a 53% growth in the one element that is always on screen,
   on the viewport where vertical space is scarcest.
3. The footer is already where this wizard's navigation verbs live: `.wz-tertiary`
   at `min-height: var(--tap-tertiary)` already carries `Skip` on step 03 and
   `Start again` on step 04. Back joins an existing pattern instead of inventing
   one, and it travels with the CTA through 0012 R4's un-dock above 768px.

**Acceptance:** `document.querySelectorAll('header button').length === 0` still
holds on every step in a browser; each back control resolves to an ancestor
carrying `wz-footer` on steps 01–03. This paragraph is the record the issue asks
for; a reviewer who disagrees is disagreeing with a recorded decision, which
`REVIEW.md` puts out of scope.

### R3. [ ] Going back preserves every answer already given

Moving backwards changes the step and nothing else. Country, ISCO group, age band
and education level all survive a backwards move, and a reader who goes back to
01 and forward again reaches the same result screen.

**Acceptance:** the goal's clause 1, run as a browser walk at 1440×900 and
390×844: reach step 04 with `United Kingdom` / `paralegal` / `25–54` /
`Intermediate`, walk back to 01 and forward again touching no control but the
back buttons and the CTAs, and assert the step-04 DOM text is **identical** to
the first pass (compared string-for-string, not eyeballed). Also asserted in
`wizard.render.test.jsx`.

### R4. [ ] Step 02 names the string the reader typed, verbatim

When the group was resolved from a typed title, the resolution line renders that
title exactly as typed — same casing, same spelling — alongside the group it
resolved to. Nothing is title-cased, corrected or truncated; a title longer than
the column wraps rather than overflowing.

**Acceptance:** the goal's clause 2 — type `paralegal`, resolve, and assert the
rendered text of `main` contains both `paralegal` and
`3 · Technicians and associate professionals`. Casing is checked separately with
a title that resolves: typing `Bookkeeper` renders `Bookkeeper`, not
`bookkeeper`, next to `4 · Clerical support workers`. (`Legal Assistant` is not
the casing case to use — `resolveTitle`'s table has no `legal` keyword, so it
returns `null` and no echo renders at all. That is R6's unresolved path, not
R4's.) Asserted in the browser and in `wizard.render.test.jsx`.

### R5. [ ] Step 02's typed title and step 01's search query survive a round trip

R4 and R1 together force this: `title` and `tried` are local `useState` inside
`OccupationScreen`, which unmounts on every step change (probed — the input
returns empty), so a back move to step 02 would otherwise land the reader on an
empty box under a panel quoting a word the input no longer holds. The same is
true of `CountryScreen`'s `query`: with it lost, a reader who searched for their
country comes back to all 177 rows and has to find their own selection. Both
move into `WizardShell`, which is the component that already owns the answers.

**Acceptance:** in a browser, type `paralegal` on 02, go back to 01, go forward:
the input still reads `paralegal` and the resolution panel still names it. Search
`United Kingdom` on 01, continue, go back: the input still reads
`United Kingdom` and the list is still filtered to that one match. Asserted in
`wizard.render.test.jsx`.

### R6. [ ] Overriding by chip renders no echo

Picking a group from the chips is not typing, so the resolution line must not
claim the reader typed anything. When the group came from a chip the line names
the group without an echo; when a typed title fails to resolve, the existing
"Not resolved" copy is unchanged and nothing is assumed. The chips themselves are
untouched — the resolution stays a suggestion.

**Acceptance:** with an empty input, click chip `4 · Clerical` and assert the
rendered text of `main` names `4 · Clerical support workers` and does **not**
contain `You typed`. Then type `paralegal`, resolve, and click chip
`1 · Managers`: the echo disappears rather than mis-attributing `paralegal` to
group 1. Asserted in `wizard.render.test.jsx`.

### R7. [ ] The back control meets the touch and focus floors

`CLAUDE.md`'s floors apply: tertiary controls are `48px` and nothing interactive
goes below it, the focus ring stays `2px solid var(--accent)` at
`outline-offset: 3px`, and the control is styled from tokens — a raw hex in
`src/components/wizard/` is a review finding.

**Acceptance:** in a browser at 390×844, every back control's
`getBoundingClientRect().height >= 48`; tab to it and assert
`getComputedStyle(el).outlineWidth` is `2px` and `outlineOffset` is `3px` while
it holds keyboard focus — read off the focused element itself, since
`getComputedStyle`'s second argument takes a pseudo-*element* and cannot resolve
the `:focus-visible` pseudo-class; `grep -nE "#[0-9a-fA-F]{3,8}"
src/components/wizard/*.jsx` returns nothing new.

### R8. [ ] The header counter and progress bar track backwards

`NN/04` and the four-segment bar already derive from `step`; going back must move
them back rather than leaving them at the high-water mark.

**Acceptance:** in a browser, at step 04 the counter reads `04/04` and four
segments compute to the accent colour (`getComputedStyle` resolves the token, so
compare against the value `--accent` resolves to, not the literal string
`var(--accent)`); after two back moves it reads `02/04` and two segments do. Measured with the tab **focused** — a backgrounded surface freezes
the `stepin` animation at frame 0 and reads two segments short, which is a
measurement artifact, not a defect.

### R9. [ ] No router and no URL state

The browser Back button still leaves the site after this change, and that is
correct: URL and history state is issue #79 / spec 0016, owned by a different
change, and back must work without waiting on it. This requirement exists so the
boundary is checkable rather than assumed.

**Acceptance:** `grep -rniE "react-router|history\.(push|replace)|pushState|replaceState|location\.hash" src/` returns nothing; `package.json` gains no
dependency; `location.href` is unchanged after walking to step 04 and back.

### R10. [ ] `npm run verify` is green and the suite covers the new behaviour

**Acceptance:** `npm run verify` exits 0 (the pilot self-skips in a worktree with
no `pipeline/raw/` cache — that is expected and is stated in the output). The
render suite gains assertions for R1, R3, R4, R5 and R6 and passes.

## Non-goals

- **URL, router and history state.** Issue #79 / spec 0016. Back is internal
  component state here, exactly as 0010's Non-goals set up.
- **The ~300px of desktop dead space per step.** Spec 0012's territory and a
  separate judgement.
- **Changing what `Start again` does.** It keeps its current behaviour, including
  the probed detail that it preserves the country. Whether that is right is its
  own question; this spec neither relies on it nor changes it.
- **Re-styling or re-ordering the ISCO override chips.** The resolution stays a
  suggestion and a chip still overrides it.
- **A back affordance on the intro.** There is nothing behind it.
