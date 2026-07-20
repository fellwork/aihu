/**
 * `@aihu/agent-a2a` — thesis §4 tier-0 attribution (slice AT1, re-expressed
 * over the A2A v1.0.1 JSON-RPC wire).
 *
 * "A transport that cannot express 'who is asking' has failed the thesis even
 *  if it never transacts — because the gate downstream has nothing to decide
 *  against, and the failure is invisible until someone audits it."
 *
 * Before AT1 this adapter called `service.handleToolCall(msg, params)` — two
 * args, no context. Every request through a2a was anonymous by construction,
 * so no gate verdict could ever depend on the caller. These tests prove the
 * context still ARRIVES and is EVALUATED after the spec-conformance rewrite,
 * in both directions.
 *
 * On the A2A wire the gate's verdict surfaces as task state plus the full
 * gate envelope in a status-message data part:
 *   401 AUTH_REQUIRED  → TASK_STATE_AUTH_REQUIRED (interrupted, resumable)
 *   403 SCOPE_DENIED   → TASK_STATE_REJECTED      (terminal)
 * Each denial below is asserted on the gate's envelope CODE — not merely on
 * "the task failed".
 *
 * Bindings here are deliberately PERMISSIVE (`callAction` resolves for any
 * name, `getSignal` returns a value). Per the AC11b lesson in
 * `agent-service/tests/live-dispatch.test.ts`, a fixture whose invoker throws
 * makes a broken gate look enforced. Every denial asserted below is therefore
 * one only the GATE can produce.
 */

import type { AgentMetadata } from '@aihu/agent'
import type { AuthPlugin, LiveBinding, RequestContext } from '@aihu/agent-service'
import { createAgentService } from '@aihu/agent-service'
import { describe, expect, it } from 'vitest'
import { mountA2aAdapter } from '../src/index.ts'
import type { JsonRpcResponse, Task } from '../src/types.ts'

const BASE = 'http://localhost'
const TAG = 'vault-card'
const TOOL = `${TAG}/readSecret`

const META: AgentMetadata = {
  tag: TAG,
  describes: 'A scoped widget',
  actions: { readSecret: { returns: {} } },
} as AgentMetadata

/**
 * A binding whose `callAction` SUCCEEDS for any name. If a denial still comes
 * back, only the server-side gate can have produced it.
 */
function permissiveBinding(scope: string | null): LiveBinding {
  return {
    rootId: 1,
    tag: TAG,
    getSignal: () => 'readable',
    setSignal: () => {},
    callAction: async (name: string, args: unknown[]) => ({ called: name, args }),
    scope: () => scope,
    rateLimit: () => null,
    dispose$: () => true,
  }
}

/** Grants a scope iff the JWT string literally contains it. */
const authPlugin: AuthPlugin = {
  // A verify-capable plugin: any presented JWT is treated as signature-valid in
  // this fixture. The gate calls `verify` before `checkScope` — a scoped
  // transport must supply a verify-capable plugin or it fails closed with
  // AUTH_UNVERIFIABLE (#420). `sub` is the verified principal; scope is still
  // consulted via `checkScope` on the now-authenticated token.
  verify: async (jwt: string) => (jwt ? { sub: 'a2a-caller' } : null),
  checkScope: (jwt: string, scope: string) => jwt.split(' ').includes(scope),
}

function makeService(scope: string | null) {
  const registry = new Map([[TAG, [permissiveBinding(scope)]]])
  return createAgentService({
    manifests: [META],
    getRegistry: () => registry,
    authPlugin,
  })
}

/** Reads `authorization: Bearer <claims>` into a RequestContext. */
const bearerResolver = (req: Request): RequestContext => {
  const raw = req.headers.get('authorization') ?? ''
  if (!raw.startsWith('Bearer ')) return { userId: null }
  const jwt = raw.slice('Bearer '.length)
  return { userId: 'u-alice', jwt }
}

function send(headers: Record<string, string> = {}, taskId?: string): Request {
  return new Request(`${BASE}/a2a`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'SendMessage',
      params: {
        message: {
          messageId: crypto.randomUUID(),
          ...(taskId ? { taskId } : {}),
          role: 'ROLE_USER',
          parts: [{ data: { skill: TOOL, params: { id: 1 } } }],
        },
      },
    }),
  })
}

/** The gate envelope carried in the status message's data part. */
function gateEnvelope(task: Task): { error?: string; code?: number } {
  const part = task.status.message?.parts.find((p) => p.data !== undefined)
  return (part?.data ?? {}) as { error?: string; code?: number }
}

async function call(
  service: ReturnType<typeof makeService>,
  headers: Record<string, string>,
  resolveAuth?: (req: Request) => RequestContext,
): Promise<Task> {
  const adapter = mountA2aAdapter(service, resolveAuth ? { resolveAuth } : undefined)
  const res = await adapter.asMiddleware()(send(headers))
  const out = (await res?.json()) as JsonRpcResponse
  expect(out.error).toBeUndefined() // gate verdicts are task outcomes, not wire errors
  return (out.result as { task: Task }).task
}

// ── Direction 1: an authenticated request arrives WITH its context ──────────

describe('a2a tier 0 — the authenticated caller is evaluated against its context', () => {
  it('rejects a scoped tool (403 SCOPE_DENIED) when the authenticated caller lacks the scope', async () => {
    const svc = makeService('secrets:read')

    // Sanity (AC11b shape): the binding itself would have run this happily.
    const binding = permissiveBinding('secrets:read')
    await expect(binding.callAction('readSecret', [])).resolves.toEqual({
      called: 'readSecret',
      args: [],
    })

    const task = await call(svc, { authorization: 'Bearer profile:read' }, bearerResolver)

    // The GATE's envelope code — not merely "it failed".
    expect(task.status.state).toBe('TASK_STATE_REJECTED')
    const env = gateEnvelope(task)
    expect(env.code).toBe(403)
    expect(env.error).toContain('SCOPE_DENIED')
    expect(env.error).toContain('secrets:read')
  })

  it('ALLOWS the same scoped tool when the authenticated caller HAS the scope', async () => {
    // The other half of the discrimination: if the context were dropped, this
    // would land in AUTH_REQUIRED like every pre-AT1 a2a request. Passing
    // proves the context is not merely present but load-bearing.
    const svc = makeService('secrets:read')
    const task = await call(svc, { authorization: 'Bearer secrets:read' }, bearerResolver)

    expect(task.status.state).toBe('TASK_STATE_COMPLETED')
    expect(task.status.message).toBeUndefined()
  })
})

// ── Direction 2: an unauthenticated request is anonymous, not a crash ───────

describe('a2a tier 0 — an unauthenticated request is handled as anonymous', () => {
  it('carries an explicit anonymous context: a scoped tool lands in TASK_STATE_AUTH_REQUIRED (401)', async () => {
    const svc = makeService('secrets:read')
    const task = await call(svc, {}, bearerResolver)

    expect(task.status.state).toBe('TASK_STATE_AUTH_REQUIRED')
    const env = gateEnvelope(task)
    expect(env.code).toBe(401)
    expect(env.error).toContain('AUTH_REQUIRED')
  })

  it('serves an UNSCOPED tool anonymously — anonymous is a valid answer, not an error', async () => {
    const svc = makeService(null)
    const task = await call(svc, {}, bearerResolver)
    expect(task.status.state).toBe('TASK_STATE_COMPLETED')
  })

  it('with no resolveAuth configured at all, still reaches the gate as anonymous', async () => {
    // The default deployment. Tier 0 says the context must exist even when
    // nobody wired auth — the gate must have something to decide against.
    const scoped = await call(makeService('secrets:read'), {})
    expect(scoped.status.state).toBe('TASK_STATE_AUTH_REQUIRED')
    expect(gateEnvelope(scoped).code).toBe(401)

    const open = await call(makeService(null), {})
    expect(open.status.state).toBe('TASK_STATE_COMPLETED')
  })

  it('a THROWING resolver degrades to anonymous rather than 500ing the transport', async () => {
    const svc = makeService(null)
    const adapter = mountA2aAdapter(svc, {
      resolveAuth: () => {
        throw new Error('auth backend unreachable')
      },
    })
    const res = await adapter.asMiddleware()(send())

    expect(res?.status).toBe(200)
    const out = (await res?.json()) as JsonRpcResponse
    expect((out.result as { task: Task }).task.status.state).toBe('TASK_STATE_COMPLETED')
  })
})

// ── AUTH_REQUIRED is interrupted, not terminal: the caller can come back ────

describe('a2a tier 0 — an AUTH_REQUIRED task is resumable with credentials', () => {
  it('continues the SAME task to completion once the caller authenticates', async () => {
    const svc = makeService('secrets:read')
    const adapter = mountA2aAdapter(svc, { resolveAuth: bearerResolver })
    const mw = adapter.asMiddleware()

    const first = (await (await mw(send()))?.json()) as JsonRpcResponse
    const pending = (first.result as { task: Task }).task
    expect(pending.status.state).toBe('TASK_STATE_AUTH_REQUIRED')

    const second = (await (
      await mw(send({ authorization: 'Bearer secrets:read' }, pending.id))
    )?.json()) as JsonRpcResponse
    const resumed = (second.result as { task: Task }).task
    expect(resumed.id).toBe(pending.id) // same task, continued
    expect(resumed.status.state).toBe('TASK_STATE_COMPLETED')
    expect(resumed.history).toHaveLength(2)
  })
})
