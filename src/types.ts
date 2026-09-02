// Spec 0019 R6. The app's data contract, adopted from the pipeline rather than
// restated.
//
// #22's argument for this file: the app renders tiered figures, and to plain
// JavaScript a MODELED exposure score and an OFFICIAL population count are both
// `number`. The distinction is the entire point of the project, and until now
// only prose kept it. Importing the pipeline's own types makes four failure
// modes unrepresentable rather than merely discouraged:
//
//   - a metric rendered without its tier
//   - a null (country has no series) formatted as 0
//   - a value displayed without its per-field year
//   - a country code that is not in the dataset
//
// The pipeline is the source of these definitions; nothing here redefines a
// Tier or invents a default. `test/types/app.types.ts` holds the
// @ts-expect-error cases that must FAIL if these stop rejecting — 0007 R7's
// two-way pattern, because types are only met by rejecting, not by existing.
export type { Tier, FieldTier, Measured, Vintage, Int, DatasetRow } from '../pipeline/schema'
export { TIERS, NOT_A_MEASUREMENT } from '../pipeline/schema'

import type { FieldTier } from '../pipeline/schema'

/**
 * A row as the shipped payload actually carries it.
 *
 * The pipeline's `DatasetRow` is the strict contract for the ten fields it
 * names. The payload carries many more — the crosstabs, the ISCO shares, the
 * per-field vintages — and they arrive as JSON, so this index signature is the
 * honest description rather than a fiction of completeness. Reading an unknown
 * field yields `unknown`, which the call site must narrow: that is the point.
 */
export interface LaborRow {
  readonly iso3: string
  readonly iso2: string | null
  readonly country_name: string
  readonly region: string | null
  readonly row_type: 'country' | 'world' | 'region' | 'group'
  readonly data_quality_flag?: string | null
  readonly [field: string]: unknown
}

/** The payload's `field_tiers` block. There is no default tier — a field with
 *  no entry here has no tier, and R6 forbids inventing one. */
export type FieldTiers = Readonly<Record<string, FieldTier>>

export interface LaborPayload {
  readonly generated_from: string
  readonly field_tiers: FieldTiers
  readonly sources?: unknown
  readonly ai_exposure_weights?: unknown
  readonly rows: readonly LaborRow[]
}

/** A number that is absent is null, never zero. Used where a figure may be
 *  genuinely missing — the single worst failure mode this project has. */
export type Maybe<T> = T | null

// ------------------------------------------------- shapes the app itself owns
//
// These are not pipeline contracts — they describe what the wizard's own pure
// functions return, so a screen cannot read a field the function never sets.

/** One pickable country in step 01's search (0011 R1). */
export interface CountryOption {
  readonly iso3: string
  readonly iso2: string | null
  readonly name: string
}

/** The five atoms 0016 puts in the query string, and nothing else. */
export interface WizardState {
  readonly step: number
  readonly iso3: string | null
  readonly group: number | null
  readonly age: string | null
  readonly edu: string | null
}

/** One figure on the share card, already formatted and already tiered. */
export interface ShareCardFigure {
  readonly label: string
  readonly value: string
  /** Never optional and never defaulted: a figure whose tier is null is
   *  dropped from the card rather than drawn bare (0015 R5). */
  readonly tier: string | null | undefined
  /** The figure's own year. A card never presents its figures as one vintage. */
  readonly vintage?: number | null
  /**
   * The trend figure's endpoints, `[firstYear, lastYear]`.
   *
   * Deliberately NOT folded into `vintage`: these are the endpoints of a
   * series, not the vintage of a single measurement, and 0015 R7's year
   * whitelist admits both. Collapsing them is how that whitelist would
   * degrade into "any year appearing anywhere is fine".
   */
  readonly span?: readonly [number, number]
}

/**
 * The share card's content (0015 R5).
 *
 * `absences` is not decoration: a figure the source does not publish is stated
 * in words here, never as a dash, a zero, or an omission — an omission would
 * read as though it had not been looked for.
 */
export interface ShareCardModel {
  readonly eyebrow: string
  readonly subject: string
  readonly headline: string
  readonly figures: readonly ShareCardFigure[]
  readonly disclosures: readonly string[]
  readonly absences: readonly string[]
  readonly refusal: string
  readonly url: string
  /**
   * The tier VOCABULARY, drawn as badges — only the site card carries it.
   *
   * Not a figure and not a tier assignment: `siteCardModel` ships no figures
   * on purpose, because nothing on it has been measured. This names the four
   * tiers the project uses; it never labels a number.
   */
  readonly legend?: readonly string[]
}
