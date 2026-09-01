# 0015 — share card, methodology page, and an h1

**Status:** in-progress
**Approved:** Dani (VP Engineering), 2026-09-02, **directly rather than as a GitHub review**. PR [#84](https://github.com/apportico/who-gets-replaced-first/pull/84) is self-authored, so GitHub cannot record the approval and `reviewDecision` stays `REVIEW_REQUIRED` — on this PR that field is not a signal about whether the spec was reviewed. The review that exists on the PR is the author's own `COMMENT` pass against `REVIEW.md`.
**Depends on:** 0010 (the wizard and its result screen), 0011 (country search), 0012 (the 768px breakpoint)
**Issue:** [#78](https://github.com/apportico/who-gets-replaced-first/issues/78)
**Absorbs:** [#13](https://github.com/apportico/who-gets-replaced-first/issues/13) (methodology page) and [#25](https://github.com/apportico/who-gets-replaced-first/issues/25) (social preview cards) — #78 says to close both if this lands covering them. R2/R3 cover #13; R4 covers the site-level half of #25, and its per-country half is **not** covered, for the reason in *What the probes rule out*. So #25 closes only if that partial coverage is accepted; otherwise it stays open, narrowed to the part no static host can do.
**Goal:** The result survives leaving the site, checked as:
1. A result screen has exactly one `h1`, and no screen skips a heading level.
2. A methodology page is reachable from the result in one click — a page, not a
   third accordion — and states the no-date refusal in full.
3. A generated share image for *Technicians · United Kingdom* carries every
   figure with its tier and the clerical stand-in disclosure, states **no year**,
   and is verified by looking at the rendered image rather than at the code.
4. OG and Twitter card meta resolve correctly under the `/who-gets-replaced-first/`
   base path.
5. `npm run verify` green, and no figure reaches the card or the page without the
   tier it was given.

## Objective

The result screen is the one artefact of this project that will be seen with no
context at all — the design proposal says it is "designed to be screenshotted,
because it will be, with or without permission". Today it is unequipped for
that: pasting the link gives the recipient the intro screen with no preview
card, screenshotting gives an image whose tier badges survive only by accident
of cropping, and a reader who wants to know what `DERIVED` means has two
accordions and no page to be sent to. This spec makes the number portable
*without* making it less honest — the share card carries the tiers and the
stand-in disclosure or it does not ship, and it never states a year. It also
fixes a plain accessibility defect spec 0008's pass missed: steps 01–04 have no
`h1`, so the document outline starts at `h2` on every screen a reader actually
lands on.

## Source verification

Every row here was probed in this worktree on **2026-09-01**, against the app at
`localhost:5199` (dev server) and the built `dist/`, not against the live site
except where stated.

| Source | Probed | Result |
|---|---|---|
| Live result screen, heading outline | Chrome, `document.querySelectorAll('h1').length` per step, 2026-09-01 | **Intro `h1` = 1** ("What the data says about your work."); steps 01, 02, 03, 04 all **`h1` = 0**, top heading `h2`. The issue's "0 across the whole app, every step" is right for the four wizard steps and **wrong for the intro** — recorded here rather than inherited |
| Live result screen, social meta | Chrome, `meta[property^="og"]` / `meta[name^="twitter"]`, 2026-09-01 | **0 and 0.** Confirms the issue |
| Result payload, *Technicians · United Kingdom* | Walked the wizard in Chrome to step 04, 2026-09-01 | Share **14.1%** `DERIVED` 2025 · headcount **4.77M** `DERIVED` 2025 · trend **10.0 → 8.9% · −1.2 pp · 2013–2025** `DERIVED`, carrying "Clerical support workers shown as a stand-in — no time series is published for this group." **No year anywhere on the screen** |
| Vite base-path rewriting of `meta[content]` | Added `<meta property="og:image" content="/probe-rel.png">` to `index.html`, ran `vite build`, read `dist/index.html`, 2026-09-01 | **Not rewritten.** `content` came through as `/probe-rel.png` verbatim, which under the `/who-gets-replaced-first/` base resolves to a 404 at the domain root. A `<link rel="probe" href="/probe-link.png">` was *also* left alone, while the existing `rel="icon"` **is** rewritten — Vite rewrites a known set of `rel` values and never touches `meta content`. So `og:image` must be a hardcoded absolute URL |
| Vite multi-page build | Added a second `rollupOptions.input` entry and a stub `methodology-probe.html`, ran `vite build`, 2026-09-01 | **Works.** `dist/index.html` and `dist/methodology-probe.html` both emitted. A real methodology page needs no router — 0010's Non-goals stand |
| Canvas 2D + the site's webfonts | Chrome, `await document.fonts.ready` then `measureText` on the result page, 2026-09-01 | **Instrument Serif renders into a canvas.** `"14.1%"` at `400 64px "Instrument Serif"` measured **107.78px** against **165.31px** for generic `serif` — the webface applied, it is not a silent fallback. `document.fonts.check` true for Instrument Serif, Geist and Geist Mono. A 1200×630 PNG encoded to ~41KB via `toDataURL` |
| Browser share/download surface | Chrome, same page, 2026-09-01 | `navigator.share` `function`, `navigator.canShare` `function`, `navigator.clipboard.write` `function`, `devicePixelRatio` 2. All present, none required — the download path needs only an anchor and a blob URL |
| GitHub Pages hosting model | `gh api repos/apportico/who-gets-replaced-first/pages`, `curl` the live site, 2026-09-01 | `html_url` `https://apportico.github.io/who-gets-replaced-first/`, `build_type` `workflow`. Static artefact upload, **no server and no prerender** — `deploy.yml` uploads `dist/` and nothing executes per request |

### What the probes rule out

The hosting probe settles the shape of R4 before it is written. Social crawlers
do not execute JavaScript, and there is no server to render per-result meta, so
**per-result OG tags are not achievable on this host** — not by this spec and
not by the URL-state work on #79 either. R4 is therefore written for *site-level*
meta and a *static* preview image, and R5 gives the reader the per-result image
through the page rather than through the crawler. Writing R4 as "the shared link
previews the reader's own result" would be a requirement no probe supports.

## Requirements

### R1. [x] Every screen has exactly one `h1`, and the outline never skips a level

Each of the five screens gets one `h1` as its top heading. The intro already has
one and keeps it. Steps 01–04 promote their current `h2` to `h1`; the result
screen's `h1` is the figure sentence ("14.1% of United Kingdom's workers", or
"No published figure" where there is none). Any heading below the top on the same
screen is `h2`, so no level is skipped. The visual scale must not move — the
existing `wz-h1` / `wz-h2` type sizes stay attached to the *look*, not to the tag,
so the display scale of 0012 R3 is unchanged at both widths.

**Acceptance:** for each of the five screens, in a real browser,
`document.querySelectorAll('h1').length` is **1**; and the sequence of heading
levels on each screen, read in document order, never increases by more than one.
Checked on the result screen for *Technicians · United Kingdom* at both 375px and
1440px, and asserted in the vitest suite for all five screens.


**Done (2026-09-02).** Measured in Chrome against the running app, all five
screens: `h1` count **1** on each, and the result screen's outline reads
`H1 H2 H2` — no skipped level. Re-measured inside a 375px iframe (see the note
below) and it holds there too: `{"frameInnerWidth":375,"h1":1,"outline":"H1 H2 H2"}`.

The accordion was the trap. Radix's `AccordionHeader` renders `Primitive.h3`,
which was correct under an `h2` and became a skipped level the moment the result
heading was promoted — h1 straight to h3. Rendered `asChild` as an `h2` in
`accordion.jsx`, with the divergence from upstream noted at the top of the file
per CLAUDE.md rule 4.

Six tests added to `wizard.render.test.jsx`, and **both canaried**: reverting the
accordion to `h3` fails with `expected 2 to be less than or equal to 1`, and
reverting step 01 to `h2` fails the `01 country` case. The type scale did not
move — the promoted elements keep the `wz-h2` **class**, asserted directly.

**Correcting the issue's measurement:** #78 records `h1: 0` for "the whole app,
every step". The intro screen already had exactly one; it is steps 01-04 that had
none. The defect was real and one screen smaller than reported.

**Follow-up from the merge (2026-09-02).** Merging `origin/main` brought in spec
0016's test for R3, which asserted "the intro is not painted" as
`queryByRole('heading', { level: 1 })` is null. That was only ever a proxy: it
worked because the intro was the **only** screen with an `h1`, which is exactly
what this requirement changes. After the merge it matched the result screen's own
headline and failed for the opposite of its intent. Repaired to ask 0016's
question directly — the intro's headline text is absent, and the `h1` that *is*
present belongs to the result — which is strictly stronger, because it would also
catch an intro frame rendered with no heading at all. 0016's requirement is
unweakened; only the assertion changed.

### R2. [x] A methodology page exists as a real page, not a third accordion

A second built page at `/who-gets-replaced-first/methodology.html`, emitted by a
second Vite entry rather than by a router — 0010's Non-goals keep the wizard
router-free, and #79 owns URL state. It carries its own `h1`, the site's tokens
and type, and states, in this order: the four-tier vocabulary (`OFFICIAL`,
`DERIVED`, `PROXY`, `MODELED`) in the words of `CLAUDE.md`'s table; what each
figure on the result screen is derived from and from which source; and what the
site refuses to say.

**Acceptance:** `npm run build` emits `dist/methodology.html`; the page has
exactly one `h1`; its text contains all four tier names; and it renders in the
project palette rather than unstyled — verified by screenshot, not by the build
exiting 0.


**Done (2026-09-02).** `npm run build` emits `dist/methodology.html` from a
second `rollupOptions.input` entry — no router, so 0010's Non-goals stand and
#79 is untouched. The built page carries the processed stylesheet with the base
path applied (`/who-gets-replaced-first/assets/styles-*.css`) and **no JS
bundle at all**.

Palette confirmed by reading computed styles in the browser rather than by
screenshot alone: `body` background `rgb(13, 12, 10)` = `--bg`, colour
`rgb(232, 228, 218)` = `--fg`, `.wz-card` `rgb(22, 20, 17)` = `--surface`,
`h1` in Instrument Serif, body in Geist, badges in Geist Mono. One `h1`, outline
`H1 H2 H2 H2 H2`. All four tier names present, asserted by `check-meta.mjs`.
Screenshots at both widths in `.snapshots/0015/`.

### R3. [x] The methodology page states the no-date refusal in full

The `[!]` on 0010 R13 is the site's main claim to credibility and it goes on the
page in full: that no source publishes a displacement date per occupation, that
this was probed on 2026-08-31, what the nearest published work actually is
(US-only decadal occupational churn, on US census classifications — not ISCO-08,
not per country, not AI displacement), and that reviving a date as `MODELED`
would need its own formula and sensitivity analysis. It is a section of its own,
not a footnote.

**Acceptance:** the rendered page contains the refusal as a distinct section with
its own heading, naming the 2026-08-31 probe and the reason. Read on the rendered
page, and asserted by a test that greps the built HTML for the sentence.


**Done (2026-09-02).** "What this site refuses to say" is its own section with
its own `h2`, stating the refusal, that it applies **in any tier**, the probe
date (31 August 2026), what the nearest published work actually is (US decadal
occupational churn on US census classifications — not ISCO-08, not per country,
not AI displacement), and that reviving a date as `MODELED` would need its own
formula and sensitivity analysis.

`check-meta.mjs` asserts **five separate load-bearing phrases** rather than one
matchable sentence, so a rewrite cannot quietly drop half the argument.
Canaried: changing "31 August 2026" to "last year" fails with
`R3 requires the date the probe was run`.

### R4. [x] Site-level OG and Twitter meta, correct under the base path

`index.html` and `methodology.html` each carry `og:title`, `og:description`,
`og:type`, `og:url`, `og:image`, `twitter:card` (`summary_large_image`),
`twitter:title`, `twitter:description` and `twitter:image`. Every URL is
**absolute** — `https://apportico.github.io/who-gets-replaced-first/…` — because
the probe above showed Vite never applies the base path to `meta content`, and
because crawlers require absolute image URLs regardless. The preview image is a
committed static PNG in `public/`, 1200×630, and it says what the site is; it
does **not** show a result, since no probe supports a per-result preview on a
static host.

**Acceptance:** after `npm run build`, `dist/index.html` and
`dist/methodology.html` each contain **every one of the nine named tags above,
by name** — a count is not the check, because nine wrong tags would pass it —
and **every** `content` that is a URL starts with
`https://apportico.github.io/who-gets-replaced-first/`. Asserted by a test over
the built files, so the failure the probe found cannot return silently. The
referenced image resolves to a file present in `dist/`.


**Done (2026-09-02).** Nine named tags on both built pages, every URL absolute
under `https://apportico.github.io/who-gets-replaced-first/`, and the referenced
image present in `dist/`. `public/og.png` is 1200×630 — exactly what its
`og:image:width`/`height` declare, rather than the 2× the reader's card uses.

`scripts/check-meta.mjs` runs **after the build** in `verify.sh`, which is the
whole point: the probed defect exists only in the built output. Canaried three
ways, all three fire:

```
og:image content "/og.png" is not absolute under https://apportico.github.io/who-gets-replaced-first/
missing <meta> twitter:image
R3 requires the date the probe was run — "31 August 2026" is absent
```

It checks each tag **by name**, not by count, per the self-review finding: nine
wrong tags would have passed a count.

### R5. [x] A share image is generated for the reader's own result

A control on the result screen generates a 1200×630 PNG of the reader's result,
drawn client-side into a canvas with the site's own fonts and palette, and hands
it to the reader (download, and `navigator.share` where the browser offers it).
No new runtime dependency — the probe confirmed Canvas 2D renders Instrument
Serif, Geist and Geist Mono. It renders at `devicePixelRatio`-independent 2×
scale so the text is not soft. Where a figure is absent on screen it is absent on
the card, stated in words, never as a dash or a zero.

**Acceptance:** on the result screen for *Technicians · United Kingdom*, the
control produces a PNG whose intrinsic size is **2400×1260** — the 1200×630 card
drawn at 2× — and the **rendered image is opened and looked at** — its text reads `14.1%`, `4.77M` and
the trend, in the project's own typefaces, not in a fallback stack. The PNG is
committed to `.snapshots/0015/` as evaluation evidence.


**Done (2026-09-02).** `ShareCardButton` on the result screen draws the model
into a canvas and hands the reader a PNG, offering `navigator.share` first where
the browser can share files and falling back to a download.

Generated for *Technicians · United Kingdom* and the PNG is **2400×1260**
intrinsic (the 1200×630 card at 2×), 221KB. The fonts were verified by
measurement, not by `fonts.check`: `{"loaded":true,"withFace":107.78,"fallback":165.31}`
— the same figures the spec's probe recorded, so the card is genuinely in
Instrument Serif and not silently in Georgia.

**The image was opened and looked at**, which is what this acceptance asks for
and is how two layout defects were found that the code did not show: the display
headline sat one line-height under the subject (fixed, 34 → 52), and the site
card had ~300px of dead space in the middle (fixed). Committed as
`.snapshots/0015/share-card-technicians-gbr.png`.

### R6. [x] The share image carries every tier and the stand-in disclosure

Each figure on the card carries the tier it was given by the same code that
feeds the screen — `DERIVED` for all three figures in the UK Technicians case —
and the card reproduces the clerical stand-in disclosure verbatim where the trend
is a stand-in: "Clerical support workers shown as a stand-in — no time series is
published for this group." The card never invents a tier and has no default:
a figure whose tier is null is not drawn. It also carries a URL, so the image
out of context can be traced back to the method.

**Revised mid-run (2026-09-02).** This originally read: until #79 lands, the URL
is the site root, and the card "is built to take a result URL the moment one
exists". #79 landed during this run — spec 0016 merged as #83 — so the card now
carries `location.href`, the reader's actual result link, from the same source
0016's own `CopyLink` uses. The fallback to the site root remains for a falsy
`href`. The requirement is unchanged; the condition it was waiting on was met.

**Acceptance:** for *Technicians · United Kingdom*, the rendered PNG shows
`DERIVED` next to each of the three figures and the full stand-in sentence,
confirmed **by looking at the image**. Separately, a unit test over the card's
layout model asserts that a figure with a null tier is omitted and that a
stand-in trend always emits the disclosure string — so the guarantee is checked
by machine as well as by eye.


**Done (2026-09-02).** Read off the rendered image: three figures, each with a
`DERIVED` badge and its vintage (`2025`, `2025`, `2013–2025`), and the stand-in
sentence in full — "Clerical support workers shown as a stand-in — no time
series is published for this group." The card carries the site URL.

The machine half runs over **every country × all nine groups**, not just the UK
cell, because the interesting cells are the ones with a missing figure or a
stand-in series and one hand-picked example misses exactly those:

- no figure on any card, for any cell, is drawn without a tier (offenders `[]`)
- every tier used is one of the project's four
- every non-clerical group with a series carries the stand-in disclosure
- a country with no published share drops the figure and states the absence in
  words, with the headline falling back to "No published figure"

A late correction worth recording: the site OG card first drew "177 countries"
and "9 groups" as **tiered stat cards**. Neither is a measurement, so both were
inventing provenance — on the most-shared surface the site has. Replaced with a
legend of the four tier words, captioned as a vocabulary rather than as
figures.

### R7. [x] The share image never states a year

0010 R13 is `[!] not feasible` and R14 requires the result to read as finished
without a date; an image is not an exemption. The card carries **no** projected
year, no interval, no scenario and no placeholder where one would sit. Vintages
are not this: `2025` as the vintage of a measured figure is a per-field year the
data rules *require*, and it stays, labelled as a vintage. What is forbidden is a
year presented as when replacement happens.

**Acceptance:** a test asserts that **every** four-digit year token in the
card's text model traces to a vintage or to a trend-series endpoint — a
whitelist, not a blacklist of future years. A blacklist keyed on "later than
today" is the wrong shape twice over: it would pass a card stating 2030 once
2031 arrives, and it would fail the trend's own 2013–2025 endpoints if written
loosely. Confirmed by reading the rendered image: no date is offered as an
outcome.


**Done (2026-09-02).** `allowedYears` is a whitelist: every four-digit token in
the card's text must trace to a figure's vintage or to an endpoint of the series
being drawn. Asserted across every country × group; offenders `[]`.

Two supporting checks, because a whitelist alone can pass vacuously: the UK card
is asserted to actually contain years (`allowedYears` = `[2013, 2025]`), and a
canary pushes "Replacement expected by 2041." into the model and confirms 2041
is rejected. A second, independent angle asserts no card anywhere contains a
year later than the latest vintage in the payload.

The whitelist shape came out of the self-review on PR #84: the original
acceptance was a blacklist ("no year later than today"), which would pass a card
stating 2030 once 2031 arrives. This also forced a real change to the card — the
trend label is `Share since ${first.year}`, derived, not the screen's hardcoded
"Share since 2013", because on a country whose series starts later the hardcoded
label names a year the series never reaches. The check caught a small lie.

### R8. [x] The methodology page is reachable from the result in one click

A single control on the result screen goes to the methodology page — one click,
above the fold on mobile is not required but "buried in a footer" is
disqualifying. It is a real link with an `href`, so it can be opened in a new tab
and is followed by a crawler, not a button that scripts a navigation.

**Acceptance:** on the result screen, an `<a href>` pointing at
`methodology.html` is present and reachable by keyboard, and clicking it in a
browser lands on the methodology page. Verified in Chrome at 375px and 1440px.


**Done (2026-09-02).** A real `<a href="methodology.html">` on the result
screen, `tabIndex` 0, above "start again". **Clicked in Chrome**: lands on
`/methodology.html`, title "Method — WHO GETS REPLACED FIRST", `h1` "How these
numbers are made." Present and correctly wrapped at both widths — verified at a
genuine 375px viewport and at desktop.

A link rather than a scripted navigation so it survives open-in-new-tab and is
followed by a crawler. The relative href resolves correctly under the base path
(`/who-gets-replaced-first/methodology.html`) without needing the absolute URL
the meta tags require.

### R9. [x] `npm run verify` stays green and the new checks join it

Every test this spec adds runs inside `npm run verify` in the same change that
adds it — CLAUDE.md's rule that a check added to CI is added to `verify`. The
build-output assertions of R4 need the build to have run, so they belong after
the build step rather than in the vitest suite that precedes it.

**Acceptance:** `npm run verify` exits 0 from a clean tree, with the new
assertions visible in its output. The pilot self-skipping for want of
`pipeline/raw/` is expected in a worktree and is not a failure.

### A note on how the browser checks were taken

`resize_window` is unreliable in this setup — it reports success while
`innerWidth` does not change (recorded in the global notes, and it happened
again here: a request for 375 left `innerWidth` at 1512). So the mobile
measurements were **not** taken from a resized window. Every 375px figure above
comes from the app loaded inside a 375×812 iframe, where media queries resolve
against the frame; `w.innerWidth` was read back as `375` before each
measurement, so the width is asserted rather than assumed.

The desktop figures were taken at the real window width, **1512px**, not the
1440px the acceptance criteria name. Both sit above the single 768px breakpoint
and exercise the same desktop branch, so the checks hold, but the number in the
evidence is the one that was actually measured.

## Implementation Plan

**Planned:** 2026-09-02

### Files to create

| Path | Purpose | Req |
|---|---|---|
| `src/utils/shareCard.js` | The card's **pure text model**: subject, headline, figures with tiers and vintages, disclosures, refusal, URL. No canvas, no DOM, so R6 and R7 are properties of a function rather than of an image | R5, R6, R7 |
| `src/utils/shareCardCanvas.js` | Draws a model into a 2400×1260 canvas with the site's own fonts and tokens. Browser-only, no drawing decisions of its own beyond layout | R5 |
| `src/utils/shareCard.test.js` | R6's "null tier is not drawn" and R7's year whitelist, asserted over the model | R6, R7 |
| `src/components/wizard/ShareCardButton.jsx` | The control on the result screen: draws, then downloads (and offers `navigator.share` where available) | R5 |
| `methodology.html` | The second Vite entry. Static prose, the shared stylesheet, its own `h1` | R2, R3, R4 |
| `scripts/check-meta.mjs` | Asserts over **built** `dist/*.html`: the nine named tags on both pages, every URL absolute under the base path, and the referenced image present in `dist/` | R4, R9 |
| `public/og.png` | The 1200×630 static preview, generated once with `shareCardCanvas` in site mode and committed | R4 |

### Files to modify

| Path | Change | Req |
|---|---|---|
| `src/components/wizard/{Country,Occupation,Optional,Result}Screen.jsx` | Top `h2` becomes `h1`, keeping the `wz-h2` **class** so the display scale of 0012 R3 does not move | R1 |
| `src/components/ui/accordion.jsx` | Radix's `AccordionHeader` renders `Primitive.h3`. Under an `h1` that is a skipped level, so it is rendered `asChild` as an `h2` | R1 |
| `src/components/wizard/ResultScreen.jsx` | The share control and the one-click methodology link | R5, R8 |
| `index.html` | OG and Twitter meta, absolute URLs | R4 |
| `vite.config.js` | Second `rollupOptions.input` entry | R2 |
| `scripts/verify.sh` | `check-meta.mjs` after the build step, where the built files exist | R9 |
| `src/components/wizard/wizard.render.test.jsx` | One `h1` per screen, and no skipped level | R1 |

### Sequence

1. **R1** — promote the four headings, fix the accordion level, add the tests. Independent of everything else, and the issue says do it first.
2. **R5 / R6 / R7** — the model, then its tests, then the canvas renderer, then the button. The model comes first because the two data requirements are assertions over it.
3. **R4** — generate `public/og.png` with the renderer from step 2 in site mode, then the meta on both pages, then `check-meta.mjs`.
4. **R2 / R3 / R8** — the methodology page, its Vite entry, and the link from the result screen.
5. **R9** — `npm run verify` green, with the new checks inside it.


**Done (2026-09-02).** `npm run verify` exits 0 from a clean tree with the new
step in its output:

```
==> built meta (0015 R2/R3/R4 -- og/twitter tags, absolute URLs, the refusal)
check-meta OK — 9 tags on both pages, all URLs absolute under the base path
==> js tests
 Test Files  6 passed (6)
      Tests  158 passed (158)
...
verify PASSED
```

`check:meta` is placed after `build` rather than in the vitest step, because the
files it reads do not exist before it. The pilot self-skipped for want of
`pipeline/raw/`, which is expected in a worktree and is not a failure.

### Requirement mapping

| Req | How it will be satisfied | Where | How acceptance is checked |
|---|---|---|---|
| R1 | Four `h2` → `h1`; Radix header `h3` → `h2` | the four screens, `accordion.jsx` | Browser: `h1` count is 1 on each of five screens; vitest asserts the level sequence never jumps |
| R2 | Second Vite entry, shared stylesheet | `methodology.html`, `vite.config.js` | `dist/methodology.html` emitted, one `h1`, four tier names present; palette confirmed by screenshot |
| R3 | The 0010 R13 refusal as its own section | `methodology.html` | `check-meta.mjs` greps the built HTML for the refusal sentence |
| R4 | Nine named tags, absolute URLs, committed static image | both HTML entries, `public/og.png` | `check-meta.mjs` over `dist/`, by tag name not by count |
| R5 | Pure model → canvas at 2× → download / share | `shareCard*.js`, `ShareCardButton.jsx` | PNG intrinsic size 2400×1260; the rendered image is **opened and looked at**, and committed to `.snapshots/0015/` |
| R6 | Tier carried from the same functions the screen uses; null tier omitted; stand-in string reproduced | `shareCard.js` | Unit test over the model, **and** read off the rendered image |
| R7 | Year whitelist: every year token traces to a vintage or a series endpoint | `shareCard.js`, its test | Unit test; confirmed by reading the image |
| R8 | A real `<a href="methodology.html">` on the result screen | `ResultScreen.jsx` | Browser at 375px and 1440px; keyboard reachable |
| R9 | New checks added to `verify` in the same change | `scripts/verify.sh` | `npm run verify` exits 0 with the new steps visible |

### Tier and vintage handling

**This spec adds no number.** Every figure on the card is read from the existing
`groupShare`, `groupHeadcount` and `trendFor`, which already assign `DERIVED`
and carry `data_year_occupation` as the vintage. The card renders the tier it is
handed and has no default — `shareCard.js` drops a figure whose tier is null
rather than drawing it bare, which is R6 stated as code. Vintages travel with
their own figure and are labelled as vintages, never as an outcome (R7).

### Validation

No pipeline change, so `[validate]`, `[crosscheck]` and `[outliers]` are
untouched and the four regression anchors cannot move. The new coverage is:
`shareCard.test.js` in the vitest step, the heading assertions in
`wizard.render.test.jsx`, and `check-meta.mjs` after the build — the last one
because the defect it guards (a relative `og:image`) exists only in the built
output and is invisible in source.

### Risks

- **The accordion `asChild` change touches a generated component.** Rule 4 of
  the shadcn section applies: the divergence gets a comment at the top of the
  file so the next `shadcn add` overwrite is a conscious choice.
- **Canvas text is drawn, not laid out.** Long country or group names need
  measured wrapping; getting it wrong clips the disclosure, which is the one
  string R6 exists to protect. Wrapping is measured with `measureText`, and the
  acceptance is reading the image rather than trusting the code.
- **`document.fonts.ready` must be awaited before drawing**, or the card
  silently renders in fallback faces — the exact failure mode 0010 R2 shipped
  twice. The probe measured the difference (107.78px vs 165.31px), so the
  renderer can assert it rather than assume it.

## Non-goals

- **Per-result OG previews.** Ruled out by probe, not by preference: GitHub Pages
  serves a static artefact, crawlers do not run JS, and there is nothing to
  render per-result meta. See *What the probes rule out*.
- **URL state / routing for the result.** Owned by #79 and spec 0016, which
  **merged during this run** (#83). This spec still implements none of it: the
  methodology page is a second *build entry*, not a router, and the card
  consumes `location.href` rather than producing it. The composition that R6
  anticipated is live, and the merge also required repairing one of 0016's own
  tests — see R1.
- **A server-side or build-time image generator** (`@vercel/og`, satori,
  puppeteer-in-CI). The card is generated in the reader's browser from the same
  data the screen renders, which is what keeps the tiers honest — the card cannot
  drift from the screen because it reads the same functions.
- **Reviving the replacement year in any tier.** 0010 R13 stands. R7 makes the
  refusal a checkable property of the card rather than a convention.
- **Changing any figure, tier, or the payload.** This spec adds no number. The
  pipeline is untouched.
- **A third accordion on the result screen.** The issue rules it out explicitly;
  R2 is a page.
