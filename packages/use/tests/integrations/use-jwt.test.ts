/**
 * Unit tests for `useJwt` (`@aihu/use/integrations` family, wave0 seed):
 * decoding a valid token, a malformed token, and — the point of this
 * seed — graceful (non-throwing, call-time) degradation when the optional
 * `jwt-decode` peer itself cannot be loaded. jsdom environment (root
 * vitest config); decoding is async (the peer loads lazily), so each test
 * awaits a microtask flush via `vi.waitFor`.
 */
import { describe, expect, it, vi } from 'vitest'

// A structurally-valid (unsigned) JWT for `{"sub":"abc123","role":"admin"}` —
// header.payload.signature, each segment base64url-encoded JSON (signature
// content is irrelevant; jwt-decode never verifies it, only decodes).
const VALID_TOKEN = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJhYmMxMjMiLCJyb2xlIjoiYWRtaW4ifQ.'

describe('@aihu/use/integrations/useJwt', () => {
  it('decodes a valid token payload', async () => {
    const { useJwt } = await import('../../src/integrations/useJwt/index.ts')
    const { payload, error } = useJwt<{ sub: string; role: string }>(VALID_TOKEN)

    await vi.waitFor(() => expect(payload()).toBeDefined())
    expect(payload()).toEqual({ sub: 'abc123', role: 'admin' })
    expect(error()).toBeUndefined()
  })

  it('exposes a clear error (never throws) for a malformed token', async () => {
    const { useJwt } = await import('../../src/integrations/useJwt/index.ts')
    const { payload, error } = useJwt('not-a-jwt')

    await vi.waitFor(() => expect(error()).toBeDefined())
    expect(error()).toBeInstanceOf(Error)
    expect(payload()).toBeUndefined()
  })
})

describe('@aihu/use/integrations/useJwt — optional peer absent', () => {
  it('degrades to a clear call-time error instead of throwing when jwt-decode cannot be loaded', async () => {
    vi.resetModules()
    vi.doMock('jwt-decode', () => {
      throw new Error("Cannot find module 'jwt-decode' (simulated: peer not installed)")
    })

    try {
      // Importing the module itself must NOT throw — only calling it may
      // surface the peer failure (module-scope safety, see the module doc).
      const mod = await import('../../src/integrations/useJwt/index.ts')
      let payload: (() => unknown) | undefined
      let error: (() => Error | undefined) | undefined
      expect(() => {
        ;({ payload, error } = mod.useJwt(VALID_TOKEN))
      }).not.toThrow()

      await vi.waitFor(() => expect(error?.()).toBeDefined())
      expect(error?.()?.message).toMatch(/jwt-decode/)
      expect(payload?.()).toBeUndefined()
    } finally {
      vi.doUnmock('jwt-decode')
      vi.resetModules()
    }
  })
})
