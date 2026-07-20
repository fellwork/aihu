/**
 * `@aihu/agent-service` — type definitions (Plan 5.2 / v0.3.0 live-binding).
 *
 * `AgentManifest` is the MCP multi-tool manifest shape.
 * `AgentToolEntry` is the per-tool descriptor.
 * `AgentServiceOptions` configures `createAgentService`.
 * `LiveBinding` is the runtime instance record wired by `mount()`.
 * Re-uses `InputSchema` and `ActionSchema` from `@aihu/agent`.
 */
export type { ActionSchema, InputSchema } from '@aihu/agent'

import type { AgentMetadata } from '@aihu/agent'

// ─── v0.3.0 — LiveBinding (RFC §2.2) ─────────────────────────────────────────

/**
 * A live binding for one mounted component instance. Constructed by
 * `registerLiveBinding()` in `@aihu/arbor/mount.ts` when a component with a
 * `__agentBinding` server export is mounted.
 *
 * `dispose$` is called by the `onCleanup`-driven teardown when the component
 * unmounts; returning `true` signals that the registry entry was removed.
 *
 * Security: this interface is module-private to `@aihu/arbor`. Only the
 * `mount()` call path can construct and register a `LiveBinding`.
 */
export interface LiveBinding {
  /** Stable root ID from the mount scope (spec §2.7 path prefix). */
  readonly rootId: number
  /** Custom-element tag name identifying the component type. */
  readonly tag: string
  /** Read the current value of a named signal (prop or computed). */
  getSignal(name: string): unknown
  /** Write a value to a named writable signal (prop only). */
  setSignal(name: string, value: unknown): void
  /** Invoke a named action with arguments, returning the result. */
  callAction(name: string, args: unknown[]): Promise<unknown>
  /** The `$scope` claim string, or null when absent. */
  scope(): string | null
  /** The `$rate-limit` spec string (e.g. `'100/min'`), or null when absent. */
  rateLimit(): string | null
  /** Disposal function: removes this binding from the registry. Returns true on success. */
  dispose$: () => boolean
}

// ─── v0.3.0 — request context ────────────────────────────────────────────────

/**
 * Request context passed to `handleToolCall` for authorization and rate-limit
 * checks. All fields are required; omitting userId results in a 401.
 */
export interface RequestContext {
  /** The verified user ID from JWT `sub` claim (non-null, non-empty). */
  readonly userId: string | null | undefined
  /** The raw JWT string, used for scope claim extraction. */
  readonly jwt?: string | null
}

// ─── v0.3.0 — auth/scope plugin ──────────────────────────────────────────────

/**
 * Optional auth plugin injected into `createAgentService`. When absent and
 * a component has a non-null `$scope`, `handleToolCall` returns HTTP 401
 * `AUTH_MISSING` (fail-closed per Amendment 2 / §6.1).
 */
export interface AuthPlugin {
  /**
   * Verify that the JWT carries the required scope claim.
   * Returns true if the claim is present, false otherwise.
   */
  checkScope(jwt: string, scope: string): boolean
}

// ─── v0.3.0 — rate-limit plugin ──────────────────────────────────────────────

/**
 * Rate-limit store injected into `createAgentService`. Implementations MUST
 * operate in O(1) constant time per Amendment 4 / §6.8.
 */
export interface RateLimitPlugin {
  /**
   * Check and consume one unit of quota for `key`.
   * `rateSpec` is a string like `'100/min'`.
   * Returns false when quota is exhausted (caller should return 429).
   */
  checkRateLimit(rateSpec: string, key: string): boolean
}

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
  inputs: Record<string, import('@aihu/agent').InputSchema>
  /** Callable actions declared on the component. */
  actions: Record<string, import('@aihu/agent').ActionSchema>
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
  /**
   * Optional auth plugin. When absent and a component uses `$scope`,
   * `handleToolCall` returns 401 AUTH_MISSING (fail-closed, Amendment 2).
   */
  authPlugin?: AuthPlugin
  /**
   * Optional rate-limit plugin. Fail-closed, matching `authPlugin`: when a
   * component declares `$rate-limit` and this is ABSENT, the gate returns 429
   * `RATE_LIMIT_MISSING` rather than dispatching. A component that declares no
   * `$rate-limit` is unaffected and dispatches normally.
   *
   * "Optional" therefore means "un-rate-limited components need no plugin" — it
   * is NOT optional for a component that asks to be rate-limited.
   */
  rateLimitPlugin?: RateLimitPlugin
  /**
   * Getter for the `componentInstanceRegistry` from `@aihu/arbor/mount`.
   * Injected at construction time to avoid a circular import.
   * When absent, all `handleToolCall` calls return 404 (no live instance).
   *
   * The registry is consumed READ-ONLY here (only `.get(tag)` is called),
   * so the getter is typed as `ReadonlyMap` — a zero-cost type-level lock that
   * prevents external mutation of the live registry without snapshotting it.
   */
  getRegistry?: () => ReadonlyMap<string, LiveBinding[]>
  /**
   * Optional per-request auth resolver. When provided, `asMiddleware()` calls
   * it to build the `RequestContext` (userId + raw jwt) passed to
   * `handleToolCall`, enabling scoped tools over the bundled HTTP path. When
   * absent, `asMiddleware()` passes no context (fail-closed: scoped tools 401).
   * Injected to keep agent-service auth-library-agnostic and avoid a circular
   * `@aihu/auth` dep. The host wires `getAuthState` (`@aihu/auth/server`).
   */
  resolveAuth?: (req: Request) => RequestContext | Promise<RequestContext>
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
   *
   * v0.3.0: full live-dispatch per RFC §5. Error ordering invariant:
   * 404 → 401 → 403 → 429 (Amendment 4 timing-channel invariant).
   *
   * @param toolName - `"<tag>/<actionName>"` or `"<tag>/<signalName>"`.
   * @param params - Action arguments or signal write value.
   * @param requestContext - Auth context (userId, jwt). Required for scoped components.
   */
  handleToolCall(
    toolName: string,
    params: unknown,
    requestContext?: RequestContext,
  ): Promise<unknown>
  /**
   * Run the security gate WITHOUT dispatching. Returns `{ authorized: true }`
   * when the call would be allowed, or the same `{ error, code, jsonrpc }`
   * rejection envelope `handleToolCall` would return (404/401/403/429). Shares
   * the single gate implementation with `handleToolCall`, so the error-ordering
   * invariant is identical. Used by `@aihu/agent-server`'s capability-bridge
   * path to gate on the server while delegating execution to the visible
   * browser instance.
   */
  authorize(toolName: string, params: unknown, requestContext?: RequestContext): Promise<unknown>
  /**
   * Returns a fetch-compatible middleware function.
   * Handles `POST /__aihu/tools/call` with `{ tool, params }` JSON body.
   * Returns `null` for non-matching requests (pass-through).
   */
  asMiddleware(): (req: Request) => Promise<Response | null>
}
