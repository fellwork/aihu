import type { SignalAdapter, WorkloadDefinition } from '../types.ts'

/**
 * Deep propagation — port of `molBench` from
 * transitive-bullshit/js-reactivity-benchmark, the canonical cross-lib
 * harness alien-signals' README points at.
 *
 * One source signal feeds a 100-deep linear chain of computeds:
 *
 *   src -> c0 -> c1 -> ... -> c99 -> effect
 *
 * Each computed reads exactly the previous link plus a tiny pure
 * transform. One terminal effect reads the deepest link, forcing
 * end-to-end propagation on every source write.
 *
 * Why this shape: alien-signals' README headlines deep-chain wins; our
 * existing cellx is a 5-deep diamond that stresses dedup, not cascade
 * length. The mol shape exposes per-link constant-factor overhead —
 * the dual of cellx's structural-minimum work. Propagation systems
 * with O(depth) per-link bookkeeping (allocation per link) will show
 * super-linear scaling here; systems that walk a flat dep graph (scribe
 * post-Phase 2) stay linear.
 *
 * Sized at depth 100 so the per-op time is ~tens of µs — meaningful for
 * mitata's resolution and big enough that constant-factor differences
 * between libs are clearly distinguishable.
 */
export const deepPropagation100: WorkloadDefinition = {
  name: 'deep-propagation-100',
  description: '100-deep computed chain: src → c0 → c1 → … → c99 → effect (alien-signals molBench)',
  build(adapter: SignalAdapter) {
    const DEPTH = 100
    const ctx = adapter.setup(() => {
      const [src, setSrc] = adapter.signal(0)

      // Linear chain: each link reads the previous one. The `+ i` keeps
      // each computed distinct so a pessimistic optimiser can't fold
      // the chain into a single read.
      let prev: () => number = src
      for (let i = 0; i < DEPTH; i++) {
        const cap = prev
        const idx = i
        prev = adapter.computed(() => cap() + idx)
      }
      const tail = prev

      // Terminal effect — forces the chain to settle to the leaf on
      // every source write. Sum into a global so V8 doesn't dead-code-
      // eliminate the read.
      let sink = 0
      const dispose = adapter.effect(() => {
        sink = tail()
      })
      ;(globalThis as { __deepSink?: number }).__deepSink = sink

      let counter = 0
      return {
        run: (): void => {
          counter++
          setSrc(counter)
        },
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
