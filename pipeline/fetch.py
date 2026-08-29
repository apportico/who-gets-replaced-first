"""Cached fetchers for World Bank and ILOSTAT. Standard library only."""
import json, os, time, urllib.request, urllib.error, gzip, io, sys
import config as C

RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")
UA = {"User-Agent": "global-labor-pipeline/1.0 (research; contact via repo)"}
DELAY = 0.5  # be polite between live calls


def _log(msg):
    print(f"  {msg}", flush=True)


def _get(url, dest, binary=False, retries=3):
    """Fetch url to dest, using the cached file when present."""
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        _log(f"cached  {os.path.basename(dest)}")
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=300) as r:
                body = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
            with open(dest, "wb") as f:
                f.write(body)
            _log(f"fetched {os.path.basename(dest)} ({len(body):,} bytes)")
            time.sleep(DELAY)
            return dest
        except Exception as e:                                   # noqa: BLE001
            wait = 2 ** attempt
            _log(f"retry {attempt+1}/{retries} after error: {e} (sleep {wait}s)")
            time.sleep(wait)
    raise RuntimeError(f"failed to fetch {url}")


# ------------------------------------------------------------- World Bank
def wb_country_metadata():
    """ISO3, name, region, income group, capital lat/lon for every WB area."""
    dest = os.path.join(RAW, "worldbank", "countries.json")
    url = f"{C.WB_API}/country?format=json&per_page=400"
    _get(url, dest)
    with open(dest) as f:
        payload = json.load(f)
    return payload[1]


def wb_indicator(code):
    """All areas x all years for one indicator, following pagination."""
    pages, page = [], 1
    while True:
        dest = os.path.join(RAW, "worldbank", f"{code}_p{page}.json")
        url = (f"{C.WB_API}/country/all/indicator/{code}"
               f"?format=json&date={C.WB_DATE_RANGE}&per_page=15000&page={page}")
        _get(url, dest)
        with open(dest) as f:
            payload = json.load(f)
        if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
            break
        pages.extend(payload[1])
        if page >= payload[0].get("pages", 1):
            break
        page += 1
    return pages


# ---------------------------------------------------------------- ILOSTAT
def ilo_flow(name):
    """Bulk SDMX-CSV pull for one confirmed ILOSTAT dataflow."""
    flow, version, key, start = C.ILO_FLOWS[name]
    dest = os.path.join(RAW, "ilostat", f"{flow}.csv")
    url = (f"{C.ILO_SDMX},{flow},{version}/{key}"
           f"?format=csv&startPeriod={start}")
    _get(url, dest)
    return dest
