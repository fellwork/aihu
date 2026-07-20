import type { AgentService, RequestContext } from '@aihu/agent-service'
import type { A2aAdapter, A2aAdapterOptions } from './types.ts'

/**
 * Thesis §4 tier 0: the request must carry an identity context AT ALL, even
 * when anonymous is the answer. An explicit anonymous context is what the gate
 * decides against; passing nothing leaves it with nothing to decide against
 * and makes the omission invisible to audit.
 */
const ANONYMOUS: RequestContext = { userId: null }

export function mountA2aAdapter(service: AgentService, options?: A2aAdapterOptions): A2aAdapter {
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
  const APP_JSON = 'application/json'
  const sendPath = `${prefix}/a2a/tasks/send`
  const subPath = `${sendPath}Subscribe`

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': APP_JSON },
    })

  return {
    asMiddleware() {
      return async (req: Request): Promise<Response | null> => {
        const path = new URL(req.url).pathname

        if (req.method === 'GET' && path === `${prefix}/.well-known/agent.json`) {
          return json({
            name: options?.name ?? 'aihu-agent-service',
            description: 'Aihu agent service',
            version: '1.0.0',
            capabilities: { streaming: true },
            defaultInputModes: [APP_JSON],
            defaultOutputModes: [APP_JSON],
            skills: service.getManifest().tools.flatMap((t) =>
              Object.keys(t.actions ?? {}).map((a) => ({
                id: `${t.tag}/${a}`,
                name: a,
              })),
            ),
          })
        }

        if (req.method !== 'POST' || (path !== sendPath && path !== subPath)) return null

        let body: { taskId?: unknown; message?: unknown; params?: unknown }
        try {
          body = (await req.json()) as typeof body
        } catch {
          return json({ error: 'bad json' }, 400)
        }
        const taskId = (body.taskId as string) ?? crypto.randomUUID()
        const isSub = path === subPath
        const msg = body.message

        let error: string | undefined
        let code: number | undefined
        let result: unknown
        if (!isSub && typeof msg !== 'string') {
          error = 'bad message'
          code = 400
        } else {
          const ctx = await contextFor(req)
          result = await service.handleToolCall((msg as string) ?? '', body.params ?? null, ctx)
          const envelope = result as { error?: string; code?: number } | undefined
          error = envelope?.error
          code = envelope?.code
        }
        // The gate's HTTP code travels with the failure. Without it a caller
        // (and any audit) cannot distinguish 401 AUTH_REQUIRED from 403
        // SCOPE_DENIED from a 404 — the verdict the gate reached would be
        // unobservable at the transport boundary.
        const task = error
          ? { taskId, status: 'failed', error, ...(code === undefined ? {} : { code }) }
          : { taskId, status: 'completed', result }

        if (!isSub) return json(task)
        return new Response(`data: ${JSON.stringify(task)}\n\ndata: [DONE]\n\n`, {
          status: 200,
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        })
      }
    },
  }
}
