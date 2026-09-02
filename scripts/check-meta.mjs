#!/usr/bin/env node
// Spec 0015 R2, R3, R4 — asserted over the BUILT output, not over source.
//
// This runs after `vite build` in scripts/verify.sh, and it has to: the defect
// it guards does not exist in source and cannot be seen there.
//
// Probed 2026-09-01. Vite applies the base path to a known set of `rel` values
// on `<link>` — `rel="icon"` is rewritten to /who-gets-replaced-first/… — and
// applies it to `meta content` never. So a relative `og:image` passes review,
// passes the build, passes every source-level test, and resolves to
// https://apportico.github.io/og.png in production: a 404, silently, on the tag
// whose entire job is to be fetched by someone else's crawler.
//
// A count of tags would not catch it either, which is why this checks each tag
// by name and each URL by prefix.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// 0019 R8. Next's static export emits `out/`, not Vite's `dist/`. The rest of
// this file is unchanged on purpose: R2 settles `trailingSlash: false`, so the
// page list and BOTH og:url values are exactly what they were, which is what
// makes this a path edit rather than a change to 0015 R4's contract.
const DIST = 'out'
const BASE = 'https://apportico.github.io/who-gets-replaced-first/'

const REQUIRED_TAGS = [
  'og:type', 'og:title', 'og:description', 'og:url', 'og:image',
  'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image',
]

const failures = []
const fail = (m) => failures.push(m)

function readDist(name) {
  const p = join(DIST, name)
  if (!existsSync(p)) {
    fail(`${name}: not emitted by the build`)
    return null
  }
  return readFileSync(p, 'utf8')
}

/** Every meta tag as {key, content}, keyed on property= or name=. */
function metaTags(html) {
  const out = []
  for (const m of html.matchAll(/<meta\s+[^>]*>/g)) {
    const tag = m[0]
    const key = /(?:property|name)="([^"]+)"/.exec(tag)?.[1]
    const content = /content="([^"]*)"/.exec(tag)?.[1]
    if (key) out.push({ key, content: content ?? '' })
  }
  return out
}

for (const page of ['index.html', 'methodology.html']) {
  const html = readDist(page)
  if (!html) continue
  const tags = metaTags(html)
  const byKey = new Map(tags.map((t) => [t.key, t.content]))

  // R4a — each of the nine, by name. Nine wrong tags must not pass.
  for (const key of REQUIRED_TAGS) {
    if (!byKey.has(key)) fail(`${page}: missing <meta> ${key}`)
    else if (!byKey.get(key).trim()) fail(`${page}: ${key} has empty content`)
  }

  // R4b — every URL-valued content is absolute and under the base path.
  for (const { key, content } of tags) {
    if (!/^(https?:)?\/\/|^\//.test(content)) continue
    if (!content.startsWith(BASE)) {
      fail(`${page}: ${key} content "${content}" is not absolute under ${BASE}`)
    }
  }

  // R4c — the referenced image is actually in the build.
  const image = byKey.get('og:image')
  if (image?.startsWith(BASE)) {
    const rel = image.slice(BASE.length)
    if (!existsSync(join(DIST, rel))) {
      fail(`${page}: og:image points at ${rel}, which is not in ${DIST}/`)
    }
  }

  if (byKey.get('twitter:card') !== 'summary_large_image') {
    fail(`${page}: twitter:card is "${byKey.get('twitter:card')}", not summary_large_image`)
  }
}

// R2 — the methodology page is a real page with a real outline and the whole
// tier vocabulary on it.
const method = readDist('methodology.html')
if (method) {
  const h1s = [...method.matchAll(/<h1[\s>]/g)].length
  if (h1s !== 1) fail(`methodology.html: ${h1s} <h1>, expected exactly 1`)
  for (const tier of ['OFFICIAL', 'DERIVED', 'PROXY', 'MODELED']) {
    if (!method.includes(tier)) fail(`methodology.html: tier "${tier}" not stated`)
  }

  // R3 — the refusal, in full, not paraphrased away by a later edit. Each of
  // these is a distinct load-bearing claim rather than a phrase to match.
  const refusalParts = [
    ['the refusal itself', 'No displacement date is published for any occupation, anywhere'],
    ['that it applies to every tier', 'in any tier'],
    ['the date the probe was run', '31 August 2026'],
    ['what the nearest published work actually is', 'decadal occupational churn'],
    ['that reviving it would need its own analysis', 'sensitivity analysis'],
  ]
  for (const [what, needle] of refusalParts) {
    if (!method.includes(needle)) {
      fail(`methodology.html: R3 requires ${what} — "${needle}" is absent`)
    }
  }
}

if (failures.length) {
  console.error('check-meta FAILED:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`check-meta OK — ${REQUIRED_TAGS.length} tags on both pages, all URLs absolute under the base path`)
