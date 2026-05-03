import type { AgentService } from '@scribe/agent-service'
import type { A2aAdapter, A2aAdapterOptions } from './types.ts'

export function mountA2aAdapter(service: AgentService, options?: A2aAdapterOptions): A2aAdapter {
  const prefix = options?.prefix ?? ''
  const agentName = options?.name ?? 'scribe-agent-service'

  const AGENT_CARD_PATH = `${prefix}/.well-known/agent.json`
  const TASKS_SEND_PATH = `${prefix}/a2a/tasks/send`
  const TASKS_SUBSCRIBE_PATH = `${prefix}/a2a/tasks/sendSubscribe`

  const CT_JSON = { 'content-type': 'application/json' }

  function buildAgentCard() {
    const manifest = service.getManifest()
    const skills = manifest.tools.flatMap(tool =>
      Object.keys(tool.actions ?? {}).map(action => ({
        id: `${tool.tag}/${action}`,
        name: action,
        description: '',
      }))
    )
    return {
      name: agentName,
      description: 'Scribe agent service',
      version: '1.0.0',
      capabilities: { streaming: true },
      defaultInputModes: ['application/json'],
      defaultOutputModes: ['application/json'],
      skills,
    }
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

        if (req.method === 'POST' && path === TASKS_SEND_PATH) {
          let body: { taskId?: unknown; message?: unknown; params?: unknown }
          try {
            body = (await req.json()) as typeof body
          } catch {
            return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: CT_JSON })
          }
          const taskId = (body.taskId as string) ?? crypto.randomUUID()
          if (!body.message || typeof body.message !== 'string') {
            return new Response(
              JSON.stringify({ taskId, status: 'failed', error: 'message must be string' }),
              { status: 200, headers: CT_JSON }
            )
          }
          const result = await service.handleToolCall(body.message, body.params ?? null)
          const errResult = result as { error?: string }
          if (errResult?.error) {
            return new Response(
              JSON.stringify({ taskId, status: 'failed', error: errResult.error }),
              { status: 200, headers: CT_JSON }
            )
          }
          return new Response(
            JSON.stringify({ taskId, status: 'completed', result }),
            { status: 200, headers: CT_JSON }
          )
        }

        if (req.method === 'POST' && path === TASKS_SUBSCRIBE_PATH) {
          let body: { taskId?: unknown; message?: unknown; params?: unknown }
          try {
            body = (await req.json()) as typeof body
          } catch {
            return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: CT_JSON })
          }
          const taskId = (body.taskId as string) ?? crypto.randomUUID()
          const toolName = (body.message as string) ?? ''
          const result = await service.handleToolCall(toolName, body.params ?? null)
          const enc = new TextEncoder()
          const stream = new ReadableStream({
            start(controller) {
              const frame = JSON.stringify({ taskId, status: 'completed', result })
              controller.enqueue(enc.encode(`data: ${frame}\n\n`))
              controller.enqueue(enc.encode('data: [DONE]\n\n'))
              controller.close()
            },
          })
          return new Response(stream, {
            status: 200,
            headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
          })
        }

        return null
      }
    },
  }
}
