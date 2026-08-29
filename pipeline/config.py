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
