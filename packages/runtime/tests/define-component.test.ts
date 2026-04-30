/**
 * Unit tests for `defineComponent` per
 * `.team/phase-4/spec-runtime.md` §1.5 + Phase 4 builder brief.
 *
 * `defineComponent` returns a class consumable by `defineElement`.
 * Internally it calls `setup(ctx)` in `connectedCallback`, mounts the
 * resulting tree via the injected `mount` function, and disposes the
 * resulting `MountScope` in `disconnectedCallback`.
 *
 * Spec §2.4: runtime has no source-level *value* imports from
 * `@scribe/arbor`. Tests inject `mount` via `_setMount(mount)` (the
 * same hook real apps use at boot).
 */

import { branch, leaf, mount } from '@scribe/arbor'
import { signal } from '@scribe/signals'
import { describe, expect, it, vi } from 'vitest'
import { _setMount, defineComponent } from '../src/define-component.ts'
import { defineElement } from '../src/define-element.ts'
import type { SetupContext } from '../src/types.ts'

// Wire mount once for all tests in this file.
_setMount(mount)

describe('defineComponent — Task 21b spec tests', () => {
  it('returned class registers via defineElement without error (#1)', () => {
    const Cmp = defineComponent(({ host: _host }) => leaf('hi'))
    expect(() => defineElement('x-c1', Cmp)).not.toThrow()
    expect(customElements.get('x-c1')).toBeDefined()
  })

  it('setup(ctx) runs once in connectedCallback (#2)', () => {
    let captured: SetupContext | null = null
    const setup = vi.fn((ctx: SetupContext) => {
      captured = ctx
      return leaf('hello')
    })
    const Cmp = defineComponent(setup)
    defineElement('x-c2', Cmp)
    expect(setup).not.toHaveBeenCalled()
    const el = document.createElement('x-c2')
    document.body.appendChild(el)
    expect(setup).toHaveBeenCalledTimes(1)
    expect(captured).not.toBeNull()
    expect((captured as SetupContext | null)?.element).toBe(el)
    expect((captured as SetupContext | null)?.host).toBe(el.shadowRoot)
    el.remove()
  })

  it('effects created during setup are auto-disposed when element is removed (#3)', () => {
    const sig = signal('a')
    const setText = sig[1]
    const Cmp = defineComponent(() => branch('p', undefined, [leaf(sig)]))
    defineElement('x-c3', Cmp)
    const el = document.createElement('x-c3')
    document.body.appendChild(el)
    const p = el.shadowRoot!.querySelector('p') as HTMLElement
    expect(p.textContent).toBe('a')
    setText('b')
    expect(p.textContent).toBe('b')
    // Capture text node reference to assert it does not update post-remove.
    const captured = p
    el.remove()
    setText('c')
    // After dispose, the effect that wrote text is torn down — captured
    // node's textContent stays at 'b'.
    expect(captured.textContent).toBe('b')
  })

  it('disconnectedCallback calls scope.dispose() (#4)', () => {
    const disposeSpy = vi.fn()
    // Inject a fake mount that records dispose.
    const realMount = mount
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
    const Cmp = defineComponent(() => leaf('x'))
    defineElement('x-c4', Cmp)
    const el = document.createElement('x-c4')
    document.body.appendChild(el)
    expect(disposeSpy).not.toHaveBeenCalled()
    el.remove()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
    // Restore real mount for any subsequent file/test.
    _setMount(realMount)
  })
})
