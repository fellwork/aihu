/**
 * CLI entry point for the aihu MCP server.
 *
 * Invoked as: aihu mcp serve
 * Or directly: bun packages/mcp/bin/serve.ts
 *
 * Starts the MCP stdio server and waits for the host to close stdin.
 */

import { startServer } from '../src/index.js'

startServer().catch((err: unknown) => {
  process.stderr.write(`[aihu-mcp] Fatal error: ${(err as Error).message ?? err}\n`)
  process.exit(1)
})
