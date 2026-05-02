/**
 * `@scribe/agent-service` — type definitions (Plan 5.2).
 *
 * `AgentManifest` is the MCP multi-tool manifest shape.
 * `AgentToolEntry` is the per-tool descriptor.
 * `AgentServiceOptions` configures `createAgentService`.
 * Re-uses `InputSchema` and `ActionSchema` from `@scribe/agent`.
 */
export type { InputSchema, ActionSchema } from '@scribe/agent'
import type { AgentMetadata } from '@scribe/agent'

/**
 * Per-tool entry in an `AgentManifest`.
 * Maps directly to a single registered `AgentMetadata`.
 */
export interface AgentToolEntry {
  /** The custom-element tag name (tool identifier prefix). */
  name: string
  /** Custom-element tag, identical to `name`. */
  tag: string
  /** Input fields declared on the component. */
  inputs: Record<string, import('@scribe/agent').InputSchema>
  /** Callable actions declared on the component. */
  actions: Record<string, import('@scribe/agent').ActionSchema>
}

/**
 * MCP multi-tool manifest aggregating all registered agents.
 */
export interface AgentManifest {
  tools: AgentToolEntry[]
}

/**
 * Options for `createAgentService`.
 */
export interface AgentServiceOptions {
  /**
   * Explicit list of agent metadata entries.
   * When omitted, reads the global registry via `getAgentMetadata`.
   */
  manifests?: AgentMetadata[]
}

/**
 * The service handle returned by `createAgentService`.
 */
export interface AgentService {
  /** Returns the aggregated manifest for all registered agents. */
  getManifest(): AgentManifest
  /**
   * Routes a tool call to the correct agent binding.
   * `toolName` format: `"<tag>/<actionName>"`.
   * Returns a stub response in Plan 5.2; full wiring is Plan 5.3.
   */
  handleToolCall(toolName: string, params: unknown): Promise<unknown>
  /**
   * Returns a fetch-compatible middleware function.
   * Handles `POST /__scribe/tools/call` with `{ tool, params }` JSON body.
   * Returns `null` for non-matching requests (pass-through).
   */
  asMiddleware(): (req: Request) => Promise<Response | null>
}
