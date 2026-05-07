/**
 * `@aihu/agent-service` public surface (v0.3.0 live-dispatch).
 *
 * Value exports: `createAgentService`
 * Type exports: `AgentManifest`, `AgentToolEntry`, `AgentService`,
 *               `AgentServiceOptions`, `InputSchema`, `ActionSchema`,
 *               `LiveBinding`, `RequestContext`, `AuthPlugin`, `RateLimitPlugin`
 */
export { createAgentService } from './agent-service.ts'
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
} from './types.ts'
