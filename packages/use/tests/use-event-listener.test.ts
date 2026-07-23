/**
 * Unit tests for `useEventListener` — the foundational `@aihu/use`
 * composable (effect-scope plan §5): add+fire, manual stop, reactive-target
 * rebinding driven by a signal, scope auto-cleanup, and the SSR no-op
 * invariant (target-null and simulated `!isClient` via module
 * re-evaluation). jsdom environment (root vitest config).
 */
import { effectScope, signal } from '@aihu/signals'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEventListener } from '../src/useEventListener/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useEventListener — static target', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('adds the listener and fires the handler', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)
    const handler = vi.fn()

    useEventListener(el, 'click', handler)
    el.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)
    el.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('manual stop() removes the listener, idempotently', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)
    const handler = vi.fn()

    const stop = useEventListener(el, 'click', handler)
    el.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)

    stop()
    el.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)

    // Idempotent: a second stop() (e.g. scope teardown after a manual stop)
    // is a no-op, not a throw.
    expect(() => stop()).not.toThrow()
  })

  it('works with window as the target', () => {
    const handler = vi.fn()
    const stop = useEventListener(window, 'resize', handler)
    window.dispatchEvent(new Event('resize'))
    expect(handler).toHaveBeenCalledTimes(1)
    stop()
    window.dispatchEvent(new Event('resize'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('passes addEventListener options through (once)', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const handler = vi.fn()
    useEventListener(el, 'click', handler, { once: true })
    el.dispatchEvent(new MouseEvent('click'))
    el.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('boolean capture option: add/remove symmetry (stop removes a capture listener)', () => {
    const parent = document.createElement('div')
    const child = document.createElement('button')
    parent.appendChild(child)
    document.body.appendChild(parent)
    const handler = vi.fn()

    // `true` (capture) as the bare-boolean options form: the listener fires
    // in the capture phase for events dispatched on the child…
    const stop = useEventListener(parent, 'click', handler, true)
    child.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)

    // …and stop() must remove it with the SAME capture flag —
    // removeEventListener only matches when the capture bit agrees.
    stop()
    child.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('object capture option: add/remove symmetry ({ capture: true })', () => {
    const parent = document.createElement('div')
    const child = document.createElement('button')
    parent.appendChild(child)
    document.body.appendChild(parent)
    const handler = vi.fn()

    const stop = useEventListener(parent, 'click', handler, { capture: true })
    child.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)
    stop()
    child.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('@aihu/use/useEventListener — reactive (getter) target', () => {
  it('rebinds when the target signal changes: old listener removed, new added', () => {
    const elA = document.createElement('div')
    const elB = document.createElement('div')
    document.body.append(elA, elB)
    const handler = vi.fn()
    const [target, setTarget] = signal<Element | null>(elA)

    const stop = useEventListener(() => target(), 'click', handler)

    elA.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)

    // Flip the target: the per-run cleanup removes the listener from elA,
    // the re-run adds it to elB.
    setTarget(elB)
    elA.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)
    elB.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(2)

    stop()
    elB.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('a null-resolving getter registers nothing, then binds when it yields an element', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const handler = vi.fn()
    const [target, setTarget] = signal<Element | null>(null)

    const stop = useEventListener(() => target(), 'click', handler)
    el.dispatchEvent(new MouseEvent('click'))
    expect(handler).not.toHaveBeenCalled()

    // The $ref pattern: null flips to the element after mount.
    setTarget(el)
    el.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)
    stop()
  })

  it('manual stop() disposes the rebinding effect (no rebinding after stop)', () => {
    const elA = document.createElement('div')
    const elB = document.createElement('div')
    document.body.append(elA, elB)
    const handler = vi.fn()
    const [target, setTarget] = signal<Element | null>(elA)

    const stop = useEventListener(() => target(), 'click', handler)
    stop()

    // A target change after stop must not resurrect the listener.
    setTarget(elB)
    elA.dispatchEvent(new MouseEvent('click'))
    elB.dispatchEvent(new MouseEvent('click'))
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('@aihu/use/useEventListener — scope auto-cleanup', () => {
  it('scope.stop() removes a static-target listener', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const handler = vi.fn()

    const scope = effectScope()
    scope.run(() => useEventListener(el, 'click', handler))
    el.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)

    scope.stop()
    el.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('scope.stop() removes a reactive-target listener and its effect', () => {
    const elA = document.createElement('div')
    const elB = document.createElement('div')
    document.body.append(elA, elB)
    const handler = vi.fn()
    const [target, setTarget] = signal<Element | null>(elA)

    const scope = effectScope()
    scope.run(() => useEventListener(() => target(), 'click', handler))
    elA.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)

    scope.stop()
    elA.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)
    setTarget(elB)
    elB.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('manual stop() before scope.stop() is safe (idempotent under LIFO drain)', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const handler = vi.fn()

    const scope = effectScope()
    let stop: (() => void) | undefined
    scope.run(() => {
      stop = useEventListener(el, 'click', handler)
    })
    stop?.()
    expect(() => scope.stop()).not.toThrow()
    el.dispatchEvent(new MouseEvent('click'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('reactive target: manual stop() THEN scope.stop() (effect-dispose + swap-remove path)', () => {
    // The intricate path: manual stop() disposes the rebinding effect,
    // whose handle swap-removes itself from the scope's disposer list
    // (_scopeRemove); the later scope.stop() LIFO drain then hits only the
    // already-idempotent stop entry. Nothing double-fires, nothing throws,
    // nothing resurrects.
    const elA = document.createElement('div')
    const elB = document.createElement('div')
    document.body.append(elA, elB)
    const handler = vi.fn()
    const [target, setTarget] = signal<Element | null>(elA)

    const scope = effectScope()
    let stop: (() => void) | undefined
    scope.run(() => {
      stop = useEventListener(() => target(), 'click', handler)
    })
    elA.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)

    stop?.()
    elA.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)

    expect(() => scope.stop()).not.toThrow()
    setTarget(elB)
    elA.dispatchEvent(new MouseEvent('click'))
    elB.dispatchEvent(new MouseEvent('click'))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('@aihu/use/useEventListener — SSR no-op invariant', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts (one
  // table row per composable entry); these cover the composable-local
  // contract.

  it('static target null/undefined: returns a no-op stop, registers nothing', () => {
    const handler = vi.fn()
    const stopNull = useEventListener(null, 'click', handler)
    const stopUndef = useEventListener(undefined, 'click', handler)
    expect(() => {
      stopNull()
      stopUndef()
    }).not.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })

  it('with isClient false, registers nothing and stop() is a no-op', () =>
    withSSR(
      () => import('../src/useEventListener/index.ts'),
      (mod) => {
        const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
        const el = target as unknown as Element

        let stop: (() => void) | undefined
        expect(() => {
          stop = mod.useEventListener(el, 'click', () => {})
        }).not.toThrow()
        expect(target.addEventListener).not.toHaveBeenCalled()
        expect(() => stop?.()).not.toThrow()

        // Getter targets too: no effect is created server-side (the isClient
        // gate precedes the typeof-function branch).
        expect(() =>
          mod.useEventListener(
            () => el,
            'click',
            () => {},
          ),
        ).not.toThrow()
        expect(target.addEventListener).not.toHaveBeenCalled()
      },
    ))
})
