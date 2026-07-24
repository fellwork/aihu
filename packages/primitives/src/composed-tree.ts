/**
 * `@aihu/primitives` composed-tree substrate — the shared, dependency-free
 * DOM-walk internals every primitive needs to be shadow-DOM-correct. aihu is
 * moving to a light-DOM default with shadow DOM opt-in *per consumer*, so any
 * primitive that assumes a single tree (via `querySelector`, `closest`,
 * `Element.contains`, `document.activeElement`, or `compareDocumentPosition`)
 * silently breaks the moment a consumer opts a nested piece into shadow DOM.
 *
 * This module is the ONE place that walk lives. Every primitive that needs to
 * find, order, or contain elements across a shadow boundary should build on
 * these functions rather than re-deriving the walk locally (see `label/`'s
 * pre-existing hand-rolled ancestor loop for what NOT to do — `dom-context.ts`
 * and this module are the two reference-correct walks in the codebase).
 *
 * Composed-tree rules implemented here:
 * - An element with an OPEN shadow root is walked via its shadow tree, not
 *   its light-DOM children — the light DOM only reappears where a `<slot>`
 *   inside that shadow tree projects it (in RENDERED order, not source
 *   order — `assignedElements({ flatten: true })`).
 * - `<template>` content is never part of the render tree and is never
 *   descended into or matched.
 * - `ShadowRoot -> .host` is the up-hop at a shadow boundary (mirrors
 *   `dom-context.ts`'s `injectContext` and `define-component.ts`'s
 *   `_enterOwnerContext`).
 *
 * Known, unavoidable limitation: a CLOSED shadow root cannot be detected or
 * descended into via public DOM APIs — `element.shadowRoot` is `null` for
 * both "no shadow root" and "closed shadow root", so a closed-mode host is
 * walked as an ordinary element (its real internal focusables stay invisible
 * to this walk; its light-DOM children are treated as visible even though
 * whether they're actually slotted anywhere inside the closed tree is
 * unknowable). Consumers that need composed-tree correctness should use
 * `mode: 'open'` shadow roots.
 *
 * Kept internal for now (not re-exported from `index.ts`) — the tabbable
 * pieces (`isTabbable`/`queryTabbables`) are the shape a future public
 * `InteractivityChecker` would build on, but the public surface stays minimal
 * until that primitive actually ships.
 */

/** Any node that behaves like a composed-tree "container" we can enumerate children of. */
type ComposedRoot = Node

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

function childElements(node: Node): Element[] {
  const out: Element[] = []
  for (const child of Array.from(node.childNodes)) {
    if (isElement(child)) out.push(child)
  }
  return out
}

/**
 * The composed-tree children of `node`: an open shadow root's tree supersedes
 * light-DOM children entirely; a `<slot>` resolves to its assigned elements in
 * rendered order (falling back to its own light-DOM "fallback content" when
 * nothing is assigned); a `<template>` has none. Everything else (Element,
 * ShadowRoot, Document, DocumentFragment) yields its ordinary element children.
 */
export function composedChildren(node: ComposedRoot): Element[] {
  if (!isElement(node)) return childElements(node)
  if (node.tagName === 'TEMPLATE') return []
  const shadow = node.shadowRoot
  if (shadow !== null) return composedChildren(shadow)
  if (node.tagName === 'SLOT') {
    const assigned = (node as HTMLSlotElement).assignedElements({ flatten: true })
    return assigned.length > 0 ? assigned : childElements(node)
  }
  return childElements(node)
}

/** `Element`/`Text` both implement the `Slotable` mixin (`assignedSlot`). */
function assignedSlotOf(node: Node): HTMLSlotElement | null {
  if (isElement(node)) return node.assignedSlot
  if (node.nodeType === Node.TEXT_NODE) return (node as unknown as Text).assignedSlot
  return null
}

/**
 * Composed-tree parent hop: if `node` is slotted (has a non-null
 * `assignedSlot`), the composed parent is that `<slot>` — NOT its light-DOM
 * parentNode — since that's where it's actually rendered. Otherwise, the
 * ordinary DOM parent, EXCEPT when that parent is itself a `ShadowRoot` — in
 * that case hop out to `.host` and keep going. This is the upward mirror of
 * `composedChildren`'s slot resolution: without it, walking up from slotted
 * content disagrees with walking down via `composedChildren`/`walkComposedTree`,
 * so `composedContains`/`composedClosest`/`composedCompareOrder` (all built on
 * this) silently fail across a slot boundary even though the downward walk
 * finds the same nodes. Mirrors `dom-context.ts`'s `injectContext` walk.
 * Returns `null` at the top.
 */
export function composedParent(node: Node): Node | null {
  const slot = assignedSlotOf(node)
  if (slot !== null) return slot
  const parent = node.parentNode
  if (parent === null) return null
  return parent instanceof ShadowRoot ? parent.host : parent
}

/**
 * Depth-first, pre-order walk of the composed tree rooted at `root`, in
 * rendered order (slotted content appears where its `<slot>` is, not where it
 * was authored). Does not filter for focusability/visibility — see
 * `isTabbable`/`queryTabbables` for that.
 */
export function* walkComposedTree(root: ComposedRoot): Generator<Element> {
  for (const child of composedChildren(root)) {
    yield child
    yield* walkComposedTree(child)
  }
}

/** First composed-tree descendant of `root` matching `selector`, or `null`. */
export function composedQuerySelector<T extends Element = Element>(
  root: ComposedRoot,
  selector: string,
): T | null {
  for (const el of walkComposedTree(root)) {
    if (el.matches(selector)) return el as T
  }
  return null
}

/** All composed-tree descendants of `root` matching `selector`, in rendered order. */
export function composedQuerySelectorAll<T extends Element = Element>(
  root: ComposedRoot,
  selector: string,
): T[] {
  const out: T[] = []
  for (const el of walkComposedTree(root)) {
    if (el.matches(selector)) out.push(el as T)
  }
  return out
}

/**
 * Composed-tree `closest()`: walks UP from `el` (inclusive) via
 * `composedParent`, crossing shadow boundaries, returning the first element
 * matching `selector`. Unlike the native `Element.closest`, this does not stop
 * at a shadow root — a `<form>` ancestor "outside" an intervening shadow-DOM
 * wrapper is still found.
 */
export function composedClosest<T extends Element = Element>(
  el: Element,
  selector: string,
): T | null {
  let node: Node | null = el
  while (node !== null) {
    if (isElement(node) && node.matches(selector)) return node as T
    node = composedParent(node)
  }
  return null
}

/**
 * Composed-tree containment: is `node` reachable from `container` by walking
 * UP via `composedParent`? Unlike `Element.contains`, this crosses shadow
 * boundaries (multi-hop — any number of nested shadow roots), so a
 * doubly-nested shadow descendant is still correctly "contained".
 */
export function composedContains(container: Node, node: Node | null): boolean {
  let cur: Node | null = node
  while (cur !== null) {
    if (cur === container) return true
    cur = composedParent(cur)
  }
  return false
}

/**
 * Composed-tree `document.activeElement`: recursively drills through OPEN
 * shadow roots' own `.activeElement` to find the truly-focused leaf, rather
 * than stopping at the first shadow host (which is all `document.activeElement`
 * or a single un-recursed `root.activeElement` hop gives you). Stops (by
 * necessity) at a closed shadow root, same limitation as the rest of this module.
 */
export function composedActiveElement(root: Document | ShadowRoot = document): Element | null {
  let active: Element | null = root.activeElement
  while (active !== null && active.shadowRoot !== null) {
    const inner: Element | null = active.shadowRoot.activeElement
    if (inner === null) break
    active = inner
  }
  return active
}

/**
 * Order-comparator for two elements that may live in different shadow trees
 * (or even different, disconnected documents/fragments) — the composed-tree
 * generalization of `a.compareDocumentPosition(b)`. Walks both elements'
 * composed-ancestor chains to their common ancestor, then orders by that
 * ancestor's composed-children order. Returns `0` for equal elements or for
 * genuinely disconnected trees (no common ancestor — `compareDocumentPosition`
 * itself is implementation-specific in that case, so a stable tie is at least
 * as correct and doesn't throw).
 */
export function composedCompareOrder(a: Element, b: Element): number {
  if (a === b) return 0

  const chainA = composedAncestorChain(a)
  const chainB = composedAncestorChain(b)

  let i = 0
  while (i < chainA.length && i < chainB.length && chainA[i] === chainB[i]) i++
  if (i === 0) return 0 // disconnected — no defined composed order

  const common = chainA[i - 1]
  const branchA = chainA[i]
  const branchB = chainB[i]
  // One chain ended exactly at the common ancestor: that element IS an
  // ancestor of the other, so it opens first.
  if (branchA === undefined) return -1
  if (branchB === undefined) return 1

  const siblings = composedChildren(common as Node)
  const idxA = siblings.indexOf(branchA as Element)
  const idxB = siblings.indexOf(branchB as Element)
  if (idxA === -1 || idxB === -1) return 0
  return idxA - idxB
}

/** `[root, ..., node]` composed-ancestor chain (root-first) via `composedParent`. */
function composedAncestorChain(node: Node): Node[] {
  const chain: Node[] = []
  let cur: Node | null = node
  while (cur !== null) {
    chain.push(cur)
    cur = composedParent(cur)
  }
  return chain.reverse()
}

// ─── tabbability ──────────────────────────────────────────────────────────────

const FOCUSABLE_SELECTOR =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex], ' +
  '[contenteditable="true"], audio[controls], video[controls], details>summary:first-of-type'

/** jsdom does not lay out, so `offsetParent` is always null — treat all as visible there. */
function isInJsdom(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')
}

function hasNegativeTabindex(el: HTMLElement): boolean {
  const attr = el.getAttribute('tabindex')
  if (attr === null) return false
  const n = Number.parseInt(attr, 10)
  return Number.isFinite(n) && n < 0
}

function isDisabled(el: HTMLElement): boolean {
  if ('disabled' in el) return Boolean((el as unknown as { disabled: unknown }).disabled)
  return el.hasAttribute('disabled')
}

/** True if `el` or any composed ancestor is `inert`. */
function isInertOrAncestorInert(el: Element): boolean {
  let node: Node | null = el
  while (node !== null) {
    if (isElement(node)) {
      const asHtml = node as HTMLElement & { inert?: boolean }
      if (asHtml.inert === true || node.hasAttribute('inert')) return true
    }
    node = composedParent(node)
  }
  return false
}

function isVisible(el: HTMLElement): boolean {
  if (isInJsdom()) return true
  return el.offsetParent !== null
}

export interface TabbableOptions {
  /**
   * Treat this element as tabbable even if it fails the visibility check
   * (e.g. the current `composedActiveElement()` mid-transition/zero-layout).
   * Does not bypass the disabled/inert/negative-tabindex checks.
   */
  includeElement?: Element | null
}

/**
 * Is `el` currently in the tab order? Checks native focusable
 * tags/attributes, non-negative `tabindex`, `disabled`, `inert` (own or any
 * composed ancestor's), and visibility (`offsetParent`, with a jsdom-always-
 * visible carve-out since jsdom never lays out). Elements inside `<template>`
 * are never reachable here because `walkComposedTree`/`composedChildren` never
 * descend into template content.
 */
export function isTabbable(el: Element, opts: TabbableOptions = {}): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (!el.matches(FOCUSABLE_SELECTOR)) return false
  if (hasNegativeTabindex(el)) return false
  if (isDisabled(el)) return false
  if (isInertOrAncestorInert(el)) return false
  if (el === opts.includeElement) return true
  return isVisible(el)
}

/**
 * All tabbable elements in `container`'s composed subtree, in rendered order.
 * The shadow-DOM/slot-aware replacement for
 * `container.querySelectorAll(FOCUSABLE_SELECTOR)`.
 */
export function queryTabbables(container: ComposedRoot, opts: TabbableOptions = {}): HTMLElement[] {
  const out: HTMLElement[] = []
  for (const el of walkComposedTree(container)) {
    if (isTabbable(el, opts)) out.push(el as HTMLElement)
  }
  return out
}
