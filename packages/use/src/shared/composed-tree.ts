/**
 * Composed-tree substrate for `@aihu/use` CORE — the shadow-DOM-correct
 * replacements for `el.contains(event.target)` and `document.activeElement`.
 *
 * **Why this file exists** (see
 * `docs/plans/2026-07-24-composed-tree-helper.md`): in a custom-elements
 * framework, shadow boundaries are the default, not an edge case, and the two
 * DOM APIs every "is this inside my element?" composable reaches for both
 * silently give the WRONG answer across one:
 *
 * - **Event retargeting.** An event crossing an OPEN shadow boundary has its
 *   `target` (and `relatedTarget`) rewritten to the outermost host visible to
 *   the listener's root. A `document`-level listener therefore never sees the
 *   real originating node, and `container.contains(event.target)` reports
 *   `false` for a click that genuinely happened inside `container`.
 * - **`document.activeElement` stops at the first host** — it returns the
 *   outermost shadow host, never the actually-focused leaf.
 *
 * **This is NOT the same problem `composedContains` solves.** An up-walk (this
 * module's `composedContains`, and the identical one in
 * `@aihu/primitives/composed-tree.ts`) cannot fix retargeting: `event.target`
 * has already been moved UP to the outermost host, and the container we are
 * testing sits BELOW that host, so it is never on the ancestor chain. Only
 * `event.composedPath()` — which the browser builds BEFORE retargeting —
 * recovers it. Use {@link isEventInside} for events and
 * {@link composedContains} only for nodes that are already real (e.g. a
 * `relatedTarget` you have independently resolved).
 *
 * **Layering.** `@aihu/use` CORE is dependency-free (signals-only, founder
 * ruling A, mechanically enforced by `scripts/dep-check.ts`'s
 * `allowedExternals()`), so it cannot import
 * `@aihu/primitives/composed-tree.ts` even though that module is the canonical
 * home of the tree-walk semantics below. The walk functions here are a
 * deliberate, state-free port of it; `packages/use/tests/composed-tree-parity.test.ts`
 * runs one behavioural table against BOTH so a divergence is a red test rather
 * than a silent one. Every export is a pure function — this module holds NO
 * module-level mutable state, so a second instance in a second bundle costs
 * bytes, never ownership.
 *
 * **`composedPath()` is only valid DURING dispatch.** Once the event has
 * finished propagating, the platform returns an empty array — so
 * {@link isEventInside} and {@link composedEventTarget} must be called
 * SYNCHRONOUSLY inside the listener, never from a `setTimeout`, microtask, or
 * a stashed event object. (A deferred call degrades silently to the
 * `event.target` up-walk, i.e. back to the broken behaviour.) Every consuming
 * composable must hit-test in the handler and store the boolean, not the
 * event.
 *
 * **Closed shadow roots.** `host.shadowRoot` is `null` for both "no shadow
 * root" and "closed shadow root", so nothing can walk DOWN into a closed tree.
 * Walking UP out of one does work (`ShadowRoot.host` is readable in closed
 * mode), which {@link isEventInside} exploits — see its docs. Consumers that
 * need full composed-tree correctness should use `mode: 'open'`.
 */

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

/** `Element`/`Text` both implement the `Slotable` mixin (`assignedSlot`). */
function assignedSlotOf(node: Node): HTMLSlotElement | null {
  if (isElement(node)) return node.assignedSlot
  if (node.nodeType === Node.TEXT_NODE) return (node as unknown as Text).assignedSlot
  return null
}

/**
 * Composed-tree parent hop: a slotted node's composed parent is its `<slot>`
 * (that is where it actually renders), not its light-DOM `parentNode`; a
 * `ShadowRoot` hops out to its `.host`. An UNSLOTTED light child of a shadow
 * host has NO composed parent — it is invisible to the downward walk, so
 * treating it as contained-via-its-host would make containment disagree with
 * the walk. Returns `null` at the top.
 *
 * Port of `@aihu/primitives/composed-tree.ts`'s `composedParent` — see this
 * module's header for why it is a port and not an import.
 */
export function composedParent(node: Node): Node | null {
  const slot = assignedSlotOf(node)
  if (slot !== null) return slot
  const parent = node.parentNode
  if (parent === null) return null
  if (parent instanceof ShadowRoot) return parent.host
  if (isElement(parent) && parent.shadowRoot !== null) return null
  return parent
}

/**
 * Composed-tree containment: is `node` reachable from `container` by walking
 * UP via {@link composedParent}? Unlike `Element.contains`, this crosses any
 * number of nested shadow boundaries.
 *
 * **Do not pass `event.target` here** — it is retargeted, so this returns
 * `false` for events that genuinely originated inside `container`. Use
 * {@link isEventInside}.
 */
export function composedContains(container: Node, node: Node | null | undefined): boolean {
  let cur: Node | null = node ?? null
  while (cur !== null) {
    if (cur === container) return true
    cur = composedParent(cur)
  }
  return false
}

/**
 * Composed-tree `document.activeElement`: recursively drills through OPEN
 * shadow roots' own `.activeElement` to reach the truly-focused leaf, rather
 * than stopping at the outermost host (all `document.activeElement` gives
 * you). Stops at a closed shadow root, by necessity.
 *
 * Port of `@aihu/primitives/composed-tree.ts`'s `composedActiveElement`.
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

// ─── event hit-testing ────────────────────────────────────────────────────────
// The retargeting-proof layer. Mirrored verbatim in
// `@aihu/primitives/composed-tree.ts` (for `useContextMenu`, which lives in
// that package); the parity test binds the two.

/**
 * The event's composed path — every node the event passes through that is
 * VISIBLE to the listener's root, innermost first, before retargeting.
 * Returns `[]` when the event has no `composedPath` (hand-built or legacy
 * events) **or when dispatch has already finished** — the platform empties the
 * path afterwards. Callers treat `[]` as "fall back to an up-walk", so a
 * deferred call degrades silently: read it inside the listener.
 */
export function composedPathOf(event: Event): EventTarget[] {
  return typeof event.composedPath === 'function' ? event.composedPath() : []
}

/**
 * The TRUE originating node of `event` (`composedPath()[0]`), before
 * retargeting rewrote `event.target` to an outer shadow host. Falls back to
 * `event.target` when no composed path is available.
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
 * Did `event` originate inside `node`'s composed subtree? **The hit-tester
 * `useClickOutside`/`useHover`/`useMouseInElement` are blocked on** — the
 * shadow-correct replacement for `node.contains(event.target)`.
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
  if (path.length === 0) return composedContains(node, event.target as Node | null)
  if (path.includes(node)) return true
  for (const host of closedShadowHostsAbove(node)) {
    if (path[0] === host) return true
  }
  return false
}

/**
 * {@link isEventInside} over several nodes — `useClickOutside`'s `ignore`
 * list (a trigger button plus the panel it opens, etc.). `null`/`undefined`
 * entries are skipped, so unresolved `$ref` getters are harmless.
 */
export function isEventInsideAny(event: Event, nodes: Iterable<Node | null | undefined>): boolean {
  for (const node of nodes) {
    if (isEventInside(event, node)) return true
  }
  return false
}
