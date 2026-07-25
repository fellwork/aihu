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
      disposers: cd,
      appendedNodes: _mc(grow(), par, cd, `${pb}.conditional.true`, mfn, eh, anc.nextSibling),
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
  const n = items.length
  const ks = new Set<string | number>()
  for (let i = 0; i < n; i++) ks.add(kfn(items[i]))
  const par = anc.parentNode as Element | ShadowRoot
  for (const [k, s] of sc)
    if (!ks.has(k)) {
      _teardownChildScope(s)
      sc.delete(k)
    }
  // FEL-408: grow/reuse each row AND, in the same pass, run patience sorting
  // over the surviving scopes' CURRENT DOM order (`pos`) to find the longest
  // increasing subsequence — the rows that are already in the right relative
  // order and therefore need no move at all. Without it the walk at the bottom
  // is a naive left-to-right cursor: pulling one row forward displaces every
  // row behind it and each is then relocated individually, so a 2-row swap in
  // a 1000-row list cost 997 scope moves (1994 DOM nodes — every scope carries
  // an anchor comment alongside its content) where 2 suffice.
  //
  // `t[u]` is the smallest tail seen so far among increasing runs of length
  // u+1; the slot a row lands in is the length-1 of the longest run ENDING at
  // that row, which is parked back in `pos` (the field is rewritten with the
  // row's final index by the walk below, so it is free to carry this in the
  // meantime). `sl` holds the scope per NEW index so neither later pass has to
  // re-key or re-look-up an item.
  const sl: ChildScope[] = []
  const t: number[] = []
  for (let i = 0; i < n; i++) {
    const k = kfn(items[i])
    let s = sc.get(k)
    // FEL-395: key unchanged does NOT mean the item is unchanged. Row bodies
    // are grown once from `items[i]` BY VALUE (compiler-emitted
    // `lgrow(item, idx)` closes over the argument, it is not re-read
    // reactively per field) — so keeping this scope when a NEW item object
    // with the same key but different fields arrives would leave stale values
    // rendered forever. Reference-compare against the value this scope was
    // last grown from; on a mismatch, tear down and re-grow fresh below, same
    // as a brand-new key.
    // (`s &&` not `s?.` — an `undefined` list item must not compare equal to
    // the absent scope's absent `item`.)
    if (s && s.item === items[i]) sl[i] = s
    else {
      if (s) {
        _teardownChildScope(s)
        sc.delete(k)
      }
      const cd: Dispose[] = []
      const ca = document.createComment('e')
      par.appendChild(ca)
      try {
        // `pos < 0` marks a scope that has never been placed: it was just
        // appended to the END OF THE PARENT — past every survivor AND past
        // anything that follows the each() region — so it is never "already
        // in order" and is held out of the subsequence below.
        s = {
          anchor: ca,
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
          pos: -1,
        }
        sc.set(k, (sl[i] = s))
      } catch (err) {
        // Error-only path, mirroring _reconcileWhen: lgrow()/materialize threw
        // BEFORE this item's sc.set commit, so no teardown path (stale-key
        // sweep or scope dispose) can ever find the just-appended anchor or
        // the partially-built child disposers. Tear down the in-flight item
        // eagerly and rethrow; already-committed siblings stay in sc and
        // remain disposable as usual.
        _abortChild(cd, ca, par)
        throw err
      }
    }
    const p = sl[i]!.pos as number
    let u = -2
    if (p >= 0) {
      let v = t.length
      u = 0
      while (u < v) {
        const c = (u + v) >> 1
        ;(t[c] as number) < p ? (u = c + 1) : (v = c)
      }
      t[u] = p
    }
    sl[i]!.pos = u
  }
  // Reconstruct right-to-left by taking the first row at each descending run
  // length — no predecessor array needed: when a row recorded length w+1,
  // `t[w]` held the value of the nearest EARLIER row that recorded w and was
  // strictly smaller, so the first match scanning left is always a valid link.
  // Everything else is flagged `pos = -1`: a mover.
  for (let i = n, w = t.length - 1; i--; ) sl[i]!.pos === w ? w-- : (sl[i]!.pos = -1)

  let ref: globalThis.Node | null = anc.nextSibling
  for (let i = 0; i < n; i++) {
    const s = sl[i]!
    const nl = s.appendedNodes
    // FEL-396: reposition via _moveNode (moveBefore where supported) instead
    // of a bare insertBefore — a reorder of an UNCHANGED (same key, same
    // value — see the FEL-395 tear-down above) scope must not destroy the
    // state of any custom element it contains.
    if ((s.pos as number) < 0) {
      if (s.anchor !== ref) _moveNode(par, s.anchor, ref)
      else ref = s.anchor.nextSibling
      for (const nd of nl) nd === ref ? (ref = nd.nextSibling) : _moveNode(par, nd, ref)
    }
    // The index this pass just gave the row IS the DOM order the next
    // reconcile runs its subsequence against.
    s.pos = i
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
