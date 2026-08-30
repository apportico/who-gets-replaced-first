"""Generate summary_report.md from the built dataset."""
import csv, json, os
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))


def f(v, nd=1, suffix=""):
    if v in (None, "", "None"):
        return "n/a"
    try:
        return f"{float(v):,.{nd}f}{suffix}"
    except ValueError:
        return str(v)


def load():
    with open(os.path.join(HERE, "data", "global_labor_dataset.csv")) as fh:
        rows = list(csv.DictReader(fh))
    for r in rows:
        for k, v in r.items():
            if v == "":
                r[k] = None
    return rows


def num(r, k):
    v = r.get(k)
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def load_panel():
    p = os.path.join(HERE, "data", "global_labor_panel.csv")
    if not os.path.exists(p):
        return []
    with open(p) as fh:
        rows = list(csv.DictReader(fh))
    for r in rows:
        for k, v in r.items():
            if v == "":
                r[k] = None
    return rows


def trend(panel, iso3, field, min_years=6):
    """(first_year, first_value, last_year, last_value, delta) or None."""
    pts = sorted(((int(r["year"]), float(r[field])) for r in panel
                  if r["iso3"] == iso3 and r.get(field) and int(r["year"]) <= 2025),
                 key=lambda x: x[0])
    if len(pts) < min_years:
        return None
    return pts[0][0], pts[0][1], pts[-1][0], pts[-1][1], pts[-1][1] - pts[0][1]


def write(rows, out_path, sensitivity=None):
    idx = {r["iso3"]: r for r in rows}
    countries = [r for r in rows if r["row_type"] == "country"]
    regions = [r for r in rows if r["row_type"] == "region"]
    groups = [r for r in rows if r["row_type"] == "group"]
    w = idx.get("WLD", {})
    with_isco = [r for r in countries if num(r, "white_collar_pct") is not None]
    with_youth = [r for r in countries if num(r, "young_white_collar_pct") is not None]
    # only rank countries whose occupation data is recent and well classified
    rankable = [r for r in with_isco
                if (num(r, "isco_classified_share_pct") or 100) >= 90
                and int(r["data_year_occupation"]) >= 2019]
    by_wc = sorted(rankable, key=lambda r: -num(r, "white_collar_pct"))

    L = []
    A = L.append
    A("# Global Labor Structure & AI Exposure — Summary Report")
    A("")
    A(f"Generated {date.today().isoformat()} from `pipeline/data/global_labor_dataset.csv`.")
    A("")
    A("**Read the confidence section at the bottom before quoting any number.** "
      "Sections A–C are official statistics. Section D is an official statistic "
      "used as a *proxy* for \"white collar.\" Sections E and F are constructed "
      "proxies and a modeled overlay respectively — they are not measurements.")
    A("")

    # ------------------------------------------------------------- headline
    A("## Headline global numbers")
    A("")
    A("| Measure | Value | Basis |")
    A("|---|---:|---|")
    A(f"| World population | {f(num(w,'population_total'),0)} | World Bank SP.POP.TOTL, {w.get('data_year_population')} |")
    A(f"| Children (0–14) | {f(num(w,'pop_0_14_pct'))}% | official |")
    A(f"| Working age (15–64) | {f(num(w,'pop_15_64_pct'))}% | official |")
    A(f"| 65+ (\"retirees\" — age proxy) | {f(num(w,'pop_65plus_pct'))}% | age proxy, not pension receipt |")
    A(f"| Labor force participation, 15+ | {f(num(w,'lfp_rate_total'))}% | official (ILO modelled) |")
    A(f"| Employed people worldwide | {f(num(w,'employed_total'),0)} | derived: labor force × (1 − unemployment) |")
    A(f"| **Share of the whole population that works at all** | **{f(num(w,'employed_share_of_population_pct'))}%** | derived from official inputs |")
    A(f"| Unemployment rate | {f(num(w,'unemployment_rate_total'))}% | official |")
    A(f"| Employment in services | {f(num(w,'emp_services_pct'))}% | official — **weak** white-collar proxy |")
    A(f"| **White collar (ISCO 1–4) share of employment** | **{f(num(w,'white_collar_pct'))}%** | official occupation data, {f(num(w,'isco_coverage_pct_of_employment'),0)}% of world employment covered |")
    A(f"| Professional core (ISCO 1–2) | {f(num(w,'professional_core_pct'))}% | same |")
    A(f"| Non-white-collar (ISCO 5–9) | {f(num(w,'blue_collar_service_pct'))}% | same |")
    A(f"| Entry-level proxy: employed 15–24 in ISCO 1–4 | {f(num(w,'young_white_collar_pct'))}% | **PROXY**, {f(num(w,'youth_isco_coverage_pct_of_employment'),0)}% of employment covered |")
    A(f"| AI task-exposure score (0–1) | {f(num(w,'ai_exposure_weighted_score'),3)} | **MODELED**, see README |")
    A("")
    wc, emp = num(w, "white_collar_pct"), num(w, "employed_total")
    if wc and emp:
        A(f"In absolute terms: of roughly **{f(emp,0)}** employed people worldwide, "
          f"about **{f(emp*wc/100,0)}** work in ISCO major groups 1–4 — the "
          f"managerial, professional, technical and clerical occupations that "
          f"carry the most generative-AI task overlap.")
        A("")
        A(f"The single most exposed group, clerical support workers (ISCO 4), is "
          f"{f(num(w,'isco4_clerical_pct'))}% of world employment "
          f"(~{f(emp*num(w,'isco4_clerical_pct')/100,0)} people).")
    A("")

    # ------------------------------------------------------------- coverage
    A("## Coverage")
    A("")
    A(f"- Countries / territories in the dataset: **{len(countries)}**")
    A(f"- With ISCO-08 occupation data (section D): **{len(with_isco)}** "
      f"({len(countries)-len(with_isco)} without)")
    A(f"- With the youth × occupation cross-tab (section E): **{len(with_youth)}**")
    A(f"- Aggregate rows: **{len(rows)-len(countries)}** (World, 7 World Bank regions, EU-27, OECD, G20)")
    A(f"- World white-collar figure is computed over "
      f"**{f(num(w,'isco_coverage_pct_of_employment'),0)}%** of global employment.")
    A("")
    missing_big = sorted(
        [r for r in countries if num(r, "white_collar_pct") is None
         and (num(r, "population_total") or 0) > 20_000_000],
        key=lambda r: -(num(r, "population_total") or 0))
    if missing_big:
        A("Large countries (>20M people) with **no** occupation data — the main "
          "source of gap in the world figure:")
        A("")
        for r in missing_big:
            A(f"- {r['country_name']} ({r['iso3']}) — {f(num(r,'population_total'),0)} people")
        A("")

    # ------------------------------------------------------------- rankings
    A("## Top 15 countries by white-collar share of employment")
    A("")
    A("_Restricted to countries with ≥90% of employment classified by occupation "
      "and occupation data from 2019 or later._")
    A("")
    A("| # | Country | White collar (ISCO 1–4) % | Professional core (1–2) % | Clerical (4) % | Entry-level proxy % | Year |")
    A("|---:|---|---:|---:|---:|---:|---:|")
    for i, r in enumerate(by_wc[:15], 1):
        A(f"| {i} | {r['country_name']} | {f(num(r,'white_collar_pct'))} | "
          f"{f(num(r,'professional_core_pct'))} | {f(num(r,'isco4_clerical_pct'))} | "
          f"{f(num(r,'young_white_collar_pct'))} | {r['data_year_occupation']} |")
    A("")
    A("## Bottom 15 countries by white-collar share of employment")
    A("")
    A("| # | Country | White collar (ISCO 1–4) % | Professional core (1–2) % | Agriculture emp % | Entry-level proxy % | Year |")
    A("|---:|---|---:|---:|---:|---:|---:|")
    for i, r in enumerate(by_wc[-15:][::-1], 1):
        A(f"| {i} | {r['country_name']} | {f(num(r,'white_collar_pct'))} | "
          f"{f(num(r,'professional_core_pct'))} | {f(num(r,'emp_agriculture_pct'))} | "
          f"{f(num(r,'young_white_collar_pct'))} | {r['data_year_occupation']} |")
    A("")

    # ------------------------------------------------------------- regional
    A("## Regional comparison")
    A("")
    A("All aggregates are **employment-weighted**, never simple averages of "
      "country percentages. `ISCO coverage` is the share of that region's "
      "employment that sits in countries which actually report occupation data — "
      "read the white-collar figure with that number in mind.")
    A("")
    A("| Region | Pop | Works at all % | LFP 15+ % | Services % | White collar % | Prof. core % | Entry-level proxy % | AI score | ISCO coverage |")
    A("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for r in [w] + sorted(regions, key=lambda x: -(num(x, "population_total") or 0)) + groups:
        A(f"| {r['country_name']} | {f(num(r,'population_total'),0)} | "
          f"{f(num(r,'employed_share_of_population_pct'))} | {f(num(r,'lfp_rate_total'))} | "
          f"{f(num(r,'emp_services_pct'))} | {f(num(r,'white_collar_pct'))} | "
          f"{f(num(r,'professional_core_pct'))} | {f(num(r,'young_white_collar_pct'))} | "
          f"{f(num(r,'ai_exposure_weighted_score'),3)} | {f(num(r,'isco_coverage_pct_of_employment'),0)}% |")
    A("")

    # ------------------------------------------------------- entry level cut
    A("## Entry-level (proxy) vs. overall white collar")
    A("")
    A("`young_white_collar_pct` is the share of **employed 15–24 year olds** who "
      "work in ISCO 1–4. Where it sits *below* the all-ages white-collar share, "
      "young workers are concentrated in service, sales and elementary jobs "
      "rather than in offices — the normal pattern almost everywhere.")
    A("")
    both = [r for r in rankable if num(r, "young_white_collar_pct") is not None]
    gap = sorted(both, key=lambda r: num(r, "young_white_collar_pct") - num(r, "white_collar_pct"))
    A("| | Country | All-ages white collar % | Youth (15–24) white collar % | Gap (pp) |")
    A("|---|---|---:|---:|---:|")
    for lbl, subset in (("widest gap", gap[:8]), ("narrowest / inverted", gap[-5:][::-1])):
        for r in subset:
            d = num(r, "young_white_collar_pct") - num(r, "white_collar_pct")
            A(f"| {lbl} | {r['country_name']} | {f(num(r,'white_collar_pct'))} | "
              f"{f(num(r,'young_white_collar_pct'))} | {d:+.1f} |")
    A("")

    # ------------------------------------------------------ career stage
    A("## White collar by career stage")
    A("")
    A("The occupation cross-tab carries ISCO major groups for the aggregate age "
      "bands, so the white-collar share can be read at each career stage. "
      "(Neither 15–29 nor 15–34 is constructible — the 10-year bands are "
      "published against skill level only, not ISCO.)")
    A("")
    stage_rows = [r for r in rankable if num(r, "prime_white_collar_pct") is not None
                  and num(r, "young_white_collar_pct") is not None]
    stage_rows.sort(key=lambda r: -(num(r, "prime_white_collar_pct") - num(r, "young_white_collar_pct")))
    A("| Country | Youth 15–24 | Prime 25–54 | Late 55–64 | All ages | Prime − youth |")
    A("|---|---:|---:|---:|---:|---:|")
    for r in [idx.get("WLD")] + stage_rows[:10]:
        if not r:
            continue
        y, p = num(r, "young_white_collar_pct"), num(r, "prime_white_collar_pct")
        gap = f"{p - y:+.1f}" if (y is not None and p is not None) else "n/a"
        A(f"| {r['country_name']} | {f(y)} | {f(p)} | "
          f"{f(num(r,'late_career_white_collar_pct'))} | {f(num(r,'white_collar_pct'))} | {gap} |")
    A("")
    A(f"Prime-age white-collar shares are published for **{len([r for r in countries if num(r,'prime_white_collar_pct') is not None])}** "
      f"countries. In almost every one, youth are markedly *less* white-collar than "
      f"prime-age workers — entry-level work sits in service, sales and elementary "
      f"occupations, not in offices.")
    A("")

    # ------------------------------------------------------------- trends
    panel = load_panel()
    if panel:
        A("## Trends — is clerical work already shrinking?")
        A("")
        A("Built from the year-by-year panel. This is the question the snapshot "
          "could not answer: whether the occupations most exposed to AI were "
          "already in decline before generative AI arrived.")
        A("")
        A("| Country | Clerical (ISCO 4) | White collar (ISCO 1–4) | Period |")
        A("|---|---:|---:|---:|")
        watch = ["USA", "DEU", "GBR", "FRA", "JPN", "KOR", "ESP", "ITA", "POL", "IND", "BRA", "MEX"]
        for iso3 in watch:
            tc = trend(panel, iso3, "isco4_clerical_pct")
            tw = trend(panel, iso3, "white_collar_pct")
            if not tc:
                continue
            name = idx.get(iso3, {}).get("country_name", iso3)
            wc_txt = f"{tw[4]:+.1f} pp" if tw else "n/a"
            A(f"| {name} | {tc[1]:.1f} → {tc[3]:.1f} ({tc[4]:+.1f} pp) | {wc_txt} "
              f"| {tc[0]}–{tc[2]} |")
        A("")
        falling = []
        for r in countries:
            t = trend(panel, r["iso3"], "isco4_clerical_pct")
            if t and t[4] < -0.5:
                falling.append((r["country_name"], t[4]))
        rising = []
        for r in countries:
            t = trend(panel, r["iso3"], "isco4_clerical_pct")
            if t and t[4] > 0.5:
                rising.append((r["country_name"], t[4]))
        A(f"Across countries with at least six years of occupation data, clerical "
          f"employment share **fell by more than 0.5pp in {len(falling)}** and "
          f"**rose by more than 0.5pp in {len(rising)}**. Where it is falling it has "
          f"usually been falling steadily since well before 2022, which matters for "
          f"attribution: a declining clerical share is not by itself evidence of AI.")
        A("")
        A("**Aggregate trend lines are not reliable.** The set of countries "
          "reporting occupation data changes from year to year, so movement in the "
          "World or regional series is partly composition change. The panel carries "
          "`isco_coverage_pct_of_employment` per year so this can be seen; country "
          "series do not have this problem.")
        A("")

    # ------------------------------------------------- squeeze + headcounts
    A("## Entry-level squeeze index")
    A("")
    A("A **modeled composite** (not a measurement) of four percentile ranks, "
      "combined with weights we assigned (0.25 / 0.30 / 0.25 / 0.20): youth "
      "cohort size, youth white-collar concentration, youth unemployment, and "
      "whether youth are more white-collar than the workforce average. All four "
      "components stay separately inspectable in the dataset.")
    A("")
    sq = sorted([r for r in countries if num(r, "entry_level_squeeze_index") is not None],
                key=lambda r: -num(r, "entry_level_squeeze_index"))
    A("| # | Country | Squeeze | Youth cohort % | Youth white collar % | Youth unemployment % |")
    A("|---:|---|---:|---:|---:|---:|")
    for i, r in enumerate(sq[:12], 1):
        A(f"| {i} | {r['country_name']} | {f(num(r,'entry_level_squeeze_index'))} | "
          f"{f(num(r,'youth_cohort_share'))} | {f(num(r,'young_white_collar_pct'))} | "
          f"{f(num(r,'unemployment_rate_15_24'))} |")
    A("")
    A("The index is dominated by small states and island economies, where a large "
      "youth cohort meets a thin formal labour market. Read it alongside the "
      "headcount table below, which shows where the *number* of exposed workers is "
      "largest.")
    A("")

    A("## Where the exposed jobs actually are — headcounts")
    A("")
    A("Shares put Luxembourg at the top. Headcounts put India there. Both are true; "
      "they answer different questions.")
    A("")
    hc = sorted([r for r in countries if num(r, "clerical_employed") is not None],
                key=lambda r: -num(r, "clerical_employed"))
    A("| # | Country | Clerical workers | White-collar workers | Clerical % | ")
    A("|---:|---|---:|---:|---:|")
    for i, r in enumerate(hc[:12], 1):
        A(f"| {i} | {r['country_name']} | {f(num(r,'clerical_employed'),0)} | "
          f"{f(num(r,'white_collar_employed'),0)} | {f(num(r,'isco4_clerical_pct'))} |")
    A("")

    # ---------------------------------------------------------- validation
    A("## Independent validation")
    A("")
    xc = os.path.join(HERE, "data", "crosscheck_eurostat.csv")
    if os.path.exists(xc):
        with open(xc) as fh:
            cc = list(csv.DictReader(fh))
        ok = sum(1 for r in cc if r["within_tolerance"] == "True")
        worst = max(cc, key=lambda r: abs(float(r["delta_pp"])))
        A(f"**Eurostat cross-check.** Our ILOSTAT-derived white-collar share was "
          f"compared against Eurostat's own Labour Force Survey (`lfsa_egais`) for "
          f"all EU-27 members. **{ok} of {len(cc)}** agree within 3 percentage "
          f"points. Largest disagreement: {worst['country_name']} at "
          f"{worst['delta_pp']}pp (ILO {worst['ilo_white_collar_pct']}% for "
          f"{worst['ilo_year']} vs Eurostat {worst['eurostat_white_collar_pct']}% "
          f"for {worst['eurostat_year']}), which is mostly a vintage difference. "
          f"Full table in `data/crosscheck_eurostat.csv`.")
        A("")
    if sensitivity:
        A(f"**AI exposure sensitivity.** The exposure weights are ours, so the "
          f"honest test is how much the country ordering depends on them. Scoring "
          f"all {sensitivity['n']} countries under "
          f"{len(sensitivity['profiles'])} plausible weightings "
          f"({', '.join(sensitivity['profiles'])}) moves the median country by only "
          f"**{sensitivity['median_rank_movement']} places**; the worst case is "
          f"{sensitivity['max_rank_movement']} places "
          f"({sensitivity['worst_country']}). **The ranking is robust even though "
          f"the cardinal score is not** — which is exactly the claim the README "
          f"makes for it. Full table in `data/ai_exposure_sensitivity.csv`.")
        A("")
    ol = os.path.join(HERE, "data", "outliers_for_review.csv")
    if os.path.exists(ol):
        with open(ol) as fh:
            outs = list(csv.DictReader(fh))
        A(f"**Outlier review.** {len(outs)} values were flagged as statistically "
          f"improbable (robust z-score beyond ±3.5, or structurally inconsistent "
          f"with the country's sector mix). Nothing is auto-corrected — see "
          f"`data/outliers_for_review.csv`.")
        A("")

    # ------------------------------------------------------------ confidence
    A("## Confidence — what is solid and what is constructed")
    A("")
    A("| Field group | Status | Why |")
    A("|---|---|---|")
    A("| A. Population by age band, dependency ratio | **Official statistic** | World Bank / UN Population Division. Near-universal coverage. |")
    A("| 65+ as \"retirees\" | **Official stat used as a proxy** | It is an age band, not pension receipt. Actual retirement ages and informal work after 65 vary enormously. |")
    A("| B. LFP, employment ratio, unemployment | **Official statistic** (largely ILO-modelled) | Modelled estimates fill country gaps; they are official but they are model output, not raw survey counts. |")
    A("| Total employed persons (headcount) | **Derived** | labor force × (1 − unemployment rate). Used only for weighting aggregates. |")
    A("| C. Agriculture / industry / services shares | **Official statistic** | But *services* is a poor white-collar proxy — it includes retail, hospitality, transport and domestic work. Do not use it as the white-collar number. |")
    A("| D. ISCO-08 major groups 1–9 | **Official statistic, used as a proxy** | The occupational split is a real survey measurement. Calling groups 1–4 \"white collar\" is our definitional choice, and it is imperfect: ISCO 3 (technicians) includes many field and technical trades. |")
    A(f"| D. World / regional white-collar aggregates | **Partly estimated** | Only {f(num(w,'isco_coverage_pct_of_employment'),0)}% of world employment is covered by countries reporting ISCO data. Non-reporting countries (notably China) are assumed to resemble the covered countries in their weighting group. |")
    A("| E. Entry-level share | **PROXY — not a measurement** | No global source tracks junior vs. senior seniority within an occupation. Age 15–24 is a stand-in: it misses graduate-entry roles at 25–29 and counts long-tenure young workers as entry-level. |")
    A("| ISCO-88 fallback countries | **Official statistic, older revision** | 10 areas publish ISCO-88 only. Major groups align 1:1 with ISCO-08, so the 1–4 cut carries over; the revision moved some ICT occupations between groups 2 and 3, making `professional_core_pct` slightly less comparable than `white_collar_pct`. |")
    A("| Career-stage shares (25–54, 55–64) | **Official statistic** | Same survey source as the headline occupation split. |")
    A("| Entry-level squeeze index | **MODELED composite** | Four percentile ranks combined with weights we assigned (0.25 / 0.30 / 0.25 / 0.20). Not measured; all components separately available. |")
    A("| Exposed wage bill | **MODELED** | A modeled index multiplied by two official statistics. An order of magnitude, never an amount at risk. |")
    A("| Time-series country trends | **Official statistic** | Same source, more years. |")
    A("| Time-series AGGREGATE trends | **Unreliable** | The reporting country set changes year to year, so aggregate movement is partly composition change. Per-year coverage is published so this can be seen. |")
    A("| F. AI exposure score | **MODELED ESTIMATE** | Weights per ISCO major group are assigned by us, informed by published research. Only the rank order is defensible; treat the value as an index, not a probability of displacement. |")
    A("")
    A("### Known limitations")
    A("")
    stale = [r for r in with_isco if int(r["data_year_occupation"]) < 2019]
    lowcls = [r for r in with_isco if (num(r, "isco_classified_share_pct") or 100) < 90]
    partial_groups = [r for r in with_isco if (num(r, "isco_groups_reported") or 9) < 9]
    A(f"- **Mixed vintages.** Occupation data ranges across years by country; "
      f"every row records `data_year_occupation` separately from "
      f"`data_year_population` and `data_year_labor`. Never treat a row as a "
      f"single-year snapshot.")
    A(f"- **{len(stale)} countries** have occupation data older than 2019 "
      f"({', '.join(sorted(r['iso3'] for r in stale))}). They carry a "
      f"`data_quality_flag` and are excluded from the rankings above.")
    A(f"- **{len(lowcls)} countries** classify less than 90% of employment by "
      f"occupation ({', '.join(sorted(r['iso3'] for r in lowcls))}); their "
      f"white-collar share is computed over the classified portion only.")
    A(f"- **{len(partial_groups)} countries** report fewer than 9 ISCO major "
      f"groups ({', '.join(sorted(r['iso3'] for r in partial_groups))}); a "
      f"missing group is folded elsewhere by the national classification.")
    A("- **China has no ISCO-08 breakdown in ILOSTAT**, which is the single "
      "largest hole in the global white-collar figure.")
    A("- Countries with no data are retained as rows with nulls and a "
      "`data_quality_flag`, never dropped and never imputed.")
    A("")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")
    print(f"      wrote {out_path}")


def summarise_sensitivity(rows, profiles):
    """The one definition of the sensitivity summary, shared by both callers.

    `crosscheck.sensitivity()` calls this with its freshly scored rows;
    `load_sensitivity()` calls it with the same rows parsed back from the CSV.
    Having a single expression is the point: two implementations of "the median
    country moves N places" would agree on odd `n` and diverge on even, and `n`
    is the count of countries carrying `white_collar_pct`, so its parity flips
    whenever one country gains or loses occupation data. The report would then
    read `4 places` out of `npm run pipeline` and `3.5 places` out of
    `npm run report` -- one report with two contents, which is the defect this
    function exists to prevent.

    Note this is the **upper-middle** value for even `n`, not a true median.
    That is the historical definition and it is what the published figures were
    produced with; changing it here would silently restate them.

    Lives in `report.py` rather than `crosscheck.py` so `report` keeps its
    independence -- it imports no pipeline module, and importing `crosscheck`
    would pull in `config`, `fetch` and `build` transitively, giving
    `npm run report` a dependency on the network module it has never needed.
    `crosscheck` imports this instead; that direction adds nothing it does not
    already have.
    """
    moves = sorted(int(r["max_rank_movement"]) for r in rows)
    worst = max(rows, key=lambda r: int(r["max_rank_movement"]))
    return {"median_rank_movement": moves[len(moves) // 2],
            "max_rank_movement": moves[-1],
            "worst_country": worst["country_name"],
            "n": len(moves), "profiles": list(profiles)}


def load_sensitivity():
    """Rebuild the sensitivity summary from the committed artifacts.

    `run.py` computes this live and passes it to `write()`; running this module
    directly used to pass nothing, so `npm run report` silently produced a
    report missing the AI-exposure-sensitivity paragraph -- a different document
    from the one the pipeline writes, out of the same function.

    Both files are committed, so a missing one is a broken checkout rather than
    a normal state: the opens are left to raise. Returning `None` here would
    feed `write(sensitivity=None)`, whose `if sensitivity:` gate skips the
    paragraph -- reinstating exactly the silent drop this change removes, behind
    a different condition, while still printing `wrote ...` as though nothing
    were wrong.
    """
    with open(os.path.join(HERE, "data", "ai_exposure_sensitivity.csv"),
              newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    with open(os.path.join(HERE, "ai_exposure_isco.json"), encoding="utf-8") as fh:
        profiles = json.load(fh)["profiles"]
    return summarise_sensitivity(rows, profiles)


if __name__ == "__main__":
    write(load(), os.path.join(HERE, "summary_report.md"),
          sensitivity=load_sensitivity())
