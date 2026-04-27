import { batch, computed, effect, signal } from '@scribe/signals'
import type { SignalAdapter } from '../types.ts'

// scribe ships [get, set] tuples natively, plus a synchronous batch().
// No owner/root context is required — effects auto-track and dispose
// when their returned dispose() is called. setup() is identity.
export const scribe: SignalAdapter = {
  name: '@scribe/signals',
  version: 'workspace',
  signal<T>(init: T) {
    return signal<T>(init)
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
