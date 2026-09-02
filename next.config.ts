import type { NextConfig } from 'next'

// Spec 0019 R1. Static export on GitHub Pages — Option A, settled in the spec's
// source verification. What it forecloses (request-reading route handlers,
// cookies, rewrites, redirects, headers, middleware, ISR, Server Actions, draft
// mode, intercepting routes, the default next/image loader) is listed in R1 and
// the Non-goals, so #31 reopens it deliberately rather than discovering it.
//
// R1. `basePath` comes from the environment, never hardcoded: the deploy
// workflow passes `configure-pages`'s own `base_path` output (R15), so the
// prefix is whatever Pages actually serves rather than what we assumed.
//
// R2. `trailingSlash: false` is chosen, not defaulted. At `false` Next emits
// `out/methodology.html` and Pages resolves both `/methodology` and
// `/methodology.html` to it, so 0015's published og:url stays valid. At `true`
// the file becomes `out/methodology/index.html` and that og:url would point at
// a path the build no longer emits — 0015 R4's own defect, passing 0015 R4's
// own check.
const nextConfig: NextConfig = {
  output: 'export',
  basePath: process.env.PAGES_BASE_PATH,
  trailingSlash: false,
}

export default nextConfig
