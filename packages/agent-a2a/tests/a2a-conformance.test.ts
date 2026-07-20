/**
 * `@aihu/agent-a2a` — A2A spec conformance tests.
 *
 * Every assertion here is grounded in the Agent2Agent (A2A) Protocol
 * Specification v1.0.1 (https://a2a-protocol.org/v1.0.1/specification),
 * JSON-RPC 2.0 binding. Section references are cited per describe block.
 * These replace the deleted invented-shape tests, which validated the shim's
 * own divergence from the spec (issue #428).
 *
 * Fixture requests are written as the full JSON-RPC envelopes a conformant
 * A2A client would send — not as calls into adapter internals.
 */

import type { AgentMetadata } from '@aihu/agent'
import type { LiveBinding } from '@aihu/agent-service'
import { createAgentService } from '@aihu/agent-service'
import { describe, expect, it } from 'vitest'
import { createInMemoryTaskStore, mountA2aAdapter } from '../src/index.ts'
import type { JsonRpcResponse, Task, TaskStore } from '../src/types.ts'

const BASE = 'http://localhost'

const META: AgentMetadata = {
  tag: 'x-greeter',
  describes: 'A greeting widget',
  actions: {
    greet: { returns: { message: { type: 'string' } }, describe: 'Say hello' },
    reset: { returns: {} },
  },
}

function liveBinding(tag: string): LiveBinding {
  return {
    rootId: 1,
    tag,
    getSignal: () => undefined,
    setSignal: () => {},
    callAction: async (name: string, args: unknown[]) => ({ called: name, args }),
    scope: () => null,
    rateLimit: () => null,
    dispose$: () => true,
  }
}

function makeAdapter(opts?: Parameters<typeof mountA2aAdapter>[1]) {
  const registry = new Map([['x-greeter', [liveBinding('x-greeter')]]])
  const service = createAgentService({ manifests: [META], getRegistry: () => registry })
  return mountA2aAdapter(service, opts)
}

function rpcRequest(body: unknown, path = '/a2a'): Request {
  return new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** A spec-shaped SendMessage envelope (spec §9.4.1) with a data-part skill. */
function sendMessageFixture(id: string | number, skill = 'x-greeter/greet', params?: unknown) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'SendMessage',
    params: {
      message: {
        messageId: crypto.randomUUID(),
        role: 'ROLE_USER',
        parts: [{ data: { skill, ...(params === undefined ? {} : { params }) } }],
      },
    },
  }
}

async function rpc(mw: (req: Request) => Promise<Response | null>, body: unknown) {
  const res = await mw(rpcRequest(body))
  expect(res).not.toBeNull()
  expect(res?.status).toBe(200)
  return (await res?.json()) as JsonRpcResponse
}

/** Parse SSE text into the JSON-RPC frames it carries (spec §9.4.2). */
function sseFrames(text: string): JsonRpcResponse[] {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)) as JsonRpcResponse)
}

// ── Agent card (spec §4.4.1; well-known URI, spec §13) ───────────────────────

describe('agent card — /.well-known/agent-card.json', () => {
  it('serves the card at the spec well-known path, not the legacy agent.json', async () => {
    const mw = makeAdapter().asMiddleware()
    const res = await mw(new Request(`${BASE}/.well-known/agent-card.json`))
    expect(res?.status).toBe(200)
    // Pre-v0.2 legacy path must be gone (breaking change, semver-major).
    expect(await mw(new Request(`${BASE}/.well-known/agent.json`))).toBeNull()
  })

  it('carries every AgentCard REQUIRED field (spec §4.4.1)', async () => {
    const mw = makeAdapter({
      name: 'my-agent',
      url: 'https://agent.example.com/a2a',
    }).asMiddleware()
    const res = await mw(new Request(`${BASE}/.well-known/agent-card.json`))
    const card = (await res?.json()) as Record<string, unknown>
    expect(card.name).toBe('my-agent')
    expect(typeof card.description).toBe('string')
    expect(typeof card.version).toBe('string')
    expect(Array.isArray(card.defaultInputModes)).toBe(true)
    expect(Array.isArray(card.defaultOutputModes)).toBe(true)
    expect(Array.isArray(card.skills)).toBe(true)
    // supportedInterfaces is REQUIRED; first entry is the preferred interface.
    const iface = (card.supportedInterfaces as Array<Record<string, unknown>>)[0]
    expect(iface?.url).toBe('https://agent.example.com/a2a')
    expect(iface?.protocolBinding).toBe('JSONRPC')
    expect(iface?.protocolVersion).toBe('1.0')
  })

  it('declares real capabilities: streaming true, pushNotifications false', async () => {
    const mw = makeAdapter().asMiddleware()
    const res = await mw(new Request(`${BASE}/.well-known/agent-card.json`))
    const card = (await res?.json()) as { capabilities: Record<string, unknown> }
    expect(card.capabilities.streaming).toBe(true)
    expect(card.capabilities.pushNotifications).toBe(false)
  })

  it('builds AgentSkills from the manifest with REQUIRED id/name/description/tags (spec §4.4.5)', async () => {
    const mw = makeAdapter().asMiddleware()
    const res = await mw(new Request(`${BASE}/.well-known/agent-card.json`))
    const card = (await res?.json()) as {
      skills: Array<{ id: string; name: string; description: string; tags: string[] }>
    }
    expect(card.skills).toHaveLength(2)
    const greet = card.skills.find((s) => s.id === 'x-greeter/greet')
    expect(greet?.name).toBe('greet')
    expect(greet?.description).toBe('Say hello') // from the action's describe:
    expect(greet?.tags).toEqual(['x-greeter'])
    const reset = card.skills.find((s) => s.id === 'x-greeter/reset')
    expect(typeof reset?.description).toBe('string') // REQUIRED even when underived
    expect(reset?.description.length).toBeGreaterThan(0)
  })
})

// ── JSON-RPC 2.0 envelope (spec §9.3, §9.5) ──────────────────────────────────

describe('JSON-RPC envelope', () => {
  it('returns -32700 JSONParseError for invalid JSON', async () => {
    const mw = makeAdapter().asMiddleware()
    const out = (await (await mw(rpcRequest('not-json{{{')))?.json()) as JsonRpcResponse
    expect(out.jsonrpc).toBe('2.0')
    expect(out.error?.code).toBe(-32700)
  })

  it('returns -32600 InvalidRequestError for a non-JSON-RPC payload', async () => {
    const mw = makeAdapter().asMiddleware()
    // The old shim's whole wire format is now an invalid request.
    const out = await rpc(mw, { taskId: 't1', message: 'x-greeter/greet', params: {} })
    expect(out.error?.code).toBe(-32600)
  })

  it('returns -32601 MethodNotFoundError for unknown methods', async () => {
    const mw = makeAdapter().asMiddleware()
    const out = await rpc(mw, { jsonrpc: '2.0', id: 9, method: 'tasks/send' })
    expect(out.error?.code).toBe(-32601)
    expect(out.id).toBe(9)
  })

  it('returns -32602 InvalidParamsError with @type-tagged BadRequest data (spec §9.5)', async () => {
    const mw = makeAdapter().asMiddleware()
    const out = await rpc(mw, {
      jsonrpc: '2.0',
      id: 3,
      method: 'SendMessage',
      params: { message: { messageId: 'm1', role: 'ROLE_USER', parts: [] } },
    })
    expect(out.error?.code).toBe(-32602)
    const detail = (out.error?.data as Array<Record<string, unknown>>)[0]
    expect(detail?.['@type']).toBe('type.googleapis.com/google.rpc.BadRequest')
    expect(JSON.stringify(detail)).toContain('message.parts')
  })

  it('echoes the request id on success responses', async () => {
    const mw = makeAdapter().asMiddleware()
    const out = await rpc(mw, sendMessageFixture('req-42'))
    expect(out.id).toBe('req-42')
    expect(out.error).toBeUndefined()
  })
})

// ── SendMessage (spec §9.4.1, §3.1.1) ────────────────────────────────────────

describe('SendMessage', () => {
  it('returns a SendMessageResponse task with TASK_STATE_COMPLETED and a result artifact', async () => {
    const mw = makeAdapter().asMiddleware()
    const out = await rpc(mw, sendMessageFixture(1, 'x-greeter/greet', { name: 'world' }))
    const task = (out.result as { task: Task }).task
    expect(typeof task.id).toBe('string')
    expect(typeof task.contextId).toBe('string')
    expect(task.status.state).toBe('TASK_STATE_COMPLETED')
    expect(task.status.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/) // ISO 8601 (spec §5.6.1)
    // The dispatch result rides in an artifact data part (spec §4.1.7).
    const part = task.artifacts?.[0]?.parts[0]
    expect(part?.data).toEqual({ called: 'greet', args: [{ name: 'world' }] })
    // The inbound message is recorded as task history.
    expect(task.history).toHaveLength(1)
    expect(task.history?.[0]?.role).toBe('ROLE_USER')
  })

  it('accepts a text-part skill id with params from a data part', async () => {
    const mw = makeAdapter().asMiddleware()
    const out = await rpc(mw, {
      jsonrpc: '2.0',
      id: 2,
      method: 'SendMessage',
      params: {
        message: {
          messageId: 'm-2',
          role: 'ROLE_USER',
          parts: [{ text: 'x-greeter/greet' }, { data: { city: 'Seoul' } }],
        },
      },
    })
    const task = (out.result as { task: Task }).task
    expect(task.status.state).toBe('TASK_STATE_COMPLETED')
    expect(task.artifacts?.[0]?.parts[0]?.data).toEqual({
      called: 'greet',
      args: [{ city: 'Seoul' }],
    })
  })

  it('rejects (TASK_STATE_REJECTED) a valid Message that addresses no skill', async () => {
    const mw = makeAdapter().asMiddleware()
    const out = await rpc(mw, {
      jsonrpc: '2.0',
      id: 4,
      method: 'SendMessage',
      params: {
        message: {
          messageId: 'm-4',
          role: 'ROLE_USER',
          parts: [{ text: 'please do something nice' }],
        },
      },
    })
    // A conforming Message must NOT be a wire error (the old shim 400ed it) —
    // the agent answers with a rejected task that explains the addressing.
    expect(out.error).toBeUndefined()
    const task = (out.result as { task: Task }).task
    expect(task.status.state).toBe('TASK_STATE_REJECTED')
    expect(task.status.message?.parts[0]?.text).toContain('skill')
  })

  it('fails the task (not the wire) for an unknown skill', async () => {
    const mw = makeAdapter().asMiddleware()
    const out = await rpc(mw, sendMessageFixture(5, 'x-unknown/do-something'))
    const task = (out.result as { task: Task }).task
    expect(task.status.state).toBe('TASK_STATE_FAILED')
    // The gate envelope (error + code) is auditable in the status message.
    const dataPart = task.status.message?.parts.find((p) => p.data !== undefined)
    expect((dataPart?.data as { code?: number })?.code).toBe(404)
  })

  it('continues a non-terminal task addressed via message.taskId, and refuses a terminal one (-32004)', async () => {
    const mw = makeAdapter().asMiddleware()
    const first = await rpc(mw, sendMessageFixture(6))
    const done = (first.result as { task: Task }).task
    expect(done.status.state).toBe('TASK_STATE_COMPLETED')
    const followUp = sendMessageFixture(7)
    ;(followUp.params.message as { taskId?: string }).taskId = done.id
    const out = await rpc(mw, followUp)
    expect(out.error?.code).toBe(-32004)
  })
})

// ── GetTask / ListTasks / CancelTask (spec §9.4.3–9.4.5) ─────────────────────

describe('task store methods', () => {
  it('GetTask returns the persisted task; unknown id is -32001 TaskNotFoundError', async () => {
    const mw = makeAdapter().asMiddleware()
    const sent = await rpc(mw, sendMessageFixture(1))
    const taskId = (sent.result as { task: Task }).task.id

    const got = await rpc(mw, { jsonrpc: '2.0', id: 2, method: 'GetTask', params: { id: taskId } })
    expect((got.result as Task).id).toBe(taskId)
    expect((got.result as Task).status.state).toBe('TASK_STATE_COMPLETED')

    const missing = await rpc(mw, {
      jsonrpc: '2.0',
      id: 3,
      method: 'GetTask',
      params: { id: 'nope' },
    })
    expect(missing.error?.code).toBe(-32001)
    expect(missing.error?.message).toBe('Task not found')
  })

  it('GetTask honors historyLength (spec §3.2.4: 0 means no messages)', async () => {
    const mw = makeAdapter().asMiddleware()
    const sent = await rpc(mw, sendMessageFixture(1))
    const taskId = (sent.result as { task: Task }).task.id
    const none = await rpc(mw, {
      jsonrpc: '2.0',
      id: 2,
      method: 'GetTask',
      params: { id: taskId, historyLength: 0 },
    })
    expect((none.result as Task).history).toEqual([])
  })

  it('ListTasks pages stored tasks and filters by contextId', async () => {
    const mw = makeAdapter().asMiddleware()
    const a = await rpc(mw, sendMessageFixture(1))
    await rpc(mw, sendMessageFixture(2))
    const ctx = (a.result as { task: Task }).task.contextId
    const all = await rpc(mw, { jsonrpc: '2.0', id: 3, method: 'ListTasks', params: {} })
    expect((all.result as { tasks: Task[] }).tasks).toHaveLength(2)
    const filtered = await rpc(mw, {
      jsonrpc: '2.0',
      id: 4,
      method: 'ListTasks',
      params: { contextId: ctx },
    })
    expect((filtered.result as { tasks: Task[] }).tasks).toHaveLength(1)
  })

  it('CancelTask on a terminal task is -32002 TaskNotCancelableError; unknown id is -32001', async () => {
    const mw = makeAdapter().asMiddleware()
    const sent = await rpc(mw, sendMessageFixture(1))
    const taskId = (sent.result as { task: Task }).task.id
    const cancel = await rpc(mw, {
      jsonrpc: '2.0',
      id: 2,
      method: 'CancelTask',
      params: { id: taskId },
    })
    expect(cancel.error?.code).toBe(-32002)
    const missing = await rpc(mw, {
      jsonrpc: '2.0',
      id: 3,
      method: 'CancelTask',
      params: { id: 'nope' },
    })
    expect(missing.error?.code).toBe(-32001)
  })

  it('accepts an injected TaskStore implementation', async () => {
    const saved: Task[] = []
    const backing = createInMemoryTaskStore()
    const spyStore: TaskStore = {
      get: (id) => backing.get(id),
      save: (t) => {
        saved.push(t)
        return backing.save(t)
      },
      list: () => backing.list(),
    }
    const mw = makeAdapter({ taskStore: spyStore }).asMiddleware()
    await rpc(mw, sendMessageFixture(1))
    expect(saved.length).toBeGreaterThan(0)
  })
})

// ── SendStreamingMessage (spec §9.4.2, §3.5.2) ───────────────────────────────

describe('SendStreamingMessage', () => {
  it('streams JSON-RPC-wrapped StreamResponse frames over SSE, no [DONE] sentinel', async () => {
    const mw = makeAdapter().asMiddleware()
    const fixture = { ...sendMessageFixture('s-1'), method: 'SendStreamingMessage' }
    const res = await mw(rpcRequest(fixture))
    expect(res?.headers.get('content-type')).toBe('text/event-stream')
    const text = (await res?.text()) ?? ''
    expect(text).not.toContain('[DONE]') // OpenAI convention, not A2A

    const frames = sseFrames(text)
    expect(frames.length).toBeGreaterThanOrEqual(3)
    for (const f of frames) {
      expect(f.jsonrpc).toBe('2.0') // every frame is a full JSON-RPC response
      expect(f.id).toBe('s-1')
    }
    // Frame 1: the submitted Task snapshot.
    const first = frames[0]?.result as { task?: Task }
    expect(first.task?.status.state).toBe('TASK_STATE_SUBMITTED')
    // Then a working status update.
    const working = frames[1]?.result as { statusUpdate?: { status: { state: string } } }
    expect(working.statusUpdate?.status.state).toBe('TASK_STATE_WORKING')
    // An artifact update carries the result before the terminal status.
    const artifactFrame = frames
      .map(
        (f) => f.result as { artifactUpdate?: { artifact: { parts: Array<{ data?: unknown }> } } },
      )
      .find((r) => r.artifactUpdate)
    expect(artifactFrame?.artifactUpdate?.artifact.parts[0]?.data).toEqual({
      called: 'greet',
      args: [],
    })
    // The last frame is the terminal state — terminality IS the state.
    const last = frames.at(-1)?.result as { statusUpdate?: { status: { state: string } } }
    expect(last.statusUpdate?.status.state).toBe('TASK_STATE_COMPLETED')
  })

  it('the streamed task is retrievable afterwards via GetTask', async () => {
    const mw = makeAdapter().asMiddleware()
    const fixture = { ...sendMessageFixture('s-2'), method: 'SendStreamingMessage' }
    const res = await mw(rpcRequest(fixture))
    const frames = sseFrames((await res?.text()) ?? '')
    const taskId = (frames[0]?.result as { task: Task }).task.id
    const got = await rpc(mw, { jsonrpc: '2.0', id: 1, method: 'GetTask', params: { id: taskId } })
    expect((got.result as Task).status.state).toBe('TASK_STATE_COMPLETED')
  })
})

// ── Unsupported optional operations (spec §5.4 error mappings) ───────────────

describe('optional operations answer with their mapped spec errors', () => {
  it.each([
    ['CreateTaskPushNotificationConfig', -32003],
    ['GetTaskPushNotificationConfig', -32003],
    ['ListTaskPushNotificationConfigs', -32003],
    ['DeleteTaskPushNotificationConfig', -32003],
    ['GetExtendedAgentCard', -32007],
  ])('%s → %i', async (method, code) => {
    const mw = makeAdapter().asMiddleware()
    const out = await rpc(mw, { jsonrpc: '2.0', id: 1, method, params: {} })
    expect(out.error?.code).toBe(code)
  })

  it('SubscribeToTask on a terminal task is -32004 UnsupportedOperationError (spec §9.4.6)', async () => {
    const mw = makeAdapter().asMiddleware()
    const sent = await rpc(mw, sendMessageFixture(1))
    const taskId = (sent.result as { task: Task }).task.id
    const out = await rpc(mw, {
      jsonrpc: '2.0',
      id: 2,
      method: 'SubscribeToTask',
      params: { id: taskId },
    })
    expect(out.error?.code).toBe(-32004)
  })
})

// ── Routing ──────────────────────────────────────────────────────────────────

describe('routing and prefix', () => {
  it('passes through (null) for paths it does not own, including the legacy REST paths', async () => {
    const mw = makeAdapter().asMiddleware()
    expect(await mw(new Request(`${BASE}/some/other/path`))).toBeNull()
    expect(await mw(rpcRequest({}, '/a2a/tasks/send'))).toBeNull()
    expect(await mw(rpcRequest({}, '/a2a/tasks/sendSubscribe'))).toBeNull()
  })

  it('honors a custom prefix for both the card and the RPC endpoint', async () => {
    const mw = makeAdapter({ prefix: '/api/v1' }).asMiddleware()
    const card = await mw(new Request(`${BASE}/api/v1/.well-known/agent-card.json`))
    expect(card?.status).toBe(200)
    const out = await mw(rpcRequest(sendMessageFixture(1), '/api/v1/a2a'))
    expect(out?.status).toBe(200)
    expect(await mw(new Request(`${BASE}/.well-known/agent-card.json`))).toBeNull()
    expect(await mw(rpcRequest(sendMessageFixture(2), '/a2a'))).toBeNull()
  })
})
