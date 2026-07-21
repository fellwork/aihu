/**
 * The `read:` (crawl-visibility) axis — ONE derivation for every derived
 * surface (GX Phase 3, #437-GX; spec: docs/plans/governed-extractability/
 * 40-spec.md §2.1, §4.3, §8).
 *
 * Phase 1 compiled every route/component's `extract.read` declaration into the
 * `.route.json` sidecar and agent-meta. This module is where those compiled
 * values become OUTPUT policy: robots.txt per-route directives, the
 * `X-Robots-Tag: noindex` signal, and discovery-listing membership
 * (llms.txt / cards) all call `deriveReadPolicy` — one table, fanned out, no
 * hand-maintained per-surface lists anywhere (thesis §Derived).
 *
 * ── The honesty constraint (spec §1 — read before trusting this file) ──────
 * Everything derived here is COMPLIANCE-TIER: robots.txt is advisory
 * (RFC 9309 compliance is voluntary), `X-Robots-Tag`/noindex is honored only
 * by compliant crawlers, and discovery-list absence hides nothing from a
 * client that guesses URLs. These signals bind exactly the population that
 * identifies itself — a UA-spoofing scraper defeats all of them. HARD
 * enforcement of the verified `read` values (`'verified'`/`'human'`/
 * `{ scope }`) is per-principal SSR withholding + the bundle/data boundary —
 * Phase 4, NOT built here. Do not represent any output of this module as hard
 * enforcement.
 *
 * Agreement: `@aihu/agent-service`'s `decideEmission` makes the same per-value
 * decisions on the request path (its `READ_REFUSES` table). The two cannot
 * drift silently — `packages/plugin-agent-readiness/tests/read-derivation.test.ts`
 * asserts, for every read value × crawler tier, that this table and
 * `decideEmission` agree.
 */

/** The three declared-crawler tiers of the unified bot registry. */
export type CrawlerTier = 'searcher' | 'user-fetcher' | 'training-crawler'

/** Per-tier crawl access derived from a `read` value. */
export type CrawlerTierAccess = Readonly<Record<CrawlerTier, boolean>>

/**
 * A compiled `extract` declaration as it appears on `.route.json` /
 * agent-meta artifacts. Values are `unknown` on purpose: the compiler
 * validates at build time (C483), but artifacts can be hand-edited or
 * version-skewed, so every consumer re-normalizes fail-closed here.
 */
export interface ExtractDeclarationLike {
  readonly read?: unknown
  readonly call?: unknown
}

/**
 * The normalized `read` value. `'agents'` is the ratified resolved default
 * (spec §9) — an ABSENT declaration normalizes to it. `'malformed'` is the
 * fail-closed landing for a present-but-unparseable value: treated like a
 * hard value for every derived surface (never advertised, noindex), because a
 * corrupted policy must never round to open.
 */
export type NormalizedReadValue =
  | 'all'
  | 'agents'
  | 'search'
  | 'none'
  | 'verified'
  | 'human'
  | { readonly scope: string }
  | 'malformed'

/** Everything the derived surfaces need to know about one `read` value. */
export interface ReadDerivation {
  readonly value: NormalizedReadValue
  /**
   * `'compliance'` for the anonymous values (`'all'`/`'agents'`/`'search'`/
   * `'none'`), `'hard'` for the verified values — the spec §2.1 tier break.
   * NOTE: the tier names what full enforcement WOULD be; this module only
   * emits the compliance-tier signals either way (see module docblock).
   */
  readonly tier: 'compliance' | 'hard'
  /**
   * Which declared crawler tiers the value admits. Meaningful for compliance
   * values; all-false for hard values (no anonymous crawl access at all).
   */
  readonly crawl: CrawlerTierAccess
  /**
   * Should robots.txt carry per-path directives for this surface?
   * Compliance values: yes (`read:'none'` routes are served to humans, so
   * their existence is not a secret — they DO get Disallow lines, spec §8).
   * Hard values: NO — the path is simply absent from robots.txt. A Disallow
   * line naming a governed path would advertise its existence (spec §8
   * existence-advertising; the A-5 self-contradiction).
   */
  readonly advertiseInRobots: boolean
  /**
   * Should the served response carry a noindex signal (`X-Robots-Tag:
   * noindex`)? True for `read:'none'` and every hard/malformed value.
   */
  readonly noindex: boolean
  /**
   * Listed in agent-facing discovery (llms.txt, MCP server-card tools)?
   * Requires user-fetcher access: a surface that refuses user-directed AI
   * fetchers must not be advertised to them.
   */
  readonly agentDiscovery: boolean
  /** Listed in search-facing surfaces (sitemap)? Requires searcher access. */
  readonly searchDiscovery: boolean
}

const NO_CRAWL: CrawlerTierAccess = {
  searcher: false,
  'user-fetcher': false,
  'training-crawler': false,
}

/** A hard-tier (or fail-closed malformed) value: never advertised, noindex. */
function hardDerivation(value: NormalizedReadValue): ReadDerivation {
  return {
    value,
    tier: 'hard',
    crawl: NO_CRAWL,
    advertiseInRobots: false,
    noindex: true,
    agentDiscovery: false,
    searchDiscovery: false,
  }
}

/**
 * The compliance-value table. Must agree with `@aihu/agent-service`'s
 * `READ_REFUSES` (asserted by the cross-package agreement test — see module
 * docblock): a tier is `true` here exactly when `decideEmission` allows an
 * anonymous principal of that `uaTier`.
 */
const COMPLIANCE_TABLE: Record<
  'all' | 'agents' | 'search' | 'none',
  Pick<ReadDerivation, 'crawl' | 'noindex' | 'agentDiscovery' | 'searchDiscovery'>
> = {
  all: {
    crawl: { searcher: true, 'user-fetcher': true, 'training-crawler': true },
    noindex: false,
    agentDiscovery: true,
    searchDiscovery: true,
  },
  agents: {
    crawl: { searcher: true, 'user-fetcher': true, 'training-crawler': false },
    noindex: false,
    agentDiscovery: true,
    searchDiscovery: true,
  },
  search: {
    crawl: { searcher: true, 'user-fetcher': false, 'training-crawler': false },
    noindex: false,
    agentDiscovery: false,
    searchDiscovery: true,
  },
  none: {
    crawl: NO_CRAWL,
    noindex: true,
    agentDiscovery: false,
    searchDiscovery: false,
  },
}

/**
 * Derive every compliance-tier output signal from one `read` value.
 *
 * Normalization is fail-closed (mirrors `surfaceCallPolicy` on the call axis):
 *   - absent (`undefined`/`null`) → `'agents'`, the resolved default — the
 *     posture the compiler records for an undeclared surface, byte-identical
 *     in behavior to pre-GX output;
 *   - a well-formed value → itself;
 *   - present but malformed → `'malformed'`, treated like a hard value
 *     (never advertised, noindex) — a corrupted policy is refused, never
 *     rounded to open.
 */
export function deriveReadPolicy(read: unknown): ReadDerivation {
  if (read === undefined || read === null) read = 'agents'

  if (read === 'all' || read === 'agents' || read === 'search' || read === 'none') {
    return {
      value: read,
      tier: 'compliance',
      advertiseInRobots: true,
      ...COMPLIANCE_TABLE[read],
    }
  }

  if (read === 'verified' || read === 'human') return hardDerivation(read)

  if (
    typeof read === 'object' &&
    typeof (read as { scope?: unknown }).scope === 'string' &&
    (read as { scope: string }).scope !== ''
  ) {
    return hardDerivation({ scope: (read as { scope: string }).scope })
  }

  return hardDerivation('malformed')
}

/**
 * Pull the `read` member off a compiled `extract` object without trusting its
 * shape. A non-object `extract` yields `undefined` (→ the resolved default).
 */
export function extractReadValue(extract: unknown): unknown {
  if (typeof extract !== 'object' || extract === null) return undefined
  return (extract as ExtractDeclarationLike).read
}

/**
 * Is this surface's agent surface advertisable at all — i.e. is its compiled
 * `extract.call` anything other than closed?
 *
 * Normalization mirrors `@aihu/agent-service`'s `surfaceCallPolicy` exactly
 * (agreement pinned by the cross-package test): absent `extract`/`call` →
 * `'anonymous'` (advertisable); `'none'` → closed; a malformed value → closed,
 * fail-closed. Discovery documents use this so a `call:'none'` surface's tools
 * never appear in any anonymous listing.
 */
export function isCallAdvertised(extract: unknown): boolean {
  if (typeof extract !== 'object' || extract === null) return true
  const call = (extract as ExtractDeclarationLike).call
  if (call === undefined) return true
  if (call === 'anonymous' || call === 'verified') return true
  if (
    typeof call === 'object' &&
    call !== null &&
    typeof (call as { scope?: unknown }).scope === 'string' &&
    (call as { scope: string }).scope !== ''
  ) {
    return true
  }
  return false
}
