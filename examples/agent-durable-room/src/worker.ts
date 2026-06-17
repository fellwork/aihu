/**
 * Worker entry for the agent-driven DURABLE ROOM.
 *
 * This is the server-authoritative counterpart to `create-aihu --template agent`:
 * instead of the browser being the sole executor (+ localStorage), the canonical
 * component state lives in a Durable Object. Every browser tab/device is a live
 * VIEW that hydrates + subscribes over a WebSocket; an external AI agent mutates
 * the room through a gated HTTP endpoint and the DO broadcasts to all viewers.
 *
 * Routes (everything else is served from ./dist by Workers Static Assets):
 *   GET  /ws          → WebSocket upgrade, routed to the room DO (live view)
 *   POST /agent/call  → the GATED agent surface (scope `tasks:write` + rate limit)
 *   GET  /agent/state → current room snapshot (curl-inspectable)
 */
import { TaskRoom } from './task-room'

export { TaskRoom }

export interface Env {
  TASK_ROOM: DurableObjectNamespace<TaskRoom>
  ASSETS: Fetcher
}

// One room for the demo. A real app keys the DO by room id:
// `env.TASK_ROOM.getByName(roomId)` — same id → same DO instance, anywhere.
const ROOM = 'default'

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url)
    const room = env.TASK_ROOM.getByName(ROOM)

    if (url.pathname === '/ws') {
      return room.fetch(req)
    }

    if (url.pathname === '/agent/call' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as {
        tool?: string
        params?: unknown[]
        userId?: string
        jwt?: string
      }
      const res = await room.agentCall(
        body.tool ?? '',
        body.params ?? [],
        body.userId ?? 'demo-agent',
        body.jwt ?? '',
      )
      const status = typeof res.code === 'number' && res.code >= 400 ? res.code : 200
      return Response.json(res, { status })
    }

    if (url.pathname === '/agent/state') {
      return Response.json(await room.snapshot())
    }

    // index.html + built JS — served by the assets binding.
    return env.ASSETS.fetch(req)
  },
} satisfies ExportedHandler<Env>
