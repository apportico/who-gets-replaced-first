import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// Spec 0010 R19. The suite this repo did not have.
//
// Ten of 0010's acceptance criteria needed a rendered DOM or a computed style,
// which made them "someone looked at it" and put them out of reach of
// /evaluate. Most of them did not actually need a browser: they are assertions
// about a resolver, a formatter and a set of absence rules, so R19 pushes that
// logic into src/utils/ as pure functions over the payload and asserts here.
//
// jsdom, not a browser. R4 and R5 stay manual on purpose — token rendering and
// computed touch targets genuinely need one, and pretending otherwise is how a
// suite reports green while proving nothing.
// 0019 R10. The plugins are what the probed Next.js Vitest guide requires:
// `@vitejs/plugin-react` to transform JSX and `vite-tsconfig-paths` so the
// `@/*` alias resolves from tsconfig.json rather than being restated here.
// Vitest runs standalone against Next — it does not go through `next build`.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.vitest.ts'],
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
    globals: true,
    // The pipeline suite lives in Python and runs separately; keep vitest from
    // walking pipeline/raw/, which is ~80MB of cached API responses.
    exclude: ['node_modules/**', 'dist/**', 'out/**', '.next/**', 'pipeline/**', '.claude/**'],
  },
  // Kept alongside tsconfigPaths deliberately: tsconfig.json excludes the test
  // files from the type-check project, so the plugin does not resolve `@/` for
  // them. One explicit alias is cheaper than widening the tsconfig and having
  // `next build` type-check the suite.
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
})
