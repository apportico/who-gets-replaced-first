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
    # H. 0010 R8/R9 — the per-group cross-tabs. Appended rather than slotted
    # beside section D so the 84 existing columns keep their positions and the
    # CSV diff stays readable. They reach global_labor_dataset.csv and the
    # SQLite like any other column; export_app_json sheds them (R20).
    *C.CROSSTAB_COLUMNS,
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

    print("[5b/7] ILOSTAT education x occupation cross-tab (0010 R9)")
    B.load_edu_occupation(rows)

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
    failures = []
    print("\n[regression checks against known published figures]")
    for iso3, field, expect, tol, desc in REGRESSION_CHECKS:
        got = idx.get(iso3, {}).get(field)
        if got is None:
            print(f"      ?  {desc}: no value produced")
            failures.append(f"{desc}: no value produced for {iso3}.{field}")
        else:
            ok = abs(got - expect) <= tol
            print(f"      {'PASS' if ok else 'FAIL'}  {desc}: got {got:.1f} "
                  f"(expected ~{expect}, tol +/-{tol})")
            if not ok:
                failures.append(f"{desc}: got {got:.1f}, expected "
                                f"~{expect} +/-{tol}")
    return out, problems, outliers, ref, failures


def report_status(problems, failures, label):
    """Print a verdict and return a process exit code.

    A moved regression anchor or a range/consistency problem fails the run.
    Outliers deliberately do NOT fail it — they are a standing review queue
    (4 on a healthy run), not a regression signal.
    """
    if failures:
        print(f"\n[FAIL] {len(failures)} regression anchor(s) moved:")
        for f in failures:
            print(f"      x {f}")
    if problems:
        print(f"\n[FAIL] {len(problems)} range/consistency problem(s) — "
              f"see the [validate] block above")
    if failures or problems:
        print(f"\n{label} FAILED. Published figures would change; "
              f"do not treat this run as good.")
        return 1
    print(f"\n{label} checks passed: "
          f"{len(REGRESSION_CHECKS)} anchors on target, 0 validation problems.")
    return 0


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
    """Trimmed payload for the wizard's first load.

    0010 R20. The 81 per-group cross-tab columns are excluded here and shipped
    per country instead: carrying them would take this file from 593 KB to
    ~1.2 MB, almost all of it describing the 217 countries the reader did not
    pick, on the spec whose first premise is mobile-first.

    ORDER MATTERS, and it is the whole reason this is written out rather than
    left to a comprehension. `keep` feeds three consumers, not two: the
    `untiered` gate below, the `field_tiers` block, and the row keys. That gate
    is the ENTIRE enforcement of "every emitted number carries a tier" inside
    the pipeline -- export_csv and export_sqlite have no tier check of their own.
    So it runs over the full column list FIRST, and the exclusion is applied
    only afterwards, where the payload is assembled. Excluding before the gate
    would ship 81 unregistered numbers in the CSV and the SQLite.
    """
    keep = [c for c in COLUMNS if not c.endswith("_range")]
    untiered = [c for c in keep if c not in C.FIELD_TIERS]
    if untiered:
        raise KeyError(
            f"columns with no tier in config.FIELD_TIERS: {untiered}. "
            "Every emitted number carries a tier (CLAUDE.md); add these to the "
            "registry, using NOT_A_MEASUREMENT for identity/provenance fields.")
    # -- the exclusion, after the gate above has seen every column
    app_keep = [c for c in keep if c not in set(C.CROSSTAB_COLUMNS)]
    payload = {
        "generated_from": "pipeline/run.py",
        # 0004 R3. Per-field tier, so the app can label every number it renders
        # rather than relying on prose the reader has to go and find. Filtered
        # to `keep`, not the whole registry: the payload must not claim coverage
        # of the five *_range columns it drops.
        "field_tiers": {c: C.FIELD_TIERS[c] for c in app_keep},
        "sources": {
            "population_labor_sector": "World Bank Open Data API v2",
            "occupation": "ILOSTAT SDMX DF_EMP_TEMP_SEX_OCU_NB",
            "youth_occupation": "ILOSTAT SDMX DF_EMP_TEMP_SEX_AGE_OCU_NB",
            "lfp_by_age": "ILOSTAT SDMX DF_EAP_DWAP_SEX_AGE_RT",
            "ai_exposure": "MODELED — pipeline/ai_exposure_isco.json",
        },
        "ai_exposure_weights": load_weights(),
        "rows": [{k: r.get(k) for k in app_keep} for r in rows],
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    print(f"      wrote {path} ({os.path.getsize(path):,} bytes)")


def export_crosstabs(rows, dirpath):
    """0010 R20. One artefact per country, fetched after step 01.

    One file per country and not one combined file: a single artefact would
    still carry ~575 KB of which about 2.5 KB is the country the reader picked,
    which defers the download to the step 01 -> step 02 transition rather than
    removing it -- and delivers it at the worst moment, mid-wizard.

    Each file carries its own tier block. Every emitted number still carries a
    tier; the block it appears in is this artefact's rather than
    global_labor.json's, which is what R8 and R9 mean by "the cross-tab
    artefact's own tier block".
    """
    os.makedirs(dirpath, exist_ok=True)
    written = 0
    for r in rows:
        if r.get("row_type") != "country":
            continue
        values = {c: r.get(c) for c in C.CROSSTAB_COLUMNS}
        # A country with nothing at all still gets a file. The wizard has to be
        # able to tell "the source publishes nothing here" from "the fetch
        # failed", and a 404 cannot say the first one (R20).
        payload = {
            "generated_from": "pipeline/run.py",
            "iso3": r["iso3"],
            "country_name": r.get("country_name"),
            # Deliberately NOT isco_classification. That field records the
            # family the OCCUPATION flow chose for this country, and the age and
            # education loaders resolve their own family per group against a
            # different flow -- so copying it here would label these numbers
            # with a classification they may not have come from. The app reads
            # it from the main payload for R18's notice, which is about the
            # occupation share, so nothing needs it here.
            "field_tiers": {c: C.FIELD_TIERS[c] for c in C.CROSSTAB_COLUMNS},
            "values": values,
        }
        with open(os.path.join(dirpath, f"{r['iso3']}.json"), "w",
                  encoding="utf-8") as f:
            json.dump(payload, f, separators=(",", ":"))
        written += 1
    print(f"      wrote {written} per-country cross-tab files to {dirpath}")


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


# ------------------------------------------------------------ 0004 R7. pilot
# Extracted out of main() so the golden-master test drives exactly what
# `--pilot` drives. Inlined, the test would carry its own copy of the scope and
# the filter, and the two would drift apart the first time either changed --
# leaving a golden master that proved something nobody was running.

def pilot_scope():
    """Areas the pilot FETCHES: 32, not the 6 in C.PILOT.

    EU27 is a weighted aggregate over all 27 members, so producing that output
    row requires every member's data. The "6-area batch" in the CLI help and in
    CLAUDE.md describes the seven output rows, not this.
    """
    return set(C.PILOT) | set(C.EU27)


def pilot_rows(rows):
    """The 7 rows the pilot WRITES: C.PILOT plus the EU27 and WLD aggregates."""
    keep = set(C.PILOT) | {"EU27", "WLD"}
    return [r for r in rows if r["iso3"] in keep]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pilot", action="store_true",
                    help="run the 6-area validation batch only")
    ap.add_argument("--no-app-json", action="store_true")
    ap.add_argument("--out-dir", default=None,
                    help="write pilot output here instead of pipeline/data/. "
                         "Verification uses this so checking the pipeline does "
                         "not rewrite a tracked artifact.")
    args = ap.parse_args()

    if args.pilot:
        rows, problems, _, _, failures = run(pilot_scope(), "pilot")
        rows = pilot_rows(rows)
        out_dir = args.out_dir or DATA
        out_path = os.path.join(out_dir, "pilot_labor_dataset.csv")
        export_csv(rows, out_path)
        console_summary(rows)
        print(f"\nPilot done. Inspect {out_path}, then run without --pilot.")
        return report_status(problems, failures, "Pilot")

    rows, problems, outliers, ref, failures = run(None, "full")
    print("\n[export]")
    export_csv(rows, os.path.join(DATA, "global_labor_dataset.csv"))
    export_sqlite(rows, os.path.join(DATA, "global_labor_dataset.sqlite"))
    if not args.no_app_json:
        export_app_json(rows, os.path.join(APP_DATA, "global_labor.json"))
        export_crosstabs(rows, os.path.join(APP_DATA, "crosstabs"))
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
    return report_status(problems, failures, "Full run")


if __name__ == "__main__":
    sys.exit(main())
