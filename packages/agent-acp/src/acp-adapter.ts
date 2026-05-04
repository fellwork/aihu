/**
 * `@scribe/agent-acp` — ACP adapter implementation (Plan 5.3).
 *
 * Exposes two routes:
 *  GET  {prefix}/.well-known/acp-agent  — agent discovery card
 *  POST {prefix}/acp/messages           — ACP message routing
 */
import type { AgentService } from '@scribe/agent-service'
import type { AcpAdapter, AcpAdapterOptions, AcpMessage } from './types.ts'

export function mountAcpAdapter(service: AgentService, options?: AcpAdapterOptions): AcpAdapter {
  const prefix = options?.prefix ?? ''
  const agentId = options?.agentId ?? 'scribe-agent-service'
  const cardPath = `${prefix}/.well-known/acp-agent`
  const msgPath = `${prefix}/acp/messages`
  const headers = { 'content-type': 'application/json' }

  const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers })
  const acpMsg = (content: string, parts: unknown[] = []) =>
    reply({ role: 'agent', content, parts })

  return {
    asMiddleware() {
      return async (req: Request): Promise<Response | null> => {
        const path = new URL(req.url).pathname

        if (req.method === 'GET' && path === cardPath) {
          return reply({
            agent_id: agentId,
            description: 'Scribe ACP agent',
            skills: service.getManifest().tools.flatMap((t) =>
              Object.keys(t.actions ?? {}).map((a) => ({
                skill_id: `${t.tag}/${a}`,
                name: a,
              })),
            ),
          })
        }

        if (req.method === 'POST' && path === msgPath) {
          let msg: AcpMessage
          try {
            msg = (await req.json()) as AcpMessage
          } catch {
            return acpMsg('error: bad json')
          }

          const c = msg.parts?.[0]?.content as Record<string, unknown> | undefined
          const fromPart = typeof c?.tool === 'string' ? (c.tool as string) : ''
          const toolName = fromPart || (typeof msg.content === 'string' ? msg.content.trim() : '')
          if (!toolName) return acpMsg('error: no tool name')

          const result = await service.handleToolCall(toolName, null)
          const err = (result as { error?: string })?.error
          if (err) return acpMsg(`error: ${err}`)
          return acpMsg('ok', [{ type: 'result', content: result }])
        }

        return null
      }
    },
  }
}
