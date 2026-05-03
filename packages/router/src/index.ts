// Browser runtime exports — must stay within the 1536 B size budget.
// Build-time plugin exports live in @scribe/router/plugin (src/plugin.ts).
export type { RouteSegment, RouteModule, RouteDefinition, MatchResult, Router } from './router.ts'
export { createRouter } from './router.ts'
