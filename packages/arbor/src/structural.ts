import type { Dispose, Signal } from '@scribe/signals'
import { _materialize } from './materialize.ts'
import { _mountDisposersStack } from './mount.ts'
import type { ChildScope, ErrorHandler, Node, StructuralNode } from './types.ts'
import type { MountEffectFn } from './attrs.ts'

/**
 * `when()` and `each()` — v1 reconciler per spec §2 (Plan 1.1).
 */

export function when(condition: Signal<boolean>, grow: () => Node): StructuralNode {
  return {
    kind: 'structural',
    structuralKind: 'conditional',
    condition,
    grow: grow as () => Node,
    list: null,
    keyFn: null,
    listGrow: null,
  }
}

export function each<T>(
  list: Signal<T[]>,
  key: (item: T) => string | number,
  grow: (item: T, index: number) => Node,
): StructuralNode {
  return {
    kind: 'structural',
    structuralKind: 'list',
    condition: null,
    grow: null,
    list: list as Signal<unknown[]>,
    keyFn: key as (item: unknown) => string | number,
    listGrow: grow as (item: unknown, index: number) => Node,
  }
}

/** @internal LIFO-dispose + remove DOM nodes + remove anchor. */
export function _teardownChildScope(s: ChildScope): void {
  const d = s.disposers, a = s.appendedNodes, anc = s.anchor
  for (let i = d.length - 1; i >= 0; i--) d[i]?.()
  const p = anc.parentNode
  if (p !== null) {
    for (const n of a) if (n.parentNode === p) p.removeChild(n)
    p.removeChild(anc)
  }
}

/**
 * Materialize childTree into a temp element, then move nodes into parent before beforeNode.
 * Returns the array of moved nodes.
 * @internal
 */
function _mc(
  tree: Node,
  par: Element | ShadowRoot,
  cd: Dispose[],
  path: string,
  mfn: MountEffectFn,
  eh: ErrorHandler | undefined,
  bef: globalThis.Node | null,
): globalThis.Node[] {
  const tmp = document.createElement('i')
  _mountDisposersStack.push(cd)
  try { _materialize(tree, tmp, cd, path, mfn, eh) } finally { _mountDisposersStack.pop() }
  const ns: globalThis.Node[] = []
  while (tmp.firstChild !== null) { const n = tmp.firstChild; ns.push(n); par.insertBefore(n, bef) }
  return ns
}

function _reconcileWhen(
  cond: Signal<boolean>,
  grow: () => Node,
  anc: Comment,
  pb: string,
  mfn: MountEffectFn,
  eh: ErrorHandler | undefined,
  st: { c: ChildScope | null },
): void {
  const par = anc.parentNode as Element | ShadowRoot
  if (!cond[0]()) {
    if (st.c !== null) { _teardownChildScope(st.c); st.c = null }
    return
  }
  if (st.c !== null) return
  const cd: Dispose[] = []
  const ca = document.createComment('w')
  par.insertBefore(ca, anc.nextSibling)
  st.c = { anchor: ca, key: 'when', disposers: cd,
    appendedNodes: _mc(grow(), par, cd, `${pb}.conditional.true`, mfn, eh, anc.nextSibling) }
}

function _reconcileEach(
  list: Signal<unknown[]>,
  kfn: (i: unknown) => string | number,
  lgrow: (i: unknown, idx: number) => Node,
  anc: Comment,
  pb: string,
  mfn: MountEffectFn,
  eh: ErrorHandler | undefined,
  sc: Map<string | number, ChildScope>,
): void {
  const items = list[0]()
  const keys: Array<string | number> = items.map(kfn)
  const ks = new Set(keys)
  const par = anc.parentNode as Element | ShadowRoot
  for (const [k, s] of sc) if (!ks.has(k)) { _teardownChildScope(s); sc.delete(k) }
  for (let i = 0; i < items.length; i++) {
    const k = keys[i] as string | number
    if (sc.has(k)) continue
    const cd: Dispose[] = []
    const ca = document.createComment('e')
    par.appendChild(ca)
    sc.set(k, { anchor: ca, key: k, disposers: cd,
      appendedNodes: _mc(lgrow(items[i], i), par, cd,
        `${pb}.list.${String(k).replace(/\./g, '_')}`, mfn, eh, null) })
  }
  let ref: globalThis.Node | null = anc.nextSibling
  for (const k of keys) {
    const s = sc.get(k)
    if (s === undefined) continue
    const nl = s.appendedNodes
    if (s.anchor !== ref) par.insertBefore(s.anchor, ref)
    else ref = s.anchor.nextSibling
    for (const n of nl) n === ref ? (ref = n.nextSibling) : par.insertBefore(n, ref)
    const last = nl[nl.length - 1]
    ref = last !== undefined ? last.nextSibling : s.anchor.nextSibling
  }
}

/** @internal */
export function _materializeStructural(
  node: StructuralNode,
  host: Element | ShadowRoot,
  disp: Dispose[],
  pb: string,
  mfn: MountEffectFn,
  eh: ErrorHandler | undefined,
): globalThis.Node[] {
  const isWhen = node.structuralKind === 'conditional'
  const anc = document.createComment(isWhen ? 'when' : 'each')
  host.appendChild(anc)
  if (isWhen) {
    const cond = node.condition as Signal<boolean>
    const grow = node.grow as () => Node
    const st: { c: ChildScope | null } = { c: null }
    mfn(disp, () => _reconcileWhen(cond, grow, anc, pb, mfn, eh, st), `${pb}.conditional`, eh)
    disp.push(() => { if (st.c !== null) { _teardownChildScope(st.c); st.c = null } })
  } else {
    const ls = node.list as Signal<unknown[]>
    const kf = node.keyFn as (i: unknown) => string | number
    const lg = node.listGrow as (i: unknown, idx: number) => Node
    const sc = new Map<string | number, ChildScope>()
    mfn(disp, () => _reconcileEach(ls, kf, lg, anc, pb, mfn, eh, sc), `${pb}.list`, eh)
    disp.push(() => { for (const s of sc.values()) _teardownChildScope(s); sc.clear() })
  }
  return [anc]
}
