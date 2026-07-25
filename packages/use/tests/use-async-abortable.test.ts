/**
 * Unit tests for `useAsyncAbortable` (effect-scope plan §5): `AbortSignal`
 * wiring, a new `execute()` aborting the in-flight call, `abort()`, scope
 * dispose aborting, dropped abort errors, and the SSR-static path
 * (simulated `!isClient` via module re-evaluation). jsdom environment
 * (root vitest config).
 */
import { effectScope } from '@aihu/signals'
import { describe, expect, it, vi } from 'vitest'
import { useAsyncAbortable } from '../src/useAsyncAbortable/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useAsyncAbortable', () => {
  it('passes an AbortSignal to fn', async () => {
    const fn = vi.fn(async (signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal)
      return 'ok'
    })
    const { execute } = useAsyncAbortable(fn, { immediate: false })
    await execute()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('a new execute() aborts the previous in-flight call', async () => {
    let firstSignal: AbortSignal | undefined
    const fn = vi
      .fn()
      .mockImplementationOnce(async (signal: AbortSignal) => {
        firstSignal = signal
        return new Promise(() => {}) // never resolves on its own
      })
      .mockImplementationOnce(async () => 'second')
    const { execute, data } = useAsyncAbortable(fn, { immediate: false })

    const p1 = execute()
    expect(firstSignal?.aborted).toBe(false)
    const p2 = execute()
    expect(firstSignal?.aborted).toBe(true)
    await p2
    expect(data()).toBe('second')
    // The first call's promise never settles (by design of the test double)
    // — nothing further to await on p1; abort() already dropped its result.
    void p1
  })

  it('an aborted call rejection is silently dropped (not surfaced as error)', async () => {
    const fn = vi.fn((signal: AbortSignal) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })
    const { execute, error, abort } = useAsyncAbortable(fn, { immediate: false })
    const p = execute()
    abort()
    const result = await p
    expect(result).toBeUndefined()
    expect(error()).toBeUndefined()
  })

  it('a standalone abort() (no superseding execute()) clears isLoading/isFinished', async () => {
    const fn = vi.fn((signal: AbortSignal) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })
    const { execute, abort, isLoading, isFinished, error } = useAsyncAbortable(fn, {
      immediate: false,
    })
    const p = execute()
    expect(isLoading()).toBe(true)
    expect(isFinished()).toBe(false)
    abort()
    await p
    // Regression: previously isLoading stayed true and isFinished stayed
    // false forever after a standalone abort, since both settle paths
    // returned before clearing them.
    expect(isLoading()).toBe(false)
    expect(isFinished()).toBe(true)
    expect(error()).toBeUndefined()
  })

  it('a standalone abort() where fn resolves anyway (swallowed signal) also clears isLoading/isFinished', async () => {
    const fn = vi.fn(async (signal: AbortSignal) => {
      await new Promise((resolve) => signal.addEventListener('abort', () => resolve(undefined)))
      return 'ignored'
    })
    const { execute, abort, isLoading, isFinished, data } = useAsyncAbortable(fn, {
      immediate: false,
    })
    const p = execute()
    abort()
    await p
    expect(isLoading()).toBe(false)
    expect(isFinished()).toBe(true)
    // Data must NOT be populated from an aborted call, even a swallowed one.
    expect(data()).toBeUndefined()
  })

  it('abort() with no in-flight call is a no-op', () => {
    const { abort } = useAsyncAbortable(async () => 'x', { immediate: false })
    expect(() => abort()).not.toThrow()
  })

  it('scope disposal aborts the in-flight call', () => {
    let signal: AbortSignal | undefined
    const fn = vi.fn((s: AbortSignal) => {
      signal = s
      return new Promise(() => {})
    })
    const scope = effectScope()
    const ret = scope.run(() => useAsyncAbortable(fn, { immediate: false })) as ReturnType<
      typeof useAsyncAbortable
    >
    void ret.execute()
    expect(signal?.aborted).toBe(false)
    scope.stop()
    expect(signal?.aborted).toBe(true)
  })

  it('a real successful (non-aborted) call still resolves normally', async () => {
    const { execute, data, error, isFinished } = useAsyncAbortable(async () => 'value', {
      immediate: false,
    })
    const result = await execute()
    expect(result).toBe('value')
    expect(data()).toBe('value')
    expect(error()).toBeUndefined()
    expect(isFinished()).toBe(true)
  })
})

describe('@aihu/use/useAsyncAbortable — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, execute()/abort() never call fn and getters stay static', () =>
    withSSR(
      () => import('../src/useAsyncAbortable/index.ts'),
      async (mod) => {
        const fn = vi.fn(async () => 'x')
        const { data, isLoading, execute, abort } = mod.useAsyncAbortable(fn, {
          initialData: 'seed',
        })
        expect(fn).not.toHaveBeenCalled()
        expect(data()).toBe('seed')
        expect(isLoading()).toBe(false)
        expect(() => abort()).not.toThrow()
        const result = await execute()
        expect(result).toBeUndefined()
        expect(fn).not.toHaveBeenCalled()
      },
    ))
})
