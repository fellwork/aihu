// Solid's package exports map resolves to the server-side no-op build under
// Node/Bun by default (the `node` condition wins over `import`). For a fair
// bench we MUST import the real reactive build directly. This is the same
// trick solid's own bench setup uses; it's not a workaround.
//
// @ts-expect-error — solid-js/dist/solid.js has no .d.ts; we cast below.
import * as Solid from 'solid-js/dist/solid.js'

import type { SignalAdapter } from '../types.ts'

const {
  batch: sBatch,
  createComputed,
  createMemo,
  createRoot,
  createSignal,
} = Solid as {
  batch: (fn: () => void) => void
  createComputed: (fn: () => void) => void
  createMemo: <T>(fn: () => T) => () => T
  createRoot: <T>(fn: (dispose: () => void) => T) => T
  createSignal: <T>(init: T) => readonly [() => T, (v: T | ((prev: T) => T)) => T]
}

// Solid requires every signal/effect to live under an owner — `createRoot`
// is the entry point. setup() wraps the workload in createRoot and returns
// the dispose to tear the whole owner down between runs.
//
// Note: Solid's `createEffect` runs on a microtask, not synchronously, so
// the wide-fanout workload would pay an extra tick. We use `createComputed`
// for the effect adapter because it runs synchronously (matches the rest of
// the field). Documented trade-off: synchronous fairness over idiomatic Solid.
// `createMemo` (lazy-ish) backs `computed`.
export const solid: SignalAdapter = {
  name: 'solid-js',
  version: '1.9.12',
  signal<T>(init: T) {
    const [get, set] = createSignal<T>(init)
    return [get, (v: T) => set(() => v)] as const
  },
  computed<T>(fn: () => T) {
    return createMemo(fn)
  },
  effect(fn: () => void) {
    // createComputed runs synchronously inside the current owner; setup() has
    // already established a root, so this attaches there.
    createComputed(fn)
    return () => {
      // No per-effect dispose; the workload's setup() teardown takes care of it.
    }
  },
  batch(fn) {
    sBatch(fn)
  },
  setup<T>(fn: () => T) {
    let dispose = (): void => {}
    let value: T
    createRoot((d) => {
      dispose = d
      value = fn()
    })
    // biome-ignore lint/style/noNonNullAssertion: createRoot calls fn synchronously.
    return { value: value!, dispose }
  },
}
