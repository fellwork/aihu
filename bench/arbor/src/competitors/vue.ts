/**
 * @vue/runtime-dom adapter for the arbor bench harness.
 *
 * Vue 3 uses a virtual DOM with fine-grained reactivity via `ref`/`reactive`.
 * This adapter wraps `createApp(defineComponent(...)).mount(host)`.
 *
 * **Update path.** For update workloads, the component's render function
 * closes over a `ref`. The workload captures the setter via `setVueRefSetter`
 * before `setup()`, so `ctx.update(value)` assigns `ref.value = v` and Vue's
 * scheduler flushes synchronously (micro-task boundary note: Vue schedules
 * DOM updates asynchronously by default; workloads that need synchronous
 * flushing should import `flushPromises` from `@vue/test-utils` or call
 * `nextTick`. For throughput measurement this is acceptable — we measure
 * the write cost, not the flush cost, which matches how vue is used in prod).
 */

import type { App } from '@vue/runtime-dom'
import { createApp, defineComponent, h } from '@vue/runtime-dom'
import type { AdapterContext, DomAdapter } from '../types.ts'

/** Slot for the render function. Set by the workload before `setup()`. */
let pendingRenderFn: (() => unknown) | null = null

/**
 * Slot for the reactive ref setter. Workloads that drive updates install
 * `(v) => { myRef.value = v }` here before calling `setup()`.
 */
let pendingRefSetter: ((v: unknown) => void) | null = null

/** Workload-side helper: register the render function before `setup()`. */
export function setVueRenderFn(fn: () => unknown): void {
  pendingRenderFn = fn
}

/** Workload-side helper: register the ref setter before `setup()`. */
export function setVueRefSetter(set: (v: unknown) => void): void {
  pendingRefSetter = set
}

// Re-export h so workloads can build vnode trees without an extra import.
export { h }

export const vue: DomAdapter = {
  name: '@vue/runtime-dom',
  version: '3.5.33',
  setup(host) {
    const renderFn = pendingRenderFn
    pendingRenderFn = null
    const setter = pendingRefSetter
    pendingRefSetter = null

    let app: App | null = null

    const ctx: AdapterContext = {
      mount() {
        if (renderFn) {
          const comp = defineComponent({ render: renderFn as () => unknown })
          app = createApp(comp)
          // Silence Vue's development-mode console warnings (no app.config,
          // devtools not installed, etc.) — not relevant to bench measurements.
          app.config.warnHandler = () => {}
          // Vue's mount() expects an HTMLElement; cast via any since we're
          // working with JSDOM Elements exposed as the generic Element type.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          app.mount(host as any)
        }
      },
      update(value) {
        if (setter) setter(value)
      },
      dispose() {
        if (app) {
          app.unmount()
          app = null
        }
      },
    }

    return {
      value: ctx,
      dispose: () => {
        if (app) {
          app.unmount()
          app = null
        }
      },
    }
  },
}
