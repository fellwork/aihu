/**
 * Unit tests for the composed-tree substrate (jsdom).
 *
 * Covers the walk semantics the shared substrate promises: shadow roots
 * supersede light children, slotted content is visited in RENDERED order (not
 * source order), `<template>` content is never visited, tabbability crosses
 * nested shadow boundaries, the composed `activeElement` resolver recursively
 * drills through nested shadow roots, composed containment/closest/order-
 * comparison all cross shadow boundaries (single- and multi-hop).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  composedActiveElement,
  composedChildren,
  composedClosest,
  composedCompareOrder,
  composedContains,
  composedParent,
  composedQuerySelector,
  composedQuerySelectorAll,
  isTabbable,
  queryTabbables,
  walkComposedTree,
} from '../src/composed-tree.ts'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('composedChildren / walkComposedTree', () => {
  it('an open shadow root supersedes the host light-DOM children', () => {
    const host = document.createElement('div')
    const lightChild = document.createElement('span')
    lightChild.id = 'light-fallback' // not slotted anywhere — should be invisible
    host.appendChild(lightChild)
    document.body.appendChild(host)

    const shadow = host.attachShadow({ mode: 'open' })
    const shadowChild = document.createElement('p')
    shadowChild.id = 'in-shadow'
    shadow.appendChild(shadowChild)

    const kids = composedChildren(host)
    expect(kids).toEqual([shadowChild])
  })

  it('never descends into <template> content', () => {
    document.body.innerHTML = `
      <div id="root">
        <template><button id="never">nope</button></template>
        <button id="real">yes</button>
      </div>`
    const root = document.getElementById('root') as HTMLElement
    const seen = [...walkComposedTree(root)].map((e) => e.id)
    expect(seen).not.toContain('never')
    expect(seen).toContain('real')
  })

  it('slotted content is visited in RENDERED (slot) order, not source order', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    // Rendered order per the shadow tree: slot "b" then slot "a".
    shadow.innerHTML = '<slot name="b"></slot><slot name="a"></slot>'

    // Source/authoring order is a, then b — the OPPOSITE of rendered order.
    const a = document.createElement('span')
    a.id = 'a'
    a.slot = 'a'
    const b = document.createElement('span')
    b.id = 'b'
    b.slot = 'b'
    host.append(a, b)

    const order = [...walkComposedTree(host)].map((e) => e.id)
    // "b" (rendered first, via the first <slot>) must precede "a".
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'))
  })

  it('a slot with nothing assigned falls back to its own light-DOM (fallback) content', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<slot><button id="fallback-btn">fallback</button></slot>'
    // Nothing assigned to the default slot.
    const ids = [...walkComposedTree(host)].map((e) => e.id)
    expect(ids).toContain('fallback-btn')
  })
})

describe('composedActiveElement — recursive shadowRoot.activeElement drilling', () => {
  it('drills through TWO nested shadow roots to the truly-focused leaf', () => {
    document.body.innerHTML = '<div id="outer-host"></div>'
    const outerHost = document.getElementById('outer-host') as HTMLElement
    const outerShadow = outerHost.attachShadow({ mode: 'open' })
    const innerHost = document.createElement('div')
    outerShadow.appendChild(innerHost)
    const innerShadow = innerHost.attachShadow({ mode: 'open' })
    const btn = document.createElement('button')
    btn.id = 'deeply-nested'
    innerShadow.appendChild(btn)

    btn.focus()
    // document.activeElement (native, single-hop retargeting) only reaches
    // the OUTER host from document's perspective.
    expect(document.activeElement).toBe(outerHost)
    // The composed resolver must recurse all the way to the real leaf.
    expect(composedActiveElement(document)).toBe(btn)
  })

  it('falls back to the root activeElement when nothing is focused inside it', () => {
    document.body.innerHTML = '<button id="plain">plain</button>'
    ;(document.getElementById('plain') as HTMLElement).focus()
    expect(composedActiveElement(document)).toBe(document.getElementById('plain'))
  })
})

describe('composedParent / composedContains — multi-hop shadow-boundary crossing', () => {
  it('composedParent hops ShadowRoot -> host in a single call', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const child = document.createElement('span')
    shadow.appendChild(child)
    // child.parentNode IS the ShadowRoot — composedParent hops straight past
    // it to the host, since a ShadowRoot is never itself a meaningful
    // ancestor to examine (it isn't an Element).
    expect(composedParent(child)).toBe(host)
    expect(composedParent(host)).toBe(document.body)
  })

  it('composedContains crosses TWO nested shadow boundaries', () => {
    document.body.innerHTML = '<div id="container"></div>'
    const container = document.getElementById('container') as HTMLElement
    const outerHost = document.createElement('div')
    container.appendChild(outerHost)
    const outerShadow = outerHost.attachShadow({ mode: 'open' })
    const innerHost = document.createElement('div')
    outerShadow.appendChild(innerHost)
    const innerShadow = innerHost.attachShadow({ mode: 'open' })
    const leaf = document.createElement('button')
    innerShadow.appendChild(leaf)

    // Native Element.contains cannot see through even one shadow boundary.
    expect(container.contains(leaf)).toBe(false)
    // The composed version correctly reports containment through both.
    expect(composedContains(container, leaf)).toBe(true)
    expect(composedContains(container, null)).toBe(false)

    const outsider = document.createElement('button')
    document.body.appendChild(outsider)
    expect(composedContains(container, outsider)).toBe(false)
  })

  it('composedParent hops slotted content to its <slot>, not its light-DOM parentNode', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<slot></slot>'
    const slot = shadow.querySelector('slot') as HTMLSlotElement
    const projected = document.createElement('button')
    host.appendChild(projected) // light-DOM parentNode is `host`, but it renders via `slot`

    expect(composedParent(projected)).toBe(slot)
  })

  it('an UNSLOTTED light-DOM child of a shadow host is NOT reported as contained (agrees with the downward walk)', () => {
    // Regression for the disagreement between directions: `composedChildren`
    // already excludes an unslotted light child (shadow supersedes it
    // entirely — see the very first test in this file), but `composedParent`
    // used to fall through to the ordinary `parentNode` hop and land back on
    // `host`, so `composedContains` reported it as contained anyway even
    // though nothing downward-facing (queryTabbables, composedQuerySelectorAll,
    // walkComposedTree, ...) can ever reach it. Both directions must agree.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const unslotted = document.createElement('span')
    unslotted.id = 'unslotted-light-child'
    host.appendChild(unslotted) // light-DOM child, added before attachShadow

    host.attachShadow({ mode: 'open' }) // no <slot> at all — supersedes light children entirely

    expect(composedChildren(host)).not.toContain(unslotted)
    expect(composedContains(host, unslotted)).toBe(false)
    expect(composedParent(unslotted)).toBeNull()
  })

  it('composedContains finds a slotted descendant of a container that receives content via <slot>', () => {
    // The exact shadow-opt-in consumer scenario: a focus-trap container lives
    // inside a shadow tree and receives its tabbable content via <slot>. The
    // downward walk (queryTabbables) already finds slotted content; the upward
    // walk (composedContains) must agree, or a `!composedContains` guard fires
    // spuriously on every slotted element.
    document.body.innerHTML = '<div id="host"></div>'
    const host = document.getElementById('host') as HTMLElement
    const shadow = host.attachShadow({ mode: 'open' })
    const container = document.createElement('div') // the focus-trap "container"
    shadow.appendChild(container)
    container.innerHTML = '<slot></slot>'

    const btn = document.createElement('button')
    host.appendChild(btn) // slotted into `container`'s <slot>

    expect(composedContains(container, btn)).toBe(true)
  })

  it('composedClosest finds an ancestor across a slot boundary', () => {
    document.body.innerHTML = '<div id="host"></div>'
    const host = document.getElementById('host') as HTMLElement
    const shadow = host.attachShadow({ mode: 'open' })
    const marked = document.createElement('div')
    marked.setAttribute('data-marker', '')
    shadow.appendChild(marked)
    marked.innerHTML = '<slot></slot>'

    const btn = document.createElement('button')
    host.appendChild(btn) // slotted into `marked`'s <slot>

    expect(composedClosest(btn, '[data-marker]')).toBe(marked)
  })
})

describe('composedClosest / composedQuerySelector(All) — shadow-piercing lookups', () => {
  it('composedClosest finds an ancestor <form> across an intervening shadow wrapper', () => {
    document.body.innerHTML = '<form id="f"></form>'
    const form = document.getElementById('f') as HTMLFormElement
    const wrapper = document.createElement('div')
    form.appendChild(wrapper)
    const shadow = wrapper.attachShadow({ mode: 'open' })
    const controlHost = document.createElement('div')
    shadow.appendChild(controlHost)

    // Native closest stops at the shadow root.
    expect(controlHost.closest('form')).toBeNull()
    expect(composedClosest(controlHost, 'form')).toBe(form)
  })

  it('composedQuerySelector(All) finds shadow-wrapped descendants that native querySelector cannot', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const wrapper = document.createElement('div')
    root.appendChild(wrapper)
    const shadow = wrapper.attachShadow({ mode: 'open' })
    const label = document.createElement('label')
    label.setAttribute('data-fc-label', '')
    shadow.appendChild(label)
    const err = document.createElement('span')
    err.setAttribute('data-fc-error', '')
    shadow.appendChild(err)

    expect(root.querySelector('[data-fc-label]')).toBeNull()
    expect(composedQuerySelector(root, '[data-fc-label]')).toBe(label)
    expect(composedQuerySelectorAll(root, '[data-fc-label], [data-fc-error]')).toEqual([label, err])
  })
})

describe('composedCompareOrder', () => {
  it('orders two elements under a shared light-DOM ancestor same as compareDocumentPosition', () => {
    document.body.innerHTML = '<div id="p"><span id="a"></span><span id="b"></span></div>'
    const a = document.getElementById('a') as HTMLElement
    const b = document.getElementById('b') as HTMLElement
    expect(composedCompareOrder(a, b)).toBeLessThan(0)
    expect(composedCompareOrder(b, a)).toBeGreaterThan(0)
    expect(composedCompareOrder(a, a)).toBe(0)
  })

  it('orders two elements that live in DIFFERENT shadow roots under a common ancestor', () => {
    document.body.innerHTML = '<div id="root"></div>'
    const root = document.getElementById('root') as HTMLElement
    const hostA = document.createElement('div')
    const hostB = document.createElement('div')
    root.append(hostA, hostB) // hostA precedes hostB in the composed tree
    const shadowA = hostA.attachShadow({ mode: 'open' })
    const itemA = document.createElement('button')
    shadowA.appendChild(itemA)
    const shadowB = hostB.attachShadow({ mode: 'open' })
    const itemB = document.createElement('button')
    shadowB.appendChild(itemB)

    // Genuinely disconnected per compareDocumentPosition's own spec (each item
    // lives in a different shadow tree) — the composed comparator still
    // orders them correctly via their common ancestor (`root`).
    expect(composedCompareOrder(itemA, itemB)).toBeLessThan(0)
    expect(composedCompareOrder(itemB, itemA)).toBeGreaterThan(0)
  })

  it('returns 0 for genuinely disconnected trees', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    expect(composedCompareOrder(a, b)).toBe(0)
  })

  it('orders two light-DOM siblings slotted under a shadow host (roving-focus/radio-group scenario)', () => {
    // Regression probe: a consumer opts the *group wrapper* into shadow DOM
    // while the items themselves stay in light DOM, projected via a single
    // <slot>. Without the assignedSlot fix, the two items' ancestor chains
    // diverge at the host (one "sees" the shadow tree, one doesn't), so no
    // common ancestor is ever found and the comparator falls back to 0 —
    // silently degrading collection sort to registration order.
    document.body.innerHTML = '<div id="host"></div>'
    const host = document.getElementById('host') as HTMLElement
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<slot></slot>'

    const itemA = document.createElement('button')
    const itemB = document.createElement('button')
    host.append(itemA, itemB) // light-DOM source order: A before B

    expect(composedCompareOrder(itemA, itemB)).toBeLessThan(0)
    expect(composedCompareOrder(itemB, itemA)).toBeGreaterThan(0)
  })
})

describe('isTabbable / queryTabbables', () => {
  it('finds a tabbable button nested inside a shadow root that querySelectorAll cannot reach', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const before = document.createElement('button')
    before.id = 'before'
    container.appendChild(before)
    const wrapper = document.createElement('div')
    container.appendChild(wrapper)
    const shadow = wrapper.attachShadow({ mode: 'open' })
    const nested = document.createElement('button')
    nested.id = 'nested'
    shadow.appendChild(nested)

    expect(container.querySelectorAll('button')).toHaveLength(1) // the bug, for contrast
    const ids = queryTabbables(container).map((el) => el.id)
    expect(ids).toEqual(['before', 'nested'])
  })

  it('excludes negative tabindex, disabled, and inert elements (including inert ancestors)', () => {
    document.body.innerHTML = `
      <div id="root">
        <button id="neg" tabindex="-1">neg</button>
        <button id="dis" disabled>dis</button>
        <div inert><button id="in-inert">in-inert</button></div>
        <button id="ok">ok</button>
      </div>`
    const root = document.getElementById('root') as HTMLElement
    const ids = queryTabbables(root).map((el) => el.id)
    expect(ids).toEqual(['ok'])
  })

  it('isTabbable includeElement bypasses the visibility check but not disabled/inert', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)
    // In jsdom visibility is always true anyway; assert the option is accepted
    // without throwing and doesn't override disabled.
    el.disabled = true
    expect(isTabbable(el, { includeElement: el })).toBe(false)
  })

  it('matches contenteditable="" and contenteditable="plaintext-only", not just contenteditable="true"', () => {
    document.body.innerHTML = `
      <div id="root">
        <div id="empty-value" contenteditable="">empty</div>
        <div id="bare-attr" contenteditable>bare</div>
        <div id="plaintext" contenteditable="plaintext-only">plaintext</div>
        <div id="explicit-true" contenteditable="true">true</div>
        <div id="explicit-false" contenteditable="false">false</div>
        <div id="not-editable">plain</div>
      </div>`
    const root = document.getElementById('root') as HTMLElement
    const ids = queryTabbables(root).map((el) => el.id)
    expect(ids).toEqual(['empty-value', 'bare-attr', 'plaintext', 'explicit-true'])
  })

  it('visits positive-tabindex elements first (ascending, ties by doc order), scoped PER SHADOW ROOT — not globally', () => {
    document.body.innerHTML = `
      <div id="root">
        <button id="c" tabindex="3">c</button>
        <button id="a">a</button>
        <button id="b" tabindex="1">b</button>
      </div>`
    const root = document.getElementById('root') as HTMLElement

    // Same-scope reorder: ascending tabindex first, then naturals in doc order.
    expect(queryTabbables(root).map((el) => el.id)).toEqual(['b', 'c', 'a'])

    // A nested shadow root is its OWN scope: its positive-tabindex elements
    // reorder among themselves but never jump ahead of (or behind) an
    // element that belongs to a DIFFERENT (outer) scope, no matter its
    // tabindex value.
    const wrapper = document.createElement('div')
    wrapper.id = 'wrapper'
    root.appendChild(wrapper)
    const shadow = wrapper.attachShadow({ mode: 'open' })
    const shadowHigh = document.createElement('button')
    shadowHigh.id = 'shadow-high'
    shadowHigh.tabIndex = 20
    const shadowLow = document.createElement('button')
    shadowLow.id = 'shadow-low'
    shadowLow.tabIndex = 1
    shadow.append(shadowHigh, shadowLow) // source order: high then low

    expect(queryTabbables(root).map((el) => el.id)).toEqual([
      'b',
      'c',
      'a',
      'shadow-low',
      'shadow-high',
    ])
  })

  it('a nested scope travels WITH its host when the host is naturally-ordered but a LATER sibling has positive tabindex', () => {
    // Regression for FEL-400: the platform visits [b, a, x] here — `b` first
    // (positive tabindex), then the rest in tree order, with the shadow
    // host's nested content (`x`) spliced in right where the host (`a`'s
    // sibling `host`) sits AFTER reordering, not pinned at the host's
    // original document position. A naive "reorder each scope, then drop
    // entries back into their original per-scope document slots" approach
    // gets this wrong: it would leave `x` sitting at the DFS position the
    // host originally occupied (between `a` and `b`), yielding [b, x, a]
    // instead of the correct [b, a, x].
    document.body.innerHTML = `
      <div id="root">
        <button id="a">a</button>
      </div>`
    const root = document.getElementById('root') as HTMLElement
    const host = document.createElement('div')
    host.id = 'host'
    root.appendChild(host) // host is natural (no tabindex), sits after `a`
    const shadow = host.attachShadow({ mode: 'open' })
    const x = document.createElement('button')
    x.id = 'x'
    shadow.appendChild(x)
    const b = document.createElement('button')
    b.id = 'b'
    b.tabIndex = 1
    root.appendChild(b) // `b` sits after `host` in document order

    expect(queryTabbables(root).map((el) => el.id)).toEqual(['b', 'a', 'x'])
  })

  it('a positive-tabindex shadow HOST is itself ordered by its own tabindex, and its nested scope is spliced in immediately after it', () => {
    // Regression for FEL-400: the platform enters a positive-tabindex host's
    // shadow tree immediately after the host, visiting [host, x, a] — not
    // [host, a, x]. `host` participates in the outer scope's tabindex
    // ordering using its OWN tabindex attribute (it is also itself tabbable
    // here, since `[tabindex]` is a focusable selector), and its nested
    // scope (`x`) must travel with it rather than staying pinned at the
    // host's original DFS position.
    document.body.innerHTML = `<div id="root"></div>`
    const root = document.getElementById('root') as HTMLElement
    const host = document.createElement('div')
    host.id = 'host'
    host.tabIndex = 1
    root.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const x = document.createElement('button')
    x.id = 'x'
    shadow.appendChild(x)
    const a = document.createElement('button')
    a.id = 'a'
    root.appendChild(a) // natural, sits after `host` in document order

    expect(queryTabbables(root).map((el) => el.id)).toEqual(['host', 'x', 'a'])
  })
})
