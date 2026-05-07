/**
 * @aihu/mcp — MCP server entry point.
 *
 * Exposes two tools via stdio MCP transport:
 *   - aihu_example: Returns canonical .aihu SFC snippets from the cookbook
 *   - aihu_validate: Compiles .aihu source and returns structured diagnostics
 *
 * Usage (programmatic):
 *   import { createServer, startServer } from '@aihu/mcp'
 *   await startServer()
 *
 * Usage (CLI):
 *   aihu mcp serve
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { handleExample } from './tools/example.js'
import { handleValidate } from './tools/validate.js'

const TOOL_DEFINITIONS = [
  {
    name: 'aihu_example',
    description:
      'Returns a canonical .aihu SFC snippet from the cookbook that best matches a natural-language intent. Use this to get idiomatic starting points for common component patterns.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        intent: {
          type: 'string',
          description:
            "Natural-language description of the component pattern sought. Examples: 'counter with signal and action', 'todo list with each and computed', 'component exposing agent surface'.",
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Optional array of keyword tags to narrow the search (e.g., ['\\$prop', '\\$lifecycle', 'router']).",
        },
      },
      required: ['intent'],
    },
  },
  {
    name: 'aihu_validate',
    description:
      'Compiles a .aihu SFC source string using the aihu Rust compiler. Returns compiled TypeScript on success or structured diagnostic errors (with code, message, line/col) on failure. Use this to verify .aihu source before writing to disk.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        source: {
          type: 'string',
          description: 'Full .aihu SFC source string to compile.',
        },
        filename: {
          type: 'string',
          description:
            "Optional virtual filename for the source (used as the component tag stem and in diagnostic messages). Defaults to 'component.aihu'.",
        },
      },
      required: ['source'],
    },
  },
]

/**
 * Create and configure the MCP server instance (without connecting).
 * Exported for programmatic use and testing.
 */
export function createServer(): Server {
  const server = new Server({ name: 'aihu', version: '0.1.0' }, { capabilities: { tools: {} } })

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }))

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    if (name === 'aihu_example') {
      const input = args as { intent: string; tags?: string[] }
      if (!input.intent || typeof input.intent !== 'string') {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: 'Missing required parameter: intent',
            },
          ],
        }
      }

      const result = handleExample({
        intent: input.intent,
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
      })

      if ('isError' in result && result.isError) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: result.message,
            },
          ],
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    }

    if (name === 'aihu_validate') {
      const input = args as { source: string; filename?: string }
      if (!input.source || typeof input.source !== 'string') {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: 'Missing required parameter: source',
            },
          ],
        }
      }

      const result = handleValidate({
        source: input.source,
        ...(input.filename !== undefined ? { filename: input.filename } : {}),
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    }

    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: `Unknown tool: ${name}`,
        },
      ],
    }
  })

  return server
}

/**
 * Start the MCP server with stdio transport.
 * The process stays alive until stdin closes (MCP host disconnects).
 */
export async function startServer(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
