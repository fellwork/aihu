/**
 * MCP Server Card generator.
 * Schema: SEP-1649/SEP-2127, protocolVersion 2025-06-18.
 * Discovery: GET /.well-known/mcp/server-card.json
 */

import type { AgentMetadata } from '@aihu/agent'
import { getAllAgentMetadata } from '@aihu/agent'
import type { McpAuthConfig } from './types.ts'

/** Minimal shape used for skill generation. Structurally compatible with @aihu/agent AgentMetadata. */
interface AgentMetadataLike {
  readonly tag: string
  readonly actions?: Record<string, { describe?: string } | undefined>
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
 *
 * The card's `tools` are DERIVED, not hand-maintained (thesis §2): the skills
 * come from the compiler-populated `@aihu/agent` registry — the same source
 * `@aihu/agent-server`'s `buildToolDefinitions` reads — via
 * {@link skillsFromRegistry}. Any skills declared explicitly in `config.skills`
 * are merged on top (deduped by id), honoring `AgentReadinessConfig`'s
 * documented "merged with auto-derived" contract. No hand-written skills
 * literal is required or expected; when both the registry and the config are
 * empty, `tools` is omitted.
 *
 * No I/O — reads an in-memory registry snapshot, exactly as the llms.txt path
 * does. Deterministic given the registry + config.
 *
 * `capabilities` is always `{ tools: true, resources: false, prompts: false }` in v0.
 *
 * SECURITY: auth output block must never contain client secrets, tokens, or
 * passwords. Only public URLs are emitted.
 */
export function generateMcpServerCard(config: McpServerCardConfig): McpServerCard {
  const skills = mergeSkills(skillsFromRegistry(), config.skills ?? [])
  const tools =
    skills.length > 0
      ? skills.map((s) => ({ name: s.name, description: s.description }))
      : undefined

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
 * id = "{meta.tag}.{actionName}", name = actionName, description = the action's
 * authored `describe:` text (sourced from the component's `$action` entry — the
 * same field `@aihu/agent-server` surfaces as the MCP tool description).
 * @internal
 */
export function agentMetadataToSkills(meta: AgentMetadataLike): ReadonlyArray<AgentSkill> {
  if (!meta.actions) return []
  return Object.entries(meta.actions).map(([actionName, action]) => ({
    id: `${meta.tag}.${actionName}`,
    name: actionName,
    description: action?.describe ?? '',
  }))
}

/**
 * Derive the full set of MCP skills from the live `@aihu/agent` registry.
 *
 * This is the single source of the agent surface: the compiler emits a
 * `registerAgentMetadata(...)` call for every `.aihu` component's `$action`
 * block, module evaluation populates the registry, and this reads it back —
 * so the server card can never drift from the components' declared actions.
 * Defaults to the global registry snapshot; accepts an explicit `metas` array
 * for testing.
 */
export function skillsFromRegistry(
  metas: readonly AgentMetadata[] = getAllAgentMetadata(),
): ReadonlyArray<AgentSkill> {
  return metas.flatMap((m) => agentMetadataToSkills(m))
}

/**
 * Merge registry-derived skills with any explicitly declared ones. Derived
 * skills win on id collision (they are the source of truth); declared skills
 * with a fresh id are appended. Order: derived first, then extra declared.
 */
function mergeSkills(
  derived: ReadonlyArray<AgentSkill>,
  declared: ReadonlyArray<AgentSkill>,
): ReadonlyArray<AgentSkill> {
  if (declared.length === 0) return derived
  const seen = new Set(derived.map((s) => s.id))
  return [...derived, ...declared.filter((s) => !seen.has(s.id))]
}
