// 0015 R5 — drawing a card model into a canvas.
//
// This file makes no decisions about *what* the card says; `shareCard.js` owns
// that, and owns R6 and R7 with it. Everything here is layout.
//
// Two things are load-bearing rather than incidental:
//
// 1. **The fonts must be awaited and then verified.** `document.fonts.ready`
//    resolving is not the same as the three families having loaded, and a
//    canvas silently falls back rather than erroring. That is the exact failure
//    mode 0010 R2 shipped twice — a clean build, a green suite, and a page in
//    fallback stacks. Probed 2026-09-01: "14.1%" at 400 64px Instrument Serif
//    measures 107.78px against 165.31px for generic serif, so the difference is
//    measurable, and `assertDisplayFace` measures it rather than trusting
//    `fonts.check`.
// 2. **Wrapping is measured, not guessed.** The disclosure is the one string
//    R6 exists to protect; a fixed character count clips it on a long country
//    name, and a clipped stand-in disclosure is precisely the failure the
//    requirement is about.
import { SITE_URL, CARD_EYEBROW, CARD_REFUSAL } from './shareCard'

export const CARD_W = 1200
export const CARD_H = 630
export const SCALE = 2

const PAD = 64

// The tokens, by value. `getComputedStyle` would read them from the page, but
// the card is also generated in a headless context to produce the static OG
// image, where there is no page to read from.
const C = {
  bg: '#0D0C0A',
  surface: '#161411',
  fg: '#E8E4DA',
  fgStrong: '#F2EFE6',
  accent: '#FF5A2B',
  accentSoft: '#FF9670',
  accentTint: 'rgba(255, 90, 43, 0.10)',
  accentEdge: 'rgba(255, 90, 43, 0.34)',
  border: 'rgba(232, 228, 218, 0.12)',
  muted: 'rgba(232, 228, 218, 0.55)',
  mutedStrong: 'rgba(232, 228, 218, 0.72)',
}

const DISPLAY = '"Instrument Serif", Georgia, "Times New Roman", serif'
const BODY = '"Geist", ui-sans-serif, system-ui, sans-serif'
const MONO = '"Geist Mono", ui-monospace, "SF Mono", monospace'

/**
 * Are the webfaces actually in use, or is this silently a fallback?
 *
 * Measures rather than asks. `document.fonts.check` returned true on a page
 * where the face list still showed `unloaded` entries, so the width comparison
 * is the evidence and the boolean is not.
 */
export function assertDisplayFace(ctx) {
  ctx.save()
  ctx.font = `400 64px ${DISPLAY}`
  const withFace = ctx.measureText('14.1%').width
  ctx.font = '400 64px serif'
  const fallback = ctx.measureText('14.1%').width
  ctx.restore()
  return { loaded: withFace !== fallback, withFace, fallback }
}

export async function readyFonts() {
  if (globalThis.document?.fonts?.ready) {
    await globalThis.document.fonts.ready
    // `ready` resolves once no load is *pending*, which includes "none was
    // ever started". Naming the three faces forces them.
    await Promise.all([
      document.fonts.load(`400 64px ${DISPLAY}`),
      document.fonts.load(`400 16px ${BODY}`),
      document.fonts.load(`400 13px ${MONO}`),
    ]).catch(() => {})
  }
}

function setLetterSpacing(ctx, value) {
  // Supported in Chrome and Safari; a no-op elsewhere rather than a throw.
  try { ctx.letterSpacing = value } catch { /* older engine, spacing omitted */ }
}

/** Greedy wrap on measured width. Returns the lines, never a truncation. */
function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next
    } else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight) {
  const lines = wrap(ctx, text, maxWidth)
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight))
  return y + lines.length * lineHeight
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** A tier badge, drawn as the pill the screen uses. */
function badge(ctx, text, x, y) {
  ctx.font = `500 12px ${MONO}`
  setLetterSpacing(ctx, '0.14em')
  const w = ctx.measureText(text).width + 18
  const h = 24
  ctx.fillStyle = 'rgba(232, 228, 218, 0.07)'
  roundRect(ctx, x, y, w, h, 12)
  ctx.fill()
  ctx.strokeStyle = C.border
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = C.mutedStrong
  ctx.fillText(text.toUpperCase(), x + 9, y + 16)
  setLetterSpacing(ctx, '0px')
  return x + w + 6
}

/**
 * Draw a card model onto a 2400x1260 canvas.
 *
 * @returns {{canvas: HTMLCanvasElement, fontCheck: {loaded: boolean}}}
 */
export function drawCard(model, canvas, scale = SCALE) {
  const c = canvas ?? document.createElement('canvas')
  c.width = CARD_W * scale
  c.height = CARD_H * scale
  const ctx = c.getContext('2d')
  ctx.scale(scale, scale)
  ctx.textBaseline = 'alphabetic'

  const fontCheck = assertDisplayFace(ctx)

  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // The accent hairline along the top, so a cropped screenshot still reads as
  // this site rather than as an anonymous dark card.
  ctx.fillStyle = C.accent
  ctx.fillRect(0, 0, CARD_W, 4)

  let y = PAD + 18

  ctx.font = `500 13px ${MONO}`
  setLetterSpacing(ctx, '0.18em')
  ctx.fillStyle = C.accent
  ctx.fillText(model.eyebrow, PAD, y)

  y += 30
  ctx.font = `400 14px ${MONO}`
  setLetterSpacing(ctx, '0.14em')
  ctx.fillStyle = C.muted
  y = drawWrapped(ctx, model.subject.toUpperCase(), PAD, y, CARD_W - PAD * 2, 22)
  setLetterSpacing(ctx, '0px')

  // 52, not 34. At 34 the 60px display baseline sat one line-height below a
  // 14px mono baseline, which reads as the headline crowding the subject
  // rather than as two blocks. Caught by looking at the rendered image; the
  // code looked fine.
  y += 52
  ctx.font = `400 60px ${DISPLAY}`
  ctx.fillStyle = C.fgStrong
  y = drawWrapped(ctx, model.headline, PAD, y, CARD_W - PAD * 2, 62)

  // The figures, as cards in a row. R6 already dropped anything untiered, so
  // there is nothing to decide here. A model with no figures at all (the site
  // card) draws no row and consumes no vertical space, rather than an empty
  // band that reads as a failed load.
  y += 26
  const n = Math.max(model.figures.length, 1)
  const gap = 14
  const cardW = (CARD_W - PAD * 2 - gap * (n - 1)) / n
  const cardH = 132
  model.figures.forEach((f, i) => {
    const x = PAD + i * (cardW + gap)
    ctx.fillStyle = C.surface
    roundRect(ctx, x, y, cardW, cardH, 18)
    ctx.fill()
    ctx.strokeStyle = C.border
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.font = `400 11px ${MONO}`
    setLetterSpacing(ctx, '0.16em')
    ctx.fillStyle = C.muted
    ctx.fillText(f.label.toUpperCase(), x + 18, y + 28)
    setLetterSpacing(ctx, '0px')

    ctx.font = `400 38px ${DISPLAY}`
    ctx.fillStyle = C.fgStrong
    ctx.fillText(f.value, x + 18, y + 76)

    let bx = x + 18
    bx = badge(ctx, f.tier, bx, y + 92)
    if (f.vintage) badge(ctx, String(f.vintage), bx, y + 92)
    else if (f.span) badge(ctx, `${f.span[0]}–${f.span[1]}`, bx, y + 92)
  })
  if (model.figures.length) y += cardH + 22

  // An optional legend row: the tier *vocabulary*, drawn as badges.
  //
  // Badges, but explicitly not figures. Nothing here is a measurement, so
  // nothing here is claiming a tier — these are the four words themselves,
  // captioned as such. The distinction matters because the alternative that
  // was written first drew "177 countries" and "9 groups" as tiered stat
  // cards, which invented provenance for two properties of the dataset on the
  // most-shared surface the site has.
  if (model.legend?.length) {
    ctx.font = `400 11px ${MONO}`
    setLetterSpacing(ctx, '0.16em')
    ctx.fillStyle = C.muted
    ctx.fillText('EVERY FIGURE CARRIES ONE OF THESE', PAD, y + 4)
    setLetterSpacing(ctx, '0px')
    let lx = PAD
    for (const t of model.legend) lx = badge(ctx, t, lx, y + 18)
    y += 76
  }

  // Disclosures and absences: the sentences that must survive the crop.
  ctx.font = `400 16px ${BODY}`
  ctx.fillStyle = C.accentSoft
  for (const line of [...model.disclosures, ...model.absences]) {
    y = drawWrapped(ctx, line, PAD, y, CARD_W - PAD * 2, 22) + 6
  }

  // R7's refusal, in the tinted panel the screen uses for the same sentence.
  //
  // Pinned to the bottom when there are figures, because the row above fills
  // the card and the panel is the last thing read. With no figures (the site
  // card) that pin leaves ~300px of dead space in the middle, which reads as a
  // failed render rather than as composition, so it follows the content
  // instead — never lower than the pinned position.
  const boxY = model.figures.length || model.legend?.length
    ? CARD_H - PAD - 74
    : Math.min(y + 30, CARD_H - PAD - 74)
  ctx.fillStyle = C.accentTint
  roundRect(ctx, PAD, boxY, CARD_W - PAD * 2, 52, 12)
  ctx.fill()
  ctx.strokeStyle = C.accentEdge
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = `400 12px ${MONO}`
  setLetterSpacing(ctx, '0.06em')
  ctx.fillStyle = C.accentSoft
  drawWrapped(ctx, model.refusal.toUpperCase(), PAD + 16, boxY + 22, CARD_W - PAD * 2 - 32, 17)
  setLetterSpacing(ctx, '0px')

  ctx.font = `400 12px ${MONO}`
  setLetterSpacing(ctx, '0.10em')
  ctx.fillStyle = C.muted
  ctx.fillText(model.url.replace(/^https?:\/\//, ''), PAD, CARD_H - 22)
  setLetterSpacing(ctx, '0px')

  return { canvas: c, fontCheck }
}

/**
 * R4's static preview. Not a result: no reader has chosen anything yet, and a
 * card showing one country's figures as the site's own preview would be a
 * claim about which country the site is about.
 */
export function siteCardModel() {
  return {
    eyebrow: CARD_EYEBROW,
    subject: 'Official labour statistics · 177 countries · ISCO-08 major groups',
    headline: 'What the data says about your work.',
    // **No figures, deliberately.** A tier badge renders the tier it is given
    // and never invents one, and nothing here has been measured: "177
    // countries" is a property of the dataset rather than a published
    // statistic, and there is no model behind "no replacement date" to call
    // MODELED. Drawing those as tiered stat cards would put invented
    // provenance on the most-shared surface on the site, which is the failure
    // this whole spec exists to prevent. The substance goes in the line below,
    // as prose, where it needs no tier.
    figures: [],
    legend: ['OFFICIAL', 'DERIVED', 'PROXY', 'MODELED'],
    // The legend above already names the four tiers, so this says the other
    // half of the rule rather than repeating them.
    disclosures: [
      'A country with no published series is shown as having none, never as ' +
      'an estimate.',
    ],
    absences: [],
    refusal: CARD_REFUSAL,
    url: SITE_URL,
  }
}

/** The filename a reader ends up with, so it is not `download.png`. */
export function cardFilename(model) {
  const slug = model.subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `who-gets-replaced-first-${slug || 'card'}.png`
}
