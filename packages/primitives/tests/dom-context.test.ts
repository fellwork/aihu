/**
 * Unit tests for the self-contained DOM-walk context (Option C).
 *
 * Covers the five walk semantics the spec requires (ancestor walk, multi-root
 * isolation, shadow-boundary crossing, nearest-wins, throw-on-missing) plus the
 * signal-composition case (provide a signal, update it, assert an injecting
 * effect re-ran). jsdom environment (root vitest config).
 */
import { effect, signal } from '@aihu/signals'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDomContext,
  injectContext,
  MissingContextError,
  provideContext,
} from '../src/dom-context.ts'

describe('@aihu/primitives/context — createDomContext DOM-walk', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('ancestor walk: a child finds the nearest providing ancestor', () => {
    const Ctx = createDomContext<string>('value')
    const provider = document.createElement('div')
    const mid = document.createElement('div')
    const child = document.createElement('span')
    provider.appendChild(mid)
    mid.appendChild(child)
    document.body.appendChild(provider)

    provideContext(provider, Ctx, 'hello')
    expect(injectContext(child, Ctx)).toBe('hello')
  })

  it('ancestor walk: does NOT resolve from a sibling or a descendant', () => {
    const Ctx = createDomContext<string>('value')
    const parent = document.createElement('div')
    const siblingProvider = document.createElement('div')
    const child = document.createElement('span')
    parent.appendChild(child)
    parent.appendChild(siblingProvider)
    document.body.appendChild(parent)

    // Provider is a SIBLING of `child`, not an ancestor.
    provideContext(siblingProvider, Ctx, 'sibling-value')
    expect(() => injectContext(child, Ctx)).toThrow(MissingContextError)
  })

  it('multi-root isolation: a child under A never sees provider B', () => {
    const Ctx = createDomContext<string>('value')
    const rootA = document.createElement('div')
    const rootB = document.createElement('div')
    const childA = document.createElement('span')
    rootA.appendChild(childA)
    document.body.append(rootA, rootB)

    provideContext(rootA, Ctx, 'A')
    provideContext(rootB, Ctx, 'B')
    expect(injectContext(childA, Ctx)).toBe('A')
  })

  it('shadow boundary: a child inside a ShadowRoot finds a provider on the host ancestor', () => {
    const Ctx = createDomContext<string>('value')
    const provider = document.createElement('div')
    const hostEl = document.createElement('div')
    provider.appendChild(hostEl)
    document.body.appendChild(provider)

    const shadow = hostEl.attachShadow({ mode: 'open' })
    const inner = document.createElement('span')
    shadow.appendChild(inner)

    provideContext(provider, Ctx, 'crossed')
    // Walk must step ShadowRoot -> host -> provider.
    expect(injectContext(inner, Ctx)).toBe('crossed')
  })

  it('nearest-wins: the closer of two providing ancestors wins', () => {
    const Ctx = createDomContext<string>('value')
    const far = document.createElement('div')
    const near = document.createElement('div')
    const child = document.createElement('span')
    far.appendChild(near)
    near.appendChild(child)
    document.body.appendChild(far)

    provideContext(far, Ctx, 'far')
    provideContext(near, Ctx, 'near')
    expect(injectContext(child, Ctx)).toBe('near')
  })

  it('throw-on-missing: injecting a token with no provider and no default throws by name', () => {
    const Ctx = createDomContext<string>('orphan')
    const child = document.createElement('span')
    document.body.appendChild(child)
    expect(() => injectContext(child, Ctx)).toThrow(MissingContextError)
    expect(() => injectContext(child, Ctx)).toThrow(/orphan/)
  })

  it('falls back to the default value when no provider is found', () => {
    const Ctx = createDomContext<string>('value', 'fallback')
    const child = document.createElement('span')
    document.body.appendChild(child)
    expect(injectContext(child, Ctx)).toBe('fallback')
  })

  it('signal composition: an injecting effect re-runs when the provided signal updates', () => {
    const Ctx = createDomContext<() => number>('count')
    const provider = document.createElement('div')
    const child = document.createElement('span')
    provider.appendChild(child)
    document.body.appendChild(provider)

    const [count, setCount] = signal(0)
    provideContext(provider, Ctx, count)

    const injected = injectContext(child, Ctx)
    const seen: number[] = []
    const dispose = effect(() => {
      seen.push((injected as () => number)())
    })

    expect(seen).toEqual([0])
    setCount(1)
    setCount(2)
    expect(seen).toEqual([0, 1, 2])
    dispose()
  })

  it('provideContext is idempotent per (host, key) — re-providing overwrites', () => {
    const Ctx = createDomContext<string>('value')
    const provider = document.createElement('div')
    const child = document.createElement('span')
    provider.appendChild(child)
    document.body.appendChild(provider)

    provideContext(provider, Ctx, 'first')
    provideContext(provider, Ctx, 'second')
    expect(injectContext(child, Ctx)).toBe('second')
  })
})
