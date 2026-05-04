import type { Plugin } from 'vite'
import type { ScribeConfig } from './config.ts'

// Build-time sub-plugin imports. These are devDependencies of @scribe/app and
// are marked external in rolldown.config.ts — they are never bundled.
import { scribeCompilerPlugin } from '@scribe/compiler'
import { viteRouterIntegration } from '@scribe/router/plugin'

/**
 * viteScribePlugin() — composed Vite plugin for scribe SPA projects.
 *
 * Returns Plugin[] composing:
 *   [0] scribeCompilerPlugin (enforce:'pre') — transforms .scribe SFCs
 *   [1] viteRouterIntegration — serves virtual:scribe-routes + virtual:scribe-layouts
 *   [2] scribe-agent-readiness (opt-in) or no-op
 *   [3..n] user plugins from config.plugins
 *   [n+1] scribe-vite-passthrough (merges config.vite into Vite's resolved config)
 *
 * @example
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import { viteScribePlugin } from '@scribe/app'
 * export default defineConfig({ plugins: [viteScribePlugin()] })
 *
 * @example
 * // With options
 * export default defineConfig({
 *   plugins: [viteScribePlugin({
 *     dir: { pages: 'src/pages', layouts: 'src/layouts' },
 *     agentReadiness: { name: 'My App', version: '1.0.0', endpoint: '/mcp' },
 *   })]
 * })
 */
export function viteScribePlugin(config?: ScribeConfig): Plugin[] {
  const routerOpts = {
    pagesDir: config?.dir?.pages ?? 'pages',
    layoutsDir: config?.dir?.layouts ?? 'src/layouts',
  }

  // Agent readiness: opt-in only. No safe default for `name`.
  let agentPlugin: Plugin
  const ar = config?.agentReadiness
  if (ar) {
    // Dynamic import to avoid pulling @scribe/agent-readiness into the bundle
    // when it is not configured. The `require` below is evaluated at runtime
    // in Node.js (vite.config.ts execution context), not in the browser.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { viteAgentReadinessIntegration } = require(
      '@scribe/agent-readiness',
    ) as typeof import('@scribe/agent-readiness')
    agentPlugin = viteAgentReadinessIntegration(ar) as unknown as Plugin
  } else {
    // Stable no-op so plugin-inspector shows a meaningful entry
    agentPlugin = { name: 'scribe-agent-readiness-disabled' }
  }

  // Vite config passthrough — deep-merged by Vite via the config() hook return value.
  const passthroughPlugin: Plugin = {
    name: 'scribe-vite-passthrough',
    config() {
      return (config?.vite ?? {}) as import('vite').UserConfig
    },
  }

  return [
    scribeCompilerPlugin() as unknown as Plugin,
    viteRouterIntegration(routerOpts) as unknown as Plugin,
    agentPlugin,
    ...((config?.plugins ?? []) as Plugin[]),
    passthroughPlugin,
  ]
}
