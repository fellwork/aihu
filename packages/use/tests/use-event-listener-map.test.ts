/**
 * Unit tests for `useEventListenerMap` — bind `{event: handler}` pairs to
 * one target with a single combined `stop()`, built entirely on top of
 * `useEventListener` (no forked bind/rebind/cleanup logic of its own).
 * jsdom environment (root vitest config).
 */
import { effectScope, signal } from '@aihu/signals'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEventListenerMap } from '../src/useEventListenerMap/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useEventListenerMap — static target', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('binds every entry in the map and fires each handler independently', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const onClick = vi.fn()
    const onMouseOver = vi.fn()

    useEventListenerMap(el, { click: onClick, mouseover: onMouseOver })

    el.dispatchEvent(new MouseEvent('click'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onMouseOver).not.toHaveBeenCalled()

    el.dispatchEvent(new MouseEvent('mouseover'))
    expect(onMouseOver).toHaveBeenCalledTimes(1)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('a single combined stop() removes every bound entry, idempotently', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const onClick = vi.fn()
    const onMouseOver = vi.fn()

    const stop = useEventListenerMap(el, { click: onClick, mouseover: onMouseOver })
    el.dispatchEvent(new MouseEvent('click'))
    el.dispatchEvent(new MouseEvent('mouseover'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onMouseOver).toHaveBeenCalledTimes(1)

    stop()
    el.dispatchEvent(new MouseEvent('click'))
    el.dispatchEvent(new MouseEvent('mouseover'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onMouseOver).toHaveBeenCalledTimes(1)

    expect(() => stop()).not.toThrow()
  })

  it('skips undefined entries in the map (partial map literal)', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const onClick = vi.fn()

    expect(() => useEventListenerMap(el, { click: onClick, mouseover: undefined })).not.toThrow()
    el.dispatchEvent(new MouseEvent('click'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('passes addEventListener options through to every entry (once)', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const onClick = vi.fn()
    const onMouseOver = vi.fn()

    useEventListenerMap(el, { click: onClick, mouseover: onMouseOver }, { once: true })
    el.dispatchEvent(new MouseEvent('click'))
    el.dispatchEvent(new MouseEvent('click'))
    el.dispatchEvent(new MouseEvent('mouseover'))
    el.dispatchEvent(new MouseEvent('mouseover'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onMouseOver).toHaveBeenCalledTimes(1)
  })

  it('works with window as the target', () => {
    const onResize = vi.fn()
    const onScroll = vi.fn()
    const stop = useEventListenerMap(window, { resize: onResize, scroll: onScroll })

    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))
    expect(onResize).toHaveBeenCalledTimes(1)
    expect(onScroll).toHaveBeenCalledTimes(1)

    stop()
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))
    expect(onResize).toHaveBeenCalledTimes(1)
    expect(onScroll).toHaveBeenCalledTimes(1)
  })
})

describe('@aihu/use/useEventListenerMap — reactive (getter) target', () => {
  it('rebinds every entry when the target signal changes: old target stops receiving, new target receives', () => {
    const elA = document.createElement('div')
    const elB = document.createElement('div')
    document.body.append(elA, elB)
    const onClick = vi.fn()
    const onMouseOver = vi.fn()
    const [target, setTarget] = signal<Element | null>(elA)

    const stop = useEventListenerMap(() => target(), { click: onClick, mouseover: onMouseOver })

    elA.dispatchEvent(new MouseEvent('click'))
    elA.dispatchEvent(new MouseEvent('mouseover'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onMouseOver).toHaveBeenCalledTimes(1)

    // Flip the target: elA must stop receiving (old listeners removed for
    // EVERY entry in the map), elB must start receiving (new listeners
    // added for every entry).
    setTarget(elB)
    elA.dispatchEvent(new MouseEvent('click'))
    elA.dispatchEvent(new MouseEvent('mouseover'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onMouseOver).toHaveBeenCalledTimes(1)

    elB.dispatchEvent(new MouseEvent('click'))
    elB.dispatchEvent(new MouseEvent('mouseover'))
    expect(onClick).toHaveBeenCalledTimes(2)
    expect(onMouseOver).toHaveBeenCalledTimes(2)

    stop()
    elB.dispatchEvent(new MouseEvent('click'))
    elB.dispatchEvent(new MouseEvent('mouseover'))
    expect(onClick).toHaveBeenCalledTimes(2)
    expect(onMouseOver).toHaveBeenCalledTimes(2)
  })

  it('a null-resolving getter registers nothing, then binds every entry once it yields an element', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const onClick = vi.fn()
    const [target, setTarget] = signal<Element | null>(null)

    const stop = useEventListenerMap(() => target(), { click: onClick })
    el.dispatchEvent(new MouseEvent('click'))
    expect(onClick).not.toHaveBeenCalled()

    setTarget(el)
    el.dispatchEvent(new MouseEvent('click'))
    expect(onClick).toHaveBeenCalledTimes(1)
    stop()
  })
})

describe('@aihu/use/useEventListenerMap — scope auto-cleanup', () => {
  it('scope.stop() removes every entry bound to a static target', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const onClick = vi.fn()
    const onMouseOver = vi.fn()

    const scope = effectScope()
    scope.run(() => useEventListenerMap(el, { click: onClick, mouseover: onMouseOver }))
    el.dispatchEvent(new MouseEvent('click'))
    expect(onClick).toHaveBeenCalledTimes(1)

    scope.stop()
    el.dispatchEvent(new MouseEvent('click'))
    el.dispatchEvent(new MouseEvent('mouseover'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onMouseOver).not.toHaveBeenCalled()
  })

  it('scope.stop() removes every entry bound to a reactive target, and its rebinding effects', () => {
    const elA = document.createElement('div')
    const elB = document.createElement('div')
    document.body.append(elA, elB)
    const onClick = vi.fn()
    const [target, setTarget] = signal<Element | null>(elA)

    const scope = effectScope()
    scope.run(() => useEventListenerMap(() => target(), { click: onClick }))
    elA.dispatchEvent(new MouseEvent('click'))
    expect(onClick).toHaveBeenCalledTimes(1)

    scope.stop()
    elA.dispatchEvent(new MouseEvent('click'))
    expect(onClick).toHaveBeenCalledTimes(1)
    setTarget(elB)
    elB.dispatchEvent(new MouseEvent('click'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('@aihu/use/useEventListenerMap — SSR no-op invariant', () => {
  it('static target: returns a no-op stop, registers nothing', () => {
    const el = document.createElement('div')
    const onClick = vi.fn()
    const stop = useEventListenerMap(el, { click: onClick })
    expect(() => stop()).not.toThrow()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('with isClient false, registers nothing for any map entry and stop() is a no-op', () =>
    withSSR(
      () => import('../src/useEventListenerMap/index.ts'),
      (mod) => {
        const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
        const el = target as unknown as Element

        let stop: (() => void) | undefined
        expect(() => {
          stop = mod.useEventListenerMap(el, { click: () => {}, mouseover: () => {} })
        }).not.toThrow()
        expect(target.addEventListener).not.toHaveBeenCalled()
        expect(() => stop?.()).not.toThrow()

        // Getter targets too.
        expect(() => mod.useEventListenerMap(() => el, { click: () => {} })).not.toThrow()
        expect(target.addEventListener).not.toHaveBeenCalled()
      },
    ))
})
