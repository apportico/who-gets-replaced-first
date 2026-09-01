# 0013 — the step 01 country list folds

**Status:** in-review
**Depends on:** 0011 (the search, its four match routes, the locale pre-fill and
the stated absences — this spec tightens three of its acceptance criteria rather
than replacing them) · 0012 (R4's anchored dock on step 01 is justified by a
measurement this change moves)
**Issue:** [#76](https://github.com/apportico/who-gets-replaced-first/issues/76)
**Goal:** step 01 opens folded, and the criterion that let it ship unfolded is
tightened in the same change, checked as:
1. On a cold load of step 01 at 1440×900 and at 390×844, `document.body.scrollHeight`
   is under two viewport heights — measured in a browser, not inferred from a
   green build.
2. `document.querySelectorAll('[role=option]').length` is bounded by the caps
   this spec names, at rest and for every query, at both widths — and so is the
   number of stated-absence lines rendered beside them.
3. Typing still resolves to the right country and the match count still
   announces.
4. The no-series statements from 0011 R5 and R6 still appear.
5. The 0011 acceptance criteria that pass against a 12,205px list are re-marked
   `[~]` with what changed, so the same defect cannot ship again.
6. The standing data rules are untouched: no figure loses its tier, no country
   is imputed, and no country is dropped from the dataset — only from what is
   *rendered before the reader has asked for it*.

## Objective

Step 01 renders every one of the 177 countries with an official series before
the reader has typed anything. Spec 0011 calls the screen "a **folded** search";
what shipped filters a list that is fully rendered until someone types, which is
the 218-row scroll 0011 set out to remove, minus 41 rows.

The cost is not only that it reads as unfinished on the first screen after the
intro. It is that the locale pre-fill — the feature 0011 R5 exists for — lands
somewhere around row 170 of 177 with no way to see it: a reader in the UK gets
`United Kingdom` correctly `aria-selected` and 176 other countries stacked
around it, so the pre-fill is buried by the very list it was meant to spare them.

This spec folds the list, caps what a query renders, and states on screen when
the cap has bitten. It also fixes the reason the defect could ship green: three
of 0011's acceptance criteria are satisfied *by* a fully-rendered list, and one
of them — "an empty query returns all 177, so the screen opens as a list and
narrows" — specifies it outright.

## Source verification

Every row below was probed on **2026-09-01** against this branch. The rendered
measurements were taken with `playwright-core` driving the system Chrome against
`npm run dev` on a pinned port, the path spec 0012 R6 established; the page title
was asserted before anything was measured, because this repo is checked out more
than once.

| Source | Probed | Result |
|---|---|---|
| Step 01 as it stands, cold load, **390×844** | Chrome, 2026-09-01 | **177** `[role=option]`, listbox **12,294px**, `body.scrollHeight` **12,754px** = **15.11 viewport heights**. The live region reads `177 of 177 countries match` |
| Step 01 as it stands, cold load, **1440×900** | Chrome, 2026-09-01 | **177** options, listbox **12,294px**, `body.scrollHeight` **12,739px** = **14.15 viewport heights**. Confirms the issue's measurement (12,205 / 12,666) on this branch, within the few pixels a font-load difference explains |
| A one-character query — `a` | Chrome, 2026-09-01 | **150** options, listbox **10,417px**, page **12,788px** at 390×844. The issue's "a one-character query must not re-render 177 rows" is real and is nearly the whole list |
| A settled query — `united` | Chrome, 2026-09-01 | **3** options, page **844px** at 390×844 = exactly one viewport. The screen is already correct *once the reader has typed*; the defect is entirely in the resting state |
| Locale pre-fill, `en-GB` and `en-US` | Chrome, 2026-09-01 | Both pre-select correctly — `aria-selected` on `United Kingdom` / `United States` — inside a 177-row list. The feature works and is unreadable, which is the issue's second complaint |
| Row geometry | Chrome, 2026-09-01 | Option **62px** painted against a `min-height: 56px` floor, listbox `gap: 8px` → **70px per row**. Listbox top at **356px** (390×844) and **341px** (1440×900) from page top; sticky footer **78px**; header **58px** |
| The two-viewport budget, derived from the above | computed, 2026-09-01 | 390×844 binds: `2 × 844 − 356 (chrome above) − 100 (footer clearance)` leaves **1,232px**, and `70N − 8 ≤ 1232` gives **N ≤ 17**. At 1440×900 the same arithmetic gives **N ≤ 19**. So any cap at or below 17 satisfies the definition of done at both widths |
| Match-count distribution over the 177, by query length | Node, 2026-09-01 | **1 char** (24 distinct): max **150**, median 44 — only 13% are ≤12. **2 chars** (99 distinct): max **48**, median **5**, 87% ≤12. **3 chars** (157 distinct): max **7** — *every* three-character prefix already returns 7 or fewer. **4 chars**: max 4. This is what sizes the cap: at three characters the cap is unreachable, so it can only ever bite where the reader has not yet said enough to be shown a list |
| Stated-absence rows returned per query, over all 218 | Node, 2026-09-01 | **Uncapped and not small.** `a` → **39** absent rows, `i` → 30, `s` → 21, `an` → 21. Worst case by query length, seeding from every country name in the payload: **1 char 39 · 2 chars 21 · 3 chars 12 · 4 chars 2**, with 99% of three-character and 100% of four-character queries at or under 3. Every realistic full-name query returns exactly **1** — `china`, `saudi`, `new zea`, `uzbek`, `oman`. This is what sizes the second cap in R2, and it is why the first draft of R2 was wrong |
| `src/components/wizard/CountryScreen.jsx:151` | read, 2026-09-01 | `{matches.length === 0 && absent.length === 0 && ...}` renders **"No country matches that."** The branch is unreachable at rest today because an empty query returns all 177; under R1 it becomes the resting state for every reader whose locale does not resolve. R1 and R3 name the resting copy so it is not inherited by omission |
| `employed_total` on the 177 — could the resting state be a largest-employment shortlist? | `src/data/global_labor.json`, 2026-09-01 | Derivable: **non-null for all 177**. Top 12 would be IND 591,567,723 · USA 167,494,389 · IDN 142,342,821 · NGA 113,009,751 · BRA 101,851,681 · PAK 80,542,639 · BGD 71,916,017 · RUS 71,219,082 · JPN 67,774,130 · MEX 60,057,827 · VNM 56,172,584 · ETH 54,892,293. **Declined** — see R1 |
| `specs/0011-country-search.md` R3 | read, 2026-09-01 | *"An empty query returns all 177, so the screen opens as a list and narrows"*, and its acceptance asserts `""` → **177 results**. This is the criterion that passes against a 12,294px list — it does not merely fail to catch the defect, it requires it |
| `specs/0011-country-search.md` R1 acceptance | read, 2026-09-01 | *"A render test asserts the number of option elements on step 01 equals `countryOptions(rows).length`"* — 177. A second criterion satisfied only by rendering everything |
| `specs/0011-country-search.md` R9 acceptance | read, 2026-09-01 | *"`Escape` restores all 177"*. A third |
| `specs/0011-country-search.md` *Verification the suite cannot do* | read, 2026-09-01 | The browser table records **"Options rendered 177"** as a *pass*. The measurement was taken and read as confirmation rather than as the defect it was |
| `specs/0012-desktop-layout.md` R4 | read, 2026-09-01 | Step 01 keeps the sticky dock (`wz-footer--anchored`) under the rule *"a screen that does not fit the viewport keeps its dock"*, justified by the measurement *"step 01 is still 177 rows and 12,739px tall at 1440"*. The rule survives this change; the measurement does not — see R6 |
| `src/utils/countrySearch.js` `searchCountries` | read, 2026-09-01 | Returns `{ matches, absent }`, unbounded. `matches` is `countryOptions(rows)` verbatim for an empty query. No cap, no count of what was elided — so a truncating caller could not say how much it had hidden |
| `src/components/wizard/wizard.render.test.jsx` | read, 2026-09-01 | The three assertions that encode the defect, by line: **`:281`** `document.querySelectorAll('[role=option]').length` `.toBe(177)`; **`:379`** `Escape` → `.toBe(177)`; **`:385`** the live region at rest `.toContain('177 of 177')`. These are the criteria in the suite, not only in the prose — so R5's tightening has three tests to move, not three sentences |
| `src/utils/wizard.test.js` | read, 2026-09-01 | **`:87`** `countryOptions(rows).length` `.toBe(177)` and **`:177`** `hit('')` `.length` `.toBe(177)`. Both are assertions about the *predicate*, not the screen, and both stay — R5 keeps them and moves only the screen-side claim |
| `scripts/desktop-measure.mjs` | read + run, 2026-09-01 | The 0012 R6 browser-measurement path. Walks seven viewports (375 / 480 / 767 / 768 / 1024 / 1440 / 1920), asserts the page title before measuring, and already has a `stepOne` probe reporting `optionCount` and `minOptionHeight`. Drives the system Chrome through `playwright-core`, which is installed `--no-save` and is deliberately not a dependency. R7 extends this rather than adding a second script |
| `npm run verify` on this branch, before any change | run, 2026-09-01 | Exit 0 — lint, build, **142 Vitest across 5 files**, **159 pipeline tests**, the 0008 lint-config guard, and the pilot **skipped with its stated notice** because a fresh worktree has no `pipeline/raw/` cache. So the gate is green over the defect, which is the point: no automated check in this repo can currently see a 12,754px step 01 |
| `specs/README.md` index | read, 2026-09-01 | 0011's row reads `done — 11 done`. R5 moves it to `8 done · 3 revised`; 0013 gets its own row |
| `src/components/wizard/CountryScreen.jsx` | read, 2026-09-01 | Renders `matches.map(...)` with no slice, and the live region reads `{matches.length} of {total} countries match`. The screen is the only place a cap could be applied today, and applying it there would leave the live count describing a list nobody sees |

## The resting state, decided

The issue offers three: the locale match alone, a handful of largest-employment
countries, or an empty state with the count. **The resting state is the selected
country alone, falling back to an empty state with the count**, and the
largest-employment shortlist is declined.

- **The selected country alone** — which on arrival *is* the locale match, since
  the pre-fill is what seeds the selection. This is 0011 R5 doing the job it was
  built for. The reader sees one row, their own country, already `aria-selected`,
  and a `Continue` that is already enabled. The probe shows this works today and
  is simply invisible; showing it alone is the whole fix for the reader on the
  happy path.

  **"The selected country", not "the locale country", and the difference is a
  bug this spec caught in its own first draft.** R5 revises 0011 R9 so `Escape`
  returns to the resting state. A reader in the UK who searches `france`, picks
  it, then presses `Escape` would — under a locale-keyed resting state — see
  *United Kingdom* rendered while *France* drove `Continue`: a screen showing one
  country and acting on another. Keying the resting state to the selection is
  identical on the happy path and has no such gap.
- **An empty state with the count**, otherwise — which covers a locale that
  resolves to nothing (`xx`, a bare `en`), and a locale that resolves to one of
  the 41 with no series. In the second case 0011 R5's named absence is *already*
  the copy on screen ("China reports no occupation breakdown to ILOSTAT, so it
  is not in this list"), and it reads far better against an empty list than
  against 177 rows of other countries.
- **The largest-employment shortlist is declined.** It is derivable — the probe
  above confirms `employed_total` is non-null for all 177 — so this is a choice,
  not a limitation. It is declined because it is an editorial ranking the reader
  did not ask for, on the first screen of the wizard, in a project whose first
  rule is not to construct what no source states. Nothing publishes "the
  countries a reader is most likely to want"; employment size is a stand-in for
  it, and putting India, the United States and Indonesia in front of a reader in
  Malta is a worse answer than putting Malta there. The locale route puts the
  reader's own country first without inventing a preference order.

## The cap, derived

**Twelve.** Not chosen for looking right — the two probes above bound it from
opposite sides:

- **From the page budget:** 17 rows is the most that keeps `body.scrollHeight`
  under two viewport heights at 390×844, the narrower and therefore binding
  width. Twelve leaves about 30% headroom, which the truncation line, the
  stated-absence line and any copy reflow will spend.
- **From the query distribution:** every three-character prefix already returns
  **7 or fewer** matches, and 87% of two-character prefixes return 12 or fewer.
  So a cap of 12 is unreachable from three characters on: it can only bite at
  one or two characters, which is exactly where the reader has not yet said
  enough to be shown a list, and where the honest response is "keep typing"
  rather than 150 rows.

Twelve is also above the eight that would suffice for the three-character bound
alone, deliberately: the extra four rows are what make two-character prefixes
usable for most of the alphabet.

**And a second cap, of three, on the stated absences.** The first draft of this
spec exempted them, on the reasoning that there are only ever a few. That was
reasoning rather than a probe, and the probe says otherwise: `a` returns **39**
absent rows, `i` returns 30, `s` and `an` return 21 each. At roughly 60px per
two-line note, thirty-nine of them is ~2,300px — a one-character query would
break the two-viewport bound on the absences *alone*, with the matches already
capped at 12.

Three is what the data supports, and it costs the reader nothing: 99% of
three-character queries and 100% of four-character ones already return three or
fewer, and every realistic full-name query — `china`, `saudi`, `new zea`,
`uzbek`, `oman` — returns exactly one. So the named statement is never elided
for a reader who typed a country's name; the summary line only ever appears at
one or two characters.

**A cap that hides anything must say so.** The project's rule against blurring
what is measured and what is constructed has a user-interface corollary: a
truncated list presented as a whole list is a false statement about the data.
So neither cap elides silently — the truncation is stated, on screen and in the
live region, whenever it applies. For the absences that statement is a count,
which is why capping them is available at all: `CLAUDE.md` allows dropping the
row and forbids dropping the statement, and a count is a statement.

## Requirements

### R1. [ ] Step 01 opens folded — the selected country alone, or nothing

On a cold load of step 01, before the reader has typed, the listbox renders
**the currently selected country and nothing else**, and **no options at all**
when there is no selection. On arrival the selection is `localeCountry`'s
pre-fill, so a reader whose locale resolves to a country with a series sees that
one row, already `aria-selected`, above an enabled `Continue`.

**Keyed to the selection, not to the locale.** R5 revises 0011 R9 so `Escape`
returns to the resting state, and a locale-keyed resting state would then render
the reader's *locale* country while their *picked* country drove `Continue` —
one country shown, another acted on. The two readings are identical on arrival
and differ only after a pick, which is exactly where the locale reading is wrong.

**The resting copy is named here so it cannot be inherited by omission.**
`CountryScreen.jsx:151` currently renders *"No country matches that."* whenever
the listbox and the absences are both empty. That branch is unreachable today,
because an empty query returns all 177; under this requirement it becomes the
normal resting state for every reader whose locale does not resolve, and would
greet them with a no-match message for a search nobody ran. So:

| Resting state | Listbox | The line under it |
|---|---|---|
| A country is selected | that one country | none |
| No selection | empty | *"Start typing to search all 177 countries."* |
| No match, **query non-empty** | empty | the existing *"No country matches that."*, now gated on a non-empty query |

The screen's other copy is unchanged and still carries the resting state's
meaning: the ILOSTAT provenance sentence and its count of 177 (0011 R10), and
the named absence when the locale resolved to a country with no series (0011 R5).

The 177 are not removed from anything. `countryOptions` still returns 177,
`searchCountries` still searches all of them, and every country reachable today
is still reachable. What changes is only what is *rendered before the reader has
asked for it*.

**Acceptance:** In a real browser at **390×844** and **1440×900**, on a cold load
of step 01: with `locale: 'en-GB'`, `document.querySelectorAll('[role=option]').length`
is **1** and its text is `United Kingdom`; with a locale that resolves to nothing
it is **0** and the page contains `Start typing to search all 177 countries` and
**not** `No country matches that`; with `locale: 'zh-CN'` it is **0** and the page
contains `China reports no occupation breakdown to ILOSTAT`. At every one of
those, `document.body.scrollHeight / window.innerHeight` is **< 2**.

Vitest covers the same three cases in jsdom by counting option nodes, plus the
case the browser walk cannot easily reach: search `france`, pick it, press
`Escape`, and assert the single rendered option is **France** and not the locale
country — the bug this requirement's first draft would have shipped.

### R2. [ ] A query renders at most 12 matches and 3 stated absences, both capped in the pure function

`searchCountries` takes the limits and returns what it truncated, rather than
leaving the screen to slice lists the live region has already counted. Its return
shape gains the totals so the two can never disagree:

```
searchCountries(rows, query, { limit, absentLimit })
  -> { matches, absent, matchCount, absentCount, truncated, absentTruncated }
```

`matches` is at most `limit` entries and `absent` at most `absentLimit`, both
still in `countryOptions`' alphabetical order (0011 R3 — no relevance ranking).
`matchCount` and `absentCount` are the sizes before truncation; the two
`truncated` flags are the corresponding `count > length`.

**Both lists are capped, and the first draft of this requirement exempted the
absences.** It reasoned that there are only ever a few. Probed: `a` returns 39,
`i` returns 30, `s` and `an` return 21 each — enough to break the goal's
two-viewport bound on the absences alone. The exemption was an unprobed claim,
which is the failure this project's *Source verification* discipline exists to
catch, so it is recorded rather than quietly fixed.

**Capping the absences is allowed only because the remainder is stated.**
`CLAUDE.md` permits dropping the row and forbids dropping the statement. A named
absence that becomes a counted absence is still a statement; one that becomes
silence is not, and would be a Pass 1 finding on this spec.

The defaults are **12** and **3**, exported as named constants so the screen, the
tests and the browser script all read the same numbers.

**Acceptance:** Vitest — `searchCountries(rows, 'a')` returns `matchCount` 150,
`matches.length` 12, `truncated` true, `absentCount` 39, `absent.length` 3 and
`absentTruncated` true; the 12 returned are the first 12 of the uncapped 150 **in
the same order**, and the 3 absences the first 3 of the uncapped 39;
`searchCountries(rows, 'united')` returns `matchCount` 3, `matches.length` 3 and
both flags false; `searchCountries(rows, 'china')` still returns 3 pickable and
**1** absent (`CHN`) with `absentTruncated` false, so 0011 R6's flagship case is
untouched by either cap; `searchCountries(rows, 'zzzz')` returns 0 and 0. In a
browser at both widths, typing `a` renders **12** `[role=option]` nodes and at
most **3** absence lines, and leaves `body.scrollHeight / innerHeight` **< 2**.

### R3. [ ] Both truncations are stated on screen and announced, and the count keeps 0011's wording

Whenever `truncated` is true the screen renders a line saying how many matches
are shown and that typing narrows further; whenever `absentTruncated` is true it
renders the remaining absences as a count. Both go in the polite live region as
well as on screen, because a screen-reader user is exactly the reader who cannot
see that a list was cut.

0011 R6's `N of 177 countries match` wording is kept **verbatim** as the count
clause, so a screen-reader user hears the sentence they heard before with the
truncation appended rather than substituted.

**At rest the live region is empty.** Not `177 of 177 countries match`, which is
true of the predicate and false of the screen — and the gap between those two is
the defect this spec exists to fix. Empty is also the correct `aria-live`
semantic: nothing has changed yet, so there is nothing to announce, and the first
keystroke produces the first announcement.

**Acceptance:** Vitest render — at rest the live region's `textContent.trim()` is
exactly `''`; with the query `a` it contains `150 of 177 countries match`,
`showing the first 12`, and a clause naming the **36** further absences, and the
`showing the first 12` string also appears in the rendered page *outside* the
`wz-sr-only` live region, so it is visible and not only announced; with the query
`united` the live region is exactly `3 of 177 countries match` and neither
truncation string appears anywhere on the page. In a browser, the visible lines
are read back out of the rendered page rather than asserted.

### R4. [ ] Everything spec 0011 settled still holds

This change moves *how much* is rendered and nothing else. Each of these is
re-checked rather than assumed, because a fold is exactly the kind of change
that silently takes a behaviour with it:

- 0011 **R3/R4** — all four match routes: `korea`→`KOR`, `usa`→`USA` (iso3
  prefix), `russia`→`RUS` (`Intl`), `turkey`→`TUR` (alias), `cote divoire`→`CIV`
  (the fold).
- 0011 **R5** — the locale pre-fill, including the divergent-spelling locales
  (`ko-KR`→`KOR`, `ru-RU`→`RUS`, `vi-VN`→`VNM`) and the script-bearing tags
  (`zh-Hans-CN` → the named absence for `CHN`).
- 0011 **R6** — a query matching a dropped country names it, as text, not as a
  control: for `china`, the string `China` appears outside any `button` /
  `[role=option]`, and `zzzz` renders the no-match line and names no country.
- 0011 **R9** — full keyboard operation: `ArrowDown` then `Enter` picks the
  first match; nothing is active on open; `Escape` returns to the **resting
  state** (see R5 — this is the one behaviour whose definition moves); the
  option and input tap targets stay at or above 56px and the focus ring stays
  `2px solid #FF5A2B` at `outline-offset: 3px`.

**Acceptance:** The existing Vitest cases for all of the above pass unmodified,
except the three R5 identifies. In a browser at both widths: typing `united`
then `ArrowDown` then `Enter` advances to step 02 with `GBR` selected; the
`china` absence line is present and satisfies `!closest('button') && tabIndex < 0`;
an arrow-key-active option computes `outline: 2px solid rgb(255, 90, 43)` at
offset `3px`; the console carries no errors.

### R5. [ ] The 0011 criteria that pass against a 12,294px list are re-marked `[~]`

Three acceptance criteria in `specs/0011-country-search.md` are satisfied *only*
by rendering all 177, and one of them specifies it. They are re-marked `[~]`
in the same change, each with what changed and why, pointing here — not left to
pass again, which is the failure mode the `[x]`/`[!]`/`[~]` marks exist for:

| 0011 | Text that has to move | Becomes |
|---|---|---|
| **R3** | *"An empty query returns all 177, so the screen opens as a list and narrows"*, asserted as `""` → 177 results | An empty query returns all 177 **from the predicate**; what the *screen* renders at rest is R1 here. The pure-function assertion stays — it is the correct test of a search predicate — and the screen-side claim moves out of it |
| **R1** | *"A render test asserts the number of option elements on step 01 equals `countryOptions(rows).length`"* | The render assertion becomes the resting state and the cap; `countryOptions(rows).length === 177` stays as the *data* assertion it always should have been |
| **R9** | *"`Escape` restores all 177"* | `Escape` clears the query and returns to the resting state |

0011's *Verification the suite cannot do* table also records **"Options rendered:
177"** as a passing row. It gains a line saying that this measurement was the
defect and was read as a confirmation — the browser check ran, produced the
right number, and nobody asked whether the number was right.

**Acceptance:** `grep` — `specs/0011-country-search.md` contains `### R1. [~]`,
`### R3. [~]` and `### R9. [~]`, each revision note naming spec 0013; its
*Verification* table carries the note on the 177-options row; and
`specs/README.md`'s 0011 index row moves from `11 done` to `8 done · 3 revised`.
The suite contains no assertion that step 01 renders `countryOptions(rows).length`
option elements.

### R6. [ ] 0012 R4's dock survives, but its stale justification is corrected

Spec 0012 R4 keeps the sticky dock on step 01 alone, under the rule *"a screen
that does not fit the viewport keeps its dock"*, and justifies it with a
measurement this change falsifies: *"step 01 is still 177 rows and 12,739px tall
at 1440"*.

**The rule still selects the same answer, and the dock stays.** Re-derived from
the geometry above rather than assumed: at 1440×900 the listbox starts at 341px
and twelve rows are 832px, so a full result set puts the page at roughly 1,250px
against a 900px viewport — step 01 still does not fit, and a static footer would
still put `Continue` below the fold. What changes is the size of the miss, not
its direction.

So 0012 R4 is not reopened. Its measurement is corrected in place with a note
pointing here, so the next reader does not find a spec claiming 12,739px against
a screen that measures a tenth of that and conclude one of them is lying.

**Acceptance:** In a browser at 1440×900 and 1920×1080, on step 01 with a query
returning 12 matches, the dock computes `position: sticky` and the `Continue`
button's box is on screen at first paint. `specs/0012-desktop-layout.md` R4
carries the corrected measurement naming spec 0013, and steps 02 and 03 still
compute `position: static` above the breakpoint.

### R7. [ ] The fold is measurable on demand, and `npm run verify` is green

The height half of this spec cannot be asserted in jsdom, so it goes where 0012
R6 put the same problem: `scripts/desktop-measure.mjs`, extended with the step 01
fold measurements — option count and `body.scrollHeight / innerHeight` at rest,
after a one-character query, and after a settled query, at every viewport it
already walks. The offline suite keeps the half it can see: the option counts,
the cap, the live-region text and the keyboard behaviour, none of which need
layout.

`playwright-core` stays an unsaved manual dependency exactly as 0012 R6 left it
— `verify` and CI must run in a fresh clone with no network and no browser
download.

**Acceptance:** `npm run verify` exits 0 — lint, build, the Vitest suite
including every new case, `test:pipeline`, and the pilot (or its stated skip in
a worktree with no `pipeline/raw/` cache). `node scripts/desktop-measure.mjs`
reports the step 01 fold rows at all seven viewports with no failures, and
`package.json` gains no dependency.

## Non-goals

- **Not a redesign of step 01.** The search input, the four match routes, the
  alias table, the stated absences and the keyboard model are 0011's and are
  kept as they are. This spec changes how many rows render and adds a sentence
  when that number is a truncation.
- **Not a change to the dataset, the payload or the pipeline.** No column moves,
  no tier changes, no country is added or removed. The 41 with no series are
  still searchable and still named; the 177 are all still reachable.
- **Not a relevance ranking.** 0011 R3 settled that matches appear in
  alphabetical order rather than by a score, and a cap is not a reason to
  reopen it: the cap takes the first 12 of that order. Ranking the 12 by
  anything — employment, population, a click history — would be the constructed
  preference order the resting-state decision above declines.
- **Not virtualised scrolling.** Rendering 177 rows efficiently is a different
  answer to a different question. The reader does not want 177 rows quickly;
  they want the one country they already know the name of.
- **Not reopening 0012 R4.** The dock stays. Only its stale measurement moves.
