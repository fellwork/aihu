import { describe, expect, it } from 'vitest'
import { createRequestRouter, createRouter, defineRoute } from '../src/index.ts'

// ---------------------------------------------------------------------------
// v0.7.4 — createRequestRouter / createRouter naming
// ---------------------------------------------------------------------------

describe('@scribe/server v0.7.4 — createRequestRouter naming', () => {
  it('createRequestRouter is exported from @scribe/server', () => {
    expect(typeof createRequestRouter).toBe('function')
  })

  it('createRequestRouter creates a working fetch handler', async () => {
    const route = defineRoute('/ping', async () => new Response('pong'))
    const fetch = createRequestRouter({ routes: [route] })
    const res = await fetch(new Request('http://localhost/ping'))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('pong')
  })

  it('createRouter (deprecated alias) still works', async () => {
    const route = defineRoute('/health', async () => new Response('ok'))
    const fetch = createRouter({ routes: [route] })
    const res = await fetch(new Request('http://localhost/health'))
    expect(await res.text()).toBe('ok')
  })

  it('createRouter === createRequestRouter (same function reference)', () => {
    expect(createRouter).toBe(createRequestRouter)
  })
})
