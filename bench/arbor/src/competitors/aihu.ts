/**
 * `@aihu/arbor` adapter for the bench harness.
 *
 * The adapter is intentionally thin. The workload owns the tree shape; the
 * adapter just hides arbor's specific `mount(node, host)` / `scope.dispose()`
 * vocabulary behind the generic `AdapterContext` shape so workload code stays
 * library-agnostic.
 *
 * **Design note (per design §8.6).** The bench bypasses `defineComponent` and
 * the runtime's `_setMount(mount)` injection mechanism entirely — it builds
 * `Branch`/`Leaf` trees directly with the public `branch()`/`leaf()` factories
 * and calls `arbor.mount(tree, host)` directly. This is intentional: the bench
 * measures the arbor render layer in isolation, not the runtime/component
 * harness on top of it. A future bench (`bench/runtime/`?) would cover the
 * `defineComponent` path.
 *
 * The signal handle exposed via `update(value)` lets a workload drive a
 * signal-bound leaf without the adapter needing to know which leaf. mount-10k
 * leaves doesn't use it (no updates — pure mount throughput); spawn 2's
 * `update-1-of-10k-leaves` and `attr-thrash-100x100` will. We expose a
 * factory-style hook so the workload can install its own signal handle into
 * the tree before mount.
 */

import { mount as arborMount, type MountScope, type Node } from '@aihu/arbor'

import type { AdapterContext, DomAdapter } from '../types.ts'

/**
 * The aihu adapter expects each workload to provide a `buildTree()` factory
 * via the workload-side closure, since the tree shape is workload-specific
 * (10k leaves vs deep tree vs krausest rows). Workloads call
 * `setupAihu(host, () => tree)` directly rather than going through the
 * generic `DomAdapter.setup` for full control over tree construction.
 *
 * For the generic path (used by the runner when iterating all workloads ×
 * competitors), `setup()` accepts a `WorkloadHook` set by the workload's
 * own `build()` via the `pendingHook` slot. This is mildly indirect, but
 * it's the cleanest way to keep `DomAdapter` shape uniform across libs that
 * have very different template-construction APIs (lit literals vs solid h
 * vs aihu Branch/Leaf).
 */
export interface AihuWorkloadHook {
  buildTree(): Node
  /** Called once mount completes; receives the mount scope so the workload can drive updates. */
  attach?(scope: MountScope): void
}

let pendingHook: AihuWorkloadHook | null = null

/** Workload-side helper: register the tree builder before calling adapter.setup(). */
export function setAihuHook(hook: AihuWorkloadHook): void {
  pendingHook = hook
}

export const aihu: DomAdapter = {
  name: '@aihu/arbor',
  version: 'workspace',
  setup(host: Element) {
    const hook = pendingHook
    if (!hook) {
      throw new Error('aihu adapter: workload must call setAihuHook(hook) before setup()')
    }
    pendingHook = null

    let scope: MountScope | null = null

    const ctx: AdapterContext = {
      mount() {
        const tree = hook.buildTree()
        scope = arborMount(tree, host)
        if (hook.attach) hook.attach(scope)
      },
      update(_value: unknown) {
        // Default: no-op. Workloads drive updates via signal writes captured in
        // the `attach` callback's closure (see e.g. update-1-of-10k-leaves in
        // spawn 2). Keeping this signature stable lets future workloads dispatch
        // generic update events through the runner.
      },
      dispose() {
        if (scope) {
          scope.dispose()
          scope = null
        }
      },
    }

    return {
      value: ctx,
      dispose: () => {
        if (scope) {
          scope.dispose()
          scope = null
        }
      },
    }
  },
}
