/**
 * GX Phase 3 (#437-GX) — the read-axis derivation table
 * (`src/extract-read-policy.ts`), spec §2.1 / §8.
 *
 * One derivation drives robots.txt, the noindex signal, and discovery-listing
 * membership. These tests pin the per-value table; the cross-package
 * agreement with `@aihu/agent-service`'s `decideEmission` lives in
 * `packages/plugin-agent-readiness/tests/read-derivation.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { deriveReadPolicy, extractReadValue, isCallAdvertised } from '../src/extract-read-policy.ts'

describe('deriveReadPolicy — compliance values (spec §2.1, above the tier break)', () => {
  it("'all': every declared tier crawls; fully advertised; no noindex", () => {
    const d = deriveReadPolicy('all')
    expect(d.tier).toBe('compliance')
    expect(d.crawl).toEqual({ searcher: true, 'user-fetcher': true, 'training-crawler': true })
    expect(d.advertiseInRobots).toBe(true)
    expect(d.noindex).toBe(false)
    expect(d.agentDiscovery).toBe(true)
    expect(d.searchDiscovery).toBe(true)
  })

  it("'agents' (the ratified default): searchers + user-fetchers yes, trainers refused", () => {
    const d = deriveReadPolicy('agents')
    expect(d.tier).toBe('compliance')
    expect(d.crawl).toEqual({ searcher: true, 'user-fetcher': true, 'training-crawler': false })
    expect(d.noindex).toBe(false)
    expect(d.agentDiscovery).toBe(true)
    expect(d.searchDiscovery).toBe(true)
  })

  it("absent declaration (undefined/null) resolves to the default 'agents'", () => {
    expect(deriveReadPolicy(undefined)).toEqual(deriveReadPolicy('agents'))
    expect(deriveReadPolicy(null)).toEqual(deriveReadPolicy('agents'))
    expect(deriveReadPolicy(undefined).value).toBe('agents')
  })

  it("'search': searchers only; absent from agent-facing discovery, present in search-facing", () => {
    const d = deriveReadPolicy('search')
    expect(d.crawl).toEqual({ searcher: true, 'user-fetcher': false, 'training-crawler': false })
    expect(d.noindex).toBe(false)
    expect(d.agentDiscovery).toBe(false)
    expect(d.searchDiscovery).toBe(true)
  })

  it("'none': all declared crawlers refused; advertised (Disallow lines) + noindex", () => {
    const d = deriveReadPolicy('none')
    expect(d.tier).toBe('compliance')
    expect(d.crawl).toEqual({ searcher: false, 'user-fetcher': false, 'training-crawler': false })
    // Existence is not secret — the route serves anonymous humans (spec §8).
    expect(d.advertiseInRobots).toBe(true)
    expect(d.noindex).toBe(true)
    expect(d.agentDiscovery).toBe(false)
    expect(d.searchDiscovery).toBe(false)
  })
})

describe('deriveReadPolicy — hard values (below the tier break): never advertised', () => {
  for (const value of ['verified', 'human', { scope: 'reports:read' }] as const) {
    it(`${JSON.stringify(value)}: hard tier — absent from robots + discovery, noindex`, () => {
      const d = deriveReadPolicy(value)
      expect(d.tier).toBe('hard')
      expect(d.crawl).toEqual({
        searcher: false,
        'user-fetcher': false,
        'training-crawler': false,
      })
      // A Disallow line naming the path would advertise its existence.
      expect(d.advertiseInRobots).toBe(false)
      expect(d.noindex).toBe(true)
      expect(d.agentDiscovery).toBe(false)
      expect(d.searchDiscovery).toBe(false)
    })
  }

  it('a malformed value fails CLOSED (hard-shaped), never rounds to open', () => {
    for (const bad of ['everyone', 42, { scope: '' }, { scope: 7 }, [], {}, 'ALL']) {
      const d = deriveReadPolicy(bad)
      expect(d.value).toBe('malformed')
      expect(d.tier).toBe('hard')
      expect(d.advertiseInRobots).toBe(false)
      expect(d.noindex).toBe(true)
      expect(d.agentDiscovery).toBe(false)
    }
  })
})

describe('extractReadValue — safe member access on untrusted extract objects', () => {
  it('pulls read off a well-formed extract; undefined otherwise', () => {
    expect(extractReadValue({ read: 'search', call: 'anonymous' })).toBe('search')
    expect(extractReadValue({ call: 'anonymous' })).toBeUndefined()
    expect(extractReadValue(undefined)).toBeUndefined()
    expect(extractReadValue('agents')).toBeUndefined() // non-object → default path
    expect(extractReadValue(null)).toBeUndefined()
  })
})

describe('isCallAdvertised — the call-axis discovery predicate', () => {
  it('advertised: absent extract/call (pre-GX shape), anonymous, verified, { scope }', () => {
    expect(isCallAdvertised(undefined)).toBe(true)
    expect(isCallAdvertised({})).toBe(true)
    expect(isCallAdvertised({ call: 'anonymous' })).toBe(true)
    expect(isCallAdvertised({ call: 'verified' })).toBe(true)
    expect(isCallAdvertised({ call: { scope: 'reports:read' } })).toBe(true)
  })

  it("closed: 'none', and malformed values fail closed", () => {
    expect(isCallAdvertised({ call: 'none' })).toBe(false)
    expect(isCallAdvertised({ call: 'nope' })).toBe(false)
    expect(isCallAdvertised({ call: { scope: '' } })).toBe(false)
    expect(isCallAdvertised({ call: 42 })).toBe(false)
  })
})
