/**
 * 0007 R4. `json.dump(payload, f, separators=(",", ":"))`, reproduced.
 *
 * A stock `JSON.stringify` loses 1,910 bytes on `src/data/global_labor.json`,
 * and it loses them three different ways, so the port has to reproduce three
 * things rather than one:
 *
 *   - **numbers** through `pyStr`, so `79.0` does not become `79`;
 *   - **`separators=(",", ":")`** spacing, no space after `,` or `:`;
 *   - **`ensure_ascii=True`** escaping. Both committed files are pure ASCII
 *     with zero bytes above 0x7f, which `JSON.stringify` would emit raw as
 *     UTF-8. Python's escape set is not JavaScript's -- it escapes everything
 *     outside ` ` to `~`, which includes 0x7f, and JavaScript does not.
 *
 * The two committed files test different halves. All 108 escapes live in
 * `global_labor.json`; `global_labor_timeseries.json` has zero, so its
 * 5,870-byte loss is pure number formatting and it would pass `cmp` against a
 * completely wrong escape set. A green timeseries diff is not evidence the
 * escaping is right.
 *
 * This module also carries the JSON *reader* R1 needs, which is not
 * `JSON.parse`: the override path's whole point is the int/float distinction
 * that `JSON.parse` erases.
 */
import { pyStr, type PyNum } from './pynum.ts';

// ------------------------------------------------------------------- writing
/** What `json.dump` accepts, with numbers still carrying their Python type. */
export type PyJson =
  | null
  | boolean
  | string
  | number
  | PyNum
  | readonly PyJson[]
  | { readonly [key: string]: PyJson };

function isPyNum(v: object): v is PyNum {
  return 'kind' in v && 'value' in v && (v.kind === 'int' || v.kind === 'float');
}

/**
 * Python's `ensure_ascii` escaping, which is `json.encoder.py_encode_basestring_ascii`:
 * `\\` and `"` escaped, the five short escapes, every other code point outside
 * 0x20..0x7e as `\uXXXX` in LOWERCASE hex, and astral characters as a
 * surrogate pair of two `\uXXXX` escapes.
 */
export function escapeAscii(s: string): string {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (cp >= 0x20 && cp <= 0x7e) out += ch;
    else if (cp <= 0xffff) out += '\\u' + cp.toString(16).padStart(4, '0');
    else {
      // Python emits the surrogate pair, not the astral code point.
      const v = cp - 0x10000;
      const hi = 0xd800 + (v >> 10);
      const lo = 0xdc00 + (v & 0x3ff);
      out += '\\u' + hi.toString(16).padStart(4, '0');
      out += '\\u' + lo.toString(16).padStart(4, '0');
    }
  }
  return out + '"';
}

/**
 * The number half. A plain `number` is treated as a Python float, because that
 * is what almost every value in these payloads is; anything that was a Python
 * `int` arrives tagged, or as a value the caller has already stringified
 * through the `Int` column registry.
 */
function encodeNumber(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return 'Infinity';
  if (v === -Infinity) return '-Infinity';
  return pyStr(v);
}

export function dumps(value: PyJson): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return escapeAscii(value);
  if (typeof value === 'number') return encodeNumber(value);
  if (Array.isArray(value)) return '[' + value.map(dumps).join(',') + ']';
  if (typeof value === 'object') {
    if (isPyNum(value)) {
      return value.kind === 'int' ? value.value.toString() : encodeNumber(value.value);
    }
    // NOT insertion order in general, and the difference is real. A Python
    // dict with `sort_keys=False` preserves insertion order for every key;
    // `Object.entries` returns integer-like keys first, in ascending numeric
    // order, whenever they were inserted. So this module -- whose entire job is
    // byte fidelity to `json.dump` -- genuinely disagrees with it on one shape:
    // an object keyed by numeric strings inserted out of order.
    //
    // It is inert today because the one such payload sorts before inserting:
    // `panel.ts`'s year keys go in ascending, so the two orders coincide. That
    // dependency is load-bearing and is named at both ends; unsort it and the
    // timeseries payload reorders silently, surfacing only as an unexplained
    // `cmp` diff. Nothing else in the pipeline keys an object by a number.
    const entries = Object.entries(value as Record<string, PyJson>);
    return '{' + entries.map(([k, v]) => escapeAscii(k) + ':' + dumps(v)).join(',') + '}';
  }
  throw new TypeError(`not JSON serialisable: ${String(value)}`);
}

// ------------------------------------------------------------------- reading
/**
 * 0007 R1. A JSON reader that types numbers from the raw token text.
 *
 * `JSON.parse` cannot see the distinction the override path depends on: both
 * `15000000` and `15000000.0` arrive as `number` with `Number.isInteger` true.
 * In Python they are `int` and `float`, which changes what `sum()` returns for
 * the column they land in -- and R3 could not catch it, because `overrides` is
 * `{}` today, so byte identity passes and the divergence would ship unseen.
 *
 * The rule is the token's spelling, the same reason R2 hand-rolls a CSV reader
 * rather than trusting a stock one: a literal containing `.`, `e` or `E` is a
 * float, anything else is an integer.
 */
export type TaggedJson =
  | null
  | boolean
  | string
  | PyNum
  | TaggedJson[]
  | { [key: string]: TaggedJson };

export function parseTagged(text: string): TaggedJson {
  let i = 0;

  const error = (msg: string): never => {
    throw new SyntaxError(`${msg} at position ${i}`);
  };
  const ws = () => {
    while (i < text.length && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++;
  };
  const literal = (word: string) => {
    if (text.startsWith(word, i)) {
      i += word.length;
      return true;
    }
    return false;
  };

  const parseString = (): string => {
    if (text[i] !== '"') error('expected a string');
    i++;
    let out = '';
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === '\\') {
        i++;
        const esc = text[i++];
        if (esc === 'u') {
          out += String.fromCharCode(parseInt(text.slice(i, i + 4), 16));
          i += 4;
        } else if (esc === 'n') out += '\n';
        else if (esc === 't') out += '\t';
        else if (esc === 'r') out += '\r';
        else if (esc === 'b') out += '\b';
        else if (esc === 'f') out += '\f';
        else out += esc; // \" \\ \/
        continue;
      }
      out += ch;
      i++;
    }
    return error('unterminated string');
  };

  const parseNumber = (): PyNum => {
    const start = i;
    if (text[i] === '-' || text[i] === '+') i++;
    while (i < text.length && /[0-9.eE+-]/.test(text[i])) i++;
    const token = text.slice(start, i);
    // THE rule: the spelling decides, not the value.
    if (/[.eE]/.test(token)) return { kind: 'float', value: Number(token) };
    return { kind: 'int', value: BigInt(token) };
  };

  const parseValue = (): TaggedJson => {
    ws();
    const ch = text[i];
    if (ch === '{') {
      i++;
      const out: { [key: string]: TaggedJson } = {};
      ws();
      if (text[i] === '}') {
        i++;
        return out;
      }
      for (;;) {
        ws();
        const key = parseString();
        ws();
        if (text[i] !== ':') error('expected ":"');
        i++;
        out[key] = parseValue();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          return out;
        }
        error('expected "," or "}"');
      }
    }
    if (ch === '[') {
      i++;
      const out: TaggedJson[] = [];
      ws();
      if (text[i] === ']') {
        i++;
        return out;
      }
      for (;;) {
        out.push(parseValue());
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          return out;
        }
        error('expected "," or "]"');
      }
    }
    if (ch === '"') return parseString();
    if (literal('true')) return true;
    if (literal('false')) return false;
    if (literal('null')) return null;
    if (ch === '-' || ch === '+' || (ch >= '0' && ch <= '9')) return parseNumber();
    return error(`unexpected character ${JSON.stringify(ch)}`);
  };

  const value = parseValue();
  ws();
  if (i !== text.length) error('trailing content');
  return value;
}

/** Drop the tags, for the many readers that only want the value. */
export function untag(v: TaggedJson): unknown {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(untag);
  if ('kind' in v && 'value' in v) {
    const n = v as PyNum;
    return n.kind === 'int' ? Number(n.value) : n.value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) out[k] = untag(val as TaggedJson);
  return out;
}
