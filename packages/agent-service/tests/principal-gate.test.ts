/**
 * #437-GX Phase 2 — the principal gate: `resolvePrincipal` + `decideEmission`.
 *
 * `resolvePrincipal` must produce exactly one of the four principal classes
 * from a request's credential material, deriving verified principals
 * EXCLUSIVELY from `AuthPlugin.verify` (real HMAC-SHA-256 here, as in the
 * #420 suite — "forged" means a cryptographically forged signature).
 *
 * `decideEmission` must enforce the `call` axis as a CEILING over member
 * gates, and DECIDE (not enforce — Phase 3/4 consume it) the `read` axis.
 */

import { describe, expect, it } from 'vitest'
import { decideEmission, resolvePrincipal, surfaceCallPolicy } from '../src/principal-gate.ts'
import type { AuthPlugin, VerifiedClaims } from '../src/types.ts'

// ─── Real HMAC-SHA-256 JWT helpers (same discipline as verified-principal) ───

const SECRET = 'principal-gate-test-secret-32-bytes-ok!'
const WRONG_SECRET = 'an-entirely-different-signing-secret!!!'

async function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  )
}

async function signJwt(claims: Record<string, unknown>, secret = SECRET): Promise<string> {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const input = `${header}.${payload}`
  const key = await hmacKey(secret, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))
  return `${input}.${Buffer.from(sig).toString('base64url')}`
}

function realHmacAuthPlugin(): AuthPlugin {
  const decode = (jwt: string): Record<string, unknown> | null => {
    const parts = jwt.split('.')
    if (parts.length !== 3 || !parts[1]) return null
    try {
      const obj = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown
      return typeof obj === 'object' && obj !== null && !Array.isArray(obj)
        ? (obj as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
  return {
    checkScope(jwt: string, scope: string): boolean {
      const claims = decode(jwt)
      if (!claims || typeof claims.scope !== 'string') return false
      return claims.scope.split(' ').includes(scope)
    },
    async verify(jwt: string): Promise<VerifiedClaims | null> {
      try {
        const parts = jwt.split('.')
        if (parts.length !== 3) return null
        const [h, p, s] = parts as [string, string, string]
        const key = await hmacKey(SECRET, ['verify'])
        const sigBytes = Buffer.from(s, 'base64url')
        const sig = new Uint8Array(new ArrayBuffer(sigBytes.length))
        sigBytes.copy(sig as unknown as Buffer)
        const ok = await crypto.subtle.verify(
          'HMAC',
          key,
          sig,
          new TextEncoder().encode(`${h}.${p}`),
        )
        if (!ok) return null
        return decode(jwt) as VerifiedClaims | null
      } catch {
        return null
      }
    },
  }
}

/** A registry-shaped classifier stub (the readiness package's contract). */
const classify = (ua: string): 'searcher' | 'user-fetcher' | 'training-crawler' | null => {
  if (/GPTBot/i.test(ua)) return 'training-crawler'
  if (/ChatGPT-User/i.test(ua)) return 'user-fetcher'
  if (/Googlebot/i.test(ua)) return 'searcher'
  return null
}

// ─── resolvePrincipal — the four classes ─────────────────────────────────────

describe('resolvePrincipal — principal classes', () => {
  it('no credential, plugin wired → anonymous with failure no-credential', async () => {
    const p = await resolvePrincipal({}, { authPlugin: realHmacAuthPlugin() })
    expect(p).toEqual({ class: 'anonymous', uaTier: null, credentialFailure: 'no-credential' })
  })

  it('no auth plugin at all → anonymous with failure no-auth-plugin (even with a JWT)', async () => {
    const jwt = await signJwt({ sub: 'alice' })
    const p = await resolvePrincipal({ jwt })
    expect(p.class).toBe('anonymous')
    if (p.class === 'anonymous') expect(p.credentialFailure).toBe('no-auth-plugin')
  })

  it('decode-only plugin (no verify) → anonymous with failure unverifiable-plugin', async () => {
    const jwt = await signJwt({ sub: 'alice' })
    const p = await resolvePrincipal({ jwt }, { authPlugin: { checkScope: () => true } })
    expect(p.class).toBe('anonymous')
    if (p.class === 'anonymous') expect(p.credentialFailure).toBe('unverifiable-plugin')
  })

  it('forged JWT (wrong signing secret) → anonymous, NEVER a verified class', async () => {
    const forged = await signJwt({ sub: 'mallory', scope: 'admin' }, WRONG_SECRET)
    const p = await resolvePrincipal({ jwt: forged }, { authPlugin: realHmacAuthPlugin() })
    expect(p.class).toBe('anonymous')
    if (p.class === 'anonymous') expect(p.credentialFailure).toBe('invalid-credential')
  })

  it('verified JWT without a sub claim → anonymous (no-subject)', async () => {
    const jwt = await signJwt({ scope: 'reports:read' })
    const p = await resolvePrincipal({ jwt }, { authPlugin: realHmacAuthPlugin() })
    expect(p.class).toBe('anonymous')
    if (p.class === 'anonymous') expect(p.credentialFailure).toBe('no-subject')
  })

  it('valid verified JWT, no scopes → verified-agent with the verified sub', async () => {
    const jwt = await signJwt({ sub: 'agent-1' })
    const p = await resolvePrincipal({ jwt }, { authPlugin: realHmacAuthPlugin() })
    expect(p.class).toBe('verified-agent')
    if (p.class === 'verified-agent') {
      expect(p.sub).toBe('agent-1')
      expect(p.scopes).toEqual([])
    }
  })

  it('valid verified JWT carrying scopes → scoped-agent with the claim scopes', async () => {
    const jwt = await signJwt({ sub: 'agent-2', scope: 'reports:read billing:write' })
    const p = await resolvePrincipal({ jwt }, { authPlugin: realHmacAuthPlugin() })
    expect(p.class).toBe('scoped-agent')
    if (p.class === 'scoped-agent') {
      expect(p.sub).toBe('agent-2')
      expect(p.scopes).toEqual(['reports:read', 'billing:write'])
    }
  })

  it('array-form scp claims are honored', async () => {
    const jwt = await signJwt({ sub: 'agent-3', scp: ['a', 'b'] })
    const p = await resolvePrincipal({ jwt }, { authPlugin: realHmacAuthPlugin() })
    expect(p.class).toBe('scoped-agent')
    if (p.class === 'scoped-agent') expect(p.scopes).toEqual(['a', 'b'])
  })

  it('host-verified session → human-session', async () => {
    const p = await resolvePrincipal(
      { session: { sub: 'user-7', scopes: ['reports:read'] } },
      { authPlugin: realHmacAuthPlugin() },
    )
    expect(p).toEqual({ class: 'human-session', sub: 'user-7', scopes: ['reports:read'] })
  })

  it('a FAILED Bearer credential beside a valid session yields the session, not more', async () => {
    const forged = await signJwt({ sub: 'mallory' }, WRONG_SECRET)
    const p = await resolvePrincipal(
      { jwt: forged, session: { sub: 'user-7', scopes: [] } },
      { authPlugin: realHmacAuthPlugin() },
    )
    // Same access as sending no Bearer credential at all.
    expect(p.class).toBe('human-session')
  })

  it('a VALID Bearer credential wins over a session (spec §4.1 order)', async () => {
    const jwt = await signJwt({ sub: 'agent-1' })
    const p = await resolvePrincipal(
      { jwt, session: { sub: 'user-7', scopes: [] } },
      { authPlugin: realHmacAuthPlugin() },
    )
    expect(p.class).toBe('verified-agent')
  })
})

describe('resolvePrincipal — anonymous UA classification (the bot-registry tap)', () => {
  it('classifies a declared crawler UA via the injected registry classifier', async () => {
    const p = await resolvePrincipal(
      { userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)' },
      { classifyUserAgent: classify },
    )
    expect(p.class).toBe('anonymous')
    if (p.class === 'anonymous') expect(p.uaTier).toBe('training-crawler')
  })

  it('an unlisted browser UA stays unclassified (uaTier null)', async () => {
    const p = await resolvePrincipal(
      { userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15' },
      { classifyUserAgent: classify },
    )
    if (p.class === 'anonymous') expect(p.uaTier).toBeNull()
  })

  it('no classifier injected → uaTier null (never a guess)', async () => {
    const p = await resolvePrincipal({ userAgent: 'GPTBot/1.1' })
    if (p.class === 'anonymous') expect(p.uaTier).toBeNull()
  })

  it('a verified principal is never UA-classified', async () => {
    const jwt = await signJwt({ sub: 'agent-1' })
    const p = await resolvePrincipal(
      { jwt, userAgent: 'GPTBot/1.1' },
      { authPlugin: realHmacAuthPlugin(), classifyUserAgent: classify },
    )
    expect(p.class).toBe('verified-agent')
  })
})

// ─── decideEmission — the call axis (ENFORCED in Phase 2) ────────────────────

const ANON = { class: 'anonymous', uaTier: null, credentialFailure: 'no-credential' } as const
const AGENT = { class: 'verified-agent', sub: 'a1', scopes: [], claims: { sub: 'a1' } } as const
const SCOPED = {
  class: 'scoped-agent',
  sub: 'a2',
  scopes: ['reports:read'],
  claims: { sub: 'a2', scope: 'reports:read' },
} as const
const HUMAN = { class: 'human-session', sub: 'u1', scopes: ['reports:read'] } as const

describe('decideEmission × call axis', () => {
  it("call:'none' + an exposed member → denied 404 for EVERY principal class", () => {
    for (const principal of [ANON, AGENT, SCOPED, HUMAN]) {
      const d = decideEmission(principal, { axis: 'call', value: 'none' })
      expect(d.allow).toBe(false)
      if (!d.allow) {
        expect(d.code).toBe(404)
        expect(d.reason).toBe('SURFACE_UNAVAILABLE')
      }
    }
  })

  it("call:'anonymous' + ungated member → allowed anonymously (today's behavior)", () => {
    const d = decideEmission(ANON, { axis: 'call', value: 'anonymous' })
    expect(d.allow).toBe(true)
  })

  it("call:'anonymous' + member $scope still demands a principal (member gate unchanged)", () => {
    const d = decideEmission(ANON, {
      axis: 'call',
      value: 'anonymous',
      memberScope: 'reports:read',
    })
    expect(d.allow).toBe(false)
    if (!d.allow) {
      expect(d.code).toBe(401)
      expect(d.reason).toBe('AUTH_REQUIRED')
    }
  })

  it("call:'verified' + anonymous → 401 with the exact ladder message", () => {
    const d = decideEmission(ANON, { axis: 'call', value: 'verified' })
    expect(d.allow).toBe(false)
    if (!d.allow) {
      expect(d.code).toBe(401)
      expect(d.message).toBe('AUTH_REQUIRED: a signed JWT is required for this tool')
    }
  })

  it("call:'verified' + valid verified principal → allowed (agent AND human session)", () => {
    expect(decideEmission(AGENT, { axis: 'call', value: 'verified' }).allow).toBe(true)
    expect(decideEmission(HUMAN, { axis: 'call', value: 'verified' }).allow).toBe(true)
  })

  it('the 401 ladder distinguishes deployment defects from missing credentials', () => {
    const missing = { ...ANON, credentialFailure: 'no-auth-plugin' } as const
    const unverifiable = { ...ANON, credentialFailure: 'unverifiable-plugin' } as const
    const invalid = { ...ANON, credentialFailure: 'invalid-credential' } as const
    const d1 = decideEmission(missing, { axis: 'call', value: 'verified' })
    const d2 = decideEmission(unverifiable, { axis: 'call', value: 'verified' })
    const d3 = decideEmission(invalid, { axis: 'call', value: 'verified' })
    if (!d1.allow) expect(d1.reason).toBe('AUTH_MISSING')
    if (!d2.allow) expect(d2.reason).toBe('AUTH_UNVERIFIABLE')
    if (!d3.allow) expect(d3.reason).toBe('AUTH_INVALID')
  })

  it('call:{scope} — matching verified principal allowed, mismatch → 403 naming the scope', () => {
    const ok = decideEmission(SCOPED, { axis: 'call', value: { scope: 'reports:read' } })
    expect(ok.allow).toBe(true)
    const bad = decideEmission(SCOPED, { axis: 'call', value: { scope: 'billing:write' } })
    expect(bad.allow).toBe(false)
    if (!bad.allow) {
      expect(bad.code).toBe(403)
      expect(bad.message).toBe("SCOPE_DENIED: JWT lacks required scope 'billing:write'")
    }
  })

  it('call:{scope} + anonymous → 401 (never 403: authenticate before authorize)', () => {
    const d = decideEmission(ANON, { axis: 'call', value: { scope: 'reports:read' } })
    if (!d.allow) expect(d.code).toBe(401)
  })

  it('MEET: surface {scope} ∧ member $scope requires BOTH (surface ceiling named first)', () => {
    const both = {
      ...SCOPED,
      scopes: ['reports:read', 'billing:write'],
    } as const
    // Only the member scope — surface ceiling refuses first.
    const surfaceFail = decideEmission(SCOPED, {
      axis: 'call',
      value: { scope: 'billing:write' },
      memberScope: 'reports:read',
    })
    expect(surfaceFail.allow).toBe(false)
    if (!surfaceFail.allow) expect(surfaceFail.message).toContain("'billing:write'")
    // Only the surface scope — the member gate still holds.
    const memberFail = decideEmission(SCOPED, {
      axis: 'call',
      value: { scope: 'reports:read' },
      memberScope: 'billing:write',
    })
    expect(memberFail.allow).toBe(false)
    if (!memberFail.allow) expect(memberFail.message).toContain("'billing:write'")
    // Both → allowed.
    expect(
      decideEmission(both, {
        axis: 'call',
        value: { scope: 'billing:write' },
        memberScope: 'reports:read',
      }).allow,
    ).toBe(true)
  })

  it('CEILING, never a grant: a surface value can only narrow, not expose or widen', () => {
    // An exposed member under call:'none' is denied outright.
    const closed = decideEmission(AGENT, { axis: 'call', value: 'none', memberScope: null })
    expect(closed.allow).toBe(false)
    // call:'verified' does NOT waive a member's own $scope.
    const noWaive = decideEmission(AGENT, {
      axis: 'call',
      value: 'verified',
      memberScope: 'reports:read',
    })
    expect(noWaive.allow).toBe(false)
    if (!noWaive.allow) expect(noWaive.reason).toBe('SCOPE_DENIED')
  })

  it('the injected hasScope predicate is authoritative when provided (checkScope parity)', () => {
    const consulted: string[] = []
    const d = decideEmission(
      AGENT, // carries NO claim scopes — the predicate decides anyway
      { axis: 'call', value: { scope: 'reports:read' }, memberScope: 'billing:write' },
      {
        hasScope: (s) => {
          consulted.push(s)
          return true
        },
      },
    )
    expect(d.allow).toBe(true)
    expect(consulted).toEqual(['reports:read', 'billing:write'])
  })
})

// ─── decideEmission — the read axis (DECIDED, not enforced — Phase 3/4) ──────

describe('decideEmission × read axis (decision only; nothing downstream acts on it yet)', () => {
  const anonAs = (uaTier: 'searcher' | 'user-fetcher' | 'training-crawler' | null) =>
    ({ class: 'anonymous', uaTier, credentialFailure: 'no-credential' }) as const

  it("read:'all' allows every requester, including declared trainers", () => {
    for (const tier of [null, 'searcher', 'user-fetcher', 'training-crawler'] as const) {
      expect(decideEmission(anonAs(tier), { axis: 'read', value: 'all' }).allow).toBe(true)
    }
  })

  it("read:'agents' refuses ONLY declared training crawlers (compliance tier)", () => {
    const trainer = decideEmission(anonAs('training-crawler'), { axis: 'read', value: 'agents' })
    expect(trainer.allow).toBe(false)
    if (!trainer.allow) {
      expect(trainer.code).toBe(403)
      expect(trainer.reason).toBe('UA_REFUSED')
      expect(trainer.tier).toBe('compliance')
    }
    expect(decideEmission(anonAs('user-fetcher'), { axis: 'read', value: 'agents' }).allow).toBe(
      true,
    )
    expect(decideEmission(anonAs('searcher'), { axis: 'read', value: 'agents' }).allow).toBe(true)
    expect(decideEmission(anonAs(null), { axis: 'read', value: 'agents' }).allow).toBe(true)
  })

  it("read:'search' refuses trainers AND user-fetchers; search + humans pass", () => {
    expect(
      decideEmission(anonAs('training-crawler'), { axis: 'read', value: 'search' }).allow,
    ).toBe(false)
    expect(decideEmission(anonAs('user-fetcher'), { axis: 'read', value: 'search' }).allow).toBe(
      false,
    )
    expect(decideEmission(anonAs('searcher'), { axis: 'read', value: 'search' }).allow).toBe(true)
    expect(decideEmission(anonAs(null), { axis: 'read', value: 'search' }).allow).toBe(true)
  })

  it("read:'none' refuses every declared crawler tier; anonymous humans pass", () => {
    for (const tier of ['searcher', 'user-fetcher', 'training-crawler'] as const) {
      expect(decideEmission(anonAs(tier), { axis: 'read', value: 'none' }).allow).toBe(false)
    }
    expect(decideEmission(anonAs(null), { axis: 'read', value: 'none' }).allow).toBe(true)
  })

  it('verified principals always pass compliance-tier read values', () => {
    for (const value of ['all', 'agents', 'search', 'none'] as const) {
      expect(decideEmission(AGENT, { axis: 'read', value }).allow).toBe(true)
      expect(decideEmission(HUMAN, { axis: 'read', value }).allow).toBe(true)
    }
  })

  it("read:'verified' → 401 for anonymous (hard tier), allowed for any verified principal", () => {
    const d = decideEmission(anonAs(null), { axis: 'read', value: 'verified' })
    expect(d.allow).toBe(false)
    if (!d.allow) {
      expect(d.code).toBe(401)
      expect(d.tier).toBe('hard')
    }
    expect(decideEmission(AGENT, { axis: 'read', value: 'verified' }).allow).toBe(true)
    expect(decideEmission(HUMAN, { axis: 'read', value: 'verified' }).allow).toBe(true)
  })

  it("read:'human' → only a human session qualifies; agents get 403 HUMAN_ONLY", () => {
    expect(decideEmission(HUMAN, { axis: 'read', value: 'human' }).allow).toBe(true)
    const agent = decideEmission(SCOPED, { axis: 'read', value: 'human' })
    expect(agent.allow).toBe(false)
    if (!agent.allow) expect(agent.reason).toBe('HUMAN_ONLY')
    const anon = decideEmission(anonAs(null), { axis: 'read', value: 'human' })
    if (!anon.allow) expect(anon.code).toBe(401)
  })

  it('read:{scope} → the verified principal must carry the scope', () => {
    expect(decideEmission(SCOPED, { axis: 'read', value: { scope: 'reports:read' } }).allow).toBe(
      true,
    )
    const denied = decideEmission(AGENT, { axis: 'read', value: { scope: 'reports:read' } })
    expect(denied.allow).toBe(false)
    if (!denied.allow) expect(denied.code).toBe(403)
  })
})

// ─── surfaceCallPolicy — metadata → call policy ──────────────────────────────

describe('surfaceCallPolicy — reading the Phase 1 agent-meta artifact', () => {
  it('no metadata / no extract member → anonymous (pre-GX registry, byte-identical behavior)', () => {
    expect(surfaceCallPolicy(undefined)).toBe('anonymous')
    expect(surfaceCallPolicy({ tag: 'x-a' })).toBe('anonymous')
  })

  it('well-formed values pass through', () => {
    expect(surfaceCallPolicy({ tag: 'x', extract: { read: 'agents', call: 'none' } })).toBe('none')
    expect(surfaceCallPolicy({ tag: 'x', extract: { read: 'agents', call: 'verified' } })).toBe(
      'verified',
    )
    expect(
      surfaceCallPolicy({ tag: 'x', extract: { read: 'agents', call: { scope: 'a' } } }),
    ).toEqual({ scope: 'a' })
  })

  it('extract present, call key absent → anonymous (the documented default)', () => {
    expect(surfaceCallPolicy({ tag: 'x', extract: { read: 'agents' } })).toBe('anonymous')
  })

  it('MALFORMED call value → none, fail-closed (never rounded to open)', () => {
    expect(surfaceCallPolicy({ tag: 'x', extract: { call: 'wide-open' } })).toBe('none')
    expect(surfaceCallPolicy({ tag: 'x', extract: { call: { scope: '' } } })).toBe('none')
    expect(surfaceCallPolicy({ tag: 'x', extract: { call: 42 } })).toBe('none')
  })
})
