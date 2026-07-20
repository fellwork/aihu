/**
 * Hydration integration tests — T-H1, T-H2, T-H3.
 *
 * Verifies that defineComponent classes expose `_build()` and that
 * defineElement's hydration branch is activated when both `hydrate: true`
 * is set and `window.__aihu_state__[name]` is present.
 *
 * Isolation strategy: spy on _setHydrate to intercept the hydrateFn slot,
 * and spy on _setMount to intercept the mountFn slot. This lets us verify
 * which path connectedCallback takes without depending on the real arbor
 * hydrate/mount implementations.
 */

import { branch, leaf, mount } from '@aihu/arbor'
import { signal } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _setMount, _setSignal, defineComponent } from '../src/define-component.ts'
import { _setHydrate, defineElement } from '../src/define-element.ts'
import type { SetupContext } from '../src/types.ts'

// ── Unique tag counter to avoid SCR-R0001 conflicts between tests ────────────
let tagCounter = 0
function nextTag(): string {
  return `x-hi${++tagCounter}`
}

// ── Wire real mount/signal so _build() tests work correctly ──────────────────
_setMount(mount)
_setSignal(signal as Parameters<typeof _setSignal>[0])

describe('Hydration integration — _build() and hydration path', () => {
  // Restore __aihu_state__ after each test to avoid cross-test contamination.
  let originalState: unknown
  beforeEach(() => {
    originalState = (globalThis as Record<string, unknown>).__aihu_state__
  })
  afterEach(() => {
    ;(globalThis as Record<string, unknown>).__aihu_state__ = originalState
  })

  // ── T-H3: _build() returns the correct node tree ──────────────────────────
  // Strategy: wire a spy as _setMount that captures the tree passed to it,
  // then verify via connectedCallback that _build() ran and returned the same
  // tree (which connectedCallback immediately passes to _mount).
  describe('T-H3: _build() on function-form defineComponent', () => {
    it('_build() is present on the class prototype', () => {
      const Cmp = defineComponent((_ctx: SetupContext) => leaf('check'))
      expect(typeof (Cmp.prototype as { _build?: unknown })._build).toBe('function')
    })

    it('connectedCallback delegates to _build() — captured tree matches setup output', () => {
      const expectedTree = leaf('hello hydration')
      let capturedTree: unknown = null

      const realMount = mount
      _setMount((tree, host) => {
        capturedTree = tree
        return realMount(tree, host)
      })

      const tag = nextTag()
      const Cmp = defineComponent((_ctx: SetupContext) => expectedTree)
      defineElement(tag, Cmp)

      const el = document.createElement(tag)
      document.body.appendChild(el)

      expect(capturedTree).toBe(expectedTree)
      el.remove()
      _setMount(mount)
    })

    it('_build() on options-form is present on the class prototype', () => {
      _setSignal(signal as Parameters<typeof _setSignal>[0])
      const Cmp = defineComponent({
        attrs: [] as const,
        setup: (_ctx) => leaf('opts'),
      })
      expect(typeof (Cmp.prototype as { _build?: unknown })._build).toBe('function')
    })

    it('options-form _build() output is passed to _mount via connectedCallback', () => {
      _setSignal(signal as Parameters<typeof _setSignal>[0])
      const expectedTree = leaf('opts hydration')
      let capturedTree: unknown = null

      const realMount = mount
      _setMount((tree, host) => {
        capturedTree = tree
        return realMount(tree, host)
      })

      const tag = nextTag()
      const Cmp = defineComponent({
        attrs: [] as const,
        setup: (_ctx) => expectedTree,
      })
      defineElement(tag, Cmp)

      const el = document.createElement(tag)
      document.body.appendChild(el)

      expect(capturedTree).toBe(expectedTree)
      el.remove()
      _setMount(mount)
    })
  })

  // ── T-H1: hydration path is taken when snapshot exists ───────────────────
  it('T-H1: connectedCallback calls hydrateFn (not mountFn) when snapshot is present', () => {
    const hydrateSpy = vi.fn().mockReturnValue({ dispose: vi.fn(), agent: {}, serialize: vi.fn() })
    const mountSpy = vi.fn().mockReturnValue({ dispose: vi.fn(), agent: {}, serialize: vi.fn() })

    // Wire spies
    _setHydrate(hydrateSpy as Parameters<typeof _setHydrate>[0])
    _setMount(mountSpy as Parameters<typeof _setMount>[0])

    const tag = nextTag()
    const Cmp = defineComponent((_ctx: SetupContext) => leaf('hydrate-me'))
    defineElement(tag, Cmp, { hydrate: true })

    // Set up the snapshot
    ;(globalThis as Record<string, unknown>).__aihu_state__ = {
      [tag]: { '0.text': 'hydrate-me' },
    }

    const el = document.createElement(tag)
    document.body.appendChild(el)

    expect(hydrateSpy).toHaveBeenCalledTimes(1)
    expect(mountSpy).not.toHaveBeenCalled()

    el.remove()

    // Restore real mount for subsequent tests
    _setMount(mount)
    _setHydrate(null as unknown as Parameters<typeof _setHydrate>[0])
  })

  // ── T-H2: fallthrough to normal mount when no snapshot exists ─────────────
  it('T-H2: connectedCallback falls through to _mount when no snapshot is present', () => {
    const hydrateSpy = vi.fn().mockReturnValue({ dispose: vi.fn(), agent: {}, serialize: vi.fn() })
    const mountSpy = vi.fn().mockReturnValue({ dispose: vi.fn(), agent: {}, serialize: vi.fn() })

    _setHydrate(hydrateSpy as Parameters<typeof _setHydrate>[0])
    _setMount(mountSpy as Parameters<typeof _setMount>[0])

    const tag = nextTag()
    const Cmp = defineComponent((_ctx: SetupContext) => leaf('no-snapshot'))
    defineElement(tag, Cmp, { hydrate: true })

    // No snapshot: __aihu_state__ is absent or lacks this component's key.
    ;(globalThis as Record<string, unknown>).__aihu_state__ = {}

    const el = document.createElement(tag)
    document.body.appendChild(el)

    // Hydrate path should NOT have been taken.
    expect(hydrateSpy).not.toHaveBeenCalled()
    // Normal mount should have been called.
    expect(mountSpy).toHaveBeenCalledTimes(1)

    el.remove()

    // Restore
    _setMount(mount)
    _setHydrate(null as unknown as Parameters<typeof _setHydrate>[0])
  })

  // ── T-H2b: hydrate: false means hydration path is never checked ───────────
  it('T-H2b: hydrate: false skips hydration even when snapshot is present', () => {
    const hydrateSpy = vi.fn().mockReturnValue({ dispose: vi.fn(), agent: {}, serialize: vi.fn() })
    const mountSpy = vi.fn().mockReturnValue({ dispose: vi.fn(), agent: {}, serialize: vi.fn() })

    _setHydrate(hydrateSpy as Parameters<typeof _setHydrate>[0])
    _setMount(mountSpy as Parameters<typeof _setMount>[0])

    const tag = nextTag()
    const Cmp = defineComponent((_ctx: SetupContext) => leaf('no-hydrate'))
    // Note: no hydrate: true option
    defineElement(tag, Cmp)

    ;(globalThis as Record<string, unknown>).__aihu_state__ = {
      [tag]: { '0.text': 'no-hydrate' },
    }

    const el = document.createElement(tag)
    document.body.appendChild(el)

    expect(hydrateSpy).not.toHaveBeenCalled()
    expect(mountSpy).toHaveBeenCalledTimes(1)

    el.remove()

    // Restore
    _setMount(mount)
    _setHydrate(null as unknown as Parameters<typeof _setHydrate>[0])
  })

  // ── connectedCallback still works normally after _build() refactor ─────────
  it('normal mount path still produces reactive DOM after the _build() refactor', () => {
    _setMount(mount)
    const tag = nextTag()
    const [sig, setSig] = signal('initial')
    const Cmp = defineComponent(() => branch('p', undefined, [leaf([sig, setSig])]))
    defineElement(tag, Cmp)

    const el = document.createElement(tag)
    document.body.appendChild(el)

    const p = el.shadowRoot?.querySelector('p') as HTMLElement
    expect(p?.textContent).toBe('initial')

    setSig('updated')
    expect(p?.textContent).toBe('updated')

    el.remove()
  })
})
