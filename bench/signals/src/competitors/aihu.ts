import { batch, computed, effect, signal } from '@aihu/signals'
import type { SignalAdapter } from '../types.ts'

// aihu ships [get, set] tuples natively, plus a synchronous batch().
// No owner/root context is required — effects auto-track and dispose
// when their returned dispose() is called. setup() is identity.
export const aihu: SignalAdapter = {
  name: '@aihu/signals',
  version: 'workspace',
  signal<T>(init: T) {
    // The Option-B `Write<T>` is `<U extends T>(...) => void`; the bench
    // adapter exposes the simpler `(v: T) => void` shape (function-typed
    // signals aren't part of any bench workload). Cast at the boundary.
    const [get, set] = signal<T>(init)
    return [get, set as (v: T) => void] as const
  },
  computed<T>(fn: () => T) {
    return computed(fn)
  },
  effect(fn: () => void) {
    return effect(fn)
  },
  batch,
  setup<T>(fn: () => T) {
    return { value: fn(), dispose: () => {} }
  },
}
