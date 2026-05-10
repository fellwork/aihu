/**
 * `defineStreamRoute` — first-class route handler for streaming HTTP responses.
 *
 * v0.4.0: Per spec docs/superpowers/specs/stream-impl.md §5.
 * Usage:
 *   export default defineStreamRoute(async (req) => {
 *     return fromOpenAI(await openai.chat.completions.create({ stream: true, ... }))
 *   })
 */

import type { Route } from './router.ts'
import { defineRoute } from './router.ts'

export type StreamRouteHandler = (req: Request) => Promise<ReadableStream<string>>

/**
 * Define a route that streams text/plain chunks to the client.
 *
 * The handler receives the raw `Request` and returns a `ReadableStream<string>`.
 * Streaming headers are set automatically:
 *   - `Content-Type: text/plain; charset=utf-8`
 *   - `Transfer-Encoding: chunked`
 *   - `Cache-Control: no-cache`
 *   - `X-Accel-Buffering: no` (disables nginx buffering)
 *
 * If the handler throws, a 500 JSON response is returned.
 */
export function defineStreamRoute(handler: StreamRouteHandler): Route {
  return defineRoute('*', async (req, _ctx) => {
    try {
      const stream = await handler(req)
      return new Response(stream.pipeThrough(new TextEncoderStream()), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      })
    } catch (_e) {
      return new Response(JSON.stringify({ error: 'stream handler error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  })
}
