/**
 * `aihu mcp serve` — start the aihu MCP stdio server.
 *
 * Imports and starts @aihu/mcp's stdio server. The process stays alive
 * until the MCP host closes stdin.
 *
 * Registered in packages/templates/cf-team/template/.mcp.json as:
 *   { "command": "aihu", "args": ["mcp", "serve"] }
 */

export default async function mcpServe(_args: ReadonlyArray<string>): Promise<void> {
  // Dynamically import @aihu/mcp so the CLI binary loads instantly
  // when this subcommand is not being used.
  let startServer: () => Promise<void>
  try {
    const mod = await import('@aihu/mcp')
    startServer = mod.startServer
  } catch {
    // Fallback: try resolving the bin/serve.ts directly from workspace
    // (useful when running from within the monorepo before publishing)
    const { startServer: start } = await import('../../mcp/src/index.js')
    startServer = start
  }
  await startServer()
}
