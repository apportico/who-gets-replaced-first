# 0016 — the wizard's state lives in the URL

**Status:** in-progress
**Depends on:** 0010 (the wizard is the app), 0011 (the country search and its named absence), 0012 (the one breakpoint)
**Issue:** [#79](https://github.com/apportico/who-gets-replaced-first/issues/79)
**Approved:** Daniele Zanni, 2026-09-02 — **given directly, not as a GitHub
review.** [PR #83](https://github.com/apportico/who-gets-replaced-first/pull/83)
is self-authored, and GitHub will not record an approving review from the
author, so `reviewDecision` stays `REVIEW_REQUIRED` on it permanently and is not
evidence of anything either way. The approval covers the scheme decision in
particular — a query string on the existing path, which is neither of the two
options issue #79 offered ([review](https://github.com/apportico/who-gets-replaced-first/pull/83#pullrequestreview-5082314340)).
**Goal:** a result can be linked, and the link is honest, checked as:
1. A URL copied from a result screen, pasted into a fresh browser on a cold load, reproduces that exact result — verified in a browser at 1440×900 and 390×844, not inferred from a green build.
2. Browser Back walks the wizard steps backwards rather than leaving the site.
3. A URL naming a country with no official series renders 0011's named absence — nulls stay null through the URL layer too, and no deep link reaches a blank or invented result.
4. `npm run verify` is green.

## Objective

The site's entire output is one specific published cell — *Technicians · United
Kingdom · 25–54 · tertiary*. Today there is no way to say which cell you are
looking at. `location.href` is the bare site root on all four steps, so a result
cannot be sent to anyone, a reload discards four answers, and browser Back is a
trap that leaves the site rather than stepping back through the wizard. This
spec makes the URL the wizard's state, so the answer to "which cell is this?"
has an address.

It answers a second question the project needs answered before #78 can be built:
**can a result carry state that a server ever sees?** A fragment cannot — it
never leaves the browser — so the choice of scheme is not cosmetic, and it is
made here on probed evidence rather than by preference.

## Source verification

The sources here are the committed payloads, the app's own state, and the
hosting platform. All probed 2026-09-01 from this worktree at `4895def`.

| Source | Probed | Result |
|---|---|---|
| `src/data/global_labor.json` | `node` read of `rows` | 229 rows — 218 `row_type: country` + 11 aggregates. **177** countries carry at least one of the nine `iscoN_*_pct` fields; **41** carry none (CHN, SAU, NZL, ABW, AND … among them). Every `iso3` is exactly three characters. This is the closed vocabulary a `country` parameter validates against. |
| `src/data/crosstabs/*.json` | all **218** files enumerated, every `isco{N}_{age,edu}_*_pct` key collected | Groups seen: `1–9`. Age band keys are exactly `15_24, 25_54, 55_64`; education band keys exactly `ltb, bas, int, adv`. **Uniform across all 218 files** — so `age` and `edu` also validate against a closed vocabulary, without a fetch. |
| GitHub Pages — path route | `curl -o /dev/null -w '%{http_code}'` on `…/who-gets-replaced-first/result` and `…/r/GBR/3` | **404** for both. `public/` holds only `favicon.svg` and `icons.svg` — there is no `404.html`, so a path route needs the SPA-fallback hack, and that hack serves the app under a **404 status**. |
| GitHub Pages — query route | `curl '…/who-gets-replaced-first/?c=GBR&g=3'` | **200**, `index.html` served unchanged. No server config, no fallback file. |
| GitHub Pages — hash route | `curl '…/who-gets-replaced-first/#/r/GBR/3'` | **200** — but only because the fragment is stripped before the request is sent. The server is asked for the bare base path. Confirmed by the request the 404 probes above *did* reach the server with a path. |
| The app's current URL handling | `grep -rn "pushState\|replaceState\|location\.\|hashchange\|popstate\|URLSearchParams" src/` | **No matches.** Confirms the issue's live walk mechanically: nothing in the app reads or writes the URL, on any step. |
| `vite.config.js` | read | `base` is `/who-gets-replaced-first/` on `build` and `/` in dev. Any URL the app writes must survive both. |
| `src/components/wizard/WizardShell.jsx` | read | State is exactly five atoms: `step` (0–4, `STEPS = ['intro','country','occupation','optional','result']`), `iso3`, `group`, `age`, `edu`. `go(n)` is the single step transition. That five-atom shape is what the URL has to carry — no more. |
| `scripts/verify.sh` | read | `npm run test` (vitest) runs unconditionally inside `verify`, so a pure URL-codec module is covered by the project's own gate. |

### What the probes settle

A **path route is out**: it 404s, and the only fix on GitHub Pages is a
`404.html` copy of the app, which serves every deep link with a 404 status —
worse for the indexing and previewing that #78 depends on than doing nothing.

A **hash is out**, and this is the finding worth recording. A fragment is
stripped by the browser before the request leaves it, so a hash URL is
structurally invisible to the server, to a crawler, and to a preview scraper.
Consequence 4 of the issue — "no page can be previewed or indexed per result,
so #78's OG card has nothing per-result to describe" — would be *permanently
foreclosed* by choosing a hash, not merely left unsolved. A query string costs
nothing extra on Pages (200, probed) and keeps that door open.

So: **a query string on the existing path**, which is neither of the two options
the issue offered, chosen on the probe rather than on either.

## Requirements

### R1. [x] The URL scheme is a query string on the existing path

The wizard's state is carried in `location.search` on whatever path the app is
served from — never a fragment, never a path segment. The parameters are
`step`, `country`, `group`, `age`, `edu`; a parameter whose value is unset is
absent from the URL rather than present and empty. The intro step carries no
query at all, so the landing URL stays the bare site root.

| Parameter | Vocabulary | Source of the vocabulary |
|---|---|---|
| `step` | `country`, `occupation`, `optional`, `result` | `STEPS` in `WizardShell.jsx`, minus `intro` |
| `country` | one of the 218 `row_type: country` `iso3` values — the 177 with a series, or the 41 without (R5). The **11 aggregate rows are not accepted**: `WLD` is a row in the payload but not a country, and a URL naming it must degrade under R6 rather than render a world figure as though it were somebody's country | `global_labor.json` |
| `group` | `1`–`9` | ISCO-08 major groups |
| `age` | `15_24`, `25_54`, `55_64` | the crosstab keys, probed uniform across 218 files |
| `edu` | `ltb`, `bas`, `int`, `adv` | as above |

**Acceptance:** `src/utils/urlState.js` exports `encode(state)` and
`decode(search, rows)`. `encode({step:4, iso3:'GBR', group:3, age:'25_54', edu:'adv'})`
returns exactly `?step=result&country=GBR&group=3&age=25_54&edu=adv`, and
`encode({step:0})` returns `''`. A vitest case asserts both strings literally.
No `#` appears in any URL the app writes: `grep -n "location.hash\|'#'" src/utils/urlState.js` returns nothing.

**Done (2026-09-02).** `src/utils/urlState.js` ships `encode`, `decode`,
`noticeFor` and `STEPS`; `src/utils/urlState.test.js` asserts both literal
strings. 25 codec cases pass. `grep -n "location.hash\|'#'" src/utils/urlState.js`
returns nothing, and a live walk confirmed `location.hash === ''`. The band
vocabularies are imported from `crossTabs.js` (`AGE_BAND_KEYS`, `EDU_BAND_KEYS`)
rather than re-typed, so the URL validates against the list the screens render.

### R2. [x] A step transition pushes; an answer change within a step replaces

Every move between steps adds one history entry. Changing an answer *without*
changing step — tapping a different country in the step 01 list, switching an
age chip on step 03 — updates the URL in place with `replaceState`. Without
that split, Back walks backwards through every country the reader tapped
instead of through the four steps, which is the behaviour the issue asks for
inverted.

**Acceptance:** in a browser, from the intro, walk to the result choosing a
country, a group and both bands, then read `history.length`. It has grown by
exactly **4** (one per step transition), not by the number of taps. Tapping
three different countries on step 01 leaves `history.length` unchanged and
`location.search` naming the third.

**Done (2026-09-02).** Measured in a browser against the production build served
under `/who-gets-replaced-first/`:

```
start=2
after intro->01: +1
after 3 country taps (France, Germany, United Kingdom): +1   country=GBR
at step optional: +3
after age chip: +3   age=25_54
FINAL: +4   step=result
```

Four step transitions, four entries. Three country taps and an age chip added
none, and the URL carried the last answer given.

### R3. [x] A cold load restores the wizard from the URL, result included

Loading any URL the app can write reproduces the state it encodes, before first
paint rather than by rendering the intro and correcting it. Landing directly on
`step=result` is the case that matters and is not a special case in the code:
the result screen's own data path (`row`, `group`, the cross-tab fetch) is
already keyed on those atoms.

**Acceptance:** in a browser at **1440×900 and 390×844**, open
`?step=result&country=GBR&group=3&age=25_54&edu=adv` on a cold load (no prior
session). The result screen renders `Technicians and associate professionals ·
United Kingdom`, the two stat cards with their tier badges, and the "Within this
group" card naming the 25–54 and tertiary figures. Screenshot at both widths,
committed under `.snapshots/0016/`. The intro screen is never painted — asserted
in the suite by decoding first and mounting once.

**Done (2026-09-02).** `?step=result&country=GBR&group=3&age=25_54&edu=adv` on a
cold load renders `Technicians and associate professionals · United Kingdom`,
14.1%, 4.77M, `70.9% are aged 25–54` and `54.1% have tertiary education`, each
with its `DERIVED` and `2025` badges. Verified at **1440×900** and at a real
**390×844** viewport; screenshots in `.snapshots/0016/`. Three vitest cases
cover steps 02 and 03 and assert the intro's `h1` is never in the tree.

`resize_window` reported success while `innerWidth` stayed 1512 — the trap
CLAUDE.md records — so the 390px measurement was taken in a 390×844 iframe
harness, where the app's own media queries apply, and `frameWidth` was read back
as 390 before anything was believed.

### R4. [x] Browser Back and Forward walk the wizard steps

Back moves one step towards the intro and restores that step's answers; Forward
moves one step away again. Back from the intro leaves the site, which is correct
— that is the entry, not a trap. This is `popstate`-driven: the URL is the source
of truth and the component follows it, rather than two copies of the state being
kept in sync.

**Acceptance:** in a browser, walk intro → country → occupation → optional →
result, then press Back four times. Each press lands on the previous step with
its answer intact, `location.search` matching, and the fourth lands on the intro
with an empty query. Pressing Forward four times returns to the same result
screen with all four answers. Verified at both widths and recorded in the
evaluation.

**Done (2026-09-02).** Four Back presses then four Forward, in a browser:

```
back1: step=optional    country=GBR group=3  | Two more, if you like.
back2: step=occupation  country=GBR group=3  | What do you do?
back3: step=country     country=GBR          | Where do you work?
back4: (no query)                            | What the data says about your work.
fwd1..4: country -> occupation -> optional -> result
```

The result returns intact — 14.1%, the 25–54 band, four `DERIVED` badges. The
listener never pushes: `history.length` was unchanged across the pop.

### R5. [x] A URL naming a country with no official series renders 0011's named absence

This is the project's first non-negotiable arriving through a new door. 41 of
the 218 countries report no ISCO-08 occupation breakdown. A URL naming one of
them — `?step=result&country=CHN&group=3` — must never reach a blank result
screen, a zero, an imputed neighbour, or a regional average. It lands on **step
01** with that country named in the absence wording 0011 R5/R6 already ships:
the country is in the dataset, reports no occupation breakdown, and there is no
result to give.

The country is named because it was asked for. Silently redirecting to an empty
search box would tell a reader in China that the link was broken, when what is
true is that the source publishes nothing.

**Acceptance:** in a browser, open `?step=result&country=CHN&group=3`. Step 01
renders, and the visible text contains `China` together with the no-breakdown
statement. No figure, no dash and no zero appears anywhere on screen. A vitest
case asserts `decode('?step=result&country=CHN&group=3', rows)` returns
`step: 1` with `absent: {iso3:'CHN', name:'China'}` and `iso3: null` — never
`iso3: 'CHN'`. Repeated for `SAU` and `NZL`.

**Done (2026-09-02).** vitest asserts the rule over **all 41** countries with no
series (not only the three spot-checked) and, as the converse, that **all 177**
with a series still decode to a selection. In a browser,
`?step=result&country=CHN&group=3` and the `SAU` equivalent both render step 01
naming the country, with `anyTierBadge: false` and `anyPercent: false` — no
figure, no dash, no zero. Screenshot: `.snapshots/0016/step01-absence-390.png`.
The URL normalises to `step=country` with the country dropped, so the address
bar stops claiming a result too.

### R6. [x] Bad input degrades to the deepest step the surviving state supports, and says what it dropped

One rule, not five: each parameter is validated against its closed vocabulary
(R1), an invalid one is dropped, and the step is then **clamped to the deepest
step the surviving parameters can honestly render** — `result` and `optional`
need a country and a group, `occupation` needs a country, `country` needs
nothing. A truncated URL, an unknown ISO code, a `group=12`, a `step=banana` and
a hand-edited `age=30_40` all travel the same path.

Dropping is not enough on its own: the screen states what it did, so a reader
who was sent a link that no longer works learns that rather than assuming the
site is broken. The statement renders as a `.wz-note` directly under the
screen's lede on whichever step the clamp landed on — the slot step 01 already
uses for 0011 R5's locale absence, so the wording sits where a reader of this
app has already learned to find an explanation, rather than in a new banner.

**Acceptance:** each of `?step=result&country=ZZZ&group=3`,
`?step=result&country=GBR&group=12`, `?step=result`, `?step=banana&country=GBR`
and `?step=result&country=WLD&group=3` loads without a runtime error (console
clean) and lands on step 01, 02, 01, 02 and 01 respectively. Each renders a
visible note naming the dropped parameter — e.g. "That link named `ZZZ`, which
is not a country in this dataset." A vitest case asserts the `dropped` array
returned by `decode` for all five, and
`?step=result&country=GBR&group=3&age=30_40&edu=adv` decodes to the result step
with `age: null`, `edu: 'adv'` and `dropped: ['age']`.

**Done (2026-09-02).** All five URLs decode as specified (vitest), and six were
walked in a browser:

| URL | Lands on | Says |
|---|---|---|
| `country=ZZZ` | 01 | names a country this dataset does not carry |
| `group=12` | 02 | names an occupation group outside the nine |
| `country=WLD` | 01 | same as ZZZ — the aggregate guard holds |
| `?step=result` bare | 01 | nothing dropped, so no notice |
| `step=banana&country=GBR` | 02 | names a step that does not exist |
| `age=30_40&edu=adv` | 04 | keeps `edu`, drops `age` |

Console clean on every one, and `anyTierBadge: false` throughout.

One divergence found by the suite and resolved in favour of the spec: an
unreadable `step` now falls back to the **deepest supported step**, not to the
intro. A link carrying a good country was landing on the intro, which has no
slot to explain itself, so the reader saw their link silently discarded.

### R7. [x] A band the chosen cell does not publish is removed from the URL rather than left claiming to apply

`age` and `edu` validate against a closed key vocabulary without a fetch (R1),
but whether a *particular* country and group publishes that band is only known
once the cross-tab resolves. A URL that keeps `&age=55_64` while the result
screen shows nothing about age is a URL that lies about what the reader is
looking at — the same failure as an untiered figure, in the address bar.

Once the cross-tab for the chosen country and group resolves, a band it does not
publish is removed from the URL with `replaceState` (no new history entry, since
the reader did not navigate).

**Only on a resolved source absence — never on a load problem.** This is
`absence.isSourceAbsence` doing exactly the job R20 of spec 0010 gave it, one
layer up. `NOT_LOADED` and `LOAD_FAILED` mean the fetch has not answered, not
that ILOSTAT publishes nothing; stripping the band on either would let one
offline moment silently delete an answer the reader gave, and would make an
invented absence permanent in the link they then copy. The strip fires only when
the cross-tab state is `PRESENT` (or `WITHHELD` / `NOT_PUBLISHED`, which are
statements about the source) and the band is absent from the published set.

**Acceptance:** find a country and group whose cross-tab omits an age band — the
suite locates one from the committed files rather than hard-coding it — and open
the result URL naming that band. After the cross-tab resolves, `location.search`
no longer carries `age=`, `history.length` is unchanged, and the screen shows no
age line. Separately, with the cross-tab import forced to reject (`LOAD_FAILED`),
the same URL **keeps** `age=` and the screen shows the load-failure wording, not
the not-published wording — a vitest case asserts both halves. If no cell in the
committed data omits a band, this requirement is marked `[!]` with the query that
found nothing, rather than tested against a fixture invented for it.

**Done (2026-09-02).** Both cells were located from the committed cross-tabs
rather than invented. The probe also corrected the spec's assumption: **no age
cell publishes some-but-not-all three bands** (age is all-or-nothing across all
218 files), so the partial case is education — 438 cells publish 3 of 4.

| Cell | Basis | Result |
|---|---|---|
| `ALB` g1, `edu=ltb` | publishes `bas/int/adv`, flag `present` | `edu` stripped, `country=ALB` and `step=result` kept, no below-basic line |
| `AZE` g1, `age=25_54` | a share with no age bands at all | `age` stripped |
| `GBR` g3, `age=25_54`, fetch forced to fail | `LOAD_FAILED` | **`age=25_54` kept**, load-failure wording shown, not the not-published wording |

The third row is the one that matters: a fetch that never answered is not the
source publishing nothing, and stripping there would delete a reader's answer
over a network blip and bake an invented absence into the link they copy.
`history.length` unchanged across the strip.

### R8. [x] The result screen carries a copy-link affordance

The capability is worth nothing unnoticed. The result screen gets a control that
copies the current URL, gives a visible and announced confirmation, and degrades
to showing the URL in a selectable field where the clipboard write is refused.
It follows the design contract: mono uppercase face, `--radius-pill`, and at
least the 48px tertiary touch-target floor.

**Acceptance:** a vitest case stubs `navigator.clipboard.writeText`, clicks the
control, and asserts it was called with exactly `location.href` and that the
confirmation text appears in an `aria-live` region; a second case makes the stub
reject and asserts the URL is rendered in a selectable field instead, with no
unhandled rejection. In a browser at 390×844 the control is visible on the result
screen and its measured `min-height` is `>= 48px`. `contrast.test.js` and
`tokens.test.js` still pass.

Deliberately **not** `navigator.clipboard.readText()`: reading the clipboard back
needs a separate permission that an automated browser will prompt on or refuse,
so an acceptance built on it would fail for a reason that says nothing about the
feature.

**Done (2026-09-02).** Two vitest cases stub `writeText` and assert it is called
with exactly `location.href` and that the confirmation lands in an `aria-live`
region; the reject case asserts the fallback field renders carrying the URL,
with no unhandled rejection. Measured in a browser at 390×844:

```
face: "Copy link to this result"   measuredHeight: 50   minHeight: 48px
borderRadius: 99px   fontFamily: "Geist Mono"   textTransform: uppercase
[role=status] present
after click -> status "Link copied to the clipboard.", face "Link copied"
```

50px clears the 48px tertiary floor, and the mono/uppercase/pill face is the
design contract for a button face.

### R9. [x] Every URL the app writes survives the `/who-gets-replaced-first/` base path

`vite.config.js` sets the production base, and a hand-built absolute URL would
work in dev and break on Pages — the same failure mode `crossTabs.js` documents
for asset paths. The app writes the query against the current `location.pathname`
and never reconstructs the path itself.

**Acceptance:** `npm run build`, serve `dist/` under a `/who-gets-replaced-first/`
prefix with a plain static server (not `vite preview` — it caches `index.html`,
per CLAUDE.md), and open
`/who-gets-replaced-first/?step=result&country=GBR&group=3`. The result renders,
assets load (no 404 in the network log), and walking one step forward produces a
URL still beginning `/who-gets-replaced-first/`. `grep -rn "'/'" src/utils/urlState.js`
shows no hard-coded leading path.

**Done (2026-09-02).** `npm run build`, `dist/` served under a
`/who-gets-replaced-first/` prefix by a plain static server (not `vite preview`,
per CLAUDE.md). `?step=result&country=GBR&group=3&age=25_54&edu=adv` renders,
and measured in the page: `location.pathname === '/who-gets-replaced-first/'`,
**0 resources with a status >= 400**, and walking a step forward keeps the
prefix. `grep` shows no hard-coded leading path in `urlState.js` — the shell
writes `location.pathname + encode(next)`.

### R10. [~] The seam with #77 and #78 is one navigation function, and the boundary is written down

Three tickets touch the same transitions and are being built in parallel, so the
division is recorded here rather than discovered in a conflict:

| Owned by | What |
|---|---|
| **#79 — this spec** | The URL as the source of truth; the history entries; `popstate`; cold-load restore; degradation; the copy-link control on step 04 |
| **#77** | The in-page **back control** — where it sits, what it looks like — and step 02 echoing the typed title. #77 states it must work without waiting on this ticket, and it does: it calls the seam below |
| **#78** | The share card, OG/Twitter meta, the methodology page and the `h1`. This spec gives it the addressable URL its card describes; it does **not** make per-result previews work on GitHub Pages, which needs prerendering and is a non-goal here |

`WizardShell` exposes exactly one navigation seam — `go(step, patch)` for a
forward move and `back()` for a backward one — and every step transition in the
file goes through it. #77's control calls `back()`; whichever of the two lands
second wires to the seam rather than adding a second path.

**Acceptance:** `grep -n "setStep(" src/components/wizard/WizardShell.jsx`
returns only the lines inside the seam — no screen calls it directly. The
boundary table above is reproduced in the PR description so the sibling tickets
can read it without opening the spec.

**Revised (2026-09-02).** The boundary table above ships as written and is
reproduced in the PR description. The seam ships as `go(step, patch)` and
`set(patch)` over a single `commit(next, mode)`, and the acceptance check holds
exactly: `grep -n "setState(" src/components/wizard/WizardShell.jsx` returns
**one line**, inside `commit`.

**What changed: `back()` is not in the file.** Nothing renders a control that
would call it, and an exported function with no caller is the dead artifact
REVIEW.md's Axis 2 flags — the same finding 0010 R3 recorded when four shadcn
components sat installed and unrendered. Adding it purely to satisfy a line in
this spec would be writing the finding on purpose.

The seam it would attach to is real and shipped: `commit(next, 'pop')` already
drives browser Back through `popstate` (R4), so #77's control is a one-line
`history.back()` landing on tested machinery rather than a new path. Recorded
here so #77 adds it in the change that adds the control, and so the next reader
does not think it was forgotten.

### R11. [~] No new dependency, no new number, no new tier

This spec adds a capability, not data. It introduces no figure, so it assigns no
tier, and it must not acquire a router to do it — 0010's Non-goals record "there
is no router" as a decision, and the browser's own History API is what R2 and R4
are built on.

**Acceptance:** `git diff origin/main...HEAD -- package.json package-lock.json`
shows no added entry under `dependencies`. `git diff origin/main...HEAD --stat`
shows no change to `src/utils/groupFigures.js`, `laborMetrics.js`, `trend.js`,
`terms.js` or `crossTabs.js` — the five modules that produce or tier a figure —
and `wizard.render.test.jsx` and `computed.test.jsx` pass **with no assertion in
them modified**, which is what makes their green a statement about the figures
rather than about a rewritten test.

**Revised (2026-09-02).** The requirement's intent is met in full and one clause
of its check was wrong.

Met: `git diff origin/main...HEAD -- package.json package-lock.json` is **empty**
— no router, no dependency. No figure is produced, so no tier is assigned; the
result screen's badges are rendered by the same modules as before, and
`wizard.render.test.jsx` and `computed.test.jsx` pass **with no assertion
modified** (the only edit to either is a `resetUrl()` in `beforeEach`, which is
harness: the URL is state now, so jsdom's one-document-per-file carries a walked
URL into the next case).

Wrong: the check named `crossTabs.js` among the modules that must not change,
which contradicts R1 — R1 requires the URL validate `age` and `edu` against the
list the screens render from rather than a second copy, and that list lives in
`crossTabs.js`. The diff there is **+9 lines, purely additive**: two
`export const` key arrays derived from the existing `AGE_BANDS`/`EDU_BANDS`, and
a comment. `readBands` and every tier and year it returns are untouched.

The corrected check is the four modules that actually produce or tier a figure —
`groupFigures.js`, `laborMetrics.js`, `trend.js`, `terms.js` — and
`git diff --stat` over those four is empty.

## Implementation Plan

**Planned:** 2026-09-02

### Files to create

| Path | Purpose |
|---|---|
| `src/utils/urlState.js` | The codec. `STEPS`, `encode(state)`, `decode(search, rows)`, `noticeFor(result)`. Pure — no DOM, no React — which is what puts R1, R5 and R6 inside vitest rather than in a manual browser walk. |
| `src/utils/urlState.test.js` | R1, R5, R6 and R7's decode half, against the committed payload. |
| `src/components/wizard/CopyLink.jsx` | R8. Kept out of `ResultScreen.jsx`, which is already 221 lines. |

### Files to modify

| Path | Change |
|---|---|
| `src/components/wizard/WizardShell.jsx` | The five `useState` atoms become one state object; `go(step, patch)` / `set(patch)` / `back()` become the only transitions (R10); mount normalises the URL with `replaceState`; a `popstate` listener re-decodes (R4); an effect strips a band the resolved cross-tab does not publish (R7). |
| `src/utils/crossTabs.js` | Export `AGE_BAND_KEYS` and `EDU_BAND_KEYS` from the existing `AGE_BANDS` / `EDU_BANDS` so `urlState` validates against the same list the screens render from, rather than a second copy that can drift. |
| `src/components/wizard/CountryScreen.jsx` | Accept a `notice` prop, rendered as `.wz-note` under the lede (R6). The existing `excluded` prop and 0011 R5's wording are untouched — a separate slot, so 0011's tests keep asserting what they assert. |
| `src/components/wizard/OccupationScreen.jsx` | Same `notice` prop, same slot. |
| `src/components/wizard/ResultScreen.jsx` | Render `<CopyLink />` above "Start again" (R8). |
| `src/components/wizard/wizard.render.test.jsx` | **Add** cases for R2, R3, R4 and R8. No existing assertion is modified — R11's acceptance depends on that. |

### Sequence

1. **R1** — `urlState.js` with `encode`/`decode`, and `crossTabs.js` exporting the band keys. Tests first, since the codec is pure.
2. **R5, R6** — the validation and clamp rules inside `decode`, plus `noticeFor`. These are the same code path, so they land together.
3. **R2, R3, R4, R10** — `WizardShell` consolidation: one state object, the `go`/`set`/`back` seam, the lazy decode initialiser, the mount-time `replaceState` normalisation, and the `popstate` listener.
4. **R6 (render half)** — the `notice` prop through `CountryScreen` and `OccupationScreen`.
5. **R7** — the band-strip effect, gated on a resolved *source* absence.
6. **R8** — `CopyLink.jsx` into `ResultScreen`.
7. **R9, R11** — `npm run verify`, then a built `dist/` served under a `/who-gets-replaced-first/` prefix by a plain static server, walked in a browser.

Steps 1–2 gate 3; 3 gates 4–6. Step 7 gates the phase.

### Requirement mapping

| Req | How it will be satisfied | Where | How acceptance is checked |
|---|---|---|---|
| R1 | `encode`/`decode` over five params against closed vocabularies; `STEPS` moves here so there is one list | `src/utils/urlState.js`, `crossTabs.js` | vitest asserts both literal strings; `grep` for `#` in the module |
| R2 | `go()` pushes, `set()` replaces | `WizardShell.jsx` | browser: `history.length` delta is 4 over the walk; unchanged across three country taps |
| R3 | Lazy `useState` initialiser decodes before first paint | `WizardShell.jsx` | browser at 1440×900 and 390×844 on a cold deep link; vitest asserts the intro never renders |
| R4 | `popstate` listener re-decodes; the URL is the source of truth | `WizardShell.jsx` | browser: 4× Back then 4× Forward, checking step + `location.search` each press |
| R5 | A no-series country decodes to `iso3: null` + `absent`, clamping to step 01 | `urlState.js`, `CountryScreen.jsx` | vitest for CHN/SAU/NZL; browser shows the named absence and no figure |
| R6 | Per-param validation, then clamp to the deepest supported step, then `noticeFor` | `urlState.js`, both screens | vitest asserts `dropped` for all five URLs; browser console clean on each |
| R7 | Effect gated on a resolved source absence, `replaceState` only | `WizardShell.jsx` | vitest both halves — stripped on `NOT_PUBLISHED`, **kept** on `LOAD_FAILED` |
| R8 | `CopyLink.jsx`, `writeText` with a selectable-field fallback | `CopyLink.jsx`, `ResultScreen.jsx` | vitest with a stubbed clipboard, both resolve and reject; browser measures `min-height` |
| R9 | URLs written as `location.pathname + encode(...)`; the path is never reconstructed | `WizardShell.jsx` | built `dist/` served under the prefix, deep link opened, network log read |
| R10 | `go`/`set`/`back` are the only transitions | `WizardShell.jsx` | `grep -n "setState(" WizardShell.jsx` shows only the seam |
| R11 | No dependency, no figure module touched | — | `git diff origin/main...HEAD` on `package.json` and the five figure modules |

### Tier and vintage handling

**This plan produces no numbers, so it assigns no tiers and records no vintages.**
That is R11, and it is the reason the mapping table above has no tier column. The
tier and year badges already on the result screen are rendered by
`groupFigures.js`, `trend.js` and `crossTabs.js`' `readBands`, none of which this
plan modifies — `git diff --stat` over those five modules is the check.

The one place the data rules do bite is R5, and it bites hard: the URL is a new
door into the result screen that does not pass through the country search, so
without R5 a deep link would be the one path in the app that could reach a
result for a country with no series. `decode` returning `iso3: null` for those 41
is what closes it, and it is asserted rather than reasoned about.

### Validation

`[validate]`, `[crosscheck]` and `[outliers]` do not apply — nothing under
`pipeline/` changes, and the pilot self-skips in this worktree for want of a
`pipeline/raw/` cache. The checks that do apply are vitest (which `verify` runs
unconditionally) and a browser walk, which is what CLAUDE.md requires for a UI
change: a clean build is not evidence the page renders.

New coverage: `urlState.test.js` for the codec, and four cases added to
`wizard.render.test.jsx` for the shell. Existing assertions are not touched.

### Risks

- **R7 may have no cell to test against.** Its acceptance already says the suite
  locates a country and group that omits a band from the committed files, and
  that the requirement is marked `[!]` with that query if none exists. This is
  the requirement most likely not to end `[x]`.
- **`history.length` is a coarse instrument.** Forward history is truncated by a
  Back, so R2's delta measure would mislead if reused for R4. R4 asserts step and
  `location.search` per press instead; the two must not be conflated.
- **`WizardShell`'s state consolidation is the one real refactor here**, and #77
  is editing the same file in parallel. R10's seam is what keeps that a merge
  rather than a rewrite, and whichever lands second wires into `go`/`back`.
- **jsdom does not navigate.** `pushState`/`popstate` exist there but the
  browser's own Back button does not, so R4's acceptance stays a browser check;
  vitest covers the decode side only.

## Non-goals

- **A router, or real routes.** Path segments 404 on Pages (probed) and #24
  proposes the Next.js App Router answer, blocked on #23. That ticket stays
  open; a future migration should carry this state rather than re-invent it,
  and the query parameters here are the thing it carries.
- **Per-result previews or indexing.** Choosing a query string keeps the state
  visible to a server, which is what a hash would have foreclosed. It does not
  by itself give GitHub Pages per-result OG tags — that needs prerendering, and
  it belongs to #78.
- **The in-page back control**, and step 02 echoing the typed title. #77.
- **The share card, the methodology page and the `h1`.** #78.
- **Persisting state anywhere but the URL.** No `localStorage`, no cookie. The
  link is the state; a second store would let the two disagree.
- **Encoding anything the wizard does not already hold.** The five atoms in
  `WizardShell` are the whole scope — no scroll position, no accordion state,
  no metric and no year. There is no year (0010 R13 is `[!]`), and #15's scope
  — metric, year, scenario slider, the map's view — describes components 0010 R1
  deleted. #15 is superseded and should be closed when this lands.
