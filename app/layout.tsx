// Spec 0019 R2 + R3. What index.html's <head> carried, as the App Router layout.
//
// R3. THE FONTS ARE THE TRAP THIS FILE EXISTS TO AVOID.
//
// 0010 R2 shipped twice with the page rendering entirely in fallback stacks,
// because Tailwind v4's processing drops a bare `@import url(...)` from the CSS
// — clean build, green suite, no error anywhere. The fix then was a <link> in
// the document head. `next/font/google` is strictly better: it downloads the
// families at build time and self-hosts them into _next/static/media/, so there
// is no cross-origin request left to drop. The failure class is removed rather
// than re-checked.
//
// Instrument Serif needs both styles — italic is the emphasis device in the
// headline (`replaced.`), per CLAUDE.md's type section.
import type { Metadata } from 'next'
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google'
import '@/styles/index.css'

const geist = Geist({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-geist',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

// R2. Metadata is per-route, not hoisted here.
//
// Only `metadataBase` lives at the layout, because Next REPLACES a route's
// `openGraph` object rather than merging the layout's fields into it — so a
// shared `type`/`siteName` here would silently vanish from any page that
// declares its own openGraph, which is both of them. Each route states its
// nine tags in full; 0015 R4's contract is about those VALUES, and
// `npm run check:meta` asserts them over the built files.
export const metadata: Metadata = {
  metadataBase: new URL('https://apportico.github.io/who-gets-replaced-first/'),
  // Carried over from index.html, which declared it as a plain <link>. Dropping
  // it was invisible in the build and in the suite: the page simply had no
  // icon, so every browser fell back to auto-requesting /favicon.ico at the
  // DOMAIN root — outside the base path — and 404ing. The R12 browser walk is
  // what found it, which is the entire argument for R12 existing.
  // The prefix is applied by hand, from the same environment variable that
  // feeds `basePath` (R15). Next does NOT apply basePath to `metadata.icons`:
  // a bare '/favicon.svg' ships verbatim and 404s at the domain root under a
  // project-site prefix. That is the identical defect 0015 R4 records for
  // `og:image` — correct in source, 404 in production — and check-meta now
  // asserts the icon too, so it cannot come back silently.
  icons: { icon: `${process.env.PAGES_BASE_PATH ?? ''}/favicon.svg` },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
