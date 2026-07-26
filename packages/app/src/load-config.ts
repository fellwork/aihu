/**
 * Read an aihu project's config **out of `vite.config.ts`**, without the caller
 * having to run a build.
 *
 * ## Why this exists
 *
 * A second config file (`aihu.config.ts`) is only justified while something
 * other than Vite needs to read the config and cannot parse `vite.config.ts`.
 * That was SvelteKit's stated reason for `svelte.config.js` in 2022 — the
 * language server had to know your preprocessors, and it does not run Vite.
 *
 * SvelteKit then removed the reason rather than living with it: once
 * `svelte-language-server` learned to read config out of `vite.config.js`
 * (language-tools#3031), `svelte.config.js` became optional, and SvelteKit 3
 * makes the Vite config the required location. The second file was a
 * tooling-capability workaround, not an architectural principle.
 *
 * This module is that capability for aihu. Non-Vite consumers — `aihu add`,
 * `aihu dev`, `aihu build`, the language server, the VS Code extension —
 * call `loadAihuConfig()` instead of dynamic-importing a second file.
 *
 * ## How it works
 *
 * Vite's own `loadConfigFromFile` does the hard part: it bundles the config
 * (inlining relative imports, externalizing bare specifiers), supports every
 * JS/TS extension, and returns the evaluated config plus the files it depends
 * on. We then find aihu's marker plugin in the resolved plugin array and read
 * the config off its `api` handle — the same public-API-handle pattern Qwik
 * uses to let adapters reach into `qwikVite()`.
 *
 * Reading the plugin's `api` rather than pattern-matching the source means we
 * get the *evaluated* config: computed values, spreads, conditionals and
 * imported fragments all work, because the config really ran.
 */

import type { AihuConfig } from './config.ts'

/** Plugin name carrying the config handle. Stable — external tools match it. */
export const AIHU_CONFIG_PLUGIN = 'aihu:config'

/**
 * The public API handle attached to aihu's marker plugin.
 *
 * Modelled on Qwik's `QwikVitePluginApi`. Anything that can get hold of the
 * resolved Vite plugin array can read the aihu config without importing
 * `@aihu/app`'s internals.
 */
export interface AihuPluginApi {
  /** The config object the user passed to `viteAihuPlugin()`. */
  getAihuConfig(): AihuConfig
}

/**
 * The contract EVERY aihu package that contributes build behaviour satisfies.
 *
 * This is the growth mechanism. A package ships its own Vite plugin factory,
 * attaches this handle, and becomes readable by the CLI, the language server,
 * and anything else — without `@aihu/app` knowing the package exists and
 * without a central registry to update.
 *
 * Deliberately NOT Nuxt's model. Nuxt generates `.nuxt/types/modules.d.ts` to
 * recover option types, because Nuxt modules are registered by STRING
 * (`modules: ['@nuxt/image']`) and a string erases the type. That machinery is
 * recovery for a problem created by the registration form. We register by
 * factory call — `ui({ prefix: 'app' })` — so the options type comes from the
 * function signature for free, statically, with no codegen, no `prepare` step,
 * and no chicken-and-egg where config typing does not exist until after a
 * successful build.
 *
 * What remains is the RUNTIME half: something outside Vite needs the resolved
 * values. That is what `getOptions()` is for, and it is all that is needed.
 */
export interface AihuModuleApi<TOptions = unknown> {
  /**
   * Stable module id — the package name, e.g. `'@aihu/ui'`.
   *
   * Keyed on this rather than the plugin `name` because a package may
   * contribute several plugins (Vite has no dedupe and a factory returning an
   * array is the norm), and consumers want the package, not each plugin.
   */
  readonly aihuModule: string
  /** The resolved options for this module, after its own defaults. */
  getOptions(): TOptions
}

export interface LoadedAihuConfig {
  /** The evaluated config. `{}` when the plugin was called with no argument. */
  readonly config: AihuConfig
  /** Absolute path of the Vite config file it came from. */
  readonly configFile: string
  /**
   * Files the config depends on, from Vite's own dependency tracking. A watcher
   * should invalidate when any of these change — this is what makes a dev
   * server restart on config edits.
   */
  readonly dependencies: ReadonlyArray<string>
  /**
   * Every aihu module registered in the Vite config, keyed by `aihuModule`.
   *
   * This is what gives the CLI coverage that grows on its own: a new package
   * that ships a plugin with an `AihuModuleApi` handle shows up here with no
   * change to `@aihu/app`, to this function, or to any consumer.
   */
  readonly modules: ReadonlyMap<string, unknown>
}

/** Structural shape of a Vite plugin carrying our api handle. */
interface MaybeAihuPlugin {
  name?: string
  api?: unknown
}

function hasAihuApi(p: MaybeAihuPlugin): p is { name: string; api: AihuPluginApi } {
  return (
    p.name === AIHU_CONFIG_PLUGIN &&
    typeof (p.api as AihuPluginApi | undefined)?.getAihuConfig === 'function'
  )
}

/** Does this plugin carry the module contract? */
function hasModuleApi(p: MaybeAihuPlugin): p is { api: AihuModuleApi } {
  const api = p.api as AihuModuleApi | undefined
  return typeof api?.aihuModule === 'string' && typeof api.getOptions === 'function'
}

/**
 * Collect every aihu module's resolved options from a plugin array.
 *
 * Exported so a consumer that already has the plugins (a Vite plugin in its
 * own `configResolved`, say) does not have to re-load the config file.
 *
 * First registration wins on a duplicate id: Vite does not dedupe plugins by
 * name, so a package registered twice runs twice, and the first is the one
 * whose options the build actually established.
 */
export function collectAihuModules(plugins: ReadonlyArray<unknown>): Map<string, unknown> {
  const modules = new Map<string, unknown>()
  for (const p of plugins as MaybeAihuPlugin[]) {
    if (!p || !hasModuleApi(p)) continue
    if (modules.has(p.api.aihuModule)) continue
    modules.set(p.api.aihuModule, p.api.getOptions())
  }
  return modules
}

/**
 * Flatten Vite's `PluginOption` tree.
 *
 * Mirrors Vite's own `asyncFlatten`: entries may be arrays, promises, or falsy
 * (`false`/`null`/`undefined` are legal and mean "skip"). A plugin factory
 * returning an array is the normal case — `viteAihuPlugin` is one.
 */
async function flattenPlugins(input: unknown): Promise<MaybeAihuPlugin[]> {
  let arr: unknown[] = Array.isArray(input) ? [...input] : [input]
  // Repeat until no thenables remain — a promise may resolve to another array.
  while (arr.some((v) => typeof (v as { then?: unknown })?.then === 'function')) {
    arr = (await Promise.all(arr)).flat(Number.POSITIVE_INFINITY)
  }
  return arr.flat(Number.POSITIVE_INFINITY).filter(Boolean) as MaybeAihuPlugin[]
}

/**
 * Load an aihu project's config from its Vite config file.
 *
 * Returns `null` when no Vite config exists or it registers no aihu plugin —
 * callers decide whether that is an error. (`aihu add` wants a clear "not an
 * aihu project" message; a language server wants to stay quiet.)
 *
 * `vite` is imported dynamically so that merely importing `@aihu/app` in a
 * non-build context does not pull Vite in.
 */
export async function loadAihuConfig(
  root: string,
  options: { readonly mode?: string; readonly command?: 'build' | 'serve' } = {},
): Promise<LoadedAihuConfig | null> {
  const { loadConfigFromFile } = (await import('vite')) as {
    loadConfigFromFile: (
      env: { command: 'build' | 'serve'; mode: string },
      configFile?: string,
      configRoot?: string,
    ) => Promise<{
      path: string
      config: { plugins?: unknown }
      dependencies: string[]
    } | null>
  }

  const loaded = await loadConfigFromFile(
    { command: options.command ?? 'build', mode: options.mode ?? 'production' },
    undefined,
    root,
  )
  if (!loaded) return null

  const plugins = await flattenPlugins(loaded.config.plugins ?? [])
  const marker = plugins.find(hasAihuApi)
  if (!marker) return null

  return {
    config: marker.api.getAihuConfig(),
    configFile: loaded.path,
    dependencies: loaded.dependencies,
    modules: collectAihuModules(plugins),
  }
}

/**
 * Attach the module contract to a plugin (or plugin array).
 *
 * The one-liner a package uses so it becomes CLI-readable:
 *
 * ```ts
 * // @aihu/ui
 * export function ui(options: UiOptions = {}): Plugin[] {
 *   const resolved = { ...UI_DEFAULTS, ...options }
 *   validateUiOptions(resolved)          // the package owns its own schema
 *   return declareAihuModule('@aihu/ui', resolved, [
 *     { name: 'aihu:ui', ... },
 *   ])
 * }
 * ```
 *
 * The handle rides the FIRST plugin, so a package contributing several plugins
 * still reports one set of options. Options are captured by reference at call
 * time — `getOptions()` returns what the build is actually using, not a copy
 * that could drift.
 */
export function declareAihuModule<TOptions, TPlugins extends readonly unknown[]>(
  aihuModule: string,
  options: TOptions,
  plugins: TPlugins,
): TPlugins {
  const first = plugins[0] as { api?: unknown } | undefined
  if (first && typeof first === 'object') {
    const api: AihuModuleApi<TOptions> = { aihuModule, getOptions: () => options }
    // Merge rather than overwrite: a plugin may already publish its own api
    // (Qwik-style handles are a normal thing to want alongside this).
    first.api = Object.assign({}, first.api ?? {}, api)
  }
  return plugins
}
