// Mirror of @aihu-plugin/agent-readiness/src/types.ts AgentReadinessConfig — keep in sync.

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
}
