/**
 * `@aihu/agent-a2a` — A2A protocol adapter.
 *
 * Implements the Agent2Agent (A2A) Protocol Specification v1.0.1
 * (https://a2a-protocol.org/v1.0.1/specification), JSON-RPC 2.0 binding:
 *
 *  GET  {prefix}/.well-known/agent-card.json — agent card (spec §4.4.1, §13)
 *  POST {prefix}/a2a                         — JSON-RPC 2.0 endpoint (spec §9)
 *
 * JSON-RPC methods (spec §9.4, PascalCase): `SendMessage`,
 * `SendStreamingMessage` (SSE), `GetTask`, `ListTasks`, `CancelTask`,
 * `SubscribeToTask`, the push-notification config methods (unsupported,
 * -32003), and `GetExtendedAgentCard` (not configured, -32007).
 *
 * Skill addressing: aihu tools are `"<tag>/<action>"`. A conformant `Message`
 * invokes one either with a data part `{ "data": { "skill": "<tag>/<action>",
 * "params": { … } } }`, or with a text part whose text is the skill id (params
 * then come from the first data part, if any).
 */
import type { AgentService, RequestContext } from '@aihu/agent-service'
import { createInMemoryTaskStore } from './task-store.ts'
import type {
  A2aAdapter,
  A2aAdapterOptions,
  Artifact,
  JsonRpcError,
  JsonRpcRequest,
  Message,
  StreamResponse,
  Task,
  TaskState,
  TaskStatus,
} from './types.ts'

/**
 * Thesis §4 tier 0: the request must carry an identity context AT ALL, even
 * when anonymous is the answer. An explicit anonymous context is what the gate
 * decides against; passing nothing leaves it with nothing to decide against
 * and makes the omission invisible to audit.
 */
const ANONYMOUS: RequestContext = { userId: null }

const APP_JSON = 'application/json'
const TERMINAL: readonly TaskState[] = [
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
  'TASK_STATE_REJECTED',
]
/** `"<tag>/<action>"` — the aihu tool id shape used as the A2A skill id. */
const SKILL_ID = /^[a-z0-9][\w-]*\/[\w-]+$/i

// ── JSON-RPC helpers (spec §9.3/§9.5, §5.4 error code mappings) ──────────────

type RpcId = string | number | null

const rpcResult = (id: RpcId, result: unknown) => ({ jsonrpc: '2.0' as const, id, result })
const rpcError = (id: RpcId, code: number, message: string, data?: unknown[]) => ({
  jsonrpc: '2.0' as const,
  id,
  error: { code, message, ...(data ? { data } : {}) } satisfies JsonRpcError,
})
const invalidParams = (id: RpcId, violations: Array<{ field: string; description: string }>) =>
  rpcError(id, -32602, 'Invalid parameters', [
    { '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: violations },
  ])

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': APP_JSON } })

// ── Message → skill invocation mapping ───────────────────────────────────────

function resolveInvocation(msg: Message): { skill: string; params: unknown } | null {
  const parts = msg.parts ?? []
  for (const p of parts) {
    const d = p.data
    if (d !== null && typeof d === 'object' && !Array.isArray(d)) {
      const rec = d as Record<string, unknown>
      if (typeof rec.skill === 'string') return { skill: rec.skill, params: rec.params ?? null }
    }
  }
  const textPart = parts.find((p) => typeof p.text === 'string' && SKILL_ID.test(p.text.trim()))
  if (textPart?.text !== undefined) {
    const dataPart = parts.find((p) => p.data !== undefined)
    return { skill: textPart.text.trim(), params: dataPart?.data ?? null }
  }
  return null
}

export function mountA2aAdapter(service: AgentService, options?: A2aAdapterOptions): A2aAdapter {
  const prefix = options?.prefix ?? ''
  const rpcPath = `${prefix}/a2a`
  const cardPath = `${prefix}/.well-known/agent-card.json`
  const store = options?.taskStore ?? createInMemoryTaskStore()

  /**
   * Build the `RequestContext` for an inbound HTTP request. Mirrors
   * `agent-service.asMiddleware()`'s resolver call rather than inventing a
   * second derivation. A throwing resolver degrades to anonymous — a broken
   * auth backend must not 500 the transport, and anonymous still fails closed
   * on any scoped binding.
   */
  const contextFor = async (req: Request): Promise<RequestContext> => {
    if (!options?.resolveAuth) return ANONYMOUS
    try {
      return (await options.resolveAuth(req)) ?? ANONYMOUS
    } catch {
      return ANONYMOUS
    }
  }

  const now = () => new Date().toISOString()
  const status = (state: TaskState, message?: Message): TaskStatus => ({
    state,
    ...(message ? { message } : {}),
    timestamp: now(),
  })
  const agentMessage = (parts: Message['parts']): Message => ({
    messageId: crypto.randomUUID(),
    role: 'ROLE_AGENT',
    parts,
  })

  function agentCard() {
    return {
      name: options?.name ?? 'aihu-agent-service',
      description: options?.description ?? 'Aihu agent service',
      version: options?.version ?? '1.0.0',
      supportedInterfaces: [
        { url: options?.url ?? rpcPath, protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
      ],
      capabilities: { streaming: true, pushNotifications: false, extendedAgentCard: false },
      defaultInputModes: [APP_JSON],
      defaultOutputModes: [APP_JSON],
      skills: service.getManifest().tools.flatMap((t) =>
        Object.entries(t.actions ?? {}).map(([a, schema]) => ({
          id: `${t.tag}/${a}`,
          name: a,
          description: schema.describe ?? `Invoke the \`${a}\` action on \`${t.tag}\`.`,
          tags: [t.tag],
        })),
      ),
    }
  }

  /**
   * Run one message through the gate + dispatcher and return the terminal
   * pieces of the task. The gate's verdict travels with the failure: the full
   * `{ error, code, jsonrpc }` envelope rides in a data part of the status
   * message, and the code picks the A2A state (401 AUTH_REQUIRED →
   * `TASK_STATE_AUTH_REQUIRED`, 403 SCOPE_DENIED → `TASK_STATE_REJECTED`).
   * Without it a caller (and any audit) could not distinguish the verdicts at
   * the transport boundary.
   */
  async function dispatch(
    msg: Message,
    ctx: RequestContext,
  ): Promise<{ state: TaskState; statusMessage?: Message; artifact?: Artifact }> {
    const invocation = resolveInvocation(msg)
    if (!invocation) {
      return {
        state: 'TASK_STATE_REJECTED',
        statusMessage: agentMessage([
          {
            text:
              'No skill addressed. Send a data part { "skill": "<tag>/<action>", "params": { … } } ' +
              'or a text part containing the skill id.',
          },
        ]),
      }
    }
    let out: unknown
    try {
      out = await service.handleToolCall(invocation.skill, invocation.params, ctx)
    } catch (err) {
      return {
        state: 'TASK_STATE_FAILED',
        statusMessage: agentMessage([{ text: err instanceof Error ? err.message : String(err) }]),
      }
    }
    const envelope = out as { error?: string; code?: number; result?: unknown }
    if (envelope?.error !== undefined) {
      const state: TaskState =
        envelope.code === 401
          ? 'TASK_STATE_AUTH_REQUIRED'
          : envelope.code === 403
            ? 'TASK_STATE_REJECTED'
            : 'TASK_STATE_FAILED'
      return {
        state,
        statusMessage: agentMessage([{ text: envelope.error }, { data: envelope }]),
      }
    }
    return {
      state: 'TASK_STATE_COMPLETED',
      artifact: {
        artifactId: crypto.randomUUID(),
        name: 'result',
        parts: [{ data: envelope?.result ?? null }],
      },
    }
  }

  /** Validate `SendMessage` params; returns violations for -32602. */
  function messageViolations(params: unknown): Array<{ field: string; description: string }> {
    const v: Array<{ field: string; description: string }> = []
    const msg = (params as { message?: Message } | undefined)?.message
    if (!msg || typeof msg !== 'object') {
      v.push({ field: 'message', description: 'A Message object is required' })
      return v
    }
    if (typeof msg.messageId !== 'string' || msg.messageId === '')
      v.push({ field: 'message.messageId', description: 'messageId is required' })
    if (typeof msg.role !== 'string')
      v.push({ field: 'message.role', description: 'role is required' })
    if (!Array.isArray(msg.parts) || msg.parts.length === 0)
      v.push({ field: 'message.parts', description: 'At least one part is required' })
    return v
  }

  type SendTarget =
    | { task: Task; error?: undefined }
    | { task?: undefined; error: ReturnType<typeof rpcError> }

  /** Resolve the task a message belongs to: continue a live one or open one. */
  async function targetTask(id: RpcId, msg: Message): Promise<SendTarget> {
    if (msg.taskId) {
      const existing = await store.get(msg.taskId)
      if (!existing) return { error: rpcError(id, -32001, 'Task not found') }
      if (TERMINAL.includes(existing.status.state)) {
        return { error: rpcError(id, -32004, 'Task is in a terminal state') }
      }
      return { task: existing }
    }
    return {
      task: {
        id: crypto.randomUUID(),
        contextId: msg.contextId ?? crypto.randomUUID(),
        status: status('TASK_STATE_SUBMITTED'),
        history: [],
      },
    }
  }

  async function handleRpc(req: Request, rpc: JsonRpcRequest): Promise<Response> {
    const id: RpcId = rpc.id ?? null
    switch (rpc.method) {
      case 'SendMessage': {
        const violations = messageViolations(rpc.params)
        if (violations.length > 0) return json(invalidParams(id, violations))
        const msg = (rpc.params as { message: Message }).message
        const target = await targetTask(id, msg)
        if (target.error) return json(target.error)
        const task = target.task
        task.history = [...(task.history ?? []), msg]
        const ctx = await contextFor(req)
        const outcome = await dispatch(msg, ctx)
        task.status = status(outcome.state, outcome.statusMessage)
        if (outcome.artifact) task.artifacts = [...(task.artifacts ?? []), outcome.artifact]
        await store.save(task)
        return json(rpcResult(id, { task }))
      }

      case 'SendStreamingMessage': {
        const violations = messageViolations(rpc.params)
        if (violations.length > 0) return json(invalidParams(id, violations))
        const msg = (rpc.params as { message: Message }).message
        const target = await targetTask(id, msg)
        if (target.error) return json(target.error)
        const task = target.task
        task.history = [...(task.history ?? []), msg]
        const ctx = await contextFor(req)
        const taskId = task.id
        const contextId = task.contextId ?? ''
        const encoder = new TextEncoder()
        // Real SSE: each frame is a full JSON-RPC response wrapping a
        // StreamResponse (spec §9.4.2); frames are emitted as the task
        // actually advances, and the stream closes on the terminal state —
        // terminality is the state itself, not a sentinel.
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const frame = (payload: StreamResponse) =>
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(rpcResult(id, payload))}\n\n`),
              )
            frame({ task })
            task.status = status('TASK_STATE_WORKING')
            await store.save(task)
            frame({ statusUpdate: { taskId, contextId, status: task.status } })
            const outcome = await dispatch(msg, ctx)
            if (outcome.artifact) {
              task.artifacts = [...(task.artifacts ?? []), outcome.artifact]
              frame({
                artifactUpdate: { taskId, contextId, artifact: outcome.artifact, lastChunk: true },
              })
            }
            task.status = status(outcome.state, outcome.statusMessage)
            await store.save(task)
            frame({ statusUpdate: { taskId, contextId, status: task.status } })
            controller.close()
          },
        })
        return new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        })
      }

      case 'GetTask': {
        const p = rpc.params as { id?: string; historyLength?: number } | undefined
        if (typeof p?.id !== 'string')
          return json(invalidParams(id, [{ field: 'id', description: 'Task id is required' }]))
        const task = await store.get(p.id)
        if (!task) return json(rpcError(id, -32001, 'Task not found'))
        if (typeof p.historyLength === 'number' && p.historyLength >= 0) {
          const history = p.historyLength === 0 ? [] : (task.history ?? []).slice(-p.historyLength)
          return json(rpcResult(id, { ...task, history }))
        }
        return json(rpcResult(id, task))
      }

      case 'ListTasks': {
        const p = rpc.params as
          | { contextId?: string; status?: TaskState; pageSize?: number }
          | undefined
        let tasks = (await store.list()).reverse()
        if (p?.contextId) tasks = tasks.filter((t) => t.contextId === p.contextId)
        if (p?.status) tasks = tasks.filter((t) => t.status.state === p.status)
        tasks = tasks.slice(0, p?.pageSize ?? 50)
        return json(rpcResult(id, { tasks, nextPageToken: '' }))
      }

      case 'CancelTask': {
        const p = rpc.params as { id?: string } | undefined
        if (typeof p?.id !== 'string')
          return json(invalidParams(id, [{ field: 'id', description: 'Task id is required' }]))
        const task = await store.get(p.id)
        if (!task) return json(rpcError(id, -32001, 'Task not found'))
        if (TERMINAL.includes(task.status.state))
          return json(rpcError(id, -32002, 'Task cannot be canceled'))
        task.status = status('TASK_STATE_CANCELED')
        await store.save(task)
        return json(rpcResult(id, { task }))
      }

      case 'SubscribeToTask': {
        const p = rpc.params as { id?: string } | undefined
        if (typeof p?.id !== 'string')
          return json(invalidParams(id, [{ field: 'id', description: 'Task id is required' }]))
        const task = await store.get(p.id)
        if (!task) return json(rpcError(id, -32001, 'Task not found'))
        if (TERMINAL.includes(task.status.state))
          return json(rpcError(id, -32004, 'Task is in a terminal state'))
        // No background execution model: replay the current status and close.
        const body = `data: ${JSON.stringify(rpcResult(id, { statusUpdate: { taskId: task.id, contextId: task.contextId ?? '', status: task.status } }))}\n\n`
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        })
      }

      case 'CreateTaskPushNotificationConfig':
      case 'GetTaskPushNotificationConfig':
      case 'ListTaskPushNotificationConfigs':
      case 'DeleteTaskPushNotificationConfig':
        return json(rpcError(id, -32003, 'Push notifications are not supported'))

      case 'GetExtendedAgentCard':
        return json(rpcError(id, -32007, 'Extended agent card is not configured'))

      default:
        return json(rpcError(id, -32601, 'Method not found'))
    }
  }

  return {
    asMiddleware() {
      return async (req: Request): Promise<Response | null> => {
        const path = new URL(req.url).pathname

        if (req.method === 'GET' && path === cardPath) return json(agentCard())
        if (req.method !== 'POST' || path !== rpcPath) return null

        let body: unknown
        try {
          body = await req.json()
        } catch {
          return json(rpcError(null, -32700, 'Invalid JSON payload'))
        }
        const rpc = body as JsonRpcRequest
        if (
          rpc === null ||
          typeof rpc !== 'object' ||
          rpc.jsonrpc !== '2.0' ||
          typeof rpc.method !== 'string'
        ) {
          return json(rpcError(null, -32600, 'Request payload validation error'))
        }
        return handleRpc(req, rpc)
      }
    },
  }
}
