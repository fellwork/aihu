export type { AgentReadinessConfig } from './agent-readiness-config.ts'

// Type-only import so @aihu/server picks up no runtime dependency on
// @aihu/plugin (which is build/dev-time only). The `plugins` field below
// admits `Plugin[]` purely for type checking; v0.2.1 ships no dispatcher —
// the compiler wires registration in v0.3+.
import type { Plugin } from '@aihu/plugin'

// ---------------------------------------------------------------------------
// v0.6.5: Build target configuration
// ---------------------------------------------------------------------------

/**
 * Build target for the aihu application.
 * - 'client'    — browser-only bundle (no SSR)
 * - 'server'    — server-only bundle (SSR, no client hydration)
 * - 'universal' — both client and server bundles (default)
 */
export type BuildTarget = 'client' | 'server' | 'universal'

export interface BuildConfig {
  /** Build target. Default: 'universal' */
  target?: BuildTarget
}

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
  /**
   * Plugins registered in this aihu project.
   *
   * Per Plugin Contract Spec §7.1-§7.2: plugins MUST be explicitly imported
   * and registered here. Auto-discovery is forbidden.
   *
   * v0.2.1: type contract + registration plumbing only. The compiler
   * dispatcher is a no-op until v0.3+ wires block parsers, macro lowerings,
   * and hook execution. Admitting the field now lets plugin authors begin
   * shaping `definePlugin({...})` calls against a stable type surface.
   */
  readonly plugins?: ReadonlyArray<Plugin>
  /**
   * v0.6.5: Build target configuration.
   * Controls whether aihu emits a client bundle, server bundle, or both.
   * This field is read by the compiler/build tooling; it has no runtime effect.
   */
  readonly build?: BuildConfig
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
export function defineAihuConfig(config: AihuConfig): AihuConfig {
  return config
}
