/**
 * Unit tests for `useKeyedAsync` (effect-scope plan §5): key-driven
 * fetch-on-change, synchronous clear-on-key-change (never
 * stale-while-revalidate), superseded-key result/rejection dropping,
 * abort-on-key-change, `reload()`, the `null`/`undefined` "nothing to
 * fetch" key, and the SSR-static path. jsdom environment (root vitest
 * config).
 */
import { effectScope, signal } from '@aihu/signals'
import { describe, expect, it, vi } from 'vitest'
import { useKeyedAsync } from '../src/useKeyedAsync/index.ts'
import { withSSR } from './_ssr.ts'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
} {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('@aihu/use/useKeyedAsync', () => {
  it('fetches immediately for the initial key', async () => {
    const fn = vi.fn(async (k: string) => `data:${k}`)
    const [key] = signal('a')
    const { data, isLoading } = useKeyedAsync(key, fn)
    expect(fn).toHaveBeenCalledWith('a', expect.any(AbortSignal))
    expect(isLoading()).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(isLoading()).toBe(false)
    expect(data()).toBe('data:a')
  })

  it('refetches when the key changes', async () => {
    const fn = vi.fn(async (k: string) => `data:${k}`)
    const [key, setKey] = signal('a')
    const { data } = useKeyedAsync(key, fn)
    await Promise.resolve()
    await Promise.resolve()
    expect(data()).toBe('data:a')

    setKey('b')
    await Promise.resolve()
    await Promise.resolve()
    expect(data()).toBe('data:b')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  // The property that distinguishes this from useAsync/useAsyncAbortable:
  // data is cleared THE INSTANT the key changes, not when the new fetch
  // resolves — never stale-while-revalidate.
  it('clears data synchronously on key change, before the new fetch resolves', async () => {
    const d1 = deferred<string>()
    const d2 = deferred<string>()
    const fn = vi.fn((k: string) => (k === 'a' ? d1.promise : d2.promise))
    const [key, setKey] = signal('a')
    const { data } = useKeyedAsync(key, fn)

    d1.resolve('data-for-a')
    await Promise.resolve()
    await Promise.resolve()
    expect(data()).toBe('data-for-a')

    setKey('b')
    // Cleared IMMEDIATELY — not after the new fetch resolves (it never does here).
    expect(data()).toBeUndefined()
    void d2 // never resolved in this test
  })

  it('drops a response that arrives for a superseded key', async () => {
    const d1 = deferred<string>()
    const d2 = deferred<string>()
    const fn = vi.fn((k: string) => (k === 'a' ? d1.promise : d2.promise))
    const [key, setKey] = signal('a')
    const { data } = useKeyedAsync(key, fn)

    setKey('b') // supersedes 'a' before it resolves
    d1.resolve('STALE-A')
    await Promise.resolve()
    await Promise.resolve()
    expect(data()).not.toBe('STALE-A')

    d2.resolve('FRESH-B')
    await Promise.resolve()
    await Promise.resolve()
    expect(data()).toBe('FRESH-B')
  })

  it("aborts the previous key's in-flight request on key change", async () => {
    let firstSignal: AbortSignal | undefined
    const fn = vi
      .fn()
      .mockImplementationOnce(async (_k: string, signal: AbortSignal) => {
        firstSignal = signal
        return new Promise(() => {}) // never resolves on its own
      })
      .mockImplementationOnce(async () => 'second')
    const [key, setKey] = signal('a')
    useKeyedAsync(key, fn)
    expect(firstSignal?.aborted).toBe(false)

    setKey('b')
    expect(firstSignal?.aborted).toBe(true)
  })

  // An aborted call's rejection must not surface as `error` — same rule as
  // useAsyncAbortable (an abort is not a failure).
  it("an aborted call's rejection is silently dropped, not surfaced as error", async () => {
    const fn = vi.fn((_k: string, signal: AbortSignal) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })
    const [key, setKey] = signal('a')
    const { error } = useKeyedAsync(key, fn)
    setKey('b')
    await Promise.resolve()
    await Promise.resolve()
    expect(error()).toBeUndefined()
  })

  it('a genuine (non-abort) rejection populates error() for the current key', async () => {
    const boom = new Error('boom')
    const fn = vi.fn(async () => {
      throw boom
    })
    const [key] = signal('a')
    const { error, isFinished } = useKeyedAsync(key, fn)
    await Promise.resolve()
    await Promise.resolve()
    expect(error()).toBe(boom)
    expect(isFinished()).toBe(true)
  })

  // key() => null/undefined means "nothing to fetch": no request, no
  // loading state, and any prior data/error is cleared.
  it('a null/undefined key clears state and calls fn zero times', async () => {
    const fn = vi.fn(async () => 'x')
    const [key, setKey] = signal<string | null>('a')
    const { data, isLoading } = useKeyedAsync(key, fn)
    await Promise.resolve()
    await Promise.resolve()
    expect(data()).toBe('x')

    setKey(null)
    expect(data()).toBeUndefined()
    expect(isLoading()).toBe(false)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  describe('reload()', () => {
    it('re-fetches the current key WITHOUT clearing data first', async () => {
      let n = 0
      const fn = vi.fn(async () => `v${++n}`)
      const [key] = signal('a')
      const { data, reload } = useKeyedAsync(key, fn)
      await Promise.resolve()
      await Promise.resolve()
      expect(data()).toBe('v1')

      const d = deferred<string>()
      fn.mockReturnValueOnce(d.promise)
      reload()
      // NOT cleared during the in-flight reload.
      expect(data()).toBe('v1')
      d.resolve('v2')
      await Promise.resolve()
      await Promise.resolve()
      expect(data()).toBe('v2')
    })

    it('is a no-op when the current key is null/undefined', () => {
      const fn = vi.fn(async () => 'x')
      const [key] = signal<string | null>(null)
      const { reload } = useKeyedAsync(key, fn)
      reload()
      expect(fn).not.toHaveBeenCalled()
    })
  })

  it('onSuccess/onError callbacks fire for the current key only', async () => {
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const [key] = signal('a')
    useKeyedAsync(key, async () => 42, { onSuccess, onError })
    await Promise.resolve()
    await Promise.resolve()
    expect(onSuccess).toHaveBeenCalledWith(42)
    expect(onError).not.toHaveBeenCalled()
  })

  it('scope disposal aborts the in-flight call', () => {
    let sig: AbortSignal | undefined
    const fn = vi.fn((_k: string, signal: AbortSignal) => {
      sig = signal
      return new Promise(() => {})
    })
    const [key] = signal('a')
    const scope = effectScope()
    scope.run(() => useKeyedAsync(key, fn))
    expect(sig?.aborted).toBe(false)
    scope.stop()
    expect(sig?.aborted).toBe(true)
  })
})

describe('@aihu/use/useKeyedAsync — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, fn is never called and getters stay static', () =>
    withSSR(
      () => import('../src/useKeyedAsync/index.ts'),
      async (mod) => {
        const fn = vi.fn(async () => 'x')
        const { data, isLoading, isFinished, reload } = mod.useKeyedAsync(() => 'a', fn, {
          initialData: 'seed',
        })
        expect(fn).not.toHaveBeenCalled()
        expect(data()).toBe('seed')
        expect(isLoading()).toBe(false)
        expect(isFinished()).toBe(false)
        expect(() => reload()).not.toThrow()
        expect(fn).not.toHaveBeenCalled()
      },
    ))
})
