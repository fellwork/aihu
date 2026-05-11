// Mirror of @aihu-plugin/agent-readiness/src/types.ts AgentReadinessConfig — keep in sync.
import type { A2aCapabilities, A2aSkill } from './a2a-card.ts'
import type { LlmsTxtLink, LlmsTxtSection } from './llms-txt.ts'
import type { AgentSkill } from './mcp-server-card.ts'
import type { RobotsConfig, RobotsRule } from './robots.ts'
import type { SitemapUrl } from './sitemap.ts'

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

  // ── Site identity ─────────────────────────────────────────────────────
  /** Canonical base URL (e.g. 'https://aihu.dev'). Used by A2A card, MCP discovery, and JSON-LD. */
  readonly siteUrl?: string

  // ── A2A Agent Card ────────────────────────────────────────────────────
  /**
   * Generate /.well-known/agent.json (Google A2A protocol).
   * `true` derives name/description/url/version from top-level config fields.
   * Object form overrides streaming/pushNotifications capabilities.
   */
  readonly a2aCard?:
    | true
    | { readonly capabilities?: A2aCapabilities; readonly skills?: ReadonlyArray<A2aSkill> }

  // ── MCP Discovery ─────────────────────────────────────────────────────
  /**
   * Generate /.well-known/mcp.json.
   * When true and `endpoint` is set, points to the endpoint URL.
   * When true and `endpoint` is absent, falls back to /.well-known/mcp/server-card.json.
   */
  readonly mcpDiscovery?: boolean

  // ── Sitemap pages ─────────────────────────────────────────────────────
  /**
   * Pages to include in /sitemap.xml.
   * When provided, the Vite plugin emits sitemap.xml at build time.
   * The existing `sitemap` field (URL string) is used for robots.txt Sitemap: reference.
   */
  readonly sitemapPages?: ReadonlyArray<SitemapUrl>

  // ── JSON-LD structured data ───────────────────────────────────────────
  /**
   * JSON-LD objects injected into <head> via <script type="application/ld+json">.
   * If absent but `siteUrl` is set, a SoftwareApplication schema is auto-generated.
   * Set `false` to disable auto-generation.
   */
  readonly jsonLd?: ReadonlyArray<Record<string, unknown>> | false
}
