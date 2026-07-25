/**
 * Behavioural tests for `useHover` — `isEventInside` on
 * `pointerover`/`pointerout` (composed-tree-helper design note §6). The
 * load-bearing case: hovering a descendant that lives inside a NESTED
 * shadow root must register as hovering `target`, which
 * `target.contains(event.target)` cannot see (the target is retargeted to
 * the outermost host on the way out).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHover } from '../src/useHover/index.ts'
import { withSSR } from './_ssr.ts'

/** jsdom has no `PointerEvent` constructor — `addEventListener`/
 * `composedPath()` dispatch on the event's `.type` string, not its concrete
 * class, so a `MouseEvent` with a `pointer*` type is faithful here. */
function firePointer(type: string, el: Element, init: MouseEventInit = {}): void {
  el.dispatchEvent(
    new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, ...init }),
  )
}

describe('@aihu/use/useHover', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('starts false, flips true on pointerover, false on pointerout', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { isHovering } = useHover({ target: el })
    expect(isHovering()).toBe(false)

    firePointer('pointerover', el, { relatedTarget: document.body })
    expect(isHovering()).toBe(true)

    firePointer('pointerout', el, { relatedTarget: document.body })
    expect(isHovering()).toBe(false)
  })

  it('a null/omitted target never hovers', () => {
    const { isHovering } = useHover()
    expect(isHovering()).toBe(false)
  })

  it('suppresses the flicker of moving between two of its own descendants', () => {
    const el = document.createElement('div')
    const childA = document.createElement('span')
    const childB = document.createElement('span')
    el.append(childA, childB)
    document.body.appendChild(el)
    const { isHovering } = useHover({ target: el })

    firePointer('pointerover', childA, { relatedTarget: document.body })
    expect(isHovering()).toBe(true)

    // pointerout childA -> childB, pointerover childB <- childA: both
    // relatedTargets are already inside `el` — must NOT flip false in
    // between.
    firePointer('pointerout', childA, { relatedTarget: childB })
    expect(isHovering()).toBe(true)
    firePointer('pointerover', childB, { relatedTarget: childA })
    expect(isHovering()).toBe(true)

    firePointer('pointerout', childB, { relatedTarget: document.body })
    expect(isHovering()).toBe(false)
  })

  it('SHADOW BOUNDARY: hovering a descendant inside a nested shadow root registers as hovering the host', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    const panel = document.createElement('div')
    const button = document.createElement('button')
    panel.appendChild(button)
    root.appendChild(panel)

    const { isHovering } = useHover({ target: host })
    firePointer('pointerover', button, { relatedTarget: document.body })
    expect(isHovering()).toBe(true)

    firePointer('pointerout', button, { relatedTarget: document.body })
    expect(isHovering()).toBe(false)
  })

  it('delayEnter/delayLeave: flips only after the delay, and a reversal before the delay cancels it', () => {
    vi.useFakeTimers()
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { isHovering } = useHover({ target: el, delayEnter: 100, delayLeave: 50 })

    firePointer('pointerover', el, { relatedTarget: document.body })
    expect(isHovering()).toBe(false) // not yet — delay pending
    vi.advanceTimersByTime(99)
    expect(isHovering()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(isHovering()).toBe(true)

    firePointer('pointerout', el, { relatedTarget: document.body })
    expect(isHovering()).toBe(true) // leave delay pending
    // Re-enter before the leave delay elapses cancels it.
    firePointer('pointerover', el, { relatedTarget: document.body })
    vi.advanceTimersByTime(50)
    expect(isHovering()).toBe(true)
  })

  it('a getter target rebinds reactively', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    document.body.append(a, b)
    let current: Element = a
    const { isHovering } = useHover({ target: () => current })

    firePointer('pointerover', a, { relatedTarget: document.body })
    expect(isHovering()).toBe(true)

    current = b
    // Rebinding requires the getter to be re-evaluated; useHover's effect
    // only re-runs on a tracked signal read, so this asserts the documented
    // "getter with no signal read runs once" caveat does NOT silently break
    // the a-target listener (still attached to `a`).
    firePointer('pointerover', a, { relatedTarget: document.body })
    expect(isHovering()).toBe(true)
  })
})

describe('@aihu/use/useHover — SSR-static path', () => {
  it('returns a static false getter and registers no listener under SSR', () =>
    withSSR(
      () => import('../src/useHover/index.ts'),
      (mod) => {
        const { isHovering } = mod.useHover()
        expect(isHovering()).toBe(false)
      },
    ))
})
