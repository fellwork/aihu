// Browser runtime exports — must stay within the 1536 B size budget.
// Build-time plugin exports live in @scribe/router/plugin (src/plugin.ts).
export type { RouteSegment, RouteModule, RouteDefinition, MatchResult, Router } from './router.ts'
export { createRouter } from './router.ts'
// v0.7.1 — isomorphic router middleware primitives
export type { RouteMatchContext, RouterResult, RouterMiddleware } from './middleware.ts'
export { defineRouterMiddleware, composeRouterMiddleware } from './middleware.ts'
