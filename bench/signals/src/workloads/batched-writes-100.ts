import type { SignalAdapter, WorkloadDefinition } from '../types.ts'

/**
 * Batched writes — 100 signals each subscribed by exactly one effect.
 * One `batch()` call writes all 100 signals; we measure the flush.
 *
 * For libs without a `batch` primitive (alien-signals), we run the
 * 100 writes back-to-back without batching. This shows what the lib's
 * default coalescing is, not what its batch could be — the comparison
 * is "what's the wall-clock for 100 writes" regardless of mechanism.
 * That's fair: a library with implicit synchronous flush *should* still
 * be fast at this shape.
 */
export const batchedWrites100: WorkloadDefinition = {
  name: 'batched-writes-100',
  description: '100 signal writes inside one batch() (or sequential if no batch)',
  build(adapter: SignalAdapter) {
    const N = 100
    const ctx = adapter.setup(() => {
      const cells: Array<[() => number, (v: number) => void]> = []
      const disposers: Array<() => void> = []
      let totalRuns = 0
      for (let i = 0; i < N; i++) {
        const [get, set] = adapter.signal(0)
        cells.push([get, set])
        const d = adapter.effect(() => {
          totalRuns += get()
        })
        disposers.push(d)
      }
      ;(globalThis as { __batchRuns?: number }).__batchRuns = totalRuns

      let counter = 0
      const writeAll = (): void => {
        counter++
        for (let i = 0; i < N; i++) {
          const cell = cells[i]
          if (cell) cell[1](counter)
        }
      }
      const adapterBatch = adapter.batch
      const run = adapterBatch ? () => adapterBatch(writeAll) : writeAll

      return {
        run,
        dispose: () => {
          for (const d of disposers) d()
        },
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
