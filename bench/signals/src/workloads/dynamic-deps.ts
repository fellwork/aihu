// biome-ignore-all lint/style/noNonNullAssertion: source pool indexes are
// computed via `% N` and are always in bounds; the assertion is fine.
import type { SignalAdapter, WorkloadDefinition } from '../types.ts'

/**
 * Dynamic dependencies — port of `kairoBench` from
 * transitive-bullshit/js-reactivity-benchmark.
 *
 * 50 source signals; 1 selector signal; 1 computed that reads the
 * selector and then 5 of the 50 sources, picked by `selector + offset`.
 * The computed's read pattern shifts as `selector` changes — the set
 * of upstream deps is *not* fixed across iterations.
 *
 * One iteration: bump every source signal once, then bump the selector,
 * then read the computed (an effect ensures the read happens).
 *
 * Why this shape: forward-subscription models (alien, scribe) historically
 * beat owner-tree models (Solid) on dynamic-dep workloads because they
 * track edges as pointers (or in scribe's case, links) rather than
 * paying tree-rewrite cost on each subscribe/unsubscribe. We never
 * measured this directly. The kairo shape is the canonical "subscription
 * set churn" workload.
 *
 * Sized at 50 sources / 5 reads-per-computed so per-op time is ~µs and
 * the mix of (constant write cost) + (dynamic read cost) is meaningful.
 */
export const dynamicDeps: WorkloadDefinition = {
  name: 'dynamic-deps',
  description: '1 computed reads 5 of 50 signals, set rotates per op (alien-signals kairoBench)',
  build(adapter: SignalAdapter) {
    const N = 50
    const READS = 5
    const ctx = adapter.setup(() => {
      const sources: Array<readonly [() => number, (v: number) => void]> = []
      for (let i = 0; i < N; i++) sources.push(adapter.signal(i))
      const [selector, setSelector] = adapter.signal(0)

      // Computed that reads the selector and then `READS` source signals.
      // The selector picks the offset; deps shift as selector advances.
      const sum = adapter.computed(() => {
        const off = selector()
        let acc = 0
        for (let i = 0; i < READS; i++) {
          const idx = (off + i) % N
          acc += sources[idx]![0]()
        }
        return acc
      })

      // Effect subscribes to sum so writes propagate.
      let sink = 0
      const dispose = adapter.effect(() => {
        sink = sum()
      })
      ;(globalThis as { __dynamicSink?: number }).__dynamicSink = sink

      let counter = 0
      const writeAll = (): void => {
        counter++
        // Bump every source so the dependency-tracking machinery has
        // to either propagate or skip; this is the "all-sources-changed"
        // worst case kairo measures.
        for (let i = 0; i < N; i++) sources[i]![1](counter + i)
        // Rotate which 5 sources the computed reads.
        setSelector(counter % N)
      }

      // Honour the adapter's batch primitive when available; without it,
      // libs run synchronously which is the comparison kairo intends.
      const adapterBatch = adapter.batch
      const run = adapterBatch ? () => adapterBatch(writeAll) : writeAll

      return {
        run,
        dispose,
      }
    })

    return {
      run: ctx.value.run,
      cleanup: (): void => {
        ctx.value.dispose()
        ctx.dispose()
      },
    }
  },
}
