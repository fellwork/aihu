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
  const { startServer } = await import('@aihu/mcp')
  await startServer()
}
