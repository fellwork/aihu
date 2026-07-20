/**
 * `@aihu/agent-acp` — ACP adapter implementation (Plan 5.3).
 *
 * Exposes two routes:
 *  GET  {prefix}/.well-known/acp-agent  — agent discovery card
 *  POST {prefix}/acp/messages           — ACP message routing
 */
import type { AgentService, RequestContext } from '@aihu/agent-service'
import type { AcpAdapter, AcpAdapterOptions, AcpMessage } from './types.ts'

/**
 * Thesis §4 tier 0: the request must carry an identity context AT ALL, even
 * when anonymous is the answer. An explicit anonymous context is what the gate
 * decides against; passing nothing leaves it with nothing to decide against
 * and makes the omission invisible to audit.
 */
const ANONYMOUS: RequestContext = { userId: null }

export function mountAcpAdapter(service: AgentService, options?: AcpAdapterOptions): AcpAdapter {
  const prefix = options?.prefix ?? ''

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
  const agentId = options?.agentId ?? 'aihu-agent-service'
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
            description: 'Aihu ACP agent',
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

          // Arguments: previously hardcoded `null`, which meant the ACP
          // transport structurally could not pass arguments to ANY action.
          // Accepted under either key, and from the message body as a fallback
          // when the tool name arrived via `msg.content` instead of a part.
          const params = c?.params ?? c?.args ?? msg.params ?? null

          const ctx = await contextFor(req)
          const result = await service.handleToolCall(toolName, params, ctx)
          const envelope = result as { error?: string; code?: number } | undefined
          const err = envelope?.error
          // The gate's HTTP code travels with the failure. ACP always replies
          // 200, so without this the verdict the gate reached (401
          // AUTH_REQUIRED vs 403 SCOPE_DENIED vs 404) is unobservable at the
          // transport boundary and cannot be audited.
          if (err) return acpMsg(`error: ${err}`, [{ type: 'error', content: envelope }])
          return acpMsg('ok', [{ type: 'result', content: result }])
        }

        return null
      }
    },
  }
}
