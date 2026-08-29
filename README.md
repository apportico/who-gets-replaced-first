# Who Gets Replaced First

**[apportico.github.io/who-gets-replaced-first](https://apportico.github.io/who-gets-replaced-first/)**

An interactive map of global labour structure and occupational exposure to AI:
what share of each country's population works at all, and of those who work, how
many sit in the white-collar and entry-level occupations with the most
generative-AI task overlap.

218 countries and territories, 11 aggregate rows, a 2013–2025 time series, built
from World Bank and ILOSTAT data.

## What it shows

- **43.9%** of the world's population is employed at all.
- **26.0%** of those who work are in ISCO major groups 1–4 — managers,
  professionals, technicians, clerical support. That figure covers 77% of global
  employment; **China publishes no occupation breakdown at all**.
- Clerical support work — the group research consistently finds most exposed —
  is **~5%** of world employment.
- Youth are markedly *less* white-collar than prime-age workers almost
  everywhere: in the US, 37% against 64%.
- Clerical share **fell in 36 countries and rose in 30** over the panel period.
  Where it is falling it has usually been falling since well before 2022 — a
  declining clerical share is not by itself evidence of AI.

## What is measured and what is not

The dataset deliberately separates four kinds of number, and the interface shows
which is which on every metric:

| | |
|---|---|
| **OFFICIAL** | Published statistics — population, participation, employment by occupation |
| **DERIVED** | Arithmetic on those — headcounts, share of population employed |
| **PROXY** | Stand-ins for things no source measures globally — entry-level is age 15–24, because seniority is not tracked anywhere |
| **MODELED** | Our own exposure weighting — only the rank order is defensible |

Countries with no data are kept as rows of nulls with a quality flag. Nothing is
imputed or invented.

Full field documentation and limitations: [`pipeline/README.md`](pipeline/README.md).
Findings and confidence: [`pipeline/summary_report.md`](pipeline/summary_report.md).

## Development

This project is spec-driven — see [`specs/`](specs/) and [`CLAUDE.md`](CLAUDE.md).

```bash
npm install
npm run dev              # app
npm run pipeline:pilot   # validate the data pipeline end to end
npm run pipeline         # full run
```

## Sources

World Bank Open Data API · ILOSTAT SDMX · Eurostat (cross-validation).
All free, no authentication.
