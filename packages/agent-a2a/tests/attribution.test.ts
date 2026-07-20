/**
 * `@aihu/agent-a2a` — thesis §4 tier-0 attribution (slice AT1).
 *
 * "A transport that cannot express 'who is asking' has failed the thesis even
 *  if it never transacts — because the gate downstream has nothing to decide
 *  against, and the failure is invisible until someone audits it."
 *
 * Before AT1 this adapter called `service.handleToolCall(msg, params)` — two
 * args, no context. Every request through a2a was anonymous by construction,
 * so no gate verdict could ever depend on the caller. These tests prove the
 * context now ARRIVES and is EVALUATED, in both directions.
 *
 * Bindings here are deliberately PERMISSIVE (`callAction` resolves for any
 * name, `getSignal` returns a value). Per the AC11b lesson in
 * `agent-service/tests/live-dispatch.test.ts`, a fixture whose invoker throws
 * makes a broken gate look enforced. Every denial asserted below is therefore
 * one only the GATE can produce, and each is asserted on the gate's envelope
 * CODE (401/403) — not merely on "the call failed".
 */

import type { AgentMetadata } from '@aihu/agent'
import type { AuthPlugin, LiveBinding, RequestContext } from '@aihu/agent-service'
import { createAgentService } from '@aihu/agent-service'
import { describe, expect, it } from 'vitest'
import { mountA2aAdapter } from '../src/index.ts'

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

function send(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}/a2a/tasks/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

type Task = { taskId: string; status: string; error?: string; code?: number; result?: unknown }

async function call(
  service: ReturnType<typeof makeService>,
  headers: Record<string, string>,
  resolveAuth?: (req: Request) => RequestContext,
): Promise<Task> {
  const adapter = mountA2aAdapter(service, resolveAuth ? { resolveAuth } : undefined)
  const res = await adapter.asMiddleware()(send({ message: TOOL, params: { id: 1 } }, headers))
  return (await res?.json()) as Task
}

// ── Direction 1: an authenticated request arrives WITH its context ──────────

describe('a2a tier 0 — the authenticated caller is evaluated against its context', () => {
  it('denies a scoped tool with 403 SCOPE_DENIED when the authenticated caller lacks the scope', async () => {
    const svc = makeService('secrets:read')

    // Sanity (AC11b shape): the binding itself would have run this happily.
    const binding = permissiveBinding('secrets:read')
    await expect(binding.callAction('readSecret', [])).resolves.toEqual({
      called: 'readSecret',
      args: [],
    })

    const task = await call(svc, { authorization: 'Bearer profile:read' }, bearerResolver)

    // The GATE's envelope code — not merely "it failed".
    expect(task.code).toBe(403)
    expect(task.status).toBe('failed')
    expect(task.error).toContain('SCOPE_DENIED')
    expect(task.error).toContain('secrets:read')
  })

  it('ALLOWS the same scoped tool when the authenticated caller HAS the scope', async () => {
    // The other half of the discrimination: if the context were dropped, this
    // would 401 like every pre-AT1 a2a request. Passing proves the context is
    // not merely present but load-bearing in the verdict.
    const svc = makeService('secrets:read')
    const task = await call(svc, { authorization: 'Bearer secrets:read' }, bearerResolver)

    expect(task.status).toBe('completed')
    expect(task.error).toBeUndefined()
    expect(task.code).toBeUndefined()
  })
})

// ── Direction 2: an unauthenticated request is anonymous, not a crash ───────

describe('a2a tier 0 — an unauthenticated request is handled as anonymous', () => {
  it('carries an explicit anonymous context and 401s a scoped tool (no crash)', async () => {
    const svc = makeService('secrets:read')
    const task = await call(svc, {}, bearerResolver)

    expect(task.code).toBe(401)
    expect(task.status).toBe('failed')
    expect(task.error).toContain('AUTH_REQUIRED')
  })

  it('serves an UNSCOPED tool anonymously — anonymous is a valid answer, not an error', async () => {
    const svc = makeService(null)
    const task = await call(svc, {}, bearerResolver)

    expect(task.status).toBe('completed')
    expect(task.error).toBeUndefined()
  })

  it('with no resolveAuth configured at all, still reaches the gate as anonymous', async () => {
    // The default deployment. Tier 0 says the context must exist even when
    // nobody wired auth — the gate must have something to decide against.
    const scoped = await call(makeService('secrets:read'), {})
    expect(scoped.code).toBe(401)
    expect(scoped.error).toContain('AUTH_REQUIRED')

    const open = await call(makeService(null), {})
    expect(open.status).toBe('completed')
  })

  it('a THROWING resolver degrades to anonymous rather than 500ing the transport', async () => {
    const svc = makeService(null)
    const adapter = mountA2aAdapter(svc, {
      resolveAuth: () => {
        throw new Error('auth backend unreachable')
      },
    })
    const res = await adapter.asMiddleware()(send({ message: TOOL, params: null }))

    expect(res?.status).toBe(200)
    const task = (await res?.json()) as Task
    expect(task.status).toBe('completed')
  })
})
