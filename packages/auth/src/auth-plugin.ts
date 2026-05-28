/**
 * `@aihu/auth` — `auth()` plugin factory (A02).
 *
 * Returns an aihu `Plugin` (from `@aihu/plugin`) that:
 *   1. Registers the three auth routes (sign-in, sign-out, refresh) via a
 *      server-runtime contribution declaration.
 *   2. Attaches `getAuthState` to the server context by declaring it as a
 *      server-runtime helper.
 *
 * The `$auth.*` compiler macros are ratified but NOT lowered here — lowering
 * is a separate PR. This factory is runtime-only.
 *
 * @example
 * // aihu.config.ts
 * import { auth } from '@aihu/auth'
 * import { defineAihuConfig } from '@aihu/server'
 *
 * export default defineAihuConfig({
 *   plugins: [
 *     auth({ jwtSecret: process.env.JWT_SECRET! }),
 *   ],
 * })
 */

import type { Plugin } from '@aihu/plugin'
import { definePlugin } from '@aihu/plugin'
import type { AuthConfig } from './types.ts'

/**
 * Create the `@aihu/auth` plugin.
 *
 * Wires auth routes into the server and exposes `getAuthState` as a
 * server-runtime helper. The resolved config is stored in the plugin's
 * `contributes.serverRuntime` map so the server adapter can load the
 * handler modules at request time.
 *
 * Route paths are taken from `config.signInPath`, `config.signOutPath`, and
 * `config.refreshPath` (defaults: `/auth/sign-in`, `/auth/sign-out`, `/auth/refresh`).
 */
export function auth(config: AuthConfig): Plugin {
  const signInPath = config.signInPath ?? '/auth/sign-in'
  const signOutPath = config.signOutPath ?? '/auth/sign-out'
  const refreshPath = config.refreshPath ?? '/auth/refresh'

  return definePlugin({
    name: '@aihu/auth',
    version: '0.1.1',
    namespace: 'auth',
    aihuVersion: '^0.2.0',
    serverOnly: true,
    contributes: {
      serverRuntime: {
        // The compiler / server adapter resolves these paths at registration
        // time and wires the handlers into the request router.
        getAuthState: './server.js',
        signIn: './routes.js',
        signOut: './routes.js',
        refresh: './routes.js',
      },
      middleware: [
        {
          name: 'auth:sign-in',
          stage: 'before-handler',
          handler: `${signInPath}:POST:./routes.js#signIn`,
        },
        {
          name: 'auth:sign-out',
          stage: 'before-handler',
          handler: `${signOutPath}:POST:./routes.js#signOut`,
        },
        {
          name: 'auth:refresh',
          stage: 'before-handler',
          handler: `${refreshPath}:POST:./routes.js#refresh`,
        },
      ],
    },
    hooks: {
      beforeCompile: async (_ctx) => {
        // Validation hook: ensure jwtSecret is provided.
        // The actual route registration is done by the server adapter
        // using the `contributes.serverRuntime` declarations above.
        if (!config.jwtSecret) {
          throw new Error('[auth plugin] jwtSecret is required')
        }
      },
    },
  })
}
