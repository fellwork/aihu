/**
 * `@scribe/agent-a2a` — A2A adapter tests (Plan 5.3).
 *
 * 14 tests covering agent card, task routing, SSE streaming, error paths,
 * prefix support, and pass-through (null) behaviour.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createAgentService } from '@scribe/agent-service'
import type { AgentMetadata } from '@scribe/agent'
import { mountA2aAdapter } from '../src/index.ts'

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeService(metas: AgentMetadata[] = []) {
  return createAgentService({ manifests: metas })
}

function makeRequest(
  method: string,
  url: string,
  body?: unknown
): Request {
  if (body !== undefined) {
    return new Request(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  return new Request(url, { method })
}

const BASE = 'http://localhost'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('@scribe/agent-a2a — agent card', () => {
  it('1. GET /.well-known/agent.json returns 200', async () => {
    const adapter = mountA2aAdapter(makeService())
    const mw = adapter.asMiddleware()
    const res = await mw(makeRequest('GET', `${BASE}/.well-known/agent.json`))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
  })

  it('2. Agent card has name, version, capabilities.streaming, skills', async () => {
    const adapter = mountA2aAdapter(makeService(), { name: 'my-agent' })
    const mw = adapter.asMiddleware()
    const res = await mw(makeRequest('GET', `${BASE}/.well-known/agent.json`))
    const body = await res!.json() as Record<string, unknown>
    expect(body.name).toBe('my-agent')
    expect(body.version).toBe('1.0.0')
    expect((body.capabilities as Record<string, unknown>).streaming).toBe(true)
    expect(Array.isArray(body.skills)).toBe(true)
  })

  it('3. Skills are built from manifest tools/actions', async () => {
    const meta: AgentMetadata = {
      tag: 'x-counter',
      actions: {
        increment: { returns: { value: { type: 'number' } } },
        reset: { returns: {} },
      },
    }
    const adapter = mountA2aAdapter(makeService([meta]))
    const mw = adapter.asMiddleware()
    const res = await mw(makeRequest('GET', `${BASE}/.well-known/agent.json`))
    const body = await res!.json() as { skills: Array<{ id: string; name: string }> }
    expect(body.skills).toHaveLength(2)
    const ids = body.skills.map(s => s.id)
    expect(ids).toContain('x-counter/increment')
    expect(ids).toContain('x-counter/reset')
  })

  it('4. Empty manifest produces empty skills array', async () => {
    const adapter = mountA2aAdapter(makeService())
    const mw = adapter.asMiddleware()
    const res = await mw(makeRequest('GET', `${BASE}/.well-known/agent.json`))
    const body = await res!.json() as { skills: unknown[] }
    expect(body.skills).toEqual([])
  })
})

describe('@scribe/agent-a2a — POST /a2a/tasks/send', () => {
  const meta: AgentMetadata = {
    tag: 'x-greeter',
    actions: { greet: { returns: { message: { type: 'string' } } } },
  }

  it('5. Valid tool call returns 200 with taskId, status completed, result', async () => {
    const adapter = mountA2aAdapter(makeService([meta]))
    const mw = adapter.asMiddleware()
    const res = await mw(
      makeRequest('POST', `${BASE}/a2a/tasks/send`, {
        taskId: 'tid-1',
        message: 'x-greeter/greet',
        params: { name: 'world' },
      })
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
    const body = await res!.json() as Record<string, unknown>
    expect(body.taskId).toBe('tid-1')
    expect(body.status).toBe('completed')
    expect(body.result).toBeDefined()
  })

  it('6. Unknown tool returns 200 with status failed and error field', async () => {
    const adapter = mountA2aAdapter(makeService([meta]))
    const mw = adapter.asMiddleware()
    const res = await mw(
      makeRequest('POST', `${BASE}/a2a/tasks/send`, {
        message: 'x-unknown/do-something',
      })
    )
    expect(res!.status).toBe(200)
    const body = await res!.json() as Record<string, unknown>
    expect(body.status).toBe('failed')
    expect(typeof body.error).toBe('string')
  })

  it('7. Bad JSON body returns 400', async () => {
    const adapter = mountA2aAdapter(makeService([meta]))
    const mw = adapter.asMiddleware()
    const req = new Request(`${BASE}/a2a/tasks/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{{{',
    })
    const res = await mw(req)
    expect(res!.status).toBe(400)
    const body = await res!.json() as Record<string, unknown>
    expect(body.error).toBeDefined()
  })

  it('8. Missing message returns status failed', async () => {
    const adapter = mountA2aAdapter(makeService([meta]))
    const mw = adapter.asMiddleware()
    const res = await mw(
      makeRequest('POST', `${BASE}/a2a/tasks/send`, { taskId: 'tid-2' })
    )
    expect(res!.status).toBe(200)
    const body = await res!.json() as Record<string, unknown>
    expect(body.status).toBe('failed')
  })
})

describe('@scribe/agent-a2a — POST /a2a/tasks/sendSubscribe (SSE)', () => {
  const meta: AgentMetadata = {
    tag: 'x-ticker',
    actions: { tick: { returns: { count: { type: 'number' } } } },
  }

  it('9. sendSubscribe returns content-type: text/event-stream', async () => {
    const adapter = mountA2aAdapter(makeService([meta]))
    const mw = adapter.asMiddleware()
    const res = await mw(
      makeRequest('POST', `${BASE}/a2a/tasks/sendSubscribe`, {
        taskId: 'sub-1',
        message: 'x-ticker/tick',
      })
    )
    expect(res).not.toBeNull()
    expect(res!.headers.get('content-type')).toBe('text/event-stream')
  })

  it('10. SSE stream contains taskId in first frame', async () => {
    const adapter = mountA2aAdapter(makeService([meta]))
    const mw = adapter.asMiddleware()
    const res = await mw(
      makeRequest('POST', `${BASE}/a2a/tasks/sendSubscribe`, {
        taskId: 'sub-2',
        message: 'x-ticker/tick',
      })
    )
    const text = await res!.text()
    expect(text).toContain('"taskId":"sub-2"')
  })

  it('11. SSE stream ends with [DONE]', async () => {
    const adapter = mountA2aAdapter(makeService([meta]))
    const mw = adapter.asMiddleware()
    const res = await mw(
      makeRequest('POST', `${BASE}/a2a/tasks/sendSubscribe`, {
        taskId: 'sub-3',
        message: 'x-ticker/tick',
      })
    )
    const text = await res!.text()
    expect(text).toContain('[DONE]')
  })
})

describe('@scribe/agent-a2a — pass-through and prefix', () => {
  it('12. Non-matching path returns null', async () => {
    const adapter = mountA2aAdapter(makeService())
    const mw = adapter.asMiddleware()
    const res = await mw(makeRequest('GET', `${BASE}/some/other/path`))
    expect(res).toBeNull()
  })

  it('13. Non-matching method returns null', async () => {
    const adapter = mountA2aAdapter(makeService())
    const mw = adapter.asMiddleware()
    // POST to agent card path is not handled
    const res = await mw(makeRequest('POST', `${BASE}/.well-known/agent.json`, {}))
    expect(res).toBeNull()
  })

  it('14. Custom prefix routes correctly', async () => {
    const adapter = mountA2aAdapter(makeService(), { prefix: '/api/v1' })
    const mw = adapter.asMiddleware()

    // With prefix: correct path works
    const resOk = await mw(makeRequest('GET', `${BASE}/api/v1/.well-known/agent.json`))
    expect(resOk).not.toBeNull()
    expect(resOk!.status).toBe(200)

    // Without prefix: path not matched
    const resMiss = await mw(makeRequest('GET', `${BASE}/.well-known/agent.json`))
    expect(resMiss).toBeNull()
  })
})
