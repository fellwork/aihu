/**
 * TaskRoom — the Durable Object that owns the canonical, shared task-list state.
 *
 *   AGENT  --POST /agent/call--> Worker --RPC agentCall()--> TaskRoom (the gate:
 *                                                            404 → 403 → 429)
 *   BROWSER --ws /ws--> Worker --fetch()--> TaskRoom (hibernatable WebSocket)
 *
 * The DO is the single source of truth: it applies every mutation (from a human's
 * UI intent over the socket, or an agent's gated call), persists to DO storage
 * (survives eviction/restart), then broadcasts the new snapshot to ALL connected
 * sockets — so every viewer updates live and a refresh re-hydrates from storage.
 */
import { DurableObject } from 'cloudflare:workers'
import type { Env } from './worker'

interface Task {
  id: number
  text: string
}
interface RoomState {
  tasks: Task[]
  nextId: number
  label: string
  variant: string
}

const DEFAULT_STATE: RoomState = { tasks: [], nextId: 1, label: 'Tasks', variant: 'default' }
const ACTIONS = ['addTask', 'clearTasks', 'setLabel', 'setVariant'] as const
const VARIANTS = ['default', 'compact', 'danger']
const RATE_MAX = 5
const RATE_WINDOW_MS = 60_000

export interface AgentResult {
  result?: unknown
  error?: string
  code?: number
}

export class TaskRoom extends DurableObject<Env> {
  private state: RoomState = structuredClone(DEFAULT_STATE)
  // Per-user rate counter. In-memory (per live DO instance) — fine for a demo;
  // a production gate would persist this. Resets if the DO is evicted.
  private rate = new Map<string, { n: number; resetAt: number }>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Restore canonical state before the DO handles any request.
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<RoomState>('state')) ?? structuredClone(DEFAULT_STATE)
    })
  }

  // WebSocket upgrade (Hibernation API) — each connected browser is a live view.
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 })
    }
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    // Hydrate the new viewer with the current snapshot immediately.
    server.send(JSON.stringify({ type: 'state', state: this.state }))
    return new Response(null, { status: 101, webSocket: client })
  }

  // User UI intents from a connected browser. Ungated — it's the user's own
  // session driving their own UI (the same way the human types in the template).
  async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return
    let msg: { type?: string; arg?: unknown }
    try {
      msg = JSON.parse(message)
    } catch {
      return
    }
    if (typeof msg.type === 'string') await this.applyAction(msg.type, msg.arg)
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code, 'closing')
    } catch {
      /* already closing */
    }
  }

  async webSocketError(): Promise<void> {
    /* connection dropped — getWebSockets() no longer returns it */
  }

  // The GATED agent surface (the inverse of the browser-executor bridge): the
  // policy authority lives here. 404 unknown tool → 403 missing scope → 429 rate.
  async agentCall(
    tool: string,
    params: unknown[],
    userId: string,
    jwt: string,
  ): Promise<AgentResult> {
    const action = tool.startsWith('task-list/') ? tool.slice('task-list/'.length) : tool
    if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
      return { error: `NOT_FOUND: no action '${tool}'`, code: 404 }
    }
    if (
      !jwt
        .split(',')
        .map((s) => s.trim())
        .includes('tasks:write')
    ) {
      return { error: "SCOPE_DENIED: JWT lacks required scope 'tasks:write'", code: 403 }
    }
    const now = Date.now()
    const r = this.rate.get(userId)
    if (!r || now > r.resetAt) {
      this.rate.set(userId, { n: 1, resetAt: now + RATE_WINDOW_MS })
    } else if (++r.n > RATE_MAX) {
      return { error: `RATE_LIMITED: quota exhausted for ${userId}`, code: 429 }
    }
    await this.applyAction(action, params?.[0])
    return { result: null }
  }

  // Current snapshot — curl-inspectable via GET /agent/state.
  async snapshot(): Promise<RoomState> {
    return this.state
  }

  // Mutate → persist (first) → broadcast (second), so storage is the source of
  // truth and no viewer ever sees state that wasn't durably written.
  private async applyAction(type: string, arg: unknown): Promise<void> {
    switch (type) {
      case 'addTask': {
        const text = String(arg ?? '').trim()
        if (!text) return
        this.state.tasks = [...this.state.tasks, { id: this.state.nextId, text }]
        this.state.nextId++
        break
      }
      case 'clearTasks':
        this.state.tasks = []
        break
      case 'setLabel':
        this.state.label = typeof arg === 'string' && arg ? arg : 'Tasks'
        break
      case 'setVariant':
        this.state.variant = VARIANTS.includes(String(arg)) ? String(arg) : 'default'
        break
      default:
        return
    }
    await this.ctx.storage.put('state', this.state)
    const msg = JSON.stringify({ type: 'state', state: this.state })
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg)
      } catch {
        /* socket closing */
      }
    }
  }
}
