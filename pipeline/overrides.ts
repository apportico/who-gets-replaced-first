/**
 * 0007 R1. Where a manual override's Python type is remembered.
 *
 * `apply_overrides` assigns the raw JSON value with no `num()` call
 * (`build.py:520`), so in Python an override written `15000000` lands as an
 * `int` and one written `15000000.0` lands as a `float`. That difference is
 * real: it changes which branch `sum()` takes for the column the value lands
 * in, and therefore what an aggregate row publishes.
 *
 * `JSON.parse` erases it -- both arrive as `number` with `Number.isInteger`
 * true -- so the port reads the overrides file with a tokenising parser and
 * records the kind here, keyed by the row object the value was written onto.
 *
 * A `WeakMap` rather than a key on the row itself: the row's keys are the
 * dataset's columns, and every writer iterates them. A `__kinds` entry would
 * either leak into an output or have to be filtered out of five different
 * places, which is how a column starts appearing in one artefact and not
 * another.
 *
 * This is empty today -- `manual_overrides.json` carries `"overrides": {}` --
 * which is a statement about WHEN this breaks, not whether. `CLAUDE.md`
 * records Armenia, New Zealand and Saudi Arabia sitting in that file unfilled
 * on purpose, so the first one filled in is the first one that would have
 * silently diverged.
 */
import type { Row } from './build.ts';

export type PyKind = 'int' | 'float';

/** row -> field -> the Python type the override's JSON token spelled. */
export const overrideKinds = new WeakMap<Row, Map<string, PyKind>>();
