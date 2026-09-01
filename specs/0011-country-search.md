# 0011 — country search

**Status:** draft
**Depends on:** 0009 (the payload is regenerated from `run.py` and guarded against drift — R2 here adds a column, so both guards must move with it) · 0010 (the wizard and its `countryTag` module exist; R7 here revises 0010's R6)
**Issue:** [#66](https://github.com/apportico/who-gets-replaced-first/issues/66)

## Objective

Step 01 renders all 218 country rows as a flat list of buttons, 41 of which are
tagged `no series` and can never produce a result. On the 480px column the app
is built for, that is roughly forty screens of scroll to reach a row the reader
already knew the name of before they opened the page — and two thirds of what
they pass is either not their country or a country with no answer in it.

Choosing one name out of 218 is a **search**, not a scan. This spec makes step
01 a filtered search over the **177 countries that carry an official series**,
and moves the `no series` statement from a tappable row nobody wants to scroll
past into the place it actually lands: the answer to a reader who types their
own country and finds it absent.

That is a deliberate reversal of 0010 R6's acceptance criterion — *"no country
is hidden from the list for lacking data"* — and R7 below records it as `[~]`
rather than leaving the two specs disagreeing. The reasoning behind R6 is not
abandoned: `CLAUDE.md`'s *"`no series` is a first-class result: nulls stay null,
the row says so"* still binds, and R5 and R6 here are what discharge it. The
41 include **China, Saudi Arabia, New Zealand, Uzbekistan, Oman, Syria, Haiti**
— names a reader will plausibly type — so a search that answers them with
silence would be a worse failure than the scroll this spec removes.

## The identifier problem, and why it changed the design

The obvious way to make search forgiving is a hand-written alias table: the
payload spells countries in World Bank style (`Korea, Rep.`, `Russian
Federation`, `Viet Nam`, `Lao PDR`, `Venezuela, RB`), and nobody types that.
Probing found a better source than our own typing.

The World Bank response already cached at `pipeline/raw/worldbank/countries.json`
carries **`iso2Code` for 294 of its 295 entities** — a published identifier we
are already downloading and simply not keeping. With `iso2` in the payload,
`Intl.DisplayNames(['en'], {type: 'region'})` — a platform standard, not
authored data — supplies the reader's spelling for **29 of the 177**:
`South Korea`, `Russia`, `Vietnam`, `Laos`, `Slovakia`, `Kyrgyzstan`, `Iran`,
`Egypt`, `Yemen`, `Venezuela`, `Cape Verde`, `Myanmar (Burma)`, `Bahamas`,
`Palestinian Territories`, and the rest.

So the hand-authored table shrinks from ~30 entries to the handful no published
source gives (`UK`, `USA`, `UAE`, `Turkey`, `Czech Republic`, `Swaziland`,
`Ivory Coast`, `East Timor`, `Holland`). This is the project's standing
preference applied to a non-numeric field: **carry what a source publishes
rather than retype it**, and label the residue as ours.

## Source verification

| Source | Probed | Result |
|---|---|---|
| `src/data/global_labor.json` — country rows | read, 2026-09-01 | **218** rows with `row_type === 'country'`. **177** carry at least one of the nine `iscoN_*_pct` fields non-null; **41** carry none. Exactly 0010 R6's "any of the nine" reading, so R1's filter reuses `hasAnyIscoGroup` and adds no new predicate |
| The 41 no-series rows | read, 2026-09-01 | ABW AND ASM ATG BHR CAF CHI **CHN** COG CUB DMA ERI FRO GIB GRL GUM HTI KNA LBY LIE MAF MCO MNP MRT NCL **NZL** OMN PRK PYF **SAU** SMR SSD SXM SYR TCA TKM UZB VCT VGB VIR XKX. Their `data_quality_flag` already reads `partial — no ISCO data; …`, so R6's copy has a field to key on rather than a hard-coded list |
| `src/data/global_labor.json` — row keys | read, 2026-09-01 | **No `iso2`, no alternate-name field.** `iso3` and World Bank `country_name` are the only identifiers a search could match today |
| `pipeline/raw/worldbank/countries.json` | read, 2026-09-01 | The cached World Bank country list, 295 entities, each with `iso2Code`. Non-empty for 294; **`TWN` is the one blank** — the World Bank publishes no alpha-2 for Taiwan. Already downloaded by the pipeline, discarded at export |
| `Intl.DisplayNames(['en'],{type:'region'})`, Node 24.19 | run, 2026-09-01 | Resolves 176 of the 177 official rows once `iso2` exists (TWN excepted, no alpha-2). Its name **differs from the payload's for 29**, and the differences are exactly the reader-facing spellings: `KOR South Korea`, `RUS Russia`, `VNM Vietnam`, `LAO Laos`, `SVK Slovakia`, `KGZ Kyrgyzstan`, `IRN Iran`, `EGY Egypt`, `YEM Yemen`, `VEN Venezuela`, `CPV Cape Verde`, `MMR Myanmar (Burma)`, `PSE Palestinian Territories`, `BHS Bahamas`, `GMB Gambia`, `SOM Somalia`, `FSM Micronesia`, `COD Congo - Kinshasa`, `BRN Brunei`, `PRI Puerto Rico`, `NRU Nauru`, `TUR Türkiye`, and 7 punctuation-only variants |
| Diacritic folding, Node 24.19 | run, 2026-09-01 | `NFD` + `\p{Diacritic}` strip + `’→'` fold turns `Côte d’Ivoire`→`cote d'ivoire`, `Türkiye`→`turkiye`, `São Tomé & Príncipe`→`sao tome & principe`, `Curaçao`→`curacao`. Confirms R3 needs the fold: Intl returns typographic apostrophes and diacritics no reader types |
| `pipeline/config.py` `FIELD_TIERS` | read, 2026-09-01 | `iso3`, `country_name`, `region`, `income_group`, `capital` all carry `NOT_A_MEASUREMENT`. R2's `iso2` takes the same tier — no new tier is invented for an identifier |
| `npm run pipeline` — full run, offline | run, 2026-09-01 | **Exit 0 with no network.** 229 rows x 179 cols, 218 cross-tab files, all four regression anchors passed, `[validate] 0 range/consistency problems`. It rewrote every artifact **byte-identically** except `summary_report.md`'s `Generated <date>` line — so the committed data is current, and R2's regeneration is a real operation rather than an assumption. The date line is expected churn on any run and is not evidence of drift |
| `pipeline/tests/test_app_payloads.py` | read, 2026-09-01 | 0009's drift guard compares the committed payload to `global_labor_dataset.csv` cell by cell, and asserts `field_tiers` covers **every key a row ships**. Adding a column therefore requires `run.COLUMNS`, `config.FIELD_TIERS`, the CSV and the payload to move together — R2's acceptance is written to that |
| shadcn `command` registry — `https://ui.shadcn.com/r/styles/new-york/command.json` | `curl`, 2026-09-01 | HTTP 200. Declares `dependencies: ["cmdk"]` and `registryDependencies: ["dialog"]`. Installing it adds a runtime dependency **and** a `dialog.jsx` that no screen imports, which `wizard.render.test.jsx`'s unused-component guard would fail unless amended to exempt a second file. R8 declines it on that evidence |
| `src/components/ui/` | read, 2026-09-01 | Three files — `accordion`, `toggle-group`, `toggle`. The guard exempts `toggle` alone, by name, and asserts the exemption is real. A second exemption is a real cost, not a formality |

## Requirements

### R1. [ ] Step 01 lists only the countries that carry an official series

`countryOptions` filters to rows where `hasAnyIscoGroup` is true — 177 at the
probed vintage — and step 01 renders no others. No new coverage predicate is
introduced: the reading stays "any of the nine ISCO fields non-null", the same
one `isco_groups_reported` describes and 0010 R6 fixed.

The 41 excluded rows remain **available to the module**, because R6 answers a
search over them. They are excluded from the *pickable list*, not from the data.

**Acceptance:** Vitest over the committed payload — `countryOptions(rows)`
returns 177 entries; every entry satisfies `hasAnyIscoGroup`; `CHN`, `SAU` and
`NZL` are absent from it. A render test asserts the number of option elements on
step 01 equals `countryOptions(rows).length` and that no element on the screen
carries the `no series` tag.

### R2. [ ] The payload carries `iso2`, from the World Bank, tiered as an identifier

`run.py` keeps the `iso2Code` already present in the cached World Bank country
response and exports it as `iso2` on every country row. It is an identifier, not
a measurement: `config.FIELD_TIERS["iso2"] = NOT_A_MEASUREMENT`, alongside
`iso3` and `country_name`.

**`TWN` gets `null`, not a hand-filled value.** The World Bank publishes no
alpha-2 for Taiwan; ISO 3166-1 does, but transcribing it here would be exactly
the "invent a figure to fill a gap" the project forbids, and `manual_overrides.json`
is for nationally-sourced numbers with a citation, not for convenience. Taiwan
stays findable by name and by `iso3`, and simply gets no `Intl` alternates.

The regeneration is a probed operation, not an assumption: a full run was
executed offline on 2026-09-01 and reproduced every committed artifact
byte-identically apart from `summary_report.md`'s date line. So the diff R2
lands must be **the `iso2` column and that date line, and nothing else** — any
other moved cell is drift this change surfaced and must be explained, not
committed silently.

**Acceptance:** `npm run pipeline` regenerates both `global_labor_dataset.csv`
and `src/data/global_labor.json`; `git diff --stat` after the run shows changes
confined to the `iso2` column, the payload, and `summary_report.md`'s date; the committed payload carries a non-null
`iso2` for 176 of the 177 official country rows and `null` for `TWN`;
`npm run test:pipeline` passes with 0009's `test_app_payloads.py` unmodified in
its logic — specifically `test_field_tiers_covers_every_key_a_row_ships` and
`test_every_cell_matches_the_dataset_csv` pass against the regenerated pair.

### R3. [ ] The search predicate folds, and matches name, code and alternate

A pure function in `src/utils/` takes a query and returns the matching subset of
R1's options, **in `countryOptions`' own alphabetical order**. There is no
relevance ranking: a match is a match, and a reader scanning a narrowed list
should find it where the alphabet puts it rather than where a scoring function
does. The four routes below are how a row can match, not a sort key.

A row matches if any of these holds:

1. `country_name` — substring, folded
2. `iso3` — prefix, folded (`usa`, `gbr`)
3. The `Intl.DisplayNames` name for the row's `iso2`, when `iso2` is non-null — substring, folded
4. R4's alias table — substring, folded

**Folding is required, not optional.** The probe shows `Intl` returns
`Côte d’Ivoire` with a typographic apostrophe and `Türkiye` with a diaeresis.
The fold is `NFD` → strip `\p{Diacritic}` → normalise `’`/`ʼ` to `'` →
lowercase, applied to both the query and every candidate string.

An empty query returns all 177, so the screen opens as a list and narrows.

Note that route 2 makes an `iso3` alias redundant: `usa` and `us` already reach
`USA` by prefix, which is why neither appears in R4's table.

**Acceptance:** Vitest — `korea`→`KOR` present; `south korea`→`KOR` present;
`vietnam`→`VNM`; `russia`→`RUS`; `usa`→`USA`; `gbr`→`GBR`; `cote divoire`→`CIV`;
`turkey`→`TUR`; `""`→177 results; `zzzz`→0 results. Each assertion names the
matching route it exercises, so a regression says which of the four broke. One
further assertion covers the ordering: a query matching several rows returns
them in the same relative order as `countryOptions(rows)`.

### R4. [ ] The residual alias table is ours, small, and says so

Whatever neither the payload nor `Intl` supplies is hand-authored in one
exported constant in `src/utils/`, with a comment stating that it is authored by
us and why each entry exists. Scope is the reader's short form that **no other
route already reaches** — `UK`, `UAE`, `Turkey`, `Czech Republic`, `Swaziland`,
`Ivory Coast`, `East Timor`, `Holland`. It is not a second name list and never a
second coverage source: an alias may only point at an `iso3` that R1 already
returns.

Two exclusions are load-bearing, because they are what keeps the table from
growing into work already done. `USA` and `US` are **not** entries: R3's route 2
matches `iso3` by prefix and reaches `USA` already. `Burma` is **not** an entry:
`Intl` returns `Myanmar (Burma)`, which route 3 already matches as a substring.

**Acceptance:** Vitest — the table has **at most 12 entries**; every value is an
`iso3` present in `countryOptions(rows)`; and **every key is one the other three
routes miss** — the test runs each alias key through the name/`iso3`/`Intl`
routes with the alias table disabled and fails if any of them already resolved
it. That is what stops the table quietly growing into work the standard already
does, and it fails today for `usa`, `us` and `burma` by construction.

### R5. [ ] Locale pre-fill on a dropped country says so by name

`localeCountry` already returns `null` rather than a guess. It must now also
return `null` when the locale resolves to a country R1 excludes — `zh-CN`,
`en-NZ`, `ar-SA`, `uz-UZ`, `ar-OM` are all real locales whose country has no
series — and must report *which* country that was, so step 01 can render one
line naming it: *"China reports no occupation breakdown to ILOSTAT, so it is not
in this list."*

A reader whose own country is missing learns why before they go looking for it.
That is the same obligation 0010 R6 discharged with a `no series` row, met at
the moment it actually matters.

**Acceptance:** Vitest — `localeCountry(rows, 'zh-CN')` yields no selected
`iso3` and reports `CHN` / `China`; `localeCountry(rows, 'en-GB')` yields `GBR`;
`localeCountry(rows, 'xx')` and `localeCountry(rows, undefined)` yield neither a
selection nor a country. A render test mounts step 01 with `navigator.language`
stubbed to `zh-CN` and asserts the rendered text contains `China` and that no
option is pre-selected.

### R6. [ ] A query that matches a dropped country names it and states the absence

The search runs over all 218 rows internally. A match among the 41 renders
**below the pickable results, as text, not as a control** — it is not tappable,
not focusable, and carries no option semantics. The copy names the country and
states what is missing, keyed on the row rather than on a hard-coded list.

Typing `china` therefore returns `Hong Kong SAR, China`, `Macao SAR, China` and
`Taiwan, China` as pickable, and below them the statement that China itself
reports no occupation breakdown. A query matching nothing at all — `zzzz` —
renders a plain no-match line and names no country.

**Acceptance:** Vitest on the pure function — `china` returns 3 pickable and 1
stated-absent (`CHN`); `saudi` returns 0 pickable and 1 stated-absent (`SAU`);
`new zea` returns 0 and 1 (`NZL`); `zzzz` returns 0 and 0. A render test asserts
that for `china` the string `China` appears outside any `button`/`[role=option]`
element, and that `document.querySelectorAll('[role=option]').length` is 3.

### R7. [ ] 0010 R6 is re-marked `[~]`, and `CLAUDE.md` moves in the same change

Spec 0010's R6 currently says *"no country is hidden from the list for lacking
data"* and its unit test asserts `countryOptions(rows).length === countries.length`.
Both are reversed here. R6 is re-marked `[~] revised` in `specs/0010-*.md` with
what changed and why, pointing at this spec — not silently left to contradict
the code, which is the failure mode the `[x]`/`[!]`/`[~]` marks exist to prevent.

`CLAUDE.md` moves in the same commit: the step-01 row of the wizard table
(currently *"every row tagged `official series` / `no series`"*), and a note
that the design canvas has **no search field**, so this is a recorded divergence
from the canvas rather than drift — the same treatment R13/R14's absent year
already gets.

**Acceptance:** `grep` — `specs/0010-mobile-first-redesign.md` contains
`### R6. [~]` and the revision note names spec 0011; `CLAUDE.md`'s step-01 row
no longer promises a `no series` tag per row and states the canvas divergence.
The 0010 assertion `countryOptions(rows).length === countries.length` no longer
exists in the suite.

### R8. [ ] The control is a plain input over a filtered list, not shadcn `Command`

Probed and declined: `command` pulls `cmdk` as a runtime dependency and `dialog`
as a registry dependency, and `dialog.jsx` would sit in `src/components/ui/`
imported by nothing a screen renders — which `wizard.render.test.jsx`'s guard
fails unless a second by-name exemption is added beside `toggle`. The screen
needs a text input and a filtered list, and `cmdk` also brings its own filtering
and DOM that our tokens would have to fight.

So: an `<input>`, the R3 predicate, and hand-held keyboard behaviour (R9). No
new dependency, no fourth file in `ui/`, no amendment to the guard.

If R9's keyboard work turns out heavier than this trade assumes, revisiting
`command` is a legitimate `[~]` on this requirement with the cost recorded —
not a silent install.

**Acceptance:** `package.json` gains no dependency; `src/components/ui/` still
holds exactly three files; `wizard.render.test.jsx`'s unused-component guard is
unchanged, still exempting `toggle` alone, and passes.

### R9. [ ] The search is operable by keyboard and meets the touch and focus tokens

The input carries `role="combobox"`, `aria-expanded` and `aria-controls`
pointing at the results list; the list carries `role="listbox"` and its rows
`role="option"` with `aria-selected`. `ArrowDown`/`ArrowUp` move the active
option, `Enter` picks it, `Escape` clears the query. The result count is
announced through a polite live region, so a screen-reader user learns the list
narrowed. The stated-absence line from R6 is **not** an option and is not
reachable by arrow keys — it is read as text.

Tokens from `CLAUDE.md` hold unchanged: input and options at `min-height: 56px`,
focus `2px solid #FF5A2B` with `outline-offset: 3px`, never removed, and the
`stepin` keyframe still respects `prefers-reduced-motion`.

**Acceptance:** Vitest + jsdom — typing narrows the list; `ArrowDown` then
`Enter` selects the first match and advances state; `Escape` restores all 177;
the live region's text contains the match count. `src/styles/contrast.test.js`
still passes over any new colour. The computed `min-height` and the focus ring
stay in *Verification* below, as 0010 R4/R5 do — jsdom does no layout.

### R10. [ ] The provenance the row tag carried does not disappear with it

Every row in R1's list carries an official series, so a per-row `official
series` tag is now noise on 177 identical rows. The provenance moves to the
screen's own copy — one line stating that the list is the countries reporting an
ISCO-08 occupation breakdown to ILOSTAT, and how many there are.

0010 R10's withdrawal branch at step 04 is **untouched and still required**: up
to seven countries tagged official here report *some* groups and not the
reader's, and step 04 must still state that absence rather than render a blank.
Removing the step-01 tag must not be read as removing that.

**What the removal leaves behind must go with it.** `CountryScreen`'s footer
note — *"This country reports no occupation breakdown. You can continue…"* — is
guarded by `tag !== OFFICIAL_SERIES`, a condition R1 makes unreachable, since a
country you cannot select can no longer be the selected one. And once nothing
renders a tag, `countryTag`, `OFFICIAL_SERIES` and `NO_SERIES` are exports whose
only remaining consumer is their own test. That is precisely the shape 0010 R3
recorded — four shadcn components that looked installed because the files
existed — so they are deleted rather than left to read as used. `hasAnyIscoGroup`
stays: R1 and R6 both call it.

**Acceptance:** step 01 renders the count and the ILOSTAT sentence; `grep` finds
no `official series` string rendered on step 01; the unreachable footer branch
is gone; `grep -rn "countryTag\|OFFICIAL_SERIES\|NO_SERIES" src` returns
nothing outside deleted lines, while `hasAnyIscoGroup` still has non-test
callers; 0010 R10's stated-absence test (`groupFigures.js`, a null group yields
the stated-absence branch) still passes unmodified.

### R11. [ ] `npm run verify` is green, and the new logic lives in `src/utils/`

The predicate (R3), the alias table (R4), the pre-fill change (R5) and the
absence partition (R6) are pure functions in `src/utils/`, tested by Vitest,
with the component rendering their output. This follows 0010 R19's split: logic
out of components so it can be asserted without jsdom.

**Acceptance:** `npm run verify` exits 0 — lint, build, the Vitest suite
including the new cases, `test:pipeline` including 0009's payload guards against
the regenerated payload, `test:app`, and the pilot.

## Verification the suite cannot do

Carried in the same spirit as 0010 R4/R5 — jsdom does no layout, so these are
checked in a browser and recorded here rather than asserted:

- The input and every option compute to `min-height: 56px` or more, and the
  stated-absence text is not a 48px target because it is not interactive.
- The focus ring renders `2px solid #FF5A2B` at `outline-offset: 3px` on the
  input and on an arrow-key-focused option.
- The list does not reflow the sticky footer CTA as it narrows.
- With `prefers-reduced-motion: reduce`, narrowing the list animates nothing.
- **The page was loaded and the console read** — `REVIEW.md` Pass 7 is explicit
  that a passing `npm run build` is not evidence a page renders, and 0010 shipped
  a silent font regression through a green build. The evidence recorded for this
  spec is a run of the wizard through step 01 with the console clean.

## Non-goals

- **A second coverage source.** R1's filter is 0010 R6's predicate, unchanged.
  Nothing here re-reads what "has a series" means, and R4's aliases may not
  introduce a country the predicate excludes.
- **Filling the 41.** New Zealand and Saudi Arabia sit unfilled in
  `manual_overrides.json` on purpose; this spec removes them from a list, not
  from the gap register. Recovering any of them is its own issue.
- **A hand-written `iso3`→`iso2` map.** R2 carries the World Bank's own
  `iso2Code` instead. `TWN` stays null rather than transcribed.
- **Fuzzy or typo-tolerant matching.** Substring plus fold plus alias, and
  nothing that scores. `koera` returns no results and says so.
- **Search on step 02.** The job-title resolver (0010 R7) is a different
  problem with a different failure mode and is not touched.
- **Routes or deep links per country.** Still #24.
- **Anything about the result screen.** 0010 R10's withdrawal branch, the tier
  badges and the clerical stand-in are unchanged; R10 here only forbids reading
  the tag's removal as their removal.
