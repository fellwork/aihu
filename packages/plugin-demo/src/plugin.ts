/**
 * @aihu/plugin-demo — `demo()` plugin factory.
 *
 * Canonical proof-of-life for the plugin API. Exercises every contribution
 * type that a real plugin uses:
 *
 *   - macros:      `$greeting` — declares a lowering to `<span class="aihu-greeting">Hello, <name></span>`
 *   - middleware:  `demo:log-header` — before-handler contribution declaration
 *   - transforms:  pass-through transform at `after-parse` stage
 *
 * The compiler dispatcher is a no-op at v0.2.x — the contribution SHAPE is
 * what matters, not live lowering. This plugin demonstrates every slot.
 *
 * @example
 * // aihu.config.ts
 * import { defineAihuConfig } from '@aihu/server'
 * import { demo } from '@aihu/plugin-demo'
 *
 * export default defineAihuConfig({
 *   plugins: [demo()],
 * })
 */

import type { Plugin } from '@aihu/plugin'
import { definePlugin } from '@aihu/plugin'
import type { DemoOptions } from './types.ts'

/**
 * Create the `@aihu/plugin-demo` plugin.
 *
 * Registers macro, middleware, and transform contributions so every plugin
 * contribution slot is exercised in a single package.
 */
export function demo(options?: DemoOptions): Plugin {
  const greetingName = options?.greetingName ?? 'World'

  return definePlugin({
    name: '@aihu/plugin-demo',
    version: '0.1.0',
    namespace: 'demo',
    aihuVersion: '^0.2.0',
    serverOnly: true,
    contributes: {
      macros: [
        {
          name: '$greeting',
          validIn: ['@state'],
          lowering: (_ctx, args) => {
            // Lowering is declared but the compiler dispatcher is a no-op at v0.2.x.
            // This shape proves the macro contribution contract holds end-to-end.
            const name = typeof args['name'] === 'string' ? args['name'] : greetingName
            return `<span class="aihu-greeting">Hello, ${name}</span>`
          },
          validation: (ctx, args) => {
            if (args['name'] !== undefined && typeof args['name'] !== 'string') {
              ctx.error('$greeting: "name" must be a string')
            }
          },
        },
      ],
      middleware: [
        {
          name: 'demo:log-header',
          stage: 'before-handler',
          handler: './middleware.js#logHeader',
        },
      ],
      transforms: [
        {
          stage: 'after-parse',
          fn: (input) => input, // pass-through — contribution shape is what matters
        },
      ],
    },
    hooks: {
      beforeCompile: (_ctx) => {
        // No-op hook — demonstrates the hook slot without side effects.
      },
    },
  })
}
