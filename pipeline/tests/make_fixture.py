#!/usr/bin/env python3
"""Build the golden-master fixture from a populated pipeline/raw/ (0004 R7).

    python3 pipeline/tests/make_fixture.py

Slices the response cache to the 32 areas `--pilot` fetches and writes it
gzipped under tests/fixtures/raw/. Committed rather than left as an opaque
blob: a fixture nobody can regenerate is a fixture nobody can trust, and the
slicing rules below are the part worth reviewing.

Requires a full `pipeline/raw/`, which is gitignored and absent from a fresh
clone -- run the pipeline once first. This is a maintenance script, not part of
the suite; the tests read the committed output and never invoke it.

Three rules, each load-bearing:

  1. Slice by AREA only, never by row content. Filtering to the AGE/OCU values
     the pipeline currently keeps would shrink the fixture further (6.77MB ->
     0.39MB gzipped, measured) but would bake today's filter criteria into the
     test data: widen the filter later and the rows would be silently absent
     rather than visibly wrong.
  2. countries.json ships WHOLE. build_reference iterates all 295 areas and
     filters by scope afterwards, and it keys on `id`, not the
     `countryiso3code` the indicator files use. Slicing it by the indicator
     rule would empty it. 0.01MB gzipped, so there is nothing to gain anyway.
  3. Eurostat is EXCLUDED. crosscheck runs only in main()'s full branch, never
     from run(scope, "pilot"), so shipping it would be dead weight.
"""
import gzip
import json
import os
import shutil
import sys

import context  # noqa: F401

import config as C
import run as R

RAW = os.path.join(context.PIPELINE, "raw")
OUT = os.path.join(context.FIXTURES, "raw")


def _slice_ilo(src, dest, scope):
    """Keep the header plus every row whose REF_AREA is in scope."""
    kept = 0
    with open(src, encoding="utf-8") as f, gzip.open(dest, "wt", encoding="utf-8") as g:
        header = f.readline()
        g.write(header)
        area = header.rstrip("\n").split(",").index("REF_AREA")
        for line in f:
            if line.split(",")[area] in scope:
                g.write(line)
                kept += 1
    return kept


def _slice_wb(src, dest, scope):
    """Keep observations for in-scope areas; preserve the [meta, rows] shape."""
    with open(src, encoding="utf-8") as f:
        payload = json.load(f)
    if not (isinstance(payload, list) and len(payload) > 1
            and isinstance(payload[1], list)):
        shutil.copyfileobj(open(src, "rb"), gzip.open(dest, "wb"))
        return 0
    rows = [r for r in payload[1] if (r.get("countryiso3code") or "") in scope]
    with gzip.open(dest, "wt", encoding="utf-8") as g:
        json.dump([payload[0], rows], g, separators=(",", ":"))
    return len(rows)


def main():
    if not os.path.isdir(RAW):
        sys.exit(f"no cache at {RAW} -- run the pipeline once first")

    scope = R.pilot_scope()          # the same 32 areas --pilot fetches
    print(f"slicing {len(scope)} areas into {OUT}")

    for sub in ("worldbank", "ilostat"):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)

    total = 0
    for name in sorted(os.listdir(os.path.join(RAW, "ilostat"))):
        if not name.endswith(".csv"):
            continue
        src = os.path.join(RAW, "ilostat", name)
        dest = os.path.join(OUT, "ilostat", name + ".gz")
        kept = _slice_ilo(src, dest, scope)
        size = os.path.getsize(dest)
        total += size
        print(f"  ilostat/{name:34s} {kept:7,d} rows  {size/1e6:5.2f}MB gz")

    for name in sorted(os.listdir(os.path.join(RAW, "worldbank"))):
        if not name.endswith(".json"):
            continue
        src = os.path.join(RAW, "worldbank", name)
        dest = os.path.join(OUT, "worldbank", name + ".gz")
        if name == "countries.json":
            # rule 2: whole, not sliced
            with open(src, "rb") as f, gzip.open(dest, "wb") as g:
                shutil.copyfileobj(f, g)
            kept = "ALL"
        else:
            kept = _slice_wb(src, dest, scope)
        size = os.path.getsize(dest)
        total += size
        print(f"  worldbank/{name:32s} {str(kept):>7s} obs   {size/1e6:5.2f}MB gz")

    print(f"\ntotal {total/1e6:.2f}MB gzipped")
    if total > 1_000_000:
        print("WARNING: over the 1MB bound spec 0004 R7 sets for this fixture")


if __name__ == "__main__":
    main()
