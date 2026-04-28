import type { Dispose } from '@scribe/signals'
import { _applyAttrs, type MountEffectFn } from './attrs.ts'
import type { Node } from './types.ts'

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
 * @internal
 */
export function _materialize(
  node: Node,
  host: Element | ShadowRoot,
  disposers: Dispose[],
  pathBase: string,
  mountEffect: MountEffectFn,
): globalThis.Node[] {
  // Case 1+2: leaf
  if (node.kind === 'leaf') {
    if (node.leafKind === 'text') {
      const textNode = document.createTextNode('')
      const value = node.value
      if (Array.isArray(value)) {
        // Signal<string> — tuple [Read, Write]. Wire reactive update.
        const get = value[0] as () => unknown
        mountEffect(
          disposers,
          () => {
            textNode.nodeValue = String(get())
          },
          `${pathBase}.text`,
        )
      } else {
        // Static string (or null — null is a leafKind:'element' invariant
        // never reached here, but the type union allows it; coerce).
        textNode.nodeValue = value === null ? '' : (value as string)
      }
      host.appendChild(textNode)
      return [textNode]
    }
    // Element leaf (terminal — no children).
    const el = document.createElement(node.tag as string)
    _applyAttrs(el, node.attrs, disposers, pathBase, mountEffect)
    host.appendChild(el)
    return [el]
  }

  // Case 3+4: branch
  if (node.tag === null) {
    // Fragment — recurse children directly into host. No wrapper.
    const appended: globalThis.Node[] = []
    const children = node.children
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as Node
      const childPath = `${pathBase}.${i}`
      const result = _materialize(child, host, disposers, childPath, mountEffect)
      for (const n of result) appended.push(n)
    }
    return appended
  }

  // Branch with tag — create wrapper, apply attrs, recurse into wrapper.
  const el = document.createElement(node.tag)
  _applyAttrs(el, node.attrs, disposers, pathBase, mountEffect)
  const children = node.children
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as Node
    const childPath = `${pathBase}.${i}`
    _materialize(child, el, disposers, childPath, mountEffect)
  }
  host.appendChild(el)
  return [el]
}
