/**
 * Unit tests for `defineComponent` per
 * `.team/phase-4/spec-runtime.md` §1.5 + Phase 4 builder brief.
 *
 * `defineComponent` returns a class consumable by `defineElement`.
 * Internally it calls `setup(ctx)` in `connectedCallback`, mounts the
 * resulting tree via the injected `mount` function, and disposes the
 * resulting `MountScope` in `disconnectedCallback`.
 *
 * Spec §2.4: runtime has no source-level *value* imports from
 * `@scribe/arbor`. Tests inject `mount` via `_setMount(mount)` (the
 * same hook real apps use at boot).
 */

import { branch, leaf, mount } from '@scribe/arbor'
import { signal } from '@scribe/signals'
import type { Signal } from '@scribe/signals'
import { describe, expect, it, vi } from 'vitest'
import { _setMount, _setSignal, defineComponent } from '../src/define-component.ts'
import { defineElement } from '../src/define-element.ts'
import type { SetupContext } from '../src/types.ts'
import { RuntimeError } from '../src/types.ts'

// Wire mount once for all tests in this file.
_setMount(mount)

describe('defineComponent — Task 21b spec tests', () => {
  it('returned class registers via defineElement without error (#1)', () => {
    const Cmp = defineComponent(({ host: _host }) => leaf('hi'))
    expect(() => defineElement('x-c1', Cmp)).not.toThrow()
    expect(customElements.get('x-c1')).toBeDefined()
  })

  it('setup(ctx) runs once in connectedCallback (#2)', () => {
    let captured: SetupContext | null = null
    const setup = vi.fn((ctx: SetupContext) => {
      captured = ctx
      return leaf('hello')
    })
    const Cmp = defineComponent(setup)
    defineElement('x-c2', Cmp)
    expect(setup).not.toHaveBeenCalled()
    const el = document.createElement('x-c2')
    document.body.appendChild(el)
    expect(setup).toHaveBeenCalledTimes(1)
    expect(captured).not.toBeNull()
    expect((captured as SetupContext | null)?.element).toBe(el)
    expect((captured as SetupContext | null)?.host).toBe(el.shadowRoot)
    el.remove()
  })

  it('effects created during setup are auto-disposed when element is removed (#3)', () => {
    const sig = signal('a')
    const setText = sig[1]
    const Cmp = defineComponent(() => branch('p', undefined, [leaf(sig)]))
    defineElement('x-c3', Cmp)
    const el = document.createElement('x-c3')
    document.body.appendChild(el)
    const p = el.shadowRoot!.querySelector('p') as HTMLElement
    expect(p.textContent).toBe('a')
    setText('b')
    expect(p.textContent).toBe('b')
    // Capture text node reference to assert it does not update post-remove.
    const captured = p
    el.remove()
    setText('c')
    // After dispose, the effect that wrote text is torn down — captured
    // node's textContent stays at 'b'.
    expect(captured.textContent).toBe('b')
  })

  it('disconnectedCallback calls scope.dispose() (#4)', () => {
    const disposeSpy = vi.fn()
    // Inject a fake mount that records dispose.
    const realMount = mount
    _setMount((node, host) => {
      const scope = realMount(node, host)
      const origDispose = scope.dispose.bind(scope)
      return {
        ...scope,
        dispose() {
          disposeSpy()
          origDispose()
        },
      }
    })
    const Cmp = defineComponent(() => leaf('x'))
    defineElement('x-c4', Cmp)
    const el = document.createElement('x-c4')
    document.body.appendChild(el)
    expect(disposeSpy).not.toHaveBeenCalled()
    el.remove()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
    // Restore real mount for any subsequent file/test.
    _setMount(realMount)
  })
})

describe('defineComponent — Plan 1.2 props tests', () => {
  // T1: function-form still returns an HTMLElement class (no regression)
  it('T1: defineComponent(setup) function-form still returns an HTMLElement class', () => {
    const Cmp = defineComponent(({ host: _host }) => leaf('t1'))
    // The returned class must be a subclass of HTMLElement
    expect(Object.prototype.isPrototypeOf.call(HTMLElement, Cmp)).toBe(true)
    // Confirm it has no observedAttributes (function-form never sets them)
    expect((Cmp as { observedAttributes?: string[] }).observedAttributes).toBeUndefined()
  })

  // T2: options-form sets static observedAttributes
  it('T2: defineComponent({ attrs, setup }) sets static observedAttributes', () => {
    const Cmp = defineComponent({
      attrs: ['count'] as const,
      setup: (_ctx) => leaf('t2'),
    })
    expect((Cmp as { observedAttributes?: string[] }).observedAttributes).toEqual(['count'])
  })

  // T3: after connectedCallback, ctx.attrs.count is a Signal<string> readable
  it('T3: after connectedCallback, ctx.attrs.count is a Signal<string> readable', () => {
    // Wire signal factory
    _setSignal(signal)
    let capturedAttrSignal: Signal<string> | null = null
    const Cmp = defineComponent({
      attrs: ['count'] as const,
      setup: (ctx) => {
        const typedCtx = ctx as unknown as { attrs: { count: Signal<string> } }
        capturedAttrSignal = typedCtx.attrs.count
        // Pass the full Signal tuple to leaf (Signal<string> | string)
        return leaf(capturedAttrSignal)
      },
    })
    defineElement('x-p3', Cmp)
    const el = document.createElement('x-p3')
    el.setAttribute('count', '42')
    document.body.appendChild(el)
    // The signal should be readable and return the initial attribute value
    expect(capturedAttrSignal).not.toBeNull()
    expect(capturedAttrSignal![0]()).toBe('42')
    // The rendered text content should also be '42'
    expect(el.shadowRoot!.textContent).toBe('42')
    el.remove()
  })

  // T4: attributeChangedCallback drives the signal setter
  it('T4: attributeChangedCallback updates ctx.attrs.count signal', () => {
    _setSignal(signal)
    let capturedSignal: Signal<string> | null = null
    const Cmp = defineComponent({
      attrs: ['count'] as const,
      setup: (ctx) => {
        const typedCtx = ctx as unknown as { attrs: { count: Signal<string> } }
        capturedSignal = typedCtx.attrs.count
        return leaf(capturedSignal[0])
      },
    })
    defineElement('x-p4', Cmp)
    const el = document.createElement('x-p4')
    el.setAttribute('count', '0')
    document.body.appendChild(el)
    expect(capturedSignal).not.toBeNull()
    expect(capturedSignal![0]()).toBe('0')
    el.setAttribute('count', '5')
    expect(capturedSignal![0]()).toBe('5')
    el.remove()
  })

  // T5: _setSignal not called before connect of an attrs-using component → RuntimeError
  it('T5: missing _setSignal before connect of attrs component throws RuntimeError', () => {
    // Reset signal injection to simulate "not called" state.
    _setSignal(null as unknown as typeof signal)

    const Cmp = defineComponent({
      attrs: ['x'] as const,
      setup: (_ctx) => leaf('t5'),
    })
    // Instantiate the element and call connectedCallback directly to bypass
    // jsdom's error-swallowing in appendChild (jsdom turns synchronous
    // connectedCallback throws into unhandled exceptions rather than
    // propagating them through appendChild).
    const el = Object.create(Cmp.prototype) as InstanceType<typeof Cmp> & { connectedCallback(): void }
    expect(() => el.connectedCallback()).toThrow(RuntimeError)

    // Restore signal injection for subsequent tests.
    _setSignal(signal)
  })

  // T6: two independent Signal<string> values; changing a does not affect b
  it('T6: multiple attrs produce independent signals', () => {
    _setSignal(signal)
    let sigA: Signal<string> | null = null
    let sigB: Signal<string> | null = null
    const Cmp = defineComponent({
      attrs: ['a', 'b'] as const,
      setup: (ctx) => {
        const typedCtx = ctx as unknown as { attrs: { a: Signal<string>; b: Signal<string> } }
        sigA = typedCtx.attrs.a
        sigB = typedCtx.attrs.b
        return leaf('t6')
      },
    })
    defineElement('x-p6', Cmp)
    const el = document.createElement('x-p6')
    el.setAttribute('a', 'alpha')
    el.setAttribute('b', 'beta')
    document.body.appendChild(el)
    expect(sigA).not.toBeNull()
    expect(sigB).not.toBeNull()
    expect(sigA![0]()).toBe('alpha')
    expect(sigB![0]()).toBe('beta')
    // Change 'a' — 'b' must be unaffected
    el.setAttribute('a', 'changed')
    expect(sigA![0]()).toBe('changed')
    expect(sigB![0]()).toBe('beta')
    el.remove()
  })

  // T7: options-form without attrs does not require _setSignal
  it('T7: options-form without attrs connects without _setSignal', () => {
    _setSignal(null as unknown as typeof signal)
    const Cmp = defineComponent({
      setup: (_ctx) => leaf('no-attrs'),
    })
    defineElement('x-p7', Cmp)
    const el = document.createElement('x-p7')
    expect(() => document.body.appendChild(el)).not.toThrow()
    el.remove()
    _setSignal(signal)
  })
})
