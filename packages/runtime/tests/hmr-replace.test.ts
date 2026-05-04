/**
 * Unit tests for `_hmrReplace` (Plan 4.1 HMR).
 *
 * `_hmrReplace(element, newSetup)` must:
 *   1. Dispose the current `MountScope` on the element (tears down effects +
 *      removes DOM nodes from the shadow root).
 *   2. Re-run `newSetup(ctx)` with the same host and element refs.
 *   3. Mount the returned tree back into the same host.
 *
 * Tests use jsdom's DOM APIs (same environment as define-component tests).
 */

import { branch, leaf, mount } from '@scribe/arbor'
import { signal } from '@scribe/signals'
import { describe, expect, it, vi } from 'vitest'
import { _hmrReplace, _setMount, defineComponent } from '../src/define-component.ts'
import { defineElement } from '../src/define-element.ts'
import type { SetupContext } from '../src/types.ts'

// Wire mount once for all tests in this file.
_setMount(mount)

// Use unique tag name counters per test to avoid SCR-R0001 collisions.
let _tagCounter = 0
function nextTag(): string {
  return `x-hmr-${++_tagCounter}`
}

describe('_hmrReplace — Plan 4.1', () => {
  it('HMR-1: replaces the rendered tree in-place without re-connecting the element', () => {
    // Setup v1: renders a <span>v1</span>
    const setup1 = (_ctx: SetupContext) => branch('span', undefined, [leaf('v1')])
    const Cmp = defineComponent(setup1)
    const tag = nextTag()
    defineElement(tag, Cmp)

    const el = document.createElement(tag)
    document.body.appendChild(el)

    // Confirm initial render.
    expect(el.shadowRoot?.querySelector('span')?.textContent).toBe('v1')

    // Setup v2: renders a <p>v2</p>
    const setup2 = (_ctx: SetupContext) => branch('p', undefined, [leaf('v2')])

    // Replace in-place — element stays connected.
    _hmrReplace(el, setup2)

    // Old tree gone; new tree present.
    expect(el.shadowRoot?.querySelector('span')).toBeNull()
    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('v2')

    el.remove()
  })

  it('HMR-2: disposes the old MountScope before mounting the new tree', () => {
    const disposeSpy = vi.fn()
    const realMount = mount

    // Inject a mount that wraps dispose with a spy.
    _setMount((node, host) => {
      const scope = realMount(node, host)
      const origDispose = scope.dispose.bind(scope)
      return {
        ...scope,
        dispose() {
          disposeSpy()
          origDispose()
        },
      }
    })

    const setup1 = (_ctx: SetupContext) => leaf('old')
    const Cmp = defineComponent(setup1)
    const tag = nextTag()
    defineElement(tag, Cmp)

    const el = document.createElement(tag)
    document.body.appendChild(el)

    // The spy wraps the scope created by connectedCallback.
    expect(disposeSpy).not.toHaveBeenCalled()

    const setup2 = (_ctx: SetupContext) => leaf('new')
    _hmrReplace(el, setup2)

    // Old scope must be disposed before new tree is mounted.
    expect(disposeSpy).toHaveBeenCalledTimes(1)

    // Restore real mount for subsequent tests.
    _setMount(realMount)
    el.remove()
  })

  it('HMR-3: new setup receives the same host and element refs', () => {
    let capturedCtx: SetupContext | null = null

    const setup1 = (_ctx: SetupContext) => leaf('a')
    const Cmp = defineComponent(setup1)
    const tag = nextTag()
    defineElement(tag, Cmp)

    const el = document.createElement(tag)
    document.body.appendChild(el)

    const setup2 = (ctx: SetupContext) => {
      capturedCtx = ctx
      return leaf('b')
    }

    _hmrReplace(el, setup2)

    expect(capturedCtx).not.toBeNull()
    expect((capturedCtx as SetupContext | null)?.element).toBe(el)
    expect((capturedCtx as SetupContext | null)?.host).toBe(el.shadowRoot)

    el.remove()
  })

  it('HMR-4: reactive signals in the new setup work normally', () => {
    const setup1 = (_ctx: SetupContext) => leaf('initial')
    const Cmp = defineComponent(setup1)
    const tag = nextTag()
    defineElement(tag, Cmp)

    const el = document.createElement(tag)
    document.body.appendChild(el)

    // New setup introduces a reactive signal.
    const [count, setCount] = signal(0)
    const setup2 = (_ctx: SetupContext) =>
      branch('span', undefined, [leaf([count, setCount] as unknown as Parameters<typeof leaf>[0])])

    _hmrReplace(el, setup2)

    const span = el.shadowRoot?.querySelector('span')
    expect(span?.textContent).toBe('0')

    setCount(42)
    expect(span?.textContent).toBe('42')

    el.remove()
  })

  it('HMR-5: _hmrReplace is a no-op when _setMount has not been called', () => {
    // Temporarily clear mount.
    _setMount(null as unknown as typeof mount)

    const el = document.createElement('div') as HTMLElement
    const setup = (_ctx: SetupContext) => leaf('noop')

    // Should not throw even without mount.
    expect(() => _hmrReplace(el, setup)).not.toThrow()

    // Restore.
    _setMount(mount)
  })
})
