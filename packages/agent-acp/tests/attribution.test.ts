/**
 * `@aihu/agent-acp` — thesis §4 tier-0 attribution + arguments (slice AT1).
 *
 * "A transport that cannot express 'who is asking' has failed the thesis even
 *  if it never transacts — because the gate downstream has nothing to decide
 *  against, and the failure is invisible until someone audits it."
 *
 * Before AT1 this adapter called `service.handleToolCall(toolName, null)` —
 * two args, no context, AND params hardcoded to `null`. So the ACP transport
 * was anonymous by construction *and* structurally unable to pass arguments to
 * any action. Both are fixed here; both are proved below.
 *
 * Bindings here are deliberately PERMISSIVE (`callAction` resolves for any
 * name). Per the AC11b lesson in `agent-service/tests/live-dispatch.test.ts`,
 * a fixture whose invoker throws makes a broken gate look enforced. Every
 * denial asserted below is one only the GATE can produce, and each is asserted
 * on the gate's envelope CODE (401/403) — not merely on "the call failed".
 *
 * ACP always replies HTTP 200, so the gate's code is read from the `error`
 * part of the ACP message body.
 */

import type { AuthPlugin, LiveBinding, RequestContext } from '@aihu/agent-service'
import { createAgentService } from '@aihu/agent-service'
import { describe, expect, it } from 'vitest'
import { mountAcpAdapter } from '../src/index.ts'

const BASE = 'http://localhost'
const TAG = 'vault-card'
const TOOL = `${TAG}/readSecret`

const META = {
  tag: TAG,
  describes: 'A scoped widget',
  actions: { readSecret: { returns: {} } },
}

/** Records the args it was invoked with, and succeeds for ANY action name. */
function permissiveBinding(scope: string | null, seen: { args?: unknown[] } = {}): LiveBinding {
  return {
    rootId: 1,
    tag: TAG,
    getSignal: () => 'readable',
    setSignal: () => {},
    callAction: async (name: string, args: unknown[]) => {
      seen.args = args
      return { called: name, args }
    },
    scope: () => scope,
    rateLimit: () => null,
    dispose$: () => true,
  }
}

const authPlugin: AuthPlugin = {
  // A verify-capable plugin: any presented JWT is treated as signature-valid in
  // this fixture. The gate calls `verify` before `checkScope` — a scoped
  // transport must supply a verify-capable plugin or it fails closed with
  // AUTH_UNVERIFIABLE (#420). `sub` is the verified principal; scope is still
  // consulted via `checkScope` on the now-authenticated token.
  verify: async (jwt: string) => (jwt ? { sub: 'acp-caller' } : null),
  checkScope: (jwt: string, scope: string) => jwt.split(' ').includes(scope),
}

function makeService(scope: string | null, seen: { args?: unknown[] } = {}) {
  const registry = new Map([[TAG, [permissiveBinding(scope, seen)]]])
  return createAgentService({
    manifests: [META],
    getRegistry: () => registry,
    authPlugin,
  })
}

const bearerResolver = (req: Request): RequestContext => {
  const raw = req.headers.get('authorization') ?? ''
  if (!raw.startsWith('Bearer ')) return { userId: null }
  return { userId: 'u-alice', jwt: raw.slice('Bearer '.length) }
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}/acp/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

type AcpReply = { role: string; content: string; parts: Array<{ type: string; content: unknown }> }

/** The gate envelope carried in the ACP error part. */
function gateEnvelope(reply: AcpReply): { error?: string; code?: number } {
  const part = reply.parts?.find((p) => p.type === 'error')
  return (part?.content ?? {}) as { error?: string; code?: number }
}

async function call(
  service: ReturnType<typeof makeService>,
  headers: Record<string, string>,
  resolveAuth?: (req: Request) => RequestContext,
  body: unknown = { role: 'user', content: TOOL },
): Promise<AcpReply> {
  const adapter = mountAcpAdapter(service, resolveAuth ? { resolveAuth } : undefined)
  const res = await adapter.asMiddleware()(post(body, headers))
  expect(res?.status).toBe(200)
  return (await res?.json()) as AcpReply
}

// ── Direction 1: an authenticated request arrives WITH its context ──────────

describe('acp tier 0 — the authenticated caller is evaluated against its context', () => {
  it('denies a scoped tool with 403 SCOPE_DENIED when the authenticated caller lacks the scope', async () => {
    // Sanity (AC11b shape): the binding itself would have run this happily.
    const binding = permissiveBinding('secrets:read')
    await expect(binding.callAction('readSecret', [])).resolves.toEqual({
      called: 'readSecret',
      args: [],
    })

    const reply = await call(
      makeService('secrets:read'),
      { authorization: 'Bearer profile:read' },
      bearerResolver,
    )

    // The GATE's envelope code — not merely "it failed".
    const env = gateEnvelope(reply)
    expect(env.code).toBe(403)
    expect(env.error).toContain('SCOPE_DENIED')
    expect(env.error).toContain('secrets:read')
    expect(reply.content).toMatch(/error/)
  })

  it('ALLOWS the same scoped tool when the authenticated caller HAS the scope', async () => {
    // The other half of the discrimination: if the context were dropped, this
    // would 401 like every pre-AT1 acp request.
    const reply = await call(
      makeService('secrets:read'),
      { authorization: 'Bearer secrets:read' },
      bearerResolver,
    )

    expect(reply.content).toBe('ok')
    expect(reply.parts[0]?.type).toBe('result')
  })
})

// ── Direction 2: an unauthenticated request is anonymous, not a crash ───────

describe('acp tier 0 — an unauthenticated request is handled as anonymous', () => {
  it('carries an explicit anonymous context and 401s a scoped tool (no crash)', async () => {
    const reply = await call(makeService('secrets:read'), {}, bearerResolver)

    const env = gateEnvelope(reply)
    expect(env.code).toBe(401)
    expect(env.error).toContain('AUTH_REQUIRED')
  })

  it('serves an UNSCOPED tool anonymously — anonymous is a valid answer, not an error', async () => {
    const reply = await call(makeService(null), {}, bearerResolver)
    expect(reply.content).toBe('ok')
  })

  it('with no resolveAuth configured at all, still reaches the gate as anonymous', async () => {
    const scoped = await call(makeService('secrets:read'), {})
    expect(gateEnvelope(scoped).code).toBe(401)

    const open = await call(makeService(null), {})
    expect(open.content).toBe('ok')
  })

  it('a THROWING resolver degrades to anonymous rather than 500ing the transport', async () => {
    const adapter = mountAcpAdapter(makeService(null), {
      resolveAuth: () => {
        throw new Error('auth backend unreachable')
      },
    })
    const res = await adapter.asMiddleware()(post({ role: 'user', content: TOOL }))
    expect(res?.status).toBe(200)
    expect(((await res?.json()) as AcpReply).content).toBe('ok')
  })
})

// ── Arguments: the ACP transport can actually carry them ────────────────────

describe('acp — an action receives real arguments through the ACP path', () => {
  it('forwards params from parts[0].content.params to the action invoker', async () => {
    const seen: { args?: unknown[] } = {}
    const reply = await call(makeService(null, seen), {}, undefined, {
      role: 'user',
      content: '',
      parts: [{ type: 'tool', content: { tool: TOOL, params: { city: 'Seoul', days: 3 } } }],
    })

    expect(reply.content).toBe('ok')
    // Pre-AT1 this was ALWAYS `[]` — params were hardcoded null at the call
    // site, so no ACP caller could pass an argument to any action, ever.
    expect(seen.args).toEqual([{ city: 'Seoul', days: 3 }])
  })

  it('accepts the `args` key as well', async () => {
    const seen: { args?: unknown[] } = {}
    await call(makeService(null, seen), {}, undefined, {
      role: 'user',
      content: '',
      parts: [{ type: 'tool', content: { tool: TOOL, args: ['a', 'b'] } }],
    })
    expect(seen.args).toEqual(['a', 'b'])
  })

  it('accepts top-level params when the tool name came via content', async () => {
    const seen: { args?: unknown[] } = {}
    await call(makeService(null, seen), {}, undefined, {
      role: 'user',
      content: TOOL,
      params: { id: 42 },
    })
    expect(seen.args).toEqual([{ id: 42 }])
  })

  it('still dispatches with no arguments when none are supplied', async () => {
    const seen: { args?: unknown[] } = {}
    const reply = await call(makeService(null, seen), {}, undefined, {
      role: 'user',
      content: TOOL,
    })
    expect(reply.content).toBe('ok')
    expect(seen.args).toEqual([])
  })
})
