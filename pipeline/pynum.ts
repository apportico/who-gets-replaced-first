/**
 * 0007 R1. The number layer: CPython's arithmetic and formatting, in TypeScript.
 *
 * Every place the Python pipeline called `round()`, `sum()`, or wrote a float,
 * the port calls something here. None of this is a convenience wrapper around a
 * JS builtin -- each entry point exists because the JS builtin gives a
 * different answer, and spec 0007's source verification measured how often.
 *
 * The exactness strategy is one idea applied four times: a finite double is
 * `mantissa * 2^exponent`, an exact dyadic rational, so its decimal expansion
 * always terminates and can be computed with BigInt and no error at all. Every
 * rounding and formatting decision below is made on that exact expansion rather
 * than on a floating-point approximation of it. That is what R1 means by
 * "half-to-even on the double's exact decimal value"; `toFixed(20)` was the
 * probe's implementation and agrees on 20,000 cases, but it approximates where
 * this does not.
 */

// ---------------------------------------------------------------- the tag
//
// R1: `PyNum` is an explicit runtime tag, and it has to be. `Int | number`
// collapses (a branded number is still a number, so nothing is rejected and
// there is no tag to switch on at runtime), and `bigint | number` cannot be
// produced by a caller reading row data, which is exactly the caller that does
// not know which elements were Python ints.
export type PyNum =
  | { kind: 'int'; value: bigint }
  | { kind: 'float'; value: number };

// ------------------------------------------------------- exact decimposition
const BUF = new DataView(new ArrayBuffer(8));

/** A finite double as `(-1)^neg * mant * 2^exp`, with `mant` a BigInt. */
function decompose(x: number): { neg: boolean; mant: bigint; exp: number } {
  BUF.setFloat64(0, x);
  const hi = BUF.getUint32(0);
  const lo = BUF.getUint32(4);
  const neg = (hi & 0x80000000) !== 0;
  const biased = (hi >>> 20) & 0x7ff;
  const frac = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (biased === 0) return { neg, mant: frac, exp: -1074 }; // subnormal
  return { neg, mant: frac | (1n << 52n), exp: biased - 1075 };
}

/**
 * The exact decimal expansion of a finite double.
 *
 * Returns the integer digits and the fraction digits, both exact. `x = 0.1`
 * comes back as 55 fraction digits, because that is genuinely what the double
 * is -- and it is why `round(2.675, 2)` is 2.67 in Python and 2.68 under a
 * naive `Math.round(x * 100) / 100`.
 */
function exactDecimal(x: number): { neg: boolean; int: string; frac: string } {
  const { neg, mant, exp } = decompose(x);
  if (mant === 0n) return { neg, int: '0', frac: '' };
  if (exp >= 0) {
    return { neg, int: (mant << BigInt(exp)).toString(), frac: '' };
  }
  // mant / 2^k == (mant * 5^k) / 10^k -- exact, k digits after the point.
  const k = -exp;
  const scaled = (mant * 5n ** BigInt(k)).toString().padStart(k + 1, '0');
  return {
    neg,
    int: scaled.slice(0, scaled.length - k),
    frac: scaled.slice(scaled.length - k),
  };
}

/**
 * Round an exact decimal to `n` places, half-to-even, in decimal.
 *
 * Half-to-even is decided on the *whole* remaining tail, not on its first
 * digit: `2.675` is a tie only if every digit after the 5 is zero, and for a
 * double it almost never is.
 */
function roundDecimalHalfEven(
  int: string,
  frac: string,
  n: number,
): { int: string; frac: string } {
  if (n >= frac.length) return { int, frac: frac.padEnd(n, '0') };
  const keptFrac = frac.slice(0, n);
  const rest = frac.slice(n);
  const first = rest.charCodeAt(0) - 48;
  const restNonZero = /[1-9]/.test(rest.slice(1));

  let roundUp: boolean;
  if (first > 5) roundUp = true;
  else if (first < 5) roundUp = false;
  else if (restNonZero) roundUp = true;
  else {
    // an exact tie -- go to even
    const last = n > 0 ? keptFrac.charCodeAt(n - 1) - 48 : int.charCodeAt(int.length - 1) - 48;
    roundUp = last % 2 === 1;
  }

  const digits = int + keptFrac;
  if (!roundUp) return { int, frac: keptFrac };
  const bumped = (BigInt(digits) + 1n).toString().padStart(digits.length, '0');
  return {
    int: bumped.slice(0, bumped.length - n),
    frac: n > 0 ? bumped.slice(bumped.length - n) : '',
  };
}

// ------------------------------------------------------------------ pyRound
/**
 * `round(x, n)` -- half-to-even on the double's exact decimal value.
 *
 * CPython rounds the exact value to `n` decimal places and then converts that
 * decimal string back to the nearest double (`_Py_dg_dtoa` then
 * `_Py_dg_strtod`). This does the same, so `round(2.675, 2)` is `2.67` and
 * `round(2.5)` is `2` -- neither of which `Math.round(x * 10 ** n) / 10 ** n`
 * nor `toFixed(n)` produces.
 */
export function pyRound(x: number, n: number): number {
  if (!Number.isFinite(x)) return x;
  const { neg, int, frac } = exactDecimal(x);
  const r = roundDecimalHalfEven(int, frac, n);
  const text = `${neg ? '-' : ''}${r.int}${r.frac ? '.' + r.frac : ''}`;
  return Number(text);
}

/**
 * `round(x)` with no ndigits -- half-to-even to a whole number.
 *
 * Python returns an `int` here, which is why every one of these outputs carries
 * the branded `Int` in the schema (R7) and selects `pySumInt` at its call site.
 * The value is returned as a `number`: every such column in this dataset sits
 * about 296x below 2^53 (R1's headroom row), so the double is exact.
 */
export function pyRoundInt(x: number): number {
  if (!Number.isFinite(x)) return x;
  const { neg, int, frac } = exactDecimal(x);
  const r = roundDecimalHalfEven(int, frac, 0);
  return Number(`${neg ? '-' : ''}${r.int}`);
}

// -------------------------------------------------------------------- pyStr
/**
 * Python's `repr` of a float: `.0` on integral values, `-0.0` preserved, and
 * the exponential threshold Python uses rather than the one JavaScript uses.
 *
 * `String(79.0)` is `"79"` and `String(-0.0)` is `"0"` -- 6,286 of the 78,257
 * numeric strings in the committed CSVs differ on exactly those two shapes.
 * The exponent cutovers differ too: Python goes scientific at `decpt <= -4 ||
 * decpt > 16`, JavaScript at `< -6 || >= 21`, so `1e-5` is `"1e-05"` in Python
 * and `"0.00001"` in JavaScript.
 */
export function pyStr(x: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';

  const neg = x < 0;
  // toExponential() with no argument gives the shortest round-tripping digits,
  // which is the same digit string Python's repr mode produces.
  const [mantissa, expPart] = Math.abs(x).toExponential().split('e');
  const digits = mantissa.replace('.', '');
  const decpt = Number(expPart) + 1;
  const sign = neg ? '-' : '';

  if (decpt <= -4 || decpt > 16) {
    const e = decpt - 1;
    const head = digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '');
    const esign = e < 0 ? '-' : '+';
    return `${sign}${head}e${esign}${String(Math.abs(e)).padStart(2, '0')}`;
  }
  if (decpt <= 0) return `${sign}0.${'0'.repeat(-decpt)}${digits}`;
  if (decpt >= digits.length) return `${sign}${digits}${'0'.repeat(decpt - digits.length)}.0`;
  return `${sign}${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
}

// ------------------------------------------------------------- format(x, .Nf)
/**
 * Python's `format(x, ",.Nf")` / `f"{x:+.Nf}"`, used by `report.py`'s `f()`.
 *
 * `toFixed` is not this: it rounds half away from zero, where Python's format
 * rounds half to even on the exact value, and it has no thousands grouping.
 * The sign is taken from the original value, so `-0.04` at one place is
 * `-0.0`, exactly as Python prints it.
 */
export function pyFormatFixed(
  x: number,
  nd: number,
  opts: { grouping?: boolean; sign?: boolean } = {},
): string {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return (x < 0 ? '-' : opts.sign ? '+' : '') + 'inf';
  const { neg, int, frac } = exactDecimal(x);
  const r = roundDecimalHalfEven(int, frac, nd);
  let intPart = r.int.replace(/^0+(?=\d)/, '');
  if (opts.grouping) intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = neg ? '-' : opts.sign ? '+' : '';
  return `${sign}${intPart}${nd > 0 ? '.' + r.frac : ''}`;
}

// ------------------------------------------------------------- the summations
/**
 * The only route from row data into the integer sum.
 *
 * `BigInt()` throws `RangeError` on a non-integral number, and R1 asks for that
 * to be a stated failure mode rather than an accident: a field that carries the
 * `Int` brand without being integral is a schema bug, and a throw beats a
 * silently wrong published column.
 */
export function toBigInt(v: number): bigint {
  if (!Number.isInteger(v)) {
    throw new RangeError(
      `toBigInt: ${v} carries the Int brand but is not integral -- ` +
        'a field declared Int in the schema was produced by something other ' +
        'than 1-arg pyRoundInt.',
    );
  }
  return BigInt(v);
}

/**
 * `sum()` over Python ints: exact, arbitrary precision, returns `bigint`.
 *
 * Returning `bigint` is the requirement, not an implementation choice.
 * `sum([9007199254740993, 2, 2, 2])` is `...999` in Python; exact BigInt
 * accumulation gives `...999n`; `Number()` of that gives `...1000`. Narrowing
 * inside the helper would make a correct implementation fail its own fixture,
 * and fail it differently from the naive fold it replaces (`...998`). The
 * narrowing happens at the pipeline call site, where the 296x headroom is the
 * stated licence for it.
 */
export function pySumInt(values: readonly bigint[]): bigint {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

/**
 * `sum()` over Python floats: Neumaier compensated summation.
 *
 * Python 3.12 moved `sum()` to Neumaier; a JS `reduce((a, b) => a + b)` is a
 * naive fold, and the two differ on about a third of random 6-element sums.
 */
export function pySumFloat(values: readonly number[]): number {
  let f = 0.0;
  let c = 0.0;
  for (const x of values) {
    const t = f + x;
    if (Math.abs(f) >= Math.abs(x)) c += f - t + x;
    else c += x - t + f;
    f = t;
  }
  return f + c;
}

/**
 * `sum()` over a mixed column, and its transition step is not what it looks
 * like.
 *
 * CPython's integer fast path does not hand over to a compensated loop. On
 * meeting the first float it materialises the exact integer prefix, performs
 * ONE ordinary uncompensated addition, and only then initialises `c = 0.0`.
 * The residual of that single add is discarded. And inside the float loop only
 * exact floats go through Neumaier -- an exact int is added with a plain
 * `f += (double)value` and `c` is left untouched, so compensation is suspended
 * for every integer after the transition too.
 *
 * Compensating either of those diverges from `sum()` on exactly the shapes the
 * override path produces: an `Int` column with one float override, and a float
 * column with one int override. Getting the transition wrong alone differs on
 * 12.1% of random mixed lists.
 */
export function pySum(values: readonly PyNum[]): number {
  let i = 0;
  let prefix = 0n;
  // the exact integer prefix
  for (; i < values.length; i++) {
    const v = values[i];
    if (v.kind !== 'int') break;
    prefix += v.value;
  }
  if (i === values.length) return Number(prefix);

  // ONE plain add, no compensation, and only then does the float loop start
  let f = Number(prefix) + (values[i] as { kind: 'float'; value: number }).value;
  let c = 0.0;
  for (i += 1; i < values.length; i++) {
    const v = values[i];
    if (v.kind === 'int') {
      f += Number(v.value); // uncompensated, c untouched
      continue;
    }
    const x = v.value;
    const t = f + x;
    if (Math.abs(f) >= Math.abs(x)) c += f - t + x;
    else c += x - t + f;
    f = t;
  }
  return f + c;
}
