// Spec 0019 R6. The one place the shipped JSON becomes `LaborRow`.
//
// The assertion has to exist somewhere: `resolveJsonModule` infers a vast
// literal union from the payload's contents, and `LaborRow` is the contract the
// app actually consumes. `as unknown as` is a double cast, so it is the one
// form TypeScript checks nothing about — which is exactly why there should be
// one of it and not four.
//
// It was four. `WizardShell.tsx` carried a comment calling itself "the single
// point where the two meet" while three test files each carried a verbatim copy
// of the same claim. If a pipeline column is renamed, four sites keep compiling
// and four is four places to notice rather than one. This is that one place.
//
// `readonly` because nothing downstream mutates the dataset; the tests that
// wanted a mutable array were describing their own convenience, not a need.
import raw from './global_labor.json'
import type { LaborPayload } from '@/types'

// ONE assertion, against the type that already models the whole payload.
//
// An earlier version asserted twice — once for `rows`, once for `field_tiers` —
// which is two double casts in the module written to have one, and left
// `LaborPayload` referenced by nothing. Asserting the whole object once gives a
// single cast, states the shape in exactly one place, and makes that type
// load-bearing rather than decorative.
//
// There is deliberately NO default export. Re-exporting `raw` would hand a
// fifth call site the unasserted JSON from the module whose whole purpose is
// that the assertion happens here — a way back around the boundary, which is
// what consolidating was for.
const payload = raw as unknown as LaborPayload

/** Every row the pipeline emitted — countries, aggregates and groups. */
export const rows = payload.rows

/**
 * The payload's tier registry.
 *
 * Exported so a screen reads a tier from here rather than inventing one. There
 * is no default tier and there never can be: a field with no entry has no tier
 * (CLAUDE.md's first rule, and 0019 R6's).
 */
export const fieldTiers = payload.field_tiers
