// Spec 0019 R11, layer 1. A separate config from vitest.config.js on purpose.
//
// This snapshot is not part of the suite: it is a comparison harness run TWICE,
// once in a worktree at `main` and once here, whose output is diffed. Putting
// it in the main `include` would run it on every `npm test` and write a file
// nobody asked for.
//
// It goes through vitest rather than bare node so that one file resolves
// `@/utils/x` to `.js` on main and `.ts` on this branch, without either tree
// having to know about the other — which is what makes the two runs comparable
// rather than two different programs.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/data-surface.test.mjs'],
  },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
})
