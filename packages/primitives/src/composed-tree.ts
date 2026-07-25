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
  if (parent instanceof ShadowRoot) return parent.host
  // `parent` is an ordinary element whose OWN shadow root supersedes its
  // light-DOM children entirely (see `composedChildren`). If `node` reached
  // here, it has no `assignedSlot` — it is UNSLOTTED light-DOM content, which
  // is invisible to the downward walk (`composedChildren(parent)` resolves to
  // the shadow root's children, never `parent`'s light children). Chosen
  // semantic: composed-tree containment/closest/order-comparison must agree
  // with the downward walk rather than silently diverge from it, so an
  // unslotted light child has NO composed-tree parent either — it is off the
  // composed tree in both directions, not "contained via its host" in one
  // direction only. (The alternative — treating it as still contained via its
  // host — would make `composedContains` report `true` for elements that
  // `queryTabbables`/`composedQuerySelectorAll`/etc. can never reach, which is
  // the exact inconsistency this module exists to avoid.)
  if (isElement(parent) && parent.shadowRoot !== null) return null
  return parent
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

// ─── event hit-testing ────────────────────────────────────────────────────────
// Retargeting-proof event layer. Everything ABOVE this line answers "where is
// this node in the tree?"; this section answers "did this EVENT come from
// inside that node?" — a strictly different question that the up-walk above
// CANNOT answer. `event.target` is retargeted UP to the outermost shadow host
// visible to the listener's root, so the container being tested sits BELOW it
// and is never on `composedParent`'s ancestor chain: `composedContains(panel,
// event.target)` returns `false` for a click that genuinely happened inside
// `panel`, exactly like the native `panel.contains(event.target)` does. Only
// `event.composedPath()` — built by the browser BEFORE retargeting — recovers
// it. See `docs/plans/2026-07-24-composed-tree-helper.md` §2b.
//
// Mirrored verbatim in `@aihu/use`'s `src/shared/composed-tree.ts`, which
// cannot import this module (CORE is signals-only, founder ruling A, enforced
// by `scripts/dep-check.ts`). `packages/use/tests/composed-tree-parity.test.ts`
// runs one behavioural table against both so drift is a red test.
//
// IMPORTANT: `composedPath()` is only populated DURING dispatch — afterwards
// the platform returns an empty array. `isEventInside`/`composedEventTarget`
// must therefore be called SYNCHRONOUSLY inside the listener; a deferred call
// degrades silently to the (broken) `event.target` up-walk. Hit-test in the
// handler and store the boolean, never the event.

/**
 * The event's composed path — every node the event passes through that is
 * VISIBLE to the listener's root, innermost first, before retargeting.
 * Returns `[]` when the event has no `composedPath` (hand-built or legacy
 * events) **or when dispatch has already finished**. Callers treat `[]` as
 * "fall back to an up-walk", so a deferred call degrades silently.
 */
export function composedPathOf(event: Event): EventTarget[] {
  return typeof event.composedPath === 'function' ? event.composedPath() : []
}

/**
 * The TRUE originating node of `event` (`composedPath()[0]`), before
 * retargeting rewrote `event.target` to an outer shadow host. Falls back to
 * `event.target` when no composed path is available. (`label/index.ts` already
 * hand-rolls exactly this — see its `composedPath()[0]` read.)
 */
export function composedEventTarget(event: Event): EventTarget | null {
  // `path[0] ?? …`: an empty path (no composedPath, or dispatch already
  // finished) means the pre-retargeting origin is unrecoverable, so the
  // retargeted `event.target` is the best available answer.
  return composedPathOf(event)[0] ?? event.target
}

/**
 * All ancestor hosts of `node` whose shadow root is CLOSED. `ShadowRoot.host`
 * is readable regardless of mode, so we can always walk OUT of a closed tree
 * even though nothing can walk into one; a closed root is recognised by the
 * hop target's own `shadowRoot` being `null` despite us standing in its tree.
 */
function* closedShadowHostsAbove(node: Node): Generator<Element> {
  let cur: Node | null = node
  while (cur !== null) {
    const parent = cur.parentNode
    if (parent instanceof ShadowRoot && parent.host.shadowRoot === null) yield parent.host
    cur = composedParent(cur)
  }
}

/**
 * Did `event` originate inside `node`'s composed subtree? The shadow-correct
 * replacement for `node.contains(event.target)`, and the hit-tester
 * dismiss-on-outside behaviours (`useContextMenu`, dialog/tooltip light
 * dismiss) are blocked on.
 *
 * Resolution order:
 * 1. `composedPath().includes(node)` — the precise answer whenever the path is
 *    available and every boundary in between is open.
 * 2. If `node` itself lives inside a CLOSED shadow tree, the path is truncated
 *    at that tree's host and `node` can never appear on it. We instead ask
 *    whether the event's true origin (`path[0]`) IS that host, which the
 *    platform reports exactly when the event came from inside the closed tree.
 *    That cannot distinguish "inside `node`" from "elsewhere inside the same
 *    closed tree, or on the host itself" — it is the most precise answer
 *    closed mode allows, and it errs toward `true` (for a dismiss-on-outside
 *    caller, the conservative direction: don't dismiss).
 * 3. No composed path at all (synthetic event): fall back to an up-walk from
 *    `event.target`, which is correct whenever the event was not retargeted.
 */
export function isEventInside(event: Event, node: Node | null | undefined): boolean {
  if (node === null || node === undefined) return false
  const path = composedPathOf(event)
  if (path.length === 0) return composedContains(node, (event.target as Node | null) ?? null)
  if (path.includes(node)) return true
  for (const host of closedShadowHostsAbove(node)) {
    if (path[0] === host) return true
  }
  return false
}

/**
 * {@link isEventInside} over several nodes — a dismiss-on-outside "ignore"
 * list (a trigger button plus the overlay it opens, etc.). `null`/`undefined`
 * entries are skipped.
 */
export function isEventInsideAny(event: Event, nodes: Iterable<Node | null | undefined>): boolean {
  for (const node of nodes) {
    if (isEventInside(event, node)) return true
  }
  return false
}

// ─── tabbability ──────────────────────────────────────────────────────────────

const FOCUSABLE_SELECTOR =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex], ' +
  // `contenteditable=""` (including the bare `contenteditable` attribute,
  // which HTML parses to an empty-string value) means "true" per spec — only
  // `[contenteditable="true"]` missed that. `"plaintext-only"` is also an
  // editing-host state that participates in the tab order.
  '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], ' +
  'audio[controls], video[controls], details>summary:first-of-type'

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
 * Positive `tabindex` value of `el`, or `null` if absent/zero/negative/
 * non-numeric. The platform visits positive-`tabindex` elements FIRST, in
 * ascending order — see `orderScope`.
 */
function getPositiveTabindex(el: Element): number | null {
  const attr = el.getAttribute('tabindex')
  if (attr === null) return null
  const n = Number.parseInt(attr, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** A scope member during `orderScope`'s construction, before within-scope sorting. */
interface ScopeMember {
  /** The member itself — a plain scope participant, or the HOST anchor of a nested scope. */
  el: Element
  /** Original tree-order index within this scope, for stable tie-breaking. */
  index: number
  /**
   * Already-ordered contents of the nested scope this member hosts (its own
   * open shadow root), or `[]` if `el` isn't a shadow host. This is what
   * travels WITH `el` once `el`'s position in the scope is decided — see
   * `orderScope`.
   */
  nested: Element[]
}

/**
 * Recursively builds real sequential-focus-navigation order for the
 * focus-navigation scope rooted at `root` — the HTML spec's flattened,
 * tabindex-ordered construction, NOT a plain composed-DFS walk reordered
 * in place.
 *
 * A new scope begins at each open shadow root, exactly where
 * `composedChildren` crosses a shadow boundary. The shadow HOST is a member
 * of the PARENT scope (participating in that scope's tabindex ordering via
 * its OWN `tabindex` attribute, even when the host itself isn't tabbable) —
 * but critically, the host's entire nested scope travels WITH it: once a
 * scope's direct members are ordered (positive `tabindex` ascending, ties in
 * tree order, then naturals in tree order), each host's already-ordered
 * nested contents are spliced in immediately after that host in the
 * PARENT's ordered sequence. A nested scope never stays pinned at the
 * document position it happened to occupy — it moves with its host, which is
 * what makes a positive-`tabindex` shadow host's contents visited right
 * after the host, matching the platform's real Tab sequence. (Slotted
 * content keeps the scope it is composed INTO, i.e. the shadow tree owning
 * the `<slot>`, not its light-DOM origin — consistent with how
 * `composedChildren`/`walkComposedTree` already define scope boundaries
 * elsewhere in this file.)
 *
 * Returns every scope member in final order, INCLUDING non-tabbable hosts
 * and non-tabbable plain elements — callers filter with `isTabbable`
 * afterward (see `queryTabbables`), since a host's position must be kept as
 * the splice point for its nested scope even when the host itself is never
 * actually focusable.
 */
function orderScope(root: ComposedRoot): Element[] {
  const members: ScopeMember[] = []
  let index = 0

  function walk(node: ComposedRoot): void {
    for (const child of composedChildren(node)) {
      if (child.shadowRoot !== null) {
        // `child` hosts a new nested scope: it is itself a member of THIS
        // scope (ordered below by its own tabindex), and its shadow content
        // is a fully-ordered nested scope that gets spliced in right after
        // it once this scope's own ordering is decided.
        members.push({ el: child, index: index++, nested: orderScope(child.shadowRoot) })
      } else {
        members.push({ el: child, index: index++, nested: [] })
        walk(child) // descend further within the SAME scope
      }
    }
  }
  walk(root)

  const positive = members.filter((m) => getPositiveTabindex(m.el) !== null)
  positive.sort((a, b) => {
    const diff = getPositiveTabindex(a.el)! - getPositiveTabindex(b.el)!
    return diff !== 0 ? diff : a.index - b.index
  })
  const natural = members.filter((m) => getPositiveTabindex(m.el) === null)

  const out: Element[] = []
  for (const m of [...positive, ...natural]) {
    out.push(m.el, ...m.nested)
  }
  return out
}

/**
 * All tabbable elements in `container`'s composed subtree, in real
 * sequential-focus-navigation order: the shadow-DOM/slot-aware replacement
 * for `container.querySelectorAll(FOCUSABLE_SELECTOR)` — but ALSO correct
 * about ordering, not just reach. The platform does not visit tabbables in
 * plain document order: within each focus-navigation scope (the container
 * itself, and independently within each open shadow root), positive-
 * `tabindex` elements are visited first, ascending, and a scope nested
 * inside a positive-`tabindex` host travels WITH that host rather than
 * staying pinned at its original document position — see `orderScope`.
 */
export function queryTabbables(container: ComposedRoot, opts: TabbableOptions = {}): HTMLElement[] {
  const out: HTMLElement[] = []
  for (const el of orderScope(container)) {
    if (isTabbable(el, opts)) out.push(el as HTMLElement)
  }
  return out
}
