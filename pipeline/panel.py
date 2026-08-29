"""R6. Build the year-by-year panel from the same cached sources as the snapshot.

The snapshot picks one year per field and throws the rest away. The raw cache
already holds World Bank 2010-2026 and ILOSTAT 2013-2025, so the panel costs no
extra API calls -- it just stops discarding.
"""
import csv, json, os
from collections import defaultdict

import config as C
import fetch
import build as B

PANEL_FIELDS = [
    "iso3", "country_name", "region", "row_type", "year",
    "population_total", "pop_0_14_pct", "pop_15_64_pct", "pop_65plus_pct",
    "lfp_rate_total", "unemployment_rate_total", "unemployment_rate_15_24",
    "labor_force_total", "employed_total", "employed_share_of_population_pct",
    "emp_agriculture_pct", "emp_industry_pct", "emp_services_pct",
    "isco1_managers_pct", "isco2_professionals_pct", "isco3_technicians_pct",
    "isco4_clerical_pct", "isco5_service_sales_pct", "isco6_agricultural_pct",
    "isco7_craft_pct", "isco8_operators_pct", "isco9_elementary_pct",
    "white_collar_pct", "professional_core_pct", "blue_collar_service_pct",
    "young_white_collar_pct", "ai_exposure_weighted_score",
    "clerical_employed", "white_collar_employed",
    "isco_classification", "isco_groups_reported",
    "isco_coverage_pct_of_employment", "member_count",
]

# fields the app's scrubber and sparklines actually need
APP_PANEL_FIELDS = [
    "iso3", "year", "white_collar_pct", "professional_core_pct",
    "isco4_clerical_pct", "young_white_collar_pct", "emp_services_pct",
    "lfp_rate_total", "unemployment_rate_15_24", "employed_total",
    "employed_share_of_population_pct", "ai_exposure_weighted_score",
    "clerical_employed", "white_collar_employed", "population_total",
    "isco_coverage_pct_of_employment",
]

WB_PANEL_MAP = {code: field for code, (field, _) in C.WB_INDICATORS.items()}


def _wb_series():
    """iso3 -> year -> {field: value} for every cached World Bank indicator."""
    series = defaultdict(lambda: defaultdict(dict))
    for code, field in WB_PANEL_MAP.items():
        for obs in fetch.wb_indicator(code):
            iso3 = obs.get("countryiso3code") or ""
            v = B.num(obs.get("value"))
            if iso3 and v is not None:
                series[iso3][int(obs["date"])][field] = v
    return series


def _ilo_occupation_series():
    """iso3 -> year -> (family, groups) for every reconcilable year."""
    path = fetch.ilo_flow("occupation")
    raw = defaultdict(lambda: defaultdict(dict))
    for iso3, ocu, year, val in B._read_ilo(
            path, ["REF_AREA", "OCU", "TIME_PERIOD", "OBS_VALUE"]):
        v = B.num(val)
        if v is not None:
            raw[iso3][int(year)][ocu] = v

    out = defaultdict(dict)
    for iso3, years in raw.items():
        for year, groups in years.items():
            for family in C.ISCO_FAMILIES:
                picked = B._pick_occupation_year({year: groups}, family)
                if picked:
                    out[iso3][year] = (family, picked[1], picked[2])
                    break        # ISCO-08 preferred, same as the snapshot
    return out


def _ilo_youth_series():
    path = fetch.ilo_flow("age_occupation")
    keep = {g for fam in C.ISCO_FAMILIES for g in fam["groups"]}
    raw = defaultdict(lambda: defaultdict(dict))
    for iso3, age, ocu, year, val in B._read_ilo(
            path, ["REF_AREA", "AGE", "OCU", "TIME_PERIOD", "OBS_VALUE"]):
        if age not in set(C.YOUTH_AGE_CODES) or ocu not in keep:
            continue
        v = B.num(val)
        if v is not None:
            raw[iso3][int(year)][ocu] = v
    out = defaultdict(dict)
    for iso3, years in raw.items():
        for year, cell in years.items():
            for family in C.ISCO_FAMILIES:
                share, _ = B._youth_share(cell, family)
                if share is not None:
                    out[iso3][year] = share
                    break
    return out


def build_panel(ref, weights, start=None):
    """One row per (country, year). Same derivations as the snapshot."""
    start = start or C.PANEL_START
    wb = _wb_series()
    occ = _ilo_occupation_series()
    youth = _ilo_youth_series()

    rows = []
    years = range(start, 2027)
    for iso3, meta in ref.items():
        for year in years:
            wb_year = wb.get(iso3, {}).get(year, {})
            occ_year = occ.get(iso3, {}).get(year)
            if not wb_year and not occ_year:
                continue
            row = {"iso3": iso3, "country_name": meta["country_name"],
                   "region": meta["region"], "row_type": "country", "year": year}
            row.update(wb_year)
            if occ_year:
                family, n_present, groups = occ_year
                B._apply_occupation(row, family, year, n_present, groups)
            else:
                for field, _ in C.ISCO_GROUPS.values():
                    row[field] = None
                row["isco_classification"] = None
                row["isco_groups_reported"] = 0
                row["data_year_occupation"] = None
            row["young_white_collar_pct"] = youth.get(iso3, {}).get(year)
            rows.append(row)

    by_iso = {f"{r['iso3']}|{r['year']}": r for r in rows}
    B.derive(by_iso, weights)
    return rows


def panel_aggregates(rows, ref):
    """World + World Bank regions, per year, employment-weighted."""
    by_year = defaultdict(list)
    for r in rows:
        by_year[r["year"]].append(r)
    out = []
    for year, members in sorted(by_year.items()):
        groups = [("WLD", "World", members)]
        for code, name in C.WB_REGIONS.items():
            sub = [m for m in members if m["region"] == name]
            if sub:
                groups.append((code, name, sub))
        for code, name, sub in groups:
            agg = B.make_aggregate(code, name, sub, "world" if code == "WLD" else "region")
            agg["year"] = year
            out.append(agg)
    return out


def export(rows, aggregates, data_dir, app_path):
    panel = rows + aggregates
    path = os.path.join(data_dir, "global_labor_panel.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=PANEL_FIELDS, extrasaction="ignore")
        w.writeheader()
        for r in sorted(panel, key=lambda x: (x["iso3"], x["year"])):
            w.writerow({k: r.get(k) for k in PANEL_FIELDS})
    print(f"      wrote {path} ({len(panel)} rows)")

    # compact app payload: arrays keyed by iso3, values in APP_PANEL_FIELDS order
    series = defaultdict(dict)
    for r in panel:
        series[r["iso3"]][r["year"]] = [r.get(k) for k in APP_PANEL_FIELDS[2:]]
    payload = {
        "fields": APP_PANEL_FIELDS[2:],
        "years": sorted({r["year"] for r in panel}),
        "series": {k: {str(y): v for y, v in sorted(vals.items())}
                   for k, vals in series.items()},
    }
    with open(app_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    print(f"      wrote {app_path} ({os.path.getsize(app_path):,} bytes)")
    return path
