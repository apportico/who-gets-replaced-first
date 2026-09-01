# 0014 — the wizard can go back

**Status:** in-progress
**Depends on:** 0010, 0011, 0012
**Issue:** [#77](https://github.com/apportico/who-gets-replaced-first/issues/77)
**Approved:** Dani (@syymza), 2026-09-02 — given **directly, not as a GitHub
review**. The spec PR ([#85](https://github.com/apportico/who-gets-replaced-first/pull/85))
is self-authored, so GitHub refuses an approval from its author and
`reviewDecision` stays `REVIEW_REQUIRED` regardless. That field is not a signal
on this PR; this line is the record of the approval instead.
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

### R1. [x] Every step after the intro can go back one step

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

### R2. [x] Back is a footer secondary, and the placement decision is recorded

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

### R3. [x] Going back preserves every answer already given

Moving backwards changes the step and nothing else. Country, ISCO group, age band
and education level all survive a backwards move, and a reader who goes back to
01 and forward again reaches the same result screen.

**Acceptance:** the goal's clause 1, run as a browser walk at 1440×900 and
390×844: reach step 04 with `United Kingdom` / `paralegal` / `25–54` /
`Intermediate`, walk back to 01 and forward again touching no control but the
back buttons and the CTAs, and assert the step-04 DOM text is **identical** to
the first pass (compared string-for-string, not eyeballed). Also asserted in
`wizard.render.test.jsx`.

### R4. [x] Step 02 names the string the reader typed, verbatim

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

### R5. [x] Step 02's typed title and step 01's search query survive a round trip

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

### R6. [x] Overriding by chip renders no echo

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

### R7. [x] The back control meets the touch and focus floors

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

### R8. [~] The header counter and progress bar track backwards

`NN/04` and the four-segment bar already derive from `step`; going back must move
them back rather than leaving them at the high-water mark.

**Acceptance:** in a browser, at step 04 the counter reads `04/04` and four
segments compute to the accent colour (`getComputedStyle` resolves the token, so
compare against the value `--accent` resolves to, not the literal string
`var(--accent)`); after two back moves it reads `02/04` and two segments do. Measured with the tab **focused** — a backgrounded surface freezes
the `stepin` animation at frame 0 and reads two segments short, which is a
measurement artifact, not a defect.

**Revised (2026-09-02) — the requirement stands, the instrument changed.** The
behaviour is met and verified: counter and filled segments track
`04→03→02→01→intro` exactly (`04/04`:4, `03/04`:3, `02/04`:2, `01/04`:1, intro:1).
What did not survive contact is `getComputedStyle`. The segments carry
`transition: background 0.4s ease`, so the computed colour is whatever the
transition has reached at the moment of reading, and the tab available here
reported `visibilityState: 'hidden'` throughout — Chrome would not hand the
renderer a new viewport and throttled the transition unpredictably. The same
measurement read **4 accent segments at step 03** once and the correct **2 at
step 02** moments later, in the same walk. A reading that flips is not evidence
either way.

So the segment fill is read off the **inline style React wrote**
(`el.style.background === 'var(--accent)'`), which has no transition to be
mid-way through and is the actual claim R8 makes — which segments the component
considers filled. The counter, which has no transition, is still read from
rendered text. Recorded rather than quietly swapped, because a spec that says
`getComputedStyle` while the check does something else is the failure mode
`CLAUDE.md` keeps warning about.

### R9. [x] No router and no URL state

The browser Back button still leaves the site after this change, and that is
correct: URL and history state is issue #79 / spec 0016, owned by a different
change, and back must work without waiting on it. This requirement exists so the
boundary is checkable rather than assumed.

**Acceptance:** `grep -rniE "react-router|history\.(push|replace)|pushState|replaceState|location\.hash" src/` returns nothing; `package.json` gains no
dependency; `location.href` is unchanged after walking to step 04 and back.

### R10. [x] `npm run verify` is green and the suite covers the new behaviour

**Acceptance:** `npm run verify` exits 0 (the pilot self-skips in a worktree with
no `pipeline/raw/` cache — that is expected and is stated in the output). The
render suite gains assertions for R1, R3, R4, R5 and R6 and passes.

## Verification

**Run 2026-09-02**, against `npm run dev` on this branch. Nine `[x]`, one `[~]`.

### How the two viewports were actually reached

Worth recording, because the obvious route does not work. `resize_window`
**reports success and changes nothing that matters**: it resized the OS window
(`outerWidth` 1512 → 728) while the tab kept `innerWidth: 1512`, because the tab
was `visibilityState: 'hidden'` and Chrome never re-laid-out the renderer. Media
queries therefore never re-evaluated, and a measurement taken then would have
been the desktop layout wearing a mobile label — a false pass, silently.

What worked is an **iframe of the app at a fixed pixel size**, served same-origin
off the dev server so it can be scripted into. An iframe gets its own viewport,
so `@media (min-width: 768px)` evaluates against the iframe, not the window. Both
viewports were confirmed genuine before anything was measured through them:

| Iframe | `innerWidth` × `innerHeight` | `--column` | `h1`/`h2` | Reading |
|---|---|---|---|---|
| 390×844 | 390 × 844 | `480px` | `h1` 66px | mobile values — below the breakpoint |
| 1440×900 | 1440 × 900 | `640px` | `h2` 54px | 0012 R2/R3's desktop values |

The harness was a single untracked `mobile-harness.html`, deleted after the run;
`git status` is clean of it.

### Per-requirement result

| Req | Mark | Evidence |
|---|---|---|
| R1 | `[x]` | Browser: `04/04 → 03/04 → 02/04 → 01/04 → intro`, one click each, labels `Back to the optional questions` / `question 02` / `question 01` / `the introduction`. Intro has no back (`back: false`, `start: true`). Suite: `0014 R1` walks the same path |
| R2 | `[x]` | `header button` count `0` on all five steps at both viewports. Back resolves to a `.wz-footer` ancestor on 01–03; step 04 has no footer, so its row sits inline with `Start again` as planned |
| R3 | `[x]` | Browser `04→01→04` touching only back and the CTAs: step-04 `main` text **identical**, `resultIdentical: true`. Every tier badge and year came back unchanged, which is the data-rule half of this check. Suite asserts the same string-for-string |
| R4 | `[x]` | Renders `You typed paralegal → matched to 3 · Technicians and associate professionals` at both viewports (see `step02-390.png`, `step02-1440.png`). Casing: `Bookkeeper` → `Bookkeeper`, not `bookkeeper` |
| R5 | `[x]` | After back-and-forward: job title still `paralegal` and the panel still names it; country search still `United Kingdom` with `matches: 1` and `United Kingdom` still `aria-selected` |
| R6 | `[x]` | Chip with an empty input → `Set to 1 · Managers`, `hasYouTyped: false`. Type `paralegal`, resolve, then chip `1 · Managers` → echo drops rather than mis-attributing |
| R7 | `[x]` | Back is `48px` tall × `86px` wide at both viewports. Real `Tab` keypress from the CTA lands on it: `focusVisible: true`, `outline: 2px solid rgb(255, 90, 43)`, `outline-offset: 3px`. No new raw hex in `src/components/wizard/*.jsx` (the three matches are pre-existing token assertions in `computed.test.jsx`) |
| R8 | `[~]` | Behaviour verified; the instrument changed from `getComputedStyle` to the inline style. Reason under R8 |
| R9 | `[x]` | `grep -rniE "react-router\|history\.(push\|replace)\|pushState\|replaceState\|location\.hash" src/` → the only hit is the assertion in `wizard.render.test.jsx` naming the packages it forbids. `react-router`, `react-router-dom`, `wouter` all `absent`. `location.href` unchanged after walking to 04 and back; `history.length` stays `2` |
| R10 | `[x]` | `npm run verify` → `verify PASSED`. Front-end suite `153 passed (153)`; pipeline suite `159 passed`. Pilot self-skipped (no `pipeline/raw/` in a worktree), as designed |

### Step 03 and step 04 share a row, checked properly

The first attempt compared the **tops** of back and `Skip`, which differ by ~8px
because the two controls are different heights inside a centre-aligned flex row —
it reported `sameRow: false` for a row that is plainly a row. Re-measured on
adjacency and centres:

| Viewport | Step | Side by side | Centres aligned | Heights | Gap |
|---|---|---|---|---|---|
| 390×844 | 03 | yes | yes | 48 / 65 | 10px |
| 390×844 | 04 | yes | yes | 48 / 56 | 10px |
| 1440×900 | 03 | yes | yes | 48 / 49 | 10px |

`Skip` wraps to two lines at 390px (65px tall) and stays one line at 1440px. Both
stay above the 48px floor, and `documentElement.scrollWidth === 390` — no
horizontal overflow. Above the breakpoint the footer is `position: static` with
`background-image: none`, so 0012 R4's un-dock still holds with the back control
inside it.

## Implementation Plan

**Planned:** 2026-09-02

### Files to create

None. Every change lands in files that already exist — this is a wizard that
already has four screens and a shell that already owns the answers.

### Files to modify

| File | Change |
|---|---|
| `src/styles/index.css` | `.wz-back` (the control) and `.wz-actions` (the secondary row it sits in), both from tokens, at the `--tap-tertiary` floor |
| `src/components/wizard/WizardShell.jsx` | Lift step 01's `query` and step 02's input state out of the screens; pass `onBack` to steps 01–04 |
| `src/components/wizard/CountryScreen.jsx` | Take `query` / `onQuery` as props; render the back control in the footer |
| `src/components/wizard/OccupationScreen.jsx` | Take the lifted input state; render the verbatim echo; render back |
| `src/components/wizard/OptionalScreen.jsx` | Render back alongside `Skip` in one secondary row |
| `src/components/wizard/ResultScreen.jsx` | Render back alongside `Start again` |
| `src/components/wizard/wizard.render.test.jsx` | Assertions for R1, R3, R4, R5, R6 |

### The one design decision inside the code

Step 02's input state moves into the shell as **one object**, not three
`useState`s:

```js
const [occ, setOcc] = useState({ title: '', tried: false, echo: null })
```

`echo` is the load-bearing field and it is deliberately not derived from `title`.
It holds the string the *current* resolution was made from, so it is set on a
successful resolve and cleared when a chip overrides — which is exactly what R6
needs, and what a naive `echo = title` would get wrong: type `paralegal`, resolve,
then click `1 · Managers`, and a derived echo would report that you typed
`paralegal` to reach Managers. `group` stays a separate piece of state because it
is the *answer*; `occ` is how the reader got to it.

### Sequence

1. **CSS** — `.wz-back` and `.wz-actions`. Nothing depends on this but everything
   renders through it, so it is first. (R2, R7)
2. **Shell** — lift `query` and `occ`; add `onBack={() => go(n - 1)}` to steps
   01–04. Each handler changes `step` and nothing else; that *is* R3. (R1, R3, R5)
3. **CountryScreen** — `query`/`onQuery` props replace the local `useState`;
   `active` stays local, since an arrow-key position is not an answer. Back goes
   in the existing `wz-footer wz-footer--anchored`. (R1, R5)
4. **OccupationScreen** — consume `occ`; render the echo; back in the footer. (R1, R4, R5, R6)
5. **OptionalScreen** — back and `Skip` share one `.wz-actions` row under the CTA. (R1)
6. **ResultScreen** — back and `Start again` share one row. This screen has no
   `wz-footer`; the row stays inline where `Start again` already is. (R1)
7. **Tests** — extend `wizard.render.test.jsx`. (R10)
8. **`npm run verify`**, then the browser walk at 390×844 and 1440×900. (R3, R7, R8, R9, R10)

### Requirement mapping

| Req | How it will be satisfied | Where | How acceptance is checked |
|---|---|---|---|
| R1 | `onBack` on steps 01–04, one step back each | `WizardShell.jsx` + all four screens | Browser walk `04→03→02→01→intro` reading the header counter; `wizard.render.test.jsx` |
| R2 | Control rendered inside the footer, never in `<header>` | the four screens | `document.querySelectorAll('header button').length === 0` in the browser |
| R3 | Back handlers set `step` and touch no other state | `WizardShell.jsx` | Step-04 DOM text compared string-for-string across a `04→01→04` round trip |
| R4 | `occ.echo` rendered verbatim next to `groupDisplay(group)` | `OccupationScreen.jsx` | `main` text contains `paralegal` **and** `3 · Technicians and associate professionals`; `Bookkeeper` keeps its casing |
| R5 | `query` and `occ` lifted into the shell | `WizardShell.jsx`, `CountryScreen.jsx`, `OccupationScreen.jsx` | Type, go back, go forward — input values survive; asserted in both browser and suite |
| R6 | Chip click sets `echo: null` | `OccupationScreen.jsx` | After a chip, `main` names the group and does **not** contain `You typed` |
| R7 | `.wz-back` at `min-height: var(--tap-tertiary)`, focus ring untouched | `index.css` | `getBoundingClientRect().height >= 48`; `outlineWidth`/`outlineOffset` on the focused element; no new hex in `src/components/wizard/` |
| R8 | Already derived from `step` — verified, not built | `WizardShell.jsx` (unchanged logic) | Counter and accent segment count read in a **focused** browser tab |
| R9 | Nothing added | — | `grep -rniE "react-router\|pushState\|..." src/` empty; `package.json` unchanged |
| R10 | Suite extended | `wizard.render.test.jsx` | `npm run verify` exits 0 |

### Tier and vintage handling

**Not applicable, and that is a checked claim rather than an omission.** This
change produces no number. The echo renders a string the reader typed; navigation
moves `step`. Every figure on step 04 keeps the tier and year it already carries,
and R3's string-for-string comparison of the step-04 DOM across a round trip is
what proves it — a tier or year that changed would fail that check.

### Validation

The pipeline is untouched, so `[validate]`, `[crosscheck]` and `[outliers]` have
nothing to say here and no new pipeline check is needed. The coverage that
matters is `wizard.render.test.jsx`, which mounts the real shell against the real
payload — plus the browser walk, because `REVIEW.md` Pass 7 is explicit that a
passing build is not evidence a page renders.

### Risks

- **The step-04 comparison is the strictest check here and may catch something
  unrelated.** Radix accordion state resets on remount, so the comparison must be
  taken with the accordions in the same state on both passes. If it fails on
  something that is genuinely not an answer, that is an R3 revision to record, not
  a check to loosen.
- **Three stacked controls on step 03.** CTA (60px) + a 48px secondary row is
  ~120px of sticky footer at 390×844. If it crowds the bands, the fix is the row
  layout, not dropping back — and it is why back and `Skip` share a row rather
  than stacking.
- **`prefers-reduced-motion` and the frozen-animation trap.** `.wz-step` is
  `animation: stepin ... both`, so an unfocused tab screenshots every step blank
  and reads the progress bar short. Every browser measurement must be taken with
  the tab focused, or R8 will produce a false failure.

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
