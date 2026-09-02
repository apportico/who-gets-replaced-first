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
