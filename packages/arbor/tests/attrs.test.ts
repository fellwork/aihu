import type { Dispose } from '@scribe/signals'
import { describe, expect, it, vi } from 'vitest'
import { _applyAttrs, _setAttrOrProp, type MountEffectFn } from '../src/attrs.ts'

/**
 * Tests for `_applyAttrs` + `_setAttrOrProp` per spec §1.2 + §2.4 + §2.7
 * (Task 15).
 *
 * Spec lists 6 mount-coupled tests; the signal-firing subset (test #4 in
 * spec §4 — signal write updates `getAttribute`) requires the real
 * `_mountEffect` (Task 16) and is deferred to `mount.test.ts`. The three
 * detection paths + property/attribute split + String coercion + null
 * attrs are all directly testable here via JSDOM and a spy
 * `mountEffect`.
 *
 * Per Builder direction (Option C), `_applyAttrs` accepts the
 * `mountEffect` function as a dependency-injected parameter so this
 * batch can mock-spy it; Task 16's `_materialize` will pass the real
 * `_mountEffect`.
 */

describe('_setAttrOrProp', () => {
  it('writes a static string via setAttribute when key is not on the element', () => {
    const el = document.createElement('div')
    _setAttrOrProp(el, 'class', 'foo')
    expect(el.getAttribute('class')).toBe('foo')
  })

  it('uses property assignment when `key in el` (boolean property path)', () => {
    const input = document.createElement('input')
    _setAttrOrProp(input, 'disabled', true)
    expect(input.disabled).toBe(true)
  })

  it('coerces non-string values via String() on the attribute path', () => {
    const el = document.createElement('div')
    _setAttrOrProp(el, 'data-n', 5)
    expect(el.getAttribute('data-n')).toBe('5')
  })
})

describe('_applyAttrs — three detection paths', () => {
  // Real mountEffect substitute: invoke fn once so `_setAttrOrProp` runs.
  // Tracks calls so tests can verify path + invocation count.
  const makeSpyMountEffect = (): {
    spy: MountEffectFn
    calls: { fn: () => void; path: string }[]
  } => {
    const calls: { fn: () => void; path: string }[] = []
    const spy: MountEffectFn = (_disposers: Dispose[], fn: () => void, path: string) => {
      calls.push({ fn, path })
      fn()
    }
    return { spy, calls }
  }

  it('event handler path: onClick registers a click listener (spec §2.4)', () => {
    const el = document.createElement('button')
    const handler = vi.fn()
    const { spy, calls } = makeSpyMountEffect()

    _applyAttrs(el, { onClick: handler }, [], '0', spy)

    el.dispatchEvent(new Event('click'))
    expect(handler).toHaveBeenCalledTimes(1)
    // Event handlers do not flow through mountEffect.
    expect(calls.length).toBe(0)
  })

  it('static primitive path: { class: "foo" } sets the attr without calling mountEffect', () => {
    const el = document.createElement('div')
    const { spy, calls } = makeSpyMountEffect()

    _applyAttrs(el, { class: 'foo' }, [], '0', spy)

    expect(el.getAttribute('class')).toBe('foo')
    expect(calls.length).toBe(0)
  })

  it('reactive path: array value calls mountEffect with `<pathBase>.attr:<key>` (spec §2.7)', () => {
    const el = document.createElement('div')
    const getter = () => 'foo'
    // Signal is a tuple [Read, Write]; only [0] is read by _applyAttrs.
    // Cast through `never` to satisfy the AttrMap value-type position.
    const fakeSignal = [getter, () => {}] as never
    const { spy, calls } = makeSpyMountEffect()

    _applyAttrs(el, { class: fakeSignal }, [], '0.1', spy)

    expect(calls.length).toBe(1)
    expect(calls[0]?.path).toBe('0.1.attr:class')
    // The injected fn ran once (initial render synchronous per spec §2.3).
    expect(el.getAttribute('class')).toBe('foo')
  })

  it('precedence: `on*` + function takes priority over the static primitive path', () => {
    const el = document.createElement('button')
    const handler = vi.fn()
    const { spy, calls } = makeSpyMountEffect()

    // A function value under an `onX` key must NOT hit the static path
    // (which would `String()` it) nor the reactive path (functions are
    // not arrays). The event-handler branch wins.
    _applyAttrs(el, { onClick: handler }, [], '0', spy)

    expect(el.getAttribute('onclick')).toBeNull()
    expect(calls.length).toBe(0)
    el.dispatchEvent(new Event('click'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('null attrs is a no-op (no side effects, no mountEffect calls)', () => {
    const el = document.createElement('div')
    const { spy, calls } = makeSpyMountEffect()

    expect(() => _applyAttrs(el, null, [], '0', spy)).not.toThrow()
    expect(el.attributes.length).toBe(0)
    expect(calls.length).toBe(0)
  })

  it('multiple attrs in one call: each gets its own attr:<key> path suffix', () => {
    const el = document.createElement('div')
    const getA = () => 'aa'
    const getB = () => 'bb'
    const sigA = [getA, () => {}] as never
    const sigB = [getB, () => {}] as never
    const { spy, calls } = makeSpyMountEffect()

    _applyAttrs(el, { class: sigA, id: sigB }, [], '0.2', spy)

    expect(calls.length).toBe(2)
    const paths = calls.map((c) => c.path).sort()
    expect(paths).toEqual(['0.2.attr:class', '0.2.attr:id'])
  })
})
