"""Assemble the global labor dataset from cached World Bank + ILOSTAT pulls."""
import csv, json, os, sqlite3, sys
from collections import defaultdict

import config as C
import fetch

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
csv.field_size_limit(10_000_000)

PCT_FIELDS = [
    "pop_0_14_pct", "pop_15_64_pct", "pop_65plus_pct", "lfp_rate_total",
    "lfp_rate_15_24", "lfp_rate_15_24_ilo", "lfp_rate_25_54", "lfp_rate_55_64",
    "emp_to_pop_ratio_15plus", "youth_employment_rate_15_24",
    "unemployment_rate_total", "unemployment_rate_15_24",
    "emp_agriculture_pct", "emp_industry_pct", "emp_services_pct",
    "white_collar_pct", "professional_core_pct", "blue_collar_service_pct",
    "young_white_collar_pct", "isco_unclassified_pct",
] + [f for f, _ in C.ISCO_GROUPS.values()]


# ------------------------------------------------------------------ helpers
def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def latest(series):
    """series: {year:int -> value}. Returns (value, year) for newest non-null."""
    live = {y: v for y, v in series.items() if v is not None}
    if not live:
        return None, None
    y = max(live)
    return live[y], y


# ------------------------------------------------------- reference universe
def build_reference(scope=None):
    meta = fetch.wb_country_metadata()
    ref, aggregates = {}, {}
    for c in meta:
        iso3 = c["id"]
        row = {
            "iso3": iso3,
            # 0011 R2. The alpha-2 the Bank already ships beside the alpha-3.
            # It is kept for the app's country search, where
            # `Intl.DisplayNames` needs an alpha-2 to return the spelling a
            # reader actually types ("South Korea", not "Korea, Rep."). An
            # identifier, not a measurement -- see FIELD_TIERS.
            "iso2": (c.get("iso2Code") or "").strip() or None,
            "country_name": c["name"],
            # the endpoint ships trailing whitespace on some region labels
            "region": c["region"]["value"].strip(),
            "income_group": c["incomeLevel"]["value"].strip(),
            "capital": c.get("capitalCity") or None,
            "lat": num(c.get("latitude")),
            "lon": num(c.get("longitude")),
        }
        if c["region"]["id"] == "NA":
            aggregates[iso3] = row
        else:
            ref[iso3] = row
    for iso3, info in C.EXTRA_AREAS.items():
        if iso3 not in ref:
            # 0011 R2. `iso2` is explicitly None here, not omitted. These areas
            # are outside the World Bank country list, so the Bank publishes no
            # alpha-2 for them -- TWN is the live case. ISO 3166-1 does assign
            # one, but transcribing it would be inventing a value to fill a gap;
            # the null stands and Taiwan stays findable by name and by iso3.
            ref[iso3] = {"iso3": iso3, "iso2": None, "country_name": info["name"],
                         "region": info["region"], "income_group": "Unclassified",
                         "capital": None, "lat": info.get("lat"),
                         "lon": info.get("lon")}
    for iso3, row in ref.items():
        if row["lat"] is None and iso3 in C.FALLBACK_COORDS:
            row["lat"], row["lon"] = C.FALLBACK_COORDS[iso3]
    if scope:
        ref = {k: v for k, v in ref.items() if k in scope}
    return ref, aggregates


# --------------------------------------------------------------- World Bank
def load_worldbank(rows_by_iso):
    """Fill A/B/C fields plus per-group vintages onto rows_by_iso in place."""
    vintages = defaultdict(lambda: defaultdict(dict))  # iso3 -> group -> field:year
    for code, (field, group) in C.WB_INDICATORS.items():
        print(f"[worldbank] {code} -> {field}")
        series = defaultdict(dict)
        for obs in fetch.wb_indicator(code):
            iso3 = obs.get("countryiso3code") or ""
            if not iso3:
                continue
            series[iso3][int(obs["date"])] = num(obs["value"])
        for iso3, row in rows_by_iso.items():
            val, yr = latest(series.get(iso3, {}))
            row[field] = val
            if yr:
                vintages[iso3][group][field] = yr
    for iso3, row in rows_by_iso.items():
        for group in ("population", "labor", "sector"):
            years = vintages[iso3][group].values()
            row[f"data_year_{group}"] = max(years) if years else None
    return rows_by_iso


# ------------------------------------------------------------------ ILOSTAT
def _read_ilo(path, cols):
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            yield tuple(r[c] for c in cols)


def _pick_occupation_year(years, family):
    """Most recent year whose major groups reconcile with the reported total.

    A year is rejected when groups 1-9 plus armed forces exceed the reported
    total by more than 0.5% -- that signals the source dropped a group and
    folded it into another, which silently distorts the white-collar share
    (Japan 2024-25 drops ISCO 3 and 7). Years with >=8 of 9 groups are
    preferred over more recent years carrying only 7.
    """
    candidates = []
    for year, groups in years.items():
        present = [g for g in family["groups"] if g in groups]
        base = sum(groups[g] for g in present)
        if len(present) < 7 or base <= 0:
            continue
        total = groups.get(family["total"])
        armed = groups.get(family["armed"], 0.0)
        if total and (base + armed) / total > 1.005:
            continue
        candidates.append((len(present) >= 8, year, len(present), groups))
    if not candidates:
        return None
    ok8, year, n_present, groups = max(candidates, key=lambda c: (c[0], c[1]))
    return year, n_present, groups


def _apply_occupation(row, family, year, n_present, groups):
    """Write ISCO shares onto row, normalising ISCO-88 codes to the ISCO-08 fields."""
    base = sum(groups.get(g, 0.0) for g in family["groups"])      # excludes group 0
    for src_code, canonical in family["groups"].items():
        field = C.ISCO_GROUPS[canonical][0]
        v = groups.get(src_code)
        row[field] = round(100.0 * v / base, 4) if (v is not None and base) else None
    reported_total = groups.get(family["total"])
    armed = groups.get(family["armed"], 0.0)
    row["isco_armed_forces_thousands"] = armed or None
    if reported_total and reported_total > 0:
        resid = round(100.0 * (reported_total - base - armed) / reported_total, 4)
        # survey totals and group sums differ by float noise; clamp the epsilon
        row["isco_unclassified_pct"] = 0.0 if -0.01 < resid < 0 else resid
        row["isco_classified_share_pct"] = round(100.0 * (base + armed) / reported_total, 2)
    else:
        row["isco_unclassified_pct"] = None
        row["isco_classified_share_pct"] = None
    row["isco_source_employed_thousands"] = round(base, 3)
    row["isco_groups_reported"] = n_present
    row["isco_classification"] = family["name"]
    row["data_year_occupation"] = year


def load_occupation(rows_by_iso):
    """ISCO major group shares. Prefers ISCO-08; falls back to ISCO-88 (R1)."""
    path = fetch.ilo_flow("occupation")
    by = defaultdict(lambda: defaultdict(dict))   # iso3 -> year -> ocu -> value
    for iso3, ocu, year, val in _read_ilo(path, ["REF_AREA", "OCU", "TIME_PERIOD", "OBS_VALUE"]):
        v = num(val)
        if v is not None:
            by[iso3][int(year)][ocu] = v

    for iso3, row in rows_by_iso.items():
        years = by.get(iso3, {})
        for family in C.ISCO_FAMILIES:                 # ISCO-08 first, then -88
            picked = _pick_occupation_year(years, family)
            if picked:
                _apply_occupation(row, family, *picked)
                break
        else:
            row["data_year_occupation"] = None
            row["isco_source_employed_thousands"] = None
            row["isco_groups_reported"] = 0
            row["isco_classified_share_pct"] = None
            row["isco_classification"] = None
            for field, _ in C.ISCO_GROUPS.values():
                row[field] = None
    return rows_by_iso


def _youth_share(groups_by_ocu, family):
    """White-collar share of a single age x occupation cell, or None."""
    present = [g for g in family["groups"] if g in groups_by_ocu]
    base = sum(groups_by_ocu[g] for g in present)
    if len(present) < 7 or base <= 0:
        return None, None
    wc = sum(v for g, v in groups_by_ocu.items()
             if g in family["groups"] and C.ISCO_GROUPS[family["groups"][g]][0]
             in [C.ISCO_GROUPS[c][0] for c in C.WHITE_COLLAR])
    return round(100.0 * wc / base, 4), base


def load_youth_occupation(rows_by_iso):
    """Entry-level PROXIES: 15-24 (R1-aware) and the wider 15-34 band (R11)."""
    path = fetch.ilo_flow("age_occupation")
    # iso3 -> age -> year -> ocu -> value
    by = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    wanted = (set(C.YOUTH_AGE_CODES) | set(C.CAREER_STAGE_BANDS)
              | set(C.AGE_GROUP_BANDS) | {C.AGE_GROUP_DENOM})
    keep = {g for fam in C.ISCO_FAMILIES for g in fam["groups"]}
    for iso3, age, ocu, year, val in _read_ilo(
            path, ["REF_AREA", "AGE", "OCU", "TIME_PERIOD", "OBS_VALUE"]):
        if age not in wanted or ocu not in keep:
            continue
        v = num(val)
        if v is not None:
            by[iso3][age][int(year)][ocu] = v

    for iso3, row in rows_by_iso.items():
        ages = by.get(iso3, {})
        # -- 15-24, preferring the classification the country's headline uses
        families = sorted(C.ISCO_FAMILIES,
                          key=lambda f: f["name"] != (row.get("isco_classification") or "ISCO-08"))
        result = chosen_year = chosen_age = None
        for family in families:
            for age in C.YOUTH_AGE_CODES:
                for year in sorted(ages.get(age, {}), reverse=True):
                    share, _ = _youth_share(ages[age][year], family)
                    if share is not None:
                        result, chosen_year, chosen_age = share, year, age
                        break
                if result is not None:
                    break
            if result is not None:
                break
        row["young_white_collar_pct"] = result
        row["data_year_youth_occupation"] = chosen_year
        row["youth_age_band_used"] = chosen_age.split("_")[-1] if chosen_age else None
        row["entry_level_data_quality"] = (
            "proxy_youth_15_24_x_isco" if result is not None else "proxy_unavailable")

        # -- R11. Career-stage profile: prime-age and late-career white collar,
        # using the same family preference as the headline figure.
        for band, field in C.CAREER_STAGE_BANDS.items():
            value = value_year = None
            for family in families:
                for year in sorted(ages.get(band, {}), reverse=True):
                    share, _ = _youth_share(ages[band][year], family)
                    if share is not None:
                        value, value_year = share, year
                        break
                if value is not None:
                    break
            row[field] = value
            row[field.replace("_pct", "_year")] = value_year

        # -- 0010 R8. Per-group age profile.
        #
        # The bands above were already read; what is new is keeping them PER
        # ISCO GROUP instead of collapsing to the white-collar cut through
        # _youth_share. That is where the work is: nine group shares per band
        # where there was one family share per band.
        #
        # Reconciled JOINTLY -- one year per (country, group) carrying all three
        # bands and the YGE15 denominator. The three shares divide a common
        # base, so bands from different years would not sum to the group's
        # whole. This is why the value cannot reuse data_year_youth_occupation,
        # which is reconciled on its own band: they disagree for 10 countries at
        # group 4, LAO by five years.
        _age_by_group(row, ages, families)
    return rows_by_iso


def _age_by_group(row, ages, families):
    """0010 R8. Nine group x three band shares, one reconciled year per group."""
    for n in C.ISCO_GROUP_NUMBERS:
        canon = f"OCU_ISCO08_{n}"
        shares, chosen_year = {}, None
        for family in families:
            src = {c: s for s, c in family["groups"].items()}.get(canon)
            if src is None:
                continue
            years = sorted({y for band in C.AGE_GROUP_BANDS for y in ages.get(band, {})}
                           | set(ages.get(C.AGE_GROUP_DENOM, {})), reverse=True)
            for year in years:
                base = ages.get(C.AGE_GROUP_DENOM, {}).get(year, {}).get(src)
                if not base or base <= 0:
                    continue
                cells = {}
                for band, suffix in C.AGE_GROUP_BANDS.items():
                    v = ages.get(band, {}).get(year, {}).get(src)
                    if v is None:
                        break
                    cells[suffix] = round(100.0 * v / base, 4)
                else:
                    shares, chosen_year = cells, year
                    break
            if chosen_year is not None:
                break
        for suffix in C.AGE_GROUP_BANDS.values():
            row[f"isco{n}_age_{suffix}_pct"] = shares.get(suffix)
        row[f"isco{n}_age_year"] = chosen_year


def load_edu_occupation(rows_by_iso):
    """0010 R9. Education x ISCO major group, per group, from a new ILO flow.

    Unlike R8 this flow is genuinely new -- nothing read it before -- so it gets
    its own reader and its own `_year` companions.

    Two decisions live here rather than in the caller:

      1. The denominator is EDU_AGGREGATE_TOTAL, never the sum of the bands.
         BAS/INT/ADV do not partition the base, and renormalising over them
         would silently redistribute the less-than-basic and unspecified
         workers -- the imputation this project does not do.
      2. Below EDU_COVERAGE_FLOOR the dimension is WITHHELD for that group, all
         four chips null, measured on the chips actually rendered. Cameroon's
         four chips describe 13.3% of its clerical workers; four chips summing
         to 13 with a caption explaining the other 87 is not an honest screen.
    """
    path = fetch.ilo_flow("edu_occupation")
    # iso3 -> edu -> year -> ocu -> value
    by = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    wanted = set(C.EDU_GROUP_BANDS) | {C.EDU_GROUP_DENOM}
    keep = {g for fam in C.ISCO_FAMILIES for g in fam["groups"]}
    for iso3, edu, ocu, year, val in _read_ilo(
            path, ["REF_AREA", "EDU", "OCU", "TIME_PERIOD", "OBS_VALUE"]):
        if edu not in wanted or ocu not in keep:
            continue
        v = num(val)
        if v is not None:
            by[iso3][edu][int(year)][ocu] = v

    for iso3, row in rows_by_iso.items():
        edus = by.get(iso3, {})
        families = sorted(C.ISCO_FAMILIES,
                          key=lambda f: f["name"] != (row.get("isco_classification") or "ISCO-08"))
        for n in C.ISCO_GROUP_NUMBERS:
            canon = f"OCU_ISCO08_{n}"
            shares, chosen_year, coverage = {}, None, None
            for family in families:
                src = {c: s for s, c in family["groups"].items()}.get(canon)
                if src is None:
                    continue
                years = sorted({y for e in C.EDU_GROUP_BANDS for y in edus.get(e, {})}
                               | set(edus.get(C.EDU_GROUP_DENOM, {})), reverse=True)
                for year in years:
                    base = edus.get(C.EDU_GROUP_DENOM, {}).get(year, {}).get(src)
                    if not base or base <= 0:
                        continue
                    cells, rendered = {}, 0.0
                    for edu, suffix in C.EDU_GROUP_BANDS.items():
                        v = edus.get(edu, {}).get(year, {}).get(src)
                        if v is None:
                            # LTB is optional -- it is a fourth chip only where
                            # published. The three named bands are required.
                            if edu in C.EDU_GROUP_REQUIRED:
                                cells = None
                                break
                            continue
                        cells[suffix] = round(100.0 * v / base, 4)
                        rendered += v
                    if cells is None:
                        continue
                    # The year is chosen on AVAILABILITY ALONE, exactly as
                    # _age_by_group does, and the floor is applied to that year
                    # and no other. An earlier version tested the floor inside
                    # this loop and used `continue`, which did not withhold at
                    # all: it walked back to whichever older survey happened to
                    # pass. CMR shipped four chips from 2014 beside an age
                    # profile from 2021, and DOM was ten years behind. Nothing
                    # authorised that gap, and the countries it rescued were
                    # precisely the ones the floor exists to withhold.
                    shares, chosen_year = cells, year
                    coverage = 100.0 * rendered / base
                    break
                if chosen_year is not None:
                    break

            if chosen_year is None:
                flag = C.EDU_FLAG_NOT_PUBLISHED
            elif coverage < C.EDU_COVERAGE_FLOOR:
                # Withheld AT the reconciled year, rather than reaching past it.
                shares, flag = {}, C.EDU_FLAG_WITHHELD
            else:
                flag = C.EDU_FLAG_PRESENT

            for suffix in C.EDU_GROUP_BANDS.values():
                row[f"isco{n}_edu_{suffix}_pct"] = shares.get(suffix)
            # The year survives a withholding: it says which survey was judged,
            # which is what makes the withholding checkable rather than a bare
            # null. Only the shares go.
            row[f"isco{n}_edu_year"] = chosen_year
            row[f"isco{n}_edu_flag"] = flag
    return rows_by_iso


def load_lfp_by_age(rows_by_iso):
    path = fetch.ilo_flow("lfp_by_age")
    by = defaultdict(lambda: defaultdict(dict))
    for iso3, age, year, val in _read_ilo(path, ["REF_AREA", "AGE", "TIME_PERIOD", "OBS_VALUE"]):
        if age in C.LFP_AGE_CODES:
            v = num(val)
            if v is not None:
                by[iso3][age][int(year)] = v
    for iso3, row in rows_by_iso.items():
        for age, field in C.LFP_AGE_CODES.items():
            val, yr = latest(by.get(iso3, {}).get(age, {}))
            row[field] = val
            if field == "lfp_rate_25_54":
                row["data_year_lfp_age"] = yr
    return rows_by_iso


# ------------------------------------------------------------ derived fields
def derive(rows_by_iso, weights):
    for row in rows_by_iso.values():
        groups = {code: row.get(field) for code, (field, _) in C.ISCO_GROUPS.items()}
        have_isco = row.get("data_year_occupation") is not None
        g = lambda code: groups.get(code) or 0.0                   # noqa: E731
        row["white_collar_pct"] = (
            round(sum(g(c) for c in C.WHITE_COLLAR), 4) if have_isco else None)
        row["professional_core_pct"] = (
            round(sum(g(c) for c in C.PROFESSIONAL_CORE), 4) if have_isco else None)
        row["blue_collar_service_pct"] = (
            round(sum(g(c) for c in C.BLUE_COLLAR_SERVICE), 4) if have_isco else None)

        # employed headcount (persons) — needed for correct weighted aggregates
        lf, unemp = row.get("labor_force_total"), row.get("unemployment_rate_total")
        if lf is not None and unemp is not None:
            row["employed_total"] = round(lf * (1 - unemp / 100.0))
            row["employed_total_source"] = "SL.TLF.TOTL.IN x (1 - SL.UEM.TOTL.ZS)"
        elif row.get("isco_source_employed_thousands"):
            row["employed_total"] = round(row["isco_source_employed_thousands"] * 1000)
            row["employed_total_source"] = "ILOSTAT survey total (ISCO base)"
        else:
            row["employed_total"] = None
            row["employed_total_source"] = None

        # share of the WHOLE population that works at all
        pop, e2p, p1564 = (row.get("population_total"),
                           row.get("emp_to_pop_ratio_15plus"),
                           row.get("pop_15_64_pct"))
        if row.get("employed_total") and pop:
            row["employed_share_of_population_pct"] = round(100.0 * row["employed_total"] / pop, 4)
        elif e2p is not None and p1564 is not None:
            row["employed_share_of_population_pct"] = round(
                e2p * (p1564 + (row.get("pop_65plus_pct") or 0)) / 100.0, 4)
        else:
            row["employed_share_of_population_pct"] = None

        # R8. Headcounts, not just shares -- shares hide where the exposed jobs are
        for pct_field, out in (("white_collar_pct", "white_collar_employed"),
                               ("professional_core_pct", "professional_core_employed"),
                               ("isco4_clerical_pct", "clerical_employed"),
                               ("isco2_professionals_pct", "professionals_employed")):
            v = row.get(pct_field)
            row[out] = round(row["employed_total"] * v / 100.0) if (
                v is not None and row.get("employed_total")) else None

        # employed 15-24 in white collar, headcount
        y_pct, y_pop = row.get("young_white_collar_pct"), row.get("population_15_24")
        y_emp_ratio = row.get("youth_employment_rate_15_24")
        if y_pct is not None and y_pop and y_emp_ratio is not None:
            row["young_employed_total"] = round(y_pop * y_emp_ratio / 100.0)
            row["young_white_collar_employed"] = round(row["young_employed_total"] * y_pct / 100.0)
        else:
            row["young_employed_total"] = None
            row["young_white_collar_employed"] = None

        # F. AI exposure overlay (modeled)
        if have_isco:
            row["ai_exposure_weighted_score"] = round(sum(
                (row.get(f) or 0.0) / 100.0 * weights[f]
                for f, _ in C.ISCO_GROUPS.values()), 4)
        else:
            row["ai_exposure_weighted_score"] = None

        # R10. Order-of-magnitude economic scale, NOT an amount at risk.
        score, gdp_pc = row.get("ai_exposure_weighted_score"), row.get("gdp_per_capita_ppp")
        row["exposed_wage_bill_ppp"] = (
            round(score * row["employed_total"] * gdp_pc)
            if score is not None and gdp_pc and row.get("employed_total") else None)

        # R7. Exported white-collar labor: services sold abroad, ICT-weighted.
        sx, ict = row.get("service_exports_usd"), row.get("ict_service_exports_pct")
        row["ict_service_exports_usd"] = round(sx * ict / 100.0) if (sx and ict is not None) else None
    return rows_by_iso


# ------------------------------------------------------- R9. squeeze index
SQUEEZE_COMPONENTS = {
    # field -> (weight, higher_is_more_squeeze)
    "youth_cohort_share": (0.25, True),    # how big the entering cohort is
    "young_white_collar_pct": (0.30, True),  # entering exactly the exposed jobs
    "unemployment_rate_15_24": (0.25, True),  # absorption already failing
    "youth_wc_gap": (0.20, True),          # youth MORE white collar than workforce
}


def squeeze_index(rows_by_iso):
    """Entry-level squeeze: big youth cohort + concentrated in exposed occupations
    + already struggling to be absorbed. Composite, 0-100.

    MODELED, not measured: the SQUEEZE_COMPONENTS weights above are assigned by
    this project, the same as the ISCO exposure weights. See spec 0004 R3.
    """
    countries = [r for r in rows_by_iso.values() if r.get("row_type") == "country"]
    for r in countries:
        pop, y = r.get("population_total"), r.get("population_15_24")
        r["youth_cohort_share"] = round(100.0 * y / pop, 4) if (pop and y) else None
        ywc, wc = r.get("young_white_collar_pct"), r.get("white_collar_pct")
        r["youth_wc_gap"] = round(ywc - wc, 4) if (ywc is not None and wc is not None) else None

    # percentile-rank each component so units cannot dominate the composite
    ranks = {}
    for field in SQUEEZE_COMPONENTS:
        vals = sorted(r[field] for r in countries if r.get(field) is not None)
        ranks[field] = vals
    for r in countries:
        total, wsum = 0.0, 0.0
        for field, (weight, higher) in SQUEEZE_COMPONENTS.items():
            v, vals = r.get(field), ranks[field]
            if v is None or not vals:
                continue
            pct = sum(1 for x in vals if x < v) / len(vals) * 100.0
            total += weight * (pct if higher else 100 - pct)
            wsum += weight
        # require at least three of the four components to be present
        present = sum(1 for f in SQUEEZE_COMPONENTS if r.get(f) is not None)
        r["entry_level_squeeze_index"] = round(total / wsum, 2) if (wsum and present >= 3) else None
        r["squeeze_components_present"] = present
    return rows_by_iso


def quality_flag(row, current_year=2026):
    issues = []
    if row.get("white_collar_pct") is None:
        issues.append("no ISCO data")
    elif row.get("isco_classification") == "ISCO-88":
        issues.append("ISCO-88 fallback (no ISCO-08 series published)")
    else:
        age = current_year - (row.get("data_year_occupation") or 0)
        if age > 5:
            issues.append(f"ISCO data {row['data_year_occupation']} (>5yr old)")
        n = row.get("isco_groups_reported")
        if n is not None and n < 9:
            issues.append(f"only {n}/9 ISCO groups reported by source")
        cls = row.get("isco_classified_share_pct")
        if cls is not None and cls < 90:
            issues.append(f"only {cls:.0f}% of employment classified by occupation")
    if row.get("population_total") is None:
        issues.append("no population data")
    if row.get("lfp_rate_total") is None:
        issues.append("no labor force data")
    if row.get("young_white_collar_pct") is None:
        issues.append("no youth x ISCO cross-tab")
    if not issues:
        return "complete"
    if row.get("white_collar_pct") is None and row.get("population_total") is None:
        return "sparse — " + "; ".join(issues)
    return "partial — " + "; ".join(issues)


# ---------------------------------------------------------------- aggregates
AGG_WEIGHTED = [f for f, _ in C.ISCO_GROUPS.values()] + [
    "white_collar_pct", "professional_core_pct", "blue_collar_service_pct",
    "young_white_collar_pct", "prime_white_collar_pct",
    "late_career_white_collar_pct", "emp_agriculture_pct", "emp_industry_pct",
    "emp_services_pct", "ai_exposure_weighted_score",
]
AGG_LF_WEIGHTED = [
    "lfp_rate_total", "lfp_rate_15_24", "lfp_rate_15_24_ilo", "lfp_rate_25_54",
    "lfp_rate_55_64", "emp_to_pop_ratio_15plus", "youth_employment_rate_15_24",
    "unemployment_rate_total", "unemployment_rate_15_24",
    "entry_level_squeeze_index", "youth_cohort_share",
    "gdp_per_capita_ppp", "labor_force_advanced_edu_pct",
]
AGG_POP_WEIGHTED = ["pop_0_14_pct", "pop_15_64_pct", "pop_65plus_pct",
                    "age_dependency_ratio"]


def _wavg(rows, field, wfield):
    num_, den = 0.0, 0.0
    for r in rows:
        v, w = r.get(field), r.get(wfield)
        if v is not None and w:
            num_ += v * w
            den += w
    return (round(num_ / den, 4), den) if den else (None, 0.0)


def make_aggregate(iso3, name, members, kind):
    rows = [r for r in members if r]
    agg = {"iso3": iso3, "country_name": name, "region": "AGGREGATE",
           "income_group": "Aggregate", "row_type": kind,
           "member_count": len(rows), "lat": None, "lon": None, "capital": None,
           "iso2": None}

    total_pop = sum(r["population_total"] for r in rows if r.get("population_total"))
    total_emp = sum(r["employed_total"] for r in rows if r.get("employed_total"))
    total_lf = sum(r["labor_force_total"] for r in rows if r.get("labor_force_total"))
    agg["population_total"] = total_pop or None
    agg["employed_total"] = total_emp or None
    agg["labor_force_total"] = total_lf or None
    agg["employed_total_source"] = "sum of member countries"

    for f in AGG_POP_WEIGHTED:
        agg[f], _ = _wavg(rows, f, "population_total")
    for f in AGG_LF_WEIGHTED:
        agg[f], _ = _wavg(rows, f, "population_total")
    for f in AGG_WEIGHTED:
        agg[f], covered = _wavg(rows, f, "employed_total")
        if f == "white_collar_pct":
            agg["isco_coverage_pct_of_employment"] = (
                round(100.0 * covered / total_emp, 2) if total_emp else None)
        if f == "young_white_collar_pct":
            agg["youth_isco_coverage_pct_of_employment"] = (
                round(100.0 * covered / total_emp, 2) if total_emp else None)

    for f in ("clerical_employed", "professionals_employed",
              "young_white_collar_employed", "population_15_24",
              "exposed_wage_bill_ppp", "ict_service_exports_usd",
              "service_exports_usd"):
        vals = [r[f] for r in rows if r.get(f)]
        agg[f] = sum(vals) if vals else None

    agg["employed_share_of_population_pct"] = (
        round(100.0 * total_emp / total_pop, 4) if total_emp and total_pop else None)
    for pct_field, out in (("white_collar_pct", "white_collar_employed"),
                           ("professional_core_pct", "professional_core_employed")):
        agg[out] = round(total_emp * agg[pct_field] / 100.0) if (
            agg.get(pct_field) and total_emp) else None

    yrs = lambda k: [r[k] for r in rows if r.get(k)]                    # noqa: E731
    for k in ("data_year_population", "data_year_labor", "data_year_sector",
              "data_year_occupation", "data_year_youth_occupation"):
        vals = yrs(k)
        agg[k] = max(vals) if vals else None
        agg[k + "_range"] = f"{min(vals)}-{max(vals)}" if vals else None
    n_isco = sum(1 for r in rows if r.get("white_collar_pct") is not None)
    agg["entry_level_data_quality"] = "aggregate of country proxies"
    agg["data_quality_flag"] = (
        f"aggregate — {n_isco}/{len(rows)} members with ISCO data, "
        f"{agg.get('isco_coverage_pct_of_employment')}% of employment covered")
    return agg


# ------------------------------------------------- R3. manual overrides
def apply_overrides(rows_by_iso, path):
    """Merge nationally-sourced figures that no free API carries.

    Every override must cite its source. Applied values are tagged on the row so
    a national figure is never silently mixed in with API-sourced data.
    """
    with open(path) as f:
        payload = json.load(f)
    applied = []
    for iso3, fields in payload.get("overrides", {}).items():
        row = rows_by_iso.get(iso3)
        if row is None:
            print(f"      ! override for unknown area {iso3}, skipped")
            continue
        for field, spec in fields.items():
            missing = [k for k in ("value", "year", "source_name", "source_url",
                                   "retrieved", "note") if k not in spec]
            if missing:
                print(f"      ! override {iso3}.{field} missing {missing}, skipped")
                continue
            row[field] = spec["value"]
            row.setdefault("data_source_override", []).append(
                f"{field}={spec['value']} ({spec['year']}, {spec['source_name']})")
            applied.append((iso3, field, spec["source_name"]))
    for row in rows_by_iso.values():
        ov = row.get("data_source_override")
        row["data_source_override"] = "; ".join(ov) if ov else None
    if applied:
        print(f"      applied {len(applied)} manual override(s)")
        for iso3, field, src in applied:
            print(f"        {iso3}.{field} <- {src}")
    else:
        print("      no manual overrides active "
              f"({len(payload.get('_unfilled_gaps', {}))} known gaps documented)")
    return rows_by_iso


# ------------------------------------------------------ R5. outlier review
OUTLIER_FIELDS = [
    "white_collar_pct", "professional_core_pct", "young_white_collar_pct",
    "prime_white_collar_pct", "isco4_clerical_pct", "lfp_rate_total",
    "employed_share_of_population_pct", "ai_exposure_weighted_score",
    "entry_level_squeeze_index",
]


def _median(v):
    v = sorted(v)
    n = len(v)
    if not n:
        return None
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2


def find_outliers(rows):
    """Values that are statistically improbable rather than merely impossible.

    Robust z-score (median / MAD) flags |z| > 3.5, plus two structural checks.
    Nothing is auto-corrected -- this is a review queue.
    """
    countries = [r for r in rows if r.get("row_type") == "country"]
    out = []
    for field in OUTLIER_FIELDS:
        vals = [r[field] for r in countries if r.get(field) is not None]
        med = _median(vals)
        if med is None or len(vals) < 20:
            continue
        mad = _median([abs(v - med) for v in vals])
        if not mad:
            continue
        for r in countries:
            v = r.get(field)
            if v is None:
                continue
            z = 0.6745 * (v - med) / mad
            if abs(z) > 3.5:
                out.append({
                    "iso3": r["iso3"], "country_name": r["country_name"],
                    "field": field, "value": round(v, 4),
                    "median": round(med, 4), "robust_z": round(z, 2),
                    "reason": "robust z-score beyond +/-3.5",
                    "data_year_occupation": r.get("data_year_occupation"),
                    "data_quality_flag": r.get("data_quality_flag"),
                })
    for r in countries:
        wc, srv = r.get("white_collar_pct"), r.get("emp_services_pct")
        if wc is not None and srv is not None and wc > srv + 12:
            out.append({
                "iso3": r["iso3"], "country_name": r["country_name"],
                "field": "white_collar_pct", "value": round(wc, 4),
                "median": round(srv, 4), "robust_z": "",
                "reason": f"white collar ({wc:.1f}%) exceeds services employment "
                          f"({srv:.1f}%) by more than 12pp -- check classification",
                "data_year_occupation": r.get("data_year_occupation"),
                "data_quality_flag": r.get("data_quality_flag"),
            })
        ywc = r.get("young_white_collar_pct")
        if ywc is not None and wc is not None and ywc - wc > 25:
            out.append({
                "iso3": r["iso3"], "country_name": r["country_name"],
                "field": "young_white_collar_pct", "value": round(ywc, 4),
                "median": round(wc, 4), "robust_z": "",
                "reason": f"youth white collar exceeds all-ages by {ywc - wc:.1f}pp",
                "data_year_occupation": r.get("data_year_occupation"),
                "data_quality_flag": r.get("data_quality_flag"),
            })
    return out


# --------------------------------------------------------------- validation
def validate(rows):
    problems = []
    for r in rows:
        tag = r["iso3"]
        for f in PCT_FIELDS:
            v = r.get(f)
            if v is not None and not (0 <= v <= 100):
                problems.append(f"{tag}: {f}={v} outside [0,100]")
        bands = [r.get("pop_0_14_pct"), r.get("pop_15_64_pct"), r.get("pop_65plus_pct")]
        if all(b is not None for b in bands) and abs(sum(bands) - 100) > 1.0:
            problems.append(f"{tag}: age bands sum to {sum(bands):.2f}, not ~100")
        sectors = [r.get("emp_agriculture_pct"), r.get("emp_industry_pct"),
                   r.get("emp_services_pct")]
        if all(s is not None for s in sectors) and abs(sum(sectors) - 100) > 1.5:
            problems.append(f"{tag}: sector shares sum to {sum(sectors):.2f}, not ~100")
        wc, bc = r.get("white_collar_pct"), r.get("blue_collar_service_pct")
        if wc is not None and bc is not None and abs(wc + bc - 100) > 0.5:
            problems.append(f"{tag}: white+blue collar = {wc + bc:.2f}, not 100")

        # -- 0010 R8/R9. The per-group cross-tabs.
        for n in C.ISCO_GROUP_NUMBERS:
            # Age: the three bands divide YGE15, which also contains 65+, so
            # they sum to UNDER 100 and the residual is the 65-and-over cohort.
            # Asserting ~100 here would be wrong; over 100 is the real error.
            age = [r.get(f"isco{n}_age_{b}_pct") for b in C.AGE_GROUP_BANDS.values()]
            if all(v is not None for v in age):
                if sum(age) > 100.5:
                    problems.append(
                        f"{tag}: isco{n} age bands sum to {sum(age):.2f}, over 100")
                if r.get(f"isco{n}_age_year") is None:
                    problems.append(f"{tag}: isco{n} age shares with no isco{n}_age_year")

            # Education: BAS/INT/ADV/LTB do not partition TOTAL either -- the
            # unspecified cell sits outside them -- so the same rule applies.
            # What IS checked is the coverage floor: anything that survived the
            # loader must be at or above it, or the withholding did not happen.
            edu = {b: r.get(f"isco{n}_edu_{b}_pct") for b in C.EDU_GROUP_BANDS.values()}
            present = [v for v in edu.values() if v is not None]
            flag = r.get(f"isco{n}_edu_flag")
            if present:
                total = sum(present)
                if total > 100.5:
                    problems.append(
                        f"{tag}: isco{n} education chips sum to {total:.2f}, over 100")
                if total < C.EDU_COVERAGE_FLOOR - 0.5:
                    problems.append(
                        f"{tag}: isco{n} education chips cover {total:.2f}%, "
                        f"below the {C.EDU_COVERAGE_FLOOR}% floor -- should have been withheld")
                if r.get(f"isco{n}_edu_year") is None:
                    problems.append(f"{tag}: isco{n} education shares with no isco{n}_edu_year")
                if flag != C.EDU_FLAG_PRESENT:
                    problems.append(f"{tag}: isco{n} has education shares but flag={flag}")
            elif flag == C.EDU_FLAG_WITHHELD and r.get(f"isco{n}_edu_year") is None:
                # A withholding names the survey it judged; without the year it
                # is indistinguishable from the source publishing nothing.
                problems.append(f"{tag}: isco{n} withheld with no isco{n}_edu_year")
    return problems
