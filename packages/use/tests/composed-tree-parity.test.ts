/**
 * Drift guard between the two composed-tree implementations.
 *
 * `@aihu/use` CORE is dependency-free (signals-only, founder ruling A,
 * mechanically enforced by `scripts/dep-check.ts`'s `allowedExternals()`), so
 * it CANNOT import `@aihu/primitives/composed-tree.ts` — the canonical home of
 * these semantics. The two copies are therefore deliberate, and safe to
 * duplicate precisely because neither holds module-level mutable state (every
 * export is a pure function of its arguments).
 *
 * What is NOT safe is the two drifting apart. This file runs ONE behavioural
 * table against BOTH, so a semantic divergence is a red test rather than a
 * silent one. See `docs/plans/2026-07-24-composed-tree-helper.md` §4.
 *
 * The primitives module is reached by relative path because it is internal to
 * that package (deliberately not re-exported from its `index.ts`), and it is a
 * TEST-only import: `dep-check.ts` reads `dependencies`/`peerDependencies`/
 * `optionalDependencies` and never test files, so this ships no bytes and does
 * not widen `@aihu/use`'s dependency contract.
 */
import { afterEach, describe, expect, it } from 'vitest'
import * as primitives from '../../primitives/src/composed-tree.ts'
import * as use from '../src/shared/composed-tree.ts'

const IMPLS = [
  ['@aihu/use', use],
  ['@aihu/primitives', primitives],
] as const

afterEach(() => {
  document.body.innerHTML = ''
})

/** `composedPath()` is only populated during dispatch, so the substrate must
 * be read inside the listener — see the module docs on both copies. */
function duringClick<T>(from: Element, read: (event: Event) => T): T {
  let out: T | undefined
  let ran = false
  const onClick = (e: Event) => {
    out = read(e)
    ran = true
  }
  document.addEventListener('click', onClick)
  try {
    from.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
  } finally {
    document.removeEventListener('click', onClick)
  }
  if (!ran) throw new Error('event never reached the document listener')
  return out as T
}

describe.each(IMPLS)('composed-tree parity — %s', (_name, impl) => {
  it('isEventInside: open shadow root, nested root, slotted content, outside', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    const panel = document.createElement('div')
    const slot = document.createElement('slot')
    panel.appendChild(slot)
    root.appendChild(panel)
    const innerHost = document.createElement('div')
    panel.appendChild(innerHost)
    const innerRoot = innerHost.attachShadow({ mode: 'open' })
    const deep = document.createElement('button')
    innerRoot.appendChild(deep)
    const slotted = document.createElement('span')
    host.appendChild(slotted)
    const outside = document.createElement('div')
    document.body.appendChild(outside)

    expect(
      duringClick(deep, (e) => [
        impl.isEventInside(e, panel),
        impl.isEventInside(e, innerHost),
        impl.isEventInside(e, outside),
        impl.isEventInside(e, null),
      ]),
    ).toEqual([true, true, false, false])

    expect(
      duringClick(slotted, (e) => [impl.isEventInside(e, panel), impl.isEventInside(e, slotted)]),
    ).toEqual([true, true])

    expect(duringClick(outside, (e) => impl.isEventInside(e, panel))).toBe(false)
  })

  it('isEventInside: closed-root fallback and its bounds', () => {
    const make = () => {
      const host = document.createElement('div')
      document.body.appendChild(host)
      const inner = document.createElement('button')
      host.attachShadow({ mode: 'closed' }).appendChild(inner)
      return { host, inner }
    }
    const a = make()
    const b = make()
    expect(duringClick(a.inner, (e) => impl.isEventInside(e, a.inner))).toBe(true)
    expect(duringClick(a.inner, (e) => impl.isEventInside(e, b.inner))).toBe(false)
  })

  it('isEventInsideAny: skips nullish, matches any', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const btn = document.createElement('button')
    host.attachShadow({ mode: 'open' }).appendChild(btn)
    const other = document.createElement('div')
    document.body.appendChild(other)

    expect(
      duringClick(btn, (e) => [
        impl.isEventInsideAny(e, [null, undefined, btn]),
        impl.isEventInsideAny(e, [null, other]),
      ]),
    ).toEqual([true, false])
  })

  it('composedEventTarget: the pre-retargeting origin, with a target fallback', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const btn = document.createElement('button')
    host.attachShadow({ mode: 'open' }).appendChild(btn)

    expect(duringClick(btn, (e) => impl.composedEventTarget(e))).toBe(btn)
    const el = document.createElement('div')
    expect(impl.composedEventTarget({ target: el } as unknown as Event)).toBe(el)
    expect(impl.composedPathOf({ target: el } as unknown as Event)).toEqual([])
  })

  it('composedActiveElement: drills nested open roots, stops at closed', () => {
    const outerHost = document.createElement('div')
    document.body.appendChild(outerHost)
    const outerRoot = outerHost.attachShadow({ mode: 'open' })
    const innerHost = document.createElement('div')
    outerRoot.appendChild(innerHost)
    const innerRoot = innerHost.attachShadow({ mode: 'open' })
    const btn = document.createElement('button')
    innerRoot.appendChild(btn)
    btn.focus()
    expect(impl.composedActiveElement()).toBe(btn)
    expect(impl.composedActiveElement(innerRoot)).toBe(btn)

    const closedHost = document.createElement('div')
    document.body.appendChild(closedHost)
    const hidden = document.createElement('button')
    closedHost.attachShadow({ mode: 'closed' }).appendChild(hidden)
    hidden.focus()
    expect(impl.composedActiveElement()).toBe(closedHost)
  })

  it('composedParent / composedContains: slot hop, host hop, unslotted orphan', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    const wrapper = document.createElement('div')
    const slot = document.createElement('slot')
    wrapper.appendChild(slot)
    root.appendChild(wrapper)
    const slotted = document.createElement('span')
    host.appendChild(slotted)

    expect(impl.composedParent(slotted)).toBe(slot)
    expect(impl.composedParent(wrapper)).toBe(host)
    expect(impl.composedContains(wrapper, slotted)).toBe(true)
    expect(impl.composedContains(host, wrapper)).toBe(true)
    expect(impl.composedContains(document.body, slotted)).toBe(true)

    const orphanHost = document.createElement('div')
    const orphan = document.createElement('span')
    orphanHost.appendChild(orphan)
    document.body.appendChild(orphanHost)
    orphanHost.attachShadow({ mode: 'open' })
    expect(impl.composedParent(orphan)).toBe(null)
    expect(impl.composedContains(orphanHost, orphan)).toBe(false)
  })

  it('the KEY divergence both copies must agree on: an up-walk cannot fix retargeting', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const panel = document.createElement('div')
    const btn = document.createElement('button')
    panel.appendChild(btn)
    host.attachShadow({ mode: 'open' }).appendChild(panel)

    const seen = duringClick(btn, (e) => ({
      target: e.target,
      upWalk: impl.composedContains(panel, e.target as Node),
      composed: impl.isEventInside(e, panel),
    }))
    expect(seen.target).toBe(host)
    expect(seen.upWalk).toBe(false)
    expect(seen.composed).toBe(true)
  })
})
