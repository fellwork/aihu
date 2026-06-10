/**
 * radio-group keyboard tests (jsdom): arrows move focus AND select (APG),
 * loop wrap, Home/End, Space selects when unchecked, Enter explicitly does
 * NOT, disabled-item skipping, and RTL horizontal flip (own attr + inherited
 * config-provider).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { defineConfigProvider } from '../config-provider/index.ts'
import { type AihuRadioGroupItem, type AihuRadioGroupRoot, defineRadioGroup } from './index.ts'

defineRadioGroup()
defineConfigProvider()

interface Setup {
  root: AihuRadioGroupRoot
  items: AihuRadioGroupItem[]
}

function mount(rootAttrs = '', itemAttrs: string[] = ['', '', '']): Setup {
  document.body.innerHTML = `
    <aihu-radio-group-root aria-label="Fruit" ${rootAttrs}>
      ${itemAttrs
        .map(
          (attrs, i) =>
            `<aihu-radio-group-item value="v${i}" aria-label="v${i}" ${attrs}></aihu-radio-group-item>`,
        )
        .join('\n')}
    </aihu-radio-group-root>`
  const root = document.querySelector('aihu-radio-group-root') as AihuRadioGroupRoot
  const items = Array.from(
    document.querySelectorAll('aihu-radio-group-item'),
  ) as AihuRadioGroupItem[]
  return { root, items }
}

function press(el: Element, key: string): boolean {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev.defaultPrevented
}

describe('AihuRadioGroupRoot — keyboard', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('arrows move focus AND select (APG), defaulting to orientation=both', () => {
    const { root, items } = mount()
    items[0]?.focus()
    press(items[0] as Element, 'ArrowRight')
    expect(document.activeElement).toBe(items[1])
    expect(items[1]?.getAttribute('aria-checked')).toBe('true')
    expect(root.value()).toBe('v1')
    // Vertical arrows work too (orientation defaults to "both").
    press(items[1] as Element, 'ArrowDown')
    expect(document.activeElement).toBe(items[2])
    expect(root.value()).toBe('v2')
    press(items[2] as Element, 'ArrowUp')
    expect(document.activeElement).toBe(items[1])
    expect(root.value()).toBe('v1')
  })

  it('loops at the ends by default (APG wrap)', () => {
    const { root, items } = mount()
    items[0]?.focus()
    press(items[0] as Element, 'ArrowLeft') // from 0 wraps to last
    expect(document.activeElement).toBe(items[2])
    expect(root.value()).toBe('v2')
    press(items[2] as Element, 'ArrowRight') // from last wraps to 0
    expect(document.activeElement).toBe(items[0])
    expect(root.value()).toBe('v0')
  })

  it('Home/End jump to first/last and select', () => {
    const { root, items } = mount()
    items[0]?.focus()
    press(items[0] as Element, 'End')
    expect(document.activeElement).toBe(items[2])
    expect(root.value()).toBe('v2')
    press(items[2] as Element, 'Home')
    expect(document.activeElement).toBe(items[0])
    expect(root.value()).toBe('v0')
  })

  it('Space selects when unchecked and prevents default (no page scroll)', () => {
    const { root, items } = mount()
    const prevented = press(items[1] as Element, ' ')
    expect(prevented).toBe(true)
    expect(items[1]?.getAttribute('aria-checked')).toBe('true')
    expect(root.value()).toBe('v1')
    // Space on the checked item is a no-op (no toggle-off).
    press(items[1] as Element, ' ')
    expect(root.value()).toBe('v1')
  })

  it('Enter is preventDefaulted and does NOT activate (APG)', () => {
    const { root, items } = mount()
    const prevented = press(items[1] as Element, 'Enter')
    expect(prevented).toBe(true)
    expect(items[1]?.getAttribute('aria-checked')).toBe('false')
    expect(root.value()).toBeNull()
  })

  it('disabled items are skipped by arrows and unselectable', () => {
    const { root, items } = mount('', ['', 'disabled', ''])
    expect(items[1]?.hasAttribute('data-disabled')).toBe(true)
    expect(items[1]?.getAttribute('aria-disabled')).toBe('true')
    items[0]?.focus()
    press(items[0] as Element, 'ArrowRight') // skips the disabled v1
    expect(document.activeElement).toBe(items[2])
    expect(root.value()).toBe('v2')
    // Direct activation is suppressed too.
    items[1]?.click()
    press(items[1] as Element, ' ')
    expect(root.value()).toBe('v2')
    expect(items[1]?.getAttribute('aria-checked')).toBe('false')
  })

  it('group disabled suppresses all selection', () => {
    const { root, items } = mount('disabled')
    expect(root.getAttribute('aria-disabled')).toBe('true')
    expect(root.hasAttribute('data-disabled')).toBe(true)
    items[0]?.click()
    press(items[0] as Element, ' ')
    expect(root.value()).toBeNull()
  })

  it('RTL via own dir attribute flips horizontal arrows', () => {
    const { root, items } = mount('dir="rtl"')
    items[0]?.focus()
    press(items[0] as Element, 'ArrowLeft') // RTL: left advances
    expect(document.activeElement).toBe(items[1])
    expect(root.value()).toBe('v1')
    press(items[1] as Element, 'ArrowRight') // RTL: right retreats
    expect(document.activeElement).toBe(items[0])
    expect(root.value()).toBe('v0')
  })

  it('inherits RTL from a config-provider ancestor', () => {
    document.body.innerHTML = `
      <aihu-config-provider dir="rtl">
        <aihu-radio-group-root aria-label="Fruit">
          <aihu-radio-group-item value="a" aria-label="a"></aihu-radio-group-item>
          <aihu-radio-group-item value="b" aria-label="b"></aihu-radio-group-item>
        </aihu-radio-group-root>
      </aihu-config-provider>`
    const root = document.querySelector('aihu-radio-group-root') as AihuRadioGroupRoot
    const items = Array.from(
      document.querySelectorAll('aihu-radio-group-item'),
    ) as AihuRadioGroupItem[]
    items[0]?.focus()
    press(items[0] as Element, 'ArrowLeft') // inherited RTL: left advances
    expect(document.activeElement).toBe(items[1])
    expect(root.value()).toBe('b')
  })

  it('consumer-supplied orientation/loop are not clobbered by the defaults', () => {
    const { root, items } = mount('orientation="horizontal"')
    // The loop default still applies (only orientation was supplied).
    expect(root.getAttribute('orientation')).toBe('horizontal')
    expect(root.hasAttribute('loop')).toBe(true)
    items[0]?.focus()
    press(items[0] as Element, 'ArrowDown') // cross-axis: no move
    expect(document.activeElement).toBe(items[0])
    expect(root.value()).toBeNull()
  })

  it('a value-less item stays focusable but is unselectable', () => {
    document.body.innerHTML = `
      <aihu-radio-group-root aria-label="Fruit">
        <aihu-radio-group-item value="a" aria-label="a"></aihu-radio-group-item>
        <aihu-radio-group-item aria-label="no value"></aihu-radio-group-item>
      </aihu-radio-group-root>`
    const root = document.querySelector('aihu-radio-group-root') as AihuRadioGroupRoot
    const items = Array.from(
      document.querySelectorAll('aihu-radio-group-item'),
    ) as AihuRadioGroupItem[]
    items[0]?.focus()
    press(items[0] as Element, 'ArrowRight') // moves to the value-less item…
    expect(document.activeElement).toBe(items[1])
    // …but selection is untouched.
    expect(root.value()).toBeNull()
    items[1]?.click()
    expect(root.value()).toBeNull()
  })
})
