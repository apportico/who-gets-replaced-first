/**
 * 0007 R7. Four deliberately broken snippets that must fail `tsc --noEmit`.
 *
 * The requirement is not met by the types existing, only by them rejecting
 * these four. Each is committed as a `@ts-expect-error` case, so a later
 * refactor that weakens a brand fails the build with TS2578 (unused
 * `@ts-expect-error`) rather than quietly allowing the shape again.
 *
 * There is nothing to run here: this file is type-level, and `npm run
 * typecheck` is what executes it. `scripts/check-schema-brand.mjs` runs the
 * two-way check R7 also requires -- case 4 with the brand REMOVED, where `tsc`
 * must report TS2578, because a case that errors identically with the brand
 * deleted is not evidence for the brand.
 */
import { pySumInt, toBigInt } from '../pynum.ts';
import {
  absent, asInt, measured, vintage,
  type Int, type Measured, type Tier, type Vintage,
} from '../schema.ts';

// ---------------------------------------------------------------- the shapes
interface Figure {
  readonly value: Measured<number> | null;
  readonly tier: Tier;
}

interface DatedFigure {
  /** The value and its year as ONE type, so neither can be read alone. */
  readonly occupation: Vintage<number> | null;
}

interface IntColumn {
  /** Python `int` -- a 1-arg `round()` output. */
  readonly clerical_employed: Int | null;
  /** Python `float` -- straight from `num()`. */
  readonly population_15_24: number | null;
}

// ---------------------------------------- 1. a value assigned without a tier
// A figure cannot be minted without saying what kind of claim it is.
const _good1: Figure = { value: measured(26.0, 'DERIVED'), tier: 'DERIVED' };
// @ts-expect-error a value assigned without a tier
const _bad1: Figure = { value: measured(26.0, 'DERIVED') };

// ------------------------------------- 2. `v ?? 0` into a Measured<number>
// `strictNullChecks` alone does not reach this: `v ?? 0`, `v || 0` and
// `Number(v)` all compile clean under --strict against a plain `number`. The
// brand is what makes the imputation shape a type error instead of a silent
// zero in a published column.
declare const maybeNull: Measured<number> | null;
const _good2: Figure = { value: maybeNull ?? absent(), tier: 'DERIVED' };
// @ts-expect-error `v ?? 0` is a plain number, not a Measured one
const _bad2: Figure = { value: maybeNull ?? 0, tier: 'DERIVED' };

// -------------------------------------------- 3. a value read without its year
declare const dated: DatedFigure;
const _good3: number | null = dated.occupation ? dated.occupation.value : null;
// @ts-expect-error a Vintage is a pair; the value cannot be read on its own
const _bad3: number | null = dated.occupation;
const _alsoGood3: Vintage<number> = vintage(26.0, 2023);

// ------------------------- 4. a non-Int column routed into the integer sum
declare const rows: readonly IntColumn[];

// The Int column compiles: `toBigInt` accepts what carries the brand.
const _good4 = pySumInt(
  rows.map((r) => r.clerical_employed).filter((v): v is Int => v !== null).map(toBigInt),
);

// Note the COLUMN, not the field. `population_15_24` is a scalar on a row --
// `build.ts` sums it ACROSS member rows -- so a literal
// `population_15_24.map(...)` would fail with TS2339 ("Property 'map' does not
// exist on type 'number'"), and fail identically with the brand removed. That
// is the very failure mode the two-way check exists to catch, so the snippet
// has to be committed in this shape to be worth anything.
const floatColumn: readonly number[] = rows
  .map((r) => r.population_15_24)
  .filter((v): v is number => v !== null);
// @ts-expect-error a Python float column may not take the integer sum path
const _bad4 = pySumInt(floatColumn.map(toBigInt));

// `asInt` validates rather than asserting, so this is the only way in.
const _minted: Int = asInt(2989466);

export const R7_CASES = [_good1, _bad1, _good2, _bad2, _good3, _bad3, _alsoGood3,
  _good4, _bad4, _minted];
