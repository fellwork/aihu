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

import { branch, leaf, mount } from '@aihu/arbor'
import { effect, signal } from '@aihu/signals'
import { describe, expect, it, vi } from 'vitest'
import {
  _hmrReplace,
  _setMount,
  defineComponent,
  _onCleanup as onCleanup,
  _onMount as onMount,
} from '../src/define-component.ts'
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

  // ── Effect-scope integration (effect-scope plan §5) ────────────────────────

  it('HMR-6: stops the OLD component scope before replacing (scope-owned effects + onCleanup)', () => {
    const [n, setN] = signal(0)
    let runs = 0
    const oldCleanup = vi.fn()
    const setup1 = (_ctx: SetupContext) => {
      effect(() => {
        n()
        runs++
      })
      onCleanup(oldCleanup)
      return leaf('v1')
    }
    const Cmp = defineComponent(setup1)
    const tag = nextTag()
    defineElement(tag, Cmp)
    const el = document.createElement(tag)
    document.body.appendChild(el)
    expect(runs).toBe(1)

    _hmrReplace(el, (_ctx: SetupContext) => leaf('v2'))

    // Old scope stopped: its onCleanup ran, its effect is disposed.
    expect(oldCleanup).toHaveBeenCalledTimes(1)
    setN(1)
    expect(runs).toBe(1)
    el.remove()
    // No double-dispose: the old scope was already stopped; disconnect must
    // not run its cleanup a second time (idempotent handles + map delete).
    expect(oldCleanup).toHaveBeenCalledTimes(1)
  })

  it('HMR-7: the replacement setup gets a working scope — onCleanup/onMount do not throw and fire on disconnect', () => {
    const setup1 = (_ctx: SetupContext) => leaf('v1')
    const Cmp = defineComponent(setup1)
    const tag = nextTag()
    defineElement(tag, Cmp)
    const el = document.createElement(tag)
    document.body.appendChild(el)

    const order: string[] = []
    const setup2 = (_ctx: SetupContext) => {
      onCleanup(() => order.push('setup-cleanup'))
      onMount(() => {
        order.push('mount')
        return () => order.push('mount-teardown')
      })
      return leaf('v2')
    }
    // Pre-scope this threw SCR-R0011/R0010 (newSetup ran with no owner).
    expect(() => _hmrReplace(el, setup2)).not.toThrow()
    expect(order).toEqual(['mount'])

    el.remove()
    // The replacement's scope is stopped on disconnect — unified LIFO order.
    expect(order).toEqual(['mount', 'mount-teardown', 'setup-cleanup'])
  })

  it('HMR-8 (P2-2): a throwing replacement setup stops the fresh scope — no orphaned effects', () => {
    const Cmp = defineComponent((_ctx: SetupContext) => leaf('v1'))
    const tag = nextTag()
    defineElement(tag, Cmp)
    const el = document.createElement(tag)
    document.body.appendChild(el)

    const [n, setN] = signal(0)
    let runs = 0
    const preThrowCleanup = vi.fn()
    const setup2 = (_ctx: SetupContext) => {
      effect(() => {
        n()
        runs++
      })
      onCleanup(preThrowCleanup)
      throw new Error('hmr boom')
    }
    expect(() => _hmrReplace(el, setup2)).toThrow('hmr boom')

    // The fresh scope was stopped: the pre-throw effect is disposed (no
    // re-runs against the half-initialized component) and the pre-throw
    // onCleanup drained.
    expect(runs).toBe(1)
    expect(preThrowCleanup).toHaveBeenCalledTimes(1)
    setN(1)
    expect(runs).toBe(1)

    // Disconnect after the failed replace is quiet (scope already deleted).
    el.remove()
    expect(preThrowCleanup).toHaveBeenCalledTimes(1)
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
