/**
 * WAI-ARIA APG **Slider** conformance test (jsdom). Asserts the contract from
 * https://www.w3.org/WAI/ARIA/apg/patterns/slider/ :
 *   - role=slider + tabindex=0 on the host
 *   - aria-valuemin/valuemax/valuenow correct and reactive
 *   - aria-orientation defaults to horizontal
 *   - value clamps to [min, max] and rounds to the nearest step
 *   - `value-change` fires on user interaction (keyboard + simulated pointer
 *     drag), NOT on programmatic attribute writes or `setValue()`
 *
 * jsdom ships no `PointerEvent` constructor, so pointer interaction is
 * simulated by dispatching plain `MouseEvent`s typed `pointerdown` /
 * `pointermove` / `pointerup` — the primitive's handlers only branch on
 * `ev.type` (via `addEventListener`) and read `ev.clientX`, both of which a
 * `MouseEvent` carries identically.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { type AihuSliderRoot, defineSlider } from './index.ts'

defineSlider()

function pointerEvent(type: string, clientX: number): MouseEvent {
  return new MouseEvent(type, { clientX, bubbles: true, cancelable: true })
}

describe('APG conformance — Slider', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('the host has role=slider and tabindex=0', () => {
    document.body.innerHTML = '<aihu-slider-root aria-label="Position"></aihu-slider-root>'
    const s = document.querySelector('aihu-slider-root') as AihuSliderRoot
    expect(s.getAttribute('role')).toBe('slider')
    expect(s.getAttribute('tabindex')).toBe('0')
  })

  it('aria-orientation defaults to horizontal', () => {
    document.body.innerHTML = '<aihu-slider-root aria-label="Position"></aihu-slider-root>'
    const s = document.querySelector('aihu-slider-root') as AihuSliderRoot
    expect(s.getAttribute('aria-orientation')).toBe('horizontal')
  })

  it('aria-valuemin/valuemax/valuenow reflect defaults and update on value change', () => {
    document.body.innerHTML = '<aihu-slider-root aria-label="Position"></aihu-slider-root>'
    const s = document.querySelector('aihu-slider-root') as AihuSliderRoot
    expect(s.getAttribute('aria-valuemin')).toBe('0')
    expect(s.getAttribute('aria-valuemax')).toBe('100')
    expect(s.getAttribute('aria-valuenow')).toBe('50')
    s.setValue(75)
    expect(s.getAttribute('aria-valuenow')).toBe('75')
    expect(s.value()).toBe(75)
  })

  it('respects custom min/max/value/step attributes', () => {
    document.body.innerHTML =
      '<aihu-slider-root min="10" max="20" value="14" step="2" aria-label="Position"></aihu-slider-root>'
    const s = document.querySelector('aihu-slider-root') as AihuSliderRoot
    expect(s.getAttribute('aria-valuemin')).toBe('10')
    expect(s.getAttribute('aria-valuemax')).toBe('20')
    // 14 rounds to the nearest step of 2 from min=10 -> 14 is already on-step.
    expect(s.getAttribute('aria-valuenow')).toBe('14')
  })

  it('value clamps to [min, max] on out-of-range attribute writes', () => {
    document.body.innerHTML =
      '<aihu-slider-root min="0" max="10" value="50" aria-label="Position"></aihu-slider-root>'
    const s = document.querySelector('aihu-slider-root') as AihuSliderRoot
    expect(s.value()).toBe(10)
    s.setAttribute('value', '-5')
    expect(s.value()).toBe(0)
  })

  it('value rounds to the nearest step', () => {
    document.body.innerHTML =
      '<aihu-slider-root min="0" max="100" step="10" value="53" aria-label="Position"></aihu-slider-root>'
    const s = document.querySelector('aihu-slider-root') as AihuSliderRoot
    expect(s.value()).toBe(50)
    s.setAttribute('value', '58')
    expect(s.value()).toBe(60)
  })

  it('value-change fires on a keyboard-driven change', () => {
    document.body.innerHTML = '<aihu-slider-root aria-label="Position"></aihu-slider-root>'
    const s = document.querySelector('aihu-slider-root') as AihuSliderRoot
    const seen: number[] = []
    s.addEventListener('value-change', (ev) => {
      seen.push((ev as CustomEvent<{ value: number }>).detail.value)
    })
    s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(seen).toEqual([51])
  })

  it('value-change fires on a simulated pointer drag', () => {
    document.body.innerHTML = '<aihu-slider-root aria-label="Position"></aihu-slider-root>'
    const s = document.querySelector('aihu-slider-root') as AihuSliderRoot
    // jsdom lays out nothing, so stub geometry: a 100px-wide track at x=0.
    s.getBoundingClientRect = () =>
      ({ left: 0, right: 100, width: 100, top: 0, bottom: 0, height: 0 }) as DOMRect
    const seen: number[] = []
    s.addEventListener('value-change', (ev) => {
      seen.push((ev as CustomEvent<{ value: number }>).detail.value)
    })
    s.dispatchEvent(pointerEvent('pointerdown', 20)) // 20% across -> value 20
    document.dispatchEvent(pointerEvent('pointermove', 80)) // 80% across -> value 80
    document.dispatchEvent(pointerEvent('pointerup', 80))
    expect(seen).toEqual([20, 80])
    expect(s.value()).toBe(80)
  })

  it('does NOT fire on programmatic setAttribute or setValue()', () => {
    document.body.innerHTML = '<aihu-slider-root aria-label="Position"></aihu-slider-root>'
    const s = document.querySelector('aihu-slider-root') as AihuSliderRoot
    let changes = 0
    s.addEventListener('value-change', () => changes++)
    s.setValue(70)
    s.setAttribute('value', '30')
    expect(changes).toBe(0)
    expect(s.value()).toBe(30)
  })
})
