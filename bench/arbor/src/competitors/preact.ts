/**
 * preact + htm adapter for the arbor bench harness.
 *
 * Preact has no built-in fine-grained signals (Preact Signals is a separate
 * package, not installed here). Every `update()` call triggers a full
 * re-render of the bound vnode tree. This is reported honestly per
 * design §5.3 — it is the real cost, not a shortcut.
 *
 * **Honest note.** For `update-1-of-10k-leaves` and `attr-thrash-100x100`,
 * preact re-renders the entire tree on every write rather than patching a
 * single node. The numbers in RESULTS.md reflect this accurately.
 *
 * `htm` is bound to preact's `h` so workloads can use tagged-template
 * literals (`html\`<div>...</div>\``) as an alternative to `h(...)` calls.
 */

import htm from 'htm'
import type { VNode } from 'preact'
import { Fragment, h, render as preactRender } from 'preact'
import type { AdapterContext, DomAdapter } from '../types.ts'

/** htm bound to preact's h — exported so workloads can use template literals. */
export const html = htm.bind(h)

// Re-export h and Fragment for workloads that build vnode trees directly.
export { Fragment, h }

/** Slot for the static-mount vnode factory. Set by the workload before `setup()`. */
let pendingVNode: (() => VNode) | null = null

/**
 * Slot for the update-path vnode factory. Each call produces a new vnode that
 * is diffed and patched by preact's reconciler — still a full tree diff, just
 * potentially cheap if the tree is stable.
 *
 * **Note:** Each `update()` triggers a full re-render (see module JSDoc).
 */
let pendingUpdater: ((v: unknown) => VNode) | null = null

/** Workload-side helper: register the static vnode factory before `setup()`. */
export function setPreactVNode(fn: () => VNode): void {
  pendingVNode = fn
}

/** Workload-side helper: register the update vnode factory before `setup()`. */
export function setPreactUpdater(fn: (v: unknown) => VNode): void {
  pendingUpdater = fn
}

export const preact: DomAdapter = {
  name: 'preact',
  version: '10.25.4',
  setup(host) {
    const vnode = pendingVNode
    const updater = pendingUpdater
    pendingVNode = null
    pendingUpdater = null

    const ctx: AdapterContext = {
      mount() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (vnode) preactRender(vnode(), host as any)
      },
      /**
       * Full re-render via preact's reconciler. No fine-grained reactivity —
       * the entire vnode tree is diffed on each call. Reported as-is per
       * design §5.3.
       */
      update(value) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (updater) preactRender(updater(value), host as any)
      },
      dispose() {
        // render(null, host) is preact's teardown idiom — clears all children
        // and disposes component lifecycle hooks.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        preactRender(null, host as any)
      },
    }

    return {
      value: ctx,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispose: () => preactRender(null, host as any),
    }
  },
}
