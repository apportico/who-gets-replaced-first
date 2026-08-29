#!/usr/bin/env python3
"""Global labor / AI-exposure dataset pipeline.

    python3 pipeline/run.py --pilot     # 6-row validation batch
    python3 pipeline/run.py             # full run, all countries + aggregates

Raw API responses are cached under pipeline/raw/, so re-runs are offline
and free. Delete a cached file to force a refresh of that source.
"""
import argparse, csv, json, os, sqlite3, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C
import build as B
import fetch
import panel as P
import crosscheck as X

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
APP_DATA = os.path.join(os.path.dirname(HERE), "src", "data")

COLUMNS = [
    # identity
    "iso3", "country_name", "region", "income_group", "row_type", "capital",
    "lat", "lon", "member_count",
    # A. population structure
    "population_total", "pop_0_14_pct", "pop_15_64_pct", "pop_65plus_pct",
    "age_dependency_ratio",
    # B. labor force / employment
    "lfp_rate_total", "lfp_rate_15_24", "lfp_rate_15_24_ilo", "lfp_rate_25_54",
    "lfp_rate_55_64", "emp_to_pop_ratio_15plus", "youth_employment_rate_15_24",
    "unemployment_rate_total", "unemployment_rate_15_24",
    "labor_force_total", "employed_total", "employed_total_source",
    "employed_share_of_population_pct",
    # C. broad sector
    "emp_agriculture_pct", "emp_industry_pct", "emp_services_pct",
    # D. ISCO-08 occupation
    "isco1_managers_pct", "isco2_professionals_pct", "isco3_technicians_pct",
    "isco4_clerical_pct", "isco5_service_sales_pct", "isco6_agricultural_pct",
    "isco7_craft_pct", "isco8_operators_pct", "isco9_elementary_pct",
    "isco_unclassified_pct", "isco_armed_forces_thousands", "isco_groups_reported", "isco_classified_share_pct",
    "isco_classification",
    "isco_source_employed_thousands",
    "white_collar_pct", "professional_core_pct", "blue_collar_service_pct",
    "white_collar_employed", "professional_core_employed",
    "clerical_employed", "professionals_employed",
    # E. entry-level proxy
    "young_white_collar_pct", "prime_white_collar_pct", "late_career_white_collar_pct",
    "youth_age_band_used", "entry_level_data_quality",
    "young_employed_total", "young_white_collar_employed",
    "youth_cohort_share", "youth_wc_gap", "entry_level_squeeze_index",
    "squeeze_components_present",
    # C2. context joins
    "gdp_per_capita_ppp", "population_15_24", "labor_force_advanced_edu_pct",
    "service_exports_usd", "ict_service_exports_pct", "ict_service_exports_usd",
    # F. modeled overlay
    "ai_exposure_weighted_score", "exposed_wage_bill_ppp",
    # provenance
    "data_year_population", "data_year_labor", "data_year_sector",
    "data_year_occupation", "data_year_youth_occupation", "data_year_lfp_age",
    "data_year_context", "prime_white_collar_year", "late_career_white_collar_year",
    "data_source_override",
    "data_year_population_range", "data_year_labor_range",
    "data_year_sector_range", "data_year_occupation_range",
    "data_year_youth_occupation_range",
    "isco_coverage_pct_of_employment", "youth_isco_coverage_pct_of_employment",
    "data_quality_flag",
]

REGRESSION_CHECKS = [
    ("WLD", "emp_services_pct", 50.0, 4.0, "World services employment ~50%"),
    ("USA", "emp_services_pct", 79.0, 4.0, "US services employment ~79%"),
    ("EU27", "emp_services_pct", 72.0, 4.0, "EU-27 services employment ~72%"),
    ("IND", "emp_services_pct", 31.5, 4.0, "India services employment ~31.5%"),
]


def load_weights():
    with open(os.path.join(HERE, "ai_exposure_isco.json")) as f:
        return json.load(f)["weights"]


def load_profiles():
    with open(os.path.join(HERE, "ai_exposure_isco.json")) as f:
        return json.load(f).get("profiles", {})


def run(scope=None, label="full"):
    print(f"\n=== Global labor pipeline ({label}) ===\n")
    weights = load_weights()

    print("[1/7] country reference table")
    ref, _ = B.build_reference(scope)
    rows = {iso3: dict(meta, row_type="country") for iso3, meta in ref.items()}
    print(f"      {len(rows)} areas in scope")

    print("[2/7] World Bank indicators (sections A-C)")
    B.load_worldbank(rows)

    print("[3/7] ILOSTAT employment by occupation (section D)")
    B.load_occupation(rows)

    print("[4/7] ILOSTAT youth x occupation cross-tab (section E)")
    B.load_youth_occupation(rows)

    print("[5/7] ILOSTAT labour force participation by age band")
    B.load_lfp_by_age(rows)

    print("[6/9] derived fields + modeled AI exposure (section F)")
    B.derive(rows, weights)
    B.squeeze_index(rows)

    print("[7/9] manual overrides (R3)")
    B.apply_overrides(rows, os.path.join(HERE, "manual_overrides.json"))
    for r in rows.values():
        r["data_quality_flag"] = B.quality_flag(r)

    print("[8/9] aggregates")
    out = list(rows.values())
    countries = [r for r in out if r["row_type"] == "country"]
    aggs = []
    if scope is None or "WLD" in (scope or []):
        aggs.append(B.make_aggregate("WLD", "World", countries, "world"))
    if scope is None:
        for code, name in C.WB_REGIONS.items():
            members = [r for r in countries if r["region"] == name]
            if members:
                aggs.append(B.make_aggregate(code, name, members, "region"))
        for code, name, iso_list in (("EU27", "European Union (27)", C.EU27),
                                     ("OECD", "OECD members", C.OECD),
                                     ("G20", "G20 members", C.G20)):
            members = [rows[i] for i in iso_list if i in rows]
            aggs.append(B.make_aggregate(code, name, members, "group"))
    else:
        for code, name, iso_list in (("EU27", "European Union (27)", C.EU27),):
            members = [rows[i] for i in iso_list if i in rows]
            if members:
                aggs.append(B.make_aggregate(code, name, members, "group"))
    out += aggs
    print(f"      {len(aggs)} aggregate rows")
    print("[9/9] validation + outlier review")

    problems = B.validate(out)
    print(f"\n[validate] {len(problems)} range/consistency problems")
    for p in problems[:15]:
        print(f"      ! {p}")
    if len(problems) > 15:
        print(f"      ... and {len(problems) - 15} more")

    outliers = B.find_outliers(out)
    print(f"[outliers] {len(outliers)} values flagged for manual review")
    for o in outliers[:8]:
        print(f"      ? {o['iso3']} {o['field']}={o['value']} — {o['reason']}")
    if len(outliers) > 8:
        print(f"      ... and {len(outliers) - 8} more")

    idx = {r["iso3"]: r for r in out}
    print("\n[regression checks against known published figures]")
    for iso3, field, expect, tol, desc in REGRESSION_CHECKS:
        got = idx.get(iso3, {}).get(field)
        if got is None:
            print(f"      ?  {desc}: no value produced")
        else:
            ok = abs(got - expect) <= tol
            print(f"      {'PASS' if ok else 'FAIL'}  {desc}: got {got:.1f} "
                  f"(expected ~{expect}, tol +/-{tol})")
    return out, problems, outliers, ref


# ------------------------------------------------------------------ exports
def export_csv(rows, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        w.writeheader()
        for r in sorted(rows, key=lambda x: (x["row_type"] != "world",
                                             x["row_type"] == "country",
                                             x["iso3"])):
            w.writerow({k: r.get(k) for k in COLUMNS})
    print(f"      wrote {path} ({len(rows)} rows x {len(COLUMNS)} cols)")


def export_sqlite(rows, path):
    if os.path.exists(path):
        os.remove(path)
    con = sqlite3.connect(path)
    types = {"iso3": "TEXT", "country_name": "TEXT", "region": "TEXT",
             "income_group": "TEXT", "row_type": "TEXT", "capital": "TEXT",
             "employed_total_source": "TEXT", "entry_level_data_quality": "TEXT",
             "youth_age_band_used": "TEXT", "data_quality_flag": "TEXT"}
    cols = ", ".join(f'"{c}" {types.get(c, "REAL") if not c.endswith("_range") else "TEXT"}'
                     for c in COLUMNS)
    con.execute(f"CREATE TABLE global_labor ({cols}, PRIMARY KEY (iso3))")
    con.executemany(
        f"INSERT INTO global_labor VALUES ({','.join('?' * len(COLUMNS))})",
        [[r.get(c) for c in COLUMNS] for r in rows])
    con.execute("CREATE INDEX idx_region ON global_labor(region)")
    con.execute("CREATE INDEX idx_rowtype ON global_labor(row_type)")
    con.commit()
    con.close()
    print(f"      wrote {path}")


def export_panel_sqlite(panel, path):
    con = sqlite3.connect(path)
    con.execute("DROP TABLE IF EXISTS global_labor_panel")
    cols = ", ".join(
        f'"{c}" ' + ("TEXT" if c in ("iso3", "country_name", "region", "row_type",
                                     "isco_classification") else "REAL")
        for c in P.PANEL_FIELDS)
    con.execute(f"CREATE TABLE global_labor_panel ({cols})")
    con.executemany(
        f"INSERT INTO global_labor_panel VALUES ({','.join('?' * len(P.PANEL_FIELDS))})",
        [[r.get(c) for c in P.PANEL_FIELDS] for r in panel])
    con.execute("CREATE INDEX idx_panel ON global_labor_panel(iso3, year)")
    con.commit()
    con.close()
    print(f"      wrote panel table into {path}")


def export_app_json(rows, path):
    """Trimmed payload for the React map page."""
    keep = [c for c in COLUMNS if not c.endswith("_range")]
    payload = {
        "generated_from": "pipeline/run.py",
        "sources": {
            "population_labor_sector": "World Bank Open Data API v2",
            "occupation": "ILOSTAT SDMX DF_EMP_TEMP_SEX_OCU_NB",
            "youth_occupation": "ILOSTAT SDMX DF_EMP_TEMP_SEX_AGE_OCU_NB",
            "lfp_by_age": "ILOSTAT SDMX DF_EAP_DWAP_SEX_AGE_RT",
            "ai_exposure": "MODELED — pipeline/ai_exposure_isco.json",
        },
        "ai_exposure_weights": load_weights(),
        "rows": [{k: r.get(k) for k in keep} for r in rows],
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    print(f"      wrote {path} ({os.path.getsize(path):,} bytes)")


def console_summary(rows):
    countries = [r for r in rows if r["row_type"] == "country"]
    full = [r for r in countries if r.get("white_collar_pct") is not None]
    youth = [r for r in countries if r.get("young_white_collar_pct") is not None]
    world = next((r for r in rows if r["iso3"] == "WLD"), {})
    print("\n" + "=" * 62)
    print(f"countries/territories processed : {len(countries)}")
    print(f"  full ISCO occupation coverage : {len(full)}")
    print(f"  no ISCO occupation data       : {len(countries) - len(full)}")
    print(f"  youth x ISCO cross-tab        : {len(youth)}")
    print(f"aggregate rows                  : {len(rows) - len(countries)}")
    wc = world.get("white_collar_pct")
    print(f"\nGLOBAL white-collar share of employment (ISCO 1-4): "
          f"{wc:.1f}%" if wc else "\nGLOBAL white-collar share: n/a")
    if world.get("employed_share_of_population_pct"):
        print(f"GLOBAL share of total population that is employed : "
              f"{world['employed_share_of_population_pct']:.1f}%")
    if world.get("isco_coverage_pct_of_employment"):
        print(f"(computed over {world['isco_coverage_pct_of_employment']:.0f}% "
              f"of world employment — countries with ISCO data)")
    print("=" * 62)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pilot", action="store_true",
                    help="run the 6-area validation batch only")
    ap.add_argument("--no-app-json", action="store_true")
    args = ap.parse_args()

    if args.pilot:
        scope = set(C.PILOT) | set(C.EU27)
        rows, _, _, _ = run(scope, "pilot")
        rows = [r for r in rows if r["iso3"] in set(C.PILOT) | {"EU27", "WLD"}]
        export_csv(rows, os.path.join(DATA, "pilot_labor_dataset.csv"))
        console_summary(rows)
        print("\nPilot done. Inspect pipeline/data/pilot_labor_dataset.csv, "
              "then run without --pilot.")
        return

    rows, problems, outliers, ref = run(None, "full")
    print("\n[export]")
    export_csv(rows, os.path.join(DATA, "global_labor_dataset.csv"))
    export_sqlite(rows, os.path.join(DATA, "global_labor_dataset.sqlite"))
    if not args.no_app_json:
        export_app_json(rows, os.path.join(APP_DATA, "global_labor.json"))
    with open(os.path.join(DATA, "validation_report.txt"), "w") as f:
        f.write(f"{len(problems)} problems\n" + "\n".join(problems))
    if outliers:
        with open(os.path.join(DATA, "outliers_for_review.csv"), "w",
                  newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(outliers[0].keys()))
            w.writeheader()
            w.writerows(outliers)
        print(f"      wrote {os.path.join(DATA, 'outliers_for_review.csv')}")

    rows_by_iso = {r["iso3"]: r for r in rows}
    print("\n[crosscheck] Eurostat EU-27 occupation shares (R4)")
    X.eurostat_check(rows_by_iso, DATA)
    print("\n[sensitivity] AI exposure weight profiles (R12)")
    sens = X.sensitivity(rows_by_iso, load_profiles(), DATA)

    print("\n[panel] time series (R6)")
    panel_rows = P.build_panel(ref, load_weights())
    panel_aggs = P.panel_aggregates(panel_rows, ref)
    P.export(panel_rows, panel_aggs, DATA,
             os.path.join(APP_DATA, "global_labor_timeseries.json"))
    export_panel_sqlite(panel_rows + panel_aggs,
                        os.path.join(DATA, "global_labor_dataset.sqlite"))

    import report
    report.write(report.load(), os.path.join(HERE, "summary_report.md"),
                 sensitivity=sens)
    console_summary(rows)


if __name__ == "__main__":
    main()
