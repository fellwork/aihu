import type { Plugin, UserConfig } from 'vite'
import type { AihuAdapter } from './adapter.ts'
import * as v from './config-validate.ts'

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
  /**
   * Directory to scan for components. Default: 'src/components'
   *
   * `@aihu/router`'s `componentsDir` has always existed but was unreachable
   * from here: `viteAihuPlugin` forwarded only `pagesDir` and `layoutsDir`, so
   * changing it meant calling `viteRouterIntegration()` yourself — i.e.
   * abandoning `viteAihuPlugin` entirely.
   */
  readonly components?: string
}

/**
 * Compiler options forwarded to `aihuCompilerPlugin`.
 *
 * These were previously reachable only by dropping `viteAihuPlugin` and wiring
 * `aihuCompilerPlugin()` by hand — `islands` in particular was hardcoded to
 * `false` with a comment instructing the reader to "opt back in via the
 * compiler plugin directly." A framework documenting a workaround is a missing
 * option.
 */
export interface CompilerConfig {
  /**
   * Build target for compiled SFC output.
   *
   * `'client'` elides server-only artifacts (the `@agent` binding, the agent
   * manifest). NOTE this is what makes a static build's `llms.txt` list no
   * tools — the compiler strips `registerAgentMetadata()` from client output.
   */
  readonly target?: 'client' | 'server' | 'universal'
  /**
   * Emit island boundaries for partial hydration. Default: `false`.
   */
  readonly islands?: boolean
}

/** Options for `aihu dev`. Consumed by the CLI, not by Vite. */
export interface DevConfig {
  readonly port?: number
  readonly host?: string
  readonly open?: boolean
}

/** Build options read by `aihu build` and `aihu dev`. */
export interface BuildConfig {
  /**
   * Bundler used by `aihu dev` / `aihu build`.
   *
   * Declared here because both commands ALREADY read it — each hand-rolls a
   * local structural interface to do so — while no config type declared it.
   * `aihu build --help` documented a key the schema said did not exist.
   */
  readonly bundler?: 'vite' | 'rolldown'
}

/** Options for `aihu-tsc` / `aihu check`. Consumed by the CLI, not by Vite. */
export interface TypecheckConfig {
  /** Fail on template expressions that do not typecheck. */
  readonly strictTemplates?: boolean
  /** tsconfig path. Default: 'tsconfig.json' */
  readonly project?: string
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

/**
 * CSS / styling options forwarded to the compiler's Vite plugin.
 *
 * Today this surfaces the rendering mode the compiler injects into every
 * `defineElement(...)` call — a BINARY choice (DA4 #437): `'shadow'`
 * (shadow-encapsulated component styles; internally an OPEN root, the only
 * browser mode aihu's composition/hydration can use) or `'light'` (no shadow
 * root). Unset, pages/layouts default to `'light'` and leaves to `'shadow'`.
 * `@aihu/css-engine` is scoped by design and works in either mode — its
 * utilities fold into each component's shadow style. Global-cascade
 * frameworks (Tailwind, UnoCSS, Pico) — or styling light-DOM / external
 * (slotted) children — need `'light'`.
 *
 * When set, `viteAihuPlugin` forwards this to its internal
 * `aihuCompilerPlugin({ shadowMode })` call. When absent, behaviour is
 * unchanged (compiler default applies).
 */
export interface CssConfig {
  /**
   * Project-wide rendering mode for every `.aihu` SFC compiled by
   * `viteAihuPlugin`.
   *
   * - `'shadow'` — shadow DOM (an OPEN root internally; `this.shadowRoot`
   *               non-null).
   * - `'light'`  — **no shadow root** (`this.shadowRoot === null`). Use for
   *               global-cascade CSS frameworks, or when you explicitly want
   *               light-DOM / global CSS (e.g. to style external / slotted
   *               child elements). NOT required for `@aihu/css-engine`,
   *               which is scoped and works in either mode.
   */
  readonly shadowMode?: 'light' | 'shadow'
}

/** Router-related app config (arch-5 M1, RFC-A5-012). */
export interface RouterConfig {
  /**
   * When `true`, `<a>` navigation wraps in `document.startViewTransition()`
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
   *
   * WARNING: `router.viewTransitions` is declared but NOT wired — nothing
   * forwards it from here to the router runtime, so setting it has no effect.
   * `defineConfig` warns when you do. The working lever is the
   * `<router viewTransitions>` prop. Tracked for wiring or removal.
   */
  readonly router?: RouterConfig
  /** Compiler options forwarded to `aihuCompilerPlugin`. */
  readonly compiler?: CompilerConfig
  /** `aihu dev` options. Read by the CLI, not by Vite. */
  readonly dev?: DevConfig
  /** `aihu build` / `aihu dev` build options. Read by the CLI, not by Vite. */
  readonly build?: BuildConfig
  /** `aihu-tsc` options. Read by the CLI, not by Vite. */
  readonly typecheck?: TypecheckConfig
  /**
   * CSS / styling integration. Currently surfaces the project-wide
   * `shadowMode` forwarded to the compiler. Set to `{ shadowMode: 'light' }`
   * when using a cascade-dependent CSS framework (Tailwind, UnoCSS, Pico).
   */
  readonly css?: CssConfig
}

// `AihuConfigError` lives in its own module so the validation combinators can
// throw it without importing this file back. Re-exported here for compat.
export { AihuConfigError } from './config-error.ts'

/**
 * The config schema — the single source of truth for which keys aihu owns.
 *
 * `Object.keys(SCHEMA)` is therefore the authoritative key list; nothing can
 * drift from it. SvelteKit derives its `kit`-vs-`vite-plugin-svelte` key split
 * from exactly this, which is what will let us accept inline config on
 * `viteAihuPlugin()` later without a hand-maintained list.
 */
const SCHEMA: Record<string, v.Validator> = {
  dir: v.object({
    pages: v.string,
    layouts: v.string,
    public: v.string,
    components: v.string,
  }),
  output: v.list(['spa', 'static'], 'INVALID_OUTPUT_MODE'),
  site: v.object({ url: v.string }),
  plugins: v.array,
  runtimeConfig: v.object({ public: v.passthrough, private: v.passthrough }),
  provide: v.passthrough,
  app: v.object({
    head: v.object({
      title: v.string,
      charset: v.string,
      viewport: v.string,
      meta: v.array,
    }),
  }),
  vite: v.passthrough,
  // `false` is a whole-block disable; otherwise the plugin owns the shape, so
  // we do not re-declare its ~20 fields here and risk drifting from them.
  agentReadiness: v.orFalse(v.passthrough),
  adapter: v.anything,
  router: v.object({
    // Declared, documented, and read by NOTHING: `viteAihuPlugin` forwards
    // only pagesDir/layoutsDir/compileRouteMeta to the router. Warn rather
    // than silently accept — a config file advertised as THE customization
    // surface must not contain fields that quietly do nothing.
    viewTransitions: v.notYetImplemented(v.boolean, 'use the <router viewTransitions> prop'),
  }),
  compiler: v.object({
    target: v.list(['client', 'server', 'universal'], 'INVALID_COMPILER_TARGET'),
    islands: v.boolean,
  }),
  dev: v.object({ port: v.number, host: v.string, open: v.boolean }),
  build: v.object({ bundler: v.list(['vite', 'rolldown'], 'INVALID_BUNDLER') }),
  typecheck: v.object({ strictTemplates: v.boolean, project: v.string }),
  css: v.object({
    shadowMode: v.list(['light', 'shadow'], 'INVALID_CSS_SHADOW_MODE'),
  }),
  ui: v.object({
    registry: v.string,
    target: v.string,
    // Resolved into ResolvedUiConfig and then read by nothing. `aihu add
    // --style` documents it as "recorded; the engine reads it at build" — the
    // engine does not.
    style: v.notYetImplemented(v.string, 'no consumer reads ui.style yet'),
    prefix: v.string,
    registries: v.passthrough,
  }),
}

/** Keys aihu owns, derived from the schema rather than hand-listed. */
export const AIHU_CONFIG_KEYS: ReadonlyArray<string> = Object.freeze(Object.keys(SCHEMA))

/**
 * Map an unknown top-level key to a hint.
 *
 * Targets the mistakes people actually make rather than listing every legal
 * key. The `@aihu/server` entries matter most: there are two config dialects
 * with the same file name and the same interface name, and until they are
 * consolidated, a user who writes `rendering: {}` or `agent: {}` into an
 * `@aihu/app` config gets silence.
 */
function suggestTopLevel(key: string): string | undefined {
  const hints: Record<string, string> = {
    // @aihu/server's AihuConfig fields, which do NOT apply here.
    rendering: 'output',
    agent: 'agentReadiness',
    server: 'vite.server',
    // Common near-misses.
    integrations: 'plugins',
    pages: 'dir.pages',
    layouts: 'dir.layouts',
    components: 'dir.components',
    head: 'app.head',
    shadowMode: 'css.shadowMode',
    bundler: 'build.bundler',
    strictTemplates: 'typecheck.strictTemplates',
    base: 'vite.base',
    alias: 'vite.resolve.alias',
  }
  return hints[key]
}

const validateConfig = v.object(SCHEMA, suggestTopLevel)

/**
 * Define the aihu application configuration.
 *
 * Validates at call time and throws `AihuConfigError` on an invalid value OR
 * an unknown key. Returns the config unchanged (typed identity function).
 *
 * Unknown keys THROW rather than warn. Next.js validates with a zod schema but
 * only warns, and it cost them visibly — people learn to ignore a banner. This
 * file is now scaffolded into every project and advertised as the place to
 * customize things, so a silently-dropped key would read as a broken feature.
 *
 * @example
 * // aihu.config.ts
 * import { defineConfig } from '@aihu/app'
 * export default defineConfig({
 *   app: { head: { title: 'My App' } },
 * })
 */
export function defineConfig(config: AihuConfig): AihuConfig {
  validateConfig(config, 'config')
  return config
}

/**
 * Validate a config object without the `defineConfig` ceremony.
 *
 * `viteAihuPlugin()` calls this on its inline argument. Before, only configs
 * routed through `defineConfig` were checked — so every example, which passes
 * the object straight to the plugin, was unvalidated. That is the path that
 * matters most now that the Vite config is the canonical home.
 */
export function validateAihuConfig(config: AihuConfig): void {
  validateConfig(config, 'config')
}
