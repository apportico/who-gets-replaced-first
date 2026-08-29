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

## Layout

```
specs/            numbered specs — start here
pipeline/         Python data pipeline (stdlib only, no pip installs)
  run.py          orchestrator: --pilot for the 6-area batch, bare for the full run
  raw/            cached API responses, gitignored (~80MB)
  data/           CSV, SQLite, cross-checks, outlier queue
  README.md       every field, its source, its limitations
src/              React + Vite app (Leaflet map)
```

## The workflow

Project skills in `.claude/skills/` drive the spec loop. Use them rather than
improvising the steps:

```
/next             pick the next task off the GitHub board
/spec             probe the sources, write requirements, open a draft PR
/update-spec      approve; later, mark requirements [x] / [!] / [~]
/implement        approved spec -> plan mapped to requirement IDs
/evaluate         run the acceptance checks, verdict per requirement
/review-pr        review a PR against its spec
/address-reviews  fix, reply, resolve review threads
/status           where every spec stands
```

`/spec` will not let you write a requirement against a source it has not probed,
and `/update-spec` will not let a spec reach `done` while a requirement is still
`[ ]`. That is the point. See `.claude/skills/README.md`.

## Commands

```bash
npm run dev              # app at localhost:5173
npm run build            # production build (base path /who-gets-replaced-first/)
npm run pipeline:pilot   # 6-area validation batch, prints regression checks
npm run pipeline         # full run: 218 countries + 11 aggregates
npm run lint
```

The pipeline caches every API response under `pipeline/raw/`, so re-runs are
offline and free. Delete a cached file to force a refresh of that source.

## Verify before claiming

The pipeline has regression checks against independently published figures
(World services ≈50%, US ≈79%, EU-27 ≈72%, India ≈31.5%) and an Eurostat
cross-check of all 27 EU members. **Run them and read the output** before saying
a data change worked. `[validate]`, `[crosscheck]` and `[outliers]` blocks print
on every full run.

For UI changes, `npm run build` passing is not evidence the page renders — a
runtime error still builds clean. Load the page.

## Gotchas

- `vite preview` caches `index.html` in memory; it can serve a stale page and
  look like a blank-page bug. Serve `dist/` with a plain static server when
  debugging the production build.
- CARTO basemaps now require an API key and watermark every tile without one.
  This project uses Esri's key-free light gray canvas. Note Esri tiles are
  `{z}/{y}/{x}`, not `{z}/{x}/{y}`, and have no `{s}` or `{r}` tokens.
- `src/data/port_data.json` and `sanctions_regimes.json` are a **static
  snapshot** copied from the corridor-wars board for the R16 overlay. They do
  not track changes made there.
