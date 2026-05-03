import type { AgentService } from '@scribe/agent-service'
import type { A2aAdapter, A2aAdapterOptions } from './types.ts'

export function mountA2aAdapter(service: AgentService, options?: A2aAdapterOptions): A2aAdapter {
  const prefix = options?.prefix ?? ''
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
            name: options?.name ?? 'scribe-agent-service',
            description: 'Scribe agent service',
            version: '1.0.0',
            capabilities: { streaming: true },
            defaultInputModes: [APP_JSON],
            defaultOutputModes: [APP_JSON],
            skills: service.getManifest().tools.flatMap(t =>
              Object.keys(t.actions ?? {}).map(a => ({
                id: `${t.tag}/${a}`,
                name: a,
              }))
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
        let result: unknown
        if (!isSub && typeof msg !== 'string') {
          error = 'bad message'
        } else {
          result = await service.handleToolCall((msg as string) ?? '', body.params ?? null)
          error = (result as { error?: string })?.error
        }
        const task = error
          ? { taskId, status: 'failed', error }
          : { taskId, status: 'completed', result }

        if (!isSub) return json(task)
        return new Response(
          `data: ${JSON.stringify(task)}\n\ndata: [DONE]\n\n`,
          { status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } }
        )
      }
    },
  }
}
