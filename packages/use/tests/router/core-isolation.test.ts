/**
 * Proves the central claim of the FAMILY-WIDE optional-peer contract (wave0
 * seed `router/useRouteParams`, see its module doc): CORE (`@aihu/use`'s
 * barrel, `./src/index.ts`) never reaches `@aihu/router` — a consumer who
 * has `@aihu/use` installed but not `@aihu/router` can still import and use
 * every CORE composable without incident. Mirrors
 * `tests/integrations/core-isolation.test.ts` for the other peer-isolation
 * contract shape (per-composable peer, no aggregate) — this file covers
 * the family-wide-peer-plus-aggregate shape instead.
 *
 * Simulated by making `@aihu/router` itself fail to resolve (`vi.doMock`
 * throwing, standing in for "this package is not installed") and then
 * importing the CORE barrel fresh — if CORE's module graph touched
 * `@aihu/router` anywhere, this import would throw. It doesn't, because
 * `src/index.ts` never imports anything under `src/router/` (the one-way
 * rule enforced statically by `scripts/dep-check.ts`).
 */
import { describe, expect, it, vi } from 'vitest'

describe('@aihu/use CORE — resolves with the @aihu/router peer absent', () => {
  it('imports the CORE barrel cleanly, and CORE does not export useRouteParams', async () => {
    vi.resetModules()
    vi.doMock('@aihu/router', () => {
      throw new Error("Cannot find module '@aihu/router' (simulated: peer not installed)")
    })

    try {
      // If CORE's module graph touched `@aihu/router` anywhere, this import
      // itself would reject with the mocked failure above — it doesn't.
      const core = await import('../../src/index.ts')

      // Sanity: CORE still works end-to-end (pick one representative
      // composable) and never re-exports the peer-bearing composable.
      const { count } = core.useCounter({ initial: 1 })
      expect(count()).toBe(1)
      expect('useRouteParams' in core).toBe(false)
    } finally {
      vi.doUnmock('@aihu/router')
      vi.resetModules()
    }
  })
})
