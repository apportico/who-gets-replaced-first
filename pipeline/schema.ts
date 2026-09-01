/**
 * 0007 R7. The shared schema, consumed on both sides of the pipeline/app
 * boundary.
 *
 * `CLAUDE.md`'s data non-negotiables were enforced by prose on one side of a
 * language boundary and by nothing at all on the other. This module is where
 * they become types a compiler checks:
 *
 *   - `Tier` -- every emitted number carries one, from a closed union.
 *   - `Measured<T>` -- a branded value, so `v ?? 0` cannot reach a field that
 *     is supposed to hold a measurement.
 *   - `Vintage<T>` -- a value and its year as one pair, so a value cannot be
 *     read without the year it belongs to.
 *   - `Int` -- the only surviving record that `clerical_employed` was a Python
 *     `int` and `population_15_24` a Python `float`, a distinction JavaScript's
 *     single `number` type erases and `Number.isInteger` cannot recover.
 *
 * `strictNullChecks` alone does not reach the rule that matters. It rejects
 * `const x: number = maybeNull`, but `v ?? 0`, `v || 0` and `Number(v)` all
 * compile clean under `--strict` -- and those are precisely the imputation
 * shapes "never impute a missing country" exists to stop. Hence the brand:
 * `v ?? 0` yields a plain `number`, which is not assignable to `Measured<number>`,
 * so the author has to go through a constructor that says what it is doing.
 */

// ---------------------------------------------------------------- the tiers
export const TIERS = ['OFFICIAL', 'DERIVED', 'PROXY', 'MODELED'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Identity and provenance -- not a claim about the world.
 *
 * Spelled out rather than left absent so that a missing entry in the registry
 * always means someone forgot, never "this field is exempt".
 */
export const NOT_A_MEASUREMENT = 'NOT_A_MEASUREMENT';
export type FieldTier = Tier | typeof NOT_A_MEASUREMENT;

// ------------------------------------------------------------- Measured<T>
declare const measuredBrand: unique symbol;

/** A value that came from, or was derived from, a source -- never defaulted. */
export type Measured<T> = T & { readonly [measuredBrand]: 'measured' };

/**
 * The only route to a `Measured`. It takes the value AND its tier, so a value
 * cannot be minted without saying what kind of claim it is.
 */
export function measured<T>(value: T, _tier: FieldTier): Measured<T> {
  return value as Measured<T>;
}

/**
 * A country with no data is a row of nulls, never a guess. This is the
 * *only* sanctioned way to produce an absence, and it produces `null` rather
 * than a zero.
 */
export function absent(): null {
  return null;
}

// ------------------------------------------------------------- Vintage<T>
/**
 * A value paired with the year it was measured in.
 *
 * This is a change of shape, not an annotation: a value is only inaccessible
 * without its year if the two are one type. The pipeline's wire format is
 * sibling `data_year_*` columns, which cannot enforce anything, so the
 * serialisers flatten the pair back to siblings on the way out -- see
 * `flattenVintage`.
 */
export interface Vintage<T> {
  readonly value: T;
  readonly year: number | null;
}

export function vintage<T>(value: T, year: number | null): Vintage<T> {
  return { value, year };
}

/** The flattening R4's byte-identical outputs need: one pair, two columns. */
export function flattenVintage<T>(
  field: string,
  yearField: string,
  v: Vintage<T> | null,
): Record<string, T | number | null> {
  return { [field]: v ? v.value : null, [yearField]: v ? v.year : null };
}

// -------------------------------------------------------------------- Int
declare const intBrand: unique symbol;

/**
 * A Python `int`: the output of a 1-arg `round()`, a year, or a count.
 *
 * Branded rather than aliased, and that is load-bearing. Once the pipeline is
 * TypeScript, `clerical_employed` and `population_15_24` are both `number`,
 * and `Number.isInteger(14455.0)` is `true` -- so sniffing the value takes the
 * BigInt branch for a Python float by construction, not as an edge case. The
 * summation path is therefore selected at the call site from this declared
 * type, never by a helper inspecting what it was handed.
 */
export type Int = number & { readonly [intBrand]: 'int' };

/**
 * Mint an `Int`, validating rather than merely asserting the brand.
 *
 * `BigInt()` throws `RangeError` on a non-integral number, so `toBigInt` is
 * total only if nothing non-integral can carry the brand. A bare cast would
 * leave the integer path one mislabelled field away from a runtime error.
 */
export function asInt(v: number): Int {
  if (!Number.isInteger(v)) {
    throw new RangeError(`asInt: ${v} is not an integer`);
  }
  return v as Int;
}

/** `Int | null` in one step, for the many fields that are absent per country. */
export function asIntOrNull(v: number | null | undefined): Int | null {
  return v === null || v === undefined ? null : asInt(v);
}

// --------------------------------------------------- which columns are ints
/**
 * The columns whose values are Python `int`s, and therefore render without a
 * decimal point in the CSV and the JSON.
 *
 * This set IS the `Int` brand at runtime. In Python the distinction is carried
 * by the object's type; here the declared type is erased at runtime, so the
 * writers consult this. Getting an entry wrong is not cosmetic -- it changes
 * `2989466` into `2989466.0` in a published column, and it changes which
 * summation path an aggregate takes.
 *
 * Every entry traces to a producer:
 *   - 1-arg `round()`               build.derive, build.make_aggregate
 *   - `int(obs["date"])` / `max()`  every data_year_* and *_year column
 *   - `len()` / a counter           member_count, isco_groups_reported,
 *                                   squeeze_components_present, rank_*
 */
export const INT_COLUMNS: ReadonlySet<string> = new Set([
  // -- 1-arg round() outputs (build.derive)
  'employed_total',
  'white_collar_employed',
  'professional_core_employed',
  'clerical_employed',
  'professionals_employed',
  'young_employed_total',
  'young_white_collar_employed',
  'exposed_wage_bill_ppp',
  'ict_service_exports_usd',
  // -- counts
  'member_count',
  'isco_groups_reported',
  'squeeze_components_present',
  // -- vintages
  'year',
  'data_year_population',
  'data_year_labor',
  'data_year_sector',
  'data_year_occupation',
  'data_year_youth_occupation',
  'data_year_lfp_age',
  'data_year_context',
  'prime_white_collar_year',
  'late_career_white_collar_year',
  // -- crosscheck_eurostat.csv
  'ilo_year',
  'eurostat_year',
  // -- ai_exposure_sensitivity.csv
  'max_rank_movement',
  // -- the 18 per-group cross-tab vintages, added below
]);

for (let n = 1; n <= 9; n++) {
  (INT_COLUMNS as Set<string>).add(`isco${n}_age_year`);
  (INT_COLUMNS as Set<string>).add(`isco${n}_edu_year`);
}

/**
 * `rank_<profile>` columns are ints too, but the profile names come from
 * `ai_exposure_isco.json` rather than from a fixed list, so they are matched
 * by shape. Kept as a predicate rather than folded into the set so the set
 * stays a literal enumeration a reviewer can check against the Python.
 */
export function isIntColumn(field: string): boolean {
  return INT_COLUMNS.has(field) || field.startsWith('rank_');
}

// ------------------------------------------------------------- the row type
/**
 * The dataset row as the app will consume it (#22 adopts these types; this
 * spec only exports them). Deliberately not the pipeline's internal working
 * row, which is a loose dictionary because the Python it ports was one -- the
 * "improve while porting" line in 0007's Non-goals.
 */
export interface DatasetRow {
  readonly iso3: string;
  readonly iso2: string | null;
  readonly country_name: string;
  readonly region: string;
  readonly row_type: 'country' | 'world' | 'region' | 'group';
  /** Nulls stay null. A country with no series is a row of nulls, never zero. */
  readonly white_collar_pct: Measured<number> | null;
  readonly clerical_employed: Int | null;
  readonly population_15_24: Measured<number> | null;
  /** The value and its year are one thing, so neither can be read alone. */
  readonly occupation: Vintage<Measured<number>> | null;
  readonly data_quality_flag: string | null;
}
