/**
 * Unit tests for `defineStreamRoute` — AC12.
 *
 * Per spec docs/specs/stream-impl.md §5.
 */

import { describe, expect, it } from 'vitest'
import { defineStreamRoute } from '../src/stream-route.ts'

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeStringStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

// ─── AC12: defineStreamRoute response headers ─────────────────────────────────

describe('AC12 — defineStreamRoute response headers', () => {
  it('returns Content-Type: text/plain; charset=utf-8', async () => {
    const route = defineStreamRoute(async () => makeStringStream(['hello']))
    const req = new Request('http://localhost/')
    const res = await route.handler(req, { params: {}, env: null })

    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
  })

  it('returns streaming headers', async () => {
    const route = defineStreamRoute(async () => makeStringStream(['chunk']))
    const req = new Request('http://localhost/')
    const res = await route.handler(req, { params: {}, env: null })

    expect(res.headers.get('Transfer-Encoding')).toBe('chunked')
    expect(res.headers.get('Cache-Control')).toBe('no-cache')
    expect(res.headers.get('X-Accel-Buffering')).toBe('no')
  })

  it('returns a readable body with the stream content', async () => {
    const route = defineStreamRoute(async () => makeStringStream(['hello', ' ', 'world']))
    const req = new Request('http://localhost/')
    const res = await route.handler(req, { params: {}, env: null })

    expect(res.body).not.toBeNull()
    expect(res.ok).toBe(true)
  })

  it('returns 200 status', async () => {
    const route = defineStreamRoute(async () => makeStringStream(['ok']))
    const req = new Request('http://localhost/')
    const res = await route.handler(req, { params: {}, env: null })

    expect(res.status).toBe(200)
  })

  it('returns 500 JSON on handler error', async () => {
    const route = defineStreamRoute(async () => {
      throw new Error('test error')
    })
    const req = new Request('http://localhost/')
    const res = await route.handler(req, { params: {}, env: null })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'stream handler error' })
  })

  it('route has a pattern property', () => {
    const route = defineStreamRoute(async () => makeStringStream([]))
    expect(route.pattern).toBeDefined()
  })
})
