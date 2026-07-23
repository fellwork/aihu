/**
 * Unit tests for the `@aihu/use` shared substrate: `toValue` (including the
 * pinned no-tuple-detection rule), `unrefElement`, `tryOnScopeDispose`, and
 * `tryOnMounted` (effect-scope plan §5). jsdom environment (root vitest
 * config), so `isClient` is true here — the SSR-side behavior of the
 * composables is exercised in their own test files via module re-evaluation.
 */
import { effectScope, signal } from '@aihu/signals'
import { describe, expect, it, vi } from 'vitest'
import {
  defaultDocument,
  defaultNavigator,
  defaultWindow,
  isClient,
  toValue,
  tryOnMounted,
  tryOnScopeDispose,
  unrefElement,
} from '../src/shared/index.ts'

describe('@aihu/use/shared — isClient + default globals', () => {
  it('isClient is true under jsdom, and the default globals are populated', () => {
    expect(isClient).toBe(true)
    expect(defaultWindow).toBe(window)
    expect(defaultDocument).toBe(document)
    expect(defaultNavigator).toBe(navigator)
  })
})

describe('@aihu/use/shared — toValue', () => {
  it('unwraps a getter', () => {
    expect(toValue(() => 42)).toBe(42)
  })

  it('returns a plain value as-is', () => {
    expect(toValue(42)).toBe(42)
    expect(toValue('hello')).toBe('hello')
    expect(toValue(null)).toBe(null)
  })

  it('unwraps the read half of a signal tuple (the supported form)', () => {
    const [count] = signal(7)
    expect(toValue(count)).toBe(7)
  })

  it('returns an array/tuple UNCHANGED — no tuple detection (pinned rule)', () => {
    // A [get, set] signal tuple is structurally an array of functions and
    // undiscriminable from a legit array arg — toValue must never unwrap it.
    const tuple = signal(7)
    expect(toValue(tuple)).toBe(tuple)

    const plainArray = [1, 2, 3]
    expect(toValue(plainArray)).toBe(plainArray)

    const arrayOfFns = [() => 1, () => 2]
    expect(toValue(arrayOfFns)).toBe(arrayOfFns)
  })
})

describe('@aihu/use/shared — unrefElement', () => {
  it('resolves a static element as-is', () => {
    const el = document.createElement('div')
    expect(unrefElement(el)).toBe(el)
  })

  it('resolves a getter target', () => {
    const el = document.createElement('div')
    expect(unrefElement(() => el)).toBe(el)
  })

  it('passes through null/undefined (static and getter)', () => {
    expect(unrefElement(null)).toBe(null)
    expect(unrefElement(undefined)).toBe(undefined)
    expect(unrefElement(() => null)).toBe(null)
  })
})

describe('@aihu/use/shared — tryOnScopeDispose', () => {
  it('returns false and registers nothing with no active scope', () => {
    const fn = vi.fn()
    expect(tryOnScopeDispose(fn)).toBe(false)
    expect(fn).not.toHaveBeenCalled()
  })

  it('returns true inside a scope and runs the fn on stop()', () => {
    const fn = vi.fn()
    const scope = effectScope()
    let registered: boolean | undefined
    scope.run(() => {
      registered = tryOnScopeDispose(fn)
    })
    expect(registered).toBe(true)
    expect(fn).not.toHaveBeenCalled()
    scope.stop()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('@aihu/use/shared — tryOnMounted', () => {
  it('runs the fn on the client (interim immediate semantics)', () => {
    const fn = vi.fn()
    tryOnMounted(fn)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
