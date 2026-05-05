# Spec — Agent-Readiness + Server Layer (`@aihu/server` + `@aihu/agent-readiness`)

**Author:** Architect (Agent-Readiness track)
**Date:** 2026-04-30
**Branch:** `feat/agent-readiness-spec`
**Status:** Final — Builder may consume.

This spec is binding. Every ambiguity left here is a mismatch the Verifier will catch.

References:
- Locked v0 runtime: `packages/signals/src/index.ts`, `packages/arbor/src/index.ts`, `packages/runtime/src/index.ts`, `packages/agent/src/index.ts`
- Agent metadata shape: `.team/phase-5/spec-agent.md`
- Arbor stubs (MountScope.agent, serialize): `.team/phase-3/spec-arbor.md` §1.5
- isitagentready standard: https://isitagentready.com
- MCP Server Card SEP-2127: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127
- RFC 9728 (OAuth Protected Resource Metadata): https://datatracker.ietf.org/doc/html/rfc9728
- llms.txt specification: https://llmstxt.org
- Module sizing rule: `.team/learnings.md` Learning #13

---

## 1. Architecture Overview — Three-Layer Split

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER (client runtime) — ≤ 4 kB total, LOCKED           │
│                                                             │
│  @aihu/signals  @aihu/arbor  @aihu/runtime            │
│      1.53 kB          1.28 kB        438 B                  │
│                    @aihu/agent                            │
│                        72 B                                 │
│                                                             │
│  Dependency direction: signals ← arbor ← runtime           │
│                              agent (standalone)             │
└─────────────────────────────────────────────────────────────┘
           NO IMPORTS CROSS THIS LINE (hard boundary)
┌─────────────────────────────────────────────────────────────┐
│  SERVER LAYER — @aihu/server (new)                        │
│  Fetch-API only. Universal edge. No size constraint.        │
│                                                             │
│  router · middleware · api · ssr · data · config            │
│                                                             │
│  Imports: ZERO from @aihu/{signals,arbor,runtime}         │
│  MAY import: @aihu/agent (read-only AgentMetadata types)  │
└─────────────────────────────────────────────────────────────┘
           DEPENDS ON SERVER LAYER
┌─────────────────────────────────────────────────────────────┐
│  AGENT-READINESS LAYER — @aihu/agent-readiness (new)      │
│  Builds on @aihu/server primitives.                       │
│  Pure functions + fetch-API handlers. No global state.      │
│                                                             │
│  llms-txt · mcp-server-card · robots · content-negotiation  │
│  vite-plugin                                                │
└─────────────────────────────────────────────────────────────┘
```

**Dependency direction (strict, enforced by package.json `dependencies`):**

```
@aihu/agent-readiness
    → @aihu/server   (direct dependency)
    → @aihu/agent    (direct dependency — read types only)

@aihu/server
    → @aihu/agent    (direct dependency — read types only)

@aihu/signals, @aihu/arbor, @aihu/runtime
    — NEVER imported by server or agent-readiness layers
```

The boundary is enforced structurally: `@aihu/server` and `@aihu/agent-readiness` do not list `@aihu/signals`, `@aihu/arbor`, or `@aihu/runtime` in their `package.json` `dependencies`. Any accidental import fails `tsc --noEmit` with TS2307 at CI time.

`@aihu/agent` is allowed as a read-only dependency because it has zero imports of its own — it is a registry with no coupling to the client rendering primitives.

---

## 2. Package A: `@aihu/server`

### 2.0 File layout

```
packages/server/
  package.json               name: "@aihu/server"
                             deps: { "@aihu/agent": "workspace:*" }
                             peerDeps: none
  tsconfig.json              extends ../../tsconfig.base.json
                             lib: ["ES2022"]  — NO DOM
  moon.yml                   layer: library
  rolldown.config.ts         ESM + dts; external: ["@aihu/agent"]
  src/
    index.ts                 public re-exports, no logic
    types.ts                 RouteContext, Next, RouteHandler, Middleware, HttpMethod
    router.ts                defineRoute, createRouter, Route, RouteManifest, RouterOptions
    middleware.ts            defineMiddleware, composeMiddleware
    api.ts                   defineApiRoute, json, notFound, methodNotAllowed, badRequest, serverError
    ssr.ts                   renderToString, SsrOptions, HeadConfig, MetaTag, LinkTag
    data.ts                  defineLoader, LoaderResult, LoaderFn, DefinedLoader
    config.ts                defineAihuConfig, AihuConfig, ServerConfig, CorsConfig, RouteConfig
    agent-readiness-config.ts AgentReadinessConfig mirror (internal)
```

**Critical constraint on `tsconfig.json`:** `"lib"` must be `["ES2022"]` only — not `["ES2022", "DOM"]`. The server layer must not reference DOM types. `Request`, `Response`, and `URL` are available as fetch-API globals in all target runtimes without `lib: DOM`. `HTMLElement` and `document` are banned.

### 2.1 `src/types.ts`

```typescript
/**
 * Context passed to every route handler and middleware.
 */
export interface RouteContext {
  readonly params: Record<string, string>
  readonly url: URL
  /**
   * Platform-specific environment bindings.
   * - Cloudflare Workers: the generated `Env` interface
   * - Deno/Bun/Node: any bindings object the caller passes via RouterOptions
   * - When undefined: no platform bindings available
   * Typed as `unknown`; consumers narrow via their own type assertion.
   */
  readonly env?: unknown
}

/**
 * The `next()` function in middleware. Each middleware must either call
 * `next()` or return a Response — not both.
 */
export type Next = () => Promise<Response>

export type RouteHandler = (
  req: Request,
  ctx: RouteContext,
) => Response | Promise<Response>

export type Middleware = (
  req: Request,
  next: Next,
) => Response | Promise<Response>

export type HttpMethod =
  | 'GET' | 'POST' | 'PUT' | 'PATCH'
  | 'DELETE' | 'HEAD' | 'OPTIONS'
```

### 2.2 `src/router.ts`

```typescript
import type { RouteContext, RouteHandler, Middleware } from './types.ts'
import type { DefinedLoader, LoadedRouteContext } from './data.ts'

export interface Route {
  readonly pattern: string
  readonly handler: RouteHandler
  readonly middleware?: ReadonlyArray<Middleware>
}

export interface RouteOptions<T = never> {
  readonly loader?: DefinedLoader<T>
  readonly middleware?: ReadonlyArray<Middleware>
}

/**
 * Register a route.
 *
 * Pattern syntax:
 * - Static:    `/about`
 * - Dynamic:   `/posts/:slug`       params.slug
 * - Nested:    `/blog/:year/:month` params.year, params.month
 * - Catch-all: `/static/*`          params["*"]
 *
 * Without loader: handler receives `RouteContext`.
 * With loader: handler receives `LoadedRouteContext<T>`.
 */
export function defineRoute(
  pattern: string,
  handler: RouteHandler,
  options?: RouteOptions<never>,
): Route
export function defineRoute<T>(
  pattern: string,
  handler: (req: Request, ctx: LoadedRouteContext<T>) => Response | Promise<Response>,
  options: RouteOptions<T>,
): Route

/**
 * Shape of the route manifest produced by the file-based routing
 * Vite plugin at build time. The runtime router only consumes this
 * shape — no filesystem or Vite dependency in @aihu/server.
 */
export interface RouteManifest {
  readonly routes: ReadonlyArray<Route>
  /**
   * Layout nesting map: each key is a layout-route pattern; value
   * is the array of child-route patterns it wraps. Applied inside-out.
   */
  readonly layouts?: Readonly<Record<string, ReadonlyArray<string>>>
}

export interface RouterOptions {
  readonly middleware?: ReadonlyArray<Middleware>
  readonly notFound?: RouteHandler
  readonly env?: unknown
}

/**
 * Create a fetch-API compatible request handler.
 *
 * Route matching order:
 * 1. Static routes (exact match, most specific first)
 * 2. Dynamic routes (`:param` segments, more-static-segments wins ties)
 * 3. Catch-all routes (`*`)
 *
 * No match → calls `RouterOptions.notFound` or returns `404 Not Found`.
 *
 * @example
 * // Cloudflare Worker
 * export default { fetch: createRouter({ routes }, { env }) }
 * // Deno
 * Deno.serve(createRouter({ routes }))
 * // Bun
 * Bun.serve({ fetch: createRouter({ routes }) })
 */
export function createRouter(
  manifest: RouteManifest,
  options?: RouterOptions,
): (req: Request) => Promise<Response>
```

### 2.3 `src/middleware.ts`

```typescript
import type { Middleware } from './types.ts'

export function defineMiddleware(handler: Middleware): Middleware

/**
 * Compose middleware in array order (index 0 = outermost).
 *
 * Middleware application order in the full request pipeline:
 * 1. RouterOptions.middleware  (global)
 * 2. Route.middleware          (route-level)
 * 3. Route handler
 *
 * Auth middleware is a plain Middleware — apply globally or per-route.
 */
export function composeMiddleware(
  middlewares: ReadonlyArray<Middleware>,
): Middleware
```

### 2.4 `src/api.ts`

```typescript
import type { RouteContext, RouteHandler, HttpMethod } from './types.ts'
import type { Route } from './router.ts'

export type ApiHandler = RouteHandler

/**
 * The router enforces the method: a request to the matching pattern
 * with a non-matching method receives `405 Method Not Allowed` with
 * an `Allow` header listing all registered methods for that pattern.
 */
export function defineApiRoute(
  method: HttpMethod,
  pattern: string,
  handler: ApiHandler,
): Route

export function json(data: unknown, status?: number): Response
export function notFound(): Response
export function methodNotAllowed(allowed: ReadonlyArray<HttpMethod>): Response
export function badRequest(message?: string): Response

/**
 * SECURITY: In production (`__DEV__ === false`), the error message MUST NOT
 * appear in the response body. Return `{ "error": "internal server error" }`.
 * Only in development may the error message be exposed.
 */
export function serverError(err?: unknown): Response
```

### 2.5 `src/ssr.ts`

```typescript
/**
 * CRITICAL CONSTRAINTS:
 * 1. Zero imports from @aihu/arbor, @aihu/signals, @aihu/runtime.
 * 2. Zero DOM globals (no window, document, HTMLElement, customElements).
 * 3. Runs in: Workers, Deno, Bun, Node ESM.
 *
 * Connection to @aihu/arbor's MountScope.serialize() stub:
 * The `SsrOptions.serializer` field accepts an injected serialize function.
 * In v0 the stub always throws ArborNotImplementedError; the spec path is
 * wired for sub-project #6. This module never imports arbor.
 */

export interface MetaTag {
  readonly name?: string
  readonly property?: string
  readonly content: string
  readonly [attr: string]: string | undefined
}

export interface LinkTag {
  readonly rel: string
  readonly href: string
  readonly [attr: string]: string | undefined
}

export interface HeadConfig {
  readonly title?: string
  readonly meta?: ReadonlyArray<MetaTag>
  readonly links?: ReadonlyArray<LinkTag>
}

export interface SsrOptions {
  /**
   * When provided: output is a full HTML document.
   * When absent: output is the component's inner HTML fragment only.
   */
  readonly head?: HeadConfig

  /**
   * When true: rendered HTML includes hydration markers as data attributes:
   *   `data-aihu-path="{rootId}.{indexChain}.{bindingKind}"`
   * Matches the arbor §2.7 path-key format exactly.
   * Default: false.
   */
  readonly hydratable?: boolean

  /**
   * Injected serializer from an arbor MountScope.
   * When it throws (v0 stub), the error is swallowed and no state script is emitted.
   * Sub-project #6 replaces the stub with a real serializer.
   */
  readonly serializer?: () => Record<string, unknown>
}

/**
 * Accepts:
 * 1. `() => unknown` — factory returning an arbor Branch | Leaf.
 *    Typed as `unknown` to maintain the hard boundary. Renderer checks
 *    `kind` discriminants at runtime: `{ kind: 'branch' }` or `{ kind: 'leaf' }`.
 * 2. `{ toHtml(): string }` — direct HTML provider (escape hatch).
 */
export type ComponentDescription =
  | (() => unknown)
  | { toHtml(): string }

export function renderToString(
  component: ComponentDescription,
  opts?: SsrOptions,
): Promise<string>
```

### 2.6 `src/data.ts`

```typescript
import type { RouteContext } from './types.ts'

export interface LoaderResult<T> {
  readonly data: T
  readonly error?: Error
  readonly status: number
}

export type LoaderFn<T> = (ctx: RouteContext) => Promise<T>

export interface DefinedLoader<T> {
  readonly _brand: 'DefinedLoader'
  /** @internal */
  readonly fn: LoaderFn<T>
}

export interface LoadedRouteContext<T> extends RouteContext {
  readonly loaderData: LoaderResult<T>
}

/**
 * Loaders run before the route handler. All errors are caught and wrapped —
 * loaders never throw to the router. Multiple loaders run in parallel.
 *
 * @example
 * const userLoader = defineLoader(async (ctx) => fetchUser(ctx.params.id))
 * const userRoute = defineRoute('/users/:id', async (req, ctx) => {
 *   const { data, error } = ctx.loaderData
 *   if (error) return serverError(error)
 *   return json(data)
 * }, { loader: userLoader })
 */
export function defineLoader<T>(fn: LoaderFn<T>): DefinedLoader<T>
```

### 2.7 `src/config.ts`

```typescript
export type { AgentReadinessConfig } from './agent-readiness-config.ts'

export interface CorsConfig {
  readonly origin: string | ReadonlyArray<string> | '*'
  readonly methods?: ReadonlyArray<import('./types.ts').HttpMethod>
  readonly headers?: ReadonlyArray<string>
  readonly credentials?: boolean
  readonly maxAge?: number
}

export interface ServerConfig {
  readonly basePath?: string
  readonly cors?: CorsConfig
  /** Default: 1_048_576 (1 MB). */
  readonly maxBodySize?: number
}

export interface RouteConfig {
  /** Default: `./routes.gen.ts`. */
  readonly manifestPath?: string
}

export interface AihuConfig {
  readonly server?: ServerConfig
  readonly agent?: import('./agent-readiness-config.ts').AgentReadinessConfig
  readonly routes?: RouteConfig
}

/**
 * Define the aihu application configuration.
 *
 * IMPORTANT: BUILD-TIME ONLY. Not bundled into or available at edge
 * execution time. For runtime-dynamic configuration, call individual
 * generator functions directly in route handlers.
 *
 * @example
 * // aihu.config.ts
 * export default defineAihuConfig({
 *   server: { cors: { origin: '*' } },
 *   agent: { name: 'My App', version: '1.0.0', endpoint: 'https://myapp.workers.dev/mcp' },
 * })
 */
export function defineAihuConfig(config: AihuConfig): AihuConfig
```

**`src/agent-readiness-config.ts`** is a slim internal module containing `AgentReadinessConfig` mirrored from `@aihu/agent-readiness/src/types.ts`. Interface-only — no implementation. Both files carry the comment: `// Mirror of @aihu/agent-readiness/src/types.ts AgentReadinessConfig — keep in sync.`

### 2.8 `src/index.ts`

```typescript
export type { RouteContext, RouteHandler, Middleware, Next, HttpMethod } from './types.ts'
export type { Route, RouteManifest, RouterOptions, RouteOptions } from './router.ts'
export { defineRoute, createRouter } from './router.ts'
export { defineMiddleware, composeMiddleware } from './middleware.ts'
export type { ApiHandler } from './api.ts'
export { defineApiRoute, json, notFound, methodNotAllowed, badRequest, serverError } from './api.ts'
export type { MetaTag, LinkTag, HeadConfig, SsrOptions, ComponentDescription } from './ssr.ts'
export { renderToString } from './ssr.ts'
export type { LoaderResult, LoaderFn, DefinedLoader, LoadedRouteContext } from './data.ts'
export { defineLoader } from './data.ts'
export type { ServerConfig, CorsConfig, RouteConfig, AihuConfig } from './config.ts'
export { defineAihuConfig } from './config.ts'
export type { AgentReadinessConfig } from './agent-readiness-config.ts'
```

---

## 3. Package B: `@aihu/agent-readiness`

### 3.0 File layout

```
packages/agent-readiness/
  package.json               name: "@aihu/agent-readiness"
                             deps: {
                               "@aihu/server": "workspace:*",
                               "@aihu/agent": "workspace:*"
                             }
  tsconfig.json              extends ../../tsconfig.base.json, lib: ES2022
  moon.yml                   layer: library
  rolldown.config.ts         ESM + dts; external: ["@aihu/server","@aihu/agent","vite"]
  src/
    index.ts                 public re-exports + agentReadiness() Vite plugin export
    types.ts                 AgentReadinessConfig, McpAuthConfig
    llms-txt.ts              generateLlmsTxt, generateLlmsFullTxt, LlmsTxtConfig, etc.
    mcp-server-card.ts       generateMcpServerCard, McpServerCard, AgentSkill, etc.
    robots.ts                generateRobotsTxt, RobotsConfig, AI_BOT_LIST
    content-negotiation.ts   createContentNegotiationHandler, MarkdownResolver
    vite-plugin.ts           agentReadiness() Vite Plugin factory
```

### 3.1 `src/types.ts`

```typescript
import type { LlmsTxtSection, LlmsTxtLink } from './llms-txt.ts'
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
```

### 3.2 `src/llms-txt.ts`

```typescript
/**
 * llms.txt generator. Specification: https://llmstxt.org
 *
 * Required output structure:
 *   1. # {name}           (H1, mandatory)
 *   2. > {summary}        (blockquote, optional)
 *   3. ## {sectionTitle}  (H2, one per section)
 *      - [title](url)[: description]
 *   4. ## Optional        (H2, optional — always last if present)
 */

export interface LlmsTxtLink {
  readonly title: string
  readonly url: string
  readonly description?: string
}

export interface LlmsTxtSection {
  readonly title: string
  readonly links: ReadonlyArray<LlmsTxtLink>
}

export interface LlmsTxtConfig {
  readonly name: string
  readonly summary?: string
  readonly sections: ReadonlyArray<LlmsTxtSection>
  readonly optional?: ReadonlyArray<LlmsTxtLink>
}

/**
 * Generate a valid `/llms.txt` file as a string.
 *
 * Output order:
 * 1. `# {name}`
 * 2. `\n> {summary}` (when summary present)
 * 3. For each section with non-empty links:
 *    `\n## {title}\n- [title](url)[: desc]...`
 * 4. When optional is non-empty:
 *    `\n## Optional\n- [title](url)[: desc]...`
 *
 * Sections with empty links arrays are omitted.
 * Pure function. No I/O. Always returns a string.
 */
export function generateLlmsTxt(config: LlmsTxtConfig): string

/**
 * Generate `/llms-full.txt`. v0: same as generateLlmsTxt with Optional
 * section promoted to a regular section. Full content-inlining (fetching
 * linked pages) is out of scope for v0 — deferred to Vite plugin build pass.
 * Pure function. No I/O.
 */
export function generateLlmsFullTxt(config: LlmsTxtConfig): string

/**
 * Derive an LlmsTxtLink from an AgentMetadata entry.
 * Returns null when meta.describes is absent.
 * url constructed as `{baseUrl}/components#{meta.tag}`.
 * @internal
 */
export function agentMetadataToLlmsTxtLink(
  meta: import('@aihu/agent').AgentMetadata,
  baseUrl: string,
): LlmsTxtLink | null
```

**Auto-generation at request time:** The server route handler for `GET /llms.txt` builds `LlmsTxtConfig` by: (1) calling `getAllAgentMetadata()` if available (see OQ-3) to build a "Components" section; (2) appending `AgentReadinessConfig.llmsSections`; (3) setting `optional: AgentReadinessConfig.llmsOptional`; (4) calling `generateLlmsTxt(config)`.

### 3.3 `src/mcp-server-card.ts`

```typescript
/**
 * MCP Server Card generator.
 * Schema: SEP-1649/SEP-2127, protocolVersion 2025-06-18.
 * Discovery: GET /.well-known/mcp/server-card.json
 */

export interface AgentSkill {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly inputSchema?: Record<string, unknown>
}

/**
 * MCP Server Card output object. Valid JSON when serialized.
 */
export interface McpServerCard {
  readonly $schema: 'https://modelcontextprotocol.io/schemas/server-card/v1.0'
  readonly version: '1.0'
  readonly protocolVersion: string
  readonly serverInfo: {
    readonly name: string
    readonly version: string
    readonly description?: string
    readonly homepage?: string
  }
  readonly transport: {
    readonly type: 'streamable-http' | 'sse'
    readonly url: string
  }
  readonly capabilities: {
    readonly tools: boolean
    readonly resources: boolean
    readonly prompts: boolean
  }
  readonly tools?: ReadonlyArray<{
    readonly name: string
    readonly description: string
  }>
  readonly auth?: {
    readonly type: 'oauth2'
    /**
     * RFC 8414 Authorization Server Metadata URL.
     * Derived from McpAuthConfig.tokenUrl: strip path, append
     * `/.well-known/oauth-authorization-server`.
     */
    readonly authorizationServer: string
    /**
     * RFC 9728 Protected Resource Metadata URL.
     * Always `{endpoint}/.well-known/oauth-protected-resource`.
     */
    readonly resourceMetadata?: string
  }
}

export interface McpServerCardConfig {
  readonly name: string
  readonly version: string
  readonly endpoint: string
  readonly skills?: ReadonlyArray<AgentSkill>
  readonly auth?: import('./types.ts').McpAuthConfig
  readonly description?: string
  readonly homepage?: string
  /** Default: '2025-06-18'. */
  readonly protocolVersion?: string
  /** Default: 'streamable-http'. */
  readonly transportType?: 'streamable-http' | 'sse'
}

/**
 * Generate an MCP Server Card object.
 * Pure function. No I/O.
 *
 * `capabilities` is always `{ tools: true, resources: false, prompts: false }` in v0.
 *
 * SECURITY: auth output block must never contain client secrets, tokens, or
 * passwords. Only public URLs are emitted.
 */
export function generateMcpServerCard(config: McpServerCardConfig): McpServerCard

/**
 * Derive AgentSkill[] from AgentMetadata.actions.
 * id = "{meta.tag}.{actionName}", name = actionName, description = desc string.
 * @internal
 */
export function agentMetadataToSkills(
  meta: import('@aihu/agent').AgentMetadata,
): ReadonlyArray<AgentSkill>
```

### 3.4 `src/robots.ts`

```typescript
/**
 * robots.txt generator. RFC 9309 (Robots Exclusion Protocol) compliance.
 */

export interface RobotsRule {
  readonly userAgent: string | ReadonlyArray<string>
  readonly allow?: ReadonlyArray<string>
  readonly disallow?: ReadonlyArray<string>
  readonly crawlDelay?: number
}

export interface RobotsConfig {
  readonly sitemap?: string
  /**
   * - 'allow-all' (default): explicit Allow: / for each AI bot in AI_BOT_LIST
   *   plus a general User-agent: *\nAllow: /
   * - 'deny-all': User-agent: *\nDisallow: /
   * - RobotsRule[]: custom rules; AI_BOT_LIST auto-rules NOT added
   */
  readonly aiAgents?: 'allow-all' | 'deny-all' | ReadonlyArray<RobotsRule>
  readonly standard?: ReadonlyArray<RobotsRule>
}

/**
 * Named AI bots explicitly allowed when aiAgents: 'allow-all'.
 * v0 list (2026-04). Ordered by market presence (largest first).
 */
export const AI_BOT_LIST: ReadonlyArray<string>
// Members: 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Googlebot-Extended',
//          'CCBot', 'anthropic-ai', 'Google-Extended', 'Bytespider', 'cohere-ai'

/**
 * Generate a valid /robots.txt file as a string.
 *
 * Output structure (sections separated by one blank line):
 * 1. Standard bot rules (config.standard)
 * 2. AI bot rules
 * 3. Sitemap: {url} (when sitemap present)
 *
 * When aiAgents is absent, defaults to 'allow-all'.
 * Pure function. No I/O.
 */
export function generateRobotsTxt(config: RobotsConfig): string
```

### 3.5 `src/content-negotiation.ts`

```typescript
import type { Middleware } from '@aihu/server'

/**
 * Abstract interface for resolving markdown content from a URL path.
 *
 * Edge-safe: this module does NOT import fs, path, Deno.readFile,
 * Bun.file, or any filesystem API. The resolver is injected by the caller.
 *
 * SECURITY: Concrete resolver implementations MUST sanitize the `path`
 * argument before any filesystem access. Reject paths containing `..`,
 * null bytes, or other traversal patterns.
 */
export interface MarkdownResolver {
  /**
   * Return markdown content for the given URL path, or null when none exists.
   * Implementations must catch errors internally and return null rather than throw.
   */
  resolve(path: string): Promise<string | null>
}

export interface ContentNegotiationOptions {
  readonly resolver: MarkdownResolver
  /**
   * Token count estimator for the x-markdown-tokens response header.
   * Default: Math.ceil(content.length / 4).
   */
  readonly estimateTokens?: (content: string) => number
}

/**
 * Create a content-negotiation middleware.
 *
 * Behavior:
 * 1. If Accept does NOT include text/markdown → call next()
 * 2. If Accept includes text/markdown:
 *    a. Call resolver.resolve(url.pathname)
 *    b. null result → call next() (fall through)
 *    c. string result → return 200 with:
 *       - Content-Type: text/markdown; charset=utf-8
 *       - x-markdown-tokens: {count}  (integer string, estimate)
 *       - Body: the markdown content
 *
 * Does NOT modify responses from next().
 */
export function createContentNegotiationHandler(
  opts: ContentNegotiationOptions,
): Middleware
```

### 3.6 `src/vite-plugin.ts`

```typescript
import type { Plugin } from 'vite'
import type { AgentReadinessConfig } from './types.ts'

/**
 * The agentReadiness() Vite plugin.
 *
 * configureServer (dev):
 * - Serves /llms.txt, /llms-full.txt, /.well-known/mcp/server-card.json, /robots.txt
 * Hot-reload: re-generates all four when a .aihu module is invalidated.
 *
 * generateBundle (build):
 * - Writes all four files as static assets to dist/
 *
 * Route injection: does NOT inject into createRouter automatically.
 * Exports named handlers via createAgentReadinessRoutes() instead.
 *
 * @example
 * // vite.config.ts
 * import { agentReadiness } from '@aihu/agent-readiness'
 * export default defineConfig({
 *   plugins: [agentReadiness({ name: 'My App', endpoint: '...' })]
 * })
 */
export function agentReadiness(config: AgentReadinessConfig): Plugin

/**
 * Create fetch-API route handlers for all agent-readiness endpoints.
 *
 * @example
 * const ar = createAgentReadinessRoutes({ name: 'My App', endpoint: '...' })
 * const router = createRouter({
 *   routes: [
 *     defineRoute('/llms.txt', ar.llmsTxt),
 *     defineRoute('/llms-full.txt', ar.llmsFullTxt),
 *     defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard),
 *     defineRoute('/robots.txt', ar.robotsTxt),
 *     ...appRoutes,
 *   ],
 * })
 */
export function createAgentReadinessRoutes(
  config: AgentReadinessConfig,
): {
  readonly llmsTxt: import('@aihu/server').RouteHandler
  readonly llmsFullTxt: import('@aihu/server').RouteHandler
  readonly mcpServerCard: import('@aihu/server').RouteHandler
  readonly robotsTxt: import('@aihu/server').RouteHandler
}
```

### 3.7 `src/index.ts`

```typescript
export type { AgentReadinessConfig, McpAuthConfig } from './types.ts'
export type { LlmsTxtConfig, LlmsTxtSection, LlmsTxtLink } from './llms-txt.ts'
export { generateLlmsTxt, generateLlmsFullTxt } from './llms-txt.ts'
export type { AgentSkill, McpServerCardConfig, McpServerCard } from './mcp-server-card.ts'
export { generateMcpServerCard } from './mcp-server-card.ts'
export type { RobotsConfig, RobotsRule } from './robots.ts'
export { generateRobotsTxt, AI_BOT_LIST } from './robots.ts'
export type { MarkdownResolver, ContentNegotiationOptions } from './content-negotiation.ts'
export { createContentNegotiationHandler } from './content-negotiation.ts'
export { agentReadiness, createAgentReadinessRoutes } from './vite-plugin.ts'
```

---

## 4. Dependency Graph

```
@aihu/signals      ← no deps
    ↑
@aihu/arbor        ← depends on signals
    ↑
@aihu/runtime      ← peer deps: arbor, signals
    ↑
@aihu/agent        ← no deps

════════════ HARD BOUNDARY — ZERO IMPORTS CROSS DOWN ════════════

@aihu/server       ← depends on @aihu/agent (types only)
    ↑
@aihu/agent-readiness  ← depends on @aihu/server + @aihu/agent
```

**Enforcement:** `@aihu/server` and `@aihu/agent-readiness` do not list `@aihu/signals`, `@aihu/arbor`, or `@aihu/runtime` in `package.json` `dependencies`. Any accidental cross-boundary import fails `tsc --noEmit` with TS2307 at CI time.

---

## 5. Acceptance Criteria

All 8 criteria are runnable checks. Verifier runs them exactly as written.

**AC-1 — `generateLlmsTxt` produces valid llms.txt structure**

```typescript
// packages/agent-readiness/tests/llms-txt.test.ts
it('AC-1: generateLlmsTxt output is valid llms.txt', () => {
  const out = generateLlmsTxt({
    name: 'Test App',
    summary: 'A test application.',
    sections: [
      { title: 'Docs', links: [{ title: 'API', url: '/api', description: 'API docs' }] },
    ],
    optional: [{ title: 'Blog', url: '/blog' }],
  })
  const lines = out.split('\n')
  expect(lines.find(l => l.trim().length > 0)).toBe('# Test App')
  expect(out).toContain('> A test application.')
  expect(out).toContain('## Docs')
  expect(out).toContain('[API](/api): API docs')
  const h2Lines = lines.filter(l => l.startsWith('## '))
  expect(h2Lines[h2Lines.length - 1]).toBe('## Optional')
  expect(out).toContain('[Blog](/blog)')
})
```

**AC-2 — `generateMcpServerCard` output matches SEP-1649 schema**

```typescript
// packages/agent-readiness/tests/mcp-server-card.test.ts
it('AC-2: generateMcpServerCard produces valid MCP Server Card', () => {
  const card = generateMcpServerCard({
    name: 'Test MCP', version: '1.0.0',
    endpoint: 'https://test.example.com/mcp',
    skills: [{ id: 'greet', name: 'Greet', description: 'Says hello.' }],
  })
  expect(card.$schema).toBe('https://modelcontextprotocol.io/schemas/server-card/v1.0')
  expect(card.version).toBe('1.0')
  expect(card.serverInfo.name).toBe('Test MCP')
  expect(['streamable-http', 'sse']).toContain(card.transport.type)
  expect(card.transport.url).toBe('https://test.example.com/mcp')
  expect(card.tools![0].name).toBe('Greet')
  expect(card.auth).toBeUndefined()
  expect(() => JSON.stringify(card)).not.toThrow()
  // Auth block when configured
  const cardWithAuth = generateMcpServerCard({
    name: 'Protected', version: '1.0.0', endpoint: 'https://secure.example.com/mcp',
    auth: { type: 'oauth2', authorizationUrl: 'https://auth.example.com/authorize',
            tokenUrl: 'https://auth.example.com/token', scopes: ['mcp:read'] },
  })
  expect(cardWithAuth.auth?.type).toBe('oauth2')
  // SECURITY: no credentials in auth output
  const authStr = JSON.stringify(cardWithAuth.auth)
  expect(authStr).not.toContain('clientSecret')
  expect(authStr).not.toContain('password')
})
```

**AC-3 — Content negotiation returns markdown when `Accept: text/markdown`**

```typescript
it('AC-3: returns text/markdown when Accept includes text/markdown', async () => {
  const resolver: MarkdownResolver = {
    async resolve(path) { return path === '/about' ? '# About\nThis is about.' : null },
  }
  const mw = createContentNegotiationHandler({ resolver })
  const req = new Request('https://example.com/about', {
    headers: { Accept: 'text/html, text/markdown' },
  })
  let nextCalled = false
  const res = await mw(req, async () => { nextCalled = true; return new Response('HTML') })
  expect(res.status).toBe(200)
  expect(res.headers.get('Content-Type')).toMatch(/text\/markdown/)
  expect(Number(res.headers.get('x-markdown-tokens'))).toBeGreaterThan(0)
  expect(await res.text()).toContain('# About')
  expect(nextCalled).toBe(false)
})
```

**AC-4 — Content negotiation falls through when no markdown match**

```typescript
it('AC-4: falls through when resolver returns null', async () => {
  const resolver: MarkdownResolver = { async resolve(_path) { return null } }
  const mw = createContentNegotiationHandler({ resolver })
  const req = new Request('https://example.com/missing', {
    headers: { Accept: 'text/markdown' },
  })
  let nextCalled = false
  const res = await mw(req, async () => { nextCalled = true; return new Response('Fallback') })
  expect(nextCalled).toBe(true)
  expect(await res.text()).toBe('Fallback')
})
```

**AC-5 — `generateRobotsTxt` with `aiAgents: 'allow-all'` includes named AI bots**

```typescript
it('AC-5: generateRobotsTxt allow-all includes all AI_BOT_LIST bots', () => {
  const out = generateRobotsTxt({ aiAgents: 'allow-all' })
  expect(out).toContain('User-agent: *')
  expect(out).toContain('Allow: /')
  for (const bot of AI_BOT_LIST) {
    expect(out).toContain(`User-agent: ${bot}`)
    const idx = out.indexOf(`User-agent: ${bot}`)
    expect(out.slice(idx, idx + 60)).toMatch(/Allow: \//)
  }
  const denied = generateRobotsTxt({ aiAgents: 'deny-all' })
  expect(denied).toContain('Disallow: /')
})
```

**AC-6 — All exports are edge-safe (no forbidden Node-only globals in compiled bundles)**

```bash
# CI check after build — run from repo root
#!/usr/bin/env bash
set -e
FORBIDDEN="process\. require( ' fs\.' path\.join http\.createServer"
FAIL=0
for f in packages/server/dist/index.js packages/agent-readiness/dist/index.js; do
  for g in $FORBIDDEN; do
    if grep -qF "$g" "$f" 2>/dev/null; then
      echo "FAIL: $f contains forbidden token: $g"
      FAIL=1
    fi
  done
done
[ $FAIL -eq 0 ] && echo "AC-6 PASS: no forbidden globals" || exit 1
```

**AC-7 — Hard boundary: zero client runtime imports in source**

```bash
# CI check before build — run from repo root
#!/usr/bin/env bash
set -e
FAIL=0
for dir in packages/server/src packages/agent-readiness/src; do
  for pkg in "@aihu/signals" "@aihu/arbor" "@aihu/runtime"; do
    if grep -rqF "$pkg" "$dir" 2>/dev/null; then
      echo "FAIL: $dir imports $pkg"
      FAIL=1
    fi
  done
done
[ $FAIL -eq 0 ] && echo "AC-7 PASS: hard boundary intact" || exit 1
```

**AC-8 — `MountScope.agent: AgentContext` is untouched**

```typescript
// tests/integration/agent-context-unchanged.test.ts
import { mount, leaf } from '@aihu/arbor'

it('AC-8: MountScope.agent shape unchanged by agent-readiness', () => {
  const host = document.createElement('div')
  const scope = mount(leaf('test'), host)
  expect(scope.agent._brand).toBe('AgentContext')
  expect(Object.isFrozen(scope.agent)).toBe(true)
  expect(Object.keys(scope.agent)).toEqual(['_brand'])
  scope.dispose()
})
```

---

## 6. Alternatives Considered

### 6.1 Fetch-API vs. Node `http.IncomingMessage`
**Chosen:** Fetch-API. Universal (Workers, Deno, Bun, Node v22+). Zero-cost globals. Edge-aligned.
**Alternative:** Express-style `(req, res)`. Rejected: Node-only; not on the thesis path.

### 6.2 Separate packages vs. monolithic `@aihu/server`
**Chosen:** Two packages. Apps without agent-readiness don't bundle it. Dependency direction is explicit.
**Alternative:** Single package. Rejected: implicit coupling; harder tree-shaking.

### 6.3 Pure functions vs. class builders for generators
**Chosen:** Pure functions. Two-line tests. Natural composition. Consistent with `branch()`, `leaf()`, `mount()`.
**Alternative:** Builder pattern. Rejected: verbose; config objects serve the same purpose.

### 6.4 Default auth: public vs. always-auth vs. opt-in OAuth
**Chosen:** No-auth default; OAuth 2.0 (RFC 9728) opt-in. User decision 2026-04-30.
**Alternative:** Always require OAuth. Rejected: kills zero-config discoverability.

### 6.5 MarkdownResolver injection vs. built-in `fs` adapter
**Chosen:** Injected interface. Edge-safe. Trivially testable.
**Alternative:** Built-in `fs.promises` with platform detection. Rejected: Workers have no `fs`.

### 6.6 `renderToString` arbor integration via injection vs. direct import
**Chosen:** Injected `serializer`; `ComponentDescription` typed as `unknown` factory.
**Alternative:** Direct arbor import. Rejected: breaks hard boundary.

---

## 7. Open Questions

**OQ-1 (HIGH) — State script placement in `renderToString`**
This spec specifies "before `</body>`". Sub-project #6 must confirm or override before implementing client-side hydration deserialization.

**OQ-2 (HIGH) — File-based routing Vite plugin scope**
`RouteManifest` shape is the stable contract. The Vite plugin that produces it belongs in a separate `@aihu/vite-plugin-router` package. Out of scope here.

**OQ-3 (MEDIUM) — `getAllAgentMetadata()` missing from `@aihu/agent` v0**
Server-side llms.txt auto-generation needs to enumerate all registered components. `@aihu/agent` v0 only exports `getAgentMetadata(tag)`. A minor version bump adding `getAllAgentMetadata(): AgentMetadata[]` unblocks the auto-generation path. The Vite plugin can work at build time; the server route handler skips auto-generation until this is added.

**OQ-4 (MEDIUM) — MCP transport default: `streamable-http` vs `sse`**
Defaults to `streamable-http` (MCP 2025-06-18 primary). If a target runtime compatibility issue is found during build, document in build manifest and surface.

**OQ-5 (LOW) — `x-markdown-tokens` header standardization**
Informal aihu extension as of 2026-04. Rename when/if an IETF/W3C standard lands.

**OQ-6 (LOW) — `defineAihuConfig` runtime availability**
Config is build-time only. For runtime-dynamic endpoint URLs, call `generateMcpServerCard` inside the route handler. Document in README.

**OQ-7 (LOW) — `AgentReadinessConfig` type mirroring strategy**
Mirrored in `@aihu/server/src/agent-readiness-config.ts`. Both files carry sync comment. Alternative (having server depend on agent-readiness for the type) reverses dependency direction — rejected.

---

## 8. Implementation Sequence

**Phase 0 — No dependencies (fully parallel):**
- [ ] `@aihu/server` package scaffold (package.json, tsconfig, moon.yml, rolldown.config.ts)
- [ ] `@aihu/server/src/types.ts`
- [ ] `@aihu/agent-readiness` package scaffold
- [ ] `@aihu/agent-readiness/src/llms-txt.ts` + tests
- [ ] `@aihu/agent-readiness/src/robots.ts` + tests

**Phase 1 — Depends on Phase 0:**
- [ ] `@aihu/server/src/router.ts` + tests
- [ ] `@aihu/server/src/middleware.ts` + tests
- [ ] `@aihu/server/src/api.ts` + tests
- [ ] `@aihu/server/src/ssr.ts` + tests
- [ ] `@aihu/server/src/data.ts` + tests
- [ ] `@aihu/agent-readiness/src/types.ts`
- [ ] `@aihu/agent-readiness/src/mcp-server-card.ts` + tests
- [ ] `@aihu/agent-readiness/src/content-negotiation.ts` + tests

**Phase 2 — Depends on Phase 1:**
- [ ] `@aihu/server/src/config.ts` + `agent-readiness-config.ts`
- [ ] `@aihu/server/src/index.ts` (barrel)
- [ ] `@aihu/agent-readiness/src/index.ts` (barrel)

**Phase 3 — Depends on Phase 2 (integration + Vite):**
- [ ] `@aihu/agent-readiness/src/vite-plugin.ts`
- [ ] Integration tests: `createRouter` + `createContentNegotiationHandler`
- [ ] AC-6 and AC-7 bundle inspection scripts

---

## 9. Module Sizing (Learning #13 Compliance)

All modules obey the ≤ 150 source line cap per Learning #13.

| Module | Estimated lines |
|---|---|
| `server/router.ts` | ~100 |
| `server/middleware.ts` | ~40 |
| `server/api.ts` | ~80 |
| `server/ssr.ts` | ~90 |
| `server/data.ts` | ~60 |
| `server/config.ts` | ~70 |
| `agent-readiness/llms-txt.ts` | ~80 |
| `agent-readiness/mcp-server-card.ts` | ~90 |
| `agent-readiness/robots.ts` | ~70 |
| `agent-readiness/content-negotiation.ts` | ~60 |
| `agent-readiness/vite-plugin.ts` | ~80 |

`index.ts` files: re-exports only, zero logic. `@internal` marks `agentMetadataToLlmsTxtLink` and `agentMetadataToSkills` — exported for tests, not stable API.

---

## 10. Security Requirements (Builder must not miss)

**S-1 — `serverError` never leaks stack traces in production.**
Detect production via build-time `__DEV__` constant (preferred over `process.env` for edge runtimes). In production: `{ "error": "internal server error" }` with status 500 only.

**S-2 — MCP card `auth` block never contains credentials.**
Output: public URLs only (`authorizationServer`, `resourceMetadata`). Never `clientSecret`, `token`, `password`. Enforced by AC-2.

**S-3 — `generateRobotsTxt` `'deny-all'` uses wildcard, not per-bot list.**
`User-agent: *\nDisallow: /`. A per-bot list would pass through unlisted bots.

**S-4 — `MarkdownResolver` callers must sanitize paths.**
Documented in JSDoc. Implementations must reject `..`, null bytes, and path traversal before filesystem access. The Vite plugin's built-in resolver must include this sanitization.

---

*Sources: [isitagentready.com](https://isitagentready.com/), [MCP SEP-2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127), [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728), [llmstxt.org](https://llmstxt.org), [Cloudflare agent-readiness](https://blog.cloudflare.com/agent-readiness/)*
