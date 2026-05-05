import { createAgentService } from '@aihu/agent-service'
import { describe, expect, it } from 'vitest'
import { mountAcpAdapter } from '../src/index.ts'

/**
 * Plan 5.3 — unit tests for `@aihu/agent-acp`.
 *
 * AC-1:  Agent card GET returns 200 JSON.
 * AC-2:  Agent card has agent_id, description, skills.
 * AC-3:  Skills are built from manifest tools/actions.
 * AC-4:  Empty manifest produces empty skills array.
 * AC-5:  POST /acp/messages with tool name in parts[0].content.tool → 200 ACP response.
 * AC-6:  POST /acp/messages with tool name in content field → 200 ACP response.
 * AC-7:  POST /acp/messages unknown tool → 200 error ACP message (NOT 4xx).
 * AC-8:  POST /acp/messages with bad JSON → 200 error ACP message.
 * AC-9:  POST /acp/messages with no tool name → error message.
 * AC-10: Non-matching path returns null.
 * AC-11: Non-matching method returns null.
 * AC-12: Custom prefix works.
 */

const sampleService = () =>
  createAgentService({
    manifests: [
      {
        tag: 'my-widget',
        describes: 'A test widget',
        actions: {
          doThing: { returns: {} },
          doOther: { returns: { value: { type: 'string' } } },
        },
      },
    ],
  })

const makeGet = (url: string) => new Request(url, { method: 'GET' })
const makePost = (url: string, body: unknown) =>
  new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

// ── AC-1: Agent card GET ─────────────────────────────────────────────────────

describe('agent card — GET /.well-known/acp-agent', () => {
  it('returns 200 for GET to agent card path', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const res = await mw(makeGet('http://localhost/.well-known/acp-agent'))
    expect(res).not.toBeNull()
    expect(res?.status).toBe(200)
  })

  it('response content-type is application/json', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const res = await mw(makeGet('http://localhost/.well-known/acp-agent'))
    expect(res?.headers.get('content-type')).toBe('application/json')
  })

  // AC-2: Agent card shape
  it('agent card has agent_id, description, skills', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const res = await mw(makeGet('http://localhost/.well-known/acp-agent'))
    const body = (await res?.json()) as Record<string, unknown>
    expect(typeof body.agent_id).toBe('string')
    expect(typeof body.description).toBe('string')
    expect(Array.isArray(body.skills)).toBe(true)
  })

  // AC-3: Skills from manifest
  it('skills are built from manifest tools/actions', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const res = await mw(makeGet('http://localhost/.well-known/acp-agent'))
    const body = (await res?.json()) as { skills: Array<{ skill_id: string; name: string }> }
    const skillIds = body.skills.map((s) => s.skill_id)
    expect(skillIds).toContain('my-widget/doThing')
    expect(skillIds).toContain('my-widget/doOther')
    expect(body.skills).toHaveLength(2)
  })

  // AC-4: Empty manifest → empty skills
  it('empty manifest produces empty skills array', async () => {
    const adapter = mountAcpAdapter(createAgentService({ manifests: [] }))
    const mw = adapter.asMiddleware()
    const res = await mw(makeGet('http://localhost/.well-known/acp-agent'))
    const body = (await res?.json()) as { skills: unknown[] }
    expect(body.skills).toHaveLength(0)
  })

  it('uses default agent_id when not specified', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const res = await mw(makeGet('http://localhost/.well-known/acp-agent'))
    const body = (await res?.json()) as { agent_id: string }
    expect(body.agent_id).toBe('aihu-agent-service')
  })
})

// ── AC-5: POST /acp/messages via parts ──────────────────────────────────────

describe('POST /acp/messages', () => {
  it('handles valid tool name in parts[0].content.tool → 200 ACP response', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const req = makePost('http://localhost/acp/messages', {
      role: 'user',
      content: '',
      parts: [{ type: 'tool', content: { tool: 'my-widget/doThing' } }],
    })
    const res = await mw(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(200)
    const body = (await res?.json()) as { role: string; content: string }
    expect(body.role).toBe('agent')
    expect(body.content).toBe('ok')
  })

  // AC-6: Tool name in content field
  it('handles valid tool name in content field → 200 ACP response', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const req = makePost('http://localhost/acp/messages', {
      role: 'user',
      content: 'my-widget/doThing',
    })
    const res = await mw(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(200)
    const body = (await res?.json()) as { role: string; content: string }
    expect(body.role).toBe('agent')
    expect(body.content).toBe('ok')
  })

  // AC-7: Unknown tool → 200 error ACP message (NOT 4xx)
  it('unknown tool returns 200 error ACP message (not 4xx)', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const req = makePost('http://localhost/acp/messages', {
      role: 'user',
      content: 'x-unknown/missing',
    })
    const res = await mw(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(200)
    const body = (await res?.json()) as { role: string; content: string }
    expect(body.role).toBe('agent')
    expect(body.content).toMatch(/error/)
  })

  // AC-8: Bad JSON → 200 error ACP message
  it('bad JSON body returns 200 error ACP message', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const req = new Request('http://localhost/acp/messages', {
      method: 'POST',
      body: 'not-valid-json{{{',
      headers: { 'content-type': 'application/json' },
    })
    const res = await mw(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(200)
    const body = (await res?.json()) as { role: string; content: string }
    expect(body.role).toBe('agent')
    expect(body.content).toMatch(/error/)
  })

  // AC-9: No tool name → error message
  it('no tool name in message returns error ACP message', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const req = makePost('http://localhost/acp/messages', {
      role: 'user',
      content: '',
    })
    const res = await mw(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(200)
    const body = (await res?.json()) as { role: string; content: string }
    expect(body.role).toBe('agent')
    expect(body.content).toMatch(/error/)
  })

  it('successful response includes parts with result', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const req = makePost('http://localhost/acp/messages', {
      role: 'user',
      content: 'my-widget/doThing',
    })
    const res = await mw(req)
    const body = (await res?.json()) as { parts: Array<{ type: string; content: unknown }> }
    expect(Array.isArray(body.parts)).toBe(true)
    expect(body.parts[0]?.type).toBe('result')
  })
})

// ── AC-10 & AC-11: Pass-through ──────────────────────────────────────────────

describe('pass-through (null) behavior', () => {
  // AC-10: Non-matching path
  it('non-matching path returns null', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const res = await mw(makeGet('http://localhost/some/other/path'))
    expect(res).toBeNull()
  })

  // AC-11: Non-matching method
  it('POST to agent card path returns null', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const req = makePost('http://localhost/.well-known/acp-agent', {})
    const res = await mw(req)
    expect(res).toBeNull()
  })

  it('GET to messages path returns null', async () => {
    const adapter = mountAcpAdapter(sampleService())
    const mw = adapter.asMiddleware()
    const res = await mw(makeGet('http://localhost/acp/messages'))
    expect(res).toBeNull()
  })
})

// ── AC-12: Custom prefix ─────────────────────────────────────────────────────

describe('custom prefix option', () => {
  it('agent card is served at prefixed path', async () => {
    const adapter = mountAcpAdapter(sampleService(), { prefix: '/api/v1' })
    const mw = adapter.asMiddleware()
    const res = await mw(makeGet('http://localhost/api/v1/.well-known/acp-agent'))
    expect(res).not.toBeNull()
    expect(res?.status).toBe(200)
  })

  it('messages route is served at prefixed path', async () => {
    const adapter = mountAcpAdapter(sampleService(), { prefix: '/api/v1' })
    const mw = adapter.asMiddleware()
    const req = makePost('http://localhost/api/v1/acp/messages', {
      role: 'user',
      content: 'my-widget/doThing',
    })
    const res = await mw(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(200)
  })

  it('unprefixed paths return null when prefix is set', async () => {
    const adapter = mountAcpAdapter(sampleService(), { prefix: '/api/v1' })
    const mw = adapter.asMiddleware()
    const res = await mw(makeGet('http://localhost/.well-known/acp-agent'))
    expect(res).toBeNull()
  })

  it('custom agentId appears in agent card', async () => {
    const adapter = mountAcpAdapter(sampleService(), { agentId: 'my-custom-agent' })
    const mw = adapter.asMiddleware()
    const res = await mw(makeGet('http://localhost/.well-known/acp-agent'))
    const body = (await res?.json()) as { agent_id: string }
    expect(body.agent_id).toBe('my-custom-agent')
  })
})
