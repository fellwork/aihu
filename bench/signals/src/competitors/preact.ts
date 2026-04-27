import { batch, computed, effect, signal } from '@preact/signals-core'
import type { SignalAdapter } from '../types.ts'

// Preact signals expose a `.value` accessor and a `batch(fn)` helper.
// Effects re-run synchronously on dep change. computed(fn) is lazy
// like scribe — value is computed on first `.value` read.
export const preact: SignalAdapter = {
  name: '@preact/signals-core',
  version: '1.14.1',
  signal<T>(init: T) {
    const s = signal<T>(init)
    return [() => s.value, (v: T) => (s.value = v)] as const
  },
  computed<T>(fn: () => T) {
    const c = computed(fn)
    return () => c.value
  },
  effect(fn: () => void) {
    return effect(fn)
  },
  batch(fn) {
    batch(fn)
  },
  setup<T>(fn: () => T) {
    return { value: fn(), dispose: () => {} }
  },
}
