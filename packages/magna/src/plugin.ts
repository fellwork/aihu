/**
 * @aihu/magna — plugin factory.
 *
 * `magna(options)` returns a `Plugin` that wires the SDL pipeline into the
 * aihu `beforeCompile` build hook. Register it in `defineAihuConfig`:
 *
 * @example
 * // aihu.config.ts
 * import { magna } from '@aihu/magna'
 * import { defineAihuConfig } from '@aihu/server'
 *
 * export default defineAihuConfig({
 *   plugins: [
 *     magna({ url: process.env.MAGNA_GRAPHQL_URL! }),
 *   ],
 * })
 */
import { definePlugin } from '@aihu/plugin'
import type { Plugin } from '@aihu/plugin'
import { beforeCompile } from './codegen.js'
import type { MagnaBuildContext, MagnaPluginOptions } from './types.js'

/**
 * Create the @aihu/magna plugin.
 *
 * Wires the SDL validation pipeline into the `beforeCompile` hook so that
 * typed GraphQL bindings are generated (or gracefully skipped) at build time.
 */
export function magna(options: MagnaPluginOptions): Plugin {
  return definePlugin({
    name: '@aihu/magna',
    version: '0.1.0',
    namespace: 'magna',
    aihuVersion: '^0.2.0',
    hooks: {
      beforeCompile: async (ctx) => {
        const magnaCtx: MagnaBuildContext = {
          ...ctx,
          magna: {
            options,
            untyped: false,
            outputPath: 'src/generated/magna.ts',
            warnings: [],
          },
        }
        await beforeCompile(magnaCtx)
      },
    },
  })
}
