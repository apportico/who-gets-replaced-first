/**
 * The committed report cannot drift from the code that writes it.
 *
 * `pipeline/summary_report.md` is the document the root `README.md` sends
 * readers to, and it is generated rather than hand-written -- so nothing
 * stopped it disagreeing with the generator. It did, for the worst possible
 * field: the entry-level squeeze index moved from `DERIVED` to `MODELED` in
 * `ff507b0`, and the committed report was never regenerated, so the published
 * findings labelled an analyst-weighted composite as arithmetic on official
 * statistics (#54).
 *
 * The drift had two independent causes -- a stale committed file, and two entry
 * points producing different documents out of one function -- so both are
 * checked, along with the tier rule itself.
 *
 * 0007: ported from `tests/test_report.py`. This is also R6's acceptance in
 * test form: `summary_report.md` is byte-identical after excluding exactly one
 * line, the `Generated <date>` stamp.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as C from '../config.ts';
import * as report from '../report.ts';
import * as crosscheck from '../crosscheck.ts';
import * as fixtures from './fixtures.ts';
import { readCsvDict } from '../csvio.ts';
import type { Row } from '../build.ts';

const PIPELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Write the report through the documented entry point, into a temp file.
 *
 * Uses `loadSensitivity()` exactly as `report.ts`'s `__main__` block does, so
 * this asserts on what a contributor running `npm run report` actually gets.
 */
function regenerate(): string[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'wgrf-report-'));
  const p = path.join(dir, 'report.md');
  try {
    fixtures.quiet(() => report.write(report.load(), p, report.loadSensitivity()));
    return readFileSync(p, 'utf8').split('\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function committed(): string[] {
  return readFileSync(path.join(PIPELINE, 'summary_report.md'), 'utf8').split('\n');
}

/**
 * Drop the one line that legitimately differs on every run.
 *
 * The generator stamps `Generated <today>`, so a fresh run always differs
 * there. That is the ONLY licensed difference -- R6 says one named line, not a
 * general "diffs explained" allowance -- so this removes exactly the lines
 * starting with `Generated `, and any second differing line is drift.
 */
function withoutDate(lines: string[]): string[] {
  return lines.filter((ln) => !ln.startsWith('Generated '));
}

test('R6: regenerating changes nothing but the date', () => {
  // Fails if someone edits the generator without regenerating, which is
  // exactly how the DERIVED/MODELED drift in #54 survived from `ff507b0`.
  assert.deepEqual(withoutDate(committed()), withoutDate(regenerate()));
});

test('the sensitivity paragraph is present', () => {
  // `write(..., sensitivity=null)` skips the paragraph carrying the
  // median-4-places claim that CLAUDE.md cites as the defence of the exposure
  // weights. Before #54 the `__main__` block passed nothing, so the documented
  // regeneration path produced a report missing it -- a different document
  // from the pipeline's, out of the same function.
  const text = regenerate().join('\n');
  assert.ok(text.includes('**AI exposure sensitivity.**'));
  assert.ok(text.includes('moves the median country by only'));
});

test('the sensitivity summary matches the definition of record', () => {
  // Pinning the shape is not enough: a key set, a profile list, `n > 0` and
  // `max >= median` all hold under a median that is subtly the wrong one -- a
  // true median averages the middle pair on even `n`, where the summariser
  // takes the upper-middle value unconditionally. `n` is the count of
  // countries carrying `white_collar_pct`, so its parity flips with any
  // ILOSTAT refresh, and the two would print different numbers on the next
  // even count.
  const rows = readCsvDict(
    readFileSync(path.join(PIPELINE, 'data', 'ai_exposure_sensitivity.csv'), 'utf8'),
  );
  const moves = rows.map((r) => parseInt(r.max_rank_movement, 10)).sort((a, b) => a - b);
  const sens = report.loadSensitivity();
  assert.equal(sens.median_rank_movement, moves[Math.floor(moves.length / 2)]);
  assert.equal(sens.max_rank_movement, moves[moves.length - 1]);
  assert.equal(sens.n, moves.length);
  assert.deepEqual(sens.profiles, ['balanced', 'clerical_heavy', 'cognitive_uniform']);
});

test('crosscheck delegates to the shared summariser', () => {
  // This is the invariant that keeps the two entry points in step, and it is a
  // property of the *call site*, not of the summariser. Asserting that two
  // calls to the same function agree stays green if `crosscheck` reverts to
  // its own `sorted(moves)[len / 2]` -- green against precisely the change
  // that reintroduces the divergence.
  //
  // So the delegation itself is asserted, by replacing the summariser with a
  // sentinel and checking `sensitivity()` returns it. The replacement goes on
  // `report.hooks` because an ES module's exported bindings are read-only;
  // Python patched the module attribute for the same reason.
  const rowsByIso = new Map<string, Row>([
    ['AAA', { iso3: 'AAA', country_name: 'Country AAA', row_type: 'country', white_collar_pct: 40.0 }],
    ['BBB', { iso3: 'BBB', country_name: 'Country BBB', row_type: 'country', white_collar_pct: 20.0 }],
  ]);
  const fields = Array.from(C.ISCO_GROUPS.values(), ([f]) => f);
  const profiles = {
    p1: Object.fromEntries(fields.map((f) => [f, 0.5])),
    p2: Object.fromEntries(fields.map((f) => [f, 0.9])),
  };
  const sentinel = {
    median_rank_movement: -1, max_rank_movement: -1,
    worst_country: 'SENTINEL', n: -1, profiles: [] as string[],
  };

  const original = report.hooks.summariseSensitivity;
  report.hooks.summariseSensitivity = () => sentinel;
  const dir = mkdtempSync(path.join(tmpdir(), 'wgrf-sens-'));
  let got;
  try {
    got = fixtures.quiet(() => crosscheck.sensitivity(rowsByIso, profiles, dir)).value;
  } finally {
    report.hooks.summariseSensitivity = original;
    rmSync(dir, { recursive: true, force: true });
  }

  assert.equal(
    got,
    sentinel,
    'crosscheck.sensitivity stopped delegating to report.hooks.summariseSensitivity, ' +
      'so `npm run pipeline` and `npm run report` can print different numbers again.',
  );
});

test('the summariser is indifferent to int or string input', () => {
  // A real property of the shared summariser, named for what it checks. The
  // live path hands it `max_rank_movement` as a number; the CSV parse hands it
  // a string. Both callers must get the same answer. Worth pinning on its own,
  // but it is not the delegation invariant above.
  const fromCsv = readCsvDict(
    readFileSync(path.join(PIPELINE, 'data', 'ai_exposure_sensitivity.csv'), 'utf8'),
  ) as unknown as { max_rank_movement: string; country_name: string }[];
  const asLive = fromCsv.map((r) => ({
    ...r,
    max_rank_movement: parseInt(r.max_rank_movement, 10) as unknown as string,
  }));
  const profiles = ['balanced', 'clerical_heavy', 'cognitive_uniform'];
  assert.deepEqual(
    report.summariseSensitivity(fromCsv, profiles),
    report.summariseSensitivity(asLive, profiles),
  );
});

test('a missing sensitivity CSV raises rather than dropping the section', () => {
  // Absence must be loud, not a silently shorter report. `write()` reads a
  // null sensitivity as "skip the paragraph". If `loadSensitivity()` returned
  // null for a missing file, `npm run report` would overwrite the tracked
  // report without the median-N-places claim while printing `wrote ...` --
  // #54's second defect with a new trigger. The file is committed, so its
  // absence is a broken checkout.
  const empty = mkdtempSync(path.join(tmpdir(), 'wgrf-empty-'));
  const original = report.state.HERE;
  report.state.HERE = empty;
  try {
    assert.throws(() => report.loadSensitivity(), { code: 'ENOENT' });
  } finally {
    report.state.HERE = original;
    rmSync(empty, { recursive: true, force: true });
  }
});

test('no field is given two different tiers in the report', () => {
  // One field, one tier word, wherever the report describes it.
  //
  // Comparing the report's tier strings against the generator's source cannot
  // fail: the report is generated from those very strings. This asserts the
  // property instead -- for each field whose tier `config.FIELD_TIERS`
  // records, no line of the report may describe it with a *different* tier
  // word.
  const described: Record<string, string> = {
    entry_level_squeeze_index: 'entry-level squeeze index',
    exposed_wage_bill_ppp: 'exposed wage bill',
    ai_exposure_weighted_score: 'ai exposure',
  };
  const otherTiers: Record<string, string> = {
    official: 'OFFICIAL', derived: 'DERIVED', proxy: 'PROXY', modeled: 'MODELED',
  };

  // A line is "about" a field if it names it, OR if it sits under a heading
  // that names it. The prose that carried #54's surviving half does not repeat
  // the field name -- `## Entry-level squeeze index` is the line above it --
  // so matching only on the line itself silently checks nothing.
  let section = '';
  committed().forEach((line, i) => {
    const low = line.toLowerCase();
    if (line.startsWith('#')) section = low;
    for (const [field, phrase] of Object.entries(described)) {
      const expected = C.FIELD_TIERS.get(field);
      if (!expected || !(C.TIERS as readonly string[]).includes(expected)) continue;
      if (!low.includes(phrase) && !section.includes(phrase)) continue;
      for (const [word, tier] of Object.entries(otherTiers)) {
        if (tier === expected) continue;
        // Match the tier word inside any bold run, not the literal
        // "<word> composite". The noun was load-bearing before: only the
        // squeeze index is ever called a composite, so the other two fields
        // never reached an assertion, and a reword to "**derived measure**"
        // would have passed.
        const hit = low.match(new RegExp(`\\*\\*${word}\\b[^*]*\\*\\*`));
        if (hit) {
          assert.fail(
            `summary_report.md:${i + 1} describes ${field} as ${JSON.stringify(hit[0])}, ` +
              `but config.FIELD_TIERS says ${expected}. One field cannot carry two ` +
              'tiers -- this is #54, and the confidence table alone is not the whole document.',
          );
        }
      }
    }
  });
});

// Referenced so the helpers above are not flagged as unused by a linter pass.
void mkdirSync;
void writeFileSync;
