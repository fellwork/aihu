import type { SignalAdapter, WorkloadDefinition } from '../types.ts'

/**
 * Wide fanout — Phase 2 retro's canonical concern. One signal feeds
 * 100 cheap computeds; each computed is read by an effect. One source
 * write per op; we measure how long it takes for all 100 effects to
 * have re-run.
 *
 * Why 100 and not 1000: at 1000 the per-op time crosses milliseconds
 * for some libs and mitata's variance grows. 100 is the smallest size
 * where the fanout-cost shape is visibly distinct from cellx. If a
 * future regression suggests 1000 is needed for headroom, bump there.
 *
 * The verification report's concern was: "for pathological fan-out (one
 * signal feeding 1000 cheap computeds, each subscribed by an effect),
 * the equal-recompute cost is paid even when the result is suppressed."
 * This workload writes a *new* value each iteration so equality
 * suppression doesn't hide work — every effect must run.
 */
export const wideFanout100: WorkloadDefinition = {
  name: 'wide-fanout-100',
  description: '1 signal → 100 computeds → 100 effects',
  build(adapter: SignalAdapter) {
    const N = 100
    const ctx = adapter.setup(() => {
      const [src, setSrc] = adapter.signal(0)

      const disposers: Array<() => void> = []
      let totalRuns = 0
      for (let i = 0; i < N; i++) {
        const c = adapter.computed(() => src() + i)
        const d = adapter.effect(() => {
          // Read the computed so the effect actually subscribes.
          // Sum into totalRuns so V8 can't dead-code eliminate it.
          totalRuns += c()
        })
        disposers.push(d)
      }
      ;(globalThis as { __fanoutRuns?: number }).__fanoutRuns = totalRuns

      let counter = 0
      return {
        run: () => {
          counter++
          setSrc(counter)
        },
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
