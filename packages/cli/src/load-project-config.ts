/**
 * The CLI's single way to read a project's aihu config.
 *
 * Every command that needed config used to dynamic-import `aihu.config.ts`
 * itself, each declaring its own local structural interface for the two or
 * three fields it cared about. `aihu build` and `aihu dev` each had a private
 * `loadConfig()`; `aihu add` had a third in `registry-resolve.ts`. That is how
 * `build.bundler` came to be read by two commands and declared by no config
 * type at all.
 *
 * Reading order, and why:
 *
 *   1. **`vite.config.ts`** — via `loadAihuConfig()`, which runs the config
 *      through Vite's own loader and reads the evaluated object off the aihu
 *      plugin's `api` handle. This is the canonical location: it is where the
 *      config is actually consumed, so there is no second file to drift.
 *   2. **`aihu.config.ts`** — legacy fallback, dynamic-imported as before.
 *
 * The fallback is not permanent. It exists so projects scaffolded with a
 * separate config file keep working through the transition; the direction is
 * SvelteKit's, where the framework config collapsed into the Vite config once
 * the tooling could read it there.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The subset of config the CLI reads. Structural on purpose — the CLI must not
 * take a runtime dependency on `@aihu/app` just to name a few option types.
 */
export interface ProjectConfig {
  readonly build?: { readonly bundler?: string; readonly target?: string }
  readonly dev?: { readonly port?: number; readonly host?: string; readonly open?: boolean }
  readonly typecheck?: { readonly strictTemplates?: boolean; readonly project?: string }
  readonly ui?: {
    readonly registry?: string
    readonly target?: string
    readonly style?: string
    readonly prefix?: string
  }
  readonly [key: string]: unknown
}

export interface LoadedProjectConfig {
  readonly config: ProjectConfig
  /** Which file it came from — used in error messages so users can find it. */
  readonly source: string
  readonly from: 'vite.config' | 'aihu.config'
}

/** Read config from `vite.config.*` via the aihu plugin's api handle. */
async function fromViteConfig(cwd: string): Promise<LoadedProjectConfig | null> {
  try {
    const { loadAihuConfig } = (await import('@aihu/app')) as {
      loadAihuConfig: (
        root: string,
        opts?: { mode?: string; command?: 'build' | 'serve' },
      ) => Promise<{ config: ProjectConfig; configFile: string } | null>
    }
    const loaded = await loadAihuConfig(cwd)
    if (!loaded) return null
    return { config: loaded.config, source: loaded.configFile, from: 'vite.config' }
  } catch {
    // @aihu/app not installed, no vite config, or the config threw. Fall back
    // rather than failing — a project may legitimately have neither.
    return null
  }
}

/** Legacy path: dynamic-import `aihu.config.ts`. */
async function fromAihuConfig(cwd: string): Promise<LoadedProjectConfig | null> {
  const configPath = join(cwd, 'aihu.config.ts')
  if (!existsSync(configPath)) return null
  try {
    const mod = (await import(configPath)) as { default?: ProjectConfig }
    return { config: mod.default ?? {}, source: configPath, from: 'aihu.config' }
  } catch {
    return { config: {}, source: configPath, from: 'aihu.config' }
  }
}

/**
 * Load the project's aihu config, preferring `vite.config.ts`.
 *
 * Returns `null` when neither file yields a config — callers decide whether
 * that is an error.
 */
export async function loadProjectConfig(cwd: string): Promise<LoadedProjectConfig | null> {
  return (await fromViteConfig(cwd)) ?? (await fromAihuConfig(cwd))
}
