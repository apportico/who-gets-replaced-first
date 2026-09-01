#!/usr/bin/env node
/**
 * 0007 R7. The two-way check on the `Int` brand.
 *
 * R7's case 4 -- a non-`Int` column routed into the integer sum -- is only
 * evidence for the brand if it stops erroring when the brand is removed. A case
 * that errors identically with `Int` aliased to `number` proves something about
 * `bigint` versus `number`, not about the schema.
 *
 * Both phrasings that look right fail this check, which is why it exists:
 *
 *   - "pass `population_15_24` to a `pySum` taking `bigint`" fails `tsc` for
 *     number-vs-bigint -- but so does passing `clerical_employed`, which IS an
 *     `Int`, since a branded number is still a number.
 *   - an overloaded `pySum` with a `readonly number[]` float signature resolves
 *     the float column to that overload with no error at all.
 *
 * So: copy the pipeline's TypeScript into a temp tree, alias `Int` to a plain
 * `number` there, and require that `tsc` then reports TS2578 (unused
 * `@ts-expect-error`) on the committed case. With the brand present the same
 * tree compiles clean, which `npm run typecheck` already asserts.
 *
 *     node scripts/check-schema-brand.mjs
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PIPELINE = path.join(ROOT, 'pipeline');

const BRANDED = `export type Int = number & { readonly [intBrand]: 'int' };`;
const UNBRANDED = `export type Int = number;`;

const tmp = mkdtempSync(path.join(tmpdir(), 'wgrf-brand-'));
try {
  // Only the TypeScript, only what tsc reads. `raw/` is 133MB of cache and
  // `data/` is the outputs; neither is a compilation input.
  cpSync(PIPELINE, path.join(tmp, 'pipeline'), {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(PIPELINE, src);
      if (rel === 'raw' || rel.startsWith('raw' + path.sep)) return false;
      if (rel === 'data' || rel.startsWith('data' + path.sep)) return false;
      if (rel.includes('fixtures')) return false;
      return true;
    },
  });
  cpSync(path.join(ROOT, 'node_modules', '@types'),
    path.join(tmp, 'node_modules', '@types'), { recursive: true });

  const schemaPath = path.join(tmp, 'pipeline', 'schema.ts');
  const schema = readFileSync(schemaPath, 'utf8');
  if (!schema.includes(BRANDED)) {
    console.error(
      'check-schema-brand: could not find the Int brand declaration in ' +
        'pipeline/schema.ts. It reads:\n  ' + BRANDED + '\n' +
        'If the declaration was reworded, update this script in the same change ' +
        '-- silently skipping the two-way check would leave R7 case 4 unproven.',
    );
    process.exit(1);
  }
  writeFileSync(schemaPath, schema.replace(BRANDED, UNBRANDED));

  let output = '';
  try {
    execFileSync(
      process.execPath,
      [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
        '-p', path.join(tmp, 'pipeline', 'tsconfig.json')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (e) {
    output = (e.stdout ?? '') + (e.stderr ?? '');
  }

  const hit = output
    .split('\n')
    .find((l) => l.includes('schema.types.ts') && l.includes('TS2578'));
  if (!hit) {
    console.error(
      'check-schema-brand FAILED.\n\n' +
        'With `Int` aliased to a plain `number`, tsc did NOT report TS2578 on ' +
        "R7's case 4 in pipeline/tests/schema.types.ts.\n\n" +
        'That means the case does not depend on the brand: it would error the ' +
        'same way with the brand deleted, so it is not evidence for the brand ' +
        'and R7 is not met. Rephrase the case at the pySumInt CALL SITE over a ' +
        'COLUMN (rows.map(r => r.population_15_24)), not over a scalar field, ' +
        'and make `toBigInt` the only route in.\n\n' +
        'tsc said:\n' + (output.trim() || '(nothing — the file compiled clean)'),
    );
    process.exit(1);
  }
  console.log(`check-schema-brand PASSED — brand removed, tsc reports: ${hit.trim()}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
