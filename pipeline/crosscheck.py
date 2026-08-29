"""R4. Independent validation of EU-27 occupation shares against Eurostat,
and R12. sensitivity of the modeled AI exposure index to its weights."""
import csv, json, os, urllib.parse
from collections import defaultdict

import config as C
import fetch
import build as B

# Eurostat's isco08 dimension codes for the major groups, in ISCO order.
EUROSTAT_ISCO = ["OC1", "OC2", "OC3", "OC4", "OC5", "OC6", "OC7", "OC8", "OC9"]
WHITE_COLLAR_EU = {"OC1", "OC2", "OC3", "OC4"}


def _eurostat_url(geo, year):
    params = {
        "format": "JSON", "lang": "EN", "geo": geo, "time": year,
        "sex": "T", "age": "Y15-64", "unit": "THS_PER", "wstatus": "EMP",
    }
    return f"{C.EUROSTAT_API}/{C.EUROSTAT_OCU_DATASET}?{urllib.parse.urlencode(params)}"


def _parse_jsonstat(payload):
    """Return {isco_code: value} from a Eurostat JSON-stat response."""
    dim = payload.get("dimension", {})
    isco = dim.get("isco08", {}).get("category", {}).get("index", {})
    if not isco:
        return {}
    sizes = [len(dim[d]["category"]["index"]) for d in payload["id"]]
    isco_axis = payload["id"].index("isco08")
    stride = 1
    for s in sizes[isco_axis + 1:]:
        stride *= s
    values = payload.get("value", {})
    out = {}
    for code, idx in isco.items():
        # every other dimension is pinned to a single value, so the flat index
        # is just this dimension's position times its stride
        v = values.get(str(idx * stride)) or values.get(idx * stride)
        if v is not None:
            out[code] = float(v)
    return out


def eurostat_check(rows_by_iso, data_dir, year=2024):
    """Compare our ILO-derived white-collar share against Eurostat's LFS."""
    results, failures = [], []
    for iso3 in C.EU27:
        row = rows_by_iso.get(iso3)
        if not row or row.get("white_collar_pct") is None:
            continue
        geo = row.get("eurostat_geo") or _iso3_to_geo(iso3)
        dest = os.path.join(fetch.RAW, "eurostat", f"{C.EUROSTAT_OCU_DATASET}_{geo}_{year}.json")
        try:
            fetch._get(_eurostat_url(geo, year), dest)
            with open(dest) as f:
                payload = json.load(f)
            groups = _parse_jsonstat(payload)
        except Exception as e:                                    # noqa: BLE001
            print(f"      ! eurostat {iso3}: {e}")
            continue
        base = sum(v for k, v in groups.items() if k in EUROSTAT_ISCO)
        if not base:
            continue
        eu_wc = 100.0 * sum(v for k, v in groups.items() if k in WHITE_COLLAR_EU) / base
        delta = row["white_collar_pct"] - eu_wc
        rec = {
            "iso3": iso3, "country_name": row["country_name"],
            "ilo_white_collar_pct": round(row["white_collar_pct"], 2),
            "ilo_year": row.get("data_year_occupation"),
            "eurostat_white_collar_pct": round(eu_wc, 2),
            "eurostat_year": year,
            "delta_pp": round(delta, 2),
            "within_tolerance": abs(delta) <= C.EUROSTAT_DELTA_TOLERANCE,
        }
        results.append(rec)
        if not rec["within_tolerance"]:
            failures.append(rec)

    if results:
        path = os.path.join(data_dir, "crosscheck_eurostat.csv")
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(results[0].keys()))
            w.writeheader()
            w.writerows(results)
        ok = sum(1 for r in results if r["within_tolerance"])
        print(f"      {ok}/{len(results)} EU-27 countries agree with Eurostat "
              f"within {C.EUROSTAT_DELTA_TOLERANCE}pp")
        for r in failures:
            print(f"      ! {r['iso3']}: ILO {r['ilo_white_collar_pct']}% "
                  f"({r['ilo_year']}) vs Eurostat {r['eurostat_white_collar_pct']}% "
                  f"({year}) = {r['delta_pp']:+}pp")
        print(f"      wrote {path}")
    return results


def _iso3_to_geo(iso3):
    """Eurostat uses ISO-2 with two well-known exceptions."""
    m = {"AUT": "AT", "BEL": "BE", "BGR": "BG", "HRV": "HR", "CYP": "CY",
         "CZE": "CZ", "DNK": "DK", "EST": "EE", "FIN": "FI", "FRA": "FR",
         "DEU": "DE", "GRC": "EL", "HUN": "HU", "IRL": "IE", "ITA": "IT",
         "LVA": "LV", "LTU": "LT", "LUX": "LU", "MLT": "MT", "NLD": "NL",
         "POL": "PL", "PRT": "PT", "ROU": "RO", "SVK": "SK", "SVN": "SI",
         "ESP": "ES", "SWE": "SE"}
    return m.get(iso3, iso3[:2])


# ------------------------------------------------------ R12. sensitivity
def sensitivity(rows_by_iso, profiles, data_dir):
    """How much does the country ordering depend on our chosen weights?

    If the ranking barely moves across plausible weightings, the ORDER is robust
    even though the cardinal score is not. That is the defensible claim.
    """
    countries = [r for r in rows_by_iso.values()
                 if r.get("row_type") == "country" and r.get("white_collar_pct") is not None]
    scores = defaultdict(dict)
    for name, weights in profiles.items():
        for r in countries:
            scores[name][r["iso3"]] = sum(
                (r.get(f) or 0.0) / 100.0 * weights[f] for f, _ in C.ISCO_GROUPS.values())

    ranks = {}
    for name, s in scores.items():
        order = sorted(s, key=lambda i: -s[i])
        ranks[name] = {iso: i + 1 for i, iso in enumerate(order)}

    out = []
    for r in countries:
        iso = r["iso3"]
        rs = [ranks[name][iso] for name in profiles]
        rec = {"iso3": iso, "country_name": r["country_name"]}
        for name in profiles:
            rec[f"score_{name}"] = round(scores[name][iso], 4)
            rec[f"rank_{name}"] = ranks[name][iso]
        rec["max_rank_movement"] = max(rs) - min(rs)
        out.append(rec)
    out.sort(key=lambda x: -x["max_rank_movement"])

    path = os.path.join(data_dir, "ai_exposure_sensitivity.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    moves = [r["max_rank_movement"] for r in out]
    median_move = sorted(moves)[len(moves) // 2]
    print(f"      {len(out)} countries scored under {len(profiles)} weight profiles")
    print(f"      median rank movement {median_move}, worst {max(moves)} "
          f"({out[0]['country_name']})")
    print(f"      wrote {path}")
    return {"median_rank_movement": median_move, "max_rank_movement": max(moves),
            "worst_country": out[0]["country_name"], "n": len(out),
            "profiles": list(profiles)}
