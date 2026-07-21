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
import { decideEmission, resolvePrincipal, surfaceCallPolicy } from './principal-gate.ts'
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
  authDiscoveryUrl?: string,
): {
  error: string
  code: number
  jsonrpc?: { code: number; message: string }
  authDiscoveryUrl?: string
} {
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
    // #420: a 401 is actionable only if the agent learns WHERE to obtain a
    // credential. Included when the host configured `authDiscoveryUrl`
    // (e.g. its /.well-known/oauth-protected-resource). Informational only.
    ...(authDiscoveryUrl !== undefined ? { authDiscoveryUrl } : {}),
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
  const authDiscoveryUrl = options?.authDiscoveryUrl

  /**
   * Run the security gate (RFC §5 steps 1-4: 404 → 401 → 403 → 429) WITHOUT
   * dispatching. Returns the resolved live binding + parsed names on success,
   * or the JSON-RPC rejection envelope to return verbatim.
   *
   * ASYNC since #420: step 2 signature-verifies the JWT via
   * `AuthPlugin.verify` (`crypto.subtle`, inherently async). Verification
   * COMPLETES before the scope consult (step 3) and the rate-limit consult
   * (step 4) — both operate only on the verified principal.
   *
   * Single source of truth for the error-ordering invariant: both
   * `handleToolCall` (which then dispatches on the server-mounted instance) and
   * `authorize` (gate-only, used by the `@aihu/agent-server` capability-bridge
   * path so the VISIBLE browser instance is the sole executor) call this — so
   * the security ordering can never diverge between the two entry points.
   */
  async function runGate(
    toolName: string,
    requestContext?: RequestContext,
  ): Promise<
    | { ok: true; binding: LiveBinding; tag: string; action: string }
    | { ok: false; envelope: ReturnType<typeof jsonrpcError> }
  > {
    const slash = toolName.indexOf('/')
    if (slash === -1) return { ok: false, envelope: jsonrpcError(400, `bad tool: ${toolName}`) }
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
      if (!meta) return { ok: false, envelope: jsonrpcError(404, `no live instance: ${tag}`) }

      // AC11: action allowlist check
      if (meta.actions && !(action in meta.actions)) {
        return { ok: false, envelope: jsonrpcError(404, `no action: ${action}`) }
      }
      // Legacy stub response (no live binding).
      return { ok: false, envelope: jsonrpcError(404, `no live instance: ${tag}`) }
    }

    // AC11: action allowlist check (against live binding)
    const binding = bindings[0]!

    // The previous check here was `typeof binding.callAction === 'function'`,
    // which is ALWAYS true for a LiveBinding — so the allowlist was dead code
    // on the only branch that can succeed, and enforcement was displaced to
    // the browser's opaque-ID map. That made the CLIENT the allowlist
    // authority, inverting this module's stated design that the server-side
    // gate is load-bearing.
    //
    // LiveBinding deliberately exposes no action list (it is a set of
    // invokers, not a manifest), so the authority is the compiler-emitted
    // metadata registered for this tag. `registerAgentMetadata` is emitted for
    // every server/universal build of an @agent component, so `meta` is
    // present for any properly compiled component.
    //
    // When metadata IS present it is enforced: an action must be advertised in
    // `actions`, or be a readable member in `state` (handleToolCall falls
    // through to getSignal for those). When it is ABSENT we cannot enforce —
    // there is nothing to enforce against — so the call proceeds to the
    // downstream invoker, which rejects unknown names on its own. Closing that
    // remaining gap means giving LiveBinding an advertised surface, tracked
    // separately; it is not reachable by any component compiled from source.
    const meta = byTag.get(tag)
    if (meta) {
      const inActions = meta.actions ? action in meta.actions : false
      const inState = meta.state ? action in meta.state : false
      if (!inActions && !inState) {
        return { ok: false, envelope: jsonrpcError(404, `no action: ${action}`) }
      }
    }

    // ── Steps 2+3: 401/403 — THE principal gate (#437-GX Phase 2) ─────────
    //
    // Refactored onto `resolvePrincipal` + `decideEmission`
    // (`principal-gate.ts`) — the ONE gate the emission taps (Phase 3/4) will
    // share, so the tool path and the content path can never diverge. The
    // #420 posture is unchanged and carried inside the gate:
    //
    //   - The principal comes EXCLUSIVELY from `AuthPlugin.verify` (signature
    //     verification; never `decodeJwt`, never caller-supplied `userId`).
    //   - Fail-closed AUTH_* ladder, same rungs, same order, same messages:
    //     no authPlugin → AUTH_MISSING; plugin without `verify` →
    //     AUTH_UNVERIFIABLE; no JWT → AUTH_REQUIRED; invalid/sub-less →
    //     AUTH_INVALID. Verification COMPLETES before any scope or rate-limit
    //     consult (the await below settles before `decideEmission` runs).
    //
    // NEW in Phase 2 — the `call` axis (spec §4.2 T1): the surface's compiled
    // `extract.call` policy is enforced as a CEILING over the member gates:
    //   'none'      → the agent surface is unavailable (404-shaped, below)
    //   'anonymous' → today's semantics: only member `$scope`/`$rate-limit`
    //                 demand a principal (needsPrincipal unchanged)
    //   'verified'  → every member requires a verified principal
    //   { scope }   → surface scope MET with the member's own `$scope`
    //                 (both must pass; never a grant, never a widening).
    //
    // The scope predicate is injected as `authPlugin.checkScope(jwt, s)` so
    // the member-scope decision is byte-for-byte the check this gate always
    // ran (#420 discipline: checkScope's decode reads claims `verify` just
    // authenticated; third-party checkScope semantics preserved).
    const scopeRequired = binding.scope()
    const rateLimitSpec = binding.rateLimit()
    const jwt = requestContext?.jwt ?? ''
    const principal = await resolvePrincipal({ jwt: requestContext?.jwt ?? null }, { authPlugin })
    const decision = decideEmission(
      principal,
      {
        axis: 'call',
        value: surfaceCallPolicy(meta),
        memberScope: scopeRequired,
        memberRateLimited: rateLimitSpec !== null,
      },
      { hasScope: (s) => authPlugin?.checkScope(jwt, s) === true },
    )
    if (!decision.allow) {
      if (decision.code === 404) {
        // `call: 'none'` — the surface is closed. Shaped EXACTLY like the
        // absent-tag refusal so possession of a credential never
        // distinguishes "closed" from "does not exist" (the Amendment 4
        // ordering invariant's information-hiding posture).
        return { ok: false, envelope: jsonrpcError(404, `no live instance: ${tag}`) }
      }
      // 401s carry the discovery pointer (#420); 403s never do.
      return {
        ok: false,
        envelope: jsonrpcError(
          decision.code,
          decision.message,
          decision.code === 401 ? authDiscoveryUrl : undefined,
        ),
      }
    }
    const verifiedSub: string | null = principal.class === 'anonymous' ? null : principal.sub

    // ── Step 4: 429 — rate limit ──────────────────────────────────────────
    //
    // Fail-closed, mirroring Step 3's `$scope` posture (Amendment 2 / §6.1).
    //
    // This branch used to read `if (rateLimitSpec !== null && rateLimitPlugin)`,
    // which made the plugin's ABSENCE silently disable the control: declare
    // `$rate-limit`, omit the plugin, and every call dispatched unlimited. That
    // is precisely the thesis §3 failure mode "a declared control that silently
    // no-ops when its plugin is absent". A declaration is a REQUEST FOR
    // ENFORCEMENT; when the server cannot enforce it, the call must be refused,
    // not waved through — otherwise the deployment topology (which plugins
    // happen to be wired) becomes the policy authority instead of the
    // declaration.
    //
    // Note the guard is `rateLimitSpec !== null`, NOT "always deny". A member
    // that declares no `$rate-limit` still dispatches normally with no plugin
    // present; over-enforcing here would break every un-rate-limited component.
    // Both directions are covered by named tests in
    // `tests/live-dispatch.test.ts` (§GO1).
    //
    // KEY PROVENANCE (#420, closes the gap formerly documented here): the
    // bucket key derives from `verifiedSub` — the `sub` claim of the
    // signature-VERIFIED JWT resolved in step 2 — never from the
    // caller-supplied `requestContext.userId`. Rotating `userId` therefore
    // no longer moves a caller into a fresh bucket; only a differently-SIGNED
    // token can. Guarded by the G3 key-provenance probe in
    // `scripts/check-governed.ts`.
    if (rateLimitSpec !== null) {
      if (!rateLimitPlugin) {
        return {
          ok: false,
          envelope: jsonrpcError(
            429,
            'RATE_LIMIT_MISSING: component declares $rate-limit but no rate-limit plugin ' +
              'is registered; refusing to serve an unenforceable quota',
          ),
        }
      }
      const rateLimitKey = `${verifiedSub}:${tag}`
      if (!rateLimitPlugin.checkRateLimit(rateLimitSpec, rateLimitKey)) {
        return {
          ok: false,
          envelope: jsonrpcError(429, `RATE_LIMITED: quota exhausted for ${rateLimitKey}`),
        }
      }
    }

    return { ok: true, binding, tag, action }
  }

  return {
    getManifest(): AgentManifest {
      return manifest
    },

    async handleToolCall(
      toolName: string,
      params: unknown,
      requestContext?: RequestContext,
    ): Promise<unknown> {
      const gated = await runGate(toolName, requestContext)
      if (!gated.ok) return gated.envelope
      const { binding, action } = gated

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

    async authorize(
      toolName: string,
      _params: unknown,
      requestContext?: RequestContext,
    ): Promise<unknown> {
      // Gate-only: run steps 1-4 and report the verdict WITHOUT executing the
      // action. Used by the capability bridge so the visible browser instance
      // is the sole executor while the server stays the policy authority.
      const gated = await runGate(toolName, requestContext)
      return gated.ok ? { authorized: true } : gated.envelope
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
