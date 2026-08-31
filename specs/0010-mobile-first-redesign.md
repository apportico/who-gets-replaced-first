# 0010 — mobile-first redesign

**Status:** draft
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

## Source verification

Probed 2026-08-31. Every source below was hit before the requirement naming it
was written.

| Source | Probed | Result |
|---|---|---|
| `src/data/global_labor.json` | read, 2026-08-31 | 229 rows (218 country / 7 region / 3 group / 1 world), 84 fields, `field_tiers` block present. All nine `iscoN_*_pct` fields carried by 173–177 countries, tier `DERIVED`. **The canvas's UK figures are real**: `isco4_clerical_pct` = 8.8633, `clerical_employed` = 2,989,466 |
| `src/data/global_labor.json` — headcounts | read, 2026-08-31 | Per-group headcount exists **only** for clerical, professionals, professional-core and white-collar. There is no `iscoN_employed` for the other five groups |
| `src/data/global_labor_timeseries.json` | read, 2026-08-31 | `fields` × `years` × `series`; years 2013–2026, 226 series. Of the ISCO fields only **`isco4_clerical_pct`** is present (185 series carry a point). GBR runs 10.02% (2013) → 8.86% (2025), matching the canvas exactly |
| ILOSTAT `DF_EMP_TEMP_SEX_AGE_OCU_NB` | cached file under `pipeline/raw/ilostat/`, 2026-08-31 | Carries `OCU_ISCO08_1`…`OCU_ISCO08_9` crossed with `AGE_AGGREGATE_Y15-24 / Y25-54 / Y55-64 / YGE65` for **164 areas**. Age × ISCO major group is available and is *not* the skill-level-only limitation recorded at 0002 R11 (that finding was about `AGE_10YRBANDS`, which does pair with `OCU_SKILL_*`) |
| ILOSTAT `DF_EMP_TEMP_SEX_OCU_EDU_NB` | live SDMX `curl`, 2026-08-31, HTTP 200, 25.4 MB, 122,443 rows | Carries `OCU_ISCO08_1`…`9` crossed with `EDU_AGGREGATE_BAS / INT / ADV` for **142 areas**, 2020–2026. Maps directly onto the canvas's Basic / Interm. / Tertiary chips |
| ILOSTAT dataflow catalogue `sdmx.ilo.org/rest/dataflow/ILO` | live `curl`, 2026-08-31, HTTP 200, 7.3 MB | Confirms both flow IDs above exist and are the only `OCU`-crossed employment flows carrying `AGE` and `EDU` respectively |
| Google Fonts — Geist, Geist Mono, Instrument Serif | live `curl` css2, 2026-08-31 | All three HTTP 200. Geist serves 300–600, Instrument Serif serves normal and italic (the canvas headline needs italic) |
| `shadcn` on npm + `ui.shadcn.com/docs/components-json` | registry `curl` + docs fetch, 2026-08-31 | Latest **4.19.1** (published 2026-08-31). `tsx: false` "allows components to be added as JavaScript with the `.jsx` file extension"; for Tailwind v4 the `tailwind.config` field is "left blank" |
| A published source for the **replacement year** | web search, 2026-08-31 | **Not found.** Nearest published work is US-only, decadal occupational *churn* on 1950/2010 US census classifications (IPUMS / Minnesota Population Center; ITIF 1850–2015). Not ISCO-08, not per country, and churn ≠ AI displacement. Nothing publishes "years until half of ISCO group N is displaced" |

## Requirements

### R1. [ ] The wizard is the app; the map and the corridor overlay are deleted

The wizard is the only surface. No router — step state is internal to the
wizard. Delete `LaborPage`, `LaborMap`, `LaborSidebar`, `LaborDetailPanel`,
`LaborTimeline`, `ScenarioPanel`, `Header` and `utils/corridorStates.js`, along
with the corridor snapshot `src/data/port_data.json` and
`src/data/sanctions_regimes.json`. Drop `leaflet` and `react-leaflet` from
`package.json` and the Leaflet CSS import from `main.jsx` and
`src/styles/index.css`.

Keep and prune what the wizard reuses: `TIERS`, `ISCO_GROUPS`, `fmt`,
`fmtCompact` and `qualityTone` from `utils/laborMetrics.js`; `seriesFor` and
`PANEL_YEARS` from `utils/laborPanel.js`; and `Sparkline.jsx`. Delete the
map-only exports (`METRICS`, `METRIC_BY_KEY`, `colorFor`, `rampStops`,
`radiusFor`, `normalise`, `NO_DATA_COLOR`).

**Acceptance:** `git ls-files src/components/LaborMap.jsx
src/components/LaborPage.jsx src/data/port_data.json` returns nothing;
`grep -rn "leaflet" src/ package.json` returns nothing; `npm run build`
succeeds and the bundle no longer contains Leaflet; `npm run lint` reports no
unused export in `src/utils/`.

### R2. [ ] The canvas's tokens are the only source of colour, type and motion

Define the palette, radii, type scale and the five keyframes from *The design*
section of `CLAUDE.md` as CSS custom properties in `src/styles/index.css`. Load
Geist, Geist Mono and Instrument Serif (including Instrument Serif italic) with
a fallback stack on every family.

**Acceptance:** `grep -c -- '--accent: *#FF5A2B' src/styles/index.css` returns 1;
no wizard component contains a raw hex colour (`grep -rEn '#[0-9A-Fa-f]{6}'
src/components/wizard/` returns nothing); the three families and the italic face
are requested; `@media (prefers-reduced-motion: reduce)` disables the five
animations.

### R3. [ ] shadcn/ui is installed as JSX over Tailwind v4

Run the shadcn CLI against the existing Tailwind v4 setup. `components.json`
must carry `"tsx": false` and an empty `tailwind.config`. Add `jsconfig.json`
with `@/*` → `./src/*` **and** the matching `resolve.alias` in `vite.config.js`,
because Vite does not read `jsconfig.json` for resolution. Add only the
components the screens use: `button card input badge toggle-group slider
accordion`.

**Acceptance:** `components.json` parses with `.tsx === false` and
`.tailwind.config === ""`; every file under `src/components/ui/` ends `.jsx`;
`node -e "require('./vite.config.js')"`-equivalent build resolves an `@/`
import; `npm run lint` and `npm run build` both pass.

### R4. [ ] The shadcn defaults are overwritten, not shipped

The generated components must render in the canvas palette — dark by default on
`:root`, not only under `.dark`. Restyle by extending each component's `cva`
variants and the CSS tokens, not by stacking overriding `className`s at call
sites.

**Acceptance:** no shadcn default token value (`oklch(...)` as emitted by
`shadcn init`) survives in `src/styles/index.css`; the app renders dark with no
`class="dark"` anywhere in `index.html` or `App.jsx`; a screenshot of `/` shows
`#0D0C0A` ground and `#FF5A2B` primary.

### R5. [ ] The wizard shell — five screens, progress, motion, focus

Sticky header with the live dot, title and `NN/04` over a four-segment progress
bar. Screens: intro, country, occupation, optional, result. Steps 01–03 carry
the sticky footer CTA over the gradient fade. `stepin` on mount.

**Acceptance:** every interactive element has computed `min-height >= 48px`;
the primary CTA is `>= 60px`; `:focus-visible` computes to `2px solid #FF5A2B`
with `outline-offset: 3px`; the progress bar fills one further segment per
advance; the column is `max-width: 480px`.

### R6. [ ] Step 01 — country, tagged by what the data actually carries

List countries from the payload. Each row's `official series` / `no series` tag
must be **derived from the row's own nullity**, not hardcoded. Pre-fill from
`navigator.language` where it resolves to a country in the payload.

**Acceptance:** a country whose `isco4_clerical_pct` is null renders
`no series`; the count of `official series` rows equals the count of payload
countries with a non-null ISCO block (177 at the probed vintage); no country is
hidden from the list for lacking data.

### R7. [ ] Step 02 — a job title resolves to an ISCO-08 major group, visibly

Free-text input resolves to one of the nine ISCO-08 major groups. The resolved
group is displayed with its code and full label, and is overridable by chip. A
title that resolves to nothing must say so rather than silently defaulting.

**Acceptance:** "paralegal" resolves to group 3 and the UI shows
`3 · Technicians and associate professionals`; "bookkeeper" resolves to group 4;
an unresolvable string (`"zzzz"`) shows an explicit "not resolved — pick a
group" state and no group is pre-selected; picking any chip overrides the
resolution.

### R8. [ ] Age band × ISCO group comes from ILOSTAT, per group

Extend the pipeline to emit, per country and per ISCO major group, the employed
share for `Y15-24`, `Y25-54` and `Y55-64` from `DF_EMP_TEMP_SEX_AGE_OCU_NB`.
Tier `DERIVED` (share = group-age count ÷ group total, both `OFFICIAL` counts),
recorded in `field_tiers`, with its own `data_year_*` field. Countries the flow
does not cover stay null with a `data_quality_flag`.

**Acceptance:** `npm run pipeline` emits the new fields; at least 150 countries
carry a non-null value for group 4 × `Y25-54`; `field_tiers` names every new
field; `npm run test:pipeline` passes with a case asserting a null country stays
null; selecting an age band in step 03 changes the figure shown on the result
screen.

### R9. [ ] Education band × ISCO group comes from ILOSTAT, per group

As R8, from `DF_EMP_TEMP_SEX_OCU_EDU_NB`, for `EDU_AGGREGATE_BAS / INT / ADV`.
Add the flow to `pipeline/config.py` alongside the existing two so it is cached
under `pipeline/raw/ilostat/` and re-runs stay offline.

**Acceptance:** `pipeline/raw/ilostat/DF_EMP_TEMP_SEX_OCU_EDU_NB.csv` is written
on first run and re-read on the second; at least 130 countries carry a non-null
value for group 4 × `ADV`; the three education chips land on three different
published cells, demonstrable by the figure changing between them.

### R10. [ ] The result screen shows the group's share, with tier and vintage

Report the chosen group's share of employment for the chosen country, its tier
badge (`DERIVED` at the probed vintage) and the `data_year_occupation` for that
row. Never present the row as a single-year snapshot.

**Acceptance:** GBR × group 4 renders `8.9%` with a `DERIVED` badge and the year
2025; a country with a null share renders the absence, not a zero or a dash that
reads as a value.

### R11. [ ] Headcount is derived per group, or it is absent

The canvas's "People doing it" figure exists in the payload only for clerical,
professionals and the two aggregates. For the other groups compute
`share × employed_total`, tier `DERIVED`, and label the arithmetic. Where
`employed_total` or the share is null, render absent.

**Acceptance:** GBR × group 4 renders `2.99M` (matching the payload's
`clerical_employed`, 2,989,466, within rounding); GBR × group 7 renders a
`DERIVED` figure computed from the share; a country with null `employed_total`
renders no headcount at all.

### R12. [ ] The trend says it is a stand-in whenever it is one

The time series carries `isco4_clerical_pct` only. When the chosen group is 4,
the sparkline is that group's own series. When it is any other group, the panel
must state that the clerical series is standing in — or omit the panel. A
country with no series shows no sparkline.

Reuse `seriesFor` and `Sparkline` kept by R1 rather than writing a second
sparkline.

**Acceptance:** group 4 shows the sparkline with no stand-in notice; group 7
shows either the stand-in notice or no panel, never an unlabelled line; a
country absent from `series` renders no sparkline; the generative-AI marker line
is present and labelled.

### R13. [ ] The projected replacement year

Establish whether any published source supports stating a year by which half of
an ISCO major group is displaced, per country.

**Acceptance:** the *Source verification* row above is filled with the probe
result. **Expected outcome `[!]` not feasible** — the probe found only US-only,
decadal occupational churn on US census classifications, which is neither
ISCO-08, nor per country, nor AI displacement. If it lands `[!]`, the reason is
recorded here and the year does not ship in any tier.

### R14. [ ] The result screen is complete and honest without the year

Given R13, the result screen must read as finished with no year, no interval
band, no scenario slider and no adoption assumption. It must not display a
placeholder, a greyed-out year, or "coming soon" copy where the year sat.

**Acceptance:** no build renders a four-digit year as the result headline;
`grep -rEn '\b20(2[89]|[3-7][0-9])\b' src/components/wizard/` returns no
hardcoded projection years; the result screen's own copy states that no
displacement date is published, and links to the method panel.

### R15. [ ] Nothing is imputed, anywhere in the wizard

Every screen honours the project non-negotiable: a null stays null and says so.
No fallback to a regional average, a world figure, or a neighbouring country.

**Acceptance:** a country with `data_quality_flag` other than `complete`
surfaces that flag on the result screen; selecting a country with no ISCO block
produces a result screen of stated absences and zero numbers; no wizard module
contains an averaging or nearest-neighbour fallback.

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

Lint, build, the 126-test pipeline suite and the pilot anchors all pass with the
new pipeline fields and the new app.

**Acceptance:** `npm run verify` exits 0; the four regression anchors (World
services ≈50%, US ≈79%, EU-27 ≈72%, India ≈31.5%) are unmoved; CI is green on
the PR.

## Non-goals

- **No replacement year, in any tier.** Shipping it as `MODELED` is a separate
  decision needing its own formula, sensitivity analysis and issue. R13 records
  why it is not in this spec.
- **No Next.js and no TypeScript.** Issues #23 and #22 will migrate these files
  later; building on Vite + JSX now is a deliberate, accepted double migration.
- **No ISCO 2-digit sub-major groups** (#9). Nine major groups is the floor this
  design is built on.
- **No sex disaggregation** (#27), no earnings (#10), no Anthropic Economic
  Index overlay (#47). All are separate issues and would each add a dimension to
  the wizard.
- **No payments, accounts or paid report** (#28–#32). This is the free surface.
- **No routing.** The wizard's steps are internal state. Real routes and
  deep-linkable URLs remain #24 and #15.
- **The map is not kept behind a route.** It is deleted outright — the design has
  no map, and a second unmaintained surface in the new palette is worse than
  none. It stays recoverable in git history.
- **The corridor-wars overlay goes with it.** `port_data.json` and
  `sanctions_regimes.json` were a static snapshot for the R16 overlay
  (issue #20). Deleting them closes that drift rather than carrying it.
