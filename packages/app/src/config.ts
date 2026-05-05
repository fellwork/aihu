import type { Plugin, UserConfig } from 'vite'
import type { AihuAdapter } from './adapter.ts'

/** V0: SPA output only. More modes (ssr, static, hybrid) in V1+. */
export type OutputMode = 'spa'

export interface DirConfig {
  /** Directory to scan for page routes. Default: 'pages' */
  readonly pages?: string
  /** Directory to scan for layout files. Default: 'src/layouts' */
  readonly layouts?: string
  /** Public static assets directory. Default: 'public' */
  readonly public?: string
}

/** Runtime configuration split. Public values are safe to expose to the client. */
export interface RuntimeConfig {
  readonly public?: Record<string, unknown>
  /** V0: accepted but ignored at runtime (server-side enforcement deferred to V1). */
  readonly private?: Record<string, unknown>
}

export interface HeadConfig {
  readonly title?: string
  /** Default: 'UTF-8' */
  readonly charset?: string
  /** Default: 'width=device-width, initial-scale=1' */
  readonly viewport?: string
  readonly meta?: ReadonlyArray<Record<string, string>>
}

export interface AppHeadConfig {
  readonly head?: HeadConfig
}

/** Vite config fields that can be safely merged (excludes plugins — use AihuConfig.plugins). */
export type VitePassthrough = Omit<UserConfig, 'plugins'>

/** A Aihu plugin is structurally identical to a Vite plugin (V0). */
export type AihuPlugin = Plugin

/** Type-only import — not bundled when agentReadiness is absent. */
export type AgentReadinessConfig = import('@aihu/agent-readiness').AgentReadinessConfig

export interface AihuConfig {
  /** Directory layout overrides. */
  readonly dir?: DirConfig
  /**
   * Output mode. V0 supports 'spa' only.
   * defineConfig throws AihuConfigError for any other value.
   */
  readonly output?: OutputMode
  /**
   * Aihu plugins. Order is preserved.
   * Appended after the three framework plugins (compiler, router, agent-readiness).
   */
  readonly plugins?: ReadonlyArray<AihuPlugin>
  /** Runtime configuration split — public values are inlined in the client bundle. */
  readonly runtimeConfig?: RuntimeConfig
  /** HTML <head> metadata. */
  readonly app?: AppHeadConfig
  /** Passthrough to Vite's UserConfig. Merged via Vite's config() hook. */
  readonly vite?: VitePassthrough
  /**
   * Opt-in agent-readiness integration.
   * Requires { name: string } at minimum.
   * When absent or false, a no-op plugin is substituted.
   */
  readonly agentReadiness?: AgentReadinessConfig | false
  /**
   * Deployment adapter. Transforms the Vite build output into the target
   * platform's required format. Called after vite build completes.
   * When absent, no post-build transformation is applied (manual deployment).
   */
  readonly adapter?: AihuAdapter
}

/** Thrown by defineConfig when configuration validation fails. */
export class AihuConfigError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_OUTPUT_MODE' | 'INVALID_DIR' | 'UNKNOWN_FIELD',
    readonly field?: string,
  ) {
    super(message)
    this.name = 'AihuConfigError'
  }
}

/**
 * Define the aihu application configuration.
 *
 * Validates the config at call time and throws AihuConfigError for invalid values.
 * Returns the config unchanged (typed identity function).
 *
 * @example
 * // aihu.config.ts
 * import { defineConfig } from '@aihu/app'
 * export default defineConfig({
 *   app: { head: { title: 'My App' } },
 * })
 */
export function defineConfig(config: AihuConfig): AihuConfig {
  if (config.output && config.output !== 'spa') {
    throw new AihuConfigError(
      `output mode '${config.output}' is not supported in V0 (only 'spa')`,
      'INVALID_OUTPUT_MODE',
      'output',
    )
  }
  if (config.dir?.pages !== undefined && typeof config.dir.pages !== 'string') {
    throw new AihuConfigError('dir.pages must be a string', 'INVALID_DIR', 'dir.pages')
  }
  if (config.dir?.layouts !== undefined && typeof config.dir.layouts !== 'string') {
    throw new AihuConfigError('dir.layouts must be a string', 'INVALID_DIR', 'dir.layouts')
  }
  return config
}
