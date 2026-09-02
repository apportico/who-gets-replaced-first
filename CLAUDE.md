# WHO GETS REPLACED FIRST

A map of who actually works, and which of that work sits in the occupations most
exposed to AI. Built from official labour statistics, with every constructed
number labelled as constructed.

## The rule: spec-driven, no exceptions

**No code without a requirement ID.** Specs live in `specs/`, numbered
`NNNN-name.md`. Read `specs/README.md` before starting anything.

Working order is always:

1. **Probe the sources first.** Before writing a requirement that names an API,
   hit that API and confirm it returns the field. Fill in the spec's *Source
   verification* table with what you actually saw. A requirement naming an
   unverified source is not ready to implement.
2. **Write the requirement** with acceptance criteria that can be *checked* —
   "Canada carries a non-null `white_collar_pct`" beats "the fallback works".
3. **Implement**, then mark the requirement `[x]` done, `[!]` not feasible with
   the reason, or `[~]` revised with what changed and why.

`[!]` and `[~]` are correct outcomes. Spec 0002 has one of each, and both came
from probing a source and finding it did not hold — R2 (OECD publishes no ISCO
dataflow) and R11 (ILO's 10-year age bands carry skill level, not ISCO). Recording
those beats quietly filling the gap with a guess.

## The non-negotiable: never blur measured and constructed

Every number carries a tier, in the data, the docs, and the UI:

| Tier | Meaning |
|---|---|
| `OFFICIAL` | Published national statistic (World Bank / ILOSTAT / Eurostat) |
| `DERIVED` | Arithmetic on official statistics |
| `PROXY` | A stand-in for something no source measures globally |
| `MODELED` | Analyst-assigned model output |

Rules that follow from this:

- **Never impute a missing country.** Nulls stay null and carry a
  `data_quality_flag`. A country with no data is a row of nulls, never a guess.
- **Never invent a figure to fill a gap.** `manual_overrides.json` exists for
  nationally-sourced numbers and *requires* a citation, a year and a retrieval
  date. Armenia, New Zealand and Saudi Arabia sit there unfilled on purpose.
- **Record the year per field.** Vintages differ — population may be 2025 while
  occupation is 2017. Never present a row as a single-year snapshot.
- **Weight aggregates, never simple-average country percentages.** And publish
  the coverage alongside, so partial coverage is visible.
- The AI exposure weights are **ours**. Only the rank order is defensible, and
  that claim is backed by the sensitivity analysis (median country moves 4
  places across three weightings) — not by assertion.

## The design: "The Replacement Date"

The app is being rebuilt against a design canvas, not against a screenshot.
Reference: <https://claude.ai/code/artifact/5144650a-4fe5-48af-b3c7-e887f7e6afde>
("Mobile landing page builder"). The canvas is the authority on layout, type and
motion; this section is the extracted contract so the values are in-tree and
reviewable. **If a value here and the canvas disagree, the canvas wins — and fix
this file in the same change.**

**Except above 768px, where the canvas has nothing to say.** It is a *mobile*
canvas — every artboard is one 480px column, and a 2026-09-01 probe could not
even enumerate them mechanically (the export is a bundler shell whose artboards
ride inside compressed blobs). So there is no desktop artboard to lose an
argument with, and **spec 0012 is the authority on the desktop layout**: the
breakpoint, both column widths, the desktop display scale and the un-docked CTA
are settled there, not on the canvas. A future desktop artboard would supersede
0012 the way the canvas supersedes this file — and would need the same note
written back here.

### Shape

Mobile-first, single column, **dark only**, page padding `22px`. The column is
`max-width: 480px` centred below `768px` and `max-width: 640px` above it —
**one** width breakpoint, and spec 0012 R1 is the only thing that may add
another. A four-step wizard, not a dashboard:

| Step | Screen | What it must do |
|---|---|---|
| — | Intro | The claim — **what the statistics actually say about your occupation group, measured rather than forecast**. Not the canvas's "a year — not a probability": R14 means no year arrives, and an intro that promises one makes the result screen read as broken rather than finished. One CTA, and **no capability chips** — the canvas has three; spec 0010 R5's second revision note records why they are not here |
| 01 | Country | A **search**, not a list: the 177 countries with an official series, filtered as you type. Pre-filled from locale. **The canvas has no search field** — spec 0011 diverges from it deliberately, and R1/R6/R10 record why |
| 02 | Occupation | Free-text title → one of the **nine ISCO-08 major groups**; the resolution is shown and overridable by chip, never silent |
| 03 | Optional | Age band and education — both real cross-tabulated dimensions, landing on different published cells; skipping means the result is reported for the group as a whole. (No interval to widen — see below) |
| 04 | Result | Two stat cards, the trend sparkline, and two accordions (method, back-test). **Not** the year, its interval or the scenario slider — see below |

**The year apparatus does not ship.** The canvas's headline output is a projected
replacement year, with an interval band and a three-notch adoption slider under
it. Spec 0010 R13 is `[!] not feasible` — probed 2026-08-31, nothing publishes a
displacement date per occupation — and R14 requires the result screen to read as
finished without any of it: no year, no interval band, no scenario slider, no
adoption assumption, and no placeholder where they sat. Everything else on the
canvas's result screen ships. Treat the canvas as authoritative on layout and
type, and this paragraph as authoritative on what is on the screen.

A sticky header carries a pulsing live dot, the wizard title and `NN/04`, above a
four-segment progress bar. Both stay **column-width**, not full-bleed: a
four-segment bar spanning 1920px reads as a page loading bar, and the header
belongs to the wizard rather than to the page (spec 0012, Non-goals). Below the
breakpoint, steps 01–03 carry a sticky footer CTA over a
`linear-gradient(to top, #0D0C0A 62%, transparent)` fade; **above it the CTA
un-docks** — `position: static`, no gradient — because the fade exists to say
"content continues under a floating bar" and there is no floating bar on a
desktop window (0012 R4).

The canvas has **no map**, and spec 0010 R1 deletes it: `LaborMap`,
`LaborSidebar`, `LaborDetailPanel`, `LaborTimeline`, `ScenarioPanel`,
`LaborPage`, Leaflet and the corridor overlay all go. The wizard is the only
surface, and its steps are internal state — there is no router. The map stays
recoverable in git history.

### Tokens

```
--bg           #0D0C0A   page
--surface      #161411   cards, inputs, unselected options
--fg           #E8E4DA   body text
--fg-strong    #F2EFE6   display type; also the fill of a *selected* option
--accent       #FF5A2B   primary, progress fill, focus ring, live dot
--accent-hover #FF7A4D   hover state on the primary action
--accent-soft  #FF9670   caveat text on accent-tinted panels
```

Borders and secondary text are `rgba(232,228,218,α)`: `0.09` hairlines, `0.10–0.18`
card and control borders, `0.35–0.55` muted text, `0.72–0.85` body-on-dark.
Accent-tinted panels are `rgba(255,90,43,0.08–0.14)` on a `rgba(255,90,43,0.28–0.40)`
border. Selection inverts — `#F2EFE6` ground, `#0D0C0A` text.

**Radii:** `14px` controls, inputs and small cards · `18px` stat and panel cards ·
`99px` buttons, pills and badges.

**Touch targets:** primary CTA `min-height: 60px` · options and secondary buttons
`56px` · tertiary/skip `48px`. Nothing interactive goes below 48px.

### Type

Three families, each with one job. Load Geist, Geist Mono and Instrument Serif
self-hosted or from Google Fonts; always ship a fallback stack.

**Request them from `index.html`, not from a CSS `@import`.** Tailwind v4's
processing drops a bare `@import url(...)`, so the built stylesheet carries no
`@import` and no `@font-face` and the page renders in fallbacks — silently, with
a clean build and a green suite. Spec 0010 shipped that for two rounds. A test
that checks the URL is in `index.css` cannot see it; check what the browser is
asked to fetch.

- **Instrument Serif 400** — display only. `h1` 66px/0.9/`-0.025em`, `h2`
  46px/0.98/`-0.02em`, stat figures 38px; above the `768px` breakpoint the same
  three grow to **78 / 54 / 44px** and nothing else in the scale moves — body,
  mono and every label size are width-independent, and 0008 R4's 11px floor is a
  floor, not a step that scales (0012 R3). Italic is the emphasis device
  (`replaced.` in the headline). The canvas's 132px result year and its 25px
  scenario sentence are **not** in this scale — neither element ships (R14) —
  though `font-variant-numeric: tabular-nums` still applies to the stat figures.
- **Geist** — body. 16px/1.5 base, 17.5px lede, 15px secondary, 12.5–13.5px
  notes. `text-wrap: pretty` on every prose paragraph.
- **Geist Mono** — every label, tier badge, eyebrow, chip and button face.
  8–11.5px, `text-transform: uppercase`, `letter-spacing: 0.10–0.20em`. If text
  is uppercase and small, it is mono; if it is a sentence, it is not.

### Motion and focus

**Four** keyframes, not the canvas's five: `stepin` (18px rise + fade, 0.4–0.5s
`cubic-bezier(0.2,0.75,0.2,1)`) on every step mount · `fade` 0.3s on accordion
bodies · `draw` 1.2s on the sparkline stroke · `pulse` 2.6s on the header dot.
The canvas's `band` 0.6s `scaleX` does not ship — it animates the interval band
(R14). Focus is **`2px solid #FF5A2B`, `outline-offset: 3px`** — never removed.
Respect `prefers-reduced-motion`.

### The result screen is where the data rules bite

Everything in *The non-negotiable* above applies hardest here, because this
screen is the one that states a number about the reader's own job:

- **Every figure carries its tier badge** — `OFFICIAL`, `DERIVED`, `PROXY`,
  `MODELED` — in the vocabulary of the table above. The canvas mockup says
  "Placeholder" and "Missing"; those are mockup words. Ship `MODELED`, and a
  genuinely absent term renders as absent, not as a number.
- **A point estimate never ships without its uncertainty.** In the canvas this
  was the year and its interval band, which had to render together or not at all.
  Neither ships (R14), so what the rule governs now is coverage: a share is shown
  with the coverage it rests on, and a figure whose basis is too thin is withheld
  rather than shown bare (R9's coverage floor is this rule with a number).
- **A stand-in says it is standing in.** The canvas already does this ("Clerical
  series shown as a stand-in") — keep that behaviour, do not quietly substitute.
- **No country without a series gets a number.** `no series` is a first-class
  result: nulls stay null, and the screen says so. Spec 0011 moved *where* it
  says so — the 41 countries with no series are no longer 41 unpickable rows in
  a 218-row scroll; a search for one names it and states the absence (R6), and a
  locale resolving to one names it on arrival (R5). Dropping the row is allowed.
  Dropping the statement is not.
- **Know which mockup figures are real.** Probed 2026-08-31: the canvas's UK
  numbers are the actual dataset — `isco4_clerical_pct` is 8.8633,
  `clerical_employed` is 2,989,466, and the clerical series really does run
  10.0% (2013) → 8.9% (2025). Those are `DERIVED` and may ship. What *is*
  invented is the year (2041), the three scenario years and the 2028–2072 axis.
  Those may not reach a build.
- The canvas's own method panel marks **Duration** as not yet sourced. That probe
  has now happened: spec 0010 R13 is `[!] not feasible` — the nearest published
  work is US-only decadal occupational churn on US census classifications, which
  is not ISCO-08, not per country, and not AI displacement. **No replacement year
  ships, in any tier.** Reviving it as `MODELED` would need its own formula,
  sensitivity analysis and issue, on the precedent of the exposure weights.

## The component layer: shadcn/ui

The rebuild uses **shadcn/ui** — copy-in components we own, not a dependency we
theme from outside. That fits the repo: the design is opinionated enough that a
styled component library would be fought, and Radix underneath gives keyboard and
screen-reader behaviour we are not going to write by hand.

### Setup, given what is already here

Tailwind v4 is installed via `@tailwindcss/vite`, and the codebase is **JSX, not
TSX**. So:

```bash
npx shadcn@latest init      # answer: no tailwind.config.js — v4 is CSS-first
npx shadcn@latest add toggle-group accordion
```

- `components.json` must carry **`"tsx": false`** or the CLI writes `.tsx` files
  into a JS project. `"style": "new-york"`, `"iconLibrary": "lucide"`.
- Path aliases are required: add `jsconfig.json` mapping `@/*` → `./src/*` **and**
  a matching `resolve.alias` in `vite.config.js`. Vite does not read `jsconfig`
  for resolution.
- Init writes `src/lib/utils.js` (`cn`) and pulls `class-variance-authority`,
  `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`. It also rewrites
  `src/styles/index.css` — check the diff, it will want to drop what is there.
- Under Tailwind v4 the theme lives in CSS: token custom properties plus an
  `@theme inline` block. **Put our palette on `:root`, not only under `.dark`** —
  the app is dark-only, so dark is the default, not a variant.
- Pick any `baseColor` at init and then **overwrite every token** with the
  palette above. Shipping a screen that still reads as default shadcn stone is a
  review finding, not a style preference.

### Which primitive does which job

| Screen element | Component |
|---|---|
| Age / education band chips | `ToggleGroup` + `ToggleGroupItem` — the roving tabindex and arrow keys turn up to nine tab stops into one |
| "How the number is built", "What this cannot tell you" | `Accordion` — `aria-expanded`, the `aria-controls`/`id` pairing and the keyboard handling, none of which is worth re-typing |
| Everything else | Tokens plus plain elements. `.wz-cta`, `.wz-card`, `.wz-badge`, `.wz-option`, `.wz-chip` in `index.css` |

Only **two** shadcn components are rendered. Spec 0010 R3 is `[~]`: `Button`,
`Card`, `Input` and `Badge` were installed and never rendered — nothing outside
`src/components/ui/` imported them, so a rule targeting their `data-slot`s
matched no element and R4's "extend the `cva` variants" applied to nothing. They
are removed.

`src/components/ui/` therefore holds **three** files, not two. `toggle.jsx` is
the third: `toggle-group` imports `toggleVariants` from it, so it is a
dependency of a rendered component rather than an unrendered one. Deleting it
under rule 1 below would break `toggle-group` — the rule is about what a screen
*adds*, not about every file the directory ends up holding.

`wizard.render.test.jsx` asserts that every component in `src/components/ui/`
**except `toggle`** is imported by a screen, and then asserts that `toggle` is
genuinely not imported, so the exemption cannot quietly start covering something
else. "The file exists" is what made the original six look installed, which is
why the guard is on imports rather than on the directory listing.

`slider` was never installed at all: its only consumer in the canvas is the
adoption scenario, which R14 does not ship. Same for the `PROJECTED` badge and
the interval band — the progress bar and sparkline stay hand-rolled, four `div`s
and an SVG beating a dependency.

### Rules

1. **Add only what a screen uses.** `npx shadcn@latest add <x>` when a
   requirement needs `<x>`, never a speculative batch.
2. **Restyle inside the component file** — extend its `cva` variants and the CSS
   tokens. A wall of overriding `className`s at every call site is how the design
   drifts.
3. **Never strip the accessibility.** `aria-*`, `data-state`, focus management
   and the Radix `asChild` plumbing stay. The focus ring is a token change, not a
   deletion.
4. **Generated components are ours, and edits are reviewable.** Note any
   non-trivial divergence from upstream in a comment at the top of the file, so
   the next `shadcn add` overwrite is a conscious choice.
5. **Icons are `lucide-react`,** imported per-icon.
6. shadcn changes nothing about the data contract. A tier badge — `.wz-badge`
   here, since `Badge` does not ship — renders the tier it is given; it never
   invents one, and there is no default tier.

## Layout

```
specs/            numbered specs — start here
pipeline/         TypeScript data pipeline (zero runtime dependencies)
  run.ts          orchestrator: --pilot for the 6-area batch, bare for the full run
  pynum.ts        CPython's arithmetic and formatting — see below, it is not optional
  csvio.ts        hand-rolled CSV, Python's default dialect, CRLF
  pyjson.ts       json.dump's serialiser, and a reader that keeps int/float apart
  schema.ts       Tier, Measured, Vintage and the Int brand — consumed on both sides
  raw/            cached API responses, gitignored (~130MB)
  data/           CSV, SQLite, cross-checks, outlier queue
  README.md       every field, its source, its limitations
src/              React + Vite app (the wizard)
.snapshots/       per-spec evaluation screenshots, committed — /sdlc posts these
                  into the PR comment by raw URL; outside src/ and public/, so
                  they never reach a build
```

## The workflow

Project skills in `.claude/skills/` drive the spec loop. Use them rather than
improvising the steps:

```
/sdlc             run the whole loop below for one ticket, end to end
/next             pick the next task off the GitHub board
/spec             probe the sources, write requirements, open a draft PR
/update-spec      approve; later, mark requirements [x] / [!] / [~]
/implement        approved spec -> plan mapped to requirement IDs
/evaluate         run the acceptance checks, verdict per requirement
/review-pr        review a PR against its spec
/address-reviews  fix, reply, resolve review threads
/babysit          keep a PR moving — conflicts, red CI, review threads, on a loop
/status           where every spec stands
```

`/spec` will not let you write a requirement against a source it has not probed,
and `/update-spec` will not let a spec reach `done` while a requirement is still
`[ ]`. That is the point. See `.claude/skills/README.md`.

`/sdlc <ticket>` chains all of the above for one issue and runs the work without
prompting — `/babysit` between phases, `/address-reviews` on feedback, merge on
approval. It opens the spec PR **ready rather than draft** and skips
`/implement`'s confirmation prompt, and it stops on the ticket's **goal** — taken
from the issue's `## Definition of done` or from `/sdlc 27 /goal <text>`, written
to the spec's `**Goal:**` field and tracked with the `/goal` built-in — rather
than on the merge.

**Both review phases exit on an `APPROVED` decision**, and `/sdlc`'s *Whose
approval counts* is the authority on what produces one. The short version, and
the two halves pull opposite ways on purpose:

- **A standing review routine's `APPROVED` closes the gate.** For a while this
  said the approval could only come from a person. That was unworkable rather
  than strict: `claude-review.yml` is inert until #44, and the routine that does
  review states in every round that it is not a person — so the only producer of
  the only signal disclaimed it, and a run could only stall or over-read it. It
  stalled, three ticks running, on spec 0018. The routine's self-description is
  **provenance to record** on the spec's `**Reviewed:**` line, not a veto.
- **An approval covers only the commit it was given on.** `dismiss_stale_reviews`
  is `false`, so GitHub carries one forward over every later push without anyone
  reading the new code — on PR #92 that carried two spec-stage approvals over
  1,717 lines of implementation while reading `APPROVED` / `CLEAN`. `/sdlc` now
  checks this with `git diff --name-only <approved-sha>..HEAD`, and re-requests
  rather than merging. This is the half with teeth.

**The consequence, recorded deliberately rather than left emergent:** `main`
requires one approving review and `enforce_admins` reads `false` (#93), so a
`/sdlc` run can now merge to `main` with no person having read the diff after the
invocation. That is the accepted cost of the alternative being a permanent stall.
Revisit it if #44 lands, or if #93 restores admin enforcement.

It relaxes nothing else above: unprobed sources, unmarked requirements, an
untiered number or a red `npm run verify` each stop the run rather than being
worked around.

### Workflow hooks

Four `PreToolUse` hooks in `.claude/hooks/`, wired through
`.claude/settings.json`, refuse the four things this file already forbids: a
commit on `main`, a commit staging a malformed spec, a push while `npm run
verify` is red, and `gh pr merge` while the check named `verify` is not green.
Spec 0018, issue #4.

**They govern Bash commands from a Claude Code session in this repository — not
a terminal, an editor's UI, the GitHub merge button, or CI.** That boundary is
the point of `.claude/hooks/README.md`; read it before treating a hook as a
guarantee. They *do* still fire under `bypassPermissions` (probed 2026-09-02).

### Intent lives in GitHub Issues

Issues are the source of truth for **why** a change exists — they carry the
problem, the scope, the sources to probe and the definition of done. Specs carry
**what must be true** and link back with an `**Issue:**` field. Duplicating
intent into the spec would guarantee drift, so we do not; a spec without an
issue link is missing a field, not carrying extra context.

### Review contract

`REVIEW.md` at the repo root defines the passes every change gets and what each
finding is worth. Both `/review-pr` and the automated PR workflow read it, so a
human review and an automated one reach the same verdict. Change the contract
there, never inside a skill.

Its Pass 1 (the data non-negotiables) and Pass 2 (unprobed sources) are Blockers
and outrank every other finding. It also lists what is **out of scope** for
review — formatting, style preference, and re-litigating a decision the spec
already records.

### Practices deliberately declined

Recorded so they are not re-proposed. From the AI-native SDLC playbook, spec
0003 declined:

- **On-call / incident response** — a static GitHub Pages site with no runtime
  has no incidents to respond to.
- **OpenTelemetry export, DORA metrics, approval-gate timings** — org-scale
  instrumentation; noise at this size.
- **Scheduled security scans** — the current surface is a static site plus a
  read-only pipeline. **Revisit if M5 lands**: payments and stored personal data
  change that answer completely.
- **Migrating specs to the playbook's `spec.md` shape** — the numbered specs
  with requirement IDs and the `[x]` / `[!]` / `[~]` marks are stricter than the
  playbook's baseline. Adopting its format would be a downgrade.

## Commands

```bash
npm run verify           # lint + build + pipeline tests + pipeline:pilot — the gate; run before saying anything is done
npm run dev              # app at localhost:5173
npm run build            # production build (base path /who-gets-replaced-first/)
npm run pipeline:pilot   # 6-area validation batch, prints regression checks
npm run pipeline         # full run: 218 countries + 11 aggregates
npm run lint
npm run typecheck        # tsc --noEmit; never emits — see 0007 R7
npm run test:pipeline    # 158-test regression suite, offline, <1s
```

The pipeline caches every API response under `pipeline/raw/`, so re-runs are
offline and free. Delete a cached file to force a refresh of that source.

## Verify before claiming

**`npm run verify` is the single command that must pass before work is handed to
a human.** It runs lint, the build, **spec 0004's regression suite**, and the
pilot batch with its anchors, exiting non-zero if any of them fail — so iterate
until it is green rather than letting a reviewer find the failure.

**CI runs the same command.** That is the point of it being one command: a
contributor who is green locally does not land red on the check that gates
`main`. If you add a check to CI, add it to `verify` in the same change.

The regression suite is unconditional — its fixture and expected CSVs are all
in-tree, so it runs in a fresh clone with no network. Only the pilot is
conditional, on the response cache being present.

The pipeline has regression checks against independently published figures
(World services ≈50%, US ≈79%, EU-27 ≈72%, India ≈31.5%) and an Eurostat
cross-check of all 27 EU members. A moved anchor now **fails the run**, rather
than printing `FAIL` and exiting 0 as it did before spec 0003. `[validate]`,
`[crosscheck]` and `[outliers]` blocks print on every full run; outliers are a
standing review queue and deliberately do not fail the build.

`verify` skips the pilot when `pipeline/raw/` is absent (a fresh clone or a
worktree), saying so loudly — populate the cache with one `npm run pipeline:pilot`
to include the anchors.

For UI changes, `npm run build` passing is not evidence the page renders — a
runtime error still builds clean. Load the page.

**Toolchain.** Node 24, pinned in CI, and nothing else. Spec 0007 ported the
pipeline from Python to TypeScript and R10 deleted the Python, so there is no
interpreter to pin any more. **There is no build step either**: Node 24 strips
types natively, so `node pipeline/run.ts` runs the pipeline directly, and `tsc`
exists only to type-check.

**Zero runtime dependencies is the rule that replaced "stdlib only, no pip
installs"** (0007 R9). `node:sqlite`, `fetch`, `node:zlib` and `node:util`'s
`parseArgs` are native; CSV is hand-rolled. Adding a runtime dependency to the
pipeline needs its own requirement, the same way a pip install would have.

**The number layer is load-bearing.** JavaScript's arithmetic and formatting are
not Python's, and the committed outputs were produced by Python. In pipeline
code, every `round()` is `pyRound` / `pyRoundInt`, every `sum()` selects
`pySumInt` / `pySumFloat` / `pySum` **from the schema's declared `Int` brand at
the call site** — never from what the value looks like, because
`Number.isInteger(14455.0)` is `true` — and every float written to a file goes
through `pyStr`. `Math.round`, `toFixed`, `reduce` and `String(x)` each change
published numbers; `pipeline/README.md` tabulates by how much. 100,000
differential cases frozen from CPython 3.13 sit in `pipeline/tests/fixtures/pynum/`
and are the only remaining proof the arithmetic is Python's.

**`main` enforces this.** `verify` is a required status check and
`enforce_admins` was set `true`, so nobody merges red CI — administrators
included
(spec 0005 R3/R4). **Probed 2026-09-02: `enforce_admins` now reads `false`** —
a regression against 0005 R4's recorded acceptance, tracked as
[#93](https://github.com/apportico/who-gets-replaced-first/issues/93). Until
that is resolved, an administrator *can* merge red CI. Branches do not have to be up to date with `main` to merge
(`strict: false`), so an unrelated merge does not force a rebase.

## Gotchas

- `vite preview` caches `index.html` in memory; it can serve a stale page and
  look like a blank-page bug. Serve `dist/` with a plain static server when
  debugging the production build.
- Basemap tiles were a live gotcha while the map existed: CARTO now requires an
  API key and watermarks every tile without one, so the project used Esri's
  key-free light gray canvas, whose tiles are `{z}/{y}/{x}` rather than
  `{z}/{x}/{y}` and carry no `{s}` or `{r}` tokens. Kept here for whoever
  restores the map from history — spec 0010 R1 deletes it.
- `src/data/port_data.json` and `sanctions_regimes.json` were a **static
  snapshot** from the corridor-wars board for the R16 overlay, and never tracked
  changes made there. Spec 0010 R1 deletes them, which closes that drift
  (issue #20) rather than carrying it.
