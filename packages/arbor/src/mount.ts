import { type Dispose, effect } from '@aihu/signals'
import { _materialize } from './materialize.ts'
import { _observeMount } from './telemetry.ts'
import type { AgentContext, ErrorHandler, MountOptions, Node, Snapshot } from './types.ts'

// Injected by Rolldown (production: false) or vitest define (tests: true).
declare const __DEV__: boolean

/**
 * `mount()`, `MountScope`, scope-collector, and disposal protocol per
 * `.team/phase-3/spec-arbor.md` §1.4 + §1.5 + §2.2 + §2.7 + §5
 * (Tasks 16 + 17). Telemetry hooks live in `./telemetry.ts` (§2.8).
 *
 * Synchronous initial render: by the time `mount()` returns, every reactive
 * binding has run once and subscribed to its signal, every static attr is
 * applied, and every DOM node is appended to `host`.
 *
 * Scope-collector (`_mountDisposersStack`, §2.3): module-level stack
 * (push before `_materialize`, pop in `finally`). Supports re-entrant
 * `mount()` calls (needed by the reconciler in Plan 1.1).
 *
 * Subscription identity (§2.7): every `_mountEffect` registration carries a
 * stable path key `<rootId>.<index-chain>.<binding-kind>`. v0 doesn't
 * consume keys directly; sub-projects #6 (resumable hydration) and #7
 * (agent live-binding) need them. Retrofit cost is prohibitive (Learning
 * #16) so we pay the wiring cost now.
 *
 * Disposal (Task 17 + §1.5 + Deviation 9): LIFO order for effect dispose
 * (deepest/latest first) prevents parent effects from re-running against
 * partially-cleaned children; DOM root removal happens last, after every
 * effect is torn down. Idempotent via internal `disposed` flag.
 *
 * Plan 3.2 — serialize(): `mount()` now maintains a `signalRegistry` map of
 * path key → signal getter. `MountScope.serialize()` iterates the map and
 * returns current signal values keyed by path. Replaces the v0 stub that
 * threw `ArborNotImplementedError`.
 */

// ---------------------------------------------------------------------------
// v0.3.0 — Live-binding types (RFC §2.2)
// ---------------------------------------------------------------------------

/**
 * Live binding for one mounted component instance. Module-private to this
 * file — only `mount()` can construct and register a `LiveBinding`.
 *
 * This interface is intentionally duplicated in `@aihu/agent-service/types.ts`
 * to avoid a circular package dependency (`@aihu/arbor` → `@aihu/agent-service`
 * → `@aihu/agent` is fine; but `@aihu/arbor` must not import from
 * `@aihu/agent-service`). Both interfaces share the same structural shape.
 */
interface LiveBinding {
  readonly rootId: number
  readonly tag: string
  getSignal(name: string): unknown
  setSignal(name: string, value: unknown): void
  callAction(name: string, args: unknown[]): Promise<unknown>
  scope(): string | null
  rateLimit(): string | null
  dispose$: () => boolean
}

// ---------------------------------------------------------------------------
// v0.3.0 — componentInstanceRegistry (RFC §2.1)
// ---------------------------------------------------------------------------

/**
 * Module-private registry mapping tag names to their live binding arrays.
 * Maximum 1000 entries per tag (Amendment 5 / §6.9). This Map is NOT
 * exported; only `mount()` via `registerLiveBinding()` can write to it.
 * `@aihu/agent-service` accesses it via the `getRegistry` option getter
 * injected at `createAgentService()` construction time.
 *
 * TTL eviction: reserved as `agent.registry.bindingTtlMs` config key;
 * unactivated in v0.3.0 (deferred to v0.4.0 per spec §4 deferred items).
 */
const componentInstanceRegistry: Map<string, LiveBinding[]> = new Map()

/** Maximum bindings per tag. Configurable in future via agent.registry.maxBindingsPerTag. */
const MAX_BINDINGS_PER_TAG = 1000

/**
 * Export the registry getter for injection into `@aihu/agent-service`.
 * Returns the live Map reference (not a snapshot).
 *
 * @internal — for use by `createAgentService({ getRegistry })` only.
 */
export function _getComponentInstanceRegistry(): Map<string, LiveBinding[]> {
  return componentInstanceRegistry
}

/**
 * Register a `LiveBinding` in the `componentInstanceRegistry`.
 *
 * Security invariants (per the 7 amendments):
 * - Amendment 5 (§6.9): Capacity cap — MAX_BINDINGS_PER_TAG per tag.
 * - Amendment 1 (§6.7): Cross-frame origin check — skip + WARN for cross-origin iframes.
 *
 * The caller (`mount()`) passes the binding and a `removeBinding` cleanup
 * function that is called via `onCleanup` when the mount scope disposes.
 *
 * @internal
 */
function registerLiveBinding(binding: LiveBinding): void {
  // Amendment 1 (§6.7 Cross-Frame Trust, CWE-346): when running in an iframe,
  // compare origins. Cross-origin iframe → skip registration + WARN.
  // Same-origin iframes share the module graph; registration is permitted.
  if (typeof window !== 'undefined' && window.parent !== window) {
    try {
      const selfOrigin = window.location.origin
      const parentOrigin = window.parent.location.origin
      if (selfOrigin !== parentOrigin) {
        if (typeof __DEV__ !== 'undefined' && __DEV__)
          console.warn(
            `[aihu/arbor] LiveBinding registration skipped for <${binding.tag}>: ` +
              `cross-origin iframe context (self=${selfOrigin}, parent=${parentOrigin}). ` +
              `Amendment 1 §6.7 — cross-origin iframes are not permitted to register live bindings.`,
          )
        return
      }
    } catch {
      // SecurityError reading window.parent.location.origin means cross-origin.
      if (typeof __DEV__ !== 'undefined' && __DEV__)
        console.warn(
          `[aihu/arbor] LiveBinding registration skipped for <${binding.tag}>: ` +
            `cross-origin iframe context (SecurityError reading parent origin). ` +
            `Amendment 1 §6.7 — cross-origin iframes are not permitted to register live bindings.`,
        )
      return
    }
  }

  // Amendment 5 (§6.9 Registry Capacity Bounds, CWE-400): cap per-tag array.
  const bindings = componentInstanceRegistry.get(binding.tag)
  if (bindings !== undefined) {
    if (bindings.length >= MAX_BINDINGS_PER_TAG) {
      if (typeof __DEV__ !== 'undefined' && __DEV__)
        console.warn(
          `[aihu/arbor] LiveBinding capacity cap (${MAX_BINDINGS_PER_TAG}) reached for <${binding.tag}>. ` +
            `The ${MAX_BINDINGS_PER_TAG + 1}th mount is rejected; existing bindings are unaffected. ` +
            `See agent.registry.maxBindingsPerTag for future configuration.`,
        )
      return
    }
    bindings.push(binding)
  } else {
    componentInstanceRegistry.set(binding.tag, [binding])
  }
}

// ---------------------------------------------------------------------------
// Scope-collector stack (spec §2.3 — push-pop replaces single-slot v0 design)
// ---------------------------------------------------------------------------

/**
 * Module-level scope-collector stack. A fresh `Dispose[]` is pushed
 * before each `mount()` call's `_materialize` runs and popped in the
 * `finally` block. Supports re-entrant `mount()` calls (e.g. from
 * `when()`/`each()` child scopes in Plan 1.1).
 *
 * Exported `@internal` so `structural.ts` can push/pop child scope
 * disposer arrays during reconciliation without importing `mount()`.
 *
 * @internal
 */
export const _mountDisposersStack: Array<Dispose[]> = []

/**
 * Returns the disposers array at the top of the stack (the currently
 * active mount scope), or `null` if no mount is in progress.
 *
 * @internal
 */
export function _currentMountDisposers(): Dispose[] | null {
  return _mountDisposersStack.length > 0
    ? (_mountDisposersStack[_mountDisposersStack.length - 1] ?? null)
    : null
}

/**
 * Counter for root-id assignment per spec §2.7. Increments per `mount()`
 * call so each scope's path keys are uniquely prefixed.
 *
 * @internal
 */
let _rootIdCounter = 0

// ---------------------------------------------------------------------------
// Scope-aware effect creator (spec §2.2 + §2.7 + §2.8)
// ---------------------------------------------------------------------------

/**
 * Create an effect that's owned by the active mount scope. Wraps
 * `effect(fn)` from `@aihu/signals` and pushes the returned `Dispose`
 * into the supplied `disposers` array. Telemetry events bracket the call
 * so dev-mode profiling can observe create/fire/dispose boundaries.
 *
 * Path argument is the §2.7 stable subscription key. Tests rely on the
 * exact format `<rootId>.<index-chain>.<binding-kind>`.
 *
 * When `errorHandler` is provided, the effect body is wrapped in
 * try/catch. On throw: (a) the handler is called with the error and
 * path; (b) the effect is self-disposed to prevent repeated throws from
 * the same binding. Without `errorHandler`, no try/catch is added
 * (no overhead on the hot path).
 *
 * @internal
 */
export function _mountEffect(
  disposers: Dispose[],
  fn: () => void,
  path: string,
  errorHandler?: ErrorHandler,
): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__)
    _observeMount({ kind: 'effect-create', path, timestamp: Date.now() })
  // R6a-arbor (investigation-arbor-restructure.md §Q3 Finding 2): the prior
  // `disposeRef = { fn: null }` ref-object exists to thread `dispose` into
  // the effect body so self-dispose works on the first synchronous run.
  // A bare `let savedDispose: Dispose | null = null` works equivalently
  // because the closure captures the binding (not the value); the binding
  // is initialised to `null` BEFORE `effect()` runs, so no TDZ. Saves the
  // `{ fn: null }` literal allocation per `_mountEffect` call AND ~10 B gz
  // by removing the `.fn` property accesses from three sites.
  //
  // selfDisposeNeeded: set when the effect throws on the very first run and
  // savedDispose is still null (effect() hasn't returned yet, so the
  // self-dispose call is a no-op). After effect() returns we immediately
  // dispose to prevent a second onError on the next signal write.
  let selfDisposeNeeded = false
  let savedDispose: Dispose | null = null
  const dispose = effect(() => {
    if (typeof __DEV__ !== 'undefined' && __DEV__)
      _observeMount({ kind: 'effect-fire', path, timestamp: Date.now() })
    if (errorHandler) {
      try {
        fn()
      } catch (err: unknown) {
        errorHandler(err, path)
        if (savedDispose) {
          savedDispose()
        } else {
          // First synchronous run: effect() hasn't returned yet.
          // Record that we need to self-dispose once it does.
          selfDisposeNeeded = true
        }
      }
    } else {
      fn()
    }
  })
  savedDispose = dispose
  if (selfDisposeNeeded) {
    dispose()
    return
  }
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    disposers.push(() => {
      _observeMount({ kind: 'effect-dispose', path, timestamp: Date.now() })
      dispose()
    })
  } else {
    disposers.push(dispose)
  }
}

// ---------------------------------------------------------------------------
// MountScope
// ---------------------------------------------------------------------------

/**
 * Public `MountScope` returned by `mount()`. Three members per spec §1.5:
 * - `dispose()` — synchronous teardown: LIFO effect dispose, then DOM
 *   removal. Idempotent.
 * - `agent` — frozen `AgentContext` stub (sub-project #7 lands the live
 *   binding later).
 * - `serialize()` — returns a flat `Record<string, unknown>` with path-keyed
 *   signal values (Plan 3.2 — sub-project #6 implemented).
 */
export interface MountScope {
  dispose(): void
  readonly agent: AgentContext
  serialize(): Snapshot
}

/** @internal — shared frozen AgentContext sentinel (also used by hydrate). */
export const _frozenAgent: AgentContext = Object.freeze({
  _brand: 'AgentContext' as const,
})

/**
 * Build a `MountScope` over `disposers` and `registry`. `cleanup` runs
 * after the LIFO dispose loop; mount() uses it for DOM root removal,
 * hydrate() omits it (DOM is left intact).
 *
 * v0.3.0: `agentContext` is set when the component has a `__agentBinding`
 * export (live context); falls back to `_frozenAgent` sentinel (backward compat).
 *
 * @internal
 */
export function _makeScope(
  disposers: Dispose[],
  registry: Map<string, () => unknown>,
  cleanup?: () => void,
  agentContext?: AgentContext,
): MountScope {
  let disposed = false
  return {
    dispose(): void {
      if (disposed) return
      disposed = true
      for (let i = disposers.length; i--; ) disposers[i]?.()
      cleanup?.()
    },
    agent: agentContext ?? _frozenAgent,
    serialize(): Snapshot {
      const out: Snapshot = {}
      for (const [p, g] of registry) out[p] = g()
      return out
    },
  }
}

/**
 * Materialize `node` into `host` synchronously and return a `MountScope`
 * owning the lifecycle. See module JSDoc for the complete contract.
 *
 * The optional `options` parameter adds error boundary support (Plan 4.2):
 * - `options.onError` — called when `_materialize` throws synchronously
 *   during mount, or when a reactive effect throws during any run. If not
 *   provided, errors propagate as before (no swallowing).
 *
 * Plan 3.2: a `signalRegistry` map is maintained during materialization.
 * `serialize()` iterates this map to return current signal values by path key.
 *
 * v0.3.0: when `options.agentBinding` is present, registers a `LiveBinding`
 * in the `componentInstanceRegistry`. The binding is removed via `onCleanup`
 * when the scope disposes (AC3). Cross-origin iframes are rejected (AC13).
 */
export function mount(node: Node, host: Element | ShadowRoot, options?: MountOptions): MountScope {
  // Path keys per spec §2.7: `<rootId>.0` for the root call.
  const rootId = _rootIdCounter++
  const pathBase = `${rootId}.0`
  const errorHandler = options?.onError

  if (typeof __DEV__ !== 'undefined' && __DEV__)
    _observeMount({ kind: 'mount-start', path: pathBase, timestamp: Date.now() })

  const disposers: Dispose[] = []
  // Plan 3.2 — signal registry: maps path key → signal getter for serialize().
  const signalRegistry = new Map<string, () => unknown>()
  let appendedRoots: globalThis.Node[] = []

  // Push-pop stack (spec §2.3): supports re-entrant mount() calls. The single
  // finally pop covers both the success and catch paths; if errorHandler is
  // absent, the rethrow propagates through finally so the pop still runs.
  _mountDisposersStack.push(disposers)
  try {
    appendedRoots = _materialize(
      node,
      host,
      disposers,
      pathBase,
      _mountEffect,
      errorHandler,
      signalRegistry,
    )
  } catch (err: unknown) {
    if (!errorHandler) throw err
    // Plan 1.1: any returned fallback Node is currently discarded (stub).
    errorHandler(err, pathBase)
  } finally {
    _mountDisposersStack.pop()
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__)
    _observeMount({ kind: 'mount-end', path: pathBase, timestamp: Date.now() })

  // v0.3.0 — Live-binding wiring (RFC §2.3, AC2/AC3).
  // When the component has a `__agentBinding` export, register a LiveBinding.
  // The binding is removed via onCleanup-driven disposal (LIFO with effects).
  let agentCtx: AgentContext | undefined
  const agentSpec = options?.agentBinding
  if (agentSpec !== undefined) {
    // Build the LiveBinding from the compiler-emitted __agentBinding spec.
    let bindingActive = true
    const binding: LiveBinding = {
      rootId,
      tag: agentSpec.tag,
      getSignal(name: string): unknown {
        const getter = agentSpec.reads[name]
        if (!getter) return undefined
        return getter()
      },
      setSignal(name: string, value: unknown): void {
        const setter = agentSpec.writes[name]
        if (setter) setter(value)
      },
      async callAction(name: string, args: unknown[]): Promise<unknown> {
        const action = agentSpec.actions[name]
        if (!action) throw new Error(`no action: ${name}`)
        return action(args)
      },
      scope(): string | null {
        return agentSpec.scope ?? null
      },
      rateLimit(): string | null {
        return agentSpec.rateLimit ?? null
      },
      dispose$(): boolean {
        if (!bindingActive) return false
        bindingActive = false
        const bindings = componentInstanceRegistry.get(agentSpec.tag)
        if (!bindings) return false
        const idx = bindings.indexOf(binding)
        if (idx === -1) return false
        bindings.splice(idx, 1)
        if (bindings.length === 0) componentInstanceRegistry.delete(agentSpec.tag)
        return true
      },
    }

    // Register the binding (capacity + cross-frame checks are in registerLiveBinding).
    registerLiveBinding(binding)

    // Wire dispose$ into the LIFO disposer chain so it runs before DOM removal.
    disposers.push(() => binding.dispose$())

    // Build a live AgentContext for MountScope.agent (RFC §4.2).
    agentCtx = Object.freeze({
      _brand: 'AgentContext' as const,
      rootId,
      tag: agentSpec.tag,
      readSignal: (name: string) => binding.getSignal(name),
      writeSignal: (name: string, value: unknown) => binding.setSignal(name, value),
      callAction: (name: string, args: unknown[]) => binding.callAction(name, args),
    })
  }

  // DOM removal runs after LIFO dispose so effects are silent first.
  return _makeScope(
    disposers,
    signalRegistry,
    () => {
      for (const root of appendedRoots) {
        if (root.parentNode === host) host.removeChild(root)
      }
    },
    agentCtx,
  )
}
