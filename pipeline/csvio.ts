/**
 * 0007 R2. A hand-rolled CSV reader/writer, zero runtime dependencies.
 *
 * Python's default dialect: `,` delimiter, `"` quotechar, doubled quotes,
 * QUOTE_MINIMAL, and `\r\n` terminators (all six committed CSVs are CRLF,
 * because `run.py` opens them with `newline=""`). A stock library would be a
 * dependency and would still have to be configured into exactly this shape;
 * hand-rolling it is both smaller and checkable, and R2's acceptance is that
 * the six committed files round-trip byte for byte.
 *
 * The field-size ceiling matches `csv.field_size_limit(10_000_000)` at
 * `build.py:10`, so a malformed quote in a source file fails loudly here in the
 * same way rather than consuming the rest of the input.
 */

const FIELD_SIZE_LIMIT = 10_000_000;

/** Rows of raw cells. Quoting is resolved; nothing is coerced to a number. */
export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false; // a field exists once any character (or quote) is seen

  const endField = () => {
    row.push(field);
    field = '';
    started = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (field.length > FIELD_SIZE_LIMIT) {
      throw new RangeError(`csv field larger than ${FIELD_SIZE_LIMIT} characters`);
    }
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !started) {
      quoted = true;
      started = true;
      continue;
    }
    if (ch === ',') {
      endField();
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
      continue;
    }
    if (ch === '\n') {
      endRow();
      continue;
    }
    field += ch;
    started = true;
  }
  // A trailing terminator ends the last row; anything else leaves a partial one.
  if (field.length > 0 || row.length > 0 || started) endRow();
  return rows;
}

/**
 * The same parser, streaming, yielding only the columns asked for.
 *
 * `readCsv` materialises every cell, which is fine for the six committed
 * outputs and wrong for a 55MB ILOSTAT flow read for four of its columns. The
 * grammar is identical -- this walks the same state machine and simply does not
 * keep what it is not asked for.
 */
export function* iterCsvColumns(text: string, cols: readonly string[]): Generator<string[]> {
  let header: string[] | null = null;
  let want: number[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  const endRow = (): string[] | null => {
    row.push(field);
    field = '';
    started = false;
    const finished = row;
    row = [];
    return finished;
  };

  for (let i = 0; i <= text.length; i++) {
    const ch = i < text.length ? text[i] : '';
    const atEnd = i === text.length;
    if (!atEnd && quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (!atEnd && ch === '"' && !started) {
      quoted = true;
      started = true;
      continue;
    }
    if (!atEnd && ch === ',') {
      row.push(field);
      field = '';
      started = false;
      continue;
    }
    if (atEnd || ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (atEnd && field === '' && row.length === 0 && !started) break;
      const cells = endRow() as string[];
      if (header === null) {
        header = cells;
        want = cols.map((c) => (header as string[]).indexOf(c));
      } else {
        yield want.map((idx) => (idx >= 0 ? (cells[idx] ?? '') : ''));
      }
      continue;
    }
    field += ch;
    started = true;
  }
}

/** `csv.DictReader`: the first row is the header, every row becomes an object. */
export function readCsvDict(text: string): Record<string, string>[] {
  const rows = readCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const out: Record<string, string> = {};
    header.forEach((name, i) => {
      out[name] = cells[i] ?? '';
    });
    return out;
  });
}

/**
 * QUOTE_MINIMAL: quote only when the field carries the delimiter, the
 * quotechar, or a terminator character. Python also quotes on the escapechar,
 * which the default dialect leaves unset.
 */
function quote(field: string): string {
  if (/[",\r\n]/.test(field)) return '"' + field.replace(/"/g, '""') + '"';
  return field;
}

/** One row, CRLF-terminated. Cells arrive already formatted -- see `schema.ts`. */
export function writeCsvRow(cells: readonly string[]): string {
  return cells.map(quote).join(',') + '\r\n';
}

/** A whole file: header row plus the rows, all CRLF-terminated. */
export function writeCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  let out = writeCsvRow(header);
  for (const row of rows) out += writeCsvRow(row);
  return out;
}
