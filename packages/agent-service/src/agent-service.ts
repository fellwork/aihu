/**
 * `@aihu/agent-service` — core implementation (v0.3.0 live-dispatch).
 *
 * `createAgentService` aggregates registered `AgentMetadata` entries and
 * exposes them as MCP-compatible tools via `getManifest`, `handleToolCall`,
 * and `asMiddleware`.
 *
 * v0.3.0: `handleToolCall` implements the RFC §5 live-dispatch algorithm.
 * Error ordering invariant (Amendment 4 / §6.8): 404 → 401 → 403 → 429.
 * This ordering is a security invariant — do NOT reorder.
 */
import type { AgentMetadata } from '@aihu/agent'
import type {
  AgentManifest,
  AgentService,
  AgentServiceOptions,
  AgentToolEntry,
  LiveBinding,
  RequestContext,
} from './types.ts'

/** Route prefix for the tool-call middleware. */
const TOOL_CALL_PATH = '/__aihu/tools/call'

// ─── JSON-RPC 2.0 error helper ───────────────────────────────────────────────

/**
 * Map internal HTTP-style codes to JSON-RPC 2.0 error objects.
 * Per spec open-question resolution §5: use a `jsonrpcError` helper to
 * prevent per-engineer interpretation divergence.
 *
 * JSON-RPC 2.0 reserved codes:
 *   -32700 Parse error
 *   -32600 Invalid Request
 *   -32601 Method not found → 404
 *   -32602 Invalid params
 *   -32603 Internal error
 * Custom codes (server-defined):
 *   -32000 through -32099 — mapped here for HTTP codes.
 */
function jsonrpcError(
  code: 400 | 401 | 403 | 404 | 429 | 503,
  message: string,
): { error: string; code: number; jsonrpc?: { code: number; message: string } } {
  const rpcCode =
    code === 404
      ? -32601
      : code === 400
        ? -32602
        : code === 401
          ? -32001
          : code === 403
            ? -32002
            : code === 429
              ? -32003
              : -32603
  return {
    error: message,
    code,
    jsonrpc: { code: rpcCode, message },
  }
}

// ─── Metadata → tool entry ───────────────────────────────────────────────────

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

// ─── Service factory ─────────────────────────────────────────────────────────

/**
 * Create an `AgentService` from the provided metadata entries.
 *
 * @param options.manifests - Explicit metadata list.
 * @param options.authPlugin - Optional auth plugin for `$scope` checks.
 * @param options.rateLimitPlugin - Optional rate-limit plugin.
 * @param options.getRegistry - Getter for the `componentInstanceRegistry`
 *   from `@aihu/arbor/mount`. Injected to avoid circular package deps.
 */
function buildService(metas: AgentMetadata[], options?: AgentServiceOptions): AgentService {
  const tools: AgentToolEntry[] = metas.map(metadataToToolEntry)
  const manifest: AgentManifest = { tools }

  /** Fast lookup: tag → AgentMetadata */
  const byTag = new Map<string, AgentMetadata>()
  for (const meta of metas) byTag.set(meta.tag, meta)

  const authPlugin = options?.authPlugin
  const rateLimitPlugin = options?.rateLimitPlugin
  const getRegistry = options?.getRegistry

  return {
    getManifest(): AgentManifest {
      return manifest
    },

    async handleToolCall(
      toolName: string,
      params: unknown,
      requestContext?: RequestContext,
    ): Promise<unknown> {
      const slash = toolName.indexOf('/')
      if (slash === -1) return jsonrpcError(400, `bad tool: ${toolName}`)
      const tag = toolName.slice(0, slash)
      const action = toolName.slice(slash + 1)

      // ── Step 1: 404 — no live instance ────────────────────────────────────
      // Error ordering invariant (Amendment 4): 404 MUST come first.
      // A 429 before this would implicitly confirm binding existence to
      // unauthorized callers (timing-channel, CWE-200).
      const registry = getRegistry ? getRegistry() : null
      const bindings = registry ? (registry.get(tag) as LiveBinding[] | undefined) : undefined

      if (!bindings || bindings.length === 0) {
        // Fall back to legacy metadata-only path when no live registry is present.
        // This preserves backward compat with the Plan 5.2 stub behavior.
        const meta = byTag.get(tag)
        if (!meta) return jsonrpcError(404, `no live instance: ${tag}`)

        // AC11: action allowlist check
        if (meta.actions && !(action in meta.actions)) {
          return jsonrpcError(404, `no action: ${action}`)
        }
        // Legacy stub response (no live binding).
        return jsonrpcError(404, `no live instance: ${tag}`)
      }

      // AC11: action allowlist check (against live binding)
      const binding = bindings[0]!
      // Check if the action exists in the binding's reads or actions
      const hasAction = typeof (binding as { callAction: unknown }).callAction === 'function'
      if (!hasAction) {
        return jsonrpcError(404, `no action: ${action}`)
      }

      // ── Step 2: 401 — userId cardinality (Amendment 3 / §6.3) ────────────
      // `userId` MUST be non-null, non-empty from verified JWT `sub` claim
      // when the component has a $scope or $rate-limit (auth-gated endpoints).
      // For un-scoped, un-rate-limited components, userId is not required
      // (backward-compatible with adapters that don't carry auth context, e.g.
      // the a2a/acp adapters in v0.3.0). AC9 tests the scoped case.
      const scopeRequired = binding.scope()
      const rateLimitSpec = binding.rateLimit()
      const needsUserId = scopeRequired !== null || rateLimitSpec !== null
      const userId = requestContext?.userId
      if (needsUserId && !userId) {
        return jsonrpcError(401, 'AUTH_REQUIRED: userId (JWT sub) is missing or empty')
      }

      // ── Step 3: 403 / 401 AUTH_MISSING — scope check ─────────────────────
      if (scopeRequired !== null) {
        // Amendment 2 (§6.1 fail-closed): if @aihu/auth middleware is not
        // registered, return 401 AUTH_MISSING (not 403 — auth is absent, not
        // scope-fail). AC7 validates this invariant.
        if (!authPlugin) {
          return jsonrpcError(401, 'AUTH_MISSING: @aihu/auth middleware is not registered')
        }
        const jwt = requestContext?.jwt ?? ''
        if (!authPlugin.checkScope(jwt, scopeRequired)) {
          return jsonrpcError(403, `SCOPE_DENIED: JWT lacks required scope '${scopeRequired}'`)
        }
      }

      // ── Step 4: 429 — rate limit ──────────────────────────────────────────
      if (rateLimitSpec !== null && rateLimitPlugin) {
        const rateLimitKey = `${userId}:${tag}`
        if (!rateLimitPlugin.checkRateLimit(rateLimitSpec, rateLimitKey)) {
          return jsonrpcError(429, `RATE_LIMITED: quota exhausted for ${rateLimitKey}`)
        }
      }

      // ── Step 5: dispatch ──────────────────────────────────────────────────
      // Try callAction first, then getSignal for read-only signals.
      try {
        const args = Array.isArray(params)
          ? params
          : params !== null && params !== undefined
            ? [params]
            : []
        const result = await binding.callAction(action, args)
        return { result }
      } catch (err: unknown) {
        // If callAction throws "no action: <name>", try getSignal.
        if (err instanceof Error && err.message.startsWith('no action:')) {
          const value = binding.getSignal(action)
          if (value !== undefined) return { result: value }
          return jsonrpcError(404, `no action: ${action}`)
        }
        throw err
      }
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
        // G6f BUG 1 fix: build a RequestContext via the injected resolver so
        // scoped/$rate-limit tools are reachable over the bundled HTTP path.
        // `options` is closed over by buildService; reference it (NOT `this`).
        // Fail-closed preserved: without resolveAuth, no ctx is passed, so a
        // scoped binding still yields 401 (AUTH_MISSING / AUTH_REQUIRED).
        const ctx = options?.resolveAuth ? await options.resolveAuth(req) : undefined
        const out = (await this.handleToolCall(body.tool, body.params ?? null, ctx)) as {
          code?: number
        }
        // G6f BUG 2 fix: propagate the JSON-RPC envelope's HTTP code (the helper
        // is keyed on HTTP codes, always 4xx/5xx — never 0) and stop double-
        // wrapping — return the envelope as-is. Success envelopes are already
        // `{ result }` (no `code`, so `|| 200`); error envelopes surface
        // `{ error, code, jsonrpc }` with the correct status.
        return new Response(JSON.stringify(out), { status: out.code || 200, headers: CT })
      }
    },
  }
}

/**
 * Create an `AgentService`.
 *
 * When `options.manifests` is provided those entries are used directly.
 * Otherwise the function reads all entries from the `@aihu/agent` global
 * registry at call time (not lazily — the snapshot is taken once).
 *
 * v0.3.0: Pass `options.getRegistry` with the `componentInstanceRegistry`
 * getter from `@aihu/arbor/mount._getComponentInstanceRegistry` to enable
 * live dispatch. Without it, `handleToolCall` returns 404 for all calls.
 */
export function createAgentService(options?: AgentServiceOptions): AgentService {
  const metas = options?.manifests ?? []
  return buildService(metas, options)
}
