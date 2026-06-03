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
