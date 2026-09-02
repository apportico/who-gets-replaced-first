// Spec 0019 R6. The two-way half of the type contract.
//
// 0007 R7's argument, applied to the app: types are met by REJECTING, not by
// existing. A `tsc --noEmit` that passes proves the code compiles; it says
// nothing about whether the types would still catch the four failure modes #22
// names. Each case below is deliberately wrong, and each `@ts-expect-error`
// FAILS THE BUILD if the error stops being reported — so weakening a type in
// src/types.ts turns this file red rather than going unnoticed.
//
// Checked by `npm run typecheck`, which `verify` runs.
import type { LaborRow, ShareCardFigure, WizardState, Tier, FieldTiers } from '@/types'

declare const row: LaborRow
declare const tiers: FieldTiers

// ---------------------------------------------------------------- failure 1
// A metric rendered without its tier. `tier` is required on a card figure and
// may be null — "no tier" must be said, never omitted.
// @ts-expect-error tier is required: a figure cannot be built without stating one
const noTier: ShareCardFigure = { label: 'Share today', value: '8.9%' }

// ---------------------------------------------------------------- failure 2
// A null formatted as 0 — "the single worst failure mode this project has".
// An unknown payload field must be narrowed before it can be arithmetic.
// @ts-expect-error row[field] is unknown; it cannot be multiplied before narrowing
const asNumber: number = row.isco4_clerical_pct * 2

// ---------------------------------------------------------------- failure 3
// A tier invented rather than read. Tier is a closed set; there is no default
// and no free-form string.
// @ts-expect-error 'PLACEHOLDER' is not a Tier — the canvas's mockup word is not shippable
const invented: Tier = 'PLACEHOLDER'

// ---------------------------------------------------------------- failure 4
// The wizard's state is the five atoms and nothing else. A screen cannot
// smuggle a sixth through the URL contract.
// @ts-expect-error `year` is not part of WizardState — 0010 R13 ships no year
const withYear: WizardState = { step: 4, iso3: 'GBR', group: 4, age: null, edu: null, year: 2041 }

// ---------------------------------------------------------------- failure 5
// field_tiers is read-only: the app reads the pipeline's registry, it never
// writes a tier into it.
// @ts-expect-error FieldTiers is readonly — the app does not assign tiers
tiers.white_collar_pct = 'OFFICIAL'

// Positive control: the same shapes, correct, must compile.
const ok: ShareCardFigure = { label: 'Share today', value: '8.9%', tier: 'DERIVED', vintage: 2025 }
const okAbsent: ShareCardFigure = { label: 'Trend', value: '—', tier: null }
const okState: WizardState = { step: 4, iso3: 'GBR', group: 4, age: null, edu: null }
const okNarrow = row.isco4_clerical_pct as number | null
const okTier: Tier = 'DERIVED'

export type { } // keep this a module
void noTier; void asNumber; void invented; void withYear
void ok; void okAbsent; void okState; void okNarrow; void okTier
