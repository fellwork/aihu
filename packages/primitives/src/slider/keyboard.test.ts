/**
 * slider keyboard tests (jsdom): every recognized key, clamping at the
 * boundaries, and disabled suppression (no value change, no event, and — per
 * this primitive's deliberate design choice, see accessibility.md's Keyboard
 * section — `preventDefault()` is NOT called while disabled, unlike
 * switch/checkbox which call it unconditionally before checking disabled).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { type AihuSliderRoot, defineSlider } from './index.ts'

defineSlider()

function press(el: Element, key: string): boolean {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev.defaultPrevented
}

describe('AihuSliderRoot — keyboard', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  function slider(attrs = ''): AihuSliderRoot {
    document.body.innerHTML = `<aihu-slider-root aria-label="Position" ${attrs}></aihu-slider-root>`
    return document.querySelector('aihu-slider-root') as AihuSliderRoot
  }

  it('ArrowLeft decrements by step and prevents default', () => {
    const s = slider('value="50"')
    expect(press(s, 'ArrowLeft')).toBe(true)
    expect(s.value()).toBe(49)
  })

  it('ArrowDown decrements by step', () => {
    const s = slider('value="50"')
    press(s, 'ArrowDown')
    expect(s.value()).toBe(49)
  })

  it('ArrowRight increments by step', () => {
    const s = slider('value="50"')
    press(s, 'ArrowRight')
    expect(s.value()).toBe(51)
  })

  it('ArrowUp increments by step', () => {
    const s = slider('value="50"')
    press(s, 'ArrowUp')
    expect(s.value()).toBe(51)
  })

  it('Home jumps to min', () => {
    const s = slider('value="50"')
    press(s, 'Home')
    expect(s.value()).toBe(0)
  })

  it('End jumps to max', () => {
    const s = slider('value="50"')
    press(s, 'End')
    expect(s.value()).toBe(100)
  })

  it('PageUp increments by step * 10', () => {
    const s = slider('value="50"')
    press(s, 'PageUp')
    expect(s.value()).toBe(60)
  })

  it('PageDown decrements by step * 10', () => {
    const s = slider('value="50"')
    press(s, 'PageDown')
    expect(s.value()).toBe(40)
  })

  it('clamps at the max boundary — ArrowRight/PageUp/End all stop at max', () => {
    const s = slider('value="100"')
    press(s, 'ArrowRight')
    expect(s.value()).toBe(100)
    press(s, 'PageUp')
    expect(s.value()).toBe(100)
  })

  it('clamps at the min boundary — ArrowLeft/PageDown/Home all stop at min', () => {
    const s = slider('value="0"')
    press(s, 'ArrowLeft')
    expect(s.value()).toBe(0)
    press(s, 'PageDown')
    expect(s.value()).toBe(0)
  })

  it('an unrecognized key is a no-op and does not prevent default', () => {
    const s = slider('value="50"')
    expect(press(s, 'a')).toBe(false)
    expect(s.value()).toBe(50)
  })

  it('click/keydown emits value-change with a numeric detail', () => {
    const s = slider('value="50"')
    const seen: number[] = []
    s.addEventListener('value-change', (ev) => {
      seen.push((ev as CustomEvent<{ value: number }>).detail.value)
    })
    press(s, 'ArrowRight')
    press(s, 'ArrowLeft')
    press(s, 'ArrowLeft')
    expect(seen).toEqual([51, 50, 49])
  })

  it('disabled suppresses activation entirely: no value change, no event, no preventDefault', () => {
    const s = slider('value="50" disabled')
    expect(s.hasAttribute('data-disabled')).toBe(true)
    let changes = 0
    s.addEventListener('value-change', () => changes++)
    const prevented = press(s, 'ArrowRight')
    expect(prevented).toBe(false)
    expect(changes).toBe(0)
    expect(s.value()).toBe(50)
    press(s, 'Home')
    press(s, 'End')
    press(s, 'PageUp')
    press(s, 'PageDown')
    expect(changes).toBe(0)
    expect(s.value()).toBe(50)
  })

  it('a value already at a boundary does not re-emit on a key that would overshoot it', () => {
    const s = slider('value="100"')
    const seen: number[] = []
    s.addEventListener('value-change', () => seen.push(s.value()))
    press(s, 'ArrowRight')
    expect(seen).toEqual([])
  })
})
