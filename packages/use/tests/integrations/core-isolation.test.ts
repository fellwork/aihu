/**
 * Proves the central claim of the optional-peer contract (wave0 seed
 * `integrations/useJwt`, see its module doc): CORE (`@aihu/use`'s barrel,
 * `./src/index.ts`) never reaches `jwt-decode` — a consumer who has
 * `@aihu/use` installed but NONE of the five `/integrations` peers can
 * still import and use every CORE composable without incident.
 *
 * Simulated by making `jwt-decode` itself fail to resolve (`vi.doMock`
 * throwing, standing in for "this package is not in node_modules") and
 * then importing the CORE barrel fresh — if CORE's module graph touched
 * `jwt-decode` anywhere, this import would throw. It doesn't, because
 * `src/index.ts` never imports anything under `src/integrations/` (the
 * one-way rule enforced statically by `scripts/dep-check.ts`).
 */
import { describe, expect, it, vi } from 'vitest'

describe('@aihu/use CORE — resolves with the jwt-decode peer absent', () => {
  it('imports the CORE barrel cleanly, and CORE does not export useJwt', async () => {
    vi.resetModules()
    vi.doMock('jwt-decode', () => {
      throw new Error("Cannot find module 'jwt-decode' (simulated: peer not installed)")
    })

    try {
      // If CORE's module graph touched `jwt-decode` anywhere, this import
      // itself would reject with the mocked failure above — it doesn't.
      const core = await import('../../src/index.ts')

      // Sanity: CORE still works end-to-end (pick one representative
      // composable) and never re-exports the peer-bearing composable.
      const { count } = core.useCounter({ initial: 1 })
      expect(count()).toBe(1)
      expect('useJwt' in core).toBe(false)
    } finally {
      vi.doUnmock('jwt-decode')
      vi.resetModules()
    }
  })
})
