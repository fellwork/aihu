/**
 * Unit tests for `useAsync` (effect-scope plan §5): immediate execution,
 * manual `execute()`, success/error state, superseded-call dropping, the
 * `resetOnExecute` option, and the SSR-static path (simulated `!isClient`
 * via module re-evaluation). jsdom environment (root vitest config).
 */
import { describe, expect, it, vi } from 'vitest'
import { useAsync } from '../src/useAsync/index.ts'
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

describe('@aihu/use/useAsync', () => {
  it('immediate (default) fires one zero-arg execute() call right away', async () => {
    const fn = vi.fn(async () => 'result')
    const { data, isLoading, isFinished } = useAsync(fn)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(isLoading()).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(isLoading()).toBe(false)
    expect(isFinished()).toBe(true)
    expect(data()).toBe('result')
  })

  it('immediate: false does not call fn until execute() is invoked', async () => {
    const fn = vi.fn(async () => 'x')
    const { execute, data } = useAsync(fn, { immediate: false })
    expect(fn).not.toHaveBeenCalled()
    await execute()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(data()).toBe('x')
  })

  it('initialData seeds data() before the first resolve', () => {
    const { data } = useAsync(async () => 'later', { immediate: false, initialData: 'seed' })
    expect(data()).toBe('seed')
  })

  it('a rejected execute() populates error() and clears isLoading', async () => {
    const boom = new Error('boom')
    const fn = vi.fn(async () => {
      throw boom
    })
    const { error, isLoading, isFinished, execute } = useAsync(fn, { immediate: false })
    const result = await execute()
    expect(result).toBeUndefined()
    expect(error()).toBe(boom)
    expect(isLoading()).toBe(false)
    expect(isFinished()).toBe(true)
  })

  it('resetOnExecute (default) clears a previous error at the start of the next call', async () => {
    let shouldThrow = true
    const fn = vi.fn(async () => {
      if (shouldThrow) throw new Error('first')
      return 'second'
    })
    const { error, execute } = useAsync(fn, { immediate: false })
    await execute()
    expect(error()).toBeInstanceOf(Error)

    shouldThrow = false
    const p = execute()
    // Cleared synchronously at the start of the call, before `fn` resolves.
    expect(error()).toBeUndefined()
    await p
    expect(error()).toBeUndefined()
  })

  it('resetOnExecute: false keeps the previous error visible during a re-fetch', async () => {
    const fn = vi.fn(async () => {
      throw new Error('nope')
    })
    const { error, execute } = useAsync(fn, { immediate: false, resetOnExecute: false })
    await execute()
    const firstError = error()
    expect(firstError).toBeInstanceOf(Error)
    const p = execute()
    expect(error()).toBe(firstError) // not cleared yet
    await p
  })

  it('onSuccess/onError callbacks fire with the settled value', async () => {
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const { execute: executeOk } = useAsync(async () => 42, {
      immediate: false,
      onSuccess,
      onError,
    })
    await executeOk()
    expect(onSuccess).toHaveBeenCalledWith(42)
    expect(onError).not.toHaveBeenCalled()
  })

  it('a superseded (earlier) call is dropped when a newer call resolves first', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    let call = 0
    const fn = vi.fn(() => (call++ === 0 ? first.promise : second.promise))
    const { data, execute } = useAsync(fn, { immediate: false })

    const p1 = execute()
    const p2 = execute()
    // Resolve the NEWER call first, then the stale one.
    second.resolve('second-value')
    await p2
    expect(data()).toBe('second-value')
    first.resolve('first-value') // stale — must be dropped
    await p1
    expect(data()).toBe('second-value')
  })
})

describe('@aihu/use/useAsync — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, execute() never calls fn and getters stay static', () =>
    withSSR(
      () => import('../src/useAsync/index.ts'),
      async (mod) => {
        const fn = vi.fn(async () => 'x')
        const { data, isLoading, isFinished, execute } = mod.useAsync(fn, {
          initialData: 'seed',
        })
        expect(fn).not.toHaveBeenCalled()
        expect(data()).toBe('seed')
        expect(isLoading()).toBe(false)
        expect(isFinished()).toBe(false)
        const result = await execute()
        expect(result).toBeUndefined()
        expect(fn).not.toHaveBeenCalled()
      },
    ))
})
