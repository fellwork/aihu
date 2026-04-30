/**
 * Vanilla DOM adapter for the arbor bench harness.
 *
 * The floor competitor — raw `document.createElement`, `appendChild`,
 * `textContent`, `setAttribute`. No framework overhead. Establishes the
 * minimum possible cost for each workload so we can quantify framework tax.
 *
 * **Update path.** `mounter(host)` returns a `{ update? }` callback object.
 * Workloads that drive updates store a reference to the DOM node(s) they want
 * to patch inside the mounter closure and implement `update(v)` as a direct
 * `element.textContent = String(v)` assignment.
 *
 * **Dispose.** Manual loop: `while (host.firstChild) host.removeChild(host.firstChild)`.
 * This is the fair comparison for framework teardown costs.
 */

import type { AdapterContext, DomAdapter } from '../types.ts'

/** Return type of the mounter function. */
export interface VanillaMountResult {
  update?: (v: unknown) => void
}

/**
 * Slot for the mounter function. Set by the workload before `setup()`.
 * The mounter receives `host`, builds and appends DOM, then returns
 * `{ update? }` for workloads that need to drive reactive updates.
 */
let pendingMounter: ((host: Element) => VanillaMountResult) | null = null

/** Workload-side helper: register the mounter function before `setup()`. */
export function setVanillaMounter(fn: (host: Element) => VanillaMountResult): void {
  pendingMounter = fn
}

export const vanilla: DomAdapter = {
  name: 'vanilla',
  version: 'native',
  setup(host) {
    const mounter = pendingMounter
    pendingMounter = null

    let mountResult: VanillaMountResult | null = null

    const ctx: AdapterContext = {
      mount() {
        if (mounter) mountResult = mounter(host)
      },
      update(value) {
        if (mountResult?.update) mountResult.update(value)
      },
      dispose() {
        // Manual DOM clear — matches how frameworks handle teardown at the
        // raw layer. Using removeChild in a loop is the fair baseline (no
        // innerHTML shortcut that hides GC pressure).
        while (host.firstChild) host.removeChild(host.firstChild)
        mountResult = null
      },
    }

    return {
      value: ctx,
      dispose: () => {
        while (host.firstChild) host.removeChild(host.firstChild)
      },
    }
  },
}
