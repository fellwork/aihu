import type { AgentMetadata } from '@aihu/agent'
import { describe, expect, it } from 'vitest'
import { createAgentService } from '../src/index.ts'

/**
 * Plan 5.2 — unit tests for `@aihu/agent-service`.
 * AC-1: createAgentService() returns an AgentService with all required methods.
 * AC-2: getManifest() aggregates registered AgentMetadata entries.
 * AC-3: handleToolCall routes (stub response) for valid tool names.
 * AC-4: asMiddleware() returns a (req: Request) => Promise<Response | null> function.
 */

const sampleMeta: AgentMetadata = {
  tag: 'x-counter',
  describes: 'A counter widget',
  actions: {
    increment: { returns: { count: { type: 'number' } } },
    reset: { returns: {} },
  },
}

const sampleMeta2: AgentMetadata = {
  tag: 'x-search',
  describes: 'A search box',
  actions: {
    query: { returns: { results: { type: 'string' } } },
  },
}

// ── AC-1: Shape ──────────────────────────────────────────────────────────────

describe('createAgentService — shape', () => {
  it('returns an object with getManifest, handleToolCall, asMiddleware', () => {
    const svc = createAgentService()
    expect(typeof svc.getManifest).toBe('function')
    expect(typeof svc.handleToolCall).toBe('function')
    expect(typeof svc.asMiddleware).toBe('function')
  })

  it('works with no options (empty manifest)', () => {
    const svc = createAgentService()
    const manifest = svc.getManifest()
    expect(manifest).toEqual({ tools: [] })
  })

  it('works with explicit empty manifests array', () => {
    const svc = createAgentService({ manifests: [] })
    expect(svc.getManifest().tools).toHaveLength(0)
  })
})

// ── AC-2: getManifest ────────────────────────────────────────────────────────

describe('getManifest()', () => {
  it('returns a manifest with one tool entry per metadata', () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const manifest = svc.getManifest()
    expect(manifest.tools).toHaveLength(1)
  })

  it('tool entry has correct name and tag', () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const [tool] = svc.getManifest().tools
    expect(tool?.name).toBe('x-counter')
    expect(tool?.tag).toBe('x-counter')
  })

  it('tool entry includes actions from metadata', () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const [tool] = svc.getManifest().tools
    expect(Object.keys(tool?.actions ?? {})).toContain('increment')
    expect(Object.keys(tool?.actions ?? {})).toContain('reset')
  })

  it('aggregates multiple metadata entries into tools array', () => {
    const svc = createAgentService({ manifests: [sampleMeta, sampleMeta2] })
    const manifest = svc.getManifest()
    expect(manifest.tools).toHaveLength(2)
    const tags = manifest.tools.map((t) => t.tag)
    expect(tags).toContain('x-counter')
    expect(tags).toContain('x-search')
  })

  it('returns empty actions for metadata with no actions field', () => {
    const meta: AgentMetadata = { tag: 'x-bare' }
    const svc = createAgentService({ manifests: [meta] })
    const [tool] = svc.getManifest().tools
    expect(tool?.actions).toEqual({})
  })

  it('getManifest() returns the same reference on repeated calls', () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    expect(svc.getManifest()).toBe(svc.getManifest())
  })
})

// ── AC-3: handleToolCall ─────────────────────────────────────────────────────

describe('handleToolCall()', () => {
  it('returns a stub result for a valid tag/action', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const res = await svc.handleToolCall('x-counter/increment', { amount: 1 })
    expect(res).toMatchObject({ tag: 'x-counter', action: 'increment', stub: true })
  })

  it('returns error for missing tag', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const res = (await svc.handleToolCall('x-missing/action', {})) as Record<string, unknown>
    expect(typeof res.error).toBe('string')
    expect(res.error).toContain('x-missing')
  })

  it('returns error for invalid toolName format (no slash)', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const res = (await svc.handleToolCall('badformat', {})) as Record<string, unknown>
    expect(typeof res.error).toBe('string')
  })

  it('returns error for unknown action on known tag', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const res = (await svc.handleToolCall('x-counter/fly', {})) as Record<string, unknown>
    expect(typeof res.error).toBe('string')
    expect(res.error).toContain('fly')
  })

  it('params are echoed back in stub result', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const params = { delta: 5 }
    const res = (await svc.handleToolCall('x-counter/increment', params)) as Record<string, unknown>
    expect(res.params).toEqual(params)
  })
})

// ── AC-4: asMiddleware ───────────────────────────────────────────────────────

describe('asMiddleware()', () => {
  it('returns a function', () => {
    const svc = createAgentService()
    expect(typeof svc.asMiddleware()).toBe('function')
  })

  it('returns null for non-matching path', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const mw = svc.asMiddleware()
    const req = new Request('http://localhost/other', { method: 'POST' })
    const result = await mw(req)
    expect(result).toBeNull()
  })

  it('returns null for non-POST methods on matching path', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const mw = svc.asMiddleware()
    const req = new Request('http://localhost/__aihu/tools/call', { method: 'GET' })
    const result = await mw(req)
    expect(result).toBeNull()
  })

  it('handles valid POST to /__aihu/tools/call', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const mw = svc.asMiddleware()
    const req = new Request('http://localhost/__aihu/tools/call', {
      method: 'POST',
      body: JSON.stringify({ tool: 'x-counter/increment', params: {} }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await mw(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(200)
    const body = (await res?.json()) as { result: unknown }
    expect(body.result).toBeDefined()
  })

  it('returns non-null response for invalid JSON body', async () => {
    const svc = createAgentService()
    const mw = svc.asMiddleware()
    const req = new Request('http://localhost/__aihu/tools/call', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    })
    const res = await mw(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBeGreaterThanOrEqual(400)
  })

  it('returns non-null response when tool field is missing', async () => {
    const svc = createAgentService()
    const mw = svc.asMiddleware()
    const req = new Request('http://localhost/__aihu/tools/call', {
      method: 'POST',
      body: JSON.stringify({ params: {} }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await mw(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBeGreaterThanOrEqual(400)
  })

  it('response content-type is application/json', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const mw = svc.asMiddleware()
    const req = new Request('http://localhost/__aihu/tools/call', {
      method: 'POST',
      body: JSON.stringify({ tool: 'x-counter/increment', params: null }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await mw(req)
    expect(res?.headers.get('content-type')).toBe('application/json')
  })
})
