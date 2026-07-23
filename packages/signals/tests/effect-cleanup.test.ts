import { describe, expect, it, vi } from 'vitest'
import { type Dispose, effect } from '../src/effect.ts'
import { signal } from '../src/signal.ts'

// Per-run cleanup (effect-scope plan §1). Every test here runs WITHOUT any
// scope: cleanups are a property of the effect itself, and the no-scope
// path must behave identically to the pre-scope core.
describe('effect per-run cleanup', () => {
  it('cleanup registered in run N fires before run N+1', () => {
    const [n, setN] = signal(0)
    const order: string[] = []
    effect((onCleanup) => {
      const v = n()
      order.push(`run:${v}`)
      onCleanup(() => order.push(`cleanup:${v}`))
    })
    expect(order).toEqual(['run:0'])
    setN(1)
    expect(order).toEqual(['run:0', 'cleanup:0', 'run:1'])
    setN(2)
    expect(order).toEqual(['run:0', 'cleanup:0', 'run:1', 'cleanup:1', 'run:2'])
  })

  it('pending cleanup fires on manual dispose (no scope involved)', () => {
    const [n, setN] = signal(0)
    let cleanupFires = 0
    const dispose = effect((onCleanup) => {
      n()
      onCleanup(() => cleanupFires++)
    })
    expect(cleanupFires).toBe(0)
    dispose()
    expect(cleanupFires).toBe(1)
    // Idempotent dispose does not re-fire.
    dispose()
    expect(cleanupFires).toBe(1)
    setN(1)
    expect(cleanupFires).toBe(1)
  })

  it('multiple cleanups from one run all fire, in registration order', () => {
    const order: string[] = []
    const dispose = effect((onCleanup) => {
      onCleanup(() => order.push('a'))
      onCleanup(() => order.push('b'))
      onCleanup(() => order.push('c'))
    })
    expect(order).toEqual([])
    dispose()
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('cleanup is not double-fired on self-dispose-mid-run', () => {
    const [n, setN] = signal(0)
    let cleanupFires = 0
    let dispose: Dispose | null = null
    dispose = effect((onCleanup) => {
      const v = n()
      onCleanup(() => cleanupFires++)
      if (v === 1) dispose!() // self-dispose mid-run (re-run only)
    })
    expect(cleanupFires).toBe(0)
    setN(1)
    // Run 2: drains run-1's cleanup before re-running (fire 1), registers
    // a new cleanup, then self-disposes — dispose() drains the pending
    // cleanup (fire 2). The post-run path must NOT drain again.
    expect(cleanupFires).toBe(2)
    setN(2)
    expect(cleanupFires).toBe(2)
  })

  it('cleanup fires on first-run-throw (dispose covers the throw path)', () => {
    let cleanupFires = 0
    expect(() =>
      effect((onCleanup) => {
        onCleanup(() => cleanupFires++)
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(cleanupFires).toBe(1)
  })

  it('throwing cleanup: remaining cleanups still run; first error rethrown', () => {
    const ran: string[] = []
    const dispose = effect((onCleanup) => {
      onCleanup(() => {
        ran.push('a')
        throw new Error('boom-a')
      })
      onCleanup(() => {
        ran.push('b')
        throw new Error('boom-b')
      })
      onCleanup(() => {
        ran.push('c')
      })
    })
    expect(() => dispose()).toThrow('boom-a')
    expect(ran).toEqual(['a', 'b', 'c'])
  })

  it('zero-arg effect bodies remain assignable and behave unchanged', () => {
    const [n, setN] = signal(0)
    let runs = 0
    const dispose = effect(() => {
      n()
      runs++
    })
    expect(runs).toBe(1)
    setN(1)
    expect(runs).toBe(2)
    dispose()
    setN(2)
    expect(runs).toBe(2)
  })

  it('cleanup registered AFTER self-dispose in the same run still fires (post-run drain)', () => {
    const [n, setN] = signal(0)
    let fires = 0
    let dispose: Dispose | null = null
    dispose = effect((onCleanup) => {
      const v = n()
      if (v === 1) {
        dispose!() // self-dispose FIRST...
        onCleanup(() => fires++) // ...then register — dispose's drain missed it
      }
    })
    setN(1)
    // Drained by the post-run DISPOSED branch — not silently dropped.
    expect(fires).toBe(1)
    setN(2)
    expect(fires).toBe(1)
  })

  it('self-dispose mid-run + same-run effect creation: distinct nodes, no cross-fire', () => {
    // RUNNING gate on pool.push: the mid-run-disposed node must NOT enter
    // the pool while it is still the executing node — a same-run effect()
    // would pop it, reset its flags (erasing DISPOSED, defeating the
    // trackVer poison), and cross-wire two lifecycles onto one node.
    const [n, setN] = signal(0)
    const aRuns: number[] = []
    const bRuns: number[] = []
    let lateCleanupFires = 0
    let bDispose: Dispose | null = null
    let dispose: Dispose | null = null
    dispose = effect((onCleanup) => {
      const v = n()
      aRuns.push(v)
      if (v === 1) {
        dispose!() // mid-run self-dispose
        bDispose = effect(() => {
          bRuns.push(n())
        }) // pre-fix this popped A's still-running node
        onCleanup(() => lateCleanupFires++) // lands on A's dead node
      }
    })
    expect(aRuns).toEqual([0])
    setN(1)
    expect(aRuns).toEqual([0, 1])
    expect(bRuns).toEqual([1])
    // The late cleanup fired once via A's post-run drain — not parked on B.
    expect(lateCleanupFires).toBe(1)
    setN(2)
    expect(aRuns).toEqual([0, 1]) // A stays dead
    expect(bRuns).toEqual([1, 2]) // B re-runs on its own node
    expect(lateCleanupFires).toBe(1) // no cross-fire onto B's re-run
    bDispose!()
    setN(3)
    expect(bRuns).toEqual([1, 2])
  })

  it('first-run-throw: a throwing cleanup does not mask the original fn error', () => {
    let fires = 0
    expect(() =>
      effect((onCleanup) => {
        onCleanup(() => {
          fires++
          throw new Error('cleanup-boom')
        })
        throw new Error('fn-boom')
      }),
    ).toThrow('fn-boom')
    expect(fires).toBe(1)
  })

  it('onCleanup stashed and called outside a run is dropped with a dev warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let stashed: ((fn: () => void) => void) | null = null
    let fires = 0
    const dispose = effect((onCleanup) => {
      stashed = onCleanup
    })
    stashed!(() => fires++) // misuse: no effect is running
    expect(warn).toHaveBeenCalledOnce()
    dispose()
    expect(fires).toBe(0) // dropped, never registered anywhere
    warn.mockRestore()
  })

  it('pooled node reuse: cleanups from a disposed lifecycle never leak into the next', () => {
    const [n, setN] = signal(0)
    let staleFires = 0
    const disposeA = effect((onCleanup) => {
      n()
      onCleanup(() => staleFires++)
    })
    disposeA() // fires once, node returns to the pool with cleanups nulled
    expect(staleFires).toBe(1)
    // B likely reuses A's pooled node; it must start with no cleanups.
    const bRuns: number[] = []
    const disposeB = effect(() => {
      bRuns.push(n())
    })
    setN(1)
    expect(staleFires).toBe(1)
    expect(bRuns).toEqual([0, 1])
    disposeB()
    expect(staleFires).toBe(1)
  })
})
