// Placeholder proving the runner is wired. Replaced by the real suites in
// step 7; kept until then so `npm test` has something to run and `verify`
// cannot pass with an empty suite.
import { describe, it, expect } from 'vitest'

describe('vitest is wired', () => {
  it('runs', () => {
    expect(true).toBe(true)
  })
})
