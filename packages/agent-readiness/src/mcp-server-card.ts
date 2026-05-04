/**
 * MCP Server Card generator.
 * Schema: SEP-1649/SEP-2127, protocolVersion 2025-06-18.
 * Discovery: GET /.well-known/mcp/server-card.json
 */

import type { McpAuthConfig } from './types.ts'

/** Minimal shape used for skill generation. Structurally compatible with @scribe/agent AgentMetadata. */
interface AgentMetadataLike {
  readonly tag: string
  readonly actions?: Record<string, { desc?: string }>
}

export interface AgentSkill {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly inputSchema?: Record<string, unknown>
}

/**
 * MCP Server Card output object. Valid JSON when serialized.
 */
export interface McpServerCard {
  readonly $schema: 'https://modelcontextprotocol.io/schemas/server-card/v1.0'
  readonly version: '1.0'
  readonly protocolVersion: string
  readonly serverInfo: {
    readonly name: string
    readonly version: string
    readonly description?: string
    readonly homepage?: string
  }
  readonly transport: {
    readonly type: 'streamable-http' | 'sse'
    readonly url: string
  }
  readonly capabilities: {
    readonly tools: boolean
    readonly resources: boolean
    readonly prompts: boolean
  }
  readonly tools?: ReadonlyArray<{
    readonly name: string
    readonly description: string
  }>
  readonly auth?: {
    readonly type: 'oauth2'
    readonly authorizationServer: string
    readonly resourceMetadata?: string
  }
}

export interface McpServerCardConfig {
  readonly name: string
  readonly version: string
  readonly endpoint: string
  readonly skills?: ReadonlyArray<AgentSkill>
  readonly auth?: McpAuthConfig
  readonly description?: string
  readonly homepage?: string
  /** Default: '2025-06-18'. */
  readonly protocolVersion?: string
  /** Default: 'streamable-http'. */
  readonly transportType?: 'streamable-http' | 'sse'
}

/**
 * Generate an MCP Server Card object.
 * Pure function. No I/O.
 *
 * `capabilities` is always `{ tools: true, resources: false, prompts: false }` in v0.
 *
 * SECURITY: auth output block must never contain client secrets, tokens, or
 * passwords. Only public URLs are emitted.
 */
export function generateMcpServerCard(config: McpServerCardConfig): McpServerCard {
  const tools = config.skills?.map((s) => ({ name: s.name, description: s.description }))

  let auth: McpServerCard['auth']
  if (config.auth) {
    const tokenUrl = new URL(config.auth.tokenUrl)
    const authorizationServer = `${tokenUrl.origin}/.well-known/oauth-authorization-server`
    const resourceMetadata = `${config.endpoint}/.well-known/oauth-protected-resource`
    auth = { type: 'oauth2', authorizationServer, resourceMetadata }
  }

  const serverInfo: McpServerCard['serverInfo'] = {
    name: config.name,
    version: config.version,
    ...(config.description !== undefined ? { description: config.description } : {}),
    ...(config.homepage !== undefined ? { homepage: config.homepage } : {}),
  }

  return {
    $schema: 'https://modelcontextprotocol.io/schemas/server-card/v1.0',
    version: '1.0',
    protocolVersion: config.protocolVersion ?? '2025-06-18',
    serverInfo,
    transport: {
      type: config.transportType ?? 'streamable-http',
      url: config.endpoint,
    },
    capabilities: { tools: true, resources: false, prompts: false },
    ...(tools !== undefined ? { tools } : {}),
    ...(auth !== undefined ? { auth } : {}),
  }
}

/**
 * Derive AgentSkill[] from AgentMetadata.actions.
 * id = "{meta.tag}.{actionName}", name = actionName, description = desc string.
 * @internal
 */
export function agentMetadataToSkills(meta: AgentMetadataLike): ReadonlyArray<AgentSkill> {
  if (!meta.actions) return []
  return Object.entries(meta.actions).map(([actionName, action]) => ({
    id: `${meta.tag}.${actionName}`,
    name: actionName,
    description: action?.desc ?? '',
  }))
}
