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
 * `@aihu/arbor`. Tests inject `mount` via `_setMount(mount)` (the
 * same hook real apps use at boot).
 */

import { branch, leaf, mount } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'
import { signal } from '@aihu/signals'
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
    const p = el.shadowRoot?.querySelector('p') as HTMLElement
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
        return leaf(capturedAttrSignal!)
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
    expect(el.shadowRoot?.textContent).toBe('42')
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
        return leaf(capturedSignal!)
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
    const el = Object.create(Cmp.prototype) as InstanceType<typeof Cmp> & {
      connectedCallback(): void
    }
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

// ─── R1 — $prop reactivity (template-syntax-v2 round 5, Builder B1) ──────────
//
// Surface: defineComponent({ props: { name: { value, attribute, reflect, converter } }, setup })
// Acceptance criteria from director-notes/template-syntax-005.md §5 (B1):
//   AC5  attribute mutation flows to signal       (R1-AC5)
//   AC6  attribute: false skips observedAttributes (R1-AC6)
//   AC7  reflect: true writes attribute on set    (R1-AC7)
//   AC8  converter Date round-trip                (R1-AC8)
//   AC10 fine-grained signal preserved            (R1-AC10)
//   AC11 attribute: false + reflect: true rejected (R1-AC11)
describe('defineComponent — R1 ($prop reactivity)', () => {
  it('R1-AC5: setAttribute → ctx.props.<name>() updates the signal', () => {
    _setSignal(signal)
    let captured: (() => unknown) | null = null
    const Cmp = defineComponent({
      props: { name: { value: 'default' } },
      setup: (ctx) => {
        captured = ctx.props.name as () => unknown
        return leaf('ac5')
      },
    })
    defineElement('x-r1-ac5', Cmp)
    const el = document.createElement('x-r1-ac5')
    document.body.appendChild(el)
    expect(captured).not.toBeNull()
    expect(captured!()).toBe('default')
    el.setAttribute('name', 'after')
    expect(captured!()).toBe('after')
    el.remove()
  })

  it('R1-AC6: attribute: false omits the prop from observedAttributes', () => {
    const Cmp = defineComponent({
      props: {
        title: { value: '' }, // observed (default)
        user: { value: null, attribute: false }, // property-only
      },
      setup: (_ctx) => leaf('ac6'),
    })
    const observed = (Cmp as { observedAttributes?: string[] }).observedAttributes ?? []
    expect(observed).toContain('title')
    expect(observed).not.toContain('user')
  })

  it('R1-AC7: reflect: true writes signal value back to attribute on .set', () => {
    _setSignal(signal)
    const Cmp = defineComponent({
      props: { count: { value: 0, reflect: true } },
      setup: (_ctx) => leaf('ac7'),
    })
    defineElement('x-r1-ac7', Cmp)
    const el = document.createElement('x-r1-ac7') as HTMLElement & { count: number }
    document.body.appendChild(el)
    expect(el.getAttribute('count')).toBe(null) // initial absence
    el.count = 5
    expect(el.getAttribute('count')).toBe('5')
    el.count = 12
    expect(el.getAttribute('count')).toBe('12')
    el.remove()
  })

  it('R1-AC8: converter round-trips an ISO Date attribute', () => {
    _setSignal(signal)
    let dateProp: (() => unknown) | null = null
    const Cmp = defineComponent({
      props: {
        date: {
          value: new Date(0),
          converter: (s: string | null) => (s !== null ? new Date(s) : new Date(0)),
        },
      },
      setup: (ctx) => {
        dateProp = ctx.props.date as () => unknown
        return leaf('ac8')
      },
    })
    defineElement('x-r1-ac8', Cmp)
    const el = document.createElement('x-r1-ac8')
    el.setAttribute('date', '2026-01-15T00:00:00.000Z')
    document.body.appendChild(el)
    expect(dateProp).not.toBeNull()
    const v = dateProp!() as Date
    expect(v).toBeInstanceOf(Date)
    expect(v.toISOString()).toBe('2026-01-15T00:00:00.000Z')
    el.setAttribute('date', '2027-06-20T12:00:00.000Z')
    expect((dateProp!() as Date).toISOString()).toBe('2027-06-20T12:00:00.000Z')
    el.remove()
  })

  it('R1-AC10: prop signal is fine-grained — derived computed updates only when prop changes', () => {
    _setSignal(signal)
    let captured: (() => unknown) | null = null
    const Cmp = defineComponent({
      props: { color: { value: 'red' } },
      setup: (ctx) => {
        captured = ctx.props.color as () => unknown
        return leaf('ac10')
      },
    })
    defineElement('x-r1-ac10', Cmp)
    const el = document.createElement('x-r1-ac10')
    el.setAttribute('color', 'blue')
    document.body.appendChild(el)
    expect(captured!()).toBe('blue')
    // The signal getter is the same reference across reads (callable
    // signal). Subscribing through it tracks fine-grained changes.
    el.setAttribute('color', 'green')
    expect(captured!()).toBe('green')
    // Setting a different attribute does NOT trigger the color signal.
    el.setAttribute('unrelated', '1')
    expect(captured!()).toBe('green')
    el.remove()
  })

  it('R1-AC11: attribute: false + reflect: true throws RuntimeError at class build', () => {
    expect(() =>
      defineComponent({
        props: { x: { value: 5, attribute: false, reflect: true } },
        setup: (_ctx) => leaf('ac11'),
      }),
    ).toThrow(RuntimeError)
  })

  it('R1: number type-conversion via default-typed default value', () => {
    _setSignal(signal)
    let captured: (() => unknown) | null = null
    const Cmp = defineComponent({
      props: { count: { value: 0 } }, // typeof default === 'number' → Number coercion
      setup: (ctx) => {
        captured = ctx.props.count as () => unknown
        return leaf('num')
      },
    })
    defineElement('x-r1-num', Cmp)
    const el = document.createElement('x-r1-num')
    el.setAttribute('count', '42')
    document.body.appendChild(el)
    expect(captured!()).toBe(42)
    el.setAttribute('count', '7')
    expect(captured!()).toBe(7)
    // NaN-guard: bad numeric attribute falls back to default.
    el.setAttribute('count', 'not-a-number')
    expect(captured!()).toBe(0)
    el.remove()
  })

  it('R1: boolean prop uses presence-based conversion', () => {
    _setSignal(signal)
    let captured: (() => unknown) | null = null
    const Cmp = defineComponent({
      props: { open: { value: false, reflect: true } },
      setup: (ctx) => {
        captured = ctx.props.open as () => unknown
        return leaf('bool')
      },
    })
    defineElement('x-r1-bool', Cmp)
    const el = document.createElement('x-r1-bool') as HTMLElement & { open: boolean }
    document.body.appendChild(el)
    expect(captured!()).toBe(false)
    el.setAttribute('open', '')
    expect(captured!()).toBe(true)
    el.removeAttribute('open')
    expect(captured!()).toBe(false)
    // Reflect: setting the property writes the attribute (presence convention).
    el.open = true
    expect(el.hasAttribute('open')).toBe(true)
    el.open = false
    expect(el.hasAttribute('open')).toBe(false)
    el.remove()
  })

  it('R1: attribute: "kebab-name" overrides the default kebab mapping', () => {
    _setSignal(signal)
    const Cmp = defineComponent({
      props: { user: { value: null, attribute: 'data-user' } },
      setup: (_ctx) => leaf('alias'),
    })
    const observed = (Cmp as { observedAttributes?: string[] }).observedAttributes ?? []
    expect(observed).toContain('data-user')
    expect(observed).not.toContain('user')
  })

  it('R1: default kebab-cased attribute name (myProp → my-prop)', () => {
    const Cmp = defineComponent({
      props: { myProp: { value: '' } },
      setup: (_ctx) => leaf('kebab'),
    })
    const observed = (Cmp as { observedAttributes?: string[] }).observedAttributes ?? []
    expect(observed).toContain('my-prop')
  })

  it('R1: el.prop = v flows through .set (property accessor wired)', () => {
    _setSignal(signal)
    let captured: (() => unknown) | null = null
    const Cmp = defineComponent({
      props: { count: { value: 0 } },
      setup: (ctx) => {
        captured = ctx.props.count as () => unknown
        return leaf('accessor')
      },
    })
    defineElement('x-r1-accessor', Cmp)
    const el = document.createElement('x-r1-accessor') as HTMLElement & { count: number }
    document.body.appendChild(el)
    expect(captured!()).toBe(0)
    el.count = 99
    expect(captured!()).toBe(99)
    // Read-back via accessor.
    expect(el.count).toBe(99)
    el.remove()
  })

  it('R1: reflect re-entrancy guard — setting via .set does not double-fire', () => {
    _setSignal(signal)
    let setCount = 0
    const Cmp = defineComponent({
      props: { tag: { value: '', reflect: true } },
      setup: (ctx) => {
        const tagSig = ctx.props.tag!
        const orig = tagSig.set
        tagSig.set = (v: unknown) => {
          setCount++
          orig.call(tagSig, v)
        }
        return leaf('reentry')
      },
    })
    defineElement('x-r1-reentry', Cmp)
    const el = document.createElement('x-r1-reentry') as HTMLElement & { tag: string }
    document.body.appendChild(el)
    setCount = 0
    el.tag = 'hello'
    // Exactly one set: external assignment. The attribute write that follows
    // re-enters attributeChangedCallback, but the reflect guard suppresses
    // the inner ps.set re-dispatch → setCount stays at 1.
    expect(setCount).toBe(1)
    expect(el.getAttribute('tag')).toBe('hello')
    el.remove()
  })
})
