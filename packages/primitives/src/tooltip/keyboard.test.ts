/**
 * tooltip keyboard/behavior tests (jsdom, fake timers): focus opens after the
 * delay, blur closes after the delay, Escape dismisses immediately, hover
 * honors delays.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type AihuTooltipRoot, defineTooltip } from './index.ts'

defineTooltip()

function mount(): { root: AihuTooltipRoot; trigger: HTMLElement; content: HTMLElement } {
  document.body.innerHTML = `
    <aihu-tooltip-root open-delay="700" close-delay="300" placement="top">
      <aihu-tooltip-trigger id="trg" tabindex="0">Hover</aihu-tooltip-trigger>
      <aihu-tooltip-content>hint</aihu-tooltip-content>
    </aihu-tooltip-root>`
  return {
    root: document.querySelector('aihu-tooltip-root') as AihuTooltipRoot,
    trigger: document.getElementById('trg') as HTMLElement,
    content: document.querySelector('aihu-tooltip-content') as HTMLElement,
  }
}

describe('tooltip — keyboard/behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('focus opens after open-delay; blur closes after close-delay', () => {
    const { root, trigger } = mount()
    trigger.dispatchEvent(new FocusEvent('focus'))
    expect(root.open()).toBe(false)
    vi.advanceTimersByTime(700)
    expect(root.open()).toBe(true)

    trigger.dispatchEvent(new FocusEvent('blur'))
    expect(root.open()).toBe(true)
    vi.advanceTimersByTime(300)
    expect(root.open()).toBe(false)
  })

  it('hover open/close honor the delays', () => {
    const { root, trigger } = mount()
    trigger.dispatchEvent(new MouseEvent('mouseenter'))
    vi.advanceTimersByTime(699)
    expect(root.open()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(root.open()).toBe(true)

    trigger.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(300)
    expect(root.open()).toBe(false)
  })

  it('Escape dismisses immediately', () => {
    const { root, trigger } = mount()
    trigger.dispatchEvent(new FocusEvent('focus'))
    vi.advanceTimersByTime(700)
    expect(root.open()).toBe(true)
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(root.open()).toBe(false)
  })
})
