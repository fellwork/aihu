import type { Dispose, Signal } from '@aihu/signals'
import type { MountEffectFn } from './attrs.ts'
import { _materialize } from './materialize.ts'
import { _mountDisposersStack } from './mount.ts'
import type { ChildScope, ErrorHandler, Node, StructuralNode } from './types.ts'

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
  const d = s.disposers,
    a = s.appendedNodes,
    anc = s.anchor
  for (let i = d.length; i--; ) d[i]?.()
  const p = anc.parentNode
  if (p) {
    for (const n of a) if (n.parentNode === p) p.removeChild(n)
    p.removeChild(anc)
  }
}

/**
 * Error-only abort for an uncommitted child scope: LIFO-dispose the partial
 * disposers, then remove the just-inserted anchor guarded on parentage.
 * Shared by _reconcileWhen and _reconcileEach catch paths.
 * @internal
 */
function _abortChild(cd: Dispose[], ca: Comment, par: Element | ShadowRoot): void {
  for (let i = cd.length; i--; ) cd[i]?.()
  if (ca.parentNode === par) par.removeChild(ca)
}

/**
 * FEL-396: move `node` to sit immediately before `ref` within `par`, preferring
 * the WHATWG `moveBefore()` API where the host supports it. `moveBefore`
 * preserves a custom element's state (its effect scope, DOM, everything)
 * across the reposition — `insertBefore` on a node already in the document
 * instead performs a remove+insert, which fires disconnectedCallback then
 * connectedCallback on every custom element in the moved subtree, destroying
 * component state (inputs, open disclosures, scroll position, `$resource`
 * caches — see FEL-396). Support: Chrome/Edge 133+, Firefox 144+; NOT in
 * Safari or jsdom (the test environment) as of this writing — feature-detect
 * per call and fall back to `insertBefore` (today's behavior) everywhere else.
 * Preservation additionally requires the moved element's class to define
 * `connectedMoveCallback` (see define-component.ts / define-element.ts) —
 * without it the platform itself falls back to disconnect+reconnect even
 * when `moveBefore` exists.
 *
 * FEL-396 guard: unlike `insertBefore`, the spec `moveBefore()` throws
 * `HierarchyRequestError` when `node` isn't a valid move target — in
 * particular when it has no parent, or its root differs from `par`'s root.
 * A row whose top-level body is a bare structural (e.g. compiler-emitted
 * `each(..., (item, i) => when(...))` for `{#each}{#if}...{/if}{/each}`)
 * records that nested `when()`'s live content nodes directly in the outer
 * row's `appendedNodes` at grow time (see `_mc` draining the nested
 * reconcile's output alongside the boundary anchor). If the nested `when()`
 * later toggles off, those nodes are removed from the DOM by
 * `_teardownChildScope` but the outer row's `appendedNodes` snapshot is never
 * updated — it keeps stale, now-detached references. A subsequent reorder
 * would otherwise pass one of those detached nodes straight to `moveBefore`
 * and throw, aborting the reposition loop mid-reorder. Guard by only taking
 * the `moveBefore` branch when `node` is still attached and shares `par`'s
 * root; otherwise fall back to `insertBefore` (today's — pre-existing —
 * behavior for a stale node, which silently re-inserts it; that resurrection
 * is a separate, pre-existing defect, tracked apart from this guard).
 * @internal
 */
// Not yet in TypeScript's lib.dom.d.ts (5.9.3) — self-declared minimal shape
// for the feature-detected branch below.
type _MoveCapableParent = {
  moveBefore?(node: globalThis.Node, child: globalThis.Node | null): void
}

function _moveNode(
  par: Element | ShadowRoot,
  node: globalThis.Node,
  ref: globalThis.Node | null,
): void {
  const mb = (par as unknown as _MoveCapableParent).moveBefore
  if (
    typeof mb === 'function' &&
    node.parentNode !== null &&
    node.getRootNode() === par.getRootNode()
  ) {
    mb.call(par, node, ref)
  } else {
    par.insertBefore(node, ref)
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
  const tmp = document.createDocumentFragment()
  _mountDisposersStack.push(cd)
  try {
    _materialize(tree, tmp as unknown as Element, cd, path, mfn, eh)
  } finally {
    _mountDisposersStack.pop()
  }
  const ns: globalThis.Node[] = []
  while (tmp.firstChild) ns.push(par.insertBefore(tmp.firstChild, bef))
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
    st.c && (_teardownChildScope(st.c), (st.c = null))
    return
  }
  if (st.c) return
  const cd: Dispose[] = []
  const ca = document.createComment('w')
  par.insertBefore(ca, anc.nextSibling)
  try {
    st.c = {
      anchor: ca,
      key: 'when',
      disposers: cd,
      appendedNodes: _mc(grow(), par, cd, `${pb}.conditional.true`, mfn, eh, anc.nextSibling),
      item: null,
    }
  } catch (err) {
    // Error-only path: grow()/materialize threw BEFORE the st.c commit, so
    // no teardown path (condition flip or scope dispose) can ever find the
    // just-inserted anchor or the partially-built child disposers. Tear down
    // eagerly — LIFO dispose then parentage-guarded anchor removal, mirroring
    // _teardownChildScope — and rethrow so the error still reaches
    // _mountEffect's handler/caller. st.c stays null: a later reconcile
    // retries grow() from a consistent empty state.
    _abortChild(cd, ca, par)
    throw err
  }
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
  const ks = new Set<string | number>()
  for (let i = 0; i < items.length; i++) ks.add(kfn(items[i]))
  const par = anc.parentNode as Element | ShadowRoot
  for (const [k, s] of sc)
    if (!ks.has(k)) {
      _teardownChildScope(s)
      sc.delete(k)
    }
  for (let i = 0; i < items.length; i++) {
    const k = kfn(items[i])
    const existing = sc.get(k)
    if (existing) {
      // FEL-395: key unchanged does NOT mean the item is unchanged. Row
      // bodies are grown once from `items[i]` BY VALUE (compiler-emitted
      // `lgrow(item, idx)` closes over the argument, it is not re-read
      // reactively per field) — so keeping this scope when a NEW item object
      // with the same key but different fields arrives would leave stale
      // values rendered forever. Reference-compare against the value this
      // scope was last grown from; on a mismatch, tear down and fall through
      // to re-grow fresh below, same as a brand-new key.
      if (existing.item === items[i]) continue
      _teardownChildScope(existing)
      sc.delete(k)
    }
    const cd: Dispose[] = []
    const ca = document.createComment('e')
    par.appendChild(ca)
    try {
      sc.set(k, {
        anchor: ca,
        key: k,
        disposers: cd,
        appendedNodes: _mc(
          lgrow(items[i]!, i),
          par,
          cd,
          `${pb}.list.${String(k).replace(/\./g, '_')}`,
          mfn,
          eh,
          null,
        ),
        item: items[i],
      })
    } catch (err) {
      // Error-only path, mirroring _reconcileWhen: lgrow()/materialize threw
      // BEFORE this item's sc.set commit, so no teardown path (stale-key sweep
      // or scope dispose) can ever find the just-appended anchor or the
      // partially-built child disposers. Tear down the in-flight item eagerly
      // and rethrow; already-committed siblings stay in sc and remain
      // disposable as usual.
      _abortChild(cd, ca, par)
      throw err
    }
  }
  let ref: globalThis.Node | null = anc.nextSibling
  for (let i = 0; i < items.length; i++) {
    const k = kfn(items[i])
    const s = sc.get(k)
    if (!s) continue
    const nl = s.appendedNodes
    // FEL-396: reposition via _moveNode (moveBefore where supported) instead
    // of a bare insertBefore — a reorder of an UNCHANGED (same key, same
    // value — see the FEL-395 tear-down above) scope must not destroy the
    // state of any custom element it contains.
    if (s.anchor !== ref) _moveNode(par, s.anchor, ref)
    else ref = s.anchor.nextSibling
    for (const n of nl) n === ref ? (ref = n.nextSibling) : _moveNode(par, n, ref)
    ref = (nl[nl.length - 1] ?? s.anchor).nextSibling
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
    disp.push(() => {
      st.c && (_teardownChildScope(st.c), (st.c = null))
    })
  } else {
    const ls = node.list as Signal<unknown[]>
    const kf = node.keyFn as (i: unknown) => string | number
    const lg = node.listGrow as (i: unknown, idx: number) => Node
    const sc = new Map<string | number, ChildScope>()
    mfn(disp, () => _reconcileEach(ls, kf, lg, anc, pb, mfn, eh, sc), `${pb}.list`, eh)
    disp.push(() => {
      sc.forEach(_teardownChildScope)
      sc.clear()
    })
  }
  return [anc]
}
