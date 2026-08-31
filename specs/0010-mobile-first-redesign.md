# 0010 — mobile-first redesign

**Status:** in-review
**Depends on:** 0009 (the app payload is regenerated from `run.py` and guarded against drift)
**Issue:** [#61](https://github.com/apportico/who-gets-replaced-first/issues/61)

## Objective

The app today answers "which countries are most exposed?" — an analyst's
question, on a desktop choropleth. It cannot answer the question the project is
named after, which a person asks about themselves on a phone: *is my occupation
the one that goes first, and what do the statistics actually say about it?*

This spec rebuilds the UI as a mobile-first, five-screen wizard — country, then
job title, then two optional cross-tabulating dimensions, then a result screen
that reports **only what the sources carry**, each figure carrying its tier and
its own vintage. The design is fixed by a canvas
([artifact](https://claude.ai/code/artifact/5144650a-4fe5-48af-b3c7-e887f7e6afde));
its extracted contract lives in `CLAUDE.md`. The design has no map, so the map
and its corridor overlay are deleted rather than kept behind a route (R1).

The canvas's headline output is a projected replacement year. Probing found no
source for it, so this spec deliberately does not ship one (R13), and specs the
result screen to be complete without it (R14).

## The vintage rule

R8 and R9 add two cross-tabulated dimensions, and both raise the same question:
which year is the cross-tab taken at?

**Each dimension carries its own most-recent reconciled year, recorded in its
own `data_year_*` field.** The age share is not forced to align with
`data_year_occupation`, nor the education share with either.

This is not a new rule — it is `CLAUDE.md`'s existing one: *"Record the year per
field. Vintages differ — population may be 2025 while occupation is 2017. Never
present a row as a single-year snapshot."* Forcing alignment would be the novel
choice, and it costs coverage: 158 → 132 countries for R8, 155 → 124 for R9.
Both years are recorded, so the result screen can and must show them separately.

## Source verification

Probed 2026-08-31, re-probed on review 2026-08-31. Every source below was hit
before the requirement naming it was written.

| Source | Probed | Result |
|---|---|---|
| `src/data/global_labor.json` | read, 2026-08-31 | 229 rows (218 country / 7 region / 3 group / 1 world), 84 fields, `field_tiers` block present. All nine `iscoN_*_pct` fields carried by 173–177 countries, tier `DERIVED`. **The canvas's UK figures are real**: `isco4_clerical_pct` = 8.8633, `clerical_employed` = 2,989,466 |
| `src/data/global_labor.json` — ISCO coverage | read, 2026-08-31 | The nine fields do **not** agree on coverage: **any** of the nine non-null = 177 countries, **all** nine non-null = 170. `isco_groups_reported` expresses this per country. R6 reads "any of the nine" |
| `src/data/global_labor.json` — classification | read, 2026-08-31 | Of the 177, **167 publish ISCO-08 and 10 publish ISCO-88** (BMU CAN MAC NAM NIC TTO TWN UKR YEM ZAF), carried in `isco_classification`. `pipeline/README.md` justifies the fallback for the aggregate 1–4 cut and warns the revision moved ICT occupations across the 2/3 boundary → R18 |
| `src/data/global_labor.json` — headcounts | read, 2026-08-31 | Per-group headcount exists **only** for clerical, professionals, professional-core and white-collar. `round(share / 100 × employed_total)` reproduces `clerical_employed` for **177 of 177** countries exactly. **0 of 177** have a null `employed_total`. `employed_total` (World Bank) and `isco_source_employed_thousands` (ILO survey base) differ — GBR 33,728,592 vs 34,055,472 — so the headcount is a two-source join → R11 |
| `src/data/global_labor_timeseries.json` | read, 2026-08-31 | `fields` × `years` × `series`; years 2013–2026, 226 series. Of the ISCO fields only **`isco4_clerical_pct`** is present (185 series carry a point). GBR runs 10.0247% (2013) → 8.8633% (2025), matching the canvas exactly |
| ILOSTAT `DF_EMP_TEMP_SEX_AGE_OCU_NB` | live SDMX `curl`, 2026-08-31 — `https://sdmx.ilo.org/rest/data/ILO,DF_EMP_TEMP_SEX_AGE_OCU_NB,1.0/.A..SEX_T../?startPeriod=2013&format=csv` (also cached under `pipeline/raw/ilostat/`) | HTTP 200. **164 areas** carry an ISCO-08 major group. `OCU_ISCO08_1`…`9` crossed with `AGE_AGGREGATE_Y15-24 / Y25-54 / Y55-64 / YGE65` and the `YGE15` denominator. Cell-level, intersected with payload countries: **158** carry all three bands plus the denominator at their own most-recent year, **132** at `data_year_occupation`. **0 areas** pair `AGE_10YRBANDS_*` with `OCU_ISCO08_*`, so 0002 R11's skill-level-only finding is correctly scoped and does not apply here |
| ILOSTAT `DF_EMP_TEMP_SEX_OCU_EDU_NB` | live SDMX `curl`, 2026-08-31 — `https://sdmx.ilo.org/rest/data/ILO,DF_EMP_TEMP_SEX_OCU_EDU_NB,1.0/.A..SEX_T../?startPeriod=2013&format=csv` | HTTP 200, 55.5 MB, 265,835 rows, **162 areas**, years 2013–2026. *(Unrestricted the flow is 1982–2026, 428,474 rows, 90.5 MB — hence the start year in R9.)* Cell-level against payload countries: **155** carry `BAS`/`INT`/`ADV` plus `EDU_AGGREGATE_TOTAL` at their own most-recent year, **124** at `data_year_occupation`. **`BAS`/`INT`/`ADV` do not partition the base** — `EDU_AGGREGATE_LTB` (published by **132** payload countries) and `EDU_AGGREGATE_X` sit outside them; the residual over group 4 runs 0.3% (IND) to 7.3% (ETH) → R9 |
| Google Fonts — Geist, Geist Mono, Instrument Serif | live `curl` css2, 2026-08-31 | All three HTTP 200. Geist serves 300–600, Instrument Serif serves normal and italic (the canvas headline needs italic) |
| `shadcn` on npm + `ui.shadcn.com/docs/components-json` | registry `curl` + docs fetch, 2026-08-31 | Latest **4.19.1** (published 2026-08-31). `tsx: false` "allows components to be added as JavaScript with the `.jsx` file extension"; for Tailwind v4 the `tailwind.config` field is "left blank" |
| A published source for the **replacement year** | web search, 2026-08-31 | **Not found.** Nearest published work is US-only, decadal occupational *churn* on 1950/2010 US census classifications (IPUMS / Minnesota Population Center; ITIF 1850–2015). Not ISCO-08, not per country, and churn ≠ AI displacement. Nothing publishes "years until half of ISCO group N is displaced" → R13 |

## Requirements

### R1. [ ] The wizard is the app; the map and the corridor overlay are deleted

The wizard is the only surface. No router — step state is internal to the
wizard. Delete `LaborPage`, `LaborMap`, `LaborSidebar`, `LaborDetailPanel`,
`LaborTimeline`, `ScenarioPanel`, `Header` and `utils/corridorStates.js`, along
with the corridor snapshot `src/data/port_data.json` and
`src/data/sanctions_regimes.json`. Drop `leaflet` and `react-leaflet` from
`package.json`, regenerate `package-lock.json`, and remove the Leaflet CSS
import from `main.jsx` and the ~14 `.leaflet-*` rule blocks from
`src/styles/index.css`.

`App.jsx` currently imports only `Header` and `LaborPage`; its entire body goes.
It becomes the mount point for the wizard shell specified in R5.

Keep exactly these, and **delete every export not named here**: `TIERS`,
`ISCO_GROUPS`, `fmt`, `fmtCompact` and `qualityTone` from
`utils/laborMetrics.js`; `seriesFor` and `PANEL_YEARS` from
`utils/laborPanel.js`; and `Sparkline.jsx`. That closes the partition — the
other nine `laborMetrics` exports (`METRICS`, `METRIC_BY_KEY`, `colorFor`,
`rampStops`, `radiusFor`, `normalise`, `NO_DATA_COLOR`, `fmtMetric`, `fmtInt`)
and the other three `laborPanel` exports (`TS_FIELDS`, `rowForYear`,
`coverageForYear`) all go.

**Acceptance:** `git ls-files src/components/LaborMap.jsx
src/components/LaborPage.jsx src/data/port_data.json` returns nothing;
`grep -rn "leaflet" src/ package.json package-lock.json` returns nothing;
`grep -rn 'METRICS\|METRIC_BY_KEY\|colorFor\|rampStops\|radiusFor\|normalise\|NO_DATA_COLOR\|fmtMetric\|fmtInt\|TS_FIELDS\|rowForYear\|coverageForYear' src/`
returns nothing; `npm run build` succeeds.

> Not `npm run lint`: `no-unused-vars` is module-local and never crosses an
> import boundary, and `varsIgnorePattern: '^[A-Z_]'` exempts most of the delete
> list even as locals. The grep is the check that can actually fail.

### R2. [ ] The canvas's tokens are the only source of colour, type and motion

Define the palette, radii, type scale and the five keyframes from *The design*
section of `CLAUDE.md` as CSS custom properties in `src/styles/index.css`. Load
Geist, Geist Mono and Instrument Serif (including Instrument Serif italic) with
a fallback stack on every family.

**Acceptance:** `grep -c -- '--accent: *#FF5A2B' src/styles/index.css` returns 1;
`src/components/wizard/ResultScreen.jsx` exists **and**
`grep -rEn '#[0-9A-Fa-f]{6}' src/components/wizard/` returns nothing (the file
check keeps this from passing vacuously on a missing directory); the three
families and the italic face are requested; `@media (prefers-reduced-motion:
reduce)` disables the five animations.

### R3. [ ] shadcn/ui is installed as JSX over Tailwind v4

Run the shadcn CLI against the existing Tailwind v4 setup. `components.json`
must carry `"tsx": false` and an empty `tailwind.config`. Add `jsconfig.json`
with `@/*` → `./src/*` **and** the matching `resolve.alias` in `vite.config.js`,
because Vite does not read `jsconfig.json` for resolution. Add only the
components the screens use: `button card input badge toggle-group slider
accordion`.

**Acceptance:** `components.json` parses with `.tsx === false` and
`.tailwind.config === ""`; every file under `src/components/ui/` ends `.jsx`;
the build resolves an `@/` import; `npm run lint` and `npm run build` both pass.

### R4. [ ] The shadcn defaults are overwritten, not shipped

The generated components must render in the canvas palette — dark by default on
`:root`, not only under `.dark`. Restyle by extending each component's `cva`
variants and the CSS tokens, not by stacking overriding `className`s at call
sites.

**Acceptance:** `grep -c 'oklch(' src/styles/index.css` returns 0 (no shadcn
default token value survives) and `grep -rn 'class="dark"\|className="dark"'
src/ index.html` returns nothing — both runnable. **Manual, recorded in the
verification section of this spec:** load `/` and confirm the ground is
`#0D0C0A` and the primary `#FF5A2B`. This one needs a browser; per `CLAUDE.md`,
a clean build is not evidence the page renders.

### R5. [ ] The wizard shell — five screens, progress, motion, focus

Sticky header with the live dot, title and `NN/04` over a four-segment progress
bar. Screens: intro, country, occupation, optional, result. Steps 01–03 carry
the sticky footer CTA over the gradient fade. `stepin` on mount. Mounted by
`App.jsx` per R1.

**Acceptance:** **Manual, recorded in the verification section**, because
computed-style assertions need a rendered DOM and R19's runner is
`jsdom`-based, not a browser: every interactive element computes `min-height >=
48px`, the primary CTA `>= 60px`, `:focus-visible` computes to `2px solid
#FF5A2B` with `outline-offset: 3px`, and the column is `max-width: 480px`.
Record what was loaded, at what viewport, and what was seen.

### R6. [ ] Step 01 — country, tagged by what the data actually carries

List countries from the payload. Each row's `official series` / `no series` tag
is **derived from the row's own nullity**, reading **"any of the nine ISCO
fields non-null"** — 177 countries, the same set `isco_groups_reported`
describes. Pre-fill from `navigator.language` where it resolves to a country in
the payload.

The three readings differ by seven countries (any = 177, all nine = 170, and
`isco4` alone = 177), so the reading is stated rather than left to the
implementer. A consequence follows and is owned by R10: because step 01 runs
before the group is known, up to seven countries can be tagged `official
series` here and still land on a stated absence at step 04 when the user's
group is one their source does not report. That is honest, but R10 must make
the withdrawal explicit rather than rendering a blank.

**Acceptance:** unit test (R19) over the payload — a country with all nine ISCO
fields null renders `no series`; the count of `official series` rows equals the
count of countries with any of the nine non-null (177 at the probed vintage);
no country is hidden from the list for lacking data.

### R7. [ ] Step 02 — a job title resolves to an ISCO-08 major group, visibly

Free-text input resolves to one of the nine ISCO-08 major groups. The resolved
group is displayed with its code and full label, and is overridable by chip. A
title that resolves to nothing must say so rather than silently defaulting. The
resolver is a pure function in `src/utils/`, not logic inside a component, so
R19 can test it directly.

**Acceptance:** unit test (R19) — `resolveTitle('paralegal')` returns 3 and the
UI shows `3 · Technicians and associate professionals`;
`resolveTitle('bookkeeper')` returns 4; `resolveTitle('zzzz')` returns null and
the UI shows an explicit "not resolved — pick a group" state with no group
pre-selected; picking any chip overrides the resolution.

### R8. [ ] Age band × ISCO group comes from ILOSTAT, per group

Extend the pipeline to emit, per country and per ISCO major group, the employed
share for `Y15-24`, `Y25-54` and `Y55-64` from `DF_EMP_TEMP_SEX_AGE_OCU_NB`,
over the `YGE15` denominator. Tier `DERIVED` (share = group-age count ÷ group
`YGE15` count, both `OFFICIAL`), recorded in `field_tiers`.

Per *The vintage rule* above, the value is taken at **each country's own most
recent year** carrying all three bands and the denominator, recorded in its own
`data_year_age_occupation` field — not forced to `data_year_occupation`.
Countries the flow does not cover stay null with a `data_quality_flag`.

**Acceptance:** `npm run pipeline` emits the new fields; **at least 145**
countries carry a non-null value for group 4 × `Y25-54` (measured 158 at the
free vintage; the same criterion at `data_year_occupation` would be 132, which
is why the vintage rule is stated); `field_tiers` names every new field; a
`data_year_age_occupation` is present wherever a value is; `npm run
test:pipeline` passes with a case asserting an uncovered country stays null;
selecting an age band in step 03 changes the figure shown on the result screen.

### R9. [ ] Education band × ISCO group comes from ILOSTAT, per group

As R8, from `DF_EMP_TEMP_SEX_OCU_EDU_NB`, added to `ILO_FLOWS` in
`pipeline/config.py` alongside the existing three (`occupation`,
`age_occupation`, `lfp_by_area`) with **`startPeriod=2013`** — the unrestricted
flow is 90.5 MB against 55.5 MB restricted, and 2013 matches the other flows.
Vintage rule as R8, recorded in `data_year_edu_occupation`.

**The denominator is `EDU_AGGREGATE_TOTAL`, never the sum of the three bands.**
`BAS`/`INT`/`ADV` do not partition the base: `EDU_AGGREGATE_LTB` and
`EDU_AGGREGATE_X` sit outside them, and the residual runs 0.3%–7.3%.
Renormalising over the three would silently redistribute less-than-basic
workers, which is the imputation this project does not do. Consequences:

- The three shares **will not sum to 100**, and the result screen says why.
- `LTB` is a **fourth chip** — "Below basic" — wherever the country publishes it
  (132 payload countries). The canvas shows three; the data has four, and the
  data wins.
- Where `LTB` is not published but a residual remains, the residual is stated
  rather than absorbed.

**Acceptance:** `pipeline/raw/ilostat/DF_EMP_TEMP_SEX_OCU_EDU_NB.csv` is written
on first run and re-read on the second; **at least 140** countries carry a
non-null value for group 4 × `ADV` (measured 155 at the free vintage; 124 at the
occupation vintage); the four chips land on four different published cells,
demonstrable by the figure changing between them; a unit test (R19) asserts the
three named bands are divided by `EDU_AGGREGATE_TOTAL` and that their sum is
strictly less than 100 for ETH.

### R10. [ ] The result screen shows the group's share, with tier and vintage

Report the chosen group's share of employment for the chosen country, its tier
badge (`DERIVED` at the probed vintage) and the `data_year_occupation` for that
row. Never present the row as a single-year snapshot — where R8 and R9 values
are shown, their own years are shown with them.

**This requirement owns the withdrawal described in R6.** Where the country was
tagged `official series` but does not report the user's specific group, the
result screen states that in words — which group, which country, that the
source does not publish it — rather than rendering a blank or a dash.

**Acceptance:** unit test (R19) over the payload — GBR × group 4 yields `8.9%`
with a `DERIVED` badge and the year 2025; a country with a null share for the
chosen group yields the stated-absence branch, not a zero, a dash or an empty
node; a country with all nine null yields the same branch.

### R11. [ ] Headcount is derived per group, or it is absent

The canvas's "People doing it" figure exists in the payload only for clerical,
professionals and the two aggregates. For the other groups compute
`round(share / 100 × employed_total)`, tier `DERIVED`.

This is a **two-source join** and the label must say so: the share comes from
the ILO survey base and `employed_total` from the World Bank, and the two
disagree — for GBR, 33,728,592 against `isco_source_employed_thousands`'
34,055,472, about 1%. This is what the pipeline already does for
`clerical_employed`, so R11 is consistent with it rather than inventing a second
base, but "label the arithmetic" means naming both sources, not implying one.

**Acceptance:** the derivation reproduces `clerical_employed` for all 177
countries that carry it (verified: 177/177 exact); GBR × group 4 renders
`2.99M`; GBR × group 7 renders a `DERIVED` figure computed from the share; a
**unit test (R19) over a synthetic row** with a null `employed_total` renders no
headcount — no country in the current payload has one (0 of 177), so this branch
cannot be exercised against real data and must not be marked `[x]` on the
strength of never having run.

### R12. [ ] The trend says it is a stand-in whenever it is one

The time series carries `isco4_clerical_pct` only. When the chosen group is 4,
the sparkline is that group's own series. When it is any other group, the panel
must state that the clerical series is standing in — or omit the panel. A
country with no series shows no sparkline.

Reuse `seriesFor` and `Sparkline` kept by R1 rather than writing a second
sparkline.

**Acceptance:** unit test (R19) — group 4 yields the sparkline with no stand-in
notice; group 7 yields either the stand-in notice or no panel, never an
unlabelled line; a country absent from `series` yields no sparkline; the
generative-AI marker line is present and labelled.

### R13. [!] The projected replacement year

Establish whether any published source supports stating a year by which half of
an ISCO major group is displaced, per country.

**Not feasible (2026-08-31):** searched for a published source and found none.
The nearest published work is US-only, decadal occupational *churn* on 1950 and
2010 US census occupational classifications (IPUMS / Minnesota Population
Center; ITIF's 1850–2015 series). That is not ISCO-08, not per country, and
churn is not AI displacement — an occupation whose workers move between
categories has not been displaced by anything in particular.

The canvas's own method panel already concedes the gap: *"Duration — needs
completed historical displacements. Not yet sourced."* Independently confirmed
on review at `8509f46`.

**Consequence:** no replacement year ships, in any tier. Shipping it as
`MODELED` would need its own formula, sensitivity analysis and issue, on the
precedent of the AI exposure weights; that is deliberately not borrowed here.
R14 specs the result screen to be complete without it.

### R14. [ ] The result screen is complete and honest without the year

Given R13, the result screen must read as finished with no year, no interval
band, no scenario slider and no adoption assumption. It must not display a
placeholder, a greyed-out year, or "coming soon" copy where the year sat.

**Acceptance:** `src/components/wizard/ResultScreen.jsx` exists **and**
`grep -rEn '\b20(2[89]|[3-7][0-9])\b' src/components/wizard/` returns nothing
(the file check keeps this from passing vacuously; the range correctly excludes
2025 and 2026, so the sparkline axis and `data_year_occupation` do not trip it);
no build renders a four-digit year as the result headline; the result screen's
own copy states that no displacement date is published, and links to the method
panel.

### R15. [ ] Nothing is imputed, anywhere in the wizard

Every screen honours the project non-negotiable: a null stays null and says so.
No fallback to a regional average, a world figure, or a neighbouring country.

This restates a rule `REVIEW.md` Pass 1 already enforces as a Blocker, and it
earns a requirement ID here because the surface makes it newly tempting: the map
showed 218 countries at once, so a gap was visibly a gap, while the wizard shows
**one** country and a blank screen invites a fallback. R8's null countries make
this concrete — at the occupation vintage they are not a random tail but the
countries with older `data_year_occupation`, which already carry a `partial`
flag.

**Acceptance:** unit test (R19) over **synthetic rows** — a row with a
`data_quality_flag` other than `complete` surfaces that flag on the result
screen; a row with a null ISCO block yields a result of stated absences and zero
numbers; a row with a null in one of the nine groups does not borrow from
another group, from a region row, or from the world row. Plus
`grep -rn 'region\|world\|average\|median' src/components/wizard/` reviewed by
hand for any fallback path.

### R16. [ ] The method and back-test panels tell the truth about the model

The two accordions ship. The method panel lists the terms the result actually
uses, each with its tier. A term with no source is shown as **absent with its
reason**, not as a number. The back-test panel states the nine-group floor —
that no source supports telling an individual their specific role is at risk,
only their occupational group.

**Acceptance:** the method panel's terms match the figures actually rendered;
the "Duration" term, if shown, states it is unsourced and cites R13; no panel
claims a back-test that has not been run.

### R17. [ ] `npm run verify` stays green

Lint, build, the pipeline suite, the new JS suite from R19 and the pilot anchors
all pass with the new pipeline fields and the new app. R19's runner is added to
`verify` in the same change that introduces it, per `CLAUDE.md`'s rule that a
check added to CI is added to `verify`.

**Acceptance:** `npm run verify` exits 0 and runs the JS suite; the four
regression anchors (World services ≈50%, US ≈79%, EU-27 ≈72%, India ≈31.5%) are
unmoved; CI is green on the PR. The pipeline suite's test count rises from 126
as a result of R8 and R9 — the criterion is that it passes, not that it stays at
126.

### R18. [ ] Ten countries publish ISCO-88, and the result screen says so

167 of the 177 countries with an ISCO block publish ISCO-08; **10 publish
ISCO-88** — BMU, CAN, MAC, NAM, NIC, TTO, TWN, UKR, YEM, ZAF — carried in
`isco_classification`.

`pipeline/README.md` justifies the fallback on the grounds that "the two
revisions align 1:1 at the major-group level, so the 1–4 white-collar cut
carries over", and then names where that breaks: the revision "did move some ICT
occupations between groups 2 and 3". Today's app renders only the aggregate cut,
so the fallback is invisible and harmless. This spec moves the unit of analysis
to the **individual major group** — precisely where the README says
comparability degrades — on the one screen that tells a person about their own
occupation. A Canadian who types "software developer" resolves to group 2 and is
shown an ISCO-88 group 2 share under an ISCO-08 label.

R12's principle applies unchanged: a stand-in says it is standing in.

**Acceptance:** unit test (R19) over the payload — CAN × group 2 yields the
ISCO-88 notice naming the classification and the 2/3 boundary caveat; GBR ×
group 2 does not; the notice is present for all ten countries and absent for the
other 167.

### R19. [ ] A JavaScript test runner, and the logic pushed where it can be tested

There is no JS test runner in this repo: `verify` is lint, build, the Python
suite and the pilot. Ten of this spec's acceptance criteria need a rendered DOM
or a computed style, so as written they are "someone looked at it" and are out
of reach of `/evaluate`.

Add **Vitest** with `jsdom`, wired into `npm run verify`. Push the testable
logic out of the components and into `src/utils/` — the title resolver (R7), the
country tagger (R6), the share and headcount formatters (R10, R11), the trend
stand-in decision (R12), the absence rules (R15) and the ISCO-88 notice (R18) —
so each is a pure function over the payload rather than a branch inside JSX.

R4 and R5 remain manual: token rendering and computed touch targets genuinely
need a browser, and this requirement does not pretend otherwise.

**Acceptance:** `npm test` runs Vitest and `npm run verify` invokes it; the
suites named in R6, R7, R9, R10, R11, R12, R15 and R18 all exist and pass; each
of those requirements' criteria is executed by a test rather than asserted in
prose; `npm run verify` fails if any of them fails.

## Verification section

*Filled in during implementation. R4 and R5 are manual checks; record what was
loaded, at what viewport, and what was seen.*

| Requirement | Checked | Result |
|---|---|---|
| R4 — palette renders | | |
| R5 — touch targets, focus ring | | |

## Non-goals

- **No replacement year, in any tier.** Shipping it as `MODELED` is a separate
  decision needing its own formula, sensitivity analysis and issue. R13 records
  why it is not in this spec.
- **No Next.js and no TypeScript.** Issues #23 and #22 will migrate these files
  later; building on Vite + JSX now is a deliberate, accepted double migration.
- **No routing.** The wizard's steps are internal state. Real routes and
  deep-linkable URLs remain #24 and #15.
- **The map is not kept behind a route.** It is deleted outright — the design has
  no map, and a second unmaintained surface in the new palette is worse than
  none. It stays recoverable in git history.
- **The corridor-wars overlay goes with it.** `port_data.json` and
  `sanctions_regimes.json` were a static snapshot for the R16 overlay
  (issue #20). Deleting them closes that drift rather than carrying it.
- **No ISCO 2-digit sub-major groups** (#9). Nine major groups is the floor this
  design is built on, and R18 discloses where even those are not like-for-like.
- **No sex disaggregation** (#27), no earnings (#10), no Anthropic Economic
  Index overlay (#47). All are separate issues and would each add a dimension to
  the wizard.
- **No payments, accounts or paid report** (#28–#32). This is the free surface.
- **No browser-driven end-to-end tests.** R19 stops at `jsdom`. Playwright would
  make R4 and R5 checkable, but it is a CI dependency this repo has not taken
  and is not worth taking for two criteria.
