/**
 * Behavioural tests for `useMouseInElement` — `isEventInside` +
 * `composedEventTarget` drive `isOutside`; `getBoundingClientRect` drives
 * the element-relative geometry (composed-tree-helper design note §6). The
 * load-bearing case: `isOutside` must be `false` for a pointermove whose
 * true origin is a NESTED shadow descendant of `target`, which a
 * bounding-box-only (or `.contains()`-only) check would get wrong once the
 * descendant sits inside a shadow tree of its own (an overlapping/absolute
 * fixture below covers the geometry side of that gap).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { useMouseInElement } from '../src/useMouseInElement/index.ts'
import { withSSR } from './_ssr.ts'

/** jsdom has no `PointerEvent` constructor — `addEventListener`/
 * `composedPath()` dispatch on the event's `.type` string, not its concrete
 * class, so a `MouseEvent` with a `pointer*` type is faithful here. */
function firePointer(type: string, el: EventTarget, init: MouseEventInit = {}): void {
  el.dispatchEvent(
    new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, ...init }),
  )
}

/** jsdom never lays anything out, so `getBoundingClientRect()` is always
 * all-zero — stub it per-element to give the geometry getters something
 * real to report. */
function stubRect(el: Element, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect
}

describe('@aihu/use/useMouseInElement', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('starts at all-zero with isOutside true', () => {
    const { x, y, elementX, elementY, isOutside } = useMouseInElement()
    expect(x()).toBe(0)
    expect(y()).toBe(0)
    expect(elementX()).toBe(0)
    expect(elementY()).toBe(0)
    expect(isOutside()).toBe(true)
  })

  it('tracks raw x/y on every pointermove, regardless of target', () => {
    const { x, y } = useMouseInElement()
    firePointer('pointermove', window, { clientX: 12, clientY: 34 })
    expect(x()).toBe(12)
    expect(y()).toBe(34)
  })

  it('reports element-relative geometry and isOutside=false for a move onto the target', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    stubRect(el, { left: 100, top: 50, width: 200, height: 80, right: 300, bottom: 130 })

    const { elementX, elementY, elementWidth, elementHeight, isOutside } = useMouseInElement({
      target: el,
    })
    firePointer('pointermove', el, { clientX: 150, clientY: 70 })

    expect(elementX()).toBe(50) // 150 - rect.left(100)
    expect(elementY()).toBe(20) // 70 - rect.top(50)
    expect(elementWidth()).toBe(200)
    expect(elementHeight()).toBe(80)
    expect(isOutside()).toBe(false)
  })

  it('isOutside is true for a move that never touches the target', () => {
    const el = document.createElement('div')
    const elsewhere = document.createElement('div')
    document.body.append(el, elsewhere)
    stubRect(el, { left: 0, top: 0, width: 50, height: 50, right: 50, bottom: 50 })

    const { isOutside } = useMouseInElement({ target: el })
    firePointer('pointermove', elsewhere, { clientX: 500, clientY: 500 })
    expect(isOutside()).toBe(true)
  })

  it('SHADOW BOUNDARY: isOutside is false for a move whose true origin is a nested shadow descendant', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    stubRect(host, { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 })
    const root = host.attachShadow({ mode: 'open' })
    const panel = document.createElement('div')
    const button = document.createElement('button')
    panel.appendChild(button)
    root.appendChild(panel)

    const { isOutside } = useMouseInElement({ target: host })
    // Retargeting would rewrite event.target to `host` anyway here (single
    // boundary) — the discriminating assertion is in the two-level fixture
    // below, which a naive up-walk from a retargeted target cannot resolve.
    firePointer('pointermove', button, { clientX: 10, clientY: 10 })
    expect(isOutside()).toBe(false)
  })

  it('SHADOW BOUNDARY: isOutside is false two nested shadow roots deep, where an up-walk from the retargeted target fails', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    stubRect(host, { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 })
    const root = host.attachShadow({ mode: 'open' })
    const panel = document.createElement('div')
    const innerHost = document.createElement('div')
    panel.appendChild(innerHost)
    root.appendChild(panel)
    const innerRoot = innerHost.attachShadow({ mode: 'open' })
    const deep = document.createElement('button')
    innerRoot.appendChild(deep)

    const { isOutside } = useMouseInElement({ target: host })
    firePointer('pointermove', deep, { clientX: 10, clientY: 10 })
    expect(isOutside()).toBe(false)
  })

  it('a null/omitted target keeps isOutside true and geometry at zero', () => {
    const { elementX, elementY, isOutside } = useMouseInElement()
    firePointer('pointermove', window, { clientX: 42, clientY: 42 })
    expect(elementX()).toBe(0)
    expect(elementY()).toBe(0)
    expect(isOutside()).toBe(true)
  })

  it('re-derives element geometry from the last position on resize, without a fresh pointer event', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    stubRect(el, { left: 0, top: 0, width: 50, height: 50, right: 50, bottom: 50 })

    const { elementX, elementY } = useMouseInElement({ target: el })
    firePointer('pointermove', el, { clientX: 10, clientY: 10 })
    expect(elementX()).toBe(10)

    // Element moves without a new pointer event.
    stubRect(el, { left: 5, top: 5, width: 50, height: 50, right: 55, bottom: 55 })
    window.dispatchEvent(new Event('resize'))
    expect(elementX()).toBe(5) // 10 - new left(5)
    expect(elementY()).toBe(5)
  })
})

describe('@aihu/use/useMouseInElement — SSR-static path', () => {
  it('returns static all-zero/isOutside-true getters and registers no listener under SSR', () =>
    withSSR(
      () => import('../src/useMouseInElement/index.ts'),
      (mod) => {
        const { x, y, elementX, isOutside } = mod.useMouseInElement()
        expect(x()).toBe(0)
        expect(y()).toBe(0)
        expect(elementX()).toBe(0)
        expect(isOutside()).toBe(true)
      },
    ))
})
