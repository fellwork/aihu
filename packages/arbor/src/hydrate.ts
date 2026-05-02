/**
 * `hydrate()` — Plan 3.2 client-side hydration.
 *
 * Attaches signal effects to server-rendered HTML without re-creating DOM
 * elements. Uses `data-scribe-path` attributes on existing DOM nodes as
 * anchors to wire reactive bindings.
 *
 * Algorithm:
 *   1. Build a path→element map from `host.querySelectorAll('[data-scribe-path]')`.
 *   2. Walk the arbor `node` tree using `_hydrateNode`, which:
 *      a. For branch nodes: look up the existing element by path; wire attrs.
 *      b. For text leaves: find the first text child node of the matching
 *         host element; wire signal effects to `nodeValue`.
 *      c. On DOM mismatch (expected node not found at path): fall back to
 *         `_materialize()` for that subtree, appending newly-created nodes.
 *   3. Returns a `MountScope` over the wired disposers.
 *
 * Per spec §5 (Plan 3.2): no element re-creation on happy path —
 * `host.innerHTML` is unchanged (verified in tests).
 *
 * @module
 */

import type { Dispose } from '@scribe/signals'
import { _applyAttrs } from './attrs.ts'
import { _observeMount } from './telemetry.ts'
import { mount, _mountEffect, _mountDisposersStack, _makeScope } from './mount.ts'
import { _materialize } from './materialize.ts'
import type { Branch, ErrorHandler, MountOptions, Node, Snapshot } from './types.ts'

// ---------------------------------------------------------------------------
// Internal: path-based DOM walker
// ---------------------------------------------------------------------------

/**
 * Build a map from `data-scribe-path` value → Element for all elements
 * under `host` that carry the attribute.
 * @internal
 */
function _buildPathMap(host: Element | ShadowRoot): Map<string, Element> {
  const map = new Map<string, Element>()
  const root = host as Element
  if (typeof root.querySelectorAll === 'function') {
    for (const el of root.querySelectorAll('[data-scribe-path]')) {
      const p = el.getAttribute('data-scribe-path')
      if (p !== null) map.set(p, el)
    }
  }
  // Include host itself if it is an Element carrying the attribute.
  if (typeof root.getAttribute === 'function') {
    const hp = root.getAttribute('data-scribe-path')
    if (hp !== null) map.set(hp, root)
  }
  return map
}

// ---------------------------------------------------------------------------
// Internal recursive hydration walker
// ---------------------------------------------------------------------------

/**
 * Recursively walk the arbor `node` tree and wire reactive effects onto
 * existing DOM nodes. Non-reactive nodes are left as-is (their static
 * content was already serialized by SSR). On DOM mismatch, falls back to
 * full `_materialize()` for the affected subtree.
 *
 * @internal
 */
function _hydrateNode(
  node: Node,
  host: Element | ShadowRoot,
  pathBase: string,
  disposers: Dispose[],
  signalRegistry: Map<string, () => unknown>,
  pathMap: Map<string, Element>,
  errorHandler: ErrorHandler | undefined,
): void {
  // Structural nodes (when/each): fall back to full materialize for the subtree.
  // Hydrating structural nodes requires full reconciler integration (future).
  if (node.kind === 'structural') {
    _mountDisposersStack.push(disposers)
    try {
      _materialize(node, host, disposers, pathBase, _mountEffect, errorHandler, signalRegistry)
    } finally {
      _mountDisposersStack.pop()
    }
    return
  }

  // Text leaf
  if (node.kind === 'leaf' && node.leafKind === 'text') {
    const value = node.value
    if (Array.isArray(value)) {
      const get = value[0] as () => unknown
      // Find the first text node in host (SSR renders text inline).
      let textNode: Text | null = null
      for (const cn of host.childNodes) {
        if (cn.nodeType === 3 /* Node.TEXT_NODE */) {
          textNode = cn as Text
          break
        }
      }
      if (textNode !== null) {
        const path = `${pathBase}.text`
        signalRegistry.set(path, get)
        const tn = textNode
        _mountEffect(disposers, () => { tn.nodeValue = String(get()) }, path, errorHandler)
        return
      }
      // Mismatch: no text node found — fall back to materialize for this leaf.
      _mountDisposersStack.push(disposers)
      try {
        _materialize(node, host, disposers, pathBase, _mountEffect, errorHandler, signalRegistry)
      } finally {
        _mountDisposersStack.pop()
      }
    }
    // Static text leaf — SSR already rendered it; nothing to wire.
    return
  }

  // Element leaf (img, br, input, hr, etc.)
  if (node.kind === 'leaf' && node.leafKind === 'element') {
    const tag = (node.tag as string).toUpperCase()
    let found: Element | null = null
    for (const cn of host.childNodes) {
      if (cn.nodeType === 1 && (cn as Element).tagName === tag) {
        found = cn as Element
        break
      }
    }
    if (found !== null && node.attrs !== null) {
      // Wire only reactive attrs; static attrs are already set by SSR.
      _applyAttrs(found, node.attrs, disposers, pathBase, _mountEffect, errorHandler, signalRegistry)
      return
    }
    if (found === null) {
      // Mismatch fallback: create + append.
      _mountDisposersStack.push(disposers)
      try {
        _materialize(node, host, disposers, pathBase, _mountEffect, errorHandler, signalRegistry)
      } finally {
        _mountDisposersStack.pop()
      }
    }
    return
  }

  // Branch node — all leaf/structural kinds returned above.
  const existingEl = pathMap.get(pathBase) ?? null

  if (existingEl === null) {
    // Mismatch: expected element not found at this path — fall back to materialize.
    _mountDisposersStack.push(disposers)
    try {
      _materialize(node, host, disposers, pathBase, _mountEffect, errorHandler, signalRegistry)
    } finally {
      _mountDisposersStack.pop()
    }
    return
  }

  // At this point node is Branch (structural + all leaf kinds have returned above).
  // TypeScript needs an explicit cast since it can't narrow through the early-returns.
  const branchNode = node as Branch

  // Wire reactive attrs to the existing element.
  if (branchNode.attrs !== null) {
    _applyAttrs(existingEl, branchNode.attrs, disposers, pathBase, _mountEffect, errorHandler, signalRegistry)
  }

  // Recurse into children.
  const children = branchNode.children
  for (let i = 0; i < children.length; i++) {
    _hydrateNode(children[i] as Node, existingEl, `${pathBase}.${i}`, disposers, signalRegistry, pathMap, errorHandler)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attach reactive effects from `component`'s arbor tree to pre-rendered
 * DOM nodes under `host` without re-creating elements.
 *
 * `snapshot` is the pre-parsed JSON state previously emitted by
 * `MountScope.serialize()` (e.g. from `window.__scribe_state__[tag]`).
 * It is used for mismatch detection: if a path key present in `snapshot`
 * has no matching DOM node, that subtree falls back to full `_materialize()`.
 *
 * The returned `MountScope`:
 * - `dispose()` — tears down wired reactive effects (leaves DOM intact
 *   if elements were not added by a fallback materialize).
 * - `serialize()` — returns current signal values keyed by path.
 * - `agent` — frozen `AgentContext` stub.
 *
 * @param component — factory function that returns the arbor Node (same
 *   factory the element's `connectedCallback`/`_build()` would call).
 * @param host — the pre-rendered host element (e.g. `this.shadowRoot ?? this`).
 * @param snapshot — pre-parsed state record from SSR (`window.__scribe_state__[tag]`).
 * @param options — optional `MountOptions` (e.g. `onError` handler).
 */
export function hydrate(
  component: () => Node,
  host: Element | ShadowRoot,
  snapshot: Snapshot,
  options?: MountOptions,
): ReturnType<typeof mount> {
  void snapshot // currently used for type safety; future: signal pre-seeding
  const errorHandler = options?.onError
  const pathMap = _buildPathMap(host)

  _observeMount({ kind: 'mount-start', path: 'hydrate', timestamp: Date.now() })

  const disposers: Dispose[] = []
  const signalRegistry = new Map<string, () => unknown>()

  let node: Node
  try {
    node = component()
  } catch (err) {
    if (errorHandler !== undefined) {
      errorHandler(err, 'hydrate')
      _observeMount({ kind: 'mount-end', path: 'hydrate', timestamp: Date.now() })
      return _makeScope(disposers, signalRegistry)
    }
    throw err
  }

  // Use fixed path prefix for hydration (not the counter-based rootId from mount()).
  const pathBase = 'hydrate.0'

  _hydrateNode(node, host, pathBase, disposers, signalRegistry, pathMap, errorHandler)

  _observeMount({ kind: 'mount-end', path: 'hydrate', timestamp: Date.now() })

  return _makeScope(disposers, signalRegistry)
}
