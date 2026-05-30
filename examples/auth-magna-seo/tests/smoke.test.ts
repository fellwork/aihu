/**
 * auth-magna-seo smoke test.
 *
 * Asserts the imperative 3-package contract:
 *   (1) request without JWT            → 401
 *   (2) valid JWT lacking magna:read   → 403
 *   (3) valid JWT WITH magna:read      → 200, body has magna data + JSON-LD
 *   (4) GET /sitemap.xml               → 200, valid XML (createSeoRoutes)
 *   (5) createMagnaResource            → state signal reaches { status: 'ready' }
 *
 * The magna endpoint is stubbed via createMagnaFetch's injectable `fetch`, so
 * no network is hit. The test JWTs are signed with the SAME secret the app's
 * authConfig verifies against.
 */

import { describe, expect, it } from 'vitest'
import { createApp, makeProductResource, type ProductData } from '../src/routes.ts'

// ─── Crypto helpers (technique from packages/auth/tests/m2.test.ts) ─────────────

const TEST_SECRET = 'auth-magna-seo-smoke-secret-32bytes!!'
const COOKIE_NAME = 'aihu_session'

async function makeSignedJwt(
  claims: Record<string, unknown>,
  secret = TEST_SECRET,
): Promise<string> {
  const enc = new TextEncoder()
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
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

function makeRequest(path: string, cookieValue?: string): Request {
  const headers: Record<string, string> = {}
  if (cookieValue !== undefined) headers.cookie = `${COOKIE_NAME}=${cookieValue}`
  return new Request(`https://example.com${path}`, { headers })
}

// ─── Stub magna GraphQL endpoint ───────────────────────────────────────────────

const CANNED: ProductData = { product: { id: 'sku-7', name: 'Reactive Widget' } }

const stubFetch = (async () =>
  new Response(JSON.stringify({ data: CANNED }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as unknown as typeof globalThis.fetch

const app = createApp({ jwtSecret: TEST_SECRET, fetch: stubFetch })

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('auth-magna-seo — auth gate', () => {
  it('(1) request without JWT → 401', async () => {
    const res = await app(makeRequest('/product'))
    expect(res.status).toBe(401)
  })

  it('(2) valid JWT without magna:read scope → 403', async () => {
    const token = await makeSignedJwt({ sub: 'user-1', scope: 'profile:read' })
    const res = await app(makeRequest('/product', token))
    expect(res.status).toBe(403)
  })

  it('(3) valid JWT WITH magna:read scope → 200 with magna data + JSON-LD', async () => {
    const token = await makeSignedJwt({ sub: 'user-1', scope: 'profile:read magna:read' })
    const res = await app(makeRequest('/product', token))
    expect(res.status).toBe(200)
    const body = await res.text()

    // Magna data actually flowed through the read (not a hardcoded string).
    expect(body).toContain('Reactive Widget')
    expect(body).toContain('sku-7')

    // JSON-LD block is present and parses to a schema.org object.
    expect(body).toContain('<script type="application/ld+json">')
    const match = body.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
    expect(match).not.toBeNull()
    const jsonLd = JSON.parse(match?.[1] ?? '{}')
    expect(jsonLd['@context']).toBe('https://schema.org')
    expect(jsonLd['@type']).toBe('WebPage')
  })
})

describe('auth-magna-seo — SEO routes', () => {
  it('(4) GET /sitemap.xml → 200 with valid XML', async () => {
    const res = await app(makeRequest('/sitemap.xml'))
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toMatch(/<\?xml|<urlset/)
  })
})

describe('auth-magna-seo — reactive surface', () => {
  it('(5) createMagnaResource drives its state signal to ready', async () => {
    const resource = makeProductResource(stubFetch)
    const [getState] = resource.state

    // Poll the reactive state until the async fetch settles.
    const deadline = Date.now() + 2000
    while (getState().status !== 'ready' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5))
    }

    const state = getState()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.data.product.name).toBe('Reactive Widget')
    }
  })
})
