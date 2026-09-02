# 0019 — nextjs-typescript-migration

**Status:** in-progress
**Depends on:** 0007 (the pipeline's schema types, which the app adopts), 0010,
0012, 0015, 0016 (the wizard, the desktop layout, the meta contract and the URL
contract this migration must carry across unchanged)
**Issue:** [#23](https://github.com/apportico/who-gets-replaced-first/issues/23),
covering [#22](https://github.com/apportico/who-gets-replaced-first/issues/22)
**Approved:** `syymza`, round 8, on `4b28702` —
<https://github.com/apportico/who-gets-replaced-first/pull/95#pullrequestreview-5091792101>.
Seven rounds of revision; the three findings that mattered were R15's base-path
wiring, R17's hydration mismatch and R11's move from modules to functions.
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
| Browser globals in the app | `grep` over `src/` 2026-09-02 | Six non-test files touch `window`/`document`/`navigator`, and every one is guarded or inside a handler: `globalThis.navigator?.clipboard?`, `globalThis.document?.fonts?`, `document.createElement` inside a function body. Only `main.jsx` dereferences `document` at module scope, and the App Router replaces `main.jsx`. **Conclusion, corrected:** this means prerender does not *crash*. It does **not** mean the prerendered HTML matches the client render — see the next row, which is the case that matters |
| `WizardShell.jsx` boot state — the hydration case | `grep` + read 2026-09-02 | `WizardShell.jsx:56` computes `boot` in a **render-time `useMemo`** calling `decode(search(), rows)` (`search()` = `globalThis.location?.search`, `:41`) and `localeCountry(rows, globalThis.navigator?.language)` (`:62`), feeding `useState(boot.state)` at `:76`. Under `output: 'export'` the build has neither `location` nor `navigator`, so the prerendered HTML is **always the intro with the locale pre-fill unresolved**, while the first client render reads the real query string and language and produces different state. That is a hydration mismatch on every stateful URL. The `useMemo` is deliberate: 0016 R3 rejected restoring in an effect because it paints the intro and then corrects it. **R17 owns this**; it is invisible to R9's acceptance, because `urlState.js`'s header states the module is pure — "no DOM, no React, no `location`" |
| `useSearchParams` under static export | `WebFetch` 2026-09-02, docs v16.3.4 | Two behaviours, both load-bearing for R17. **(a)** "During production builds, a static page that calls `useSearchParams` from a Client Component **must** be wrapped in a `Suspense` boundary, otherwise the build fails with the *Missing Suspense boundary with useSearchParams* error" — so the boundary is not optional plumbing, it is a build gate. **(b)** "If a route is prerendered, calling `useSearchParams` will cause the Client Component tree **up to the closest `Suspense` boundary** to be client-side rendered" — so the prerendered HTML for that subtree is the *fallback*, and the boundary's placement decides how much of the page survives into the static HTML. Also: in `next dev` routes render on demand, so **this does not reproduce in development** |
| Build entry points | `cat vite.config.js` 2026-09-02 | **Two** HTML inputs, not one: `index.html` and `methodology.html` (0015 R2, a real page with a real URL). Both become App Router routes |
| The `verify` gate | `cat scripts/verify.sh` 2026-09-02 | **Ten** steps. Three carry build-shape assumptions the migration breaks: `build` is `vite build`; `check:meta` hardcodes `const DIST = 'dist'` and asserts over **built** files; `lint` runs `eslint.config.js` whose `globalIgnores(['**/dist', …])` and `files: ['**/*.{js,jsx}']` name neither `out/`, `.next/`, nor `.ts`/`.tsx` |
| `pipeline/schema.ts` | `grep '^export'` 2026-09-02 | Exports `Tier`, `FieldTier`, `Measured<T>`, `Vintage<T>`, the `Int` brand, `DatasetRow`, `TIERS`, `NOT_A_MEASUREMENT`, `isIntColumn`. These are the types #22 asks the app to adopt, and they already exist |
| `scripts/desktop-measure.mjs` (0012 R6) | `grep` 2026-09-02 | Line 38: `const URL_ = process.env.APP_URL \|\| 'http://localhost:5173/'` — a **Vite** default port, and the file's header comment tells the operator to pass `APP_URL` explicitly because Vite falls through to the next free port. R10 must repoint the default; the `APP_URL` override already exists, so nothing else in 0012's measurement contract moves. Requires `playwright-core` installed `--no-save` |
| Repo-wide `vite` / `dist` / `5173` references | `grep` over `*.md *.mjs *.yml *.js *.json *.sh`, excluding `node_modules`, `specs/`, `.snapshots/` 2026-09-02 | **Nine live references outside the specs**, all of which R14 or R8 must move: `package.json` ×5 (`dev`, `build`, `preview`, `@tailwindcss/vite`, `vite`), `eslint.config.js` ×2 (`globalIgnores(['**/dist', …])`, `reactRefresh.configs.vite`), `CLAUDE.md` ×3 (`@tailwindcss/vite` at :215, `localhost:5173` at :417, `vite preview` at :491). Historical mentions inside `specs/0006`, `0008`, `0011` and `0016` are **records of past probes and stay as they are** |
| The committed payloads R11 compares | `du -sh` + `git ls-files` 2026-09-02 | `src/data/global_labor.json` 600K, `global_labor_timeseries.json` 320K, `backtest.json` 76K, and `src/data/crosstabs/` — **218** per-country files, 1.7M. All are static JSON imported by the app; none is generated at app-build time. This is what makes R11's before/after string-equality check meaningful: the inputs are byte-identical across the migration by construction, so any moved figure is the migration's doing |

### The decision this spec had to settle first

**Option A — static export on GitHub Pages.** Every capability the open backlog
actually asks for is in the *Supported* column above: build-time Server
Components (#26), `generateStaticParams` (#24), the Metadata API (#25). Hosting
stays free and the deploy workflow changes in **two** places, not one — the
artifact path (`path: dist` → `path: ./out`) *and* the base-path wiring, which
this repo's `deploy.yml` does not currently carry at all. R15 owns both; the
second is the one whose absence would ship a green build and a 404ing site.

**Option B — server-hosted.** Buys request-time rendering, dynamic OG images and
ISR. Nothing in M1–M4 needs any of it. M5's #31 (payments) would, but payments
run through a hosted provider and that decision belongs to #31, not here.

**Chosen: Option A.** What it forecloses is recorded in R1 so a later issue
reopens it deliberately rather than discovering it.

## Requirements

### R1. [x] The hosting shape is static export, and what that forecloses is written down

`next.config.ts` sets `output: 'export'` and takes `basePath` from the
environment, following the official Pages template rather than hardcoding
`/who-gets-replaced-first/`. The spec records the *Unsupported* list from the
probe above as the accepted cost, so #31 or any future server-needing issue
reopens the decision explicitly.

This requirement produces **no numbers** and therefore carries no tier.

**Done (2026-09-02).** `grep -c "who-gets-replaced-first" next.config.ts` → `0`;
`out/index.html` and `out/_next/` both emitted by `next build`; the foreclosed
list is in the Non-goals.

**Acceptance:** `next.config.ts` contains `output: 'export'`; `npm run build`
creates `out/index.html` and an `out/_next/` directory; `grep -c "who-gets-replaced-first" next.config.ts`
returns `0` (the path comes from `PAGES_BASE_PATH`); and this spec's *Non-goals*
names the foreclosed features.

### R2. [~] The App Router replaces Vite, and both entry points become routes

`app/layout.tsx` carries what `index.html`'s `<head>` carries today. `app/page.tsx`
is the wizard; `app/methodology/page.tsx` is the second entry point 0015 R2
added. `main.jsx`, `index.html`, `methodology.html` and `vite.config.js` are
deleted; `@vitejs/plugin-react`, `vite` and `@tailwindcss/vite` leave
`package.json`. `npm run dev` becomes `next dev`, `npm run build` becomes
`next build`.

**`trailingSlash` is settled here as `false`, explicitly rather than by
default**, because R8 cannot be written until it is. At `false`, Next emits
`out/methodology.html` and GitHub Pages resolves both `/methodology` and
`/methodology.html` to it — so **0015's published `og:url` value,
`…/who-gets-replaced-first/methodology.html`, stays valid and unchanged**. At
`true` the file becomes `out/methodology/index.html`, the public URL becomes
`/methodology/`, and that `og:url` would point at a path the build no longer
emits — the exact defect 0015 R4 exists to catch, passing a check whose job is
to catch it.

**Metadata stays per-route**, not hoisted into the layout: the two pages carry
distinct `og:title`, `og:description` and `og:url` blocks today, so each keeps
its own `export const metadata`, with only the shared `og:type`/`og:site_name`
and the fonts in `app/layout.tsx`.

**Revised (2026-09-02) — two clauses were wrong, and the build is what showed it.**

1. **`out/index.html` carries no `<h1>`, and that is correct.** The wizard's
   `h1` lives in `IntroScreen`, which is inside R17's Suspense boundary, so it
   is client-rendered by construction. Requiring a prerendered `<h1>` on the
   index contradicts R17. `out/methodology.html` does carry one (`grep -c '<h1'`
   → `1`), because that page has no client island. The criterion now asks for a
   rendered `<h1>` on the **methodology** page and the prerendered **chrome** on
   the index, which is what R17's acceptance 3 checks in detail.
2. **`@vitejs/plugin-react` stays, as a devDependency.** The probed Next.js
   Vitest guide requires it for the test runner. It is no longer a build plugin
   — `vite` and `@tailwindcss/vite` are gone — so the intent of the clause holds
   while its literal grep does not.

Everything else passed as written: `git ls-files` returns nothing for the five
deleted paths, `trailingSlash: false` is set, and both routes prerender
(`Route (app)` lists `/` and `/methodology` as `○ (Static)`).

**Acceptance:** `git ls-files` returns nothing for `vite.config.js`,
`index.html`, `methodology.html`, `src/main.jsx`; `grep -rn "\"vite\"\|@vitejs/plugin-react\|@tailwindcss/vite" package.json`
is empty; `next.config.ts` sets `trailingSlash: false`; and **`out/index.html`
and `out/methodology.html`** both exist after a build and both contain a
rendered `<h1>`.

### R3. [x] Tailwind v4 moves to PostCSS, and the three font families still reach the browser

The `@tailwindcss/vite` plugin is replaced by `@tailwindcss/postcss` +
`postcss.config.mjs`. **The font trap from 0010 R2 must not regress**: Tailwind
v4's processing drops a bare `@import url(...)` silently, so the page shipped in
fallback stacks for two rounds with a clean build and a green suite.

**The fonts move to `next/font/google`.** Decided rather than inherited: the
`<link>` in the document head is what 0010 R2 fell back to when the `@import`
failed, but `next/font` self-hosts the three families at build time, so the
files are emitted into `_next/static/media/` and there is **no cross-origin
request to drop in the first place**. That eliminates the failure class instead
of re-checking it, and removes the two `preconnect`s and a render-blocking
request from the critical path. Instrument Serif needs
`style: ['normal', 'italic']` — italic is the emphasis device in the headline.

**The font check is on the emitted CSS, not on a directory listing.**
`ls out/_next/static/media/` has no pass condition: `next/font` specifies its
contract as `className`, `style.fontFamily` and `variable` and promises nothing
about filenames, which are build-generated hashes rather than family-named. Nor
is the expected count three — Instrument Serif at `style: ['normal', 'italic']`
is more than one file by itself, and subsetting moves the number again. The
built CSS is where the family names actually are.

**Done (2026-09-02), and the real build corrected our assumption about the
generated names.** The spec predicted `__Geist_<hash>` / `__Geist_Fallback_<hash>`.
The actual emitted descriptors are plain:

```
$ grep -o '@font-face{font-family:[^;]*' out/_next/static/chunks/*.css | sed 's/.*font-family://' | sort | uniq -c
  20 Geist
   1 Geist Fallback
  12 Geist Mono
   1 Geist Mono Fallback
   4 Instrument Serif
   1 Instrument Serif Fallback
```

**The substring hazard is real, with different strings than predicted:** `Geist`
is a substring of `Geist Mono`, so the exact-match clause is doing exactly the
work it was added for — just against `Geist` rather than `__Geist_<hash>`. The
anchoring-versus-literal argument is moot, because there is no hash in the name
to go stale. This is precisely why the requirement said to confirm from a real
build before freezing the pattern rather than taking either reviewer's word for
the shape.

Distinct non-fallback descriptors: **3** (`Geist`, `Geist Mono`,
`Instrument Serif`). A non-fallback `src` reads
`url(../media/fef07dbb0973bf53-s.3p2_lha1f2xer.woff2)format("woff2")` — self-hosted,
not `local(...)`. And the fallback face is exactly the defeater the review
predicted:
`@font-face{font-family:Geist Fallback;src:local(Arial);ascent-override:95.94%;…}`.
`grep -c 'fonts.googleapis.com'` → `0` on **both** built pages.

**Acceptance:** `postcss.config.mjs` names `@tailwindcss/postcss`; a built CSS
file under `out/_next/` contains the palette (`grep -rl -- '--accent' out/_next/`
is non-empty); for **each of the three families**, the built CSS carries an
`@font-face` block whose `font-family` matches the family **and is not the
adjusted metric fallback** — `next/font/google` emits *two* faces per family,
the real one and a `__<Family>_Fallback_<hash>` whose `src` is `local("Arial")`
with `ascent-override`/`size-adjust`, and that fallback block matches a naive
family-name grep and carries a `src:` all by itself. So the match must **exclude
names containing `_Fallback_`**, and its `src:` must reference an emitted
`/_next/static/media/` URL rather than `local(...)`. The second clause is the
one that actually separates *self-hosted* from *not*, which is the whole reason
R3 moves to `next/font`. Plus the `--font-*` variables `app/layout.tsx`
declares.

**The family match is anchored, not a substring, and the count is scoped to
`@font-face`.** `__Geist_<hash>` is a substring of `__Geist_Mono_<hash>`, so a
"Geist" match would be satisfied by Geist Mono's real face — and a build where
Geist Mono self-hosted and Geist did not would pass every clause above, for both
families. The two families whose names collide are exactly the two with no
end-to-end backstop, so this is where it matters most. Two clauses close it:

1. **Anchored, rather than a frozen hash.** `__Geist_` followed by hash
   characters **to the end of the value** does not match `__Geist_Mono_<hash>`,
   which separates the two without pinning one build's hash — so the check
   survives a version bump. A literal string copied from the build would also
   separate them, but it goes stale the first time the hash changes, which
   matters once this is a committed check rather than a one-off.
2. **The count is of the *distinct* `font-family` descriptor values inside
   `@font-face` blocks**, excluding fallback faces, and it must be **`3`**.
   Distinct, not a raw block count: `next/font/google` emits one real face per
   (family, style, subset), and R3 asks for Instrument Serif at
   `style: ['normal', 'italic']`, so the number of `@font-face` blocks is **4 or
   more** while the number of distinct family values is 3 — the same reason the
   paragraph above rejects a headcount of files. Counting "distinct
   `font-family` values in the built CSS" is not a property that can hold:
   `src/styles/index.css` carries **fourteen** `font-family` declarations of its
   own (`:193`, `:264`, `:304`, `:308`, `:313`, `:317`, `:321`, `:332`, `:342`,
   `:366`, `:377`, `:406`, `:418`, `:427`) resolving to the three tokens at
   `:66`–`:68`, and all fourteen survive this migration, because R3 changes how
   the families are **loaded**, not how they are **applied**. Scoped to
   `@font-face`, no partial build satisfies a count of 3. **Both generated strings — the real face and the fallback face — are
confirmed from one real build before the pattern is frozen**, rather than
guessed.

This grep is load-bearing beyond its size: R12's computed-style check backstops
**Instrument Serif only**, so Geist and Geist Mono have no end-to-end check
anywhere else in this spec and rest on this clause alone. Acceptance continues: **both** `out/index.html` **and** `out/methodology.html` contain **no**
`fonts.googleapis.com` reference — the methodology page carries its own
`preconnect` pair and its own font `<link>` today, so checking only the index
would pass while the cross-origin request this change exists to remove was still
being made; and the R12 browser walk confirms the rendered `h1` computes to
Instrument Serif rather than a fallback — measured on the page, since that is
the only place this defect has ever been visible.

### R4. [~] The `'use client'` boundary is drawn as tightly as the wizard allows

The wizard is interactive and becomes a Client Component. The boundary is placed
deliberately and documented in a comment: the route files stay Server Components
so #26 can later read the dataset at build time, and `'use client'` sits at the
wizard root rather than being sprinkled per file.

**Revised (2026-09-02): the grep gives a false positive on prose.** `app/page.tsx`
*discusses* the directive in a comment explaining why it is absent, so
`grep -rl "use client" app/` matches it. A directive is only a directive as the
**first line** of a module, so that is what the check reads:

```
app/layout.tsx                                 server/none
app/page.tsx                                   server/none
app/methodology/page.tsx                       server/none
src/components/wizard/WizardShell.tsx          DIRECTIVE
```

One island, at the wizard root, exactly as R17 requires. `next build` completed
with no Server Component error. (`src/components/ui/toggle.tsx` also carries it,
upstream from shadcn — it is inside the island either way.)

**Acceptance:** the **first line** of `app/layout.tsx`, `app/page.tsx` and
`app/methodology/page.tsx` is not `'use client'`, and the first line of
`WizardShell` is; `npm run build` completes with no "cannot be used in a Server
Component" error.

### R5. [ ] All 38 app files convert to TypeScript under `strict: true`

Every `.js`/`.jsx` under `src/` (and the new `app/`) becomes `.ts`/`.tsx`, with
a root `tsconfig.json` at `strict: true`. Where a type is genuinely unclear it
is modelled honestly; a conversion that lands on `any` buys nothing. `jsconfig.json`
is deleted, its `@/*` alias moving to `tsconfig.json`.

**The `any` check is mechanical, not a hand review.** `@typescript-eslint/no-explicit-any`
is configured as an **error**, so every escape must carry an
`eslint-disable-next-line` with its reason on the line above — which also leaves
the escapes greppable later, as a prose count does not. A hand-reviewed grep is
the criterion shape 0010 R14 and R15 both had to abandon, because it does not
survive a re-run.

**Acceptance:** `git ls-files 'src/**/*.js' 'src/**/*.jsx' 'app/**/*.js' 'app/**/*.jsx'`
returns **empty**; `tsconfig.json` has `"strict": true`; `npx tsc --noEmit -p tsconfig.json`
exits 0; `npx eslint .` exits 0 with `no-explicit-any` at `error`; and
`grep -rn "eslint-disable.*no-explicit-any" src/ app/` lists every escape, each
with a reason, and the list is reproduced here.

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

`scripts/check-meta.mjs` asserts over built files deliberately — the defect it
guards (a relative `og:image`, correct in source and a 404 in production) exists
only after a build. It carries **three** build-shape assumptions, not one:

1. `:19` `const DIST = 'dist'` — the output directory.
2. `:20` `const BASE = 'https://apportico.github.io/who-gets-replaced-first/'`,
   which every URL-valued `content` is prefix-checked against.
3. `:51` and `:87` a hardcoded page list, `['index.html', 'methodology.html']`,
   read by literal filename.

R2 settles `trailingSlash: false`, so the page list stays `index.html` and
`methodology.html` and **both `og:url` values are unchanged**. That is what makes
this a path edit rather than a contract change. (`readDist` already fails loudly
with `not emitted by the build` on a missing file, so a page silently dropping
out of the list is not a hole.)

`eslint.config.js` needs **four** edits, not two. The third is the one that turns
`verify` red without warning, and the fourth is the one a "three edits, all done"
reading drops — it is the only item here with no clause of its own in the
acceptance:

1. `:19` `globalIgnores(['**/dist', …])` gains `out` and `.next`.
2. `:21` `files: ['**/*.{js,jsx}']` gains `ts` and `tsx`.
3. `:52` `files: ['src/components/ui/**/*.jsx']` — the 0010 R3/R4 block that
   switches `react-refresh/only-export-components` **off** for the generated
   shadcn files. After R5 those three files are `.tsx`, the glob matches
   nothing, the rule comes back on, and lint **errors** on `toggle.tsx`,
   `toggle-group.tsx` and `accordion.tsx` for exporting `toggleVariants` beside
   the component. `CLAUDE.md` records that export as the seam R4 tells you to
   use, so re-enabling the rule is not the fix — the glob is.
4. `:25` `reactRefresh.configs.vite` → the plugin's `next` config. **This one
   needs its own clause, because the gate cannot catch it.** Verified in
   `node_modules/eslint-plugin-react-refresh/index.js`: the `vite` config sets
   `baseOptions: { allowConstantExport: true }`, which permits `export const
   metadata` and `export const dynamic`. So R2's per-route metadata exports
   would **not** trip `only-export-components` under the wrong config — leaving
   `.vite` in place is *silent*, not red, and `npx eslint .` passing proves
   nothing about it. It also currently falls between R8 and R14 rather than
   inside either: R14's acceptance greps `CLAUDE.md` only.

**Acceptance:** `npm run check:meta` passes against `out/` and **fails** when an
`og:image` is made relative (demonstrated, output pasted); it asserts the exact
`og:url` per page — `…/who-gets-replaced-first/` for `index.html` and
`…/who-gets-replaced-first/methodology.html` for the methodology page; and
`npx eslint .` reports **0 errors** with all three `src/components/ui/*.tsx`
files present, and lints zero files under `out/` or `.next/`; and
**`grep -c "configs.vite" eslint.config.js` returns `0`** — the same grep shape
R14 uses for `@tailwindcss/vite`, and the only thing that can catch edit 4.

### R9. [ ] The 0016 URL contract is carried across byte-identically

The wizard's state stays a query string on the existing path — `?step=result&country=GBR&group=3` —
exactly as 0016 R1 defines it. Next's App Router owns the URL, so the migration
must not quietly change the serialisation, the cold-load restore, or Back
walking the steps.

**Recorded, not acted on:** the probe above shows static export lifts the 404
constraint that forced the query string in the first place. Turning that into
real paths is **#24's** work, not this spec's.

**Acceptance:** `src/utils/urlState.test.ts` passes unchanged except for its
import extension; and a manual walk confirms `/?step=result&country=GBR&group=3` cold-loads onto the
result screen and browser Back returns to step 03, at the deployed base path.

### R10. [ ] Every existing test still runs, and the ones that read build paths are repointed

The suite is the evidence base for 0010, 0012, 0015, 0016 and 0017 and none of it
may be dropped to make the migration pass. `computed.test.jsx` injects the real
stylesheet and `tokens.test.js` reads it, so both follow the CSS to its new
path; `scripts/desktop-measure.mjs` (0012 R6) defaults to `localhost:5173` and
must take Next's dev port. Vitest is configured per the probed guide.

**The count is of test *cases*, by name — not of files.** A file that converts
but silently loses assertions still counts as one file, so a file count cannot
see the defect it is there to catch. This is the same shape as the null-mask
problem CLAUDE.md records for the pipeline: a count invariant to the thing being
counted for.

**Subset, not equality — deliberately.** Strict set equality would forbid this
PR from adding a single test case, and it should not: R11 layer 1 may well land
as a committed snapshot test rather than a throwaway script, and R17's hydration
check may reasonably leave one behind. Both would then fail this criterion on
the spec's own evidence. Subset keeps what R10 exists for, because a converted
file that silently drops assertions still **removes** a name from the set.

**Acceptance:** `npx vitest run --reporter=json` is captured on `main` and on
this branch; **`main`'s set of full test names is a subset of this branch's** —
no name may disappear — and **every addition is named and justified** in the
evaluation comment. Both sets and the diff are published there. 0 failures.
`npm run test:app`, `npm run test:pipeline` and `npm run test:hooks` are
untouched and green.

### R11. [ ] The data surface is identical before and after — same figures, same tiers, same vintages

The migration must not move a single published number. This is the project's
first rule and it outranks the migration: nothing is imputed, no country gains a
value it did not have, and `no series` still renders as an absence rather than a
number.

**The sweep is every country, not two.** The source table establishes why that
is nearly free: the payloads are byte-identical across the migration *by
construction*, and the figures are produced by pure functions in `src/utils/`.
So the full comparison is a unit-level snapshot, not 177 browser walks.

**Acceptance, in two layers:**

1. **All of them, through the functions that actually emit each thing.**
   Naming modules is not enough: `groupShare`/`groupHeadcount` return a state, a
   figure and a year and **no tier at all**. The tier, the absence sentence and
   the withholding sentence come from `termsFor` (`terms.js`), and the stand-in
   notice from `trendFor(...).standIn` (`trend.js`) — which is the one
   result-screen behaviour `CLAUDE.md` names outright, so a stand-in that stopped
   saying it is standing in would otherwise pass this acceptance. The snapshot
   therefore runs, over all **177** countries with a series and the **41**
   without, on `main` and on this branch:

   | Function | Module | What it contributes |
   |---|---|---|
   | `groupShare`, `groupHeadcount` | `groupFigures.js` | the figures and their years |
   | `termsFor` | `terms.js` | **the tier strings**, the absence sentence, the withholding sentence |
   | `trendFor` | `trend.js` | the series and **the stand-in flag and its wording** |
   | `seriesFor` | `laborPanel.js` | the sparkline series and its per-field years |
   | `classificationNotice` | `classification.js` | the ISCO-88 notice |
   | `noticeFor` | `urlState.js` | the dropped-parameter notice |

   The two outputs are **string-equal** — a diff of zero, published in the
   evaluation comment.
2. **Two of them, end to end.** The rendered result screen for **GBR** (has a
   series) and **NZL** (has none) is captured in a real browser before and
   after, confirming that what layer 1 proves about the functions also holds
   through the rendered DOM.

Not "the numbers look right" — the same strings.

### R12. [ ] The built output renders under the real base path, at both viewports

CLAUDE.md: a green build is not evidence the page renders, and that applies with
full force to a whole-framework migration. `next dev` is not the check either —
it serves from the root, so it exercises neither the base path nor the `_next/`
asset paths, which are the two things most likely to break.

**This is the pre-merge half, and it is deliberately not the deployed site.**
`deploy.yml` triggers on `push: branches: [main]`, so nothing reaches
`apportico.github.io` until this PR merges — a requirement whose acceptance
could only run after the merge it gates would sit `[ ]` at evaluation time and
block `/update-spec`. `workflow_dispatch` exists but would publish a feature
branch to the live production site, which is worse. So the pre-merge check
serves `out/` with a plain static server under the `/who-gets-replaced-first/`
prefix — which is what CLAUDE.md's gotcha section already prescribes for
debugging a production build, and what 0016 used for the same reason.

**Acceptance:** `out/` is served by a plain static server under the
`/who-gets-replaced-first/` prefix (**not** `next dev`, and not `vite preview`)
and loads at **375×812** and **1440×900** with **zero console errors**; all four
wizard steps plus the result screen are walked at both widths; the methodology
page loads; `/?step=result&country=GBR&group=3` cold-loads onto the result screen (R9); and
screenshots are committed to `.snapshots/0019/` and embedded in the evaluation
comment.

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

### R15. [ ] The deploy workflow publishes `out/`, with the base path actually wired

`.github/workflows/deploy.yml` uploads `path: dist`, and — the part that would
have shipped broken — it sets **no base path at all**. It has no `id:` on its
`configure-pages` step and no `env:` block, so R1's
`basePath: process.env.PAGES_BASE_PATH` would resolve to `undefined` in CI:
`basePath` unset, every `_next/` asset requested from the domain root, and a
project site that 404s its own JavaScript. The build stays green and the failure
appears only on the deployed page — the exact class of defect 0015 R4 and 0010
R2 were both written to catch.

The wiring is the official template's:

```yaml
- name: Setup Pages
  id: setup_pages
  uses: actions/configure-pages@v5
- run: npm run build
  env:
    PAGES_BASE_PATH: ${{ steps.setup_pages.outputs.base_path }}
```

**The `configure-pages` step must move above `npm run build`.** Today it runs
*after* it (`deploy.yml`: build at `:32`, `configure-pages` at `:34`). Adding an
`id` and an `env:` without reordering satisfies every naming clause while
`steps.setup_pages.outputs.base_path` — referenced before that step has run —
expands to the **empty string**. `basePath: ''` is Next's default, so the build
is green and the site 404s exactly as described above. A grep for a variable name
cannot tell a wired base path from an empty one, and an empty one is the failure
mode.

**Acceptance is on the outcome, not the variable name:** `deploy.yml` uploads
`./out`, and its `configure-pages` step appears **before** the build step
(asserted by line number, not by presence); and the built
`out/index.html` references **`/who-gets-replaced-first/_next/`**, not `/_next/`
— `grep -c 'href="/who-gets-replaced-first/_next/' out/index.html` is non-zero
and `grep -c '"/_next/' out/index.html` is **0**. Confirmed end to end by R16.

### R16. [ ] The deployed site renders — checked after the merge

The post-merge half of R12, and the last requirement to be marked. The Pages artifact shape and the base path
`configure-pages` actually emits are only observable once `deploy.yml` has run
on `main`, and that cannot happen before the merge.

**This requirement is marked after merge, not before it.** It is recorded here
so the check is owed rather than assumed, and so a failure reopens the spec
instead of going unnoticed. If it fails, the fix is a follow-up PR, not a
revert — the alternative is holding a merged migration open indefinitely.

**Acceptance:** after `deploy.yml` runs on `main`,
`https://apportico.github.io/who-gets-replaced-first/` loads at both viewports
with zero console errors, serves its `_next/` assets with **200**s (checked in
the network panel, since a stripped or misrouted asset is the failure mode this
exists for), and the methodology page resolves. The run URL and the result are
recorded on this requirement.

### R17. [x] The wizard's boot state survives prerendering, and the boundary is chosen rather than discovered

`WizardShell` reads `location.search` and `navigator.language` in a render-time
`useMemo` that feeds `useState`. Under static export the build has neither, so
the prerendered HTML is always the intro and the first client render disagrees
with it — a hydration mismatch on every URL that carries state, which React
reports as an error and recovers from by discarding the server HTML for that
subtree.

**This is the same shape as the two defects the repo already records** — the
`@import` Tailwind dropped, and the relative `og:image`. Correct in source,
green in the suite, wrong only in the built artifact. It is also invisible in
`next dev`, where routes render on demand (probed above), so only a check
against `out/` can see it.

**The chosen option is `useSearchParams()` under a `Suspense` boundary**, of the
three the review raised. The other two were rejected on recorded grounds:

| Option | Rejected because |
|---|---|
| Restore in `useEffect` | Paints the intro and then corrects it. **0016 R3 explicitly rejected this** — "a visible flash on every shared link". Taking it would need a `[~]` on 0016 R3, not a silent change |
| `next/dynamic` with `ssr: false` on the wizard | Gives up the prerendered HTML on `/` entirely, which is most of why this migration exists |

**The cost of the chosen option is recorded, not hidden:** the probe says the
client tree *up to the boundary* is client-rendered, so the boundary's placement
decides how much static HTML survives.

**The seam is the data seam, not the visual one.** "Below the sticky header" is
the wrong instruction, because the header is itself URL-derived:
`WizardShell.jsx:248` computes `const shown = Math.max(step, 1)` from
`state.step`, and both uses are **inside** the `<header>` (`:272`–`:322`) — the
`NN/04` counter at `:304` and the segment fill at `:316`. Placing the boundary
below the whole header therefore gives an impossible pair: either
`useSearchParams` is called above it, the closest boundary is effectively the
route root and *nothing* prerenders; or the chrome prerenders `01/04` with one
segment filled for **every** URL and hydration corrects it — the wrong step
painted and corrected, which is what this option was chosen to avoid.

So `WizardShell` splits on what depends on the URL:

| Above the boundary — prerendered | Below the boundary — client-rendered |
|---|---|
| The pulsing live dot | The `NN/04` counter (`:304`) |
| "The Replacement Date" | The segment **fills** (`:316`, `i <= shown`) |
| The `<header>` frame and the four segment **tracks** | The step body |

**The composition that delivers that table is one island with a static
fallback, not three sibling islands.** The table states an outcome, and two
shapes produce it:

| Shape | Verdict |
|---|---|
| **Three client islands as siblings** — `<Suspense><StepCounter/></Suspense>` and `<Suspense><SegmentFills/></Suspense>` inside a server `<header>`, `<Suspense><WizardBody/></Suspense>` outside it | **Rejected.** Three separate URL readers, and it breaks the single navigation seam `WizardShell`'s own header comment records for 0016 R10. It also walks into the `pushState` problem below |
| **One island, static fallback** — `<Suspense fallback={<WizardChrome/>}><WizardShell/></Suspense>` | **Chosen.** The probed row already says the prerendered HTML for the subtree *is the fallback*, so `WizardChrome` — dot, title, header frame, four tracks — is what lands in `out/index.html`. One seam, unchanged from 0016 R10 |

Passing the chrome as `children` into the client component is **not** a third
option: on a prerender the boundary emits its fallback for the whole subtree,
and server-rendered children in slots inside that subtree go with it.

**Why the chosen shape also disposes of the `pushState` question.** `WizardShell`
writes history itself — `:107` `pushState`, `:108` `replaceState`, with a
`popstate` listener at `:145` — rather than navigating through the router, and
`useSearchParams` tracks router state, not raw `history` calls. Under three
islands that is fatal: three readers that never see the wizard's own writes.
Under one island it is **moot**, because `useSearchParams` is read *once, at
mount, for `boot` only*; every later transition stays on today's `useState` +
`history` + `popstate` path, untouched. That is the argument for this shape over
the sibling one, and it is why no new probe is needed to choose it.

**There is no duplication to test, because it is extracted rather than
copied.** An earlier draft of this requirement said `WizardChrome` renders the
header a second time and closed the drift with a test asserting "the two produce
the same static markup". That test **cannot pass**, and it contradicts
acceptance 3: the real header always renders the `NN/04` counter (`:304`) and,
because `shown` is `Math.max(step, 1)` (`:248`), always fills at least one
segment (`:316`) — while `WizardChrome` must render neither. An implementer
taking it literally would copy the header, put `01/04` into `out/index.html`,
and produce exactly the failure signature acceptance 3 names.

So the static frame — the live dot, the title, the `<header>` element and the
four track *elements* — is **one component that both render**. `WizardChrome`
renders it alone; the real header renders it and adds the counter and the fill
state on top. Nothing is copied, so nothing can drift and no drift test is
owed.

**And the residue of the prerendered frame, recorded because it is real:**
`shown` is `Math.max(step, 1)` (`:248`), so at step 0 segment 1 is *already*
filled and the running app **never paints four unfilled tracks**. Acceptance 3's
prerendered state is therefore a frame the app itself never shows, corrected on
hydration. That is much milder than the wrong step painted and corrected — it is
one segment's worth of fill appearing, not a whole screen changing — and it is
the accepted price of a prerendered shell. It is written down here rather than
left to be discovered.

The tracks render unfilled above the seam; only their `background` is
step-derived, so the layout is static and the fill is not. There is no option
that prerenders the correct stateful screen, because the query string does not
exist at build time. **#24's real per-country paths are what remove the problem**
rather than trade against it, which is a further argument for this migration and
not against it.

**Done (2026-09-02), checked against `out/` exactly as written:**

1. `next build` **succeeded** — which is itself the proof the Suspense boundary
   exists, since the probe established that its absence is a build failure.
2. `grep -o 'The Replacement Date' out/index.html` → present. The chrome is in
   the prerendered HTML.
3. `grep -oE '0[0-9]/04' out/index.html` → **empty**. No `NN/04` counter in the
   static HTML, which is the failure signature acceptance 3 names for a seam cut
   in the wrong place. The seam is on the data boundary, as intended.

The base-path half, from R15: 31 references to `/who-gets-replaced-first/_next/`
in `out/index.html` and **0** bare `"/_next/`.

**Acceptance, against the built output** — a source-level test cannot see this,
which is the rule R3 already applies to the fonts:

1. `npm run build` succeeds — proving the Suspense boundary exists, since the
   probe shows its absence is a **build failure**, not a warning.
2. `out/index.html` is served by a plain static server under the
   `/who-gets-replaced-first/` prefix and loaded at
   `/?step=result&country=GBR&group=3`. The **result screen for GBR** renders,
   and the console carries **zero** errors and **zero** hydration warnings
   (`grep`-ed for `hydrat` case-insensitively, since React's wording varies).
3. The same URL loaded **with JavaScript disabled** shows the live dot, "The
   Replacement Date" and **four unfilled segment tracks** — proving the seam is
   not at the route root. It must show **no `NN/04` counter at all**; a counter
   reading `01/04` on a `?step=result` URL means the seam was cut above the
   step-derived chrome and the mismatch in (2) is only being masked by
   hydration finishing quickly.

## Implementation Plan

**Planned:** 2026-09-02

### Files to create

| Path | Purpose | Req |
|---|---|---|
| `next.config.ts` | `output: 'export'`, `basePath` from `PAGES_BASE_PATH`, `trailingSlash: false` | R1, R2 |
| `postcss.config.mjs` | `@tailwindcss/postcss` | R3 |
| `tsconfig.json` | `strict: true`, `@/*` → `./src/*` | R5, R7 |
| `app/layout.tsx` | What `index.html`'s `<head>` carried; `next/font/google` for the three families | R2, R3 |
| `app/page.tsx` | Server route; `<Suspense fallback={<WizardChrome/>}>` around the one client island | R2, R4, R17 |
| `app/methodology/page.tsx` | The second entry point, with its own `metadata` | R2, R8 |
| `src/components/wizard/WizardFrame.tsx` | The static frame both the chrome and the real header render — dot, title, `<header>`, four track elements | R17 |
| `src/components/wizard/WizardChrome.tsx` | The Suspense fallback: `WizardFrame` alone | R17 |
| `test/types/app.types.ts` | `@ts-expect-error` cases that must fail if the schema types stop rejecting | R6 |
| `scripts/data-surface.mjs` | The 218-country snapshot through the tier/absence-emitting functions | R11 |

### Files to modify

`package.json` (scripts, deps) · `eslint.config.js` (four edits) · `scripts/verify.sh` (build, typecheck) ·
`scripts/check-meta.mjs` (three assumptions) · `scripts/desktop-measure.mjs` (port) ·
`.github/workflows/deploy.yml` (artifact path, base-path wiring, step reorder) · `vitest.config.js` ·
`CLAUDE.md` · all 38 `src/**` files → `.ts`/`.tsx`

### Files to delete

`vite.config.js`, `index.html`, `methodology.html`, `src/main.jsx`, `jsconfig.json`

### Sequence

1. **Scaffold** — `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `app/`. (R1, R2, R3)
2. **The boundary** — `WizardFrame`, `WizardChrome`, the Suspense wiring, `WizardShell` reading `useSearchParams` once at mount. (R4, R17)
3. **Convert** — all 38 files to `.ts`/`.tsx`, adopting `pipeline/schema.ts`. (R5, R6)
4. **The gates** — `typecheck`, eslint's four edits, `check-meta`, `verify.sh`. (R7, R8, R13)
5. **The evidence** — `data-surface.mjs` on `main` and here; the vitest name sets. (R10, R11)
6. **Deploy and docs** — `deploy.yml`, `CLAUDE.md`, issue #23. (R14, R15)
7. **The browser** — `out/` under a static server, both viewports. (R12) · **R16 after merge.**

### Requirement mapping

Every requirement's acceptance is stated in the requirement itself; this maps each to where the work lands.

| Req | Where |
|---|---|
| R1, R2 | `next.config.ts`, `app/`, deletions |
| R3 | `postcss.config.mjs`, `app/layout.tsx` |
| R4, R17 | `app/page.tsx`, `WizardFrame.tsx`, `WizardChrome.tsx`, `WizardShell.tsx` |
| R5, R6 | all of `src/`, `tsconfig.json`, `test/types/app.types.ts` |
| R7, R8, R13 | `package.json`, `eslint.config.js`, `scripts/check-meta.mjs`, `scripts/verify.sh` |
| R9, R10 | `src/utils/urlState.ts`, `vitest.config.js`, `scripts/desktop-measure.mjs` |
| R11 | `scripts/data-surface.mjs` |
| R12, R16 | the browser walk; R16 is post-merge |
| R14, R15 | `CLAUDE.md`, `.github/workflows/deploy.yml`, issue #23 |

### Tier and vintage handling

**This spec produces no new numbers, so it assigns no tiers.** Tiers continue to
come from the payload's `field_tiers` block via `termsFor`; R6 makes that block's
shape checked at compile time and invents nothing, and there is still no default
tier. R11 is the guard that the migration moves no figure, tier string, per-field
year, absence sentence or stand-in notice — string equality over all 218
countries.

### Validation

The pipeline is untouched, so `[validate]`, `[crosscheck]` and `[outliers]` are
unaffected and the four anchors cannot move. The new checks are R11's snapshot
diff, R10's test-name subset, and R8's demonstrated `check:meta` failure.

### Risks

- **R17's composition is the one that could still surprise**, because the
  fallback's exact static output is only observable from a real build. If the
  chrome does not survive into `out/index.html`, R17 goes `[~]` with what was
  found rather than `[x]`.
- **R5 under `strict: true` across 38 files** is the largest single step; if a
  type is genuinely unmodellable it gets a documented `eslint-disable-next-line`
  rather than a silent `any`.
- **R12 and R16 are the only browser checks**, and R16 cannot run before merge.

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
