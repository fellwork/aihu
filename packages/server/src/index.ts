export type { AgentReadinessConfig } from './agent-readiness-config.ts'
export type { ApiHandler } from './api.ts'
export { badRequest, defineApiRoute, json, methodNotAllowed, notFound, serverError } from './api.ts'
export { createServerCall } from './client.ts'
export type {
  AihuConfig,
  BuildConfig,
  BuildTarget,
  CorsConfig,
  RenderingConfig,
  RenderingMode,
  RouteConfig,
  ServerConfig,
  UiConfig,
} from './config.ts'
export { defineAihuConfig } from './config.ts'
export type { DefinedLoader, LoadedRouteContext, LoaderFn, LoaderResult } from './data.ts'
export { defineLoader } from './data.ts'
// GX Phase 3 (#437-GX) — the read-axis derivation: one table for robots.txt,
// noindex, and discovery-listing membership. Compliance-tier only (spec §1).
export type {
  CrawlerTier,
  CrawlerTierAccess,
  ExtractDeclarationLike,
  NormalizedReadValue,
  ReadDerivation,
} from './extract-read-policy.ts'
export { deriveReadPolicy, extractReadValue, isCallAdvertised } from './extract-read-policy.ts'
// GX Phase 4 (#466) — the governed data-access boundary: registration surface
// (createGovernedRegistry), the generated-loader pipeline, boot validation,
// and the defineGovernedFetch escape hatch. Server-only by construction.
export type {
  DataProvider,
  DefinedGovernedFetch,
  Entitled,
  EntitledPrincipal,
  EntitlementContext,
  EntitlementMemo,
  EntitlementRegistration,
  EntitlementsHandle,
  EntitlementVerdict,
  GeneratedLoader,
  GovernedEmission,
  GovernedFetchContext,
  GovernedLoadContext,
  GovernedRegistry,
  GovernedRegistryStats,
  GovernedRequestAuth,
  GovernedRouteCensusEntry,
  GovernedRouteDataDecl,
  Principal,
  PrincipalGateDeps,
  PrincipalSource,
  Withheld,
  WithheldReason,
} from './governed.ts'
export {
  checkEntitlement,
  createGovernedRegistry,
  DEFAULT_ENTITLEMENT_TIMEOUT_MS,
  defineGovernedFetch,
  GOVERNED_RETRY_AFTER_SECONDS,
  governedHttpStatus,
  isGovernedFetch,
  materializeGeneratedLoader,
  normalizeGovernedData,
  passesRouteRead,
  resolveRequestPrincipal,
  validateGovernedBoot,
} from './governed.ts'
// B3 (SEO arc) — pure mapper: route head metadata → renderable HeadConfig.
export type { RouteHead, RouteHeadLowerOptions } from './head-lowering.ts'
export { routeHeadToSsrHead } from './head-lowering.ts'
export { renderToString } from './loader.ts'
export { composeMiddleware, defineMiddleware } from './middleware.ts'
export type {
  Route,
  RouteInput,
  RouteManifest,
  RouteOptions,
  RouterOptions,
  SubrouteTuple,
} from './router.ts'
export { createRequestRouter, defineRoute, defineRoutes } from './router.ts'
export type {
  ComponentDescription,
  HeadConfig,
  LinkTag,
  MetaTag,
  ScriptTag,
  SsrOptions,
} from './ssr.ts'
export {
  _buildStateScript,
  _setContextFns,
  _setStoreSerializer,
  attachSsrString,
  renderToStream,
} from './ssr.ts'
export type { StreamRouteHandler } from './stream-route.ts'
// v0.4.0 — defineStreamRoute for streaming HTTP responses.
export { defineStreamRoute } from './stream-route.ts'
export type { DataSource, StreamOptions } from './stream-types.ts'
export type { HttpMethod, Middleware, Next, RouteContext, RouteHandler } from './types.ts'
