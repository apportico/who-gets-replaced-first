/**
 * One definition of "has this tree changed", for the two modules that need it.
 *
 * `golden_master.test.ts` uses it to prove the pilot run never writes where the
 * expected output is compared from; `app_payloads.test.ts` uses it to prove the
 * payload guards never rewrite the artifacts they check. Copied rather than
 * shared, the two would drift, and the second is the one with the subtler
 * requirement -- so the stricter definition lives here and both get it.
 *
 * 0007: ported from `test_golden_master._tree_digest` and
 * `test_app_payloads._tree_state`.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** Content hash of every file under `dir`, so a rewrite is detectable. */
export function treeDigest(dir: string): string {
  const h = createHash('sha256');
  const walk = (current: string): void => {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const name of entries.filter((e) => !e.isDirectory()).map((e) => e.name).sort()) {
      const full = path.join(current, name);
      h.update(path.relative(dir, full));
      h.update(readFileSync(full));
    }
    for (const name of entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
      walk(path.join(current, name));
    }
  };
  walk(dir);
  return h.digest('hex');
}

/**
 * Content digest AND every file's mtime, because content is not enough.
 *
 * A content digest cannot see an idempotent write. Driving `panel.exportPanel`
 * at `run.DATA` rewrites `global_labor_panel.csv` from rows read out of that
 * same file, and the round-trip is byte-perfect today -- the reader maps `""`
 * to null and the writer writes null back as `""` -- so the digest is
 * unchanged, `git status` is clean, and the write is invisible.
 *
 * Its harmlessness is accidental. It holds only while the CSV round-trips
 * byte-perfectly, which is a property of today's values rather than a
 * guarantee. mtime sees the write itself, so the guard no longer depends on the
 * write happening to be a no-op.
 */
export function treeState(dir: string): string {
  const mtimes: string[] = [];
  const walk = (current: string): void => {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const name of entries.filter((e) => !e.isDirectory()).map((e) => e.name).sort()) {
      const full = path.join(current, name);
      mtimes.push(`${path.relative(dir, full)}:${statSync(full, { bigint: true }).mtimeNs}`);
    }
    for (const name of entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
      walk(path.join(current, name));
    }
  };
  walk(dir);
  return `${treeDigest(dir)}\n${mtimes.join('\n')}`;
}
