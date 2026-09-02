// 0015 R5, R6, R7 — the share card's text model.
//
// The card is the artefact most likely to be seen with no context at all, so
// the data rules bite hardest here and the model is deliberately **pure**: no
// canvas, no DOM, no fetch. That is what lets R6 ("every figure carries its
// tier, or is not drawn") and R7 ("no year is offered as an outcome") be
// assertions over a function rather than opinions about an image.
//
// It reads `groupShare`, `groupHeadcount` and `trendFor` — the same functions
// the result screen renders — rather than re-deriving anything. A second
// derivation is a second thing that can drift, and the drift would be
// invisible: an image that disagrees with the screen still looks authoritative.
import { groupShare, groupHeadcount } from './groupFigures'
import { trendFor } from './trend'
import { classificationNotice } from './classification'
import { groupByNumber } from './isco'
import { PRESENT } from './absence'
import type { LaborRow, ShareCardModel, ShareCardFigure } from '@/types'

export const SITE_URL = 'https://apportico.github.io/who-gets-replaced-first/'

/** R7. Said on the card itself, so the refusal travels with the number. */
export const CARD_REFUSAL =
  'No displacement date is published for any occupation, anywhere. ' +
  'This card states none.'

export const CARD_EYEBROW = 'WHO GETS REPLACED FIRST'

/**
 * R6's rule, as a function rather than as a convention.
 *
 * There is no default tier and there never can be one: a figure whose tier is
 * null is dropped from the card entirely. Drawing it bare would put an
 * unattributed number on the one surface with no method panel next to it.
 */
interface FigureResult {
  state?: string
  display?: string
  tier?: string | null
  year?: number | null
  points?: readonly { year: number; value: number | null }[]
  show?: boolean
  notice?: string | null
}

function figure(
  label: string,
  result: FigureResult | null | undefined,
  extra: Record<string, unknown> = {},
): ShareCardFigure | null {
  if (result?.state !== PRESENT) return null
  if (!result.tier) return null
  return {
    label,
    value: result.display ?? '',
    tier: result.tier,
    vintage: result.year ?? null,
    ...extra,
  } as ShareCardFigure
}

function trendFigure(trend: FigureResult | null | undefined): ShareCardFigure | null {
  if (!trend?.show || !trend.tier) return null
  const clean = (trend.points ?? []).filter(
    (p) => p.value !== null && p.value !== undefined,
  )
  if (clean.length < 2) return null
  const first = clean[0]
  const last = clean[clean.length - 1]
  if (first.value === null || last.value === null) return null
  return {
    // Derived rather than the screen's hardcoded "Share since 2013". Most
    // series do start in 2013, but not all, and a label naming a year the
    // series does not reach is both a small lie and an R7 violation — the
    // whitelist would reject it, which is the check working.
    label: `Share since ${first.year}`,
    value: `${first.value.toFixed(1)} → ${last.value.toFixed(1)}%`,
    tier: trend.tier,
    vintage: null,
    // Kept separate from `vintage` because these are the endpoints of a
    // series, not the vintage of a single measurement. R7's whitelist admits
    // both, and the distinction is what stops it degrading into "any year
    // that appears somewhere is fine".
    span: [first.year, last.year],
  }
}

/**
 * The card, as data.
 *
 * @returns {{
 *   eyebrow: string, subject: string, headline: string,
 *   figures: Array<{label, value, tier, vintage, span?}>,
 *   disclosures: string[], absences: string[],
 *   refusal: string, url: string,
 * }}
 */
export function shareCardModel(
  { row, group, url }: { row?: LaborRow | null; group?: number | null; url?: string } = {},
): ShareCardModel {
  // Falsy, not merely undefined: an empty `location.href` must fall back to
  // the site rather than drawing a card with no way back to the method.
  const link = url || SITE_URL
  const g = groupByNumber(group)
  const share = groupShare(row, group)
  const head = groupHeadcount(row, group)
  const trend = trendFor(row?.iso3, group)

  // A type guard rather than `filter(Boolean)`: `figure()` returns null for a
  // figure with no tier, and those are DROPPED from the card rather than drawn
  // bare. The guard is what makes that promise checkable — without it the model
  // would be typed as possibly carrying nulls, which is the shape 0015 R5
  // forbids.
  const figures = [
    figure('Share today', share),
    figure('People doing it', head),
    trendFigure(trend),
  ].filter((f): f is ShareCardFigure => f !== null)

  // R6. A stand-in says it is standing in, in the card's own words rather than
  // a paraphrase — `trendFor` owns the sentence and the card reproduces it, so
  // the two cannot drift apart.
  const disclosures = []
  if (trend.show && trend.notice) disclosures.push(trend.notice)
  const notice = classificationNotice(row, group)
  if (notice) disclosures.push(notice.text)

  // A figure the source does not publish is stated as absent, in words. Never
  // a dash, never a zero, and never simply left off the card, which would read
  // as though it had not been looked for.
  const absences = []
  if (share.state !== PRESENT && share.message) absences.push(share.message)
  if (head.state !== PRESENT && head.message) absences.push(head.message)
  if (!trend.show) {
    absences.push(
      `No time series is published for ${row?.country_name ?? 'this country'}.`,
    )
  }

  return {
    eyebrow: CARD_EYEBROW,
    subject: [g?.label, row?.country_name].filter(Boolean).join(' · '),
    headline:
      share.state === PRESENT
        ? `${share.display} of ${row?.country_name ?? 'this country'}'s workers`
        : 'No published figure',
    figures,
    disclosures,
    absences,
    refusal: CARD_REFUSAL,
    url: link,
  }
}

/** Every string the renderer draws, in one place, so R7 can be checked. */
export function cardText(model: ShareCardModel) {
  return [
    model.eyebrow,
    model.subject,
    model.headline,
    ...model.figures.flatMap((f) => [
      f.label,
      f.value,
      f.tier,
      f.vintage === null ? '' : String(f.vintage),
      f.span ? `${f.span[0]}–${f.span[1]}` : '',
    ]),
    ...model.disclosures,
    ...model.absences,
    model.refusal,
    model.url,
  ].filter(Boolean)
}

/**
 * R7's whitelist: the only four-digit years the card is allowed to contain.
 *
 * A whitelist rather than a blacklist of future years, deliberately. "No year
 * later than today" would pass a card stating 2030 once 2031 arrives, and it
 * says nothing about *why* a year is on the card. This says the only thing
 * that matters: every year traces to a measurement's vintage or to an endpoint
 * of the series being drawn, and nothing else is admissible.
 */
export function allowedYears(model: ShareCardModel) {
  const years = new Set()
  for (const f of model.figures) {
    if (f.vintage !== null && f.vintage !== undefined) years.add(Number(f.vintage))
    if (f.span) for (const y of f.span) years.add(Number(y))
  }
  return years
}

/** Every four-digit year token appearing in the card's drawn text. */
export function yearTokens(model: ShareCardModel) {
  const found = []
  for (const s of cardText(model)) {
    for (const m of String(s).matchAll(/\b(1[89]\d{2}|2\d{3})\b/g)) {
      found.push({ year: Number(m[1]), text: s })
    }
  }
  return found
}
