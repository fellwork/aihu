import type { SignalAdapter, WorkloadDefinition } from '../types.ts'

/**
 * Creation throughput — port of solid-js' `createComputations1to1000`
 * shape from `packages/solid/bench/bench.cjs`.
 *
 * One source signal; `N=1000` computeds, each reading the source.
 * Measure **creation cost only** — no writes. Each op constructs the
 * graph and immediately disposes it, so the timed work is allocation +
 * subscription wiring, NOT propagation.
 *
 * Why this shape: setup cost matters for large lists (think Solid's
 * krausest entry creating 10k row signals). Solid optimises creation
 * aggressively; we have no creation benchmark today. This closes that
 * receipt. The 1000-fanout means every per-edge constant cost in the
 * subscriber graph is multiplied 1000× — a sensitive indicator.
 *
 * Note: cleanup runs disposers per iteration so the next op starts
 * from a clean owner. mitata's per-op resolution is ms-scale here
 * (creation of 1001 nodes is not nanosecond-cheap), which is fine.
 */
export const creation1to1000: WorkloadDefinition = {
  name: 'creation-1to1000',
  description: '1 signal × 1000 computeds creation cost (solid-js createComputations1to1000)',
  build(adapter: SignalAdapter) {
    const N = 1000
    // setup() carries no graph state — each op builds a fresh graph
    // and tears it down. The outer setup() exists only so libs that
    // require an owner (Solid, S.js) get one for the per-op `setup()`s
    // we do internally.
    const ctx = adapter.setup(() => {
      let counter = 0
      const run = (): void => {
        counter++
        const inner = adapter.setup(() => {
          const [src] = adapter.signal(counter)
          const computeds: Array<() => number> = []
          for (let i = 0; i < N; i++) {
            const idx = i
            computeds.push(adapter.computed(() => src() + idx))
          }
          // Force the read so the dep edges are actually wired —
          // libs that lazily subscribe wouldn't otherwise pay the
          // creation cost. Sum into a global sink to defeat DCE.
          let sink = 0
          for (let i = 0; i < N; i++) {
            const c = computeds[i]
            if (c) sink += c()
          }
          ;(globalThis as { __creationSink?: number }).__creationSink = sink
          return null
        })
        // Tear the inner owner down so this op doesn't leak into the
        // next sample.
        inner.dispose()
      }
      return { run, dispose: () => {} }
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
