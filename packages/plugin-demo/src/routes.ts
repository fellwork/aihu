/**
 * @aihu/plugin-demo — route-handler factory.
 *
 * `createDemoRoutes(config)` returns a record of `RouteHandler` typed against
 * `@aihu/server`. Wire via `defineRoute('/__demo/ping', demoRoutes.demoEndpoint)`
 * inside `createRequestRouter`.
 *
 * The `GET /__demo/ping` handler returns:
 * ```json
 * { "ok": true, "plugin": "@aihu/plugin-demo", "version": "0.1.0" }
 * ```
 */

import type { RouteContext } from '@aihu/server'
import type { DemoOptions } from './types.ts'

/** A minimal route handler type compatible with @aihu/server RouteHandler. */
type RouteHandler = (req: Request, ctx: RouteContext) => Response | Promise<Response>

/**
 * Create the demo plugin route handlers.
 *
 * Follows the canonical pattern from `createAgentReadinessRoutes` —
 * returns a plain object whose values are `RouteHandler` callables.
 *
 * @example
 * import { createDemoRoutes } from '@aihu/plugin-demo'
 * import { createRequestRouter, defineRoute } from '@aihu/server'
 *
 * const demoRoutes = createDemoRoutes({})
 * export const router = createRequestRouter({
 *   routes: [defineRoute('/__demo/ping', demoRoutes.demoEndpoint)],
 * })
 */
export function createDemoRoutes(
  _config?: DemoOptions,
): {
  readonly demoEndpoint: RouteHandler
} {
  const demoEndpoint: RouteHandler = (_req, _ctx) => {
    return new Response(
      JSON.stringify({
        ok: true,
        plugin: '@aihu/plugin-demo',
        version: '0.1.0',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  return { demoEndpoint } as const
}
