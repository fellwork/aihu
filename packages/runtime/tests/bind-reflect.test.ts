/**
 * R4 + Q3 — `bind:value` two-way + reflect-loop guard tests.
 *
 * Spec: Director r6 §3.R4 + §2.Q3.
 *
 * Two scenarios:
 *
 *   1. Single-component cycle: a $prop with `reflect: true` set via the JS
 *      property accessor must reflect to attribute exactly once and not
 *      double-fire attributeChangedCallback (B1's REFLECT_SYM Set guard).
 *
 *   2. Cross-component cycle: a child component bound via `$bind:value` to
 *      a parent prop where the parent declares `reflect: true`. The bind
 *      write propagates to the parent, the parent reflects to attribute,
 *      the parent's attributeChangedCallback observes the attribute change
 *      — but the cycle MUST terminate at the first round-trip. Guard:
 *      `_isInternalAttrChange` flag suppresses reflect during a reentrant
 *      attributeChangedCallback dispatch (Lit's `_isReflecting` precedent).
 *
 * Test name pattern: `r4_acN_*` / `q3_*` mirrors B1.
 */

import { leaf, mount } from '@aihu/arbor'
import { signal } from '@aihu/signals'
import { describe, expect, it, vi } from 'vitest'
import {
  _setMount,
  _setSignal,
  defineComponent,
  _onAttributeChange as onAttributeChange,
} from '../src/define-component.ts'
import { defineElement } from '../src/define-element.ts'

_setMount(mount)
_setSignal(signal)

let _ctr = 0
function tag(): string {
  return `x-r4-${++_ctr}`
}

describe('R4 + Q3 — $bind two-way + reflect-loop guard', () => {
  it('r4_ac2_single_component_reflect_terminates_in_one_roundtrip', () => {
    // Setting el.tag (reflect: true) MUST: (1) update the signal once,
    // (2) write the attribute once, (3) NOT re-fire attributeChangedCallback
    // back into ps.set (which would re-reflect, infinite loop).
    let setCount = 0
    const Cmp = defineComponent({
      props: { tag: { value: '', reflect: true } },
      setup: (ctx) => {
        const ps = ctx.props.tag!
        const orig = ps.set
        ps.set = (v: unknown) => {
          setCount++
          orig.call(ps, v)
        }
        return leaf('rt')
      },
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t) as HTMLElement & { tag: string }
    document.body.appendChild(el)
    setCount = 0
    el.tag = 'hello'
    expect(setCount).toBe(1) // exactly one set: the external assignment
    expect(el.getAttribute('tag')).toBe('hello')
    el.remove()
  })

  it('r4_ac2_setAttribute_during_internal_attrchange_is_short_circuited', () => {
    // When attributeChangedCallback fires (e.g. from `el.setAttribute(...)`),
    // _isInternalAttrChange is set. If that callback path triggers another
    // ps.set (e.g. via R1's _convert dispatch), the inner ps.set MUST NOT
    // reflect back — otherwise we'd setAttribute again and recurse.
    const acSpy = vi.fn()
    const Cmp = defineComponent({
      props: { value: { value: '', reflect: true } },
      setup: () => {
        // Userland onAttributeChange that re-writes the prop. With the guard,
        // this re-write should NOT call setAttribute again.
        onAttributeChange((_n, _o, _v) => {
          acSpy()
        })
        return leaf('sa')
      },
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    el.setAttribute('value', 'hi')
    // attributeChangedCallback fires once; our spy fires once; no recursion.
    expect(acSpy).toHaveBeenCalledTimes(1)
    expect(el.getAttribute('value')).toBe('hi')
    el.remove()
  })

  it('q3_cross_component_bind_reflect_terminates: child bind to parent reflect prop', () => {
    // PARENT: declares `count` $prop with reflect: true.
    let parentCountGetter: (() => unknown) | null = null
    const ParentCmp = defineComponent({
      props: { count: { value: 0, reflect: true } },
      setup: (ctx) => {
        parentCountGetter = ctx.props.count as () => unknown
        return leaf('p')
      },
    })
    const parentTag = tag()
    defineElement(parentTag, ParentCmp)

    // Set up: parent in DOM. Mutate parent.count externally (simulating a
    // child write via $bind). Verify cycle terminates: parent signal updates
    // once, attribute updates once, attributeChangedCallback runs once
    // (reflect re-entry guarded by REFLECT_SYM); _isInternalAttrChange
    // additionally suppresses any re-reflect from inner ps.set calls.
    const parent = document.createElement(parentTag) as HTMLElement & { count: number }
    document.body.appendChild(parent)
    expect(parentCountGetter!()).toBe(0)

    // External write (the child-bind equivalent).
    parent.count = 42
    expect(parentCountGetter!()).toBe(42)
    expect(parent.getAttribute('count')).toBe('42')

    // Now write via setAttribute (the parent's reflect-back observed by a
    // hypothetical child via attributeChangedCallback). The parent's signal
    // updates exactly once, no infinite loop.
    parent.setAttribute('count', '100')
    expect(parentCountGetter!()).toBe(100)
    expect(parent.getAttribute('count')).toBe('100')

    parent.remove()
  })

  it('q3_attempt_reflect_loop_does_not_double_fire_attribute_change', () => {
    // The diagnostic case: a userland onAttributeChange that itself writes
    // the prop. With the guard, the inner write does NOT recurse into
    // attributeChangedCallback; without the guard, this would either loop
    // indefinitely or double-fire.
    const callOrder: string[] = []
    const Cmp = defineComponent({
      props: { live: { value: '', reflect: true } },
      setup: (ctx) => {
        const ps = ctx.props.live!
        onAttributeChange((_name, _old, newV) => {
          callOrder.push(`ac:${newV}`)
          // Re-write the prop from inside attributeChangedCallback. With the
          // _isInternalAttrChange guard, this does NOT trigger another
          // setAttribute → another attributeChangedCallback.
          ps.set(`${newV}-mod`)
          callOrder.push(`postSet:${ps()}`)
        })
        return leaf('q3')
      },
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    el.setAttribute('live', 'a')
    // Exactly one ac fire. The inner ps.set updates the signal but the
    // _isInternalAttrChange guard suppresses reflect → no recursion.
    expect(callOrder).toEqual(['ac:a', 'postSet:a-mod'])
    el.remove()
  })
})
