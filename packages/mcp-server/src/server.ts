/**
 * @aihu/mcp-server — MCP server entry point.
 *
 * Exposes two tools via stdio MCP transport:
 *   - aihu_example: Returns cookbook SFC source by pattern name
 *   - aihu_validate: Compiles .aihu source and returns structured diagnostics
 *
 * Usage (CLI):
 *   aihu-mcp-server
 *   node packages/mcp-server/dist/server.js
 *
 * Environment variables:
 *   AIHU_COOKBOOK_PATH       — path to cookbook directory (default: ../../cookbook)
 *   SCRIBE_COMPILE_BIN       — path to aihu-compile binary
 *   AIHU_MCP_COMPILE_TIMEOUT_MS — compile timeout in ms (default: 10000)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { getCookbookIndex } from './cookbook-index.js'
import { handleExample } from './tools/aihu-example.js'
import { handleValidate } from './tools/aihu-validate.js'

// Build the cookbook index at startup (before any tool calls)
const _startupIndex = getCookbookIndex()
const _patternList = [..._startupIndex.keys()].sort().join(', ')

const TOOL_DEFINITIONS = [
  {
    name: 'aihu_example',
    description: `Returns a cookbook SFC source by pattern name. Patterns: ${_patternList}`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description:
            'The SFC file name without .aihu extension (e.g. "counter", "fetch-resource").',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'aihu_validate',
    description:
      'Compile an aihu SFC string and return structured diagnostics. Returns errors and warnings as C-code structured JSON.',
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
            "Optional virtual filename for the source (used as the component tag stem). Defaults to 'component.aihu'.",
        },
      },
      required: ['source'],
    },
  },
]

/**
 * Create and configure the MCP server instance.
 */
export function createServer(): Server {
  const server = new Server({ name: 'aihu', version: '0.1.0' }, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    if (name === 'aihu_example') {
      const input = args as { pattern?: unknown }
      if (typeof input.pattern !== 'string' || !input.pattern) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: 'Missing required parameter: pattern' }],
        }
      }

      const result = handleExample({ pattern: input.pattern })

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    }

    if (name === 'aihu_validate') {
      const input = args as { source?: unknown; filename?: unknown }
      if (typeof input.source !== 'string' || !input.source) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: 'Missing required parameter: source' }],
        }
      }

      const result = handleValidate({
        source: input.source,
        ...(typeof input.filename === 'string' ? { filename: input.filename } : {}),
      })

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    }

    return {
      isError: true,
      content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
    }
  })

  return server
}

/**
 * Start the MCP server with stdio transport.
 */
export async function startServer(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()

  // Clean exit on termination signals
  const shutdown = (): void => {
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await server.connect(transport)
}

// Auto-start when run directly
startServer().catch((err: unknown) => {
  process.stderr.write(`[aihu-mcp-server] Fatal error: ${(err as Error).message ?? err}\n`)
  process.exit(1)
})
