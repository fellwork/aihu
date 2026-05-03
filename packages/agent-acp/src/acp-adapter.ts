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

  const AGENT_CARD_PATH = `${prefix}/.well-known/acp-agent`
  const MESSAGES_PATH = `${prefix}/acp/messages`

  const CT_JSON = { 'content-type': 'application/json' }

  function buildAgentCard() {
    const manifest = service.getManifest()
    const skills = manifest.tools.flatMap(tool =>
      Object.keys(tool.actions ?? {}).map(action => ({
        skill_id: `${tool.tag}/${action}`,
        name: action,
      }))
    )
    return { agent_id: agentId, description: 'Scribe ACP agent', skills }
  }

  function extractToolName(msg: AcpMessage): string | null {
    // Try to extract tool name from parts[0].content.tool
    if (msg.parts && msg.parts.length > 0) {
      const part = msg.parts[0]
      if (part.content && typeof part.content === 'object' && part.content !== null) {
        const c = part.content as Record<string, unknown>
        if (typeof c.tool === 'string') return c.tool
      }
    }
    // Fall back to content as tool name
    if (typeof msg.content === 'string' && msg.content.trim()) return msg.content.trim()
    return null
  }

  return {
    asMiddleware() {
      return async (req: Request): Promise<Response | null> => {
        const url = new URL(req.url)
        const path = url.pathname

        if (req.method === 'GET' && path === AGENT_CARD_PATH) {
          return new Response(JSON.stringify(buildAgentCard()), {
            status: 200,
            headers: CT_JSON,
          })
        }

        if (req.method === 'POST' && path === MESSAGES_PATH) {
          let msg: AcpMessage
          try {
            msg = (await req.json()) as AcpMessage
          } catch {
            return new Response(
              JSON.stringify({ role: 'agent', content: 'error: bad json', parts: [] }),
              { status: 200, headers: CT_JSON }
            )
          }

          const toolName = extractToolName(msg)
          if (!toolName) {
            return new Response(
              JSON.stringify({ role: 'agent', content: 'error: no tool name', parts: [] }),
              { status: 200, headers: CT_JSON }
            )
          }

          const result = await service.handleToolCall(toolName, null)
          const errResult = result as { error?: string }
          if (errResult?.error) {
            return new Response(
              JSON.stringify({ role: 'agent', content: `error: ${errResult.error}`, parts: [] }),
              { status: 200, headers: CT_JSON }
            )
          }
          return new Response(
            JSON.stringify({
              role: 'agent',
              content: 'ok',
              parts: [{ type: 'result', content: result }],
            }),
            { status: 200, headers: CT_JSON }
          )
        }

        return null
      }
    },
  }
}
