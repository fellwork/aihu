/**
 * solid-js adapter for the arbor bench harness.
 *
 * Solid uses fine-grained reactivity. This adapter uses `solid-js/h`
 * (the hyperscript runtime) to avoid a JSX compiler pass. Components are
 * plain functions that call `h()` — the `createSignal` / reactive primitives
 * work identically to the JSX path.
 *
 * **Update path.** For update workloads, the component factory closes over a
 * `createSignal` accessor. The workload captures the setter via
 * `setSolidSignalSetter` before `setup()`, so `ctx.update(value)` calls the
 * signal setter directly — one fine-grained DOM text patch per write.
 */

import { createRoot } from 'solid-js'
import solidH from 'solid-js/h'
import { render } from 'solid-js/web'
import type { AdapterContext, DomAdapter } from '../types.ts'

/** Slot for the component factory. Set by the workload before `setup()`. */
let pendingComponent: (() => unknown) | null = null

/**
 * Slot for the signal setter. Workloads that need fine-grained updates capture
 * their signal's setter here before calling `setup()`. `ctx.update(value)`
 * calls it on every op.
 */
let pendingSignalSetter: ((v: unknown) => void) | null = null

/** Workload-side helper: register the component factory before `setup()`. */
export function setSolidComponent(fn: () => unknown): void {
  pendingComponent = fn
}

/** Workload-side helper: register the signal setter before `setup()`. */
export function setSolidSignalSetter(set: (v: unknown) => void): void {
  pendingSignalSetter = set
}

// Re-export solidH so workloads that need h can import it from here.
export { solidH as h }

export const solid: DomAdapter = {
  name: 'solid-js',
  version: '1.9.12',
  setup(host) {
    const component = pendingComponent
    pendingComponent = null
    const setter = pendingSignalSetter
    pendingSignalSetter = null

    let rootDispose: (() => void) | null = null

    const ctx: AdapterContext = {
      mount() {
        // createRoot returns whatever the callback returns. We return `dispose`
        // directly so we can call it during dispose().
        rootDispose = createRoot((dispose) => {
          // solid-js render() expects () => Element; cast via any since our
          // components return hyperscript vnodes typed as `unknown`.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (component) render(component as any, host as HTMLElement)
          return dispose
        })
      },
      update(value) {
        if (setter) setter(value)
      },
      dispose() {
        if (rootDispose) {
          rootDispose()
          rootDispose = null
        }
      },
    }

    return {
      value: ctx,
      dispose: () => {
        if (rootDispose) {
          rootDispose()
          rootDispose = null
        }
      },
    }
  },
}
