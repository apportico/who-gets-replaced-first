"""Synthetic row builders shared across the suite.

Rows are plain dicts everywhere in the pipeline, so a fixture is just a dict
with the fields a given test cares about. These helpers exist so nine test
modules do not each hand-roll one, and so the *shape* of a row is stated once.

Nothing here builds a row from a real data file. The one exception is
`weights()`, which reads the committed `ai_exposure_isco.json` -- `derive`
indexes `weights[f]` for every ISCO group and raises KeyError on a partial
stub, so the real weights are the only workable input. Tests that need real
*data* use the golden master fixture instead (R7).
"""
import contextlib
import io

import context  # noqa: F401  -- puts pipeline/ on sys.path

import config as C
import run


@contextlib.contextmanager
def quiet():
    """Swallow the pipeline's progress printing.

    Several pipeline functions report progress on stdout -- useful on a real
    run, noise in a test suite, where it buries the one line that says whether
    anything failed. Returns the captured text so a test can assert on it.
    """
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        yield buf


def weights():
    """The real AI exposure weights, keyed by column name.

    `derive` indexes weights[f] for every ISCO group field and raises KeyError
    on a partial dict, so tests use the committed weights rather than a stub.
    These are MODELED values -- see spec 0004 R3 -- and the tests here assert
    plumbing, never the weights themselves.
    """
    return run.load_weights()


def country(iso3="TST", **over):
    """A country row with every field a test might assert on set to None.

    Defaulting to None rather than omitting keys matters: the pipeline
    distinguishes "absent" from "null" in places, and a fixture that omits a key
    can pass a test that a real null row would fail.
    """
    row = {
        "iso3": iso3,
        "country_name": f"Test {iso3}",
        "region": "Test Region",
        "income_group": "Test Income",
        "row_type": "country",
        "capital": None,
        "lat": None,
        "lon": None,
        "population_total": None,
        "labor_force_total": None,
        "unemployment_rate_total": None,
        "emp_to_pop_ratio_15plus": None,
        "pop_15_64_pct": None,
        "pop_65plus_pct": None,
        "employed_total": None,
        "isco_source_employed_thousands": None,
        "data_year_occupation": None,
        "isco_classification": None,
        "isco_groups_reported": None,
        "isco_classified_share_pct": None,
        "white_collar_pct": None,
        "young_white_collar_pct": None,
        "lfp_rate_total": None,
    }
    for code, (field, _) in C.ISCO_GROUPS.items():
        row[field] = None
    row.update(over)
    return row


def with_isco(iso3="TST", year=2023, **groups):
    """A country row carrying ISCO major-group shares.

    `groups` is keyed by group number: with_isco(g1=10.0, g2=12.0). Sets
    data_year_occupation so `derive`'s have_isco gate opens -- tests that want
    the gate *shut* should pass year=None.
    """
    row = country(iso3, data_year_occupation=year, isco_classification="ISCO-08")
    for code, (field, _) in C.ISCO_GROUPS.items():
        n = code.rsplit("_", 1)[-1]
        key = f"g{n}"
        if key in groups:
            row[field] = groups[key]
    return row


def member(employed, pct=None, population=None, **over):
    """An aggregate member: an employed headcount plus the share being weighted.

    The default weight field for AGG_WEIGHTED is employed_total, so a member
    with no employed count contributes to neither numerator nor denominator.
    """
    row = country(over.pop("iso3", "MBR"))
    row["employed_total"] = employed
    row["population_total"] = population if population is not None else employed
    row["white_collar_pct"] = pct
    row.update(over)
    return row
