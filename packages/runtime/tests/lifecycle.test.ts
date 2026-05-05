/**
 * Unit tests for `onMount` and `onCleanup` lifecycle helpers.
 *
 * v0.4.9 spec:
 *   (a) onMount callback runs after connectedCallback
 *   (b) onCleanup callback runs in disconnectedCallback
 *   (c) onMount return value is registered as cleanup
 *   (d) calling outside setup throws RuntimeError
 */

import { leaf, mount } from '@aihu/arbor'
import { describe, expect, it, vi } from 'vitest'
import {
  _setMount,
  defineComponent,
  _onCleanup as onCleanup,
  _onMount as onMount,
} from '../src/define-component.ts'
import { defineElement } from '../src/define-element.ts'
import { RuntimeError } from '../src/types.ts'

_setMount(mount)

let _ctr = 0
function tag(): string {
  return `x-lc-${++_ctr}`
}

describe('onMount + onCleanup — v0.4.9', () => {
  // (a) onMount callback runs after connectedCallback
  it('onMount fires after connectedCallback', () => {
    const order: string[] = []
    const Cmp = defineComponent((_ctx) => {
      order.push('setup')
      onMount(() => {
        order.push('mount')
      })
      return leaf('a')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(order).toEqual(['setup', 'mount'])
    el.remove()
  })

  // (b) onCleanup callback runs in disconnectedCallback
  it('onCleanup fires on disconnectedCallback', () => {
    const cleanupSpy = vi.fn()
    const Cmp = defineComponent(() => {
      onCleanup(cleanupSpy)
      return leaf('b')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(cleanupSpy).not.toHaveBeenCalled()
    el.remove()
    expect(cleanupSpy).toHaveBeenCalledTimes(1)
  })

  // (c) onMount return value is registered as cleanup
  it('onMount return value runs on disconnect', () => {
    const cleanupSpy = vi.fn()
    const Cmp = defineComponent(() => {
      onMount(() => cleanupSpy)
      return leaf('c')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(cleanupSpy).not.toHaveBeenCalled()
    el.remove()
    expect(cleanupSpy).toHaveBeenCalledTimes(1)
  })

  // (d) calling outside setup throws RuntimeError
  it('onMount outside setup throws RuntimeError', () => {
    expect(() => onMount(() => {})).toThrow(RuntimeError)
  })

  it('onCleanup outside setup throws RuntimeError', () => {
    expect(() => onCleanup(() => {})).toThrow(RuntimeError)
  })

  // Additional: multiple onMount + onCleanup callbacks run in registration order
  it('multiple lifecycle callbacks run in order', () => {
    const order: string[] = []
    const Cmp = defineComponent(() => {
      onMount(() => {
        order.push('m1')
      })
      onCleanup(() => {
        order.push('c1')
      })
      onMount(() => {
        order.push('m2')
      })
      onCleanup(() => {
        order.push('c2')
      })
      return leaf('d')
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(order).toEqual(['m1', 'm2'])
    el.remove()
    expect(order).toEqual(['m1', 'm2', 'c1', 'c2'])
  })

  // onMount with options-form component
  it('onMount + onCleanup work in options-form defineComponent', () => {
    const mountSpy = vi.fn()
    const cleanupSpy = vi.fn()
    const Cmp = defineComponent({
      setup: () => {
        onMount(mountSpy)
        onCleanup(cleanupSpy)
        return leaf('opts')
      },
    })
    const t = tag()
    defineElement(t, Cmp)
    const el = document.createElement(t)
    document.body.appendChild(el)
    expect(mountSpy).toHaveBeenCalledTimes(1)
    el.remove()
    expect(cleanupSpy).toHaveBeenCalledTimes(1)
  })
})
