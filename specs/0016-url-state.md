# 0016 — the wizard's state lives in the URL

**Status:** in-review
**Depends on:** 0010 (the wizard is the app), 0011 (the country search and its named absence), 0012 (the one breakpoint)
**Issue:** [#79](https://github.com/apportico/who-gets-replaced-first/issues/79)
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

### R1. [ ] The URL scheme is a query string on the existing path

The wizard's state is carried in `location.search` on whatever path the app is
served from — never a fragment, never a path segment. The parameters are
`step`, `country`, `group`, `age`, `edu`; a parameter whose value is unset is
absent from the URL rather than present and empty. The intro step carries no
query at all, so the landing URL stays the bare site root.

| Parameter | Vocabulary | Source of the vocabulary |
|---|---|---|
| `step` | `country`, `occupation`, `optional`, `result` | `STEPS` in `WizardShell.jsx`, minus `intro` |
| `country` | one of the 177 `iso3` values carrying a series, or one of the 41 without (R5) | `global_labor.json` |
| `group` | `1`–`9` | ISCO-08 major groups |
| `age` | `15_24`, `25_54`, `55_64` | the crosstab keys, probed uniform across 218 files |
| `edu` | `ltb`, `bas`, `int`, `adv` | as above |

**Acceptance:** `src/utils/urlState.js` exports `encode(state)` and
`decode(search, rows)`. `encode({step:4, iso3:'GBR', group:3, age:'25_54', edu:'adv'})`
returns exactly `?step=result&country=GBR&group=3&age=25_54&edu=adv`, and
`encode({step:0})` returns `''`. A vitest case asserts both strings literally.
No `#` appears in any URL the app writes: `grep -n "location.hash\|'#'" src/utils/urlState.js` returns nothing.

### R2. [ ] A step transition pushes; an answer change within a step replaces

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

### R3. [ ] A cold load restores the wizard from the URL, result included

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

### R4. [ ] Browser Back and Forward walk the wizard steps

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

### R5. [ ] A URL naming a country with no official series renders 0011's named absence

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

### R6. [ ] Bad input degrades to the deepest step the surviving state supports, and says what it dropped

One rule, not five: each parameter is validated against its closed vocabulary
(R1), an invalid one is dropped, and the step is then **clamped to the deepest
step the surviving parameters can honestly render** — `result` and `optional`
need a country and a group, `occupation` needs a country, `country` needs
nothing. A truncated URL, an unknown ISO code, a `group=12`, a `step=banana` and
a hand-edited `age=30_40` all travel the same path.

Dropping is not enough on its own: the screen states what it did, so a reader
who was sent a link that no longer works learns that rather than assuming the
site is broken.

**Acceptance:** each of `?step=result&country=ZZZ&group=3`,
`?step=result&country=GBR&group=12`, `?step=result` and `?step=banana&country=GBR`
loads without a runtime error (console clean) and lands on step 01, 02, 01 and
02 respectively. Each renders a visible note naming the dropped parameter — e.g.
"That link named `ZZZ`, which is not a country in this dataset." A vitest case
asserts the `dropped` array returned by `decode` for all four, and
`?step=result&country=GBR&group=3&age=30_40&edu=adv` decodes to the result step
with `age: null`, `edu: 'adv'` and `dropped: ['age']`.

### R7. [ ] A band the chosen cell does not publish is removed from the URL rather than left claiming to apply

`age` and `edu` validate against a closed key vocabulary without a fetch (R1),
but whether a *particular* country and group publishes that band is only known
once the cross-tab resolves. A URL that keeps `&age=55_64` while the result
screen shows nothing about age is a URL that lies about what the reader is
looking at — the same failure as an untiered figure, in the address bar.

Once the cross-tab for the chosen country and group resolves, a band it does not
publish is removed from the URL with `replaceState` (no new history entry, since
the reader did not navigate).

**Acceptance:** find a country and group whose cross-tab omits an age band — the
suite locates one from the committed files rather than hard-coding it — and open
the result URL naming that band. After the cross-tab resolves, `location.search`
no longer carries `age=`, `history.length` is unchanged, and the screen shows no
age line. If no such cell exists in the committed data, this requirement is
marked `[!]` with the query that found nothing, rather than tested against a
fixture invented for it.

### R8. [ ] The result screen carries a copy-link affordance

The capability is worth nothing unnoticed. The result screen gets a control that
copies the current URL, gives a visible and announced confirmation, and degrades
to showing the URL in a selectable field where the clipboard write is refused.
It follows the design contract: mono uppercase face, `--radius-pill`, and at
least the 48px tertiary touch-target floor.

**Acceptance:** in a browser at 390×844, the result screen shows the control; a
click writes `location.href` to the clipboard, verified by reading
`navigator.clipboard.readText()` back and comparing to `location.href`; the
confirmation is in an `aria-live` region. `src/styles/contrast.test.js` and
`tokens.test.js` still pass, and the rendered control's `min-height` is
`>= 48px` measured in the browser.

### R9. [ ] Every URL the app writes survives the `/who-gets-replaced-first/` base path

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

### R10. [ ] The seam with #77 and #78 is one navigation function, and the boundary is written down

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

### R11. [ ] No new dependency, no new number, no new tier

This spec adds a capability, not data. It introduces no figure, so it assigns no
tier, and it must not acquire a router to do it — 0010's Non-goals record "there
is no router" as a decision, and the browser's own History API is what R2 and R4
are built on.

**Acceptance:** `git diff main...HEAD -- package.json package-lock.json` shows no
added dependency. No file under `src/` gains a numeric literal presented to a
reader as a statistic — the diff introduces no new call to `groupShare`,
`groupHeadcount`, `trendFor` or `readBands`, and the tier badges on the result
screen are unchanged, asserted by the existing `wizard.render.test.jsx`.

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
