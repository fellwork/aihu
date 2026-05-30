/**
 * EX-07 agent-hub — Bun API server.
 *
 * Hosts AgentService + A2A adapter + ACP adapter on port 5207.
 * The Vite dev server (port 5107) proxies /a2a, /acp, /.well-known,
 * and /__aihu to this server.
 *
 * Start with: bun --watch server.ts
 */

import { getAllAgentMetadata } from '@aihu/agent'
import { mountA2aAdapter } from '@aihu/agent-a2a'
import { mountAcpAdapter } from '@aihu/agent-acp'
import { createAgentService } from '@aihu/agent-service'

// Snapshot the registry at server start time.
const service = createAgentService({ manifests: getAllAgentMetadata() })

const a2a = mountA2aAdapter(service)
const acp = mountAcpAdapter(service)

const a2aMw = a2a.asMiddleware()
const acpMw = acp.asMiddleware()
const agentMw = service.asMiddleware()

Bun.serve({
  port: 5207,
  async fetch(req: Request): Promise<Response> {
    return (
      (await a2aMw(req)) ??
      (await acpMw(req)) ??
      (await agentMw(req)) ??
      new Response('not found', { status: 404 })
    )
  },
})

console.log('[agent-hub] API server listening on http://localhost:5207')
