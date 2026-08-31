# 0010 — mobile-first redesign

**Status:** in-progress
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
choice, and it costs coverage: forcing alignment takes group 4 from **149 → 121**
countries for R8 and **149 → 113** for R9. Both years are recorded, so the result
screen can and must show them separately.

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
| ILOSTAT `DF_EMP_TEMP_SEX_AGE_OCU_NB` | live SDMX `curl`, 2026-08-31 — `https://sdmx.ilo.org/rest/data/ILO,DF_EMP_TEMP_SEX_AGE_OCU_NB,1.0/.A..SEX_T../?startPeriod=2013&format=csv` (also cached under `pipeline/raw/ilostat/`) | HTTP 200. **164 areas** carry an ISCO-08 major group. `OCU_ISCO08_1`…`9` crossed with `AGE_AGGREGATE_Y15-24 / Y25-54 / Y55-64 / YGE65` and the `YGE15` denominator. Cell-level, intersected with payload countries and **counting only cells that carry a value**: **158** payload countries appear in the flow at all, but for group 4 only **149** carry all three bands plus the denominator at their own most-recent year, and **121** at `data_year_occupation`. Coverage is not uniform across the nine groups — group 1 is the floor at **144**, group 4 is 149, groups 5/7/9 reach 158. **0 areas** pair `AGE_10YRBANDS_*` with `OCU_ISCO08_*`, so 0002 R11's skill-level-only finding is correctly scoped and does not apply here |
| ILOSTAT `DF_EMP_TEMP_SEX_OCU_EDU_NB` | live SDMX `curl`, 2026-08-31 — `https://sdmx.ilo.org/rest/data/ILO,DF_EMP_TEMP_SEX_OCU_EDU_NB,1.0/.A..SEX_T../?startPeriod=2013&format=csv` | HTTP 200, 55.5 MB, 265,835 rows, **162 areas**, years 2013–2026. *(Unrestricted the flow is 1982–2026, 428,474 rows, 90.5 MB — hence the start year in R9.)* Cell-level against payload countries, **counting only cells that carry a value**: for group 4, **149** carry `BAS`/`INT`/`ADV` plus `EDU_AGGREGATE_TOTAL` at their own most-recent year, **113** at `data_year_occupation`. (154 and 125 are the `ADV`-alone figures, not this four-cell reading.) Group floor across the nine is **144** (group 8). **`BAS`/`INT`/`ADV` do not partition the base** — `EDU_AGGREGATE_LTB` (present for group 4 at the reconciled year for **81** of the 149) and `EDU_AGGREGATE_X` sit outside them. **The residual is not a narrow range**: median 0.8%, but **27 of the 149 exceed 10%**, topping out at CMR 91.7% and AGO 91.0%, driven by `EDU_AGGREGATE_X` rather than `LTB` — Cameroon group 4 is `TOTAL` 254.3k against `X` 220.4k, so the three bands describe 8.3% of its clerical workers and all four rendered
chips describe 13.3% — the figure R9's coverage floor actually tests → R9's coverage floor |
| Google Fonts — Geist, Geist Mono, Instrument Serif | live `curl` css2, 2026-08-31 | All three HTTP 200. Geist serves 300–600, Instrument Serif serves normal and italic (the canvas headline needs italic) |
| `shadcn` on npm + `ui.shadcn.com/docs/components-json` | registry `curl` + docs fetch, 2026-08-31 | Latest **4.19.1** (published 2026-08-31). `tsx: false` "allows components to be added as JavaScript with the `.jsx` file extension"; for Tailwind v4 the `tailwind.config` field is "left blank" |
| A published source for the **replacement year** | web search, 2026-08-31 | **Not found.** Nearest published work is US-only, decadal occupational *churn* on 1950/2010 US census classifications (IPUMS / Minnesota Population Center; ITIF 1850–2015). Not ISCO-08, not per country, and churn ≠ AI displacement. Nothing publishes "years until half of ISCO group N is displaced" → R13 |

## Requirements

### R1. [x] The wizard is the app; the map and the corridor overlay are deleted

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

### R2. [x] The canvas's tokens are the only source of colour, type and motion

Define the palette, radii, type scale and the **four** keyframes from *The
design* section of `CLAUDE.md` (`stepin`, `fade`, `draw`, `pulse` — not `band`,
which animates the interval band R14 does not ship) as CSS custom properties in `src/styles/index.css`. Load
Geist, Geist Mono and Instrument Serif (including Instrument Serif italic) with
a fallback stack on every family.

**Acceptance:** `grep -c -- '--accent: *#FF5A2B' src/styles/index.css` returns 1;
`src/components/wizard/ResultScreen.jsx` exists **and**
`grep -rEn '#[0-9A-Fa-f]{6}' src/components/wizard/` returns nothing (the file
check keeps this from passing vacuously on a missing directory); the three
families and the italic face are requested; `@media (prefers-reduced-motion:
reduce)` disables the four animations.

### R3. [x] shadcn/ui is installed as JSX over Tailwind v4

Run the shadcn CLI against the existing Tailwind v4 setup. `components.json`
must carry `"tsx": false` and an empty `tailwind.config`. Add `jsconfig.json`
with `@/*` → `./src/*` **and** the matching `resolve.alias` in `vite.config.js`,
because Vite does not read `jsconfig.json` for resolution. Add only the
components the screens use: `button card input badge toggle-group accordion`.
**Not `slider`**: its only consumer in the canvas is the adoption scenario, which
R14 does not ship, and `CLAUDE.md` says to add only what a screen uses.

**Acceptance:** `components.json` parses with `.tsx === false` and
`.tailwind.config === ""`; every file under `src/components/ui/` ends `.jsx`;
the build resolves an `@/` import; `npm run lint` and `npm run build` both pass.

### R4. [~] The shadcn defaults are overwritten, not shipped

The generated components must render in the canvas palette — dark by default on
`:root`, not only under `.dark`. Restyle by extending each component's `cva`
variants and the CSS tokens, not by stacking overriding `className`s at call
sites.

**Acceptance (revised 2026-08-31 — see below):** `grep -c 'oklch('
src/styles/index.css` returns 0 and no `class="dark"` appears in `src/` or
`index.html`; and `computed.test.jsx` renders the app with the real stylesheet
injected and asserts the **computed** values on real elements — `--bg` is
`#0D0C0A`, the mapped shadcn names resolve to the canvas tokens rather than to
defaults, `body`'s background computes to `#0D0C0A`, and no `.dark` class exists
in the rendered tree.

**`[~]` revised.** The criterion was "load `/` and confirm the ground is
`#0D0C0A`" — a person looking at a browser. jsdom cannot do layout, but it does
do the **cascade**: it resolves selector matching, specificity and inheritance,
and it resolves custom properties on `:root`. It does not substitute `var()`
inside a declaration, so the suite resolves that indirection in one explicit
step. That fails on everything a text grep cannot see — a selector that does not
match, a rule another rule overrides, a token that is never defined, a class the
component stopped applying. **Still outstanding and browser-only:** the actually
painted colour.

### R5. [~] The wizard shell — five screens, progress, motion, focus

Sticky header with the live dot, title and `NN/04` over a four-segment progress
bar. Screens: intro, country, occupation, optional, result. Steps 01–03 carry
the sticky footer CTA over the gradient fade. `stepin` on mount. Mounted by
`App.jsx` per R1.

**Acceptance (revised 2026-08-31):** `computed.test.jsx` renders the wizard
with the real stylesheet injected and asserts on the elements themselves: the
primary CTA computes a 60px floor, a country option 56px, the tertiary action
48px, nothing interactive on the intro declares under 48px, and the column token
is 480px. The focus ring and the four keyframes are asserted in
`tokens.test.js`.

**`[~]` revised.** The criterion assumed jsdom could not check any of this
because it does no layout. That conflated layout with the cascade: `min-height`
is a *declared* property, not a layout outcome, so a computed value of 60px
means the browser will honour it. **Still outstanding and browser-only:** what a
60px min-height actually paints against its content and box model, and whether
the three fonts load — the second of which is why the `@import` position defect
mattered and is now its own regression test.

### R6. [x] Step 01 — country, tagged by what the data actually carries

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

### R7. [x] Step 02 — a job title resolves to an ISCO-08 major group, visibly

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

### R8. [x] Age band × ISCO group comes from ILOSTAT, per group

**This flow is already fetched, cached and read.** `ILO_FLOWS["age_occupation"]`
is `DF_EMP_TEMP_SEX_AGE_OCU_NB` at `startPeriod=2013` (`pipeline/config.py:48`),
and `load_youth_occupation` (`pipeline/run.py:105`) already derives an age × ISCO
cross-tab from it, emitting `youth_age_band_used`, `youth_cohort_share`,
`youth_wc_gap`, `youth_isco_coverage_pct_of_employment`,
`data_year_youth_occupation` and `data_year_youth_occupation_range`.

So R8 **extends `load_youth_occupation`**; it does not add a second reader over
the same CSV. All three bands are already read there (`build.py:199-201`) — what
the loader does *not* do is keep them per group: `_youth_share(..., family)`
collapses ISCO into the white-collar 1–4 cut. **The per-group dimension is the
extension, and that is where the work is** — nine group shares per band, where
today there is one family share per band.

**Each new per-group field gets its own year companion.** That is this module's
established shape, not a duplication: `build.py:234-245` already writes
`prime_white_collar_year` and `late_career_white_collar_year` alongside their
`_pct` fields, so a `_year` companion beside a `_pct` field is `CLAUDE.md`'s
"record the year per field" being followed, not broken.
`data_year_youth_occupation` keeps exactly the meaning it has today and is not
re-reconciled.

**Reconciliation is joint, not per band — one year per (country, group).** The
cited precedent supplies the *companion-field pattern*, not the reconciliation:
`build.py:238-245` reconciles each band independently, which would give 27 year
values per country and per-band coverage of 152 / 158 / 153 at group 4 against
149 joint. Joint is required here for a reason the precedent does not face: the
three bands are shares of one `YGE15` denominator, so bands taken from different
years do not compose — they would not sum to the group's whole, and the result
screen would show a breakdown whose parts came from different surveys. So the
value is taken at the most recent year carrying **all three bands and the
denominator together**, and that year is written once per (country, group):
**9 new `_year` fields, not 27.**

Two reasons this cannot instead be one shared field, both measured:

- Re-reconciling on all three bands moves the year for **10 countries** at group
  4 against the existing `data_year_youth_occupation` — AFG, ARE, BHS, GMB, GTM,
  HKG, ITA, KHM, LAO, PLW — with LAO moving five years (2022 → 2017). Reusing the
  field would either change the youth outputs or leave it naming a year its own
  value was not taken at.
- The reconciled year varies **across the nine groups for 34 countries** — BEN is
  2013 at group 1 and 2022 at the other eight; BLZ 2014 against 2019; CYP and CZE
  2022 against 2024. One per-country field cannot name nine vintages, and `_range`
  records that a spread exists without saying which group sits where.

Emit, per country and per ISCO major group, the employed share for `Y15-24`,
`Y25-54` and `Y55-64`, over the `YGE15` denominator. **Field names are
`isco<N>_age_<band>_pct` with companion `isco<N>_age_year`** — stated here so
R20's exclusion has a name to bind to rather than a convention invented in its
own criterion. Tier `DERIVED` (share = group-age count ÷ group
`YGE15` count, both `OFFICIAL`), recorded in **the cross-tab artefact's own tier
block** — R20 excludes these columns from `global_labor.json`'s.

Per *The vintage rule* above, the value is taken at **each country's own most
recent year** carrying all three bands and the denominator, recorded in that
field's own `_year` companion — not forced to `data_year_occupation`, and not
shared with the youth fields. Countries the flow does not cover stay null with a
`data_quality_flag`.

**Acceptance:** `npm run pipeline` emits the new fields; **at least 145**
countries carry a non-null value for group 4 (measured 149 at the free vintage;
121 at `data_year_occupation`, which is why the vintage rule is stated) **and
every one of the nine groups carries at least 140** (measured floor 144, group
1 — stated deliberately so a criterion cannot pass on clerical while failing on
managers); no second reader over `DF_EMP_TEMP_SEX_AGE_OCU_NB` is introduced and
`load_youth_occupation`'s existing outputs are unchanged; `field_tiers` names
every new field **in the cross-tab artefact's own tier block** (R20 excludes
them from `global_labor.json`); there are exactly **9** new age `_year` fields,
one per group,
each non-null wherever that group's bands carry values, so the result screen can
state a vintage for any of the nine groups;
`npm run test:pipeline` passes with a case asserting an uncovered country stays
null; selecting an age band in step 03 changes the figure shown.

### R9. [x] Education band × ISCO group comes from ILOSTAT, per group

As R8, from `DF_EMP_TEMP_SEX_OCU_EDU_NB`, added to `ILO_FLOWS` in
`pipeline/config.py` alongside the existing three (`occupation`,
`age_occupation`, `lfp_by_age`) with **`startPeriod=2013`** — the unrestricted
flow is 90.5 MB against 55.5 MB restricted, and 2013 matches the other flows.
Unlike R8 this flow is genuinely new — nothing reads it today — so it gets its
own reader. **And, exactly as R8, its year is per (country, group), not per
country**: the reconciled year varies across the nine groups for **43 of the 149**
countries carrying group 4 — wider than the age flow's 34, and with bigger
spreads (TUV runs 2016–2022 across its groups; CMR is 2014 at group 2 against
2021 elsewhere; MOZ 2015 at group 9; GEO 2019 at group 1 against 2025). R10
requires each value to be shown with its own year, and one `data_year_edu_occupation`
cannot say which group sits where. So: **9 new `_year` fields, one per group**,
reconciled jointly over `BAS`/`INT`/`ADV` plus `EDU_AGGREGATE_TOTAL` for the same
denominator reason as R8. **Field names are `isco<N>_edu_<band>_pct` with
companion `isco<N>_edu_year`.** A single `data_year_edu_occupation` / `_range`
may be kept as a summary; it is explicitly not the field R10 states a vintage
from.

**The denominator is `EDU_AGGREGATE_TOTAL`, never the sum of the three bands.**
`BAS`/`INT`/`ADV` do not partition the base: `EDU_AGGREGATE_LTB` and
`EDU_AGGREGATE_X` sit outside them. Over the 149 countries covered at group 4 the
residual has a median of **0.81%** and a maximum of **91.68%** (CMR) — a long
tail, not a narrow range, which is what the coverage floor below exists for.
Renormalising over the three would silently redistribute less-than-basic
workers, which is the imputation this project does not do. Consequences:

- The three shares **will not sum to 100**, and the result screen says why.
- `LTB` is a **fourth chip** — "Below basic" — wherever the country publishes it,
  which is 81 of the 149 at the reconciled year rather than the majority. The
  canvas shows three; the data has four where it has four, and the data wins.
- Where `LTB` is not published but a residual remains, the residual is stated
  rather than absorbed.

**And the dimension is withheld below a coverage floor.** The residual is not
uniformly small: median 0.81%, but 27 of the 149 covered countries exceed 10% and
Cameroon's chips describe 13.3% of its clerical workers, the rest being
`EDU_AGGREGATE_X`. At that level "the residual is stated" stops being a caption
and becomes the whole answer. So: **where the shares actually rendered cover less
than 90% of `EDU_AGGREGATE_TOTAL`, the education dimension is null for that
country with a `data_quality_flag`, and step 03 does not offer it** — withholding
rather than rendering a misleading chip, exactly as R6 and R10 withhold.

**The floor is measured on the chips the screen renders** — `BAS` + `INT` + `ADV`
**plus `LTB` where the country publishes it** — not on the three bands alone.
Measuring on three while rendering four would withhold countries whose rendered
chips do cover the base, on the strength of a chip R9 itself asked for: Djibouti's
three bands are 39.9% of `TOTAL` but its four chips are 99.6%. The gap is not an
edge case outside clerical, because clerical is the most educated group in the
flow and therefore the best case:

| Group | Carry the four cells | Clear a 3-band floor | Clear the 4-chip floor |
|---|---|---|---|
| 1 managers | 148 | 113 | 138 |
| 2 professionals | 148 | 126 | 138 |
| 3 technicians | 154 | 117 | 140 |
| 4 clerical | 149 | 122 | 138 |
| 5 service and sales | 156 | 95 | 142 |
| 6 agricultural | 149 | **59** | 136 |
| 7 craft | 153 | 89 | 140 |
| 8 operators | 144 | 98 | **134** |
| 9 elementary | 153 | 73 | 138 |

On the three-band basis a farm worker in most of the world would be told the
dimension does not exist while ILOSTAT publishes four chips summing over 90% of
the base. Cameroon still withholds either way — its four chips are 13.3%.

**Acceptance:** `pipeline/raw/ilostat/DF_EMP_TEMP_SEX_OCU_EDU_NB.csv` is written
on first run and re-read on the second; **at least 130** countries carry a
non-null education band for group 4 after the coverage floor is applied
(measured 138) **and every one of the nine groups carries at least 125**
(measured floor 134, group 8) — mirroring R8's two-part shape so the criterion
cannot pass on clerical while failing on agricultural; the chips land on
different published cells, demonstrable by the figure changing between them;
there are exactly **9** new education `_year` fields, one per group, each
non-null wherever that group's bands carry values, and a test asserts the result
screen states its vintage from those and **not** from
`data_year_edu_occupation`, which is the field an implementer reaches for first;
unit tests (R19) assert the three named bands are divided by
`EDU_AGGREGATE_TOTAL`, that their sum is strictly less than 100 for ETH, that
**CMR yields the withheld branch rather than four chips**, and that **DJI does
not** — its three bands are 39.9% but its rendered chips are 99.6%.

### R10. [x] The result screen shows the group's share, with tier and vintage

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

### R11. [x] Headcount is derived per group, or it is absent

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

### R12. [x] The trend says it is a stand-in whenever it is one

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

### R14. [x] The result screen is complete and honest without the year

Given R13, the result screen must read as finished with no year, no interval
band, no scenario slider and no adoption assumption. It must not display a
placeholder, a greyed-out year, or "coming soon" copy where the year sat.

**The intro screen must not promise a year either.** The canvas opens on "a year
— not a probability", which sets up exactly the thing the result screen does not
deliver — an intro that promises a year makes an honest result screen read as
broken rather than as finished. The claim becomes what the wizard actually does:
report what the statistics say about the reader's occupation group, measured
rather than forecast. This is a product decision, not a transcription fix, which
is why it is a requirement rather than only a note in `CLAUDE.md`.

**Acceptance:** `src/components/wizard/ResultScreen.jsx` exists **and**
`grep -rEn '\b20(2[89]|[3-7][0-9])\b' src/components/wizard/` returns nothing
(the file check keeps this from passing vacuously; the range correctly excludes
2025 and 2026, so the sparkline axis and `data_year_occupation` do not trip it);
no build renders a four-digit year as the result headline; **manual, recorded in
the Verification section** — the intro screen's claim references no year, date or
countdown, *in words as well as digits*: the grep above catches a `2041` in
`IntroScreen.jsx` but not "in under two decades", "how long you have" or "the
countdown for your job", and what is being judged is copy rather than a function,
so this is the honest shape for it; the result screen's own
copy states that no displacement date is published, and links to the method
panel.

### R15. [x] Nothing is imputed, anywhere in the wizard

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

### R16. [x] The method and back-test panels tell the truth about the model

The two accordions ship. The method panel lists the terms the result actually
uses, each with its tier. A term with no source is shown as **absent with its
reason**, not as a number. The back-test panel states the nine-group floor —
that no source supports telling an individual their specific role is at risk,
only their occupational group.

The panel renders its term list from a pure `termsFor(row, group)` in
`src/utils/` rather than from JSX, so "the terms match the figures rendered"
becomes an assertion over one function instead of a person reading two lists
side by side.

**Acceptance:** unit test (R19) — `termsFor` returns exactly the terms whose
figures the result screen renders for that row and group, each with its tier; the
"Duration" term, if present, is marked unsourced and cites R13; no term claims a
back-test that has not been run.

### R17. [x] `npm run verify` stays green

Lint, build, the pipeline suite, the new JS suite from R19 and the pilot anchors
all pass with the new pipeline fields and the new app. R19's runner is added to
`verify` in the same change that introduces it, per `CLAUDE.md`'s rule that a
check added to CI is added to `verify`.

**Acceptance:** `npm run verify` exits 0 and runs the JS suite; the four
regression anchors (World services ≈50%, US ≈79%, EU-27 ≈72%, India ≈31.5%) are
unmoved; CI is green on the PR. The pipeline suite's test count rises from 126
as a result of R8 and R9 — the criterion is that it passes, not that it stays at
126.

### R18. [x] Ten countries publish ISCO-88, and the result screen says so

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

### R19. [x] A JavaScript test runner, and the logic pushed where it can be tested

There is no JS test runner in this repo: `verify` is lint, build, the Python
suite and the pilot. Ten of this spec's acceptance criteria need a rendered DOM
or a computed style, so as written they are "someone looked at it" and are out
of reach of `/evaluate`.

Add **Vitest** with `jsdom`, wired into `npm run verify`. Push the testable
logic out of the components and into `src/utils/` — the title resolver (R7), the
country tagger (R6), the share and headcount formatters (R10, R11), the trend
stand-in decision (R12), the absence rules (R15), the method-panel term list
(R16) and the ISCO-88 notice (R18) — so each is a pure function over the payload
rather than a branch inside JSX.

R4 and R5 remain manual: token rendering and computed touch targets genuinely
need a browser, and this requirement does not pretend otherwise. Two tails are
manual too, and both are recorded in the Verification section rather than left
implied: R15's hand-review of its fallback grep, and R14's intro copy, which is a
copy judgement rather than a function.

**Acceptance:** `npm test` runs Vitest and `npm run verify` invokes it; the
suites named in R6, R7, R9, R10, R11, R12, R15, R16, R18 and R20 all exist and
pass — 66 tests across three files at the time of writing, including a
`jsdom` render suite that walks all five screens, because a clean build is not
evidence the page renders;
each of those requirements' criteria is executed by a test rather than asserted
in prose; `npm run verify` fails if any of them fails.

### R20. [x] The per-group cross-tabs do not ship in the initial payload

R8 and R9 together add **90 columns** to every row — 27 age shares plus 9 years, 36 education
shares plus 9 years plus 9 coverage flags — on top of the current 84.
`src/data/global_labor.json` is **607,739 bytes** (593.5 KB) at `b4d7b0a` across
229 rows; carrying the cross-tabs in it lands the initial download near
**1.2 MB**, and all but one row describes a country the reader did not pick.

This is the mobile-first spec, so it is the wrong place to let that happen
silently. The per-group age and education cross-tabs ship in **one artefact per
country**, fetched after step 01 for the country the reader picked.

**One file per country, not one file for all of them.** A single combined
artefact would still carry ~575 KB of which about 2.5 KB is the chosen country —
it defers the download to the step 01 → step 02 transition rather than removing
it, and the argument this requirement opens with ("all but one row describes a
country the reader did not pick") only lands on the per-country reading.

**The columns still enter `COLUMNS`.** They reach `global_labor_dataset.csv` and
the SQLite like every other column — this project's output *is* the dataset, and
keeping the cross-tabs out of it to save the app a download would be the wrong
trade. What changes is one place: `export_app_json` gains an **explicit exclusion
list**, because today `keep = [c for c in COLUMNS if not c.endswith("_range")]`
(`run.py:252`) feeds both the `field_tiers` block (`:265`) and every row's keys
(`:274`), so a column reaches both or neither and there is no third state.

That exclusion has consequences this requirement owns rather than leaves to
implementation:

- **R8's `field_tiers` criterion moves to the new artefact.** Every emitted
  number still carries a tier; the tier block it appears in is the cross-tab
  artefact's, not `global_labor.json`'s.
- **One of spec 0009's guards fails, not two.**
  `test_every_cell_matches_the_dataset_csv`
  (`pipeline/tests/test_app_payloads.py:334`) rebuilds `keep` from `run.COLUMNS`
  and walks every non-`_range` column against the committed payload, so it fails
  229 times over and must learn the exclusion.
  `test_field_tiers_covers_every_key_a_row_ships` (`:201`) compares
  `set().union(*rows)` against `self.committed["field_tiers"]` — **both sides out
  of the committed artefact** — so the exclusion drops them together and it stays
  green untouched. It must be **left alone**: its stated threat model is a
  hand-edit, and a name-shaped skip would blind it to exactly that. R17 means the
  alternative to deciding this here is a red suite during implementation.
- **The exclusion must not take the tier gate with it.** `keep` feeds a third
  consumer: `untiered = [c for c in keep if c not in C.FIELD_TIERS]`
  (`run.py:253`), whose `raise` is the *entire* enforcement of "every emitted
  number carries a tier" inside the pipeline — `export_csv` and `export_sqlite`
  have no tier check of their own. Excluding the 90 columns from `keep` would
  ship them in two tracked artefacts with nothing requiring them to be
  registered. **Ordering is therefore part of the requirement:** compute
  `untiered` over the full non-`_range` column list *before* the exclusion, and
  apply the exclusion only where the payload's rows and tier block are
  assembled.
- **The new artefact gets its own drift guard**, in the shape of
  `CommittedRowsMatchTheDataset`. 0009 exists because a committed payload went
  unregenerated for the life of the project while six tests appeared to cover it.
  Shipping the first app-consumed payload with no guard would re-open exactly
  that hole.

**A failed fetch is not an absence.** Both payloads are static imports today, so
a missing value has one meaning: the source does not carry it. A per-country
fetch adds two states that look identical on screen — in flight, and failed — and
three requirements render absence as a statement *about ILOSTAT*: R6's `no
series`, R9's withheld-below-the-floor branch, R10's stated absence. A 404, a
base-path mistake or an offline phone must never land in those branches and tell
a reader that ILOSTAT does not publish something it does publish. That is the
measured/constructed boundary from the other side — not an invented number, an
**invented absence** — and R15 covers imputation without reaching it. The load
carries its own state, and a pending or failed fetch renders as "could not load"
with a retry.

**Mechanism: a dynamic `import()`**, which Vite code-splits and resolves itself.
Not a `fetch` of a file under `public/`: the production base is
`/who-gets-replaced-first/` (`vite.config.js:8`), so a hand-built URL has to
carry `import.meta.env.BASE_URL` and the failure mode is a working dev build and
a 404 on Pages. Neither existing payload is fetched, so there is no in-repo
precedent to follow here and the choice is recorded rather than inferred.

This is not #26 (per-route data for the whole app); it is the narrower rule that
this spec's own additions must not land in the initial load.

**Acceptance:** `src/data/global_labor.json` is **no larger than 668,000 bytes**
(10% over its 607,739-byte size at `986d32c`), and this prints `[]` — over the
row keys as well as the tier block, so it still holds if someone implements the
exclusion in two places:

```python
import json, re
d = json.load(open('src/data/global_labor.json'))
bad = re.compile(r'isco[1-9]_(age|edu)_')
print(sorted({k for k in d['field_tiers'] if bad.match(k)} |
             {k for r in d['rows'] for k in r if bad.match(k)}))
```

The pattern is **anchored** on the `isco<N>_age_*` / `isco<N>_edu_*` names R8 and
R9 state. A substring test on `_age_` / `_edu_` does not work: it matches
`youth_age_band_used` and `labor_force_advanced_edu_pct`, both in the payload
today, so it would fail before R8 adds a column.

Also: the same columns **are** present in `global_labor_dataset.csv` and the
SQLite; `run.py`'s `untiered` gate still raises for an unregistered cross-tab
column; `npm run test:pipeline` passes with
`test_every_cell_matches_the_dataset_csv` taught the exclusion,
`test_field_tiers_covers_every_key_a_row_ships` **unmodified**, and a new guard
asserting the per-country artefacts match the dataset; the intro screen renders
without having fetched any cross-tab; unit tests (R19) assert the loader is not
called before a country is chosen, that it fetches **only the chosen country's
artefact**, and that **a failed fetch renders "could not load", not R9's withheld
branch or R10's stated absence**.

## Verification section

*Filled in during implementation. These are the only checks not executed by R19's
suite. For R4 and R5 record what was loaded, at what viewport, and what was seen;
for R15 record the grep output and what was concluded.*

| Requirement | Checked | Result |
|---|---|---|
| R15 — fallback grep output reviewed by hand | 2026-08-31 | **Pass.** `grep -rn 'region\|world\|average\|median' src/components/wizard/ src/utils/` returns 10 lines, all reviewed: `absence.js:6` and `terms.js:95` are prose; `countryTag.js:55-63` uses `region` for the **locale subtag** (`GB` in `en-GB`) to prefill the country, not a `row_type: 'region'` aggregate; the rest are `wizard.test.js` asserting that no borrowing happens. **No fallback path exists.** |
| R14 — intro copy reviewed by hand | 2026-08-31 | **Closed by test instead**, and it asserts both halves rather than only the absence — R14 exists because absence alone is not enough, so a criterion checking only for absence would miss the half that matters. Negative: `wizard.render.test.jsx` finds no four-digit projection year and none of `countdown` / `how long you have` / `years until` in the rendered intro. **Positive:** it asserts the claim the intro *does* make (`Measured, not forecast`), and that the result screen states in words that no displacement date is published. |
| R4 — palette renders | 2026-08-31 | **Closed by computed-style test** (`[~]`). `computed.test.jsx` injects the real stylesheet, renders the app and asserts the computed cascade on real elements. Residual, browser-only: the actually painted colour. |
| R5 — touch targets, focus ring | 2026-08-31 | **Closed by computed-style test** (`[~]`). The CTA computes 60px, an option 56px, the tertiary 48px, and nothing interactive on the intro declares under 48px — asserted on the elements, not on the file. Residual, browser-only: what those floors paint against real content, and whether the three fonts load. |

**What is left, precisely.** Not "R4 and R5 are unverified" — the cascade,
the tokens, the selectors and the floors are all asserted against a rendered
tree. What no engine without layout can give is the painted result: the colour
as rasterised, the box a 60px floor produces against its content, and whether
the three font faces actually arrive. Playwright would close those and is
deliberately a Non-goal below. A person loading `/` at 375px is the cheapest way
to close them, and the one defect this class of check already caught — the
dropped font `@import` — is now its own regression test rather than something a
viewer would have to notice.

## Implementation Plan

**Planned:** 2026-08-31

### Files to create

- `src/utils/` — the pure functions R19 requires: `resolveTitle.js`,
  `countryTag.js`, `groupFigures.js`, `trend.js`, `absence.js`, `terms.js`,
  `classification.js`, `crossTabs.js`
- `src/components/wizard/` — `WizardShell.jsx`, `IntroScreen.jsx`,
  `CountryScreen.jsx`, `OccupationScreen.jsx`, `OptionalScreen.jsx`,
  `ResultScreen.jsx`
- `src/components/ui/*.jsx` — shadcn output, six components
- `src/data/crosstabs/<ISO3>.json` — one per-country artefact each (R20)
- `vitest.config.js`, `jsconfig.json`, `components.json`
- `pipeline/tests/test_crosstabs.py` — the R20 drift guard

### Files to modify

`pipeline/config.py` (new flow, bands, 90 tier entries) ·
`pipeline/build.py` (extend `load_youth_occupation`; new `load_edu_occupation`) ·
`pipeline/run.py` (`COLUMNS`, the exclusion after the tier gate, the artefact
writer) · `pipeline/tests/test_app_payloads.py:334` (teach the exclusion; `:201`
**left untouched**) · `pipeline/tests/fixtures/` (regenerate) ·
`src/styles/index.css` · `vite.config.js` · `package.json` ·
**`package-lock.json`** (regenerated when `leaflet` and `react-leaflet` are
dropped — R1 greps it, so it is not incidental) · `src/App.jsx` ·
**`src/main.jsx`** (R1 removes the Leaflet stylesheet import) ·
`scripts/verify.sh` · `eslint.config.js` (R3's scoped `react-refresh` exemption
for the generated components)

### Sequence

**A — Tooling.** 1) R19's runner: Vitest + jsdom, `npm test`, wired into
`verify` in the same change. 2) R3: shadcn init with `tsx: false` and a blank
`tailwind.config`, `@/` alias in **both** `jsconfig.json` and `vite.config.js`.
3) R2 and R4: tokens, the three fonts, the four keyframes, defaults overwritten.

**B — Pipeline.** 4) R8. 5) R9, including the fixture cache slice for the new
flow. 6) R20's pipeline half: the exclusion placed after the `untiered` gate, the
per-country writer, `test_every_cell_matches_the_dataset_csv` taught the
exclusion, the new guard, and the committed CSVs plus golden fixture
regenerated.

**C — Logic.** 7) The seven util modules with their Vitest suites — R6, R7, R10,
R11, R12, R15, R16, R18. Pure functions over the payload, no DOM, no working app
required.

**D — App.** 8) R1 and R5 land **together**, so the app is never left broken:
the deletion and the new mount point are one change. 9) The screens, consuming
step 7. 10) R20's app half: the loader, its own load state, and the failed-fetch
branch kept distinct from absence.

**E — Close.** 11) R17. 12) The four manual checks recorded in the Verification
section.

### Requirement mapping

| Req | How it will be satisfied | Where | How acceptance is checked |
|---|---|---|---|
| R1 | Delete seven components, `corridorStates.js` and the two corridor snapshots; prune to the eight kept exports; `App.jsx` becomes the shell's mount point | `src/` | `git ls-files` returns nothing for the deleted paths; `grep -rn "leaflet" src/ package.json package-lock.json` empty; the twelve-name export grep empty |
| R2 | Palette, radii, type scale and four keyframes as custom properties; Geist, Geist Mono, Instrument Serif with fallbacks | `src/styles/index.css` | `grep -c -- '--accent: *#FF5A2B'` returns 1; `ResultScreen.jsx` exists **and** the hex grep over `wizard/` is empty |
| R3 | shadcn CLI, six components, `slider` excluded | `components.json`, `src/components/ui/` | `.tsx === false`, `.tailwind.config === ""`; every `ui/` file `.jsx`; lint and build pass |
| R4 | Palette on `:root`; restyle via `cva` variants and tokens | `src/components/ui/` | `grep -c 'oklch('` returns 0; no `class="dark"`; **manual** — palette renders |
| R5 | Sticky header, four-segment progress, five screens, `stepin` | `wizard/WizardShell.jsx` | **manual** — 48px/60px targets, focus ring, 480px column |
| R6 | `countryTag.js`, reading "any of the nine" | `src/utils/` | Vitest — 177 rows tagged `official series`; all-null row tagged `no series` |
| R7 | `resolveTitle.js`, a pure resolver | `src/utils/` | Vitest — `paralegal`→3, `bookkeeper`→4, `zzzz`→null |
| R8 | Extend `load_youth_occupation` to nine groups per band, joint reconciliation, 27 shares + 9 `_year` | `pipeline/build.py` | `npm run pipeline` — group 4 ≥ 145, every group ≥ 140; exactly 9 age `_year` fields; `load_youth_occupation`'s existing outputs unchanged |
| R9 | New `ILO_FLOWS` entry and loader; `TOTAL` denominator; four-chip 90% floor | `pipeline/build.py`, `config.py` | `npm run pipeline` — group 4 ≥ 130, every group ≥ 125; Vitest — CMR withheld, DJI not |
| R10 | `groupFigures.js`, including R6's withdrawal branch | `src/utils/` | Vitest — GBR × group 4 gives 8.9%, `DERIVED`, 2025; a null group gives the stated-absence branch |
| R11 | `round(share / 100 × employed_total)`, labelled as a two-source join | `src/utils/groupFigures.js` | Vitest — GBR × 4 gives 2.99M; GBR × 7 derived; a synthetic null-`employed_total` row gives no headcount |
| R12 | `trend.js` deciding the stand-in; reuse `seriesFor` and `Sparkline` | `src/utils/` | Vitest — group 4 no notice; group 7 notice or no panel; absent series no sparkline |
| R13 | Already `[!]` — the probe is recorded in *Source verification* | — | No implementation work |
| R14 | Result and intro ship with no year, band or slider | `wizard/` | The year-range grep over `wizard/` empty with `ResultScreen.jsx` present; **manual** — intro copy |
| R15 | `absence.js` — nulls stay null, no fallback path | `src/utils/` | Vitest over synthetic rows; **manual** — the fallback grep's output reviewed |
| R16 | `terms.js` exporting `termsFor(row, group)` | `src/utils/` | Vitest — the terms returned match the figures rendered, each with its tier |
| R17 | Lint, build, the pipeline suite, the JS suite and the pilot anchors | `scripts/verify.sh` | `npm run verify` exits 0; the four anchors unmoved |
| R18 | `classification.js` reading `isco_classification` | `src/utils/` | Vitest — CAN × 2 carries the ISCO-88 notice, GBR × 2 does not; present for all ten |
| R19 | Vitest + jsdom; the logic above pushed into `src/utils/` | root, `src/utils/` | `npm test` runs Vitest; `verify` invokes it; the **ten** suites named in R19 pass — R6, R7, R9, R10, R11, R12, R15, R16, R18 and R20 |
| R20 | Exclusion after the `untiered` gate; one artefact per country; loader with its own state | `pipeline/run.py`, `src/utils/crossTabs.js` | The anchored regex prints `[]` over rows and tiers; payload ≤ 668,000 bytes; the columns present in the CSV; Vitest — only the chosen country fetched, failed fetch ≠ withheld branch |

### Tier and vintage handling

| New number | Tier | Tier recorded in | Year recorded in |
|---|---|---|---|
| 27 × `isco<N>_age_<band>_pct` | `DERIVED` | the cross-tab artefact's own tier block | `isco<N>_age_year` (9 fields) |
| 36 × `isco<N>_edu_<band>_pct` | `DERIVED` | the cross-tab artefact's own tier block | `isco<N>_edu_year` (9 fields) |
| Per-group headcount (R11) | `DERIVED` | the rendered label, naming both sources | inherits `data_year_occupation` |

All 90 columns enter `COLUMNS` and `FIELD_TIERS`, so `global_labor_dataset.csv`
and the SQLite carry them and `run.py`'s `untiered` gate covers them. Only
`export_app_json` sheds them, and only after that gate has run.

### Validation

The existing `[validate]`, `[crosscheck]` and `[outliers]` blocks are unaffected:
all four regression anchors read `emp_services_pct`, which this spec does not
touch. New checks needed in `build.validate`:

- every new share within 0–100;
- the three age bands summing to ≈100 within a group;
- the education chips summing to ≤100, strictly below it where a residual exists;
- the coverage floor applied rather than assumed.

Plus `pipeline/tests/test_crosstabs.py`, in the shape of
`CommittedRowsMatchTheDataset`, so the per-country artefacts cannot drift.

### Risks

1. **The golden master must be re-fixtured offline.** `test_golden_master.py`
   patches `getaddrinfo` to raise, so `fixtures/raw/` needs a slice of the new
   education flow for the six pilot areas or the pilot cannot run at all. Highest
   probability of blocking step 5.
2. **218 per-country artefacts** is a lot of files to ship on GitHub Pages. If it
   proves unworkable the fallback is a sharded index, which reopens R20's
   one-file-versus-per-country decision — that would be a `[~]`, not a silent
   change.
3. **`test_columns.py:43` asserts header equality** with `run.COLUMNS`, so the
   committed CSVs must regenerate in the same commit that adds the columns; a
   partial commit reds the suite.
4. **R9's flow is 55.5 MB** on a cold cache. First run is slow; re-runs offline.
5. **R4, R5, R14 and R15 stay manual**, so `/evaluate` cannot close them — they
   need the Verification section filled in by hand.

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
