# 0011 — country search

**Status:** done
**Depends on:** 0009 (the payload is regenerated from `run.py` and guarded against drift — R2 here adds a column, so both guards must move with it) · 0010 (the wizard and its `countryTag` module exist; R7 here revises 0010's R6)
**Issue:** [#66](https://github.com/apportico/who-gets-replaced-first/issues/66)

**Review record.** draft → in-review → approved on 2026-09-01, on
[PR #68](https://github.com/apportico/who-gets-replaced-first/pull/68). The
automated reviewer did **not** run: `.github/workflows/claude-review.yml` checks
for `ANTHROPIC_API_KEY`, finds none, and warns *"This job passing is not
evidence of a review"* (issue #44 is open on exactly that). So the green `review`
check on #68 means nothing, and the review it stands in for was done by hand
against `REVIEW.md` — findings on R3's undefined ordering, R4's dead `USA`/`US`
aliases and R10's stranded exports, all fixed in the commit before approval.
Recorded here so nobody later reads the green check as the review it is not.

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

### R1. [x] Step 01 lists only the countries that carry an official series

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

**Done (2026-09-01).** `countryOptions` filters on `hasAnyIscoGroup`.
Vitest: 218 country rows, 177 options, every option's row reports a group,
`CHN`/`SAU`/`NZL` absent, `excludedCountries` returns the 41 and contains `CHN`.
Rendered: headless Chrome at `localhost:5174` reports
`document.querySelectorAll('[role=option]').length === 177`.
### R2. [x] The payload carries `iso2`, from the World Bank, tiered as an identifier

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

**Done (2026-09-01).** `iso2` carried from `iso2Code` in `build_reference`,
tiered `NOT_A_MEASUREMENT`, added to `run.COLUMNS` and `pipeline/README.md`.
`npm run pipeline` exit 0, 4 anchors on target, 0 validation problems.

The diff came back inside the bound this requirement set: a cell-by-cell
comparison of the regenerated `global_labor_dataset.csv` against `HEAD` reports
**header delta `{'iso2'}`, 229 rows unchanged, 0 cells moved outside `iso2`**.
The same check gated the golden-master fixture, which was only rewritten after
it reported 0 moved cells — a regenerated master that is not diffed first is a
master that certifies whatever it was handed.

Payload: `field_tiers.iso2 === 'NOT_A_MEASUREMENT'`, 176 of the 177 listed
countries non-null, `TWN` null. Three committed guards moved with the column and
are recorded rather than quietly edited: `test_columns` (the pilot CSV header),
`test_golden_master` (the fixture), and `test_tiers`' literal `84 → 85`. That
literal is the assertion that fails when a column ships without a tier, so it
moves by hand, in the change that adds one. `npm run test:pipeline`: 137 OK.
### R3. [x] The search predicate folds, and matches name, code and alternate

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

**Done (2026-09-01).** `src/utils/countrySearch.js`. Vitest covers each
route separately so a regression names which broke: `korea`→`KOR` (name),
`usa`/`gbr` (iso3 prefix), `south korea`/`vietnam`/`russia` (Intl),
`turkey`/`uk` (alias), `cote d'ivoire`→`CIV` (the fold), `''`→177, `zzzz`→0,
and the ordering assertion — a multi-hit query returns rows in
`countryOptions`' order, not a ranked one.
### R4. [x] The residual alias table is ours, small, and says so

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

**Done (2026-09-01).** Eight entries, not the ~30 a hand-written table
would have needed — `Intl.DisplayNames` supplies the other 29 spellings once R2
gives it an `iso2` to read. The guard that matters passes: every alias key is
run through the name, `iso3` and `Intl` routes and must be missed by all three,
so the table cannot grow into work already done. `usa`, `us` and `burma` are
asserted to be reachable *without* an entry, and asserted absent from the
table.
### R5. [x] Locale pre-fill on a dropped country says so by name

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

**Done (2026-09-01).** `localeCountry` returns `{ iso3, excluded }`.
Vitest: `zh-CN` selects nothing and reports `CHN`/`China`; `en-NZ` and `ar-SA`
likewise; `xx`, `''`, `en` and `undefined` all return `{ iso3: null, excluded:
null }`. Rendered: with `navigator.language` stubbed to `zh-CN`, step 01 carries
"China reports no occupation breakdown to ILOSTAT", no option is
`aria-selected`, and Continue is disabled.

**One thing changed beyond what this requirement asked for, and it is worth
recording.** The match now runs on `iso2` rather than on `Intl.DisplayNames`'
name compared to `country_name`. The old reading failed silently for exactly the
29 countries whose two spellings differ — `ko-KR` resolves to "South Korea" and
the payload says "Korea, Rep." — so every one of those locales pre-filled
nothing and looked like a reader with an unmatched locale. R2's identifier fixes
that as a side effect of existing; `ko-KR`, `ru-RU` and `vi-VN` are asserted.
### R6. [x] A query that matches a dropped country names it and states the absence

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

**Done (2026-09-01).** The search runs over all 218 internally and
partitions. Vitest: `china` → 3 pickable (`HKG`, `MAC`, `TWN`) and 1 stated
absent (`CHN`); `saudi` → 0 and 1; `new zea` → 0 and 1; `zzzz` → 0 and 0.

Rendered in Chrome: typing `china` leaves exactly three `[role=option]` nodes,
the page carries "China is in the dataset but reports no occupation breakdown,
so there is no result to give you", and that text passes
`!p.closest('button') && p.tabIndex < 0` — it is not a control, not focusable,
and arrowing through the list never lands on it.
### R7. [x] 0010 R6 is re-marked `[~]`, and `CLAUDE.md` moves in the same change

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

**Done (2026-09-01).** `specs/0010-mobile-first-redesign.md` R6 is
`[~]` with the reversal recorded, what did **not** change (the obligation, met
by R5 and R6 here) and the predicate it still lends R1. `CLAUDE.md`'s step-01
row now describes a search and states the canvas divergence explicitly; the
result-screen rule keeps "`no series` is a first-class result" and adds where it
is now said. 0010's tally moved 16/4/1 → 15/5/1 in the index.
### R8. [x] The control is a plain input over a filtered list, not shadcn `Command`

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

**Done (2026-09-01).** No dependency added and no fourth file in
`src/components/ui/`, both asserted rather than claimed: the suite reads
`package.json` and fails if `cmdk` or `@radix-ui/react-dialog` appears, and
globs `ui/*.jsx` expecting exactly `accordion`, `toggle`, `toggle-group`. The
unused-component guard is unchanged and still exempts `toggle` alone.

R9's keyboard work did not turn out heavier than this trade assumed — the
combobox is ~20 lines — so the `[~]` escape hatch back to `command` was not
needed.
### R9. [x] The search is operable by keyboard and meets the touch and focus tokens

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

**Done (2026-09-01).** `role=combobox` with `aria-expanded`,
`aria-controls` and `aria-activedescendant` over a `role=listbox`; arrow keys
move the active descendant rather than DOM focus, so typing keeps working while
arrowing. `Enter` picks, `Escape` clears. Vitest covers all four plus the polite
live region ("177 of 177" → "3 of 177").

The computed half was closed in a real browser rather than left to *Verification*
— see that section.
### R10. [x] The provenance the row tag carried does not disappear with it

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

**Done (2026-09-01).** The screen states what the list is: "The 177
countries that report an ISCO-08 occupation breakdown to ILOSTAT" — read back
out of the rendered page, not the source. No `official series` or `no series`
string renders. The unreachable footer branch is gone.

The stranded exports went with it, and the module was **renamed
`countryTag.js` → `countryList.js`**: it no longer tags anything, and leaving
the old name would have been the same defect in the filename that 0010 R3
recorded in `src/components/ui/`. `grep -rn "countryTag\|OFFICIAL_SERIES\|NO_SERIES" src`
now matches only the note in that file explaining the rename. `hasAnyIscoGroup`
stays — R1 and R6 both call it. 0010 R10's withdrawal test is unmodified in
substance and passing; it now asserts *being listed* rather than *being tagged*,
which is the same invariant in the surviving vocabulary.
### R11. [x] `npm run verify` is green, and the new logic lives in `src/utils/`

The predicate (R3), the alias table (R4), the pre-fill change (R5) and the
absence partition (R6) are pure functions in `src/utils/`, tested by Vitest,
with the component rendering their output. This follows 0010 R19's split: logic
out of components so it can be asserted without jsdom.

**Acceptance:** `npm run verify` exits 0 — lint, build, the Vitest suite
including the new cases, `test:pipeline` including 0009's payload guards against
the regenerated payload, `test:app`, and the pilot.

**Done (2026-09-01).** `npm run verify` exits 0 — lint, build, 137
Vitest, 137 pipeline tests OK, the 0008 lint-config guard, and the pilot with
4 anchors on target and 0 validation problems. The new logic is four pure
functions in `src/utils/`; the component renders their output.

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
  a silent font regression through a green build.

**Checked in a real browser, 2026-09-01.** Not left as an intention: headless
Chrome was driven over the DevTools Protocol against `npm run dev` at
`localhost:5174` — Node 24 has a global `WebSocket`, so this needed no
dependency and none was added. Every item above came back measured rather than
asserted:

| Check | Measured |
|---|---|
| Options rendered | **177** |
| The list's own sentence | "The 177 countries that report an ISCO-08 occupation breakdown to ILOSTAT" |
| Option target | `min-height: 56px`, painting **62px** |
| Search input target | `min-height: 56px`, painting **62px** |
| Body scrolls sideways | **false** |
| `china` | 3 options — Hong Kong SAR, Macao SAR, Taiwan — plus the stated absence |
| The absence is not a control | `!closest('button') && tabIndex < 0` → **true** |
| Arrow-key ring | `2px solid rgb(255, 90, 43)` at `offset 3px` — the `--accent` token exactly |
| `aria-activedescendant` | set, and resolves to an element |
| `prefers-reduced-motion: reduce` | animation duration `1e-06s` |
| **Console** | `[vite] connecting…`, the React DevTools notice, `[vite] connected.` — **no errors, no warnings, no exceptions** |

The arrow-key ring is the one worth naming. Because the combobox keeps DOM focus
in the input and moves an *active descendant*, `:focus-visible` never matches the
option a keyboard reader is on — there is nothing focused to style. Without
`.wz-option[data-active='true']` the ring would have been silently absent for
exactly the reader who needs it, and no jsdom test could have seen it.

## Implementation Plan

**Planned:** 2026-09-01

### Files to create

| Path | Purpose |
|---|---|
| `src/utils/countrySearch.js` | R3, R4, R6 — the fold, the four match routes, the authored alias table, and the partition of a query into pickable matches plus stated-absent rows. Pure, no React. |

### Files to modify

| Path | Change |
|---|---|
| `pipeline/build.py` | R2 — `build_reference` carries `iso2` from the World Bank `iso2Code`; `EXTRA_AREAS` rows get an explicit `None` (this is the `TWN` path) |
| `pipeline/config.py` | R2 — `FIELD_TIERS["iso2"] = NOT_A_MEASUREMENT`, beside `iso3` |
| `pipeline/run.py` | R2 — `iso2` joins `COLUMNS` in the identity block |
| `pipeline/README.md` | R2 — the field table gains `iso2`, its source and its tier |
| `pipeline/data/*.csv`, `src/data/global_labor.json`, `pipeline/summary_report.md` | R2 — regenerated by a full run |
| `src/utils/countryTag.js` | R1 filters to `hasAnyIscoGroup`; R5 changes `localeCountry`'s return shape; R10 deletes `countryTag`, `OFFICIAL_SERIES`, `NO_SERIES` |
| `src/components/wizard/CountryScreen.jsx` | R1, R6, R9, R10 — the search input, the listbox, the stated-absence text, the removal of the per-row tag and the unreachable footer branch |
| `src/components/wizard/WizardShell.jsx` | R5 — `localeCountry`'s new return shape feeds both the initial `iso3` and the excluded-country note |
| `src/styles/index.css` | R9 — `.wz-search` and the option-active state, on the existing tokens |
| `src/utils/wizard.test.js` | R1, R3, R4, R5, R6 — new cases; the 0010 assertion that the list length equals the country count is deleted |
| `src/components/wizard/wizard.render.test.jsx` | R6, R9 — render and keyboard cases; the walk's country click becomes a search |
| `specs/0010-mobile-first-redesign.md` | R7 — R6 re-marked `[~]` |
| `CLAUDE.md` | R7 — the step-01 row, and the recorded divergence from the canvas |

### Sequence

1. **R2 first, because everything downstream reads the payload.** Add the column,
   regenerate, and confirm the diff is bounded to `iso2` plus the report date.
   If the diff is wider, stop and explain before going on — that is drift this
   change surfaced, not something to commit past.
2. **R3 + R4** — `countrySearch.js` and its tests, against the regenerated payload
   so the `Intl` route has an `iso2` to read.
3. **R1** — narrow `countryOptions`; delete 0010's list-length assertion.
4. **R5** — `localeCountry` reports the excluded country instead of a bare null.
5. **R6** — the partition, tested as a pure function before any rendering.
6. **R9 + R8** — the screen: input, listbox, arrow keys, live region. No new
   dependency and no fourth file in `src/components/ui/`.
7. **R10** — delete the stranded exports and the unreachable footer branch; add
   the screen's provenance line.
8. **R7** — 0010 R6 re-marked, `CLAUDE.md` updated in the same commit.
9. **R11** — `npm run verify`, then load the page and read the console.

### Requirement mapping

| Req | How it will be satisfied | Where | How acceptance is checked |
|---|---|---|---|
| R1 | `countryOptions` filters on `hasAnyIscoGroup` | `src/utils/countryTag.js` | Vitest — 177 entries; `CHN`/`SAU`/`NZL` absent; render test counts option elements |
| R2 | `iso2` carried from `iso2Code`, tiered `NOT_A_MEASUREMENT`, `None` for `TWN` | `pipeline/build.py`, `config.py`, `run.py` | `npm run pipeline` then `npm run test:pipeline`; `git diff --stat` bounded to `iso2` + report date; 176 non-null, `TWN` null |
| R3 | Fold + four match routes, alphabetical order | `src/utils/countrySearch.js` | Vitest — the ten named queries, one per route, plus the ordering assertion |
| R4 | Authored alias table, ≤12 entries | `src/utils/countrySearch.js` | Vitest — every value an `iso3` R1 returns; every key missed by the other three routes |
| R5 | `localeCountry` returns the excluded country rather than a bare null | `src/utils/countryTag.js`, `WizardShell.jsx` | Vitest on `zh-CN`/`en-GB`/`xx`; render test with `navigator.language` stubbed |
| R6 | Query partitioned into pickable and stated-absent | `src/utils/countrySearch.js`, `CountryScreen.jsx` | Vitest — `china` 3+1, `saudi` 0+1, `zzzz` 0+0; render test asserts the text sits outside any `[role=option]` |
| R7 | 0010 R6 re-marked `[~]`; `CLAUDE.md` step-01 row and canvas divergence | `specs/0010-*.md`, `CLAUDE.md` | `grep` for `### R6. [~]` and the absence of the old tag promise |
| R8 | Plain `<input>`, no `command`, no `cmdk` | `CountryScreen.jsx` | `package.json` unchanged; `src/components/ui/` still three files; the unused-component guard unamended and passing |
| R9 | `combobox`/`listbox`, arrow keys, `Escape`, polite live region | `CountryScreen.jsx`, `index.css` | Vitest + jsdom for behaviour; computed style and focus ring in *Verification* |
| R10 | Provenance moves to screen copy; stranded exports and footer branch deleted | `CountryScreen.jsx`, `countryTag.js` | `grep` finds no `OFFICIAL_SERIES`/`NO_SERIES`/`countryTag` in `src`; 0010 R10's test unmodified and passing |
| R11 | Logic in `src/utils/`, rendering in the component | both | `npm run verify` exits 0; page loaded, console read |

### Tier and vintage handling

R2 adds the only new field, and it is **not a measurement**: `iso2` is a World
Bank identifier, tiered `NOT_A_MEASUREMENT` in `config.FIELD_TIERS` beside
`iso3`, `country_name` and `capital`, and carried into the payload's
`field_tiers` block by the existing export path. It has **no vintage**, for the
same reason `iso3` has none — an identifier is not observed in a year.

Nothing else here produces a number. The screen's only new figure is the count
of listed countries, which is `countryOptions(rows).length` computed at render
from the payload, not a stored statistic. No tier is invented, and `TWN`'s
missing `iso2` stays null rather than being filled from ISO 3166-1.

### Validation

The existing guards cover this, which is the point of adding a column rather
than a source:

- `test_app_payloads.py::test_field_tiers_covers_every_key_a_row_ships` fails if
  `iso2` ships without a tier.
- `test_app_payloads.py::test_every_cell_matches_the_dataset_csv` fails if the
  payload and the CSV disagree about it.
- `test_columns.py` fails if `COLUMNS` and the written header drift.
- The four regression anchors and the Eurostat cross-check must still pass on the
  regenerated data — an identifier column must move no measured cell.

No new pipeline check is needed. The new *app* behaviour is covered by Vitest
cases named per requirement above; `REVIEW.md` Pass 7's browser evidence is in
*Verification the suite cannot do*.

### Risks

- **The payload diff comes back wider than `iso2`.** Probed against — a full run
  on 2026-09-01 reproduced every artifact byte-identically apart from the report
  date — so a wider diff means something moved underneath and the run stops for
  explanation rather than committing it.
- **`Intl.DisplayNames` differs by ICU version.** Node 24 supplied the 29 names
  probed; a browser on an older ICU could return a different string. This is why
  the aliases are computed at runtime rather than frozen into the payload, and
  why R3's tests assert a handful of stable names rather than all 29. A drifted
  ICU degrades one match route; it cannot produce a wrong country.
- **R9's keyboard work proves heavier than R8 assumes.** Recorded in R8 as a
  legitimate `[~]` back to shadcn `command`, with the two-dependency cost stated,
  rather than a silent install.
- **`TWN` has no `iso2` and therefore no `Intl` alternates.** Accepted: Taiwan
  stays reachable by name and by `iso3`. Filling it by hand is the thing this
  project does not do.

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
