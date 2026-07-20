// `AgentReadinessConfig` is single-sourced in `@aihu/server` (it types
// `AihuConfig.agent`, and this package already depends on `@aihu/server`).
// We re-export it — not re-declare it — so there is nothing to keep in sync.
export type { AgentReadinessConfig } from '@aihu/server'

/**
 * OAuth 2.0 auth configuration for a protected MCP endpoint.
 * Opt-in — no-auth is the default (public endpoint, Option A).
 * Option C: OAuth 2.0 per RFC 9728.
 */
export interface McpAuthConfig {
  readonly type: 'oauth2'
  readonly authorizationUrl: string
  readonly tokenUrl: string
  readonly scopes?: ReadonlyArray<string>
  /**
   * Resource identifier URI (RFC 9728 §2).
   * Defaults to the `endpoint` URL when not provided.
   */
  readonly resourceUri?: string
}
