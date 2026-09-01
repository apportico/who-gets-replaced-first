# 0015 — share card, methodology page, and an h1

**Status:** draft
**Depends on:** 0010 (the wizard and its result screen), 0011 (country search), 0012 (the 768px breakpoint)
**Issue:** [#78](https://github.com/apportico/who-gets-replaced-first/issues/78)
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

### R1. [ ] Every screen has exactly one `h1`, and the outline never skips a level

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

### R2. [ ] A methodology page exists as a real page, not a third accordion

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

### R3. [ ] The methodology page states the no-date refusal in full

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

### R4. [ ] Site-level OG and Twitter meta, correct under the base path

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
`dist/methodology.html` each contain ≥9 OG/Twitter tags, and **every** `content`
that is a URL starts with `https://apportico.github.io/who-gets-replaced-first/`.
Asserted by a test over the built files, so the failure the probe found cannot
return silently. The referenced image resolves to a file present in `dist/`.

### R5. [ ] A share image is generated for the reader's own result

A control on the result screen generates a 1200×630 PNG of the reader's result,
drawn client-side into a canvas with the site's own fonts and palette, and hands
it to the reader (download, and `navigator.share` where the browser offers it).
No new runtime dependency — the probe confirmed Canvas 2D renders Instrument
Serif, Geist and Geist Mono. It renders at `devicePixelRatio`-independent 2×
scale so the text is not soft. Where a figure is absent on screen it is absent on
the card, stated in words, never as a dash or a zero.

**Acceptance:** on the result screen for *Technicians · United Kingdom*, the
control produces a PNG that is 2400×1260 device pixels (1200×630 CSS), and the
**rendered image is opened and looked at** — its text reads `14.1%`, `4.77M` and
the trend, in the project's own typefaces, not in a fallback stack. The PNG is
committed to `.snapshots/0015/` as evaluation evidence.

### R6. [ ] The share image carries every tier and the stand-in disclosure

Each figure on the card carries the tier it was given by the same code that
feeds the screen — `DERIVED` for all three figures in the UK Technicians case —
and the card reproduces the clerical stand-in disclosure verbatim where the trend
is a stand-in: "Clerical support workers shown as a stand-in — no time series is
published for this group." The card never invents a tier and has no default:
a figure whose tier is null is not drawn. It also carries the site URL, so the
image out of context can be traced back to the method.

**Acceptance:** for *Technicians · United Kingdom*, the rendered PNG shows
`DERIVED` next to each of the three figures and the full stand-in sentence,
confirmed **by looking at the image**. Separately, a unit test over the card's
layout model asserts that a figure with a null tier is omitted and that a
stand-in trend always emits the disclosure string — so the guarantee is checked
by machine as well as by eye.

### R7. [ ] The share image never states a year

0010 R13 is `[!] not feasible` and R14 requires the result to read as finished
without a date; an image is not an exemption. The card carries **no** projected
year, no interval, no scenario and no placeholder where one would sit. Vintages
are not this: `2025` as the vintage of a measured figure is a per-field year the
data rules *require*, and it stays, labelled as a vintage. What is forbidden is a
year presented as when replacement happens.

**Acceptance:** a test asserts the card's text model contains no
future-year token — no four-digit year greater than the current year — and that
every four-digit year it does contain is attached to a figure as its vintage.
Confirmed by reading the rendered image: no date is offered as an outcome.

### R8. [ ] The methodology page is reachable from the result in one click

A single control on the result screen goes to the methodology page — one click,
above the fold on mobile is not required but "buried in a footer" is
disqualifying. It is a real link with an `href`, so it can be opened in a new tab
and is followed by a crawler, not a button that scripts a navigation.

**Acceptance:** on the result screen, an `<a href>` pointing at
`methodology.html` is present and reachable by keyboard, and clicking it in a
browser lands on the methodology page. Verified in Chrome at 375px and 1440px.

### R9. [ ] `npm run verify` stays green and the new checks join it

Every test this spec adds runs inside `npm run verify` in the same change that
adds it — CLAUDE.md's rule that a check added to CI is added to `verify`. The
build-output assertions of R4 need the build to have run, so they belong after
the build step rather than in the vitest suite that precedes it.

**Acceptance:** `npm run verify` exits 0 from a clean tree, with the new
assertions visible in its output. The pilot self-skipping for want of
`pipeline/raw/` is expected in a worktree and is not a failure.

## Non-goals

- **Per-result OG previews.** Ruled out by probe, not by preference: GitHub Pages
  serves a static artefact, crawlers do not run JS, and there is nothing to
  render per-result meta. See *What the probes rule out*.
- **URL state / routing for the result.** Owned by #79 and spec 0016, running in
  parallel. The methodology page is a second *build entry*, which is not a router
  and does not touch wizard state; the share card is built so it composes with a
  result URL once one exists, but it does not wait for it and does not implement
  it.
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
