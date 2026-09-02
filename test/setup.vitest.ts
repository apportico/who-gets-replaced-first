// Spec 0019 R10. The App Router context the suite does not have.
//
// `useSearchParams()` returns null outside a Next router provider, and vitest
// renders components directly — so every test that mounts `WizardShell` threw
// `Cannot read properties of null (reading 'toString')` after R17 moved the
// boot read onto that hook.
//
// The fix is a mock rather than a fallback in the component, deliberately.
// A `useSearchParams() ?? location.search` branch in `WizardShell` would mean
// production and test take different paths through the one piece of code R17
// exists to get right, and the path the tests exercise would be the one that
// never runs. This mock instead reproduces what the real router does in a
// browser — read the current query string — so the suite drives
// `location.search` exactly as it did before, and the component keeps a single
// code path.
import { vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(globalThis.location?.search ?? ''),
  usePathname: () => globalThis.location?.pathname ?? '/',
}))
