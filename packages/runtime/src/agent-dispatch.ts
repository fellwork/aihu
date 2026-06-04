/**
 * `@aihu/runtime` — per-instance agent dispatcher registry (T6, go-public demo).
 *
 * Closes the Step-0 gap in the capability bridge: the compiler emits a
 * module-scope `export const __agentDispatcher` whose opaque-ID → invoker maps
 * reference setup-closure locals (`(args) => increment(args)`, `() => count()`).
 * At module scope those locals don't exist, so the export is an inert,
 * introspection-only template — calling its invokers throws ReferenceError.
 *
 * The capability bridge needs invokers bound to a SPECIFIC mounted instance's
 * signals. So the compiler ALSO injects, inside the setup body (where the
 * closures resolve), a `_registerAgentDispatcher(ctx.element, { … })` call.
 * This module stores that instance-bound dispatcher keyed by the host element,
 * so the browser bridge can take it after mount and drive the visible instance.
 *
 * No policy lives here: the dispatcher carries only opaque-ID → invoker maps
 * (no scope, no rateLimit). The server remains the sole policy authority — see
 * `@aihu/agent-server`.
 */

/**
 * The instance-bound dispatcher shape. Identical in structure to the compiler's
 * module-scope `__agentDispatcher` and `@aihu/agent-server`'s `AgentDispatcher`,
 * but its invokers are bound to one mounted instance's live signals.
 */
export interface InstanceAgentDispatcher {
  readonly tag: string
  /** opaqueId → action invoker (called with the positional args array). */
  readonly actions: Record<string, (args: unknown[]) => unknown>
  /** opaqueId → read accessor (current signal value). */
  readonly reads: Record<string, () => unknown>
  /** opaqueId → write accessor. */
  readonly writes: Record<string, (value: unknown) => void>
}

/**
 * Per-element registry. A `WeakMap` so a disconnected/GC'd element drops its
 * dispatcher with no manual teardown. Keyed by the host custom element
 * (`ctx.element`) — the same object the consumer holds a reference to via the
 * DOM, so the bridge can look it up after mount.
 */
const _instanceDispatchers = new WeakMap<Element, InstanceAgentDispatcher>()

/**
 * Register a mounted instance's agent dispatcher. Called by compiler-injected
 * code inside the setup body. A `null`/`undefined` host (e.g. a server-side
 * mount with no element) is a no-op — registration is a browser concern.
 *
 * @internal — emitted by the compiler; not part of the authored surface.
 */
export function _registerAgentDispatcher(
  element: Element | null | undefined,
  dispatcher: InstanceAgentDispatcher,
): void {
  if (element == null) return
  _instanceDispatchers.set(element, dispatcher)
}

/**
 * Look up the instance dispatcher registered for `element` (the mounted host
 * custom element). Returns `undefined` when none was registered (component has
 * no `@agent` block, or was built without the client dispatcher pass).
 *
 * @internal — consumed by `@aihu/agent-server`'s browser bridge.
 */
export function _takeAgentDispatcher(
  element: Element | null | undefined,
): InstanceAgentDispatcher | undefined {
  if (element == null) return undefined
  return _instanceDispatchers.get(element)
}

// ---------------------------------------------------------------------------
// Server-side per-instance agent binding (headless gate path)
// ---------------------------------------------------------------------------

/**
 * The full, per-instance agent binding the SERVER build injects into the setup
 * body. Unlike the client `InstanceAgentDispatcher` (opaque-ID → invoker, no
 * policy), this carries member-NAME → invoker maps AND policy (`scope`,
 * `rateLimit`) — exactly the shape arbor's `mount()` consumes via
 * `MountOptions.agentBinding` to register a `LiveBinding` in the
 * `componentInstanceRegistry` that the `@aihu/agent-service` gate reads.
 *
 * Structurally identical to `@aihu/arbor`'s `AgentBindingSpec`. Declared here
 * (rather than imported as a value) so this module has no value-import of arbor;
 * the compiler-emitted object literal in setup conforms to this shape.
 *
 * SECURITY: this binding — and the `_registerAgentServerBinding` call that
 * carries it — is emitted ONLY into SERVER builds. Client builds elide it
 * entirely (they ship only the policy-free opaque-ID `InstanceAgentDispatcher`).
 */
export interface InstanceAgentServerBinding {
  readonly tag: string
  /** memberName → action invoker (called with the positional args array). */
  readonly actions: Record<string, (args: unknown) => unknown>
  /** memberName → read accessor (current signal/computed value). */
  readonly reads: Record<string, () => unknown>
  /** memberName → write accessor (prop signal setter). */
  readonly writes: Record<string, (value: unknown) => void>
  /** `$scope` from the `@agent` block, or undefined when unscoped. */
  readonly scope: string | undefined
  /** `$rate-limit` as `'<n>/min'`, or undefined when unlimited. */
  readonly rateLimit: string | undefined
}

/**
 * Per-element registry of full server bindings. A `WeakMap` so a
 * disconnected/GC'd element drops its binding with no manual teardown. Keyed by
 * the host custom element (`ctx.element`) — the same key `connectedCallback`
 * holds — so the runtime can hand the binding to `mount()` immediately after
 * setup runs and BEFORE the tree is materialized.
 */
const _serverBindings = new WeakMap<Element, InstanceAgentServerBinding>()

/**
 * Register a mounted instance's FULL server agent binding. Called by
 * compiler-injected code inside the SERVER-build setup body. A `null`/undefined
 * host is a no-op.
 *
 * @internal — emitted by the compiler; not part of the authored surface.
 */
export function _registerAgentServerBinding(
  element: Element | null | undefined,
  binding: InstanceAgentServerBinding,
): void {
  if (element == null) return
  _serverBindings.set(element, binding)
}

/**
 * Take (read) the server binding registered for `element`. Consumed by
 * `@aihu/runtime`'s `connectedCallback` to forward it to `mount()` as
 * `MountOptions.agentBinding`, which registers the `LiveBinding` the headless
 * `@aihu/agent-service` gate dispatches against.
 *
 * @internal
 */
export function _takeAgentServerBinding(
  element: Element | null | undefined,
): InstanceAgentServerBinding | undefined {
  if (element == null) return undefined
  return _serverBindings.get(element)
}
