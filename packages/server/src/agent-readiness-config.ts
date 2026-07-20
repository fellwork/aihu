/**
 * Canonical `AgentReadinessConfig` — the type of `AihuConfig.agent`.
 *
 * This is the SINGLE source of truth. `@aihu/server` owns the `AihuConfig`
 * contract (`defineAihuConfig`), so the type of its `agent` field lives here.
 * `@aihu-plugin/agent-readiness` already depends on `@aihu/server`, so it
 * re-exports this type (`export type { AgentReadinessConfig } from '@aihu/server'`)
 * rather than re-declaring it — there is nothing to keep in sync.
 *
 * Member shapes are inlined (server's self-contained style: no runtime or type
 * dependency on the plugin). The plugin binds `config: AgentReadinessConfig`
 * and passes fields into its generators, which are typed with the plugin's
 * named equivalents (`A2aSkill`, `SitemapUrl`, `AgentSkill`, …); `tsc`
 * structurally validates that these inline shapes stay compatible.
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
  readonly auth?: {
    readonly type: 'oauth2'
    readonly authorizationUrl: string
    readonly tokenUrl: string
    readonly scopes?: ReadonlyArray<string>
    readonly resourceUri?: string
  }

  // ── llms.txt ─────────────────────────────────────────────────────────
  readonly llmsSections?: ReadonlyArray<{
    readonly title: string
    readonly links: ReadonlyArray<{
      readonly title: string
      readonly url: string
      readonly description?: string
    }>
  }>
  readonly llmsOptional?: ReadonlyArray<{
    readonly title: string
    readonly url: string
    readonly description?: string
  }>

  // ── robots.txt ───────────────────────────────────────────────────────
  /** Default: 'allow-all'. */
  readonly aiAgents?:
    | 'allow-all'
    | 'deny-all'
    | ReadonlyArray<{
        readonly userAgent: string | ReadonlyArray<string>
        readonly allow?: ReadonlyArray<string>
        readonly disallow?: ReadonlyArray<string>
        readonly crawlDelay?: number
      }>
  readonly standardBots?: ReadonlyArray<{
    readonly userAgent: string | ReadonlyArray<string>
    readonly allow?: ReadonlyArray<string>
    readonly disallow?: ReadonlyArray<string>
    readonly crawlDelay?: number
  }>
  readonly sitemap?: string

  // ── Skills ───────────────────────────────────────────────────────────
  /** Manually declared MCP skills, merged with auto-derived from AgentMetadata.actions. */
  readonly skills?: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly description: string
    readonly inputSchema?: Record<string, unknown>
  }>

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
    | {
        readonly capabilities?: {
          readonly streaming?: boolean
          readonly pushNotifications?: boolean
        }
        readonly skills?: ReadonlyArray<{
          readonly id: string
          readonly name: string
          readonly description?: string
        }>
      }

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
  readonly sitemapPages?: ReadonlyArray<{
    readonly url: string
    readonly lastmod?: string
    readonly changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
    readonly priority?: number
  }>

  // ── JSON-LD structured data ───────────────────────────────────────────
  /**
   * JSON-LD objects injected into <head> via <script type="application/ld+json">.
   * If absent but `siteUrl` is set, a SoftwareApplication schema is auto-generated.
   * Set `false` to disable auto-generation.
   */
  readonly jsonLd?: ReadonlyArray<Record<string, unknown>> | false
}
