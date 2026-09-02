// Spec 0019 R2 + R4 + R17. The wizard route.
//
// R4. This file is a SERVER component and stays one: no 'use client' here or in
// app/layout.tsx. That is what lets #26 later read the dataset at build time
// and pass only what a route needs, which is most of why this migration exists.
//
// R17. The Suspense boundary is not optional plumbing — probed 2026-09-02, a
// static page calling useSearchParams from a Client Component without one fails
// the BUILD, not a lint. Its fallback is what gets prerendered into
// out/index.html.
import { Suspense } from 'react'
import type { Metadata } from 'next'
import WizardChrome from '@/components/wizard/WizardChrome'
import WizardShell from '@/components/wizard/WizardShell'

const DESCRIPTION =
  'What the official labour statistics say about your occupation group, in 177 countries. Every figure carries its tier. No replacement date, because none is published.'

// R8. Per-route, because 0015 R4's contract is about these VALUES. Absolute
// URLs resolve through the layout's metadataBase.
export const metadata: Metadata = {
  title: 'WHO GETS REPLACED FIRST',
  description:
    'Which countries and occupations sit in the work most exposed to AI — from official labour statistics, with proxies and modelled estimates labelled as such.',
  openGraph: {
    // `type` and `siteName` are repeated here rather than inherited: Next
    // REPLACES a route's `openGraph` object wholesale rather than merging its
    // fields into the layout's, so anything omitted here simply does not ship.
    // check:meta caught this — `index.html: missing <meta> og:type` — which is
    // the built-output check earning its keep exactly as 0015 R4 intended.
    type: 'website',
    siteName: 'Who Gets Replaced First',
    title: 'Who Gets Replaced First',
    description: DESCRIPTION,
    url: 'https://apportico.github.io/who-gets-replaced-first/',
    images: [{
      url: 'https://apportico.github.io/who-gets-replaced-first/og.png',
      width: 1200,
      height: 630,
      alt: 'Who Gets Replaced First — official labour statistics for 177 countries, every figure carrying its tier.',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Who Gets Replaced First',
    description: DESCRIPTION,
    images: ['https://apportico.github.io/who-gets-replaced-first/og.png'],
  },
}

export default function Page() {
  return (
    <Suspense fallback={<WizardChrome />}>
      <WizardShell />
    </Suspense>
  )
}
