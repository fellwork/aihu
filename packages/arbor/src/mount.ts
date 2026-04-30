import { type Dispose, effect } from '@scribe/signals'
import { ArborNotImplementedError } from './errors.ts'
import { _materialize } from './materialize.ts'
import { _observeMount } from './telemetry.ts'
import type { AgentContext, ErrorHandler, MountOptions, Node, Snapshot } from './types.ts'

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
 */

// ---------------------------------------------------------------------------
// Scope-collector stack (spec §2.3 — push-pop replaces single-slot v0 design)
// ---------------------------------------------------------------------------

/**
 * Module-level scope-collector stack. A fresh `Dispose[]` is pushed
 * before each `mount()` call's `_materialize` runs and popped in the
 * `finally` block. Supports re-entrant `mount()` calls (e.g. from
 * `when()`/`each()` child scopes in Plan 1.1).
 *
 * @internal
 */
const _mountDisposersStack: Array<Dispose[]> = []

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
 * `effect(fn)` from `@scribe/signals` and pushes the returned `Dispose`
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
  _observeMount({ kind: 'effect-create', path, timestamp: Date.now() })
  // Use a ref to hold the dispose function so the effect body can safely
  // call it during its initial synchronous run (before `effect()` returns).
  // A `const` captured in the effect closure would be in TDZ on the first
  // run, causing a ReferenceError. The ref avoids this.
  const disposeRef: { fn: Dispose | null } = { fn: null }
  const dispose = effect(() => {
    _observeMount({ kind: 'effect-fire', path, timestamp: Date.now() })
    if (errorHandler !== undefined) {
      try {
        fn()
      } catch (err: unknown) {
        errorHandler(err, path)
        // Dispose this effect to prevent repeated throws from the same
        // binding. On the first synchronous run we use disposeRef.fn (which
        // may be null if effect() hasn't returned yet) — in that case the
        // effect will be cleaned up via the disposers array at scope
        // disposal. On subsequent runs disposeRef.fn is always set.
        disposeRef.fn?.()
      }
    } else {
      fn()
    }
  })
  disposeRef.fn = dispose
  disposers.push(() => {
    _observeMount({ kind: 'effect-dispose', path, timestamp: Date.now() })
    dispose()
  })
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
 * - `serialize()` — always throws `ArborNotImplementedError` (sub-project
 *   #6 lands SSR/serialize later).
 */
export interface MountScope {
  dispose(): void
  readonly agent: AgentContext
  serialize(): Snapshot
}

const _frozenAgent: AgentContext = Object.freeze({
  _brand: 'AgentContext' as const,
})

/**
 * Materialize `node` into `host` synchronously and return a `MountScope`
 * owning the lifecycle. See module JSDoc for the complete contract.
 *
 * The optional `options` parameter adds error boundary support (Plan 4.2):
 * - `options.onError` — called when `_materialize` throws synchronously
 *   during mount, or when a reactive effect throws during any run. If not
 *   provided, errors propagate as before (no swallowing).
 */
export function mount(node: Node, host: Element | ShadowRoot, options?: MountOptions): MountScope {
  const rootId = String(_rootIdCounter++)
  const pathBase = `${rootId}.0`
  const errorHandler = options?.onError

  _observeMount({ kind: 'mount-start', path: pathBase, timestamp: Date.now() })

  const disposers: Dispose[] = []
  let appendedRoots: globalThis.Node[] = []
  let materializeError: unknown = undefined
  let didCatch = false

  // Push-pop stack (spec §2.3): supports re-entrant mount() calls.
  _mountDisposersStack.push(disposers)
  try {
    appendedRoots = _materialize(node, host, disposers, pathBase, _mountEffect, errorHandler)
  } catch (err: unknown) {
    if (errorHandler !== undefined) {
      didCatch = true
      materializeError = err
    } else {
      _mountDisposersStack.pop()
      throw err
    }
  } finally {
    // Pop only if we haven't already popped in the rethrow branch.
    if (_mountDisposersStack[_mountDisposersStack.length - 1] === disposers) {
      _mountDisposersStack.pop()
    }
  }

  // Handle synchronous materialize error with errorHandler.
  if (didCatch && errorHandler !== undefined) {
    const result = errorHandler(materializeError, pathBase)
    if (result !== undefined) {
      // Plan 1.1: materialize fallback here.
      // _pendingFallback = result  (stub)
    }
  }

  _observeMount({ kind: 'mount-end', path: pathBase, timestamp: Date.now() })

  let disposed = false

  return {
    dispose(): void {
      if (disposed) return
      disposed = true
      // LIFO per spec §1.5 + Deviation 9: deepest/latest effects first.
      for (let i = disposers.length - 1; i >= 0; i--) {
        const dispose = disposers[i]
        if (dispose !== undefined) dispose()
      }
      // DOM removal last — effects must be silent before nodes detach.
      for (const root of appendedRoots) {
        if (root.parentNode === host) {
          host.removeChild(root)
        }
      }
    },
    agent: _frozenAgent,
    serialize(): Snapshot {
      throw new ArborNotImplementedError('serialize()')
    },
  }
}
