/**
 * Unit tests for `useClipboard` (effect-scope plan §5): `copy()` writing
 * through `navigator.clipboard`, the transient `copied()` flag, ` isSupported()`,
 * and the SSR-static path. jsdom environment (root vitest config).
 *
 * Depends on `useSupported` (a sibling composable landing in the same
 * fan-out) — this file exercises `useClipboard` against a stubbed
 * `navigator.clipboard`, not `useSupported`'s own detection logic.
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClipboard } from '../src/useClipboard/index.ts'
import { withSSR } from './_ssr.ts'

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
})

afterEach(() => {
  vi.useRealTimers()
  // @ts-expect-error test cleanup of a configurable property
  delete navigator.clipboard
})

describe('@aihu/use/useClipboard', () => {
  it('isSupported is true when navigator.clipboard is present', () => {
    const { isSupported } = useClipboard()
    expect(isSupported()).toBe(true)
  })

  it('copy() writes through navigator.clipboard.writeText and flips copied()', async () => {
    const { copy, copied } = useClipboard()
    expect(copied()).toBe(false)
    await copy('hello')
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(copied()).toBe(true)
  })

  it('copied() resets to false after copiedDuring ms', async () => {
    const { copy, copied } = useClipboard({ copiedDuring: 500 })
    await copy('hi')
    expect(copied()).toBe(true)
    vi.advanceTimersByTime(500)
    expect(copied()).toBe(false)
  })

  it('a rejected writeText leaves copied() false', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    const { copy, copied } = useClipboard()
    await copy('nope')
    expect(copied()).toBe(false)
  })

  it('copy() is a no-op after the owning scope is disposed', async () => {
    const scope = effectScope()
    const { copy, copied } = scope.run(() => useClipboard()) as ReturnType<typeof useClipboard>

    scope.stop()
    await copy('late')
    // Regression: a still-referenced copy() used to write the clipboard and
    // re-arm the reset timer after dispose.
    expect(writeText).not.toHaveBeenCalled()
    expect(copied()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a copy() in flight when the scope is disposed does not flip copied() or re-arm the timer', async () => {
    let resolveWrite!: () => void
    writeText.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveWrite = resolve
      }),
    )
    const scope = effectScope()
    const { copy, copied } = scope.run(() => useClipboard()) as ReturnType<typeof useClipboard>

    const inFlight = copy('racing')
    scope.stop() // dispose while the clipboard write is still settling
    resolveWrite()
    await inFlight

    expect(copied()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('@aihu/use/useClipboard — SSR-static path', () => {
  it('with isClient false, isSupported/copied are false and copy() is a no-op', () =>
    withSSR(
      () => import('../src/useClipboard/index.ts'),
      async (mod) => {
        const result = mod.useClipboard()
        expect(result.isSupported()).toBe(false)
        expect(result.copied()).toBe(false)
        await expect(result.copy('x')).resolves.toBeUndefined()
        expect(result.copied()).toBe(false)
      },
    ))
})
