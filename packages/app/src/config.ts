import type { Plugin, UserConfig } from 'vite'
import type { AihuAdapter } from './adapter.ts'

/**
 * Build output mode.
 *
 * - `'spa'` (default): a single empty-shell `index.html` that boots the client
 *   SPA. No per-route HTML, no prerendered content.
 * - `'static'` (SSG): prerenders every static route to a content-ful
 *   `<pattern>/index.html` with a per-page `<head>`, then hydrates into the SPA
 *   on load (progressive enhancement). Ideal for content sites on static hosts
 *   (e.g. Cloudflare Pages) — crawlers and non-JS agents see real content.
 *
 * Other rendering modes (`ssr`, `hybrid`) are tracked separately under
 * @aihu/server's RenderingMode and are not part of the app build OutputMode.
 */
export type OutputMode = 'spa' | 'static'

/** Site-level configuration. */
export interface SiteConfig {
  /**
   * Absolute base URL of the deployed site (e.g. `https://example.com`).
   * Used by the `'static'` (SSG) output mode to resolve relative per-route
   * `canonical` / `og:*` / `twitter:*` URLs into absolute URLs (passed as
   * `siteUrl` to @aihu/server's `routeHeadToSsrHead`). When absent, relative
   * URLs are emitted unchanged.
   */
  readonly url?: string
}

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
export type AgentReadinessConfig = import('@aihu-plugin/agent-readiness').AgentReadinessConfig

/** Router-related app config (arch-5 M1, RFC-A5-012). */
export interface RouterConfig {
  /**
   * When `true`, `<$link>` navigation wraps in `document.startViewTransition()`
   * if the browser supports the View Transitions API. No-op in unsupported
   * browsers (graceful degradation). Default: `false`.
   *
   * SSR safety: the wrapping is browser-only — server-rendered HTML is
   * unchanged, and hydration is unaffected.
   */
  readonly viewTransitions?: boolean
}

export interface AihuConfig {
  /** Directory layout overrides. */
  readonly dir?: DirConfig
  /**
   * Output mode. Supports `'spa'` (default) and `'static'` (SSG prerender).
   * defineConfig throws AihuConfigError for any other value.
   */
  readonly output?: OutputMode
  /**
   * Site-level configuration. `site.url` is the absolute base URL used by the
   * `'static'` output mode to resolve relative canonical/OG/Twitter URLs.
   */
  readonly site?: SiteConfig
  /**
   * Aihu plugins. Order is preserved.
   * Appended after the three framework plugins (compiler, router, agent-readiness).
   */
  readonly plugins?: ReadonlyArray<AihuPlugin>
  /** Runtime configuration split — public values are inlined in the client bundle. */
  readonly runtimeConfig?: RuntimeConfig
  /**
   * App-level values made available to all components as bare identifiers.
   * Declared here for documentation and future build-time validation; the
   * values are hoisted into globalThis by createApp() at runtime.
   *
   * @example
   * export default defineConfig({ provide: { supabase, checkAuth } })
   */
  readonly provide?: Record<string, unknown>
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
  /**
   * Router-related app config (arch-5 M1).
   * Currently exposes the `viewTransitions` opt-in for `<$link>`.
   */
  readonly router?: RouterConfig
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
  if (config.output && config.output !== 'spa' && config.output !== 'static') {
    throw new AihuConfigError(
      `output mode '${config.output}' is not supported (use 'spa' or 'static')`,
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
