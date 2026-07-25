/**
 * Behavioural tests for `useClickOutside`/`onClickOutside` — the headline
 * consumer of the composed-tree substrate (composed-tree-helper design note
 * §6). Two properties are load-bearing and get dedicated tests, not just
 * incidental coverage:
 *
 * 1. A pointerdown/pointerup gesture that genuinely happens INSIDE a
 *    NESTED SHADOW target must not fire — this is the scenario where a
 *    naive `.contains()`/retargeted-`event.target` check gets the wrong
 *    answer (a light-DOM-only test would pass while the real behaviour is
 *    broken; see the repo's standing lesson).
 * 2. That same assertion, run with pointerdown and pointerup as two
 *    SEPARATE `dispatchEvent` calls, is also the regression test for
 *    "stores events, not booleans": by the time the pointerup handler
 *    runs, the pointerdown event's OWN dispatch has already finished, so
 *    `composedPath()` on a STASHED pointerdown event would already be
 *    empty. An implementation that re-reads a stored event there (instead
 *    of a boolean computed synchronously inside the pointerdown handler)
 *    would wrongly conclude the gesture started outside `host` and fire
 *    the handler.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onClickOutside, useClickOutside } from '../src/useClickOutside/index.ts'
import { withSSR } from './_ssr.ts'

/** Dispatch a bubbling, composed synthetic pointer event of `type` from
 * `el`. jsdom has no `PointerEvent` constructor, so a `MouseEvent` is used
 * — `addEventListener`/`composedPath()` dispatch on the event's `.type`
 * string, not its concrete class, so this is faithful for what this
 * composable actually reads (`clientX/Y`, `relatedTarget`, `composedPath`). */
function firePointer(type: string, el: Element, init: MouseEventInit = {}): void {
  el.dispatchEvent(
    new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, ...init }),
  )
}

describe('@aihu/use/useClickOutside', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('fires for a genuine outside pointerdown+pointerup pair', () => {
    const target = document.createElement('div')
    const outside = document.createElement('div')
    document.body.append(target, outside)
    const handler = vi.fn()
    useClickOutside(target, handler)

    firePointer('pointerdown', outside)
    firePointer('pointerup', outside)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not fire for a gesture on the target itself', () => {
    const target = document.createElement('div')
    document.body.append(target)
    const handler = vi.fn()
    useClickOutside(target, handler)

    firePointer('pointerdown', target)
    firePointer('pointerup', target)
    expect(handler).not.toHaveBeenCalled()
  })

  it('does NOT fire when the gesture starts inside and ends outside (drag-select guard)', () => {
    const target = document.createElement('div')
    const outside = document.createElement('div')
    document.body.append(target, outside)
    const handler = vi.fn()
    useClickOutside(target, handler)

    firePointer('pointerdown', target)
    firePointer('pointerup', outside)
    expect(handler).not.toHaveBeenCalled()
  })

  it('does NOT fire when the gesture starts outside and ends inside', () => {
    const target = document.createElement('div')
    const outside = document.createElement('div')
    document.body.append(target, outside)
    const handler = vi.fn()
    useClickOutside(target, handler)

    firePointer('pointerdown', outside)
    firePointer('pointerup', target)
    expect(handler).not.toHaveBeenCalled()
  })

  it('treats `ignore` entries as inside, even though they sit outside target', () => {
    const target = document.createElement('div')
    const trigger = document.createElement('button')
    document.body.append(target, trigger)
    const handler = vi.fn()
    useClickOutside(target, handler, { ignore: [trigger] })

    firePointer('pointerdown', trigger)
    firePointer('pointerup', trigger)
    expect(handler).not.toHaveBeenCalled()
  })

  it('a genuinely outside gesture still fires when ignore is non-empty', () => {
    const target = document.createElement('div')
    const trigger = document.createElement('button')
    const outside = document.createElement('div')
    document.body.append(target, trigger, outside)
    const handler = vi.fn()
    useClickOutside(target, handler, { ignore: [trigger] })

    firePointer('pointerdown', outside)
    firePointer('pointerup', outside)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('SHADOW BOUNDARY + BOOLEANS-NOT-EVENTS: a genuine click two shadow roots deep does not fire', () => {
    // host (target) -> open shadow root -> panel -> innerHost -> open shadow
    // root -> button. Two nested shadow boundaries between the click and
    // `target`, matching the composed-tree design note's own probe fixture.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    const panel = document.createElement('div')
    const innerHost = document.createElement('div')
    panel.appendChild(innerHost)
    root.appendChild(panel)
    const innerRoot = innerHost.attachShadow({ mode: 'open' })
    const button = document.createElement('button')
    innerRoot.appendChild(button)

    const handler = vi.fn()
    useClickOutside(host, handler)

    // Two SEPARATE dispatchEvent calls — pointerdown's own dispatch (and
    // therefore its composedPath()) has fully finished before pointerup
    // fires. See module doc / file doc for why this is the discriminating
    // case between "stores a boolean" (correct) and "stores the event"
    // (silently degrades once dispatch ends).
    firePointer('pointerdown', button)
    firePointer('pointerup', button)
    expect(handler).not.toHaveBeenCalled()
  })

  it('SHADOW BOUNDARY: a genuine outside click still fires when target itself is shadow-nested', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    root.appendChild(document.createElement('button'))

    const outside = document.createElement('div')
    document.body.appendChild(outside)

    const handler = vi.fn()
    useClickOutside(host, handler)

    firePointer('pointerdown', outside)
    firePointer('pointerup', outside)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('a null/undefined target means nothing is ever "inside" — every completed gesture fires', () => {
    const outside = document.createElement('div')
    document.body.append(outside)
    const handler = vi.fn()
    useClickOutside(null, handler)

    firePointer('pointerdown', outside)
    firePointer('pointerup', outside)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('stop() removes both listeners — a later gesture no longer fires', () => {
    const target = document.createElement('div')
    const outside = document.createElement('div')
    document.body.append(target, outside)
    const handler = vi.fn()
    const stop = useClickOutside(target, handler)
    stop()

    firePointer('pointerdown', outside)
    firePointer('pointerup', outside)
    expect(handler).not.toHaveBeenCalled()
  })

  it('onClickOutside is the useClickOutside alias', () => {
    expect(onClickOutside).toBe(useClickOutside)
  })
})

describe('@aihu/use/useClickOutside — SSR-static path', () => {
  it('registers nothing and returns a no-op stop under SSR', () =>
    withSSR(
      () => import('../src/useClickOutside/index.ts'),
      (mod) => {
        const handler = vi.fn()
        let stop: (() => void) | undefined
        expect(() => {
          stop = mod.useClickOutside(null, handler)
        }).not.toThrow()
        expect(() => stop?.()).not.toThrow()
        expect(handler).not.toHaveBeenCalled()
      },
    ))
})
