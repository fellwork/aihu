import { effectScope, ref, computed as vComputed, effect as vEffect } from '@vue/reactivity'
import type { SignalAdapter } from '../types.ts'

// @vue/reactivity has no top-level `batch` (Vue uses a microtask scheduler
// internally for `watch`, but `effect` runs synchronously). Adapter omits
// `batch`. setup() wraps in an EffectScope so all effects can be torn down
// with one dispose() — important for back-to-back workload runs.
export const vue: SignalAdapter = {
  name: '@vue/reactivity',
  version: '3.5.33',
  signal<T>(init: T) {
    const r = ref<T>(init) as { value: T }
    return [() => r.value, (v: T) => (r.value = v)] as const
  },
  computed<T>(fn: () => T) {
    const c = vComputed(fn)
    return () => c.value
  },
  effect(fn: () => void) {
    const runner = vEffect(fn)
    return () => runner.effect.stop()
  },
  setup<T>(fn: () => T) {
    const scope = effectScope()
    const value = scope.run(fn) as T
    return { value, dispose: () => scope.stop() }
  },
}
