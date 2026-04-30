import { type Dispose, effect } from '@scribe/signals'
import { ArborNotImplementedError } from './errors.ts'
import { _materialize } from './materialize.ts'
import { _observeMount } from './telemetry.ts'
import type { AgentContext, Node, Snapshot } from './types.ts'

/**
 * `mount()`, `MountScope`, scope-collector, and disposal protocol per
 * `.team/phase-3/spec-arbor.md` §1.4 + §1.5 + §2.2 + §2.7 + §5
 * (Tasks 16 + 17). Telemetry hooks live in `./telemetry.ts` (§2.8).
 *
 * Synchronous initial render: by the time `mount()` returns, every reactive
 * binding has run once and subscribed to its signal, every static attr is
 * applied, and every DOM node is appended to `host`.
 *
 * Scope-collector (`_activeMountDisposers`, §2.2): module-level. v0 limit:
 * re-entrant `mount()` overwrites the slot; stack/push-pop fix is v1.
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
// Scope-collector slot (spec §2.2)
// ---------------------------------------------------------------------------

/**
 * Module-level scope-collector slot. Set to a fresh `Dispose[]` while a
 * `mount()` call is in progress; null otherwise. `_mountEffect` reads this
 * slot through the `disposers` parameter passed by `_materialize`, but the
 * slot itself is exposed for sub-project #7's binding layer to inspect
 * during materialization later.
 *
 * @internal
 */
export let _activeMountDisposers: Dispose[] | null = null

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
 * @internal
 */
export function _mountEffect(disposers: Dispose[], fn: () => void, path: string): void {
  _observeMount({ kind: 'effect-create', path, timestamp: Date.now() })
  const dispose = effect(() => {
    _observeMount({ kind: 'effect-fire', path, timestamp: Date.now() })
    fn()
  })
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
 */
export function mount(node: Node, host: Element | ShadowRoot): MountScope {
  const rootId = String(_rootIdCounter++)
  const pathBase = `${rootId}.0`

  _observeMount({ kind: 'mount-start', path: pathBase, timestamp: Date.now() })

  const disposers: Dispose[] = []
  // Module-level slot — sub-project #7 needs visibility during
  // materialization. v0 limitation: re-entrant mount overwrites (§2.2).
  _activeMountDisposers = disposers
  let appendedRoots: globalThis.Node[] = []
  try {
    appendedRoots = _materialize(node, host, disposers, pathBase, _mountEffect)
  } finally {
    _activeMountDisposers = null
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
