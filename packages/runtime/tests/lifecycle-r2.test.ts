/**
 * R2 — `$lifecycle` four-callback extension tests.
 *
 * Spec: docs/superpowers/specs/2026-05-06-spec-template-syntax-v2-platform-audit.md §3.6 + R2
 * Director r6 §3.R2 — extend `$lifecycle: { mount, dispose }` to also accept
 * `adopt` and `attributeChange` callbacks; lower to platform adoptedCallback /
 * attributeChangedCallback respectively.
 *
 * Test name pattern: `r2_acN_*` mirrors R1 in define-component.test.ts.
 */

import { leaf, mount } from '@aihu/arbor'
import { signal } from '@aihu/signals'
import { describe, expect, it, vi } from 'vitest'
import {
  _setMount,
  _setSignal,
  defineComponent,
  _onAdopt as onAdopt,
  _onAttributeChange as onAttributeChange,
  _onCleanup as onCleanup,
  _onMount as onMount,
} from '../src/define-component.ts'
import { defineElement } from '../src/define-element.ts'
import { RuntimeError } from '../src/types.ts'

_setMount(mount)
_setSignal(signal)

let _ctr = 0
function tag(): string {
  return `x-r2-${++_ctr}`
}

describe('R2 — $lifecycle four-callback extension', () => {
  it('r2_ac1_adopt: onAdopt fires on adoptedCallback', () => {
    const adoptSpy = vi.fn()
    const Cmp = defineComponent(() => {
      onAdopt(adoptSpy)
      return leaf('a')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(adoptSpy).not.toHaveBeenCalled()
    // Simulate the platform adoptedCallback. JSDOM does not implement
    // cross-document adoption natively, so we invoke the lifecycle directly
    // — semantically equivalent to the browser calling adoptedCallback after
    // document.adoptNode().
    ;(el as unknown as { adoptedCallback?: () => void }).adoptedCallback?.()
    expect(adoptSpy).toHaveBeenCalledTimes(1)
    el.remove()
  })

  it('r2_ac1_attribute_change: onAttributeChange fires on attributeChangedCallback', () => {
    const attrSpy = vi.fn()
    const Cmp = defineComponent({
      props: { name: { value: '' } },
      setup: (_ctx) => {
        onAttributeChange(attrSpy)
        return leaf('ac')
      },
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    el.setAttribute('name', 'changed')
    expect(attrSpy).toHaveBeenCalledTimes(1)
    expect(attrSpy).toHaveBeenLastCalledWith('name', null, 'changed')
    el.setAttribute('name', 'again')
    expect(attrSpy).toHaveBeenCalledTimes(2)
    expect(attrSpy).toHaveBeenLastCalledWith('name', 'changed', 'again')
    el.remove()
  })

  it('r2_ac2_order: $prop signal updates BEFORE userland onAttributeChange', () => {
    // Director r6 §3.R2: R1's $prop dispatcher runs first; userland's
    // attributeChange runs after, so authors observe the post-converted
    // signal value rather than the raw attribute string.
    const order: string[] = []
    let propGetter: (() => unknown) | null = null
    const Cmp = defineComponent({
      props: { count: { value: 0 } },
      setup: (ctx) => {
        propGetter = ctx.props.count as () => unknown
        onAttributeChange((_name, _old, _new) => {
          // Read the prop signal — it should already reflect the new value.
          order.push(`userland:${propGetter!()}`)
        })
        return leaf('order')
      },
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    el.setAttribute('count', '7')
    // The prop signal converted '7' → 7 BEFORE the userland callback ran.
    expect(order).toEqual(['userland:7'])
    expect(propGetter!()).toBe(7)
    el.remove()
  })

  it('r2_ac4_back_compat: existing onMount + onCleanup still works (no regression)', () => {
    const order: string[] = []
    const Cmp = defineComponent(() => {
      onMount(() => {
        order.push('mount')
        return undefined
      })
      onCleanup(() => {
        order.push('cleanup')
      })
      return leaf('bc')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(order).toEqual(['mount'])
    el.remove()
    expect(order).toEqual(['mount', 'cleanup'])
  })

  it('r2_ac1_all_four_callbacks_fire_at_correct_moments', () => {
    const order: string[] = []
    const Cmp = defineComponent({
      props: { x: { value: 0 } },
      setup: () => {
        // Block bodies (`{}`) are required so the return is `undefined`,
        // not the truthy `Array.push` length value. Per existing lifecycle
        // contract, an onMount that returns a value treats it as a cleanup
        // callback to register.
        onMount(() => {
          order.push('mount')
        })
        onCleanup(() => {
          order.push('cleanup')
        })
        onAdopt(() => {
          order.push('adopt')
        })
        onAttributeChange((name, _o, v) => {
          order.push(`attr:${name}=${v}`)
        })
        return leaf('all')
      },
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(order).toEqual(['mount'])
    el.setAttribute('x', '5')
    expect(order).toEqual(['mount', 'attr:x=5'])
    ;(el as unknown as { adoptedCallback?: () => void }).adoptedCallback?.()
    expect(order).toEqual(['mount', 'attr:x=5', 'adopt'])
    el.remove()
    expect(order).toEqual(['mount', 'attr:x=5', 'adopt', 'cleanup'])
  })

  it('r2_outside_setup_throws: onAdopt outside setup throws RuntimeError', () => {
    expect(() => onAdopt(() => {})).toThrow(RuntimeError)
  })

  it('r2_outside_setup_throws: onAttributeChange outside setup throws RuntimeError', () => {
    expect(() => onAttributeChange(() => {})).toThrow(RuntimeError)
  })
})
