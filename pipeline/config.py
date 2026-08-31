"""Configuration for the global labor / AI-exposure dataset pipeline.

All source identifiers here were confirmed against the LIVE catalogs
(World Bank v2 API, ILOSTAT SDMX at sdmx.ilo.org) — none are guessed.
"""

# ---------------------------------------------------------------- World Bank
# indicator code -> (field_name, year_field_group)
# year_field_group: which data_year_* column records the vintage for this field
WB_INDICATORS = {
    # A. Population structure
    "SP.POP.TOTL":        ("population_total",            "population"),
    "SP.POP.0014.TO.ZS":  ("pop_0_14_pct",                "population"),
    "SP.POP.1564.TO.ZS":  ("pop_15_64_pct",               "population"),
    "SP.POP.65UP.TO.ZS":  ("pop_65plus_pct",              "population"),
    "SP.POP.DPND":        ("age_dependency_ratio",        "population"),
    # B. Labor force / employment status
    "SL.TLF.CACT.ZS":     ("lfp_rate_total",              "labor"),
    "SL.TLF.ACTI.1524.ZS":("lfp_rate_15_24",              "labor"),
    "SL.EMP.TOTL.SP.ZS":  ("emp_to_pop_ratio_15plus",     "labor"),
    "SL.EMP.1524.SP.ZS":  ("youth_employment_rate_15_24", "labor"),
    "SL.UEM.TOTL.ZS":     ("unemployment_rate_total",     "labor"),
    "SL.UEM.1524.ZS":     ("unemployment_rate_15_24",     "labor"),
    "SL.TLF.TOTL.IN":     ("labor_force_total",           "labor"),
    # C. Employment by broad sector
    "SL.AGR.EMPL.ZS":     ("emp_agriculture_pct",         "sector"),
    "SL.IND.EMPL.ZS":     ("emp_industry_pct",            "sector"),
    "SL.SRV.EMPL.ZS":     ("emp_services_pct",            "sector"),
    # R7. Context joins: wage magnitude, exported labor, youth cohort, feeder stock
    "NY.GDP.PCAP.PP.CD":  ("gdp_per_capita_ppp",          "context"),
    "BX.GSR.CCIS.ZS":     ("ict_service_exports_pct",     "context"),
    "BX.GSR.NFSV.CD":     ("service_exports_usd",         "context"),
    "SP.POP.1524.TO.UN":  ("population_15_24",            "population"),
    "SL.TLF.ADVN.ZS":     ("labor_force_advanced_edu_pct","context"),
}

WB_API = "https://api.worldbank.org/v2"
WB_DATE_RANGE = "2010:2026"
PANEL_START = 2013          # R6. first year with usable ILOSTAT occupation coverage

# ------------------------------------------------------------------ ILOSTAT
# Dataflow IDs verified live from https://sdmx.ilo.org/rest/dataflow/ILO
ILO_SDMX = "https://sdmx.ilo.org/rest/data/ILO"
ILO_FLOWS = {
    # employment by sex and occupation (ISCO-08 major groups), headcount thousands
    "occupation":     ("DF_EMP_TEMP_SEX_OCU_NB",     "1.0", ".A..SEX_T.",  2013),
    # employment by sex, age and occupation -> youth x ISCO cross-tab
    "age_occupation": ("DF_EMP_TEMP_SEX_AGE_OCU_NB", "1.0", ".A..SEX_T..", 2013),
    # labour force participation rate by sex and age band
    "lfp_by_age":     ("DF_EAP_DWAP_SEX_AGE_RT",     "1.0", ".A..SEX_T.",  2015),
    # 0010 R9. employment by sex, occupation and education -> education x ISCO.
    # startPeriod 2013 matches the other flows and is not cosmetic: unrestricted
    # this flow is 1982-2026, 428,474 rows and 90.5 MB against 55.5 MB here.
    "edu_occupation": ("DF_EMP_TEMP_SEX_OCU_EDU_NB", "1.0", ".A..SEX_T..", 2013),
}

ISCO_GROUPS = {
    "OCU_ISCO08_1": ("isco1_managers_pct",        "Managers"),
    "OCU_ISCO08_2": ("isco2_professionals_pct",   "Professionals"),
    "OCU_ISCO08_3": ("isco3_technicians_pct",     "Technicians and associate professionals"),
    "OCU_ISCO08_4": ("isco4_clerical_pct",        "Clerical support workers"),
    "OCU_ISCO08_5": ("isco5_service_sales_pct",   "Service and sales workers"),
    "OCU_ISCO08_6": ("isco6_agricultural_pct",    "Skilled agricultural, forestry and fishery workers"),
    "OCU_ISCO08_7": ("isco7_craft_pct",           "Craft and related trades workers"),
    "OCU_ISCO08_8": ("isco8_operators_pct",       "Plant and machine operators, and assemblers"),
    "OCU_ISCO08_9": ("isco9_elementary_pct",      "Elementary occupations"),
}
# ISCO-08 group 0 (armed forces) and "not elsewhere classified" are excluded from
# the percentage base; the residual is reported as isco_unclassified_pct.
ISCO_ARMED = "OCU_ISCO08_0"
ISCO_TOTAL = "OCU_ISCO08_TOTAL"

# R1. Ten areas publish ISCO-88 major groups but no ISCO-08 series at all
# (BMU CAN MAC NAM NIC TTO TWN UKR YEM ZAF). The two revisions align 1:1 at the
# major-group level, so the 1-4 white-collar cut carries over; the revision did
# move some ICT occupations between groups 2 and 3, which makes
# professional_core_pct slightly less comparable than white_collar_pct.
# ISCO-08 is always preferred; ISCO-88 is used only when no ISCO-08 year exists.
ISCO_FAMILIES = [
    {
        "name": "ISCO-08",
        "groups": {f"OCU_ISCO08_{i}": f"OCU_ISCO08_{i}" for i in range(1, 10)},
        "armed": "OCU_ISCO08_0",
        "total": "OCU_ISCO08_TOTAL",
    },
    {
        "name": "ISCO-88",
        "groups": {f"OCU_ISCO88_{i}": f"OCU_ISCO08_{i}" for i in range(1, 10)},
        "armed": "OCU_ISCO88_0",
        "total": "OCU_ISCO88_TOTAL",
    },
]

WHITE_COLLAR = ["OCU_ISCO08_1", "OCU_ISCO08_2", "OCU_ISCO08_3", "OCU_ISCO08_4"]
PROFESSIONAL_CORE = ["OCU_ISCO08_1", "OCU_ISCO08_2"]
BLUE_COLLAR_SERVICE = ["OCU_ISCO08_5", "OCU_ISCO08_6", "OCU_ISCO08_7",
                       "OCU_ISCO08_8", "OCU_ISCO08_9"]

YOUTH_AGE_CODES = ["AGE_AGGREGATE_Y15-24", "AGE_10YRBANDS_Y15-24", "AGE_YTHADULT_Y15-24"]
# R11 (revised after probing the source). The occupation cross-tab carries ISCO
# major groups ONLY for the AGE_AGGREGATE / AGE_YTHADULT bands -- the 10-year
# bands are published against OCU_SKILL only. So neither 15-29 nor 15-34 is
# constructible. What IS available is the full career-stage profile, which is
# more informative anyway: youth vs prime-age vs late-career white-collar share.
CAREER_STAGE_BANDS = {
    "AGE_AGGREGATE_Y25-54": "prime_white_collar_pct",
    "AGE_AGGREGATE_Y55-64": "late_career_white_collar_pct",
}
LFP_AGE_CODES = {
    "AGE_10YRBANDS_Y15-24": "lfp_rate_15_24_ilo",
    "AGE_AGGREGATE_Y25-54": "lfp_rate_25_54",
    "AGE_AGGREGATE_Y55-64": "lfp_rate_55_64",
}

# --- 0010 R8 / R9. The per-group cross-tabs. ------------------------------
#
# Both dimensions are reconciled JOINTLY: one year per (country, ISCO group)
# carrying every band plus the denominator. That is not the shape
# CAREER_STAGE_BANDS uses above, and the difference is deliberate. Those two
# fields are independent aggregate measures, so reconciling each at its own most
# recent year is fine. These are shares of a COMMON denominator, so bands taken
# from different years would not compose -- they would not sum to the group's
# whole, and the result screen would show a breakdown assembled from different
# surveys.
#
# Each (country, group) therefore carries ONE year, in its own `_year` field.
# Nine per dimension, not 27: the reconciled year varies across the nine groups
# for 34 countries on the age flow and 43 on the education flow, so one
# per-country field cannot name them, but one per band would be recording the
# same year three times.
AGE_GROUP_BANDS = {
    "AGE_AGGREGATE_Y15-24": "15_24",
    "AGE_AGGREGATE_Y25-54": "25_54",
    "AGE_AGGREGATE_Y55-64": "55_64",
}
AGE_GROUP_DENOM = "AGE_AGGREGATE_YGE15"

# BAS/INT/ADV do NOT partition the base: EDU_AGGREGATE_LTB (less than basic) and
# EDU_AGGREGATE_X (unspecified) sit outside them. The denominator is TOTAL and
# never the sum of the bands -- renormalising over the three would silently
# redistribute less-than-basic workers, which is the imputation this project
# does not do. LTB is a fourth chip wherever a country publishes it.
EDU_GROUP_BANDS = {
    "EDU_AGGREGATE_BAS": "bas",
    "EDU_AGGREGATE_INT": "int",
    "EDU_AGGREGATE_ADV": "adv",
    "EDU_AGGREGATE_LTB": "ltb",
}
EDU_GROUP_REQUIRED = ["EDU_AGGREGATE_BAS", "EDU_AGGREGATE_INT", "EDU_AGGREGATE_ADV"]
EDU_GROUP_DENOM = "EDU_AGGREGATE_TOTAL"

# The residual is not uniformly small: median 0.81% over the 149 countries
# covered at group 4, but 27 of them exceed 10% and Cameroon's chips describe
# 13.3% of its clerical workers. Below this floor the dimension is WITHHELD --
# null with a data_quality_flag -- rather than rendered as chips that describe a
# minority of the base. Measured on the chips actually rendered (the three bands
# plus LTB where published), not on the three alone: Djibouti is 39.9% on three
# and 99.6% on four, and withholding it would penalise a country for supplying
# the fourth chip.
EDU_COVERAGE_FLOOR = 90.0

ISCO_GROUP_NUMBERS = list(range(1, 10))
AGE_GROUP_COLUMNS = (
    [f"isco{n}_age_{b}_pct" for n in ISCO_GROUP_NUMBERS for b in AGE_GROUP_BANDS.values()]
    + [f"isco{n}_age_year" for n in ISCO_GROUP_NUMBERS])
EDU_GROUP_COLUMNS = (
    [f"isco{n}_edu_{b}_pct" for n in ISCO_GROUP_NUMBERS for b in EDU_GROUP_BANDS.values()]
    + [f"isco{n}_edu_year" for n in ISCO_GROUP_NUMBERS])
# 27 + 9 + 36 + 9 = 81. These reach global_labor_dataset.csv and the SQLite like
# every other column; only export_app_json sheds them, and only after the tier
# gate has run (0010 R20).
CROSSTAB_COLUMNS = AGE_GROUP_COLUMNS + EDU_GROUP_COLUMNS

# ------------------------------------------------------------------- Scope
PILOT = ["ARM", "USA", "DEU", "CHN", "IND", "WLD"]

# Aggregate rows we build ourselves (employment-weighted, never simple averages)
# Region labels exactly as the live World Bank metadata endpoint returns them.
# The Bank renamed MENA to "Middle East, North Africa, Afghanistan & Pakistan"
# and moved AFG/PAK out of South Asia, so these are not the classic names.
WB_REGIONS = {
    "NAC": "North America",
    "ECS": "Europe & Central Asia",
    "EAS": "East Asia & Pacific",
    "SAS": "South Asia",
    "SSF": "Sub-Saharan Africa",
    "MEA": "Middle East, North Africa, Afghanistan & Pakistan",
    "LCN": "Latin America & Caribbean",
}

EU27 = ["AUT","BEL","BGR","HRV","CYP","CZE","DNK","EST","FIN","FRA","DEU","GRC",
        "HUN","IRL","ITA","LVA","LTU","LUX","MLT","NLD","POL","PRT","ROU","SVK",
        "SVN","ESP","SWE"]

OECD = ["AUS","AUT","BEL","CAN","CHL","COL","CRI","CZE","DNK","EST","FIN","FRA",
        "DEU","GRC","HUN","ISL","IRL","ISR","ITA","JPN","KOR","LVA","LTU","LUX",
        "MEX","NLD","NZL","NOR","POL","PRT","SVK","SVN","ESP","SWE","CHE","TUR",
        "GBR","USA"]

G20 = ["ARG","AUS","BRA","CAN","CHN","FRA","DEU","IND","IDN","ITA","JPN","KOR",
       "MEX","RUS","SAU","ZAF","TUR","GBR","USA"]

# Territories outside the World Bank country list that we still want, with
# their ILOSTAT REF_AREA code. Taiwan is not in either source's country list.
EXTRA_AREAS = {
    "HKG": {"name": "Hong Kong SAR, China", "region": "East Asia & Pacific"},
    "MAC": {"name": "Macao SAR, China",     "region": "East Asia & Pacific"},
    "TWN": {"name": "Taiwan, China",        "region": "East Asia & Pacific",
            "lat": 25.03, "lon": 121.57},
}

# Capital coordinates missing from the World Bank metadata endpoint.
FALLBACK_COORDS = {
    "PRK": (39.03, 125.75), "TWN": (25.03, 121.57), "SSD": (4.85, 31.58),
    "XKX": (42.67, 21.17),  "MAF": (18.07, -63.08), "SXM": (18.03, -63.05),
    "CUW": (12.11, -68.93), "BES": (12.15, -68.28), "GIB": (36.14, -5.35),
    "IMN": (54.15, -4.48),  "CHI": (49.45, -2.53),  "ERI": (15.33, 38.93),
    "SOM": (2.04, 45.34),   "SMR": (43.94, 12.45),  "MCO": (43.73, 7.42),
    "AND": (42.51, 1.52),   "LIE": (47.14, 9.52),   "NRU": (-0.55, 166.92),
    "TUV": (-8.52, 179.19), "PLW": (7.50, 134.62),  "MHL": (7.09, 171.38),
    "FSM": (6.92, 158.16),  "KIR": (1.33, 172.98),  "COK": (-21.21, -159.77), "PSE": (31.95, 35.23),
    "NIU": (-19.06, -169.92),
}


# ---------------------------------------------------------------- Eurostat
# R4. Independent cross-check of EU-27 occupation shares. Dataset confirmed live:
# lfsa_egais "Employed persons by professional status and occupation", which
# carries an isco08 dimension.
EUROSTAT_API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
EUROSTAT_OCU_DATASET = "lfsa_egais"
EUROSTAT_DELTA_TOLERANCE = 3.0     # percentage points before we complain

# R2. Investigated and unavailable from any free source: absent from every
# ILOSTAT occupation dataflow, and OECD's SDMX catalog has no ISCO occupation
# dataflow (ALFS covers ISIC industry and ICSE status only).
NO_OCCUPATION_SOURCE = {
    "NZL": "Not in ILOSTAT occupation dataflows; OECD publishes no ISCO series. "
           "Stats NZ uses ANZSCO and does not map to ISCO in any free feed.",
    "SAU": "Not in ILOSTAT occupation dataflows; GASTAT publishes nationally only.",
}


# ------------------------------------------------- 0004 R3. field -> tier
# CLAUDE.md's first non-negotiable: never blur measured and constructed. Every
# emitted number carries a tier, and until spec 0004 that rule lived only as
# prose in report.py's methodology tables -- which is to say it was enforced by
# whoever last read them. This registry makes it mechanical: the suite asserts
# set(FIELD_TIERS) == set(run.COLUMNS), so a new column without a tier fails the
# build rather than shipping untiered.
#
#   OFFICIAL           published national statistic, as published
#   DERIVED            arithmetic on official statistics
#   PROXY              a stand-in for something no source measures globally
#   MODELED            analyst-assigned model output
#   NOT_A_MEASUREMENT  identity and provenance -- not a claim about the world
#
# NOT_A_MEASUREMENT is spelled out rather than left absent so that a missing
# entry always means someone forgot, never "this field is exempt".
TIERS = ("OFFICIAL", "DERIVED", "PROXY", "MODELED")
NOT_A_MEASUREMENT = "NOT_A_MEASUREMENT"

FIELD_TIERS = {
    # -- identity: labels, not measurements
    "iso3": NOT_A_MEASUREMENT,
    "country_name": NOT_A_MEASUREMENT,
    "region": NOT_A_MEASUREMENT,
    "income_group": NOT_A_MEASUREMENT,
    "row_type": NOT_A_MEASUREMENT,
    "capital": NOT_A_MEASUREMENT,
    "lat": NOT_A_MEASUREMENT,
    "lon": NOT_A_MEASUREMENT,
    "member_count": NOT_A_MEASUREMENT,

    # -- A. population structure: World Bank, as published
    "population_total": "OFFICIAL",
    "pop_0_14_pct": "OFFICIAL",
    "pop_15_64_pct": "OFFICIAL",
    "pop_65plus_pct": "OFFICIAL",
    "age_dependency_ratio": "OFFICIAL",

    # -- B. labour force: World Bank, plus three ILOSTAT age bands
    "lfp_rate_total": "OFFICIAL",
    "lfp_rate_15_24": "OFFICIAL",
    "lfp_rate_15_24_ilo": "OFFICIAL",
    "lfp_rate_25_54": "OFFICIAL",
    "lfp_rate_55_64": "OFFICIAL",
    "emp_to_pop_ratio_15plus": "OFFICIAL",
    "youth_employment_rate_15_24": "OFFICIAL",
    "unemployment_rate_total": "OFFICIAL",
    "unemployment_rate_15_24": "OFFICIAL",
    "labor_force_total": "OFFICIAL",
    # labour force x (1 - unemployment), or the ILOSTAT survey total
    "employed_total": "DERIVED",
    "employed_total_source": NOT_A_MEASUREMENT,
    "employed_share_of_population_pct": "DERIVED",

    # -- C. broad sector: World Bank, as published
    "emp_agriculture_pct": "OFFICIAL",
    "emp_industry_pct": "OFFICIAL",
    "emp_services_pct": "OFFICIAL",

    # -- D. ISCO occupation.
    # ILOSTAT publishes HEADCOUNTS in thousands; every *_pct here is
    # 100 * group / base, computed in _apply_occupation. The shares are ours,
    # so they are DERIVED even though the counts behind them are official.
    "isco1_managers_pct": "DERIVED",
    "isco2_professionals_pct": "DERIVED",
    "isco3_technicians_pct": "DERIVED",
    "isco4_clerical_pct": "DERIVED",
    "isco5_service_sales_pct": "DERIVED",
    "isco6_agricultural_pct": "DERIVED",
    "isco7_craft_pct": "DERIVED",
    "isco8_operators_pct": "DERIVED",
    "isco9_elementary_pct": "DERIVED",
    "isco_unclassified_pct": "DERIVED",
    # group 0 count, straight from the source
    "isco_armed_forces_thousands": "OFFICIAL",
    "isco_groups_reported": NOT_A_MEASUREMENT,
    "isco_classified_share_pct": "DERIVED",
    "isco_classification": NOT_A_MEASUREMENT,
    # sum of the published group counts, not a published total
    "isco_source_employed_thousands": "DERIVED",
    "white_collar_pct": "DERIVED",
    "professional_core_pct": "DERIVED",
    "blue_collar_service_pct": "DERIVED",
    "white_collar_employed": "DERIVED",
    "professional_core_employed": "DERIVED",
    "clerical_employed": "DERIVED",
    "professionals_employed": "DERIVED",

    # -- E. entry level.
    # No global source measures seniority. Age 15-24 is a stand-in: it misses
    # graduate entry at 25-29 and counts long-tenure young workers as entry
    # level. The career-stage bands are the same construct at other ages.
    # report.py:101 and :360 already say PROXY; this agrees with them.
    "young_white_collar_pct": "PROXY",
    "prime_white_collar_pct": "PROXY",
    "late_career_white_collar_pct": "PROXY",
    "youth_age_band_used": NOT_A_MEASUREMENT,
    "entry_level_data_quality": NOT_A_MEASUREMENT,
    "young_employed_total": "DERIVED",
    "young_white_collar_employed": "PROXY",
    "youth_cohort_share": "DERIVED",
    "youth_wc_gap": "DERIVED",
    # MODELED, not DERIVED: squeeze_index percentile-ranks four components and
    # combines them with SQUEEZE_COMPONENTS' 0.25/0.30/0.25/0.20 -- weights this
    # project assigned, exactly as it assigned the ISCO exposure weights.
    # CLAUDE.md calls DERIVED "arithmetic on official statistics" and MODELED
    # "analyst-assigned model output"; a chosen-weight composite is the second.
    # report.py's "DERIVED composite" hedged this in prose, which a one-word
    # enum cannot carry. See spec 0004 R3.
    "entry_level_squeeze_index": "MODELED",
    "squeeze_components_present": NOT_A_MEASUREMENT,

    # -- C2. context joins: World Bank, as published
    "gdp_per_capita_ppp": "OFFICIAL",
    "population_15_24": "OFFICIAL",
    "labor_force_advanced_edu_pct": "OFFICIAL",
    "service_exports_usd": "OFFICIAL",
    "ict_service_exports_pct": "OFFICIAL",
    # pct x total, so ours
    "ict_service_exports_usd": "DERIVED",

    # -- F. modeled overlay
    "ai_exposure_weighted_score": "MODELED",
    "exposed_wage_bill_ppp": "MODELED",

    # -- provenance: vintages, spans, coverage and flags
    "data_year_population": NOT_A_MEASUREMENT,
    "data_year_labor": NOT_A_MEASUREMENT,
    "data_year_sector": NOT_A_MEASUREMENT,
    "data_year_occupation": NOT_A_MEASUREMENT,
    "data_year_youth_occupation": NOT_A_MEASUREMENT,
    "data_year_lfp_age": NOT_A_MEASUREMENT,
    "data_year_context": NOT_A_MEASUREMENT,
    "prime_white_collar_year": NOT_A_MEASUREMENT,
    "late_career_white_collar_year": NOT_A_MEASUREMENT,
    "data_source_override": NOT_A_MEASUREMENT,
    "data_year_population_range": NOT_A_MEASUREMENT,
    "data_year_labor_range": NOT_A_MEASUREMENT,
    "data_year_sector_range": NOT_A_MEASUREMENT,
    "data_year_occupation_range": NOT_A_MEASUREMENT,
    "data_year_youth_occupation_range": NOT_A_MEASUREMENT,
    "isco_coverage_pct_of_employment": "DERIVED",
    "youth_isco_coverage_pct_of_employment": "DERIVED",
    "data_quality_flag": NOT_A_MEASUREMENT,
}

# 0010 R8/R9. The 81 cross-tab columns, registered here rather than typed out:
# every share is the same arithmetic on the same kind of OFFICIAL counts, and a
# hand-written block of 81 would drift from CROSSTAB_COLUMNS the first time a
# band changed. The invariant set(FIELD_TIERS) == set(run.COLUMNS) is what makes
# this safe -- a column added without a tier fails test_columns.
#
# DERIVED, not OFFICIAL: the published cells are headcounts, and the share is
# our division of one by another. The `_year` companions are provenance rather
# than measurement, like every other data_year_* field.
FIELD_TIERS.update({c: "DERIVED" for c in CROSSTAB_COLUMNS if c.endswith("_pct")})
FIELD_TIERS.update({c: NOT_A_MEASUREMENT for c in CROSSTAB_COLUMNS if c.endswith("_year")})
