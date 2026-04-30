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

export interface ScribeConfig {
  readonly server?: ServerConfig
  readonly agent?: import('./agent-readiness-config.ts').AgentReadinessConfig
  readonly routes?: RouteConfig
}

/**
 * Define the scribe application configuration.
 *
 * IMPORTANT: BUILD-TIME ONLY. Not bundled into or available at edge
 * execution time. For runtime-dynamic configuration, call individual
 * generator functions directly in route handlers.
 *
 * @example
 * // scribe.config.ts
 * export default defineScribeConfig({
 *   server: { cors: { origin: '*' } },
 *   agent: { name: 'My App', version: '1.0.0', endpoint: 'https://myapp.workers.dev/mcp' },
 * })
 */
export function defineScribeConfig(config: ScribeConfig): ScribeConfig {
  return config
}
