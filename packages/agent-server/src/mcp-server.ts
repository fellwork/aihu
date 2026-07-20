/**
 * `@aihu/agent-server` — MCP endpoint for component actions (T2, part 3).
 *
 * Exposes each mounted component's declared actions/state as MCP tools, backed
 * by {@link AgentServer.callTool} (which runs the agent-service security gate
 * and forwards approved invocations to the browser bridge).
 *
 * Reuses the existing stdio MCP-server pattern from `@aihu/mcp` (same SDK,
 * same `ListTools`/`CallTool` request-handler shape) rather than reinventing
 * the protocol layer. The SDK is imported HERE (not in `index.ts`) so consumers
 * that only want `createAgentServer` + the bridge don't pay for the SDK.
 */

import type { AgentMetadata } from '@aihu/agent'
import { getAllAgentMetadata } from '@aihu/agent'
import type { RequestContext } from '@aihu/agent-service'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { AgentServer } from './types.ts'

/** A `tools/call` argument shape: positional args + optional auth context. */
interface ComponentToolArgs {
  /** Positional arguments forwarded to the action. */
  args?: unknown[]
  /** Optional auth context (userId, jwt) for scoped/rate-limited tools. */
  context?: RequestContext
}

/**
 * Build the MCP tool descriptors from registered `AgentMetadata`. One tool per
 * `<tag>/<action>`, named `"<tag>/<action>"` to match the agent-service tool
 * naming (so `callTool` routes correctly).
 */
function buildToolDefinitions(metas: AgentMetadata[]): Array<{
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
  }
}> {
  const tools: Array<{
    name: string
    description: string
    inputSchema: { type: 'object'; properties: Record<string, unknown> }
  }> = []
  for (const meta of metas) {
    const actions = meta.actions ?? {}
    for (const action of Object.keys(actions)) {
      // Prefer the authored `describe:` from the component's $action entry —
      // it is written for an LLM audience. Fall back to the synthesized string
      // only when the action carries no description.
      const authored = actions[action]?.describe
      tools.push({
        name: `${meta.tag}/${action}`,
        description:
          (authored && authored.length > 0
            ? authored
            : `Invoke the \`${action}\` action on a live <${meta.tag}> instance.`) +
          (meta.describes ? ` Component: ${meta.describes}` : ''),
        inputSchema: {
          type: 'object',
          properties: {
            args: {
              type: 'array',
              description: `Positional arguments for ${action}.`,
            },
          },
        },
      })
    }
    // Expose read-only state signals as zero-arg tools too (handleToolCall
    // falls through to getSignal when callAction reports "no action").
    const state = meta.state ?? {}
    for (const stateName of Object.keys(state)) {
      // The map VALUE is the authored `describe:` for that member (the compiler
      // emits '' when none was written). It was previously ignored entirely.
      const authored = state[stateName]
      tools.push({
        name: `${meta.tag}/${stateName}`,
        description:
          authored && authored.length > 0
            ? authored
            : `Read the \`${stateName}\` state of a live <${meta.tag}> instance.`,
        inputSchema: { type: 'object', properties: {} },
      })
    }
  }
  return tools
}

/**
 * Create an MCP `Server` whose tools are the mounted component's actions/state,
 * backed by `agentServer.callTool`. Does not connect a transport — call
 * {@link serveComponentMcp} (or wire your own transport) to go live.
 *
 * `metas` defaults to the global `getAllAgentMetadata()` snapshot, matching
 * what `createAgentServer` built its service from.
 */
export function createComponentMcpServer(
  agentServer: AgentServer,
  metas: AgentMetadata[] = getAllAgentMetadata(),
): Server {
  const server = new Server(
    { name: 'aihu-agent-server', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  const toolDefs = buildToolDefinitions(metas)

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefs }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params
    const input = (rawArgs ?? {}) as ComponentToolArgs
    const params = input.args ?? []

    // Route through the gated callTool. The envelope is `{ result }` on success
    // or `{ error, code, jsonrpc }` on a gate rejection (404/401/403/429/503).
    const envelope = (await agentServer.callTool(name, params, input.context)) as {
      result?: unknown
      error?: string
      code?: number
    }

    if (typeof envelope.code === 'number') {
      // Gate rejection → MCP tool error. The code (404/401/403/429/503) is
      // surfaced in the message so the agent learns why it was denied.
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `[${envelope.code}] ${envelope.error ?? 'denied'}`,
          },
        ],
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(envelope.result ?? null, null, 2),
        },
      ],
    }
  })

  return server
}

/**
 * Convenience: create the component MCP server and connect it over stdio (the
 * same transport `@aihu/mcp` uses). Stays alive until the MCP host disconnects.
 */
export async function serveComponentMcp(
  agentServer: AgentServer,
  metas?: AgentMetadata[],
): Promise<Server> {
  const server = createComponentMcpServer(agentServer, metas)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  return server
}
