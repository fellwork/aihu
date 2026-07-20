/**
 * Fixture: the second half of the name-collision case. `AgentSkill` here is a
 * genuinely different type that happens to share a name with the one in
 * `packages/beta`. Zero member overlap → D1 must not flag it.
 *
 * Without this pair, D1's "same name in two packages" half is untested in the
 * negative direction, and a name-only rule would look correct.
 */

export interface AgentSkill {
  readonly cacheTtlSeconds: number
  readonly retryBudget: number
  readonly transportKind: 'ws' | 'http'
}

/**
 * Fixture: `packages/seo/src/routes.ts:9` — "Mirrors the pattern from
 * `createAgentReadinessRoutes`". Mirrors a PATTERN; declares nothing
 * duplicated. Must not fire.
 */
export function createSeoRoutes(): ReadonlyArray<string> {
  // Mirrors the pattern from `createAgentReadinessRoutes`.
  return ['/robots.txt', '/sitemap.xml']
}
