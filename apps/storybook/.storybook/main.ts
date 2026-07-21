/**
 * aihu Storybook (Plan 6, master spec §12.3) — @storybook/web-components +
 * Vite builder.
 *
 * Stories are CO-LOCATED with their sources (spec §10.2):
 *   - headless primitives:  packages/primitives/src/<name>/<name>.stories.ts
 *   - styled recipes:       packages/ui/registry/<name>/<name>.stories.ts
 *
 * `.aihu` recipe compilation reuses `aihuCompilerPlugin` from `@aihu/compiler`
 * — the same standalone Vite path the examples use. Recipe stories import the
 * SYNCED copies under src/recipes/ (`aihu-<name>.aihu`): the compiled element
 * tag derives from the file stem, and registry basenames (`button.aihu`) are
 * not valid custom-element names. `scripts/sync-recipes.ts` regenerates the
 * copies before every dev/build run (same-source copy semantics as `aihu add`).
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aihuCompilerPlugin } from '@aihu/compiler'
import type { StorybookConfig } from '@storybook/web-components-vite'
import { mergeConfig, type Plugin, transformWithEsbuild } from 'vite'

const CONFIG_DIR = dirname(fileURLToPath(import.meta.url))

/**
 * aihu-compiler emits TYPESCRIPT (`import type`, `as` casts) for `.aihu` ids.
 * Vite's dev pipeline only TS-strips known extensions, so import-analysis
 * chokes on the compiled output. Chain a transpile step AFTER the compiler
 * plugin (same enforce group, array order preserved) that lowers it to JS.
 */
function aihuTsStripPlugin(): Plugin {
  return {
    name: 'aihu-storybook-ts-strip',
    enforce: 'pre',
    async transform(code, id) {
      const rawId = id.split('?')[0] ?? id
      if (!rawId.endsWith('.aihu')) return
      return transformWithEsbuild(code, `${rawId}.ts`, { loader: 'ts' })
    },
  }
}

const config: StorybookConfig = {
  framework: { name: '@storybook/web-components-vite', options: {} },
  stories: [
    '../../../packages/primitives/src/**/*.stories.ts',
    '../../../packages/ui/registry/**/*.stories.ts',
  ],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  async viteFinal(base) {
    return mergeConfig(base, {
      // islands: false — stories exercise full interactivity, and the
      // static-island fast path does not support options-form (props)
      // components (see compiler _buildStaticIsland).
      plugins: [aihuCompilerPlugin({ shadowMode: 'shadow', islands: false }), aihuTsStripPlugin()],
      resolve: {
        alias: {
          // Recipe stories import '@storybook-recipes/aihu-<name>.aihu'.
          '@storybook-recipes': resolve(CONFIG_DIR, '../src/recipes'),
        },
      },
      server: {
        // Co-located stories + workspace sources live outside apps/storybook.
        fs: { allow: [resolve(CONFIG_DIR, '../../..')] },
      },
    })
  },
}

export default config
