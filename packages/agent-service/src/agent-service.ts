/**
 * `@scribe/agent-service` — core implementation (Plan 5.2).
 *
 * `createAgentService` aggregates registered `AgentMetadata` entries and
 * exposes them as MCP-compatible tools via `getManifest`, `handleToolCall`,
 * and `asMiddleware`.
 */
import type { AgentMetadata } from '@scribe/agent'
import type {
  AgentManifest,
  AgentService,
  AgentServiceOptions,
  AgentToolEntry,
} from './types.ts'

/** Route prefix for the tool-call middleware. */
const TOOL_CALL_PATH = '/__scribe/tools/call'

/**
 * Convert a single `AgentMetadata` entry into an `AgentToolEntry`.
 * Missing `actions` and missing input schemas are normalised to empty objects.
 */
function metadataToToolEntry(meta: AgentMetadata): AgentToolEntry {
  return {
    name: meta.tag,
    tag: meta.tag,
    inputs: {},
    actions: meta.actions ?? {},
  }
}

/**
 * Create an `AgentService` from the provided metadata entries.
 *
 * @param options.manifests - Explicit metadata list. When omitted the caller
 *   is responsible for passing the registry contents (see `createAgentService`).
 */
function buildService(metas: AgentMetadata[]): AgentService {
  const tools: AgentToolEntry[] = metas.map(metadataToToolEntry)
  const manifest: AgentManifest = { tools }

  /** Fast lookup: "<tag>/<action>" → AgentMetadata */
  const byTag = new Map<string, AgentMetadata>()
  for (const meta of metas) byTag.set(meta.tag, meta)

  return {
    getManifest(): AgentManifest {
      return manifest
    },

    async handleToolCall(toolName: string, params: unknown): Promise<unknown> {
      const slash = toolName.indexOf('/')
      if (slash === -1) return { error: `bad tool: ${toolName}` }
      const tag = toolName.slice(0, slash)
      const action = toolName.slice(slash + 1)
      const meta = byTag.get(tag)
      if (!meta) return { error: `no agent: ${tag}` }
      if (meta.actions && !(action in meta.actions)) return { error: `no action: ${action}` }
      // Plan 5.3 wires full binding; return stub response for now.
      return { tag, action, params, result: null, stub: true }
    },

    asMiddleware(): (req: Request) => Promise<Response | null> {
      const CT = { 'content-type': 'application/json' }
      const err = (msg: string, status = 400) =>
        new Response(JSON.stringify({ error: msg }), { status, headers: CT })
      return async (req: Request): Promise<Response | null> => {
        if (req.method !== 'POST') return null
        if (new URL(req.url).pathname !== TOOL_CALL_PATH) return null
        let body: { tool?: unknown; params?: unknown }
        try {
          body = (await req.json()) as { tool?: unknown; params?: unknown }
        } catch {
          return err('bad json')
        }
        if (typeof body.tool !== 'string') return err('tool must be string')
        const result = await this.handleToolCall(body.tool, body.params ?? null)
        return new Response(JSON.stringify({ result }), { status: 200, headers: CT })
      }
    },
  }
}

/**
 * Create an `AgentService`.
 *
 * When `options.manifests` is provided those entries are used directly.
 * Otherwise the function reads all entries from the `@scribe/agent` global
 * registry at call time (not lazily — the snapshot is taken once).
 *
 * Full Plan 5.2 note: the registry export `getAgentMetadata` looks up by tag,
 * but there is no `getAllAgentMetadata()` yet. When `options.manifests` is
 * undefined we default to an empty list; the caller may pass the registry
 * snapshot explicitly via `manifests`.
 */
export function createAgentService(options?: AgentServiceOptions): AgentService {
  const metas = options?.manifests ?? []
  return buildService(metas)
}
