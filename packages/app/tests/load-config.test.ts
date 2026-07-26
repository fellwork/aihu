/**
 * `loadAihuConfig` — read a project's config out of `vite.config.ts` without
 * running a build.
 *
 * This is the capability that decides whether aihu needs a second config file
 * at all. SvelteKit kept `svelte.config.js` for four years purely because its
 * language server could not read `vite.config.js`; the moment that landed
 * (language-tools#3031), the second file became optional and is being removed
 * in SvelteKit 3.
 *
 * The fixture's config uses a COMPUTED value (`isProd`) on purpose. Anything
 * that parsed the source rather than evaluating it would have to give up
 * there — which is the whole reason this reads the plugin's `api` handle.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AIHU_CONFIG_PLUGIN, loadAihuConfig } from '../src/load-config.ts'
import { viteAihuPlugin } from '../src/vite-plugin.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(HERE, 'fixtures', 'vite-config-project')

describe('the config marker plugin', () => {
  it('is present in the plugin array and exposes the config', async () => {
    const plugins = viteAihuPlugin({ output: 'static' })
    const marker = (await Promise.all(plugins))
      .flat(Number.POSITIVE_INFINITY)
      .find((p) => (p as { name?: string })?.name === AIHU_CONFIG_PLUGIN) as
      | { api: { getAihuConfig(): unknown } }
      | undefined

    expect(marker, 'viteAihuPlugin must register the config marker plugin').toBeDefined()
    expect(marker?.api.getAihuConfig()).toEqual({ output: 'static' })
  })

  it('exposes an empty object when the plugin is called with no config', async () => {
    const plugins = viteAihuPlugin()
    const marker = (await Promise.all(plugins))
      .flat(Number.POSITIVE_INFINITY)
      .find((p) => (p as { name?: string })?.name === AIHU_CONFIG_PLUGIN) as
      | { api: { getAihuConfig(): unknown } }
      | undefined
    expect(marker?.api.getAihuConfig()).toEqual({})
  })

  it('validates inline config, so the plugin path is not a validation bypass', () => {
    // Every example passes its config straight to viteAihuPlugin rather than
    // through defineConfig, so before this the common path was unchecked.
    expect(() => viteAihuPlugin({ rendering: { mode: 'ssr' } } as never)).toThrow(
      /did you mean output/,
    )
  })
})

describe('loadAihuConfig reads vite.config.ts', () => {
  it('returns the evaluated config, including computed values', async () => {
    const loaded = await loadAihuConfig(FIXTURE)
    expect(loaded, 'fixture must resolve').not.toBeNull()
    expect(loaded?.configFile).toContain('vite.config.ts')

    const cfg = loaded?.config as {
      dir?: { pages?: string; components?: string }
      build?: { bundler?: string }
      dev?: { port?: number }
      compiler?: { islands?: boolean }
      app?: { head?: { title?: string } }
    }
    expect(cfg.dir?.pages).toBe('src/pages')
    expect(cfg.dir?.components).toBe('src/components')
    expect(cfg.build?.bundler).toBe('rolldown')
    expect(cfg.dev?.port).toBe(4321)
    expect(cfg.app?.head?.title).toBe('read-from-vite-config')
    // The computed one — proves evaluation, not source parsing.
    expect(cfg.compiler?.islands).toBe(true)
  })

  it('reports the files the config depends on, so a watcher can invalidate', async () => {
    const loaded = await loadAihuConfig(FIXTURE)
    expect(loaded?.dependencies.length).toBeGreaterThan(0)
  })

  it('returns null for a directory with no vite config', async () => {
    expect(await loadAihuConfig(join(HERE, 'fixtures'))).toBeNull()
  })
}, 60_000)
