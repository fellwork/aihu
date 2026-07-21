/**
 * `@aihu/auth/server` — `createVerifiedAuthPlugin` (#420).
 *
 * The plugin's `verify` must be SIGNATURE verification (the `crypto.subtle`
 * HMAC path), not decode: a forged or tampered token yields `null`, a genuine
 * one yields its claims. `checkScope` remains the claim-membership check the
 * gate consults only after `verify` authenticated the same token.
 */

import { describe, expect, it } from 'vitest'
import { createVerifiedAuthPlugin, verifyJwt } from '../src/server-index.ts'

const SECRET = 'verified-plugin-test-secret-32-bytes!!!!'
const WRONG_SECRET = 'this-is-not-the-signing-secret-at-all!!'

/** Build a minimal HMAC-SHA-256 signed JWT (same helper shape as m2.test.ts). */
async function makeSignedJwt(claims: Record<string, unknown>, secret = SECRET): Promise<string> {
  const enc = new TextEncoder()
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  // `exp` default: verifyJwt now REQUIRES an expiry; claim-validation
  // specifics live in jwt-claims.test.ts — these fixtures just stay valid.
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
  return `${signingInput}.${Buffer.from(sigBuf).toString('base64url')}`
}

describe('createVerifiedAuthPlugin — verify()', () => {
  const plugin = createVerifiedAuthPlugin({ jwtSecret: SECRET })

  it('returns the claims for a genuinely signed token', async () => {
    const jwt = await makeSignedJwt({ sub: 'user-9', scope: 'read write' })
    const claims = await plugin.verify!(jwt)
    expect(claims).not.toBeNull()
    expect(claims!.sub).toBe('user-9')
    expect(claims!.scope).toBe('read write')
  })

  it('strips a Bearer prefix before verifying', async () => {
    const jwt = await makeSignedJwt({ sub: 'user-9' })
    const claims = await plugin.verify!(`Bearer ${jwt}`)
    expect(claims?.sub).toBe('user-9')
  })

  it('returns null for a token signed with the wrong secret (forged signature)', async () => {
    const forged = await makeSignedJwt({ sub: 'impostor', scope: 'admin' }, WRONG_SECRET)
    expect(await plugin.verify!(forged)).toBeNull()
  })

  it('returns null for a tampered payload (signature no longer matches)', async () => {
    const jwt = await makeSignedJwt({ sub: 'user-9', scope: 'read' })
    const [h, , s] = jwt.split('.') as [string, string, string]
    const tampered = Buffer.from(JSON.stringify({ sub: 'user-9', scope: 'admin' })).toString(
      'base64url',
    )
    expect(await plugin.verify!(`${h}.${tampered}.${s}`)).toBeNull()
  })

  it('returns null for malformed input (never throws)', async () => {
    expect(await plugin.verify!('')).toBeNull()
    expect(await plugin.verify!('not-a-token')).toBeNull()
    expect(await plugin.verify!('a.b')).toBeNull()
    expect(await plugin.verify!('a.b.c.d')).toBeNull()
  })

  it('agrees with the exported verifyJwt primitive', async () => {
    const jwt = await makeSignedJwt({ sub: 'user-9' })
    const direct = await verifyJwt(jwt, SECRET)
    const viaPlugin = await plugin.verify!(jwt)
    expect(viaPlugin).toEqual(direct)
  })
})

describe('createVerifiedAuthPlugin — checkScope()', () => {
  const plugin = createVerifiedAuthPlugin({ jwtSecret: SECRET })

  it('matches a scope present in the claims', async () => {
    const jwt = await makeSignedJwt({ sub: 'u', scope: 'read write' })
    expect(plugin.checkScope(jwt, 'write')).toBe(true)
    expect(plugin.checkScope(jwt, 'admin')).toBe(false)
  })

  it('returns false for malformed tokens', () => {
    expect(plugin.checkScope('garbage', 'read')).toBe(false)
  })
})
