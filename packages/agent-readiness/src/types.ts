// Mirror of @aihu/agent-readiness/src/types.ts AgentReadinessConfig — keep in sync.
import type { LlmsTxtLink, LlmsTxtSection } from './llms-txt.ts'
import type { AgentSkill } from './mcp-server-card.ts'
import type { RobotsConfig, RobotsRule } from './robots.ts'

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

/**
 * Agent-readiness configuration.
 * Canonical source — @aihu/server mirrors this type internally.
 * Minimum viable config: `{ name: 'My App' }`.
 */
export interface AgentReadinessConfig {
  // ── Identity ─────────────────────────────────────────────────────────
  readonly name: string
  readonly version?: string
  readonly summary?: string

  // ── MCP endpoint ─────────────────────────────────────────────────────
  /** When present: MCP card generated at `/.well-known/mcp/server-card.json`. */
  readonly endpoint?: string

  // ── Auth (opt-in, default: no-auth) ──────────────────────────────────
  readonly auth?: McpAuthConfig

  // ── llms.txt ─────────────────────────────────────────────────────────
  readonly llmsSections?: ReadonlyArray<LlmsTxtSection>
  readonly llmsOptional?: ReadonlyArray<LlmsTxtLink>

  // ── robots.txt ───────────────────────────────────────────────────────
  /** Default: 'allow-all'. */
  readonly aiAgents?: RobotsConfig['aiAgents']
  readonly standardBots?: ReadonlyArray<RobotsRule>
  readonly sitemap?: string

  // ── Skills ───────────────────────────────────────────────────────────
  /** Manually declared MCP skills, merged with auto-derived from AgentMetadata.actions. */
  readonly skills?: ReadonlyArray<AgentSkill>
}
