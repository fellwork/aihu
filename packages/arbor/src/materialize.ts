import type { Dispose } from '@aihu/signals'
import { _applyAttrs, type MountEffectFn, SVG_NS } from './attrs.ts'
import { _materializeStructural } from './structural.ts'
import type { ErrorHandler, Node } from './types.ts'

// SVG element tags that must be created in the SVG namespace.
// Without createElementNS these become HTMLUnknownElement and never paint.
const SVG_TAGS = new Set([
  'svg',
  'path',
  'circle',
  'ellipse',
  'line',
  'rect',
  'polyline',
  'polygon',
  'g',
  'defs',
  'use',
  'symbol',
  'text',
  'tspan',
  'textPath',
  'image',
  'filter',
  'clipPath',
  'mask',
  'marker',
  'linearGradient',
  'radialGradient',
  'stop',
  'pattern',
  'animate',
  'animateTransform',
  'animateMotion',
  'set',
  'foreignObject',
  'desc',
  'title',
  'metadata',
  'switch',
  'view',
])

/**
 * Recursive DOM materialization per `.team/phase-3/spec-arbor.md` §2.3.
 *
 * `_materialize(node, host, disposers, pathBase, mountEffect)` walks an
 * arbor `Node` (Branch | Leaf), creates the corresponding DOM nodes, applies
 * attrs, wires reactive subscriptions through `mountEffect`, and appends to
 * `host`. Returns the array of root DOM nodes appended at this call (one
 * for element/text/branch-with-tag, N for null-tag fragment branches —
 * `mount()` uses this for disposal-time DOM removal).
 *
 * Four cases per spec §2.3:
 *   1. text leaf — create text node; if Signal, wire mountEffect with
 *      `pathBase + '.text'`; else set nodeValue once.
 *   2. element leaf — createElement(tag), apply attrs, append.
 *   3. branch with non-null tag — createElement(tag), apply attrs, recurse
 *      into children (each child gets `pathBase + '.<i>'`), append.
 *   4. branch with null tag (fragment) — for each child, recurse into the
 *      same host with `pathBase + '.<i>'`. No wrapper element. Returns the
 *      flat list of DOM nodes appended.
 *
 * Path keys per spec §2.7 carry through every recursion:
 *   - root call: `<rootId>.0` (root index 0; `mount()` constructs this)
 *   - branch child: `<pathBase>.<childIndex>`
 *   - text-leaf binding: `<pathBase>.text`
 *   - attr binding (inside `_applyAttrs`): `<pathBase>.attr:<key>`
 *
 * The `mountEffect` parameter is dependency-injected — `mount.ts` passes
 * the real `_mountEffect`; tests can pass a spy. Same Option-C pattern as
 * `_applyAttrs` so this module doesn't import from `mount.ts` (avoids any
 * forward-reference / circular-import shape).
 *
 * Shape-locking note (§2.9): we never branch on `attrs === undefined` —
 * the factories normalize to `null`, so `_applyAttrs(el, null, ...)` is the
 * shape-locked no-op path.
 *
 * Plan 3.2: optional `registry` parameter — when provided, reactive signal
 * getters are stored by path key for `MountScope.serialize()`. Passed
 * through to `_applyAttrs` for attribute bindings.
 *
 * @internal
 */
export function _materialize(
  node: Node,
  host: Element | ShadowRoot,
  disposers: Dispose[],
  pathBase: string,
  mountEffect: MountEffectFn,
  errorHandler?: ErrorHandler,
  registry?: Map<string, () => unknown>,
): globalThis.Node[] {
  // Case 0: structural node (when/each)
  if (node.kind === 'structural') {
    return _materializeStructural(node, host, disposers, pathBase, mountEffect, errorHandler)
  }

  // Case 1: text leaf
  if (node.kind === 'leaf' && node.leafKind === 'text') {
    const textNode = document.createTextNode('')
    const value = node.value
    if (Array.isArray(value)) {
      // Signal<string> — tuple [Read, Write]. Wire reactive update.
      const get = value[0] as () => unknown
      const path = `${pathBase}.text`
      registry?.set(path, get)
      mountEffect(
        disposers,
        () => {
          textNode.nodeValue = String(get())
        },
        path,
        errorHandler,
      )
    } else {
      // Static string (or null — null is a leafKind:'element' invariant
      // never reached here, but the type union allows it). Setting
      // nodeValue = null is spec-equivalent to "" so the cast is safe.
      textNode.nodeValue = value as string | null
    }
    host.appendChild(textNode)
    return [textNode]
  }

  // Case 4: fragment branch (null tag) — recurse children directly into host.
  if (node.kind === 'branch' && node.tag === null) {
    const appended: globalThis.Node[] = []
    const fChildren = node.children
    try {
      for (let i = 0; i < fChildren.length; i++) {
        const nodes = _materialize(
          fChildren[i] as Node,
          host,
          disposers,
          `${pathBase}.${i}`,
          mountEffect,
          errorHandler,
          registry,
        )
        for (let j = 0; j < nodes.length; j++) appended.push(nodes[j]!)
      }
    } catch (err) {
      // Error-only path: a child threw mid-loop, so the siblings already
      // appended to `host` never reach mount()'s `appendedRoots` (the throw
      // discards this return value) and would be orphaned forever once the
      // scope is disposed. Register their removal on the disposer chain
      // instead of removing eagerly — unshift so it runs LAST in the LIFO
      // dispose loop, after structural (when/each) teardowns that need
      // their anchor comments still parented to find child nodes.
      disposers.unshift(() => {
        for (let j = appended.length; j--; ) {
          const n = appended[j]!
          if (n.parentNode === host) host.removeChild(n)
        }
      })
      throw err
    }
    return appended
  }

  // Cases 2+3: element leaf or branch with tag — create wrapper, apply attrs,
  // recurse into wrapper (no-op for leaf since its children list is empty).
  const tag = node.tag as string
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag)
  // Set back-reference so compiler-emitted _onMount callbacks can reach the
  // live DOM element via `_n.el` for $class: and @html bindings.
  if (node.kind === 'branch') node.el = el
  _applyAttrs(el, node.attrs, disposers, pathBase, mountEffect, errorHandler, registry)
  if (node.kind === 'branch') {
    const bChildren = node.children
    for (let i = 0; i < bChildren.length; i++) {
      _materialize(
        bChildren[i] as Node,
        el,
        disposers,
        `${pathBase}.${i}`,
        mountEffect,
        errorHandler,
        registry,
      )
    }
  }
  host.appendChild(el)
  return [el]
}
