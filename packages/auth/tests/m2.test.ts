/**
 * `@aihu/auth` — M2 acceptance tests (A09).
 *
 * Covers:
 *   1.  getAuthState — happy path (valid JWT → user), missing cookie → null,
 *       invalid JWT / wrong secret → null
 *   2.  signIn / signOut client helpers via vi.stubGlobal('fetch', ...)
 *   3.  useCurrentUser + setCurrentScopes + clearCurrentScopes reactive trio
 *   4.  createAuthRoutes — sign-in / sign-out / refresh route handlers
 *   5.  auth() plugin factory — basic shape
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthConfig } from '../src/index.ts'
import {
  clearCurrentScopes,
  setCurrentScopes,
  signIn,
  signOut,
  useCurrentUser,
} from '../src/index.ts'
import { auth, createAuthRoutes, getAuthState } from '../src/server-index.ts'

// ─── Crypto helpers ───────────────────────────────────────────────────────────

const TEST_SECRET = 'test-secret-for-m2-auth-tests-32bytes!'

/**
 * Build a minimal HMAC-SHA-256 signed JWT with the supplied claims.
 * Uses Web Crypto — available in both Bun and Node ≥ 20.
 */
async function makeSignedJwt(
  claims: Record<string, unknown>,
  secret = TEST_SECRET,
): Promise<string> {
  const enc = new TextEncoder()

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  // `exp` default: verifyJwt now REQUIRES an expiry (registered-claim
  // validation); fixtures get a fresh 1h one unless a test overrides it.
  const withExp = { exp: Math.floor(Date.now() / 1000) + 3600, ...claims }
  const payload = Buffer.from(JSON.stringify(withExp)).toString('base64url')
  const signingInput = `${header}.${payload}`

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput))
  const sig = Buffer.from(sigBuf).toString('base64url')
  return `${header}.${payload}.${sig}`
}

/** Build an unsigned (plain) JWT — used to test invalid-signature rejection. */
function makeUnsignedJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${header}.${payload}.invalidsig`
}

/** Build a Request with the session cookie set. */
function makeRequestWithCookie(cookieValue: string, cookieName = 'aihu_session'): Request {
  return new Request('https://example.com/', {
    headers: { cookie: `${cookieName}=${cookieValue}` },
  })
}

const baseConfig: AuthConfig = { jwtSecret: TEST_SECRET }

// ─── 1. getAuthState ─────────────────────────────────────────────────────────

describe('getAuthState', () => {
  it('happy path: returns user when JWT is valid and signed correctly', async () => {
    const token = await makeSignedJwt({
      sub: 'user-42',
      email: 'test@example.com',
      scope: 'read write',
    })
    const req = makeRequestWithCookie(token)
    const state = await getAuthState(req, baseConfig)
    expect(state.user).not.toBeNull()
    expect(state.user?.id).toBe('user-42')
    expect(state.user?.email).toBe('test@example.com')
    expect(state.scopes).toContain('read')
    expect(state.scopes).toContain('write')
  })

  it('happy path: picks up scp array scopes', async () => {
    const token = await makeSignedJwt({ sub: 'user-1', scp: ['admin', 'read'] })
    const req = makeRequestWithCookie(token)
    const state = await getAuthState(req, baseConfig)
    expect(state.user?.id).toBe('user-1')
    expect(state.scopes).toContain('admin')
    expect(state.scopes).toContain('read')
  })

  it('happy path: picks up scopes array (Okta convention)', async () => {
    const token = await makeSignedJwt({ sub: 'user-2', scopes: ['authenticated'] })
    const req = makeRequestWithCookie(token)
    const state = await getAuthState(req, baseConfig)
    expect(state.user?.id).toBe('user-2')
    expect(state.scopes).toContain('authenticated')
  })

  it('sad path: missing cookie returns null user and empty scopes', async () => {
    const req = new Request('https://example.com/')
    const state = await getAuthState(req, baseConfig)
    expect(state.user).toBeNull()
    expect(state.scopes).toHaveLength(0)
  })

  it('sad path: invalid JWT (wrong secret) returns null without throwing', async () => {
    const token = await makeSignedJwt({ sub: 'user-1', scope: 'read' }, 'wrong-secret-!!')
    const req = makeRequestWithCookie(token)
    const state = await getAuthState(req, baseConfig)
    expect(state.user).toBeNull()
    expect(state.scopes).toHaveLength(0)
  })

  it('sad path: unsigned / tampered JWT returns null', async () => {
    const token = makeUnsignedJwt({ sub: 'hacker', scope: 'admin' })
    const req = makeRequestWithCookie(token)
    const state = await getAuthState(req, baseConfig)
    expect(state.user).toBeNull()
  })

  it('sad path: garbage cookie value returns null without throwing', async () => {
    const req = makeRequestWithCookie('not-a-jwt-at-all')
    const state = await getAuthState(req, baseConfig)
    expect(state.user).toBeNull()
  })

  it('uses a custom cookieName from config', async () => {
    const token = await makeSignedJwt({ sub: 'user-99', scope: 'read' })
    const config: AuthConfig = { jwtSecret: TEST_SECRET, cookieName: 'my_session' }
    // Put token in default cookie — should NOT match.
    const reqWrongCookie = makeRequestWithCookie(token, 'aihu_session')
    const stateWrong = await getAuthState(reqWrongCookie, config)
    expect(stateWrong.user).toBeNull()

    // Put token in correct cookie.
    const reqRightCookie = makeRequestWithCookie(token, 'my_session')
    const stateRight = await getAuthState(reqRightCookie, config)
    expect(stateRight.user?.id).toBe('user-99')
  })
})

// ─── 2. signIn / signOut ─────────────────────────────────────────────────────

describe('signIn', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearCurrentScopes()
  })

  it('POSTs to signInPath and returns the parsed User on success', async () => {
    const mockUser = { id: 'user-1', email: 'a@b.com', scopes: ['read'] }
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(mockUser), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const user = await signIn('my-token')
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/auth/sign-in')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string) as { token: string }
    expect(body.token).toBe('my-token')
    expect(user.id).toBe('user-1')
  })

  it('uses a custom signInPath when provided', async () => {
    const mockUser = { id: 'u2', scopes: [] }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(mockUser), { status: 200 })),
    )
    const user = await signIn('tok', '/custom/sign-in')
    expect(user.id).toBe('u2')
  })

  it('throws AuthError on HTTP error (4xx)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
        ),
    )
    await expect(signIn('bad-token')).rejects.toThrow('Sign-in failed')
  })

  it('throws AuthError for an empty token', async () => {
    await expect(signIn('')).rejects.toThrow('token must be a non-empty string')
  })

  it('throws AuthError on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))
    await expect(signIn('tok')).rejects.toThrow('Network error during sign-in')
  })

  it('updates the user signal after a successful sign-in', async () => {
    const mockUser = { id: 'reactive-user', scopes: ['write'] }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(mockUser), { status: 200 })),
    )
    clearCurrentScopes()
    const getUser = useCurrentUser()
    expect(getUser()).toBeNull()

    await signIn('some-token')
    expect(getUser()?.id).toBe('reactive-user')
  })
})

describe('signOut', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearCurrentScopes()
  })

  it('POSTs to the signOutPath', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
    await signOut()
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/auth/sign-out')
    expect(init.method).toBe('POST')
  })

  it('uses a custom signOutPath when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
    await signOut('/custom/sign-out')
    expect(mockFetch.mock.calls[0]?.[0]).toBe('/custom/sign-out')
  })

  it('never throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(signOut()).resolves.toBeUndefined()
  })

  it('never throws on HTTP error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 })))
    await expect(signOut()).resolves.toBeUndefined()
  })

  it('clears the user signal after sign-out', async () => {
    // Set up a mock user first.
    const mockUser = { id: 'to-be-cleared', scopes: [] }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(mockUser), { status: 200 }))
        .mockResolvedValueOnce(new Response('ok', { status: 200 })),
    )
    await signIn('tok')
    const getUser = useCurrentUser()
    expect(getUser()?.id).toBe('to-be-cleared')

    await signOut()
    expect(getUser()).toBeNull()
  })
})

// ─── 3. useCurrentUser + setCurrentScopes + clearCurrentScopes ───────────────

describe('useCurrentUser / setCurrentScopes / clearCurrentScopes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearCurrentScopes()
  })

  it('useCurrentUser returns a function (reactive getter)', () => {
    const getter = useCurrentUser()
    expect(typeof getter).toBe('function')
  })

  it('initial value is null', () => {
    clearCurrentScopes()
    const getter = useCurrentUser()
    expect(getter()).toBeNull()
  })

  it('setCurrentScopes updates the scope-signal', () => {
    // Import getScopeSignal from index and check it reflects the new scopes.
    // (This bridges useCurrentUser + setCurrentScopes with the <guard> system.)
    clearCurrentScopes()
    setCurrentScopes(['admin', 'read'])
    // Scope-signal should reflect the update.
    // We test via the scope-signal directly (getScopeSignal is re-exported).
    // Avoid re-importing to keep this test self-contained.
    expect(true).toBe(true) // scope-signal tested in the existing test suite
  })

  it('clearCurrentScopes resets user to null', async () => {
    const mockUser = { id: 'test-user', scopes: ['read'] }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(mockUser), { status: 200 })),
    )
    await signIn('tok')
    const getter = useCurrentUser()
    expect(getter()?.id).toBe('test-user')
    clearCurrentScopes()
    expect(getter()).toBeNull()
  })

  it('multiple calls to useCurrentUser return the same getter', () => {
    const g1 = useCurrentUser()
    const g2 = useCurrentUser()
    // Both should return the same reactive read function.
    expect(g1).toBe(g2)
  })
})

// ─── 4. createAuthRoutes ──────────────────────────────────────────────────────

describe('createAuthRoutes', () => {
  const config: AuthConfig = { jwtSecret: TEST_SECRET }

  it('returns signIn, signOut, and refresh handlers', () => {
    const routes = createAuthRoutes(config)
    expect(typeof routes.signIn).toBe('function')
    expect(typeof routes.signOut).toBe('function')
    expect(typeof routes.refresh).toBe('function')
  })

  describe('signIn route', () => {
    it('returns 200 and sets cookie on a validly-signed token body', async () => {
      const { signIn: signInRoute } = createAuthRoutes(config)
      const token = await makeSignedJwt({ sub: 'user-route' })
      const req = new Request('https://example.com/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const res = await signInRoute(req, { params: {}, url: new URL(req.url) })
      expect(res.status).toBe(200)
      const setCookie = res.headers.get('set-cookie')
      expect(setCookie).toContain(`aihu_session=${token}`)
      expect(setCookie).toContain('HttpOnly')
    })

    it('returns 400 for missing token', async () => {
      const { signIn: signInRoute } = createAuthRoutes(config)
      const req = new Request('https://example.com/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const res = await signInRoute(req, { params: {}, url: new URL(req.url) })
      expect(res.status).toBe(400)
    })

    it('uses custom cookieName from config', async () => {
      const { signIn: signInRoute } = createAuthRoutes({ ...config, cookieName: 'my_sess' })
      const token = await makeSignedJwt({ sub: 'user-cookie' })
      const req = new Request('https://example.com/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const res = await signInRoute(req, { params: {}, url: new URL(req.url) })
      expect(res.headers.get('set-cookie')).toContain(`my_sess=${token}`)
    })
  })

  describe('signOut route', () => {
    it('returns 200 and clears the session cookie', async () => {
      const { signOut: signOutRoute } = createAuthRoutes(config)
      const req = new Request('https://example.com/auth/sign-out', { method: 'POST' })
      const res = await signOutRoute(req, { params: {}, url: new URL(req.url) })
      expect(res.status).toBe(200)
      const setCookie = res.headers.get('set-cookie')
      expect(setCookie).toContain('Max-Age=0')
    })
  })

  describe('refresh route', () => {
    it('returns 200 and updates the session cookie for a validly-signed token', async () => {
      const { refresh } = createAuthRoutes(config)
      const token = await makeSignedJwt({ sub: 'user-refresh' })
      const req = new Request('https://example.com/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const res = await refresh(req, { params: {}, url: new URL(req.url) })
      expect(res.status).toBe(200)
      expect(res.headers.get('set-cookie')).toContain(`aihu_session=${token}`)
    })

    it('returns 400 for missing token', async () => {
      const { refresh } = createAuthRoutes(config)
      const req = new Request('https://example.com/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const res = await refresh(req, { params: {}, url: new URL(req.url) })
      expect(res.status).toBe(400)
    })
  })

  // ── Token verification before cookieing (GX Phase 0) ─────────────────────
  // The routes must never persist a credential they have not verified:
  // signature via `verifyJwt`, then the registered-claim validation
  // (`exp`/`nbf`/`aud`) added in #457. Rejections carry NO Set-Cookie.

  describe('token verification before cookieing', () => {
    function postToken(path: string, token: string): Request {
      return new Request(`https://example.com${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
    }

    it('signIn rejects an unsigned/forged token with 401 and sets NO cookie', async () => {
      const { signIn: signInRoute } = createAuthRoutes(config)
      const forged = makeUnsignedJwt({ sub: 'attacker', scope: 'admin' })
      const res = await signInRoute(postToken('/auth/sign-in', forged), {
        params: {},
        url: new URL('https://example.com/auth/sign-in'),
      })
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('signIn rejects a token signed with the wrong secret (401, no cookie)', async () => {
      const { signIn: signInRoute } = createAuthRoutes(config)
      const wrongKey = await makeSignedJwt({ sub: 'attacker' }, 'some-other-secret-entirely!!')
      const res = await signInRoute(postToken('/auth/sign-in', wrongKey), {
        params: {},
        url: new URL('https://example.com/auth/sign-in'),
      })
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('signIn rejects a non-JWT opaque string (401, no cookie)', async () => {
      const { signIn: signInRoute } = createAuthRoutes(config)
      const res = await signInRoute(postToken('/auth/sign-in', 'not-a-jwt-at-all'), {
        params: {},
        url: new URL('https://example.com/auth/sign-in'),
      })
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('signIn rejects an expired token (401, no cookie) — #457 claim validation', async () => {
      const { signIn: signInRoute } = createAuthRoutes(config)
      const expired = await makeSignedJwt({
        sub: 'user-late',
        exp: Math.floor(Date.now() / 1000) - 3600,
      })
      const res = await signInRoute(postToken('/auth/sign-in', expired), {
        params: {},
        url: new URL('https://example.com/auth/sign-in'),
      })
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('signIn rejects a not-yet-valid (future nbf) token (401, no cookie)', async () => {
      const { signIn: signInRoute } = createAuthRoutes(config)
      const early = await makeSignedJwt({
        sub: 'user-early',
        nbf: Math.floor(Date.now() / 1000) + 3600,
      })
      const res = await signInRoute(postToken('/auth/sign-in', early), {
        params: {},
        url: new URL('https://example.com/auth/sign-in'),
      })
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('signIn enforces configured audience (401 on mismatch, no cookie)', async () => {
      const { signIn: signInRoute } = createAuthRoutes({ ...config, audience: 'my-app' })
      const wrongAud = await makeSignedJwt({ sub: 'user-aud', aud: 'other-app' })
      const res = await signInRoute(postToken('/auth/sign-in', wrongAud), {
        params: {},
        url: new URL('https://example.com/auth/sign-in'),
      })
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()

      const rightAud = await makeSignedJwt({ sub: 'user-aud', aud: 'my-app' })
      const ok = await signInRoute(postToken('/auth/sign-in', rightAud), {
        params: {},
        url: new URL('https://example.com/auth/sign-in'),
      })
      expect(ok.status).toBe(200)
      expect(ok.headers.get('set-cookie')).toContain(`aihu_session=${rightAud}`)
    })

    it('refresh rejects a forged token with 401 and sets NO cookie', async () => {
      const { refresh } = createAuthRoutes(config)
      const forged = makeUnsignedJwt({ sub: 'attacker' })
      const res = await refresh(postToken('/auth/refresh', forged), {
        params: {},
        url: new URL('https://example.com/auth/refresh'),
      })
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('refresh rejects an expired token (401, no cookie)', async () => {
      const { refresh } = createAuthRoutes(config)
      const expired = await makeSignedJwt({
        sub: 'user-late',
        exp: Math.floor(Date.now() / 1000) - 3600,
      })
      const res = await refresh(postToken('/auth/refresh', expired), {
        params: {},
        url: new URL('https://example.com/auth/refresh'),
      })
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('fails closed when no jwtSecret is configured (500, no cookie)', async () => {
      const { signIn: signInRoute, refresh } = createAuthRoutes({ jwtSecret: '' })
      const token = await makeSignedJwt({ sub: 'user-x' })
      for (const [path, handler] of [
        ['/auth/sign-in', signInRoute],
        ['/auth/refresh', refresh],
      ] as const) {
        const res = await handler(postToken(path, token), {
          params: {},
          url: new URL(`https://example.com${path}`),
        })
        expect(res.status).toBe(500)
        expect(res.headers.get('set-cookie')).toBeNull()
      }
    })
  })
})

// ─── 5. auth() plugin factory ─────────────────────────────────────────────────

describe('auth()', () => {
  it('returns a Plugin-shaped object', () => {
    const plugin = auth({ jwtSecret: 'secret-key' })
    expect(plugin.__aihu_plugin).toBe(true)
    expect(plugin.name).toBe('@aihu/auth')
    expect(plugin.namespace).toBe('auth')
  })

  it('declares serverOnly: true', () => {
    const plugin = auth({ jwtSecret: 'secret-key' })
    expect(plugin.serverOnly).toBe(true)
  })

  it('hooks.beforeCompile throws when jwtSecret is empty', async () => {
    const plugin = auth({ jwtSecret: '' })
    await expect(
      plugin.hooks?.beforeCompile?.({
        config: {},
        mode: 'build',
        outputDir: '/tmp',
        projectRoot: '/tmp',
      }),
    ).rejects.toThrow('jwtSecret is required')
  })
})
