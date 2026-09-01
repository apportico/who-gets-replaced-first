#!/usr/bin/env node
/**
 * Build the golden-master fixture from a populated pipeline/raw/ (0004 R7).
 *
 *     node pipeline/tests/make-fixture.ts
 *
 * Slices the response cache to the 32 areas `--pilot` fetches and writes it
 * gzipped under tests/fixtures/raw/. Committed rather than left as an opaque
 * blob: a fixture nobody can regenerate is a fixture nobody can trust, and the
 * slicing rules below are the part worth reviewing.
 *
 * Requires a full `pipeline/raw/`, which is gitignored and absent from a fresh
 * clone -- run the pipeline once first. This is a maintenance script, not part
 * of the suite; the tests read the committed output and never invoke it. It is
 * named `make-fixture.ts` rather than `*.test.ts` so `npm run test:pipeline`
 * does not pick it up.
 *
 * Three rules, each load-bearing:
 *
 *   1. Slice by AREA only, never by row content. Filtering to the AGE/OCU
 *      values the pipeline currently keeps would shrink the fixture further
 *      (6.77MB -> 0.39MB gzipped, measured) but would bake today's filter
 *      criteria into the test data: widen the filter later and the rows would
 *      be silently absent rather than visibly wrong.
 *   2. countries.json ships WHOLE. buildReference iterates all 295 areas and
 *      filters by scope afterwards, and it keys on `id`, not the
 *      `countryiso3code` the indicator files use. Slicing it by the indicator
 *      rule would empty it. 0.01MB gzipped, so there is nothing to gain anyway.
 *   3. Eurostat is EXCLUDED. crosscheck runs only in the full branch, never
 *      from `run(scope, "pilot")`, so shipping it would be dead weight.
 *
 * 0007 R10: ported from `tests/make_fixture.py`. The DECOMPRESSED output is
 * byte-identical to the Python's, verified head-to-head against it on the same
 * cache before the Python was deleted. The gzip container is not and cannot be:
 * `zlib.gzipSync` and Python's `GzipFile` differ in the header they write and
 * in their deflate choices, which is why the committed fixture is read by
 * decompressing and never compared as bytes. **This change does not regenerate
 * the fixture** -- the committed one still produces a byte-identical pilot CSV,
 * which `golden_master.test.ts` asserts.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as R from '../run.ts';
import { dumps, parseTagged, type PyJson, type TaggedJson } from '../pyjson.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE = path.join(HERE, '..');
const RAW = path.join(PIPELINE, 'raw');
const OUT = path.join(HERE, 'fixtures', 'raw');

const gz = (data: string | Buffer) =>
  gzipSync(typeof data === 'string' ? Buffer.from(data, 'utf8') : data, { level: 9 });

/**
 * Keep the header plus every row whose REF_AREA is in scope.
 *
 * The `\r` strip is Python's universal-newline read, which the original did for
 * free by opening the file in text mode: it turned every CRLF into LF on the
 * way in and wrote LF back out. Reading bytes and splitting on `\n` leaves the
 * `\r` attached, which re-emits CRLF and makes every row one byte longer than
 * the committed fixture. Measured: 63,281 extra bytes on the age x occupation
 * flow alone.
 */
function sliceIlo(src: string, dest: string, scope: ReadonlySet<string>): number {
  const lines = readFileSync(src, 'utf8').split('\n').map((l) => l.replace(/\r$/, ''));
  const header = lines[0];
  const area = header.split(',').indexOf('REF_AREA');
  const kept: string[] = [];
  for (const line of lines.slice(1)) {
    if (line === '') continue;
    if (scope.has(line.split(',')[area])) kept.push(line);
  }
  writeFileSync(dest, gz(header + '\n' + kept.map((l) => l + '\n').join('')));
  return kept.length;
}

/**
 * Keep observations for in-scope areas; preserve the [meta, rows] shape.
 *
 * Read through `parseTagged`, not `JSON.parse`, and this is the spec's own
 * finding biting a maintenance script. The World Bank payload carries integers
 * -- `page`, `pages`, `per_page`, `total`, and every `date` -- and `JSON.parse`
 * erases the distinction, so re-serialising through a writer that defaults a
 * bare `number` to Python-float spelling turns `1` into `1.0`. Measured against
 * the original generator on the same cache: 1,032 extra bytes per indicator
 * file, all of them `.0`.
 *
 * The tokenising reader keeps each literal's Python type, so `dumps` writes
 * back what was there.
 */
function sliceWb(src: string, dest: string, scope: ReadonlySet<string>): number | 'ALL' {
  const payload = parseTagged(readFileSync(src, 'utf8'));
  if (!(Array.isArray(payload) && payload.length > 1 && Array.isArray(payload[1]))) {
    writeFileSync(dest, gz(readFileSync(src)));
    return 0;
  }
  const rows = (payload[1] as TaggedJson[]).filter((r) => {
    const iso = (r as Record<string, TaggedJson>).countryiso3code;
    return scope.has(typeof iso === 'string' ? iso : '');
  });
  writeFileSync(dest, gz(dumps([payload[0], rows] as unknown as PyJson)));
  return rows.length;
}

function main(): void {
  if (!existsSync(RAW)) {
    process.stderr.write(`no cache at ${RAW} -- run the pipeline once first\n`);
    process.exit(1);
  }

  const scope = R.pilotScope(); // the same 32 areas --pilot fetches
  process.stdout.write(`slicing ${scope.size} areas into ${OUT}\n`);

  for (const sub of ['worldbank', 'ilostat']) {
    mkdirSync(path.join(OUT, sub), { recursive: true });
  }

  let total = 0;
  for (const name of readdirSync(path.join(RAW, 'ilostat')).sort()) {
    if (!name.endsWith('.csv')) continue;
    const dest = path.join(OUT, 'ilostat', name + '.gz');
    const kept = sliceIlo(path.join(RAW, 'ilostat', name), dest, scope);
    const size = statSync(dest).size;
    total += size;
    process.stdout.write(
      `  ilostat/${name.padEnd(34)} ${String(kept).padStart(7)} rows  ` +
        `${(size / 1e6).toFixed(2).padStart(5)}MB gz\n`,
    );
  }

  for (const name of readdirSync(path.join(RAW, 'worldbank')).sort()) {
    if (!name.endsWith('.json')) continue;
    const src = path.join(RAW, 'worldbank', name);
    const dest = path.join(OUT, 'worldbank', name + '.gz');
    let kept: number | 'ALL';
    if (name === 'countries.json') {
      // rule 2: whole, not sliced
      writeFileSync(dest, gz(readFileSync(src)));
      kept = 'ALL';
    } else {
      kept = sliceWb(src, dest, scope);
    }
    const size = statSync(dest).size;
    total += size;
    process.stdout.write(
      `  worldbank/${name.padEnd(32)} ${String(kept).padStart(7)} obs   ` +
        `${(size / 1e6).toFixed(2).padStart(5)}MB gz\n`,
    );
  }

  process.stdout.write(`\ntotal ${(total / 1e6).toFixed(2)}MB gzipped\n`);
  if (total > 2_000_000) {
    process.stdout.write(
      'WARNING: over the 2MB bound for this fixture -- 0004 R7 set 1MB against ' +
        'three ILO flows; 0010 R9 added a fourth and raised it. See ' +
        "golden_master.test.ts's size-bound test for why it was raised rather " +
        'than met by slicing rule 1 away.\n',
    );
  }
}

if (import.meta.filename === process.argv[1]) main();
