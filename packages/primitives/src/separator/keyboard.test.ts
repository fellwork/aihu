/**
 * separator behavior tests (jsdom): role/orientation reflection, decorative
 * mode, runtime toggling, and the not-focusable contract.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { type AihuSeparator, defineSeparator } from './index.ts'

defineSeparator()

function mount(attrs = ''): AihuSeparator {
  document.body.innerHTML = `<aihu-separator ${attrs}></aihu-separator>`
  return document.querySelector('aihu-separator') as AihuSeparator
}

describe('<aihu-separator>', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('defaults to role=separator with data-orientation=horizontal', () => {
    const sep = mount()
    expect(sep.getAttribute('role')).toBe('separator')
    expect(sep.getAttribute('data-orientation')).toBe('horizontal')
  })

  it('omits aria-orientation when horizontal (the ARIA default)', () => {
    const sep = mount('orientation="horizontal"')
    expect(sep.getAttribute('aria-orientation')).toBeNull()
  })

  it('sets aria-orientation=vertical when vertical', () => {
    const sep = mount('orientation="vertical"')
    expect(sep.getAttribute('aria-orientation')).toBe('vertical')
    expect(sep.getAttribute('data-orientation')).toBe('vertical')
  })

  it('decorative removes separator semantics (role=none, no aria-orientation)', () => {
    const sep = mount('decorative orientation="vertical"')
    expect(sep.getAttribute('role')).toBe('none')
    expect(sep.getAttribute('aria-orientation')).toBeNull()
    // data-orientation stays reflected for styling.
    expect(sep.getAttribute('data-orientation')).toBe('vertical')
  })

  it('toggling decorative and orientation at runtime updates ARIA', () => {
    const sep = mount()
    sep.setAttribute('decorative', '')
    expect(sep.getAttribute('role')).toBe('none')
    sep.removeAttribute('decorative')
    expect(sep.getAttribute('role')).toBe('separator')

    sep.setAttribute('orientation', 'vertical')
    expect(sep.getAttribute('aria-orientation')).toBe('vertical')
    sep.setAttribute('orientation', 'horizontal')
    expect(sep.getAttribute('aria-orientation')).toBeNull()
  })

  it('is not focusable: never receives a tabindex', () => {
    const sep = mount()
    expect(sep.hasAttribute('tabindex')).toBe(false)
  })
})
