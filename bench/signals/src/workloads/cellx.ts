// Indexes into l1/l2/l3/l4 are static literals; tsconfig's
// noUncheckedIndexedAccess makes biome flag them. The non-null assertion is
// fine here — graph shape is fixed at construction.
//
// biome-ignore-all lint/style/noNonNullAssertion: static-shape diamond
import type { SignalAdapter, WorkloadDefinition } from '../types.ts'

/**
 * Cellx — S.js classic. One source signal feeds a 5-deep diamond graph
 * of computeds; one terminal effect reads the deepest leaf. Each layer
 * derives from the layer above with a tiny pure transform. One source
 * write per op; we measure how long propagation takes.
 *
 * Why this shape: it stresses propagation efficiency and dedup. A naive
 * implementation re-runs every computed once per dep change, causing
 * exponential work in a diamond. A good implementation collapses to
 * O(nodes).
 *
 * Sized to be cheap (5 layers × 4 nodes each = 20 computeds, 1 effect)
 * so the per-op time is ~microseconds. Keeps mitata's per-op resolution
 * meaningful and amortizes setup cost.
 */
export const cellx: WorkloadDefinition = {
  name: 'cellx',
  description: '5-deep diamond graph propagation (S.js classic)',
  build(adapter: SignalAdapter) {
    const ctx = adapter.setup(() => {
      const [src, setSrc] = adapter.signal(0)

      // Layer 1: 4 computeds each reading src
      const l1 = Array.from({ length: 4 }, (_, i) => adapter.computed(() => src() + i))

      // Layer 2: 4 computeds, each reading two of l1
      const l2 = [
        adapter.computed(() => l1[0]!() + l1[1]!()),
        adapter.computed(() => l1[1]!() + l1[2]!()),
        adapter.computed(() => l1[2]!() + l1[3]!()),
        adapter.computed(() => l1[3]!() + l1[0]!()),
      ]

      // Layers 3 and 4: same pattern
      const l3 = [
        adapter.computed(() => l2[0]!() + l2[1]!()),
        adapter.computed(() => l2[1]!() + l2[2]!()),
        adapter.computed(() => l2[2]!() + l2[3]!()),
        adapter.computed(() => l2[3]!() + l2[0]!()),
      ]
      const l4 = [
        adapter.computed(() => l3[0]!() + l3[1]!()),
        adapter.computed(() => l3[1]!() + l3[2]!()),
        adapter.computed(() => l3[2]!() + l3[3]!()),
        adapter.computed(() => l3[3]!() + l3[0]!()),
      ]

      // One terminal sink: an effect that reads l4[0] (forces propagation
      // all the way to the leaf on each write).
      let sink = 0
      const dispose = adapter.effect(() => {
        sink = l4[0]!() + l4[1]!() + l4[2]!() + l4[3]!()
      })
      // Avoid dead-code elimination removing the read.
      ;(globalThis as { __cellxSink?: number }).__cellxSink = sink

      let counter = 0
      return {
        run: () => {
          counter++
          setSrc(counter)
        },
        dispose,
      }
    })

    return {
      run: ctx.value.run,
      cleanup: () => {
        ctx.value.dispose()
        ctx.dispose()
      },
    }
  },
}
