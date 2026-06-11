/**
 * roving-focus keyboard tests (jsdom): arrow advance/retreat, loop wrap,
 * Home/End, single-tabindex invariant, and RTL horizontal flip.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { type AihuConfigProvider, defineConfigProvider } from '../config-provider/index.ts'
import { type AihuRovingFocus, defineRovingFocus } from './index.ts'

defineRovingFocus()
defineConfigProvider()

interface Setup {
  rf: AihuRovingFocus
  items: HTMLButtonElement[]
}

function mount(opts: { orientation?: string; loop?: boolean; dir?: string } = {}): Setup {
  const rf = document.createElement('aihu-roving-focus') as AihuRovingFocus
  if (opts.orientation) rf.setAttribute('orientation', opts.orientation)
  if (opts.loop) rf.setAttribute('loop', '')
  if (opts.dir) rf.setAttribute('dir', opts.dir)
  const items: HTMLButtonElement[] = []
  for (let i = 0; i < 3; i++) {
    const b = document.createElement('button')
    b.textContent = `item ${i}`
    rf.appendChild(b)
    items.push(b)
  }
  document.body.appendChild(rf)
  // Register the descendants (consumers/recipes do this on connect).
  for (const b of items) rf.register(b)
  return { rf, items }
}

function press(rf: HTMLElement, key: string): void {
  rf.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

function tabindexes(items: HTMLElement[]): string[] {
  return items.map((i) => i.getAttribute('tabindex') ?? '')
}

describe('<aihu-roving-focus>', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('exactly one item has tabindex=0 at all times', () => {
    const { items } = mount()
    expect(tabindexes(items)).toEqual(['0', '-1', '-1'])
  })

  it('ArrowRight advances, ArrowLeft retreats (horizontal LTR)', () => {
    const { rf, items } = mount({ orientation: 'horizontal' })
    press(rf, 'ArrowRight')
    expect(rf.currentIndex()).toBe(1)
    expect(tabindexes(items)).toEqual(['-1', '0', '-1'])
    press(rf, 'ArrowLeft')
    expect(rf.currentIndex()).toBe(0)
  })

  it('ArrowDown/ArrowUp advance/retreat in vertical orientation', () => {
    const { rf } = mount({ orientation: 'vertical' })
    press(rf, 'ArrowDown')
    expect(rf.currentIndex()).toBe(1)
    press(rf, 'ArrowUp')
    expect(rf.currentIndex()).toBe(0)
  })

  it('does not move on the cross axis', () => {
    const { rf } = mount({ orientation: 'horizontal' })
    press(rf, 'ArrowDown')
    expect(rf.currentIndex()).toBe(0)
  })

  it('loop wraps at the ends', () => {
    const { rf } = mount({ orientation: 'horizontal', loop: true })
    press(rf, 'ArrowLeft') // from 0 wraps to last
    expect(rf.currentIndex()).toBe(2)
    press(rf, 'ArrowRight') // from last wraps to 0
    expect(rf.currentIndex()).toBe(0)
  })

  it('clamps at the ends when loop is off', () => {
    const { rf } = mount({ orientation: 'horizontal' })
    press(rf, 'ArrowLeft')
    expect(rf.currentIndex()).toBe(0)
  })

  it('Home/End jump to first/last', () => {
    const { rf } = mount({ orientation: 'horizontal' })
    press(rf, 'End')
    expect(rf.currentIndex()).toBe(2)
    press(rf, 'Home')
    expect(rf.currentIndex()).toBe(0)
  })

  it('setCurrent(index, false) moves the tab stop without focusing', () => {
    const { rf, items } = mount()
    items[0].focus()
    rf.setCurrent(2, false)
    expect(rf.currentIndex()).toBe(2)
    expect(tabindexes(items)).toEqual(['-1', '-1', '0'])
    // Focus did NOT follow the tab stop.
    expect(document.activeElement).toBe(items[0])
    // Default (focus=true) still focuses.
    rf.setCurrent(1)
    expect(document.activeElement).toBe(items[1])
  })

  it('RTL flips horizontal arrow direction', () => {
    const { rf } = mount({ orientation: 'horizontal', dir: 'rtl' })
    press(rf, 'ArrowLeft') // RTL: left advances
    expect(rf.currentIndex()).toBe(1)
    press(rf, 'ArrowRight') // RTL: right retreats
    expect(rf.currentIndex()).toBe(0)
  })

  it('inherits dir from a nearest config-provider', () => {
    const cfg = document.createElement('aihu-config-provider') as AihuConfigProvider
    cfg.setAttribute('dir', 'rtl')
    const rf = document.createElement('aihu-roving-focus') as AihuRovingFocus
    rf.setAttribute('orientation', 'horizontal')
    const items: HTMLButtonElement[] = []
    for (let i = 0; i < 3; i++) {
      const b = document.createElement('button')
      rf.appendChild(b)
      items.push(b)
    }
    cfg.appendChild(rf)
    document.body.appendChild(cfg)
    for (const b of items) rf.register(b)

    press(rf, 'ArrowLeft') // RTL inherited → left advances
    expect(rf.currentIndex()).toBe(1)
  })
})
