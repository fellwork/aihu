/**
 * WAI-ARIA APG **Radio Group** conformance test (jsdom). Asserts the contract
 * from https://www.w3.org/WAI/ARIA/apg/patterns/radio/ :
 *   - role=radiogroup on the root, role=radio + reactive aria-checked on items
 *   - roving tabindex: exactly ONE item with tabindex=0 at all times
 *   - the tab stop sits on the checked item at mount WITHOUT focus stealing
 *   - two-way `value` attribute reflection; `default-value` seeds once
 *   - `value-change` on user selection only (detail { value })
 *   - hidden-input form participation (nothing submits when unselected)
 *   - the indicator mirrors its OWN item's data-state and is aria-hidden
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { defineFormControl } from '../form-control/index.ts'
import { type AihuRadioGroupItem, type AihuRadioGroupRoot, defineRadioGroup } from './index.ts'

defineRadioGroup()
defineFormControl()

function mount(rootAttrs = ''): { root: AihuRadioGroupRoot; items: AihuRadioGroupItem[] } {
  document.body.innerHTML = `
    <aihu-radio-group-root aria-label="Fruit" ${rootAttrs}>
      <aihu-radio-group-item value="apple" aria-label="Apple"></aihu-radio-group-item>
      <aihu-radio-group-item value="banana" aria-label="Banana"></aihu-radio-group-item>
      <aihu-radio-group-item value="cherry" aria-label="Cherry"></aihu-radio-group-item>
    </aihu-radio-group-root>`
  const root = document.querySelector('aihu-radio-group-root') as AihuRadioGroupRoot
  const items = Array.from(
    document.querySelectorAll('aihu-radio-group-item'),
  ) as AihuRadioGroupItem[]
  return { root, items }
}

function tabindexes(items: Element[]): string[] {
  return items.map((i) => i.getAttribute('tabindex') ?? '')
}

describe('APG conformance — Radio Group', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('the root has role=radiogroup, data-fc-control, and APG defaults', () => {
    const { root } = mount()
    expect(root.getAttribute('role')).toBe('radiogroup')
    expect(root.hasAttribute('data-fc-control')).toBe(true)
    expect(root.getAttribute('orientation')).toBe('both')
    expect(root.hasAttribute('loop')).toBe(true)
  })

  it('respects a consumer-supplied role', () => {
    const { root } = mount('role="menu"')
    expect(root.getAttribute('role')).toBe('menu')
  })

  it('items have role=radio and reactive aria-checked/data-state', () => {
    const { root, items } = mount()
    for (const item of items) {
      expect(item.getAttribute('role')).toBe('radio')
      expect(item.getAttribute('aria-checked')).toBe('false')
      expect(item.getAttribute('data-state')).toBe('unchecked')
    }
    root.setValue('banana')
    expect(items[1]?.getAttribute('aria-checked')).toBe('true')
    expect(items[1]?.getAttribute('data-state')).toBe('checked')
    expect(items[0]?.getAttribute('aria-checked')).toBe('false')
  })

  it('exactly one item has tabindex=0 at all times (roving)', () => {
    const { root, items } = mount()
    expect(tabindexes(items)).toEqual(['0', '-1', '-1'])
    root.setCurrent(2, false)
    expect(tabindexes(items)).toEqual(['-1', '-1', '0'])
  })

  it('the tab stop sits on the checked item at mount WITHOUT focus stealing', () => {
    const before = document.activeElement
    const { items } = mount('value="banana"')
    expect(tabindexes(items)).toEqual(['-1', '0', '-1'])
    expect(items[1]?.getAttribute('aria-checked')).toBe('true')
    // Mounting must not move focus.
    expect(document.activeElement).toBe(before)
  })

  it('reflects two-way: setAttribute → state, user selection → attribute', () => {
    const { root, items } = mount()
    root.setAttribute('value', 'cherry')
    expect(root.value()).toBe('cherry')
    expect(items[2]?.getAttribute('aria-checked')).toBe('true')
    items[0]?.click()
    expect(root.getAttribute('value')).toBe('apple')
    expect(root.value()).toBe('apple')
  })

  it('default-value seeds once without reflecting', () => {
    const { root, items } = mount('default-value="banana"')
    expect(root.value()).toBe('banana')
    expect(items[1]?.getAttribute('aria-checked')).toBe('true')
    expect(root.hasAttribute('value')).toBe(false)
  })

  it('the value attribute wins over default-value', () => {
    const { root } = mount('value="apple" default-value="banana"')
    expect(root.value()).toBe('apple')
  })

  it('value-change fires with detail on USER selection only', () => {
    const { root, items } = mount()
    const seen: string[] = []
    root.addEventListener('value-change', (ev) => {
      seen.push((ev as CustomEvent<{ value: string }>).detail.value)
    })
    items[1]?.click()
    items[1]?.click() // re-clicking the checked item does not re-emit
    root.setValue('cherry') // programmatic: silent
    root.setAttribute('value', 'apple') // attribute write: silent
    expect(seen).toEqual(['banana'])
  })

  it('click moves the tab stop to the clicked item without focus stealing', () => {
    const { items } = mount()
    items[2]?.click()
    expect(tabindexes(items)).toEqual(['-1', '-1', '0'])
  })

  it('aria-required=true when required (own ∥ inherited form-control)', () => {
    const { root } = mount('required')
    expect(root.getAttribute('aria-required')).toBe('true')

    document.body.innerHTML = `
      <aihu-form-control required>
        <aihu-radio-group-root aria-label="Fruit">
          <aihu-radio-group-item value="a" aria-label="a"></aihu-radio-group-item>
        </aihu-radio-group-root>
      </aihu-form-control>`
    const inherited = document.querySelector('aihu-radio-group-root') as AihuRadioGroupRoot
    expect(inherited.getAttribute('aria-required')).toBe('true')
  })

  it('inherits disabled from a disabled form-control ancestor', () => {
    document.body.innerHTML = `
      <aihu-form-control disabled>
        <aihu-radio-group-root aria-label="Fruit">
          <aihu-radio-group-item value="a" aria-label="a"></aihu-radio-group-item>
        </aihu-radio-group-root>
      </aihu-form-control>`
    const root = document.querySelector('aihu-radio-group-root') as AihuRadioGroupRoot
    const item = document.querySelector('aihu-radio-group-item') as AihuRadioGroupItem
    expect(root.hasAttribute('data-disabled')).toBe(true)
    item.click()
    expect(root.value()).toBeNull()
  })

  it('FormData carries name→value when selected, nothing when unselected', () => {
    document.body.innerHTML = `
      <form>
        <aihu-radio-group-root name="fruit" aria-label="Fruit">
          <aihu-radio-group-item value="apple" aria-label="Apple"></aihu-radio-group-item>
          <aihu-radio-group-item value="banana" aria-label="Banana"></aihu-radio-group-item>
        </aihu-radio-group-root>
      </form>`
    const form = document.querySelector('form') as HTMLFormElement
    const items = Array.from(
      document.querySelectorAll('aihu-radio-group-item'),
    ) as AihuRadioGroupItem[]
    // No selection ⇒ submits nothing (native parity).
    expect(new FormData(form).get('fruit')).toBeNull()
    items[1]?.click()
    expect(new FormData(form).get('fruit')).toBe('banana')
    items[0]?.click()
    expect(new FormData(form).get('fruit')).toBe('apple')
  })

  it('the indicator mirrors its OWN item (not the root) and is aria-hidden', () => {
    document.body.innerHTML = `
      <aihu-radio-group-root aria-label="Fruit">
        <aihu-radio-group-item value="a" aria-label="a">
          <aihu-radio-group-indicator></aihu-radio-group-indicator>
        </aihu-radio-group-item>
        <aihu-radio-group-item value="b" aria-label="b" disabled>
          <aihu-radio-group-indicator></aihu-radio-group-indicator>
        </aihu-radio-group-item>
      </aihu-radio-group-root>`
    const root = document.querySelector('aihu-radio-group-root') as AihuRadioGroupRoot
    const [indA, indB] = Array.from(document.querySelectorAll('aihu-radio-group-indicator'))
    expect(indA?.getAttribute('aria-hidden')).toBe('true')
    expect(indA?.getAttribute('data-state')).toBe('unchecked')
    root.setValue('a')
    expect(indA?.getAttribute('data-state')).toBe('checked')
    // The sibling's indicator stays unchecked and mirrors ITS item's disabled.
    expect(indB?.getAttribute('data-state')).toBe('unchecked')
    expect(indB?.hasAttribute('data-disabled')).toBe(true)
  })
})
