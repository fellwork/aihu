// Browser runtime exports — must stay within the 1536 B size budget.
// Build-time plugin exports live in @scribe/router/plugin (src/plugin.ts).

// v0.7.1 — isomorphic router middleware primitives
export type { RouteMatchContext, RouterMiddleware, RouterResult } from './middleware.ts'
export { composeRouterMiddleware, defineRouterMiddleware } from './middleware.ts'
export type { MatchResult, RouteDefinition, RouteModule, Router, RouteSegment } from './router.ts'
export { createRouter } from './router.ts'
