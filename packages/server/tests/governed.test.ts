/**
 * GX Phase 4 (#466) — the governed registry ENGINE, unit level.
 * Spec: docs/plans/governed-extractability/70-governed-data-access.md.
 *
 * Covers the registry semantics the router/agent-service suites build on:
 * memoization (§4.4 layer 1), the positive-only TTL cache (§4.4 layer 2 /
 * ratified Q2), the 2000 ms-default deadline (§4.3 / ratified Q1), the
 * `onRevoke(sub)` purge (§4.4.3), `'token-only'` no-ops (§4.2), boot
 * validation (§2.3, G7h runtime half), the generated loader's stage ordering,
 * and the P5/I2s streaming guard.
 */
import { describe, expect, it, vi } from 'vitest'
import type { EntitledPrincipal, GovernedLoadContext, GovernedRegistry } from '../src/governed.ts'
import {
  checkEntitlement,
  createGovernedRegistry,
  materializeGeneratedLoader,
  normalizeGovernedData,
  validateGovernedBoot,
} from '../src/governed.ts'
import { renderToStream } from '../src/ssr.ts'

const MEMBER: EntitledPrincipal = {
  class: 'human-session',
  sub: 'user-1',
  scopes: ['members'],
}

function loadCtx(registry: GovernedRegistry, principal: EntitledPrincipal): GovernedLoadContext {
  return {
    params: { slug: 'hello' },
    url: new URL('http://localhost/lexicon/hello'),
    principal,
    entitlements: registry.createMemo(),
  }
}

describe('createGovernedRegistry — check / memo / cache semantics', () => {
  it("unregistered and 'token-only' scopes are live no-ops: 'granted' (§4.2)", async () => {
    const registry = createGovernedRegistry().entitlement('archive', 'token-only')
    expect(await registry.check('archive', MEMBER)).toBe('granted')
    expect(await registry.check('never-registered', MEMBER)).toBe('granted')
    expect(registry.stats().resolves).toBe(0)
  })

  it('per-request memo: a scope resolves at most once per (request, scope) — G7d', async () => {
    const resolve = vi.fn(async () => true)
    const registry = createGovernedRegistry().entitlement('members', { resolve })
    const memo = registry.createMemo()
    // N consults within one request — read axis + N governed call members.
    const verdicts = await Promise.all([
      registry.check('members', MEMBER, memo),
      registry.check('members', MEMBER, memo),
      registry.check('members', MEMBER, memo),
    ])
    expect(verdicts).toEqual(['granted', 'granted', 'granted'])
    expect(resolve).toHaveBeenCalledTimes(1)
    // A NEW request (new memo) resolves again — no cross-request cache configured.
    await registry.check('members', MEMBER, registry.createMemo())
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('TTL cache: positive verdicts only, within ttl zero resolves, after ttl one — G7d', async () => {
    const resolve = vi.fn(async () => true)
    const registry = createGovernedRegistry().entitlement('members', {
      resolve,
      cache: { ttlMs: 40 },
    })
    await registry.check('members', MEMBER, registry.createMemo())
    expect(resolve).toHaveBeenCalledTimes(1)
    // Second request within TTL: zero resolver invocations (cache hit).
    await registry.check('members', MEMBER, registry.createMemo())
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(registry.stats().cacheHits).toBe(1)
    // After TTL: resolved live again.
    await new Promise((r) => setTimeout(r, 50))
    await registry.check('members', MEMBER, registry.createMemo())
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('negative verdicts are NEVER cached (ratified Q2) — G7d', async () => {
    let entitled = false
    const resolve = vi.fn(async () => entitled)
    const registry = createGovernedRegistry().entitlement('members', {
      resolve,
      cache: { ttlMs: 60_000 },
    })
    expect(await registry.check('members', MEMBER, registry.createMemo())).toBe('denied')
    // A member who just paid is entitled on their IMMEDIATELY following request.
    entitled = true
    expect(await registry.check('members', MEMBER, registry.createMemo())).toBe('granted')
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it("resolver throw → 'unavailable', and the failure is NOT cached (§4.3)", async () => {
    const resolve = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('billing down'))
      .mockResolvedValueOnce(true)
    const registry = createGovernedRegistry().entitlement('members', {
      resolve,
      cache: { ttlMs: 60_000 },
    })
    expect(await registry.check('members', MEMBER, registry.createMemo())).toBe('unavailable')
    expect(await registry.check('members', MEMBER, registry.createMemo())).toBe('granted')
  })

  it("deadline exhaustion is indistinguishable from a throw: 'unavailable', signal aborted (§4.3)", async () => {
    let sawSignal: AbortSignal | undefined
    const registry = createGovernedRegistry().entitlement('members', {
      resolve: ({ signal }) => {
        sawSignal = signal
        return new Promise<boolean>(() => {}) // hangs forever
      },
      timeoutMs: 20,
    })
    expect(await registry.check('members', MEMBER, registry.createMemo())).toBe('unavailable')
    expect(sawSignal?.aborted).toBe(true)
  })

  it('a resolver returning truthy junk never rounds to a grant (fail-closed)', async () => {
    const registry = createGovernedRegistry().entitlement('members', {
      resolve: async () => 'yes' as unknown as boolean,
    })
    expect(await registry.check('members', MEMBER, registry.createMemo())).toBe('denied')
  })

  it('onRevoke(sub) purges that sub’s cached warmth; other subs keep theirs — G7e', async () => {
    const resolve = vi.fn(async () => true)
    const registry = createGovernedRegistry().entitlement('members', {
      resolve,
      cache: { ttlMs: 60_000 },
    })
    const other: EntitledPrincipal = { class: 'human-session', sub: 'user-2', scopes: ['members'] }
    await registry.check('members', MEMBER, registry.createMemo())
    await registry.check('members', other, registry.createMemo())
    expect(resolve).toHaveBeenCalledTimes(2)
    registry.onRevoke('user-1')
    // Revoked sub re-resolves live; untouched sub still rides the cache.
    await registry.check('members', MEMBER, registry.createMemo())
    expect(resolve).toHaveBeenCalledTimes(3)
    await registry.check('members', other, registry.createMemo())
    expect(resolve).toHaveBeenCalledTimes(3)
  })

  it('checkEntitlement is the single named check over the registry (§4.6)', async () => {
    const registry = createGovernedRegistry().entitlement('members', { resolve: async () => true })
    expect(await checkEntitlement(registry, MEMBER, 'members', registry.createMemo())).toBe(
      'granted',
    )
  })
})

describe('normalizeGovernedData — fail-closed declaration parse', () => {
  it('absent → null; well-formed → decl; junk → malformed (never rounded)', () => {
    expect(normalizeGovernedData(undefined)).toBeNull()
    expect(normalizeGovernedData(null)).toBeNull()
    expect(normalizeGovernedData({ type: 'LexiconEntry' })).toEqual({ type: 'LexiconEntry' })
    expect(normalizeGovernedData({ type: 'LexiconEntry', preview: ['headword'] })).toEqual({
      type: 'LexiconEntry',
      preview: ['headword'],
    })
    expect(normalizeGovernedData('LexiconEntry')).toBe('malformed')
    expect(normalizeGovernedData({})).toBe('malformed')
    expect(normalizeGovernedData({ type: '' })).toBe('malformed')
    expect(normalizeGovernedData({ type: 'X', preview: 'headword' })).toBe('malformed')
    expect(normalizeGovernedData({ type: 'X', preview: [1] })).toBe('malformed')
  })
})

describe('validateGovernedBoot (§2.3) — G7h runtime half', () => {
  const dataRoute = {
    pattern: '/lexicon/:slug',
    data: { type: 'LexiconEntry' },
    extract: { read: { scope: 'members' }, call: 'anonymous' },
  }

  it('data: with no registry at all refuses to boot (never servable ungated)', () => {
    expect(() => validateGovernedBoot(undefined, [dataRoute])).toThrowError(/boot refusal/)
  })

  it('data: naming an unregistered type refuses to boot, naming route + key', () => {
    const registry = createGovernedRegistry().entitlement('members', { resolve: async () => true })
    expect(() => validateGovernedBoot(registry, [dataRoute])).toThrowError(
      /\/lexicon\/:slug.*LexiconEntry/s,
    )
  })

  it('strict mode (default with any hard read): an unregistered hard scope refuses to boot', () => {
    const registry = createGovernedRegistry().provider('LexiconEntry', {
      fetch: async () => ({}),
    })
    expect(() => validateGovernedBoot(registry, [dataRoute])).toThrowError(/strict mode.*members/s)
  })

  it("'token-only' registration boots (step 3 becomes a declared no-op)", () => {
    const registry = createGovernedRegistry()
      .provider('LexiconEntry', { fetch: async () => ({}) })
      .entitlement('members', 'token-only')
    expect(() => validateGovernedBoot(registry, [dataRoute])).not.toThrow()
  })

  it('a malformed data: declaration is a boot refusal (fail-closed)', () => {
    const registry = createGovernedRegistry()
    expect(() =>
      validateGovernedBoot(registry, [{ pattern: '/x', data: { preview: ['a'] } }]),
    ).toThrowError(/malformed/)
  })

  it('no registry + no data: declarations is a no-op (G7j)', () => {
    expect(() =>
      validateGovernedBoot(undefined, [
        { pattern: '/public', extract: { read: 'all', call: 'anonymous' } },
      ]),
    ).not.toThrow()
  })
})

describe('materializeGeneratedLoader — stage ordering (§3.2)', () => {
  it('static meet runs first: a request refused on token scopes never costs a resolver call — G7f', async () => {
    const resolve = vi.fn(async () => true) // the delegating human IS entitled…
    const fetch = vi.fn(async () => ({ headword: 'λόγος', senses: 'SECRET' }))
    const registry = createGovernedRegistry()
      .provider('LexiconEntry', { fetch })
      .entitlement('members', { resolve })
    const loader = materializeGeneratedLoader(
      registry,
      { type: 'LexiconEntry' },
      { scope: 'members' },
    )
    // …but the delegated token was minted WITHOUT the scope (attenuation, C3/R3).
    const attenuated: EntitledPrincipal = {
      class: 'scoped-agent',
      sub: 'user-1',
      scopes: ['read:other'],
      claims: { sub: 'user-1' },
    }
    const emission = await loader(loadCtx(registry, attenuated))
    expect(emission.kind).toBe('withheld')
    if (emission.kind === 'withheld') {
      expect(emission.data.$gx.reason).toBe('scope')
    }
    expect(resolve).not.toHaveBeenCalled() // the live layer never widens
    expect(fetch).not.toHaveBeenCalled()
  })

  it('provider fetch runs ONLY after grant; withheld runs preview instead — G7a core', async () => {
    const fetch = vi.fn(async () => ({ headword: 'λόγος', senses: 'SECRET-BYTES' }))
    const preview = vi.fn(async () => ({ headword: 'λόγος', senses: 'LEAKY-PREVIEW' }))
    const registry = createGovernedRegistry()
      .provider('LexiconEntry', { fetch, preview })
      .entitlement('members', { resolve: async () => false })
    const loader = materializeGeneratedLoader(
      registry,
      { type: 'LexiconEntry', preview: ['headword'] },
      { scope: 'members' },
    )
    const emission = await loader(loadCtx(registry, MEMBER))
    expect(emission.kind).toBe('withheld')
    if (emission.kind === 'withheld') {
      expect(emission.data.$gx).toEqual({ entitled: false, reason: 'entitlement' })
      // Preview narrowed to the DECLARED keys only (§4.5 defense in depth):
      expect(emission.data.preview).toEqual({ headword: 'λόγος' })
    }
    expect(fetch).not.toHaveBeenCalled()
    expect(preview).toHaveBeenCalledTimes(1)
  })

  it('provider throw after grant is an ERROR state, never a locked state — G7c', async () => {
    const registry = createGovernedRegistry()
      .provider('LexiconEntry', {
        fetch: async () => {
          throw new Error('db down')
        },
      })
      .entitlement('members', { resolve: async () => true })
    const loader = materializeGeneratedLoader(
      registry,
      { type: 'LexiconEntry' },
      { scope: 'members' },
    )
    const emission = await loader(loadCtx(registry, MEMBER))
    expect(emission).toEqual({ kind: 'error', status: 500 })
  })

  it('granted data carries the reserved $gx discriminant; the runtime wins over collisions', async () => {
    const registry = createGovernedRegistry()
      .provider('LexiconEntry', {
        fetch: async () => ({ headword: 'λόγος', $gx: 'spoofed' }),
      })
      .entitlement('members', 'token-only')
    const loader = materializeGeneratedLoader(
      registry,
      { type: 'LexiconEntry' },
      { scope: 'members' },
    )
    const emission = await loader(loadCtx(registry, MEMBER))
    expect(emission.kind).toBe('granted')
    if (emission.kind === 'granted') {
      expect(emission.data.$gx).toEqual({ entitled: true })
    }
  })

  it('a malformed compiled read value withholds fail-closed (never rounded to open)', async () => {
    const fetch = vi.fn(async () => ({ secret: true }))
    const registry = createGovernedRegistry().provider('LexiconEntry', { fetch })
    const loader = materializeGeneratedLoader(registry, { type: 'LexiconEntry' }, 'everyone')
    const emission = await loader(loadCtx(registry, MEMBER))
    expect(emission.kind).toBe('withheld')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('P5/I2s guard — governed trees are not streamed', () => {
  function pendingTree(): () => unknown {
    return () => ({
      kind: 'branch',
      tag: 'div',
      attrs: {},
      children: [{ kind: 'leaf', tag: 'span', attrs: {}, children: [] }],
      dataSource: {
        status: 'pending',
        onReady: () => () => {},
      },
    })
  }

  async function drain(stream: ReadableStream<string>): Promise<string> {
    const reader = stream.getReader()
    let out = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return out
      out += value
    }
  }

  it('a pending dataSource inside a governed render errors GOVERNED_UNGATED (fail-closed)', async () => {
    await expect(drain(renderToStream(pendingTree(), { governed: true }))).rejects.toThrowError(
      /GOVERNED_UNGATED/,
    )
  })

  it('the same tree still streams when NOT governed (no behavior change)', async () => {
    const stream = renderToStream(pendingTree(), {})
    const reader = stream.getReader()
    const first = await reader.read()
    expect(first.done).toBe(false) // suspended boundary opened, no error
    await reader.cancel()
  })
})
