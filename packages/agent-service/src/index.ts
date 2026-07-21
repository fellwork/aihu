/**
 * `@aihu/agent-service` public surface (v0.3.0 live-dispatch).
 *
 * Value exports: `createAgentService`, and the GX Phase 2 principal gate:
 *               `resolvePrincipal`, `decideEmission`, `surfaceCallPolicy`,
 *               `isScopeValue`
 * Type exports: `AgentManifest`, `AgentToolEntry`, `AgentService`,
 *               `AgentServiceOptions`, `InputSchema`, `ActionSchema`,
 *               `LiveBinding`, `RequestContext`, `AuthPlugin`,
 *               `RateLimitPlugin`, `VerifiedClaims`, and the principal-gate
 *               types (`Principal`, `EmissionDecision`, …)
 */
export { createAgentService } from './agent-service.ts'
export type {
  AnonymousPrincipal,
  AnonymousUaTier,
  CredentialFailure,
  EmissionDecision,
  EmissionDenyReason,
  EmissionDeps,
  EmissionQuery,
  EnforcementTier,
  ExtractCallValue,
  ExtractReadValue,
  ExtractScopeValue,
  HumanSessionPrincipal,
  Principal,
  PrincipalClass,
  PrincipalGateDeps,
  PrincipalSource,
  ScopedAgentPrincipal,
  VerifiedAgentPrincipal,
} from './principal-gate.ts'
export {
  decideEmission,
  isScopeValue,
  resolvePrincipal,
  surfaceCallPolicy,
} from './principal-gate.ts'
export type {
  ActionSchema,
  AgentManifest,
  AgentService,
  AgentServiceOptions,
  AgentToolEntry,
  AuthPlugin,
  InputSchema,
  LiveBinding,
  RateLimitPlugin,
  RequestContext,
  VerifiedClaims,
} from './types.ts'
