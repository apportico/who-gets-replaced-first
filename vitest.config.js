import { defineConfig } from 'vitest/config'

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
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    globals: true,
    // The pipeline suite lives in Python and runs separately; keep vitest from
    // walking pipeline/raw/, which is ~80MB of cached API responses.
    exclude: ['node_modules/**', 'dist/**', 'pipeline/**', '.claude/**'],
  },
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
})
