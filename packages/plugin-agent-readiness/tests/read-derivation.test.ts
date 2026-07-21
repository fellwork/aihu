/**
 * GX Phase 3 (#437-GX) — deriving robots.txt / noindex / discovery output
 * from the `read:` axis (spec §8, §12 Phase 3).
 *
 * Three properties under test:
 *
 *  1. Per-`read`-value robots derivation — a fixture app with a route at
 *     every `read:` value produces the right per-tier allow/disallow, judged
 *     by an RFC 9309-style evaluator (group selection + longest-match), not
 *     by string fishing alone.
 *  2. #430 compatibility — no bot dropped, searchers never blocked by an
 *     `'agents'` route, and an undeclared app's robots.txt is byte-identical
 *     to the shipped tiered default.
 *  3. The three-artifact agreement — robots.txt, llms.txt, and the MCP
 *     server-card all derive from the same declaration, and the derivation
 *     agrees with `@aihu/agent-service`'s `decideEmission` (the request-path
 *     decision) for every read value × crawler tier. This is the "cannot
 *     drift" check: one declaration, every surface.
 *
 * Everything here is COMPLIANCE-TIER (spec §1): robots/noindex/listing
 * absence bind only self-identifying compliant crawlers. Hard-tier
 * enforcement (SSR withholding, bundle/data boundary) is Phase 4 and is
 * deliberately absent from these tests.
 */

import type { AnonymousPrincipal } from '@aihu/agent-service'
import { decideEmission, surfaceCallPolicy } from '@aihu/agent-service'
import { deriveReadPolicy, isCallAdvertised } from '@aihu/server'
import { describe, expect, it } from 'vitest'
import { generateA2aCard } from '../src/a2a-card.ts'
import {
  AI_BOT_LIST,
  AI_TRAINING_CRAWLER_BOTS,
  AI_USER_FETCHER_BOTS,
  classifyBotUserAgent,
  generateLlmsTxt,
  generateRobotsTxt,
  skillsFromRegistry,
} from '../src/index.ts'

// ─── Fixture app: one route per read value ───────────────────────────────────

const openRoute = { pattern: '/open-data', extract: { read: 'all', call: 'anonymous' } }
const defaultRoute = { pattern: '/pricing', extract: { read: 'agents', call: 'anonymous' } }
const searchOnlyRoute = { pattern: '/press', extract: { read: 'search', call: 'anonymous' } }
const noneRoute = { pattern: '/internal-notes', extract: { read: 'none', call: 'anonymous' } }
const verifiedRoute = { pattern: '/account', extract: { read: 'verified', call: 'verified' } }
const humanRoute = { pattern: '/profile', extract: { read: 'human', call: 'verified' } }
const scopedRoute = {
  pattern: '/reports/:id',
  extract: { read: { scope: 'reports:read' }, call: { scope: 'reports:read' } },
}
/** A hand-built route with no compiled sidecar — the pre-GX shape. */
const undeclaredRoute = { pattern: '/blog' }

const FIXTURE_ROUTES = [
  openRoute,
  defaultRoute,
  searchOnlyRoute,
  noneRoute,
  verifiedRoute,
  humanRoute,
  scopedRoute,
  undeclaredRoute,
]

const HARD_PATHS = ['/account', '/profile', '/reports']

// ─── An RFC 9309-style evaluator ─────────────────────────────────────────────
//
// Groups are parsed and merged per user-agent token (RFC 9309 §2.2.1); a
// crawler uses its own group when one exists, else `*`; among matching rules
// the LONGEST path wins (§2.2.2), allow winning ties; no matching rule →
// allowed (robots.txt is allow-by-default).

interface Group {
  allow: string[]
  disallow: string[]
}

function parseRobots(txt: string): Map<string, Group> {
  const groups = new Map<string, Group>()
  let current: Group[] = []
  let inRules = false
  for (const raw of txt.split('\n')) {
    const line = raw.trim()
    const [key, ...rest] = line.split(':')
    const value = rest.join(':').trim()
    const k = (key ?? '').toLowerCase()
    if (k === 'user-agent') {
      if (inRules) current = []
      inRules = false
      let g = groups.get(value)
      if (!g) {
        g = { allow: [], disallow: [] }
        groups.set(value, g)
      }
      current.push(g)
    } else if (k === 'allow' || k === 'disallow') {
      inRules = true
      for (const g of current) g[k === 'allow' ? 'allow' : 'disallow'].push(value)
    }
  }
  return groups
}

function isAllowed(txt: string, botName: string, path: string): boolean {
  const groups = parseRobots(txt)
  const group = groups.get(botName) ?? groups.get('*')
  if (!group) return true
  let best: { len: number; allow: boolean } | null = null
  const consider = (rule: string, allow: boolean) => {
    if (rule === '' || !path.startsWith(rule)) return
    if (!best || rule.length > best.len || (rule.length === best.len && allow)) {
      best = { len: rule.length, allow }
    }
  }
  for (const rule of group.allow) consider(rule, true)
  for (const rule of group.disallow) consider(rule, false)
  return best === null ? true : (best as { len: number; allow: boolean }).allow
}

/** One representative bot per tier (registry names). */
const TIER_BOT: Record<'searcher' | 'user-fetcher' | 'training-crawler', string> = {
  searcher: 'Googlebot',
  'user-fetcher': 'ChatGPT-User',
  'training-crawler': 'GPTBot',
}

// ─── 1. Per-read-value robots derivation ─────────────────────────────────────

describe('robots.txt derives per-route directives from the read: axis', () => {
  const txt = generateRobotsTxt({ routes: FIXTURE_ROUTES })

  it("read:'all' → every tier may crawl the path (trainers get a per-path Allow)", () => {
    expect(txt).toContain('Allow: /open-data')
    for (const bot of [...AI_TRAINING_CRAWLER_BOTS, ...AI_USER_FETCHER_BOTS, 'Googlebot']) {
      expect(isAllowed(txt, bot, '/open-data')).toBe(true)
    }
  })

  it("read:'agents' (the default) → searchers + fetchers allowed, trainers refused — derived, no extra lines", () => {
    for (const bot of AI_USER_FETCHER_BOTS) expect(isAllowed(txt, bot, '/pricing')).toBe(true)
    for (const bot of AI_TRAINING_CRAWLER_BOTS) expect(isAllowed(txt, bot, '/pricing')).toBe(false)
    expect(isAllowed(txt, 'Googlebot', '/pricing')).toBe(true)
    // The default posture is stated by the global tiered blocks, not by
    // per-path lines — a declared-default route adds nothing (byte-compat).
    expect(txt).not.toContain('/pricing')
  })

  it("read:'search' → searchers allowed, user-fetchers + trainers refused", () => {
    expect(isAllowed(txt, 'Googlebot', '/press')).toBe(true)
    for (const bot of AI_USER_FETCHER_BOTS) expect(isAllowed(txt, bot, '/press')).toBe(false)
    for (const bot of AI_TRAINING_CRAWLER_BOTS) expect(isAllowed(txt, bot, '/press')).toBe(false)
  })

  it("read:'none' → all declared crawler tiers refused (searchers via the * group)", () => {
    for (const tierBot of Object.values(TIER_BOT)) {
      expect(isAllowed(txt, tierBot, '/internal-notes')).toBe(false)
    }
    // Unknown compliant crawlers follow `*` too.
    expect(isAllowed(txt, 'SomeUnknownBot', '/internal-notes')).toBe(false)
    // Humans are outside robots.txt entirely; the wildcard still allows the
    // rest of the site (no blanket wildcard Disallow).
    expect(isAllowed(txt, 'SomeUnknownBot', '/pricing')).toBe(true)
  })

  it('hard-tier routes are NOT advertised: no directive names their paths', () => {
    for (const path of HARD_PATHS) {
      expect(txt).not.toContain(path)
    }
  })

  it('a dynamic pattern derives its static prefix (`/reports/:id` would be `/reports/`)', () => {
    // The scoped route is hard-tier so absent; prove the path mapping on a
    // compliance-tier dynamic route instead.
    const out = generateRobotsTxt({
      routes: [{ pattern: '/docs/:slug', extract: { read: 'search', call: 'anonymous' } }],
    })
    expect(out).toContain('Disallow: /docs/')
    expect(isAllowed(out, 'ChatGPT-User', '/docs/intro')).toBe(false)
    expect(isAllowed(out, 'Googlebot', '/docs/intro')).toBe(true)
  })

  it("read:'all' punches a per-path Allow through 'deny-all' (declaration is authoritative)", () => {
    const out = generateRobotsTxt({ aiAgents: 'deny-all', routes: [openRoute] })
    for (const bot of AI_BOT_LIST) {
      expect(isAllowed(out, bot, '/open-data')).toBe(true)
      expect(isAllowed(out, bot, '/anything-else')).toBe(false)
    }
  })

  it('a custom rules array: operator groups untouched; derived RESTRICTIONS ride separate groups, widenings never', () => {
    const out = generateRobotsTxt({
      aiAgents: [{ userAgent: 'GPTBot', disallow: ['/'] }],
      routes: [openRoute, searchOnlyRoute],
    })
    // Operator rule intact — and never widened by a declared read:'all'.
    expect(out).toContain('User-agent: GPTBot\nDisallow: /')
    expect(isAllowed(out, 'GPTBot', '/open-data')).toBe(false)
    // Declared restrictions ARE stated, per bot, as separate groups
    // (RFC 9309 §2.2.1 — a crawler combines groups sharing its user agent).
    expect(isAllowed(out, 'ChatGPT-User', '/press')).toBe(false)
    expect(isAllowed(out, 'ClaudeBot', '/press')).toBe(false)
  })

  it("wildcard suppressed → a declared 'none' refusal still emits a minimal * group", () => {
    const out = generateRobotsTxt({ wildcard: false, routes: [noneRoute] })
    expect(out).toContain('User-agent: *\nDisallow: /internal-notes')
    // The suppressed `Allow: /` wildcard line is NOT resurrected.
    expect(out).not.toContain('User-agent: *\nAllow: /')
    expect(isAllowed(out, 'SomeUnknownBot', '/internal-notes')).toBe(false)
  })
})

// ─── 2. #430 compatibility ───────────────────────────────────────────────────

describe('#430 compatibility', () => {
  it('no bot is dropped: all 13 AI bots still present with routes declared', () => {
    const txt = generateRobotsTxt({ routes: FIXTURE_ROUTES })
    expect(AI_BOT_LIST).toHaveLength(13)
    for (const bot of AI_BOT_LIST) {
      expect(txt).toContain(`User-agent: ${bot}`)
    }
  })

  it("searchers are never blocked by an 'agents' route (no searcher group, no wildcard Disallow)", () => {
    const txt = generateRobotsTxt({ routes: [defaultRoute, openRoute] })
    expect(txt).not.toContain('User-agent: Googlebot\n')
    expect(txt).toContain('User-agent: *\nAllow: /')
    expect(isAllowed(txt, 'Googlebot', '/pricing')).toBe(true)
  })

  it("an undeclared app's robots.txt is byte-identical to the shipped #430 default", () => {
    const shipped = generateRobotsTxt()
    expect(generateRobotsTxt({ routes: [] })).toBe(shipped)
    // Routes at the recorded default posture derive no delta either.
    expect(generateRobotsTxt({ routes: [defaultRoute, undeclaredRoute] })).toBe(shipped)
  })

  it("byte-compat holds under 'allow-all' and 'deny-all' too", () => {
    for (const aiAgents of ['allow-all', 'deny-all'] as const) {
      expect(generateRobotsTxt({ aiAgents, routes: [defaultRoute, undeclaredRoute] })).toBe(
        generateRobotsTxt({ aiAgents }),
      )
    }
  })
})

// ─── 3. Discovery derivation + the three-artifact agreement ──────────────────

const COMPONENT_METAS = [
  {
    tag: 'price-table',
    describes: 'Prices.',
    actions: { refresh: { returns: {}, describe: 'Refresh.' } },
  },
  {
    tag: 'press-kit',
    describes: 'Press assets.',
    actions: { download: { returns: {}, describe: 'Download.' } },
    extract: { read: 'search', call: 'anonymous' },
  },
  {
    tag: 'account-balance',
    describes: 'Balance.',
    actions: { fetch: { returns: {}, describe: 'Fetch.' } },
    extract: { read: 'verified', call: 'verified' },
  },
  {
    tag: 'stats-panel',
    describes: 'Stats.',
    actions: { tally: { returns: {}, describe: 'Tally.' } },
    extract: { read: 'agents', call: 'none' },
  },
]

describe('discovery documents derive from the declared policy', () => {
  const llms = generateLlmsTxt({
    name: 'Fixture App',
    sections: [],
    routes: FIXTURE_ROUTES,
    baseUrl: 'https://example.com',
    components: COMPONENT_METAS,
  })

  it('llms.txt lists exactly the agent-advertisable routes', () => {
    expect(llms).toContain('- [/open-data](https://example.com/open-data)')
    expect(llms).toContain('- [/pricing](https://example.com/pricing)')
    expect(llms).toContain('- [/blog](https://example.com/blog)') // undeclared → default
    // read:'search' and read:'none' exclude user-directed AI fetchers.
    expect(llms).not.toContain('/press')
    expect(llms).not.toContain('/internal-notes')
    // Hard-tier routes are absent from the anonymous document entirely.
    for (const path of HARD_PATHS) expect(llms).not.toContain(path)
  })

  it('llms.txt components section is filtered by the same derivation', () => {
    expect(llms).toContain('### price-table') // pre-GX shape → advertised
    expect(llms).not.toContain('press-kit') // read:'search'
    expect(llms).not.toContain('account-balance') // hard read
    expect(llms).not.toContain('stats-panel') // call:'none'
  })

  it('MCP server-card tools are filtered by read + call advertisability', () => {
    const skills = skillsFromRegistry(COMPONENT_METAS as never)
    const ids = skills.map((s) => s.id)
    expect(ids).toEqual(['price-table.refresh'])
  })

  it('the a2a agent card never names a hard route', () => {
    const card = JSON.stringify(
      generateA2aCard({ name: 'Fixture App', url: 'https://example.com' }),
    )
    for (const path of HARD_PATHS) expect(card).not.toContain(path)
  })
})

// ─── 4. Agreement with the principal gate (the cannot-drift check) ───────────

const anon = (
  uaTier: 'searcher' | 'user-fetcher' | 'training-crawler' | null,
): AnonymousPrincipal => ({
  class: 'anonymous',
  uaTier,
  credentialFailure: 'no-credential',
})

describe('derivation agrees with @aihu/agent-service decideEmission (spec §8: one declaration, every surface)', () => {
  const TIERS = ['searcher', 'user-fetcher', 'training-crawler'] as const

  it('per-tier crawl access equals the gate decision for every compliance value', () => {
    for (const value of ['all', 'agents', 'search', 'none'] as const) {
      const d = deriveReadPolicy(value)
      for (const tier of TIERS) {
        const gate = decideEmission(anon(tier), { axis: 'read', value })
        expect(d.crawl[tier], `${value} × ${tier}`).toBe(gate.allow)
      }
      // Unclassified anonymous requesters (humans) always pass compliance values.
      expect(decideEmission(anon(null), { axis: 'read', value }).allow).toBe(true)
    }
  })

  it('hard values: the gate denies anonymous; the derivation never advertises', () => {
    for (const value of ['verified', 'human', { scope: 'reports:read' }] as const) {
      const d = deriveReadPolicy(value)
      expect(d.tier).toBe('hard')
      expect(d.advertiseInRobots).toBe(false)
      expect(d.noindex).toBe(true)
      expect(d.agentDiscovery).toBe(false)
      for (const tier of [...TIERS, null]) {
        expect(decideEmission(anon(tier), { axis: 'read', value }).allow).toBe(false)
      }
    }
  })

  it('robots.txt output agrees with the gate end-to-end (registry UA → classifier → decision)', () => {
    const txt = generateRobotsTxt({ routes: FIXTURE_ROUTES })
    const complianceRoutes = [
      { path: '/open-data', value: 'all' },
      { path: '/pricing', value: 'agents' },
      { path: '/press', value: 'search' },
      { path: '/internal-notes', value: 'none' },
    ] as const
    for (const { path, value } of complianceRoutes) {
      for (const [tier, bot] of Object.entries(TIER_BOT)) {
        const classified = classifyBotUserAgent(`Mozilla/5.0 (compatible; ${bot}/1.0)`)
        expect(classified).toBe(tier)
        const gate = decideEmission(anon(classified), { axis: 'read', value })
        expect(isAllowed(txt, bot, path), `${bot} × ${path}`).toBe(gate.allow)
      }
    }
  })

  it('isCallAdvertised agrees with surfaceCallPolicy for every call value', () => {
    const calls = ['none', 'anonymous', 'verified', { scope: 'x' }, 'bogus', { scope: '' }]
    for (const call of calls) {
      const extract = { read: 'agents', call }
      expect(isCallAdvertised(extract), JSON.stringify(call)).toBe(
        surfaceCallPolicy({ tag: 't', extract }) !== 'none',
      )
    }
    // Absent extract / absent call — the pre-GX registry shape.
    expect(isCallAdvertised(undefined)).toBe(surfaceCallPolicy(undefined) !== 'none')
    expect(isCallAdvertised({})).toBe(surfaceCallPolicy({ tag: 't', extract: {} }) !== 'none')
  })
})
