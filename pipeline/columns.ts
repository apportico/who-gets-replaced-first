/**
 * 0007 R3/R4/R7. Where a row value becomes a byte.
 *
 * This is the narrowest and most load-bearing part of the port. In Python the
 * writers call `str(value)` and `json.dump`, and the object's own type decides
 * whether `2989466` or `2989466.0` reaches the file. TypeScript has one
 * `number`, so that decision has to come from somewhere else, and the only
 * honest somewhere is the schema's declared `Int` brand -- never
 * `Number.isInteger`, which is true of `14455.0` and would silently convert a
 * Python float into an integer in a published column.
 *
 * Two callers, one rule:
 *   - `formatCell` produces the CSV cell (`csv.writer`'s `str()`, with `None`
 *     as the empty field);
 *   - `cellJson` produces the JSON value, tagged so `pyjson.dumps` writes
 *     `79.0` where Python wrote `79.0`.
 *
 * The override registry wins over the declared kind, because in Python an
 * override assigns the raw JSON value and its literal spelling is its type.
 */
import { pyStr, type PyNum } from './pynum.ts';
import { isIntColumn } from './schema.ts';
import { overrideKinds } from './overrides.ts';
import type { Row, RowValue } from './build.ts';
import type { PyJson } from './pyjson.ts';

/** Which Python type this column's values have, before any override. */
export function declaredKind(field: string): 'int' | 'float' {
  return isIntColumn(field) ? 'int' : 'float';
}

function kindFor(field: string, row?: Row): 'int' | 'float' {
  const override = row ? overrideKinds.get(row)?.get(field) : undefined;
  return override ?? declaredKind(field);
}

/**
 * `csv.writer`'s rendering of one value.
 *
 * `None` becomes the empty field, and everything else goes through `str()`:
 * `repr` for a float, the digits for an int, the text for a string, and
 * `True` / `False` for a bool.
 */
export function formatCell(field: string, value: RowValue | boolean, row?: Row): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join('; ');
  return kindFor(field, row) === 'int' ? String(value) : pyStr(value);
}

/** The same decision, for the JSON side. */
export function cellJson(field: string, value: RowValue | boolean, row?: Row): PyJson {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join('; ');
  if (kindFor(field, row) === 'int') {
    return { kind: 'int', value: BigInt(value) } satisfies PyNum;
  }
  return { kind: 'float', value } satisfies PyNum;
}
