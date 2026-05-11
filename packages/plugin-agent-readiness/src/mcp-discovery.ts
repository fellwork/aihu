/**
 * MCP Discovery document generator.
 * Discovery: GET /.well-known/mcp.json
 * Advertises MCP server endpoints to AI agents before page load.
 */

export interface McpDiscoveryServer {
  readonly url: string
  readonly name: string
  readonly description?: string
}

export interface McpDiscovery {
  readonly mcpServers: Record<string, McpDiscoveryServer>
}

export interface McpDiscoveryConfig {
  readonly name: string
  readonly url: string
  readonly description?: string
}

/**
 * Generate an MCP Discovery document.
 * Pure function. No I/O.
 *
 * Produces a /.well-known/mcp.json document with a single `mcpServers` entry.
 * The key is the name normalized to lowercase alphanumeric + hyphens.
 */
export function generateMcpDiscovery(config: McpDiscoveryConfig): McpDiscovery {
  const key = config.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return {
    mcpServers: {
      [key]: {
        url: config.url,
        name: config.name,
        ...(config.description !== undefined ? { description: config.description } : {}),
      },
    },
  }
}
