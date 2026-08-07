/**
 * The server-render lifecycle sink.
 *
 * `onMount` and friends register against `define-component.ts`'s `_cur` owner
 * pointer, set only while `defineComponent` runs a setup. A server render calls
 * the compiled setup DIRECTLY, so `_cur` is null and every registration threw
 * `SCR-R0010 'no owner'` — meaning no component using `onMount` could be
 * prerendered at all. `<search-box>` came out empty on aihu.dev while its
 * `onMount`-free sibling rendered fine.
 *
 * A render that never mounts has nothing to register, so inside the window it
 * is a no-op. Outside it, a null owner is still a genuine authoring error.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  _onAdopt as onAdopt,
  _onAttributeChange as onAttributeChange,
  _onMount as onMount,
} from '../src/define-component.ts'
import { _inSsrLifecycle, _withSsrLifecycle } from '../src/ssr-lifecycle.ts'

describe('outside a server render, a null owner still throws', () => {
  // The half that must not regress: silencing this everywhere would turn a real
  // authoring mistake (calling onMount outside setup in a browser) into a
  // callback that never runs and never says why.
  it('onMount throws', () => {
    expect(() => onMount(() => {})).toThrow(/no owner/)
  })

  it('onAdopt throws', () => {
    expect(() => onAdopt(() => {})).toThrow(/no owner/)
  })

  it('onAttributeChange throws', () => {
    expect(() => onAttributeChange(() => {})).toThrow(/no owner/)
  })
})

describe('inside a server render, registration is a no-op', () => {
  it('onMount does not throw and the callback is never invoked', () => {
    const fn = vi.fn()
    expect(() => _withSsrLifecycle(() => onMount(fn))).not.toThrow()
    // "Mounted" is a client event. The server never mounts, so the callback
    // must be dropped rather than run early.
    expect(fn).not.toHaveBeenCalled()
  })

  it('onAdopt and onAttributeChange are no-ops too', () => {
    expect(() =>
      _withSsrLifecycle(() => {
        onAdopt(() => {})
        onAttributeChange(() => {})
      }),
    ).not.toThrow()
  })

  it('returns the callback value through the window', () => {
    expect(_withSsrLifecycle(() => 'rendered')).toBe('rendered')
  })
})

describe('window bookkeeping', () => {
  it('is closed before and after', () => {
    expect(_inSsrLifecycle()).toBe(false)
    _withSsrLifecycle(() => expect(_inSsrLifecycle()).toBe(true))
    expect(_inSsrLifecycle()).toBe(false)
  })

  it('nests — a child render opens one inside its parent', () => {
    _withSsrLifecycle(() => {
      _withSsrLifecycle(() => {
        expect(_inSsrLifecycle()).toBe(true)
      })
      // Still open: the inner close must not end the parent's window, which is
      // why this is a counter and not a boolean.
      expect(_inSsrLifecycle()).toBe(true)
    })
    expect(_inSsrLifecycle()).toBe(false)
  })

  it('closes even when the render throws', () => {
    expect(() =>
      _withSsrLifecycle(() => {
        throw new Error('child exploded')
      }),
    ).toThrow('child exploded')
    // A leaked window would silence real onMount errors for the rest of the
    // process.
    expect(_inSsrLifecycle()).toBe(false)
  })

  it('keys the counter cross-instance, on the global registry', () => {
    // @aihu/server bundles its own copy of this module, so a module-scoped
    // `let` would have the server incrementing one cell while
    // define-component read another that is always zero. That is not
    // hypothetical: it is what happened, and <toc-rail> kept throwing with the
    // sink correctly wired.
    const KEY = Symbol.for('aihu.ssr.lifecycle.depth')
    const g = globalThis as Record<symbol, unknown>
    _withSsrLifecycle(() => {
      expect(g[KEY]).toBe(1)
    })
    expect(g[KEY]).toBe(0)
  })
})
