# 0019 — nextjs-typescript-migration

**Status:** draft
**Depends on:** 0007 (the pipeline's schema types, which the app adopts), 0010,
0012, 0015, 0016 (the wizard, the desktop layout, the meta contract and the URL
contract this migration must carry across unchanged)
**Issue:** [#23](https://github.com/apportico/who-gets-replaced-first/issues/23),
covering [#22](https://github.com/apportico/who-gets-replaced-first/issues/22)
**Goal:** Move the app to Next.js and TypeScript in one pass, checked as:

1. One spec covers both #22 (JS→TS) and #23 (Vite→Next.js), each requirement
   traceable to one or both.
2. Static-export vs server-hosted is settled by a probe in *Source
   verification*, before any requirement names a hosting shape.
3. Scope is re-derived against the post-0010 wizard — no requirement names
   `LaborMap`, Leaflet, the scenario slider or the timeline scrubber.
4. Every figure still carries its tier and per-field year, nothing is imputed,
   and `npm run verify` is green.

## Objective

The app cannot currently give anything a URL. Spec 0016 put the wizard's state
in a **query string** rather than a path, and its own source verification records
why: `…/who-gets-replaced-first/result` returns 404 on GitHub Pages because no
server and no `404.html` exist to serve it. That single constraint is what
blocks #24 (a URL per country), #25 (per-country metadata and social cards) and
#26 (per-route data) — and it is a property of *how the site is built*, not of
what the app does. `index.html` states the consequence outright: "GitHub Pages
serves a static artefact with no prerender and crawlers do not execute JS, so
per-result meta cannot be produced on this host by any means."

A Next.js static export removes that constraint without changing hosts: it
prerenders one real HTML file per route at build time, so a path returns 200
with meta tags a crawler can read, on the same free GitHub Pages deployment.
This spec is the migration that makes those three issues possible, plus the
TypeScript conversion (#22) that makes them safe — the app renders tiered
figures, and today a `MODELED` score and an `OFFICIAL` count are both `number`,
with only prose keeping a null from rendering as `0`.

**Issue #23's body is stale and this spec supersedes its scope section.** It
describes migrating "13 components" including `LaborMap`, Leaflet, a
`dynamic(… { ssr: false })` boundary, a scenario slider and a timeline scrubber.
Spec 0010 R1 deleted every one of those. The actual surface is recorded in the
table below.

## Source verification

| Source | Probed | Result |
|---|---|---|
| Next.js static export docs | `WebFetch` 2026-09-02, docs version **16.3.4**, page updated 2026-08-25 | `output: 'export'` emits **`out/`** (`distDir` can rename it). **Supported:** Server Components executed at build time, `generateStaticParams`, the Metadata API, per-route code splitting, and — contrary to #23's body — **GET Route Handlers**, provided they carry `export const dynamic = 'force-static'`. **Unsupported:** `dynamicParams: true`, dynamic routes with no `generateStaticParams`, request-reading route handlers, `cookies`, rewrites, redirects, headers, proxy/middleware, ISR, the default `next/image` loader, draft mode, Server Actions, intercepting routes |
| `npm view next` | `npm view` 2026-09-02 | `latest` = **16.3.4**. `peerDependencies.react` = `^18.2.0 \|\| ^19.0.0` — satisfied by the installed React **19.2.4** |
| Official Pages template `nextjs/deploy-github-pages` | `curl` raw `next.config.ts` + `.github/workflows/deploy.yml` 2026-09-02 | `next.config.ts` is three lines: `output: 'export'`, `basePath: process.env.PAGES_BASE_PATH`. The workflow takes `basePath` from `actions/configure-pages@v5`'s `outputs.base_path` and uploads `./out`. **It ships no `.nojekyll` file** |
| This repo's live Pages config | `gh api repos/apportico/who-gets-replaced-first/pages` 2026-09-02 | `"build_type": "workflow"`, `html_url` `https://apportico.github.io/who-gets-replaced-first/`. Jekyll runs only under `build_type: "legacy"` (publish-from-branch). **#23's "GitHub Pages gotcha" — Jekyll stripping `_next/` — does not apply to this repo's deploy shape**, which already uses `upload-pages-artifact` + `deploy-pages` |
| Tailwind v4 Next.js guide | `WebFetch` 2026-09-02 | Next.js uses **`@tailwindcss/postcss` + `postcss`**, wired through `postcss.config.mjs` (`plugins: { "@tailwindcss/postcss": {} }`), not the `@tailwindcss/vite` plugin this repo installs. `@tailwindcss/postcss` latest **4.3.3**; installed `tailwindcss` is 4.2.2 |
| Next.js Vitest guide | `WebFetch` 2026-09-02, docs version 16.3.4 | Vitest runs standalone against Next: `vitest` + `@vitejs/plugin-react` + `jsdom` + `@testing-library/react`, config `defineConfig({ plugins: [react()], test: { environment: 'jsdom' } })`, plus **`vite-tsconfig-paths`** for the `@/*` alias under TypeScript. Stated limitation: **async Server Components are not supported by Vitest** — sync Server and Client Components are |
| The app's actual surface | `git ls-files` + `wc -l` 2026-09-02 | **38** `.js`/`.jsx` files, **6,635** lines — not #23's 13. `src/components/wizard/` ×8, `src/components/ui/` ×3, `src/utils/` ×17, `src/styles/` ×3, `App.jsx`, `main.jsx`, `Sparkline.jsx`, `lib/utils.js`. **Zero** matches for `leaflet\|LaborMap\|LaborSidebar\|LaborDetailPanel\|LaborTimeline\|ScenarioPanel\|LaborPage` in `src/` outside three comments recording their deletion |
| Browser globals in the app | `grep` over `src/` 2026-09-02 | Six non-test files touch `window`/`document`/`navigator`, and **every one is already guarded or inside a handler**: `globalThis.navigator?.clipboard?`, `globalThis.document?.fonts?`, `document.createElement` inside a function body. Only `main.jsx` dereferences `document` at module scope — and `main.jsx` is the file the App Router replaces. **Nothing blocks build-time prerender** |
| Build entry points | `cat vite.config.js` 2026-09-02 | **Two** HTML inputs, not one: `index.html` and `methodology.html` (0015 R2, a real page with a real URL). Both become App Router routes |
| The `verify` gate | `cat scripts/verify.sh` 2026-09-02 | **Ten** steps. Three carry build-shape assumptions the migration breaks: `build` is `vite build`; `check:meta` hardcodes `const DIST = 'dist'` and asserts over **built** files; `lint` runs `eslint.config.js` whose `globalIgnores(['**/dist', …])` and `files: ['**/*.{js,jsx}']` name neither `out/`, `.next/`, nor `.ts`/`.tsx` |
| `pipeline/schema.ts` | `grep '^export'` 2026-09-02 | Exports `Tier`, `FieldTier`, `Measured<T>`, `Vintage<T>`, the `Int` brand, `DatasetRow`, `TIERS`, `NOT_A_MEASUREMENT`, `isIntColumn`. These are the types #22 asks the app to adopt, and they already exist |

### The decision this spec had to settle first

**Option A — static export on GitHub Pages.** Every capability the open backlog
actually asks for is in the *Supported* column above: build-time Server
Components (#26), `generateStaticParams` (#24), the Metadata API (#25). Hosting
stays free and the deploy workflow changes by one line (`path: dist` → `path:
./out`) plus the `basePath` env.

**Option B — server-hosted.** Buys request-time rendering, dynamic OG images and
ISR. Nothing in M1–M4 needs any of it. M5's #31 (payments) would, but payments
run through a hosted provider and that decision belongs to #31, not here.

**Chosen: Option A.** What it forecloses is recorded in R1 so a later issue
reopens it deliberately rather than discovering it.

## Requirements

### R1. [ ] The hosting shape is static export, and what that forecloses is written down

`next.config.ts` sets `output: 'export'` and takes `basePath` from the
environment, following the official Pages template rather than hardcoding
`/who-gets-replaced-first/`. The spec records the *Unsupported* list from the
probe above as the accepted cost, so #31 or any future server-needing issue
reopens the decision explicitly.

This requirement produces **no numbers** and therefore carries no tier.

**Acceptance:** `next.config.ts` contains `output: 'export'`; `npm run build`
creates `out/index.html` and an `out/_next/` directory; `grep -c "who-gets-replaced-first" next.config.ts`
returns `0` (the path comes from `PAGES_BASE_PATH`); and this spec's *Non-goals*
names the foreclosed features.

### R2. [ ] The App Router replaces Vite, and both entry points become routes

`app/layout.tsx` carries what `index.html`'s `<head>` carries today. `app/page.tsx`
is the wizard; `app/methodology/page.tsx` is the second entry point 0015 R2
added. `main.jsx`, `index.html`, `methodology.html` and `vite.config.js` are
deleted; `@vitejs/plugin-react`, `vite` and `@tailwindcss/vite` leave
`package.json`. `npm run dev` becomes `next dev`, `npm run build` becomes
`next build`.

**Acceptance:** `git ls-files` returns nothing for `vite.config.js`,
`index.html`, `methodology.html`, `src/main.jsx`; `grep -rn "\"vite\"\|@vitejs/plugin-react\|@tailwindcss/vite" package.json`
is empty; `out/index.html` and `out/methodology/index.html` (or
`out/methodology.html`) both exist after a build and both contain a rendered
`<h1>`.

### R3. [ ] Tailwind v4 moves to PostCSS, and the three font families still reach the browser

The `@tailwindcss/vite` plugin is replaced by `@tailwindcss/postcss` +
`postcss.config.mjs`. **The font trap from 0010 R2 must not regress**: Geist,
Geist Mono and Instrument Serif are requested from the document head — now
`app/layout.tsx` — and never from a CSS `@import`, because Tailwind v4's
processing drops a bare `@import url(...)` silently, with a clean build and a
green suite.

**Acceptance:** `postcss.config.mjs` names `@tailwindcss/postcss`; a built CSS
file under `out/_next/` contains the palette (`grep -rl -- '--accent' out/_next/`
is non-empty); and the **built** `out/index.html` carries a
`fonts.googleapis.com` stylesheet link — checked against the built file, not the
source, per the rule that a test reading `index.css` cannot see this defect.

### R4. [ ] The `'use client'` boundary is drawn as tightly as the wizard allows

The wizard is interactive and becomes a Client Component. The boundary is placed
deliberately and documented in a comment: the route files stay Server Components
so #26 can later read the dataset at build time, and `'use client'` sits at the
wizard root rather than being sprinkled per file.

**Acceptance:** `grep -rc "'use client'" app/ src/` shows the directive on the
wizard root and **not** on `app/layout.tsx` or `app/page.tsx`; `npm run build`
completes with no "cannot be used in a Server Component" error.

### R5. [ ] All 38 app files convert to TypeScript under `strict: true`

Every `.js`/`.jsx` under `src/` (and the new `app/`) becomes `.ts`/`.tsx`, with
a root `tsconfig.json` at `strict: true`. Where a type is genuinely unclear it
is modelled honestly; a conversion that lands on `any` buys nothing. `jsconfig.json`
is deleted, its `@/*` alias moving to `tsconfig.json`.

**Acceptance:** `git ls-files 'src/**/*.js' 'src/**/*.jsx' 'app/**/*.js' 'app/**/*.jsx'`
returns **empty**; `tsconfig.json` has `"strict": true`; `npx tsc --noEmit -p tsconfig.json`
exits 0; and `grep -rn ": any\b\|as any\b" src/ app/ --include='*.ts' --include='*.tsx'`
returns only lines carrying an explanatory comment (reviewed by hand and the
count recorded here).

### R6. [ ] The app consumes the pipeline's schema types, so a tier cannot go missing at compile time

The app imports `Tier`, `FieldTier`, `Vintage` and `DatasetRow` from
`pipeline/schema.ts` rather than restating them. The JSON payloads are typed
against that schema instead of arriving as `any`, so the four failure modes #22
names — a figure rendered without its tier, a `null` formatted as `0`, a value
shown without its per-field year, an ISO3 that is not in the dataset — become
type errors.

**No new numbers are produced.** Tiers continue to come from the payload's
`field_tiers` block; this requirement makes that block's shape checked, and
invents no tier of its own — there is still no default tier.

**Acceptance:** `grep -rn "from '.*pipeline/schema'" src/ app/` is non-empty; and
a deliberately broken snippet — a figure destructured without its tier, and a
`DatasetRow` field typed `number` where the schema says `number | null` — is
added under `test/types/` with `@ts-expect-error`, so `tsc` fails if the types
stop rejecting it. This is 0007 R7's pattern, and it is the only thing that
proves the types are met by *rejecting*, not by existing.

### R7. [ ] `typecheck` covers the app as well as the pipeline, in `verify` and in CI

`npm run typecheck` today is `tsc -p pipeline/tsconfig.json` and sees no app
file. It must check both projects. Per CLAUDE.md, a check added to CI is added
to `verify` in the same change — here both already invoke `verify`, so the edit
is to `scripts/verify.sh` and `package.json` only.

**Acceptance:** `npm run typecheck` fails when a type error is introduced in an
app file (demonstrated and the output pasted), and still fails on the four
`@ts-expect-error` cases in `pipeline/tests/schema.types.ts` that 0007 R7 owns.

### R8. [ ] The built-output checks follow the output directory, and 0015's meta contract survives

`scripts/check-meta.mjs` hardcodes `const DIST = 'dist'` and asserts over built
files — deliberately, because the defect it guards (a relative `og:image` that
is correct in source and a 404 in production) exists only after a build. It must
now read Next's output directory, and the og/twitter tags must still be absolute
and still point at files that exist. `eslint.config.js` gains `out` and `.next`
in `globalIgnores` and `.ts`/`.tsx` in `files`.

**Acceptance:** `npm run check:meta` passes against the new output directory and
**fails** when an `og:image` is made relative (demonstrated, output pasted);
`npx eslint .` reports 0 errors and lints zero files under `out/` or `.next/`.

### R9. [ ] The 0016 URL contract is carried across byte-identically

The wizard's state stays a query string on the existing path — `?c=GBR&g=3` —
exactly as 0016 R1 defines it. Next's App Router owns the URL, so the migration
must not quietly change the serialisation, the cold-load restore, or Back
walking the steps.

**Recorded, not acted on:** the probe above shows static export lifts the 404
constraint that forced the query string in the first place. Turning that into
real paths is **#24's** work, not this spec's.

**Acceptance:** `src/utils/urlState.test.ts` passes unchanged except for its
import extension; and a manual walk confirms `/?c=GBR&g=3` cold-loads onto the
result screen and browser Back returns to step 03, at the deployed base path.

### R10. [ ] Every existing test still runs, and the ones that read build paths are repointed

The suite is the evidence base for 0010, 0012, 0015, 0016 and 0017 and none of it
may be dropped to make the migration pass. `computed.test.jsx` injects the real
stylesheet and `tokens.test.js` reads it, so both follow the CSS to its new
path; `scripts/desktop-measure.mjs` (0012 R6) defaults to `localhost:5173` and
must take Next's dev port. Vitest is configured per the probed guide.

**Acceptance:** `npm test` runs the same **number** of test files as on `main`
(counted before and after, both numbers recorded here) with 0 failures; and
`npm run test:app`, `npm run test:pipeline`, `npm run test:hooks` are untouched
and green.

### R11. [ ] The data surface is identical before and after — same figures, same tiers, same vintages

The migration must not move a single published number. This is the project's
first rule and it outranks the migration: nothing is imputed, no country gains a
value it did not have, and `no series` still renders as an absence rather than a
number.

**Acceptance:** the result screen is captured for **GBR** (a country with a
series) and **NZL** (one without) before and after the migration, and the
extracted figures, tier badge strings and the absence sentence are **string-equal**
across the two builds. A diff of zero, published in the evaluation comment. Not
"the numbers look right" — the same strings.

### R12. [ ] The deployed page renders, at both viewports, with a clean console

CLAUDE.md: a green build is not evidence the page renders, and that applies with
full force to a whole-framework migration. The check is the **deployed** site,
not `next dev` — the base path, the `_next/` asset paths and the Pages artifact
shape are exactly what a local dev server does not exercise.

**Acceptance:** the deployed `https://apportico.github.io/who-gets-replaced-first/`
loads at **375×812** and **1440×900** with **zero console errors**; all four
wizard steps plus the result screen are walked at both widths; the methodology
page loads; and screenshots are committed to `.snapshots/0019/` and embedded in
the evaluation comment.

### R13. [ ] `npm run verify` is green

All ten steps, including the two that this spec rewires (`build`, `check:meta`)
and the one it extends (`typecheck`).

**Acceptance:** `bash scripts/verify.sh` exits 0 and prints `verify PASSED`,
with the full output pasted into the spec's evaluation section.

### R14. [ ] CLAUDE.md and the issues are corrected in the same change

CLAUDE.md names `@tailwindcss/vite`, `localhost:5173`, `vite preview` and
`dist/`; all four are wrong after this. Per CLAUDE.md's own rule, the file is
fixed in the same change rather than left to drift. Issue #23's stale scope
section — the 13 components, Leaflet, the scenario slider, the Jekyll gotcha —
is corrected on the issue with a comment pointing at this spec's probe table.

**Acceptance:** `grep -n "5173\|@tailwindcss/vite\|vite preview" CLAUDE.md`
returns nothing that is not an explicit historical note; the *Commands* block
lists the Next.js commands; and issue #23 carries a comment recording what its
body got wrong and why.

## Non-goals

- **Real routes per country (#24), per-country metadata (#25), per-route data
  (#26).** This spec makes all three possible and builds none of them. A
  migration that also rebuilds the URL contract cannot be reviewed against R11's
  byte-equality check, because two things would have moved at once.
- **Reopening 0010's "there is no router" decision.** The App Router is a build-
  time route table here, not a change to the wizard's internal-state steps.
- **The features static export forecloses** — request-reading route handlers,
  `cookies`, rewrites, redirects, headers, middleware/proxy, ISR, Server
  Actions, draft mode, intercepting routes, and the default `next/image` loader.
  Recorded in R1 as the accepted cost of Option A; #31 (payments) is where that
  decision gets reopened, if anywhere.
- **A `.nojekyll` file.** The probe shows this repo's Pages `build_type` is
  `workflow`, so Jekyll never runs and `_next/` is never stripped. R12 checks the
  outcome — the deployed page loading its assets — rather than the folk remedy.
- **Restoring the map.** Deleted by 0010 R1 and still deleted. It stays
  recoverable in git history.
- **Touching `pipeline/`.** The app adopts the pipeline's types; the pipeline
  keeps its zero runtime dependencies and its committed outputs unchanged.
