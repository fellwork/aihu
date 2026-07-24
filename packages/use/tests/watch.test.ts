/**
 * Unit tests for `watch` (effect-scope plan §5, Tier 0): lazy-by-default
 * semantics, `immediate`/`once` options, old/new value passing, per-run
 * `onCleanup`, scope-driven disposal, and the SSR no-op path (simulated
 * `!isClient` via module re-evaluation). jsdom environment (root vitest
 * config).
 */
import { effectScope, signal } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { watch } from '../src/watch/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/watch', () => {
  it('is lazy by default — the callback does NOT run at creation', () => {
    const [count] = signal(0)
    const seen: Array<[number, number | undefined]> = []
    watch(
      () => count(),
      (value, oldValue) => seen.push([value, oldValue]),
    )
    expect(seen).toEqual([])
  })

  it('invokes the callback on a subsequent change, with old and new values', () => {
    const [count, setCount] = signal(0)
    const seen: Array<[number, number | undefined]> = []
    watch(
      () => count(),
      (value, oldValue) => seen.push([value, oldValue]),
    )

    setCount(1)
    expect(seen).toEqual([[1, 0]])

    setCount(2)
    expect(seen).toEqual([
      [1, 0],
      [2, 1],
    ])
  })

  it('immediate: true invokes once synchronously at creation with oldValue undefined', () => {
    const [count, setCount] = signal(5)
    const seen: Array<[number, number | undefined]> = []
    watch(
      () => count(),
      (value, oldValue) => seen.push([value, oldValue]),
      { immediate: true },
    )
    expect(seen).toEqual([[5, undefined]])

    setCount(6)
    expect(seen).toEqual([
      [5, undefined],
      [6, 5],
    ])
  })

  it('once: true (lazy) stops after the first real change — later changes are not observed', () => {
    const [count, setCount] = signal(0)
    const seen: number[] = []
    watch(
      () => count(),
      (value) => seen.push(value),
      { once: true },
    )

    setCount(1)
    setCount(2)
    setCount(3)
    expect(seen).toEqual([1])
  })

  it('once: true + immediate: true stops after the immediate call — a later change is never observed', () => {
    const [count, setCount] = signal(0)
    const seen: number[] = []
    watch(
      () => count(),
      (value) => seen.push(value),
      { immediate: true, once: true },
    )
    expect(seen).toEqual([0])

    setCount(1)
    expect(seen).toEqual([0])
  })

  it('shallow/reference comparison: a new object every read still fires (no deep-equal skip)', () => {
    const [obj, setObj] = signal({ n: 0 })
    const seen: Array<{ n: number }> = []
    watch(
      () => obj(),
      (value) => seen.push(value),
    )
    setObj({ n: 0 }) // structurally equal, but a NEW reference
    expect(seen).toEqual([{ n: 0 }])
  })

  it('value-equality gate: a derived/boolean source does not fire when the VALUE is unchanged', () => {
    // Regression: the effect body re-runs on every DEPENDENCY change
    // (count 6 -> 7), but a derived source's RESULT (count() > 5) does not
    // change across that transition — watch must not invoke the callback.
    const [count, setCount] = signal(6)
    const seen: Array<[boolean, boolean | undefined]> = []
    watch(
      () => count() > 5,
      (value, oldValue) => seen.push([value, oldValue]),
    )

    setCount(7) // dependency changes, but count() > 5 stays `true`
    expect(seen).toEqual([])

    setCount(3) // now the derived VALUE actually changes: true -> false
    expect(seen).toEqual([[false, true]])
  })

  it('callback runs untracked: reading an unrelated signal inside it does not become a dependency', () => {
    // Regression: if the callback ran tracked (inside the watcher effect),
    // reading `other` here would make the watcher re-fire whenever `other`
    // changes, even though `other` is unrelated to `count`.
    const [count, setCount] = signal(0)
    const [other, setOther] = signal('a')
    const seen: number[] = []
    watch(
      () => count(),
      (value) => {
        other() // read, but must not be tracked by the watcher
        seen.push(value)
      },
    )

    setCount(1)
    expect(seen).toEqual([1])

    setOther('b') // unrelated signal change — must NOT re-fire the watcher
    expect(seen).toEqual([1])
  })

  it('callback runs untracked: a read-modify-write on an unrelated signal inside it does not throw', () => {
    // Regression: a tracked callback would throw SignalCircularError here —
    // the write marks the watcher's own effect (which just read `tally`
    // while tracked) as needing to re-run while it is still RUNNING.
    const [count, setCount] = signal(0)
    const [tally, setTally] = signal(0)
    watch(
      () => count(),
      () => {
        setTally(tally() + 1)
      },
    )

    expect(() => setCount(1)).not.toThrow()
    expect(tally()).toBe(1)
    expect(() => setCount(2)).not.toThrow()
    expect(tally()).toBe(2)
  })

  it('onCleanup registers a callback that runs before the NEXT invocation', () => {
    const [count, setCount] = signal(0)
    const cleanups: number[] = []
    watch(
      () => count(),
      (value, _old, onCleanup) => {
        onCleanup(() => cleanups.push(value))
      },
    )

    setCount(1)
    expect(cleanups).toEqual([])
    setCount(2)
    expect(cleanups).toEqual([1])
  })

  it('onCleanup registered by a change runs on stop()', () => {
    const [count, setCount] = signal(0)
    const cleanups: number[] = []
    const stop = watch(
      () => count(),
      (value, _old, onCleanup) => {
        onCleanup(() => cleanups.push(value))
      },
    )

    setCount(1)
    expect(cleanups).toEqual([])
    stop()
    expect(cleanups).toEqual([1])
  })

  it('the returned stop() is idempotent and prevents further invocations', () => {
    const [count, setCount] = signal(0)
    const seen: number[] = []
    const stop = watch(
      () => count(),
      (value) => seen.push(value),
    )

    setCount(1)
    stop()
    stop() // idempotent — no throw, no double-teardown effect
    setCount(2)
    expect(seen).toEqual([1])
  })

  it('scope.stop() disposes the watcher — no further invocations after scope teardown', () => {
    const [count, setCount] = signal(0)
    const seen: number[] = []
    const scope = effectScope()
    scope.run(() =>
      watch(
        () => count(),
        (value) => seen.push(value),
      ),
    )

    setCount(1)
    expect(seen).toEqual([1])

    scope.stop()
    setCount(2)
    expect(seen).toEqual([1])
  })
})

describe('@aihu/use/watch — SSR no-op path', () => {
  it('with isClient false, registers nothing and never invokes the callback (not even immediate)', () =>
    withSSR(
      () => import('../src/watch/index.ts'),
      (mod) => {
        const callback = () => {
          throw new Error('callback must not run under SSR')
        }
        let stop: (() => void) | undefined
        expect(() => {
          stop = mod.watch(() => 1, callback, { immediate: true })
        }).not.toThrow()
        expect(() => stop?.()).not.toThrow()
      },
    ))
})
