#!/usr/bin/env python3
"""Freeze the differential cases for spec 0007 R1's number layer.

Run once, from the pinned interpreter, and commit the output. Spec 0007 R10
deletes the Python pipeline and R11 removes the interpreter from CI, so a test
that shells out to `python3` to compare would have nothing left to compare
against -- and R8 requires the suite to run offline. The cases are therefore
committed, and this generator is committed beside them so they can be
regenerated if the `python-version` pin moves.

It lives under `scripts/` rather than `pipeline/` because R10's acceptance is
"no `.py` under `pipeline/`". This is not the pipeline; it is a one-off tool a
human runs when the pin changes.

    python3 scripts/generate-pynum-fixtures.py

Format: one case per line, gzipped. Elements are tagged `i:` (Python int) or
`f:` (Python float) and carry the exact `repr`, because a JSON array of numbers
cannot hold this fixture: `JSON.parse("9007199254740993")` returns
`...992` -- the motivating input cannot be written as a JSON number literal at
all -- and `[1.0, 2.0]` and `[1, 2]` are the same JSON text, which would
collapse the all-int and all-float blocks into one.
"""
import gzip
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "pipeline", "tests", "fixtures", "pynum")

N = 20_000
SEED = 20260830  # the approval date of spec 0007, so a regeneration is stable


def tag(v):
    """`i:<exact digits>` or `f:<repr>` -- the tag is the whole point."""
    if isinstance(v, bool):
        raise TypeError("bool is not a case element")
    return ("i:" + repr(v)) if isinstance(v, int) else ("f:" + repr(v))


def write(name, lines):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".txt.gz")
    body = "".join(line + "\n" for line in lines).encode()
    with gzip.GzipFile(path, "wb", compresslevel=9, mtime=0) as f:
        f.write(body)
    print(f"  wrote {path} ({len(lines):,} cases, "
          f"{os.path.getsize(path):,} bytes gzipped)")


# ------------------------------------------------------------------ pyRound
def gen_round(rng):
    """`x n|expected` -- x and expected as exact reprs.

    Deliberately loaded with ties and near-ties, because that is the only
    region where half-to-even, `Math.round(x * 10 ** n) / 10 ** n` and
    `toFixed(n)` disagree. Uniform noise would pass a wrong implementation.
    """
    cases = []
    # the hand-picked cases from the spec's source verification, first
    for x, n in [(2.675, 2), (2.5, 0), (-2.5, 0), (0.5, 0), (1.5, 0), (2.675, 2),
                 (1.005, 2), (0.125, 2), (0.135, 2), (-0.125, 2), (2.674999, 2),
                 (1e16, 2), (1e-5, 4), (-0.0, 2), (0.0, 4)]:
        cases.append((x, n))
    while len(cases) < N:
        n = rng.choice([0, 0, 1, 2, 2, 3, 4, 4])
        style = rng.random()
        if style < 0.35:
            # exact ties: k + 5 * 10**-(n+1), which is where half-to-even bites
            whole = rng.randint(-10_000, 10_000)
            x = whole + rng.randint(0, 10 ** n - 1 if n else 0) / (10 ** n or 1)
            x += 5 * 10 ** -(n + 1)
        elif style < 0.7:
            # ordinary project magnitudes: percentages, scores, headcounts
            x = rng.choice([
                rng.uniform(0, 100), rng.uniform(0, 1), rng.uniform(0, 1e9),
                rng.uniform(-100, 100),
            ])
        else:
            # dyadic values, where the exact expansion terminates early and a
            # tie is genuinely exact
            x = rng.randint(-1 << 20, 1 << 20) / (1 << rng.randint(1, 12))
        cases.append((x, n))
    return [f"{tag(x)} {n}|{tag(round(x, n))}" for x, n in cases]


def gen_round_int(rng):
    """1-arg `round(x)`, which returns an int -- its own block, its own tag."""
    cases = [2.5, -2.5, 0.5, 1.5, 3.5, -0.5, 0.0, -0.0, 2.675,
             9007199254740993.0, 1e16, -1e16]
    while len(cases) < N:
        style = rng.random()
        if style < 0.4:
            cases.append(rng.randint(-1 << 30, 1 << 30) + 0.5)   # exact ties
        elif style < 0.8:
            cases.append(rng.uniform(-1e12, 1e12))
        else:
            cases.append(rng.randint(-1 << 40, 1 << 40) / (1 << rng.randint(1, 8)))
    return [f"{tag(x)}|{tag(round(x))}" for x in cases]


# --------------------------------------------------------------- pySumInt
def gen_sum_int(rng):
    """All-integer sums, INCLUDING either side of 2^53.

    The cases at and above 2^53 are the whole criterion, not its edge:
    measured over 200,000 random 6-element integer sums below the ceiling,
    BigInt accumulation and a naive fold agree on every one, because double
    addition on integers under 2^53 is exact. A fixture that stayed below it
    could not distinguish the integer branch from the thing it replaces.
    """
    CEIL = 1 << 53
    cases = [
        [9007199254740993, 1, 1, 1],
        [9007199254740993, 2, 2, 2],
        [CEIL, 1, 1, 1, 1, 1],
        [CEIL - 1, 1, 1],
        [10 ** 16, 1, 1, 1, 1],
    ]
    while len(cases) < N:
        style = rng.random()
        if style < 0.45:
            # at or above the ceiling -- the separating region
            head = rng.randint(CEIL, CEIL * 64)
            vals = [head] + [rng.randint(1, 9) for _ in range(rng.randint(3, 6))]
        elif style < 0.6:
            vals = [rng.randint(CEIL // 2, CEIL * 4) for _ in range(6)]
        else:
            # ordinary project magnitudes -- headcounts and wage bills
            vals = [rng.randint(0, 10 ** rng.randint(3, 13)) for _ in range(6)]
        if rng.random() < 0.15:
            vals = [-v for v in vals]
        cases.append(vals)
    return [" ".join(tag(v) for v in vals) + "|" + tag(sum(vals)) for vals in cases]


# -------------------------------------------------------------- pySumFloat
def gen_sum_float(rng):
    """All-float sums, including cases where naive folding diverges.

    Python 3.12 moved `sum()` to Neumaier compensated summation; a JS
    `reduce((a, b) => a + b)` is a naive fold. Each case is checked against the
    fold, and the generator keeps drawing until at least a third of the block
    actually separates the two -- a fixture full of agreeing cases would be
    20,000 green assertions proving nothing.
    """
    cases, diverging = [], 0
    while len(cases) < N or diverging < N // 3:
        if len(cases) >= N and diverging < N // 3:
            cases.pop(0)                       # keep the block at N, swap in a diverger
        style = rng.random()
        if style < 0.5:
            vals = [rng.uniform(0, 1e12) for _ in range(6)]
        elif style < 0.75:
            vals = [rng.uniform(-1e6, 1e6) for _ in range(6)]
        else:
            vals = [rng.uniform(0, 1e16)] + [rng.uniform(0, 1) for _ in range(5)]
        naive = 0.0
        for v in vals:
            naive += v
        if sum(vals) != naive:
            diverging += 1
        cases.append(vals)
    return [" ".join(tag(v) for v in vals) + "|" + tag(sum(vals)) for vals in cases]


# ------------------------------------------------------------------ pySum
def gen_sum_mixed(rng):
    """The mixed path, built from the two shapes that actually separate it.

    An int prefix followed only by floats is the shape where a wrongly
    compensated implementation and `sum()` agree on all 200,000 cases, so a
    fixture built to "first float at varying positions" alone passes a wrong
    implementation. The separating shapes are the two the pipeline's override
    path produces: an `Int` column with one float override, and a float column
    with one int override, both at a random NON-FINAL position -- non-final
    because a single trailing int often cancels in the final `f + c`, so the
    trailing-int count is varied too.
    """
    cases = [
        [84.84239393266276, 387, 570],
        [10 ** 16, 0.5, 1, 1, 1],
        [796, 0.6403143822699731, 7.582302462868173],
    ]
    while len(cases) < N:
        style = rng.random()
        n = rng.randint(4, 9)
        if style < 0.4:
            # an Int column with ONE float override at a non-final position
            vals = [rng.randint(0, 10 ** rng.randint(3, 12)) for _ in range(n)]
            pos = rng.randint(0, n - 2)
            vals[pos] = rng.uniform(0, 1e9)
        elif style < 0.8:
            # a float column with ONE int override at a non-final position
            vals = [rng.uniform(0, 1e9) for _ in range(n)]
            pos = rng.randint(0, n - 2)
            vals[pos] = rng.randint(0, 10 ** rng.randint(3, 12))
        else:
            # an int prefix of varying length, then floats and ints interleaved
            k = rng.randint(1, n - 2)
            vals = [rng.randint(0, 10 ** 12) for _ in range(k)]
            vals.append(rng.uniform(0, 1e12))
            for _ in range(n - k - 1):
                vals.append(rng.randint(0, 10 ** 9) if rng.random() < 0.5
                            else rng.uniform(0, 1e9))
        cases.append(vals)
    return [" ".join(tag(v) for v in vals) + "|" + tag(sum(vals)) for vals in cases]


def main():
    print(f"python {sys.version.split()[0]}  seed {SEED}  N {N:,}")
    rng = random.Random(SEED)
    write("round", gen_round(rng))
    write("round_int", gen_round_int(rng))
    write("sum_int", gen_sum_int(rng))
    write("sum_float", gen_sum_float(rng))
    write("sum_mixed", gen_sum_mixed(rng))
    # pyStr has no generated block: R1 backs it with the 78,257 numeric strings
    # already committed in the six CSVs, which is a stronger fixture than
    # anything drawn here -- it is the real output of the real pipeline.
    print("done")


if __name__ == "__main__":
    main()
