import S from 's-js'
import type { SignalAdapter } from '../types.ts'

// S.js requires every reactive cell to live under `S.root(disposer => ...)`.
// signals are `S.data(init)`: call with no args to read, with one arg to write.
// Computeds and effects are both `S(fn)` — S.js doesn't distinguish; the lib
// detects whether fn returns a value used downstream. For the adapter:
//   - `signal` → `S.data`
//   - `computed` → `S(fn)` — eager but cached
//   - `effect` → `S(fn)` (same primitive, ignored return)
//
// S.js has no `batch`; instead it uses `S.freeze(fn)` to defer effect runs
// while updating multiple data sources. Adapter maps `batch` → `S.freeze`.
//
// setup() wraps in S.root and returns its disposer.
export const sjs: SignalAdapter = {
  name: 's-js',
  version: '0.4.9',
  signal<T>(init: T) {
    const s = S.data(init)
    return [() => s(), (v: T) => s(v)] as const
  },
  computed<T>(fn: () => T) {
    const c = S(fn)
    return () => c()
  },
  effect(fn: () => void) {
    // S(fn) registers fn as a computation; there's no per-effect dispose
    // exposed publicly. The S.root disposer tears down everything.
    S(fn)
    return () => {}
  },
  batch(fn) {
    S.freeze(fn)
  },
  setup<T>(fn: () => T) {
    let dispose = (): void => {}
    let value: T
    S.root((d) => {
      dispose = d
      value = fn()
    })
    return { value: value!, dispose }
  },
}
