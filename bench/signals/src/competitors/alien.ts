import { computed, effect, signal } from 'alien-signals'
import type { SignalAdapter } from '../types.ts'

// alien-signals returns a single function: call with no args to read,
// call with one arg to write. Adapter wraps in [get, set] for the
// uniform shape. Computeds are lazy (read returns the value).
//
// alien has no batching primitive; the workload handles `batch === undefined`
// by writing without deferring.
export const alien: SignalAdapter = {
  name: 'alien-signals',
  version: '3.1.2',
  signal<T>(init: T) {
    const s = signal(init)
    const get = (): T => s() as T
    const set = (v: T): void => {
      s(v)
    }
    return [get, set] as const
  },
  computed<T>(fn: () => T) {
    const c = computed(() => fn())
    return () => c() as T
  },
  effect(fn: () => void) {
    return effect(fn)
  },
  setup<T>(fn: () => T) {
    return { value: fn(), dispose: () => {} }
  },
}
