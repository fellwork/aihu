/**
 * Unit tests for `useFocusWithin` (effect-scope plan §5): `focusin`/
 * `focusout`-based containment tracking, `composedPath()`-based real-target
 * resolution, no-target behavior, reactive target rebinding, scope
 * cleanup, and the SSR-static path (simulated `!isClient` via module
 * re-evaluation). jsdom environment (root vitest config).
 *
 * jsdom dispatches real `focusin`/`focusout` events on `.focus()`/`.blur()`
 * and supports `Event.composedPath()`, so this file exercises the real
 * DOM path rather than a fake.
 */
import { effectScope, signal } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { useFocusWithin } from '../src/useFocusWithin/index.ts'
import { withSSR } from './_ssr.ts'

function makeContainerWithChild(): { container: HTMLElement; child: HTMLElement } {
  const container = document.createElement('div')
  const child = document.createElement('input')
  child.tabIndex = 0
  container.appendChild(child)
  document.body.appendChild(container)
  return { container, child }
}

describe('@aihu/use/useFocusWithin', () => {
  it('starts false', () => {
    const { container } = makeContainerWithChild()
    const { focused } = useFocusWithin({ target: container })
    expect(focused()).toBe(false)
  })

  it('focusing a descendant sets focused() true; blurring it out sets it false', () => {
    const { container, child } = makeContainerWithChild()
    const outside = document.createElement('input')
    document.body.appendChild(outside)
    const { focused } = useFocusWithin({ target: container })

    child.focus()
    expect(focused()).toBe(true)

    outside.focus() // relatedTarget on the resulting focusout is `outside`
    expect(focused()).toBe(false)
  })

  it('focusing the container itself also counts as within', () => {
    const container = document.createElement('div')
    container.tabIndex = 0
    document.body.appendChild(container)
    const { focused } = useFocusWithin({ target: container })
    container.focus()
    expect(focused()).toBe(true)
  })

  it('moving focus between two descendants stays focused() true', () => {
    const { container, child } = makeContainerWithChild()
    const child2 = document.createElement('input')
    child2.tabIndex = 0
    container.appendChild(child2)
    const { focused } = useFocusWithin({ target: container })

    child.focus()
    expect(focused()).toBe(true)
    child2.focus()
    expect(focused()).toBe(true)
  })

  it('no target: registers no listener, stays false', () => {
    const { child } = makeContainerWithChild()
    const { focused } = useFocusWithin()
    child.focus()
    expect(focused()).toBe(false)
  })

  it('a getter target rebinds: listeners move to the new element', () => {
    const { container: containerA, child: childA } = makeContainerWithChild()
    const { container: containerB, child: childB } = makeContainerWithChild()
    const [target, setTarget] = signal<HTMLElement | null>(containerA)
    const { focused } = useFocusWithin({ target })

    childA.focus()
    expect(focused()).toBe(true)

    setTarget(containerB)
    // The rebind ran a fresh effect — focused() resets since the new
    // target has no listener history of its own yet.
    childA.blur()
    childB.focus()
    expect(focused()).toBe(true)
  })

  it('scope.stop() removes the listeners', () => {
    const { container, child } = makeContainerWithChild()
    const scope = effectScope()
    const ret = scope.run(() => useFocusWithin({ target: container })) as ReturnType<
      typeof useFocusWithin
    >
    scope.stop()
    child.focus()
    expect(ret.focused()).toBe(false)
  })
})

describe('@aihu/use/useFocusWithin — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns a static false getter and registers nothing', () =>
    withSSR(
      () => import('../src/useFocusWithin/index.ts'),
      (mod) => {
        const { focused } = mod.useFocusWithin()
        expect(focused()).toBe(false)
      },
    ))
})
