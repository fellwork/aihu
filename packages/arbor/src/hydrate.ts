/**
 * `hydrate()` — Plan 3.2 client-side hydration.
 *
 * Attaches signal effects to server-rendered HTML without re-creating DOM
 * elements. Uses `data-aihu-path` attributes on existing DOM nodes as
 * anchors to wire reactive bindings.
 *
 * Algorithm:
 *   1. Build a path→element map from `host.querySelectorAll('[data-aihu-path]')`.
 *   2. Walk the arbor `node` tree using `_hydrateNode`, which:
 *      a. For branch nodes: look up the existing element by path; wire attrs.
 *      b. For text leaves: claim the next unclaimed text child node of the
 *         matching host element (a per-host cursor keeps adjacent text
 *         leaves each bound to their own node); wire signal effects to
 *         `nodeValue` for reactive leaves.
 *      c. For structural nodes (when/each): locate the server-rendered
 *         segment by its `<!--aihu:s:PATH-->` comment delimiters and ADOPT
 *         it in place (`_adoptStructural` — keyed rows matched by key,
 *         conditionals by client/server agreement), falling back to
 *         adopt-by-replace when the segment cannot be claimed safely.
 *      d. On DOM mismatch (expected node not found at path): fall back to
 *         `_materialize()` for that subtree, appending newly-created nodes.
 *   3. Returns a `MountScope` over the wired disposers.
 *
 * Per spec §5 (Plan 3.2): no element re-creation on happy path —
 * `host.innerHTML` is unchanged (verified in tests).
 *
 * @module
 */

import { type Dispose, runWithoutScope, type Signal } from '@aihu/signals'
import { _applyAttrs } from './attrs.ts'
import { _materialize } from './materialize.ts'
import { _makeScope, _mountDisposersStack, _mountEffect, type mount } from './mount.ts'
import { _wireStructural } from './structural.ts'
import { _observeMount } from './telemetry.ts'
import type {
  AttrMap,
  Branch,
  ChildScope,
  ErrorHandler,
  MountOptions,
  Node,
  Snapshot,
  StructuralNode,
} from './types.ts'

// Injected by Rolldown (production: false) or vitest define (tests: true).
declare const __DEV__: boolean

/**
 * The root path key of the `data-aihu-path` addressing scheme.
 *
 * This is a WIRE-PROTOCOL constant, not a local convention: it must equal the
 * root path the server seeds its render walk with. There are three independent
 * implementations of the scheme — this walker, `@aihu/server`'s `ssr.ts`, and
 * the Rust renderer in `packages/server/src-native/src/render.rs` — and a
 * disagreement at the root makes EVERY branch lookup miss. The failure is
 * silent: `_hydrateNode` treats a miss as a DOM mismatch and falls back to
 * `_materialize`, which builds a second copy of the tree beside the server's
 * DOM. Nothing throws; the user just sees duplicated content.
 *
 * Deliberately NOT the counter-based `rootId` that `mount()` assigns. That
 * counter is mutable per-process module state — it advances once per `mount()`
 * call on the client and resets on every page load, while the server renders
 * from a long-lived process shared across requests. No counter value can be
 * reproduced on both sides of a server/client split, so the root key must be a
 * fixed constant. `mount()` keeps its counter, which is correct: a client-only
 * mount never crosses the boundary, and each scope owns its own
 * `signalRegistry`, so the two namespaces cannot collide.
 *
 * Every path BELOW the root is already positional (`parent.childIndex`) in both
 * the renderer and this walker, so the root was the only point of disagreement.
 *
 * Enforced behaviorally, not by comment, by
 * `tests/integration/ssr-hydrate-path-parity.test.ts` and by
 * `scripts/check-hydration-adoption.ts`.
 *
 * @internal
 */
export const _ROOT_PATH = '0'

// ---------------------------------------------------------------------------
// Signal pre-seeding (wave 3 — the state channel)
// ---------------------------------------------------------------------------

/**
 * Seed one writable signal binding from the SSR snapshot, keyed by the same
 * path the walker is about to wire. Runs at FIRST VISIT, strictly BEFORE the
 * binding's effect is created: at that point the signal has no subscriber
 * from this walk yet, so the write re-runs nothing — the effect's first run
 * (inside `_mountEffect`) then reads the seeded value, and the DOM (already
 * server-rendered from that same value) is confirmed rather than rewritten.
 * Thunk arrays/deriveds carry no writer (`sig[1]`) and are skipped — they
 * re-derive from seeded sources. Snapshot values come from JSON, so a value
 * can never be a function (which the signal writer would treat as an updater).
 *
 * @internal
 */
function _seedSignal(snapshot: Snapshot, path: string, sig: readonly unknown[]): void {
  const write = sig[1]
  if (typeof write === 'function' && path in snapshot) {
    ;(write as (v: unknown) => void)(snapshot[path])
  }
}

/** Seed every writable reactive attr of a node at `<pathBase>.attr:<key>`. @internal */
function _seedAttrs(snapshot: Snapshot, pathBase: string, attrs: AttrMap | null): void {
  if (!attrs) return
  for (const key in attrs) {
    const v = attrs[key]
    if (Array.isArray(v)) _seedSignal(snapshot, `${pathBase}.attr:${key}`, v)
  }
}

// ---------------------------------------------------------------------------
// Structural in-place adoption (#465 follow-up)
// ---------------------------------------------------------------------------

/**
 * Adoption spine context. Present only while `_hydrateNode` is walking the
 * TOP LEVEL of a structural segment's content (a `when()` branch body or one
 * `each()` row) against the server's DOM in place:
 *
 * - `c` collects every top-level DOM node the walk claimed, in claim (=tree)
 *   order — these become the child scope's `appendedNodes`, so teardown and
 *   reorder later operate on exactly the adopted nodes.
 * - `f` flags an unclaimable spine (path miss, wrong parent, missing text
 *   node, shapes we refuse to claim positionally). The caller falls back —
 *   nothing at spine level is materialized on this flag, so a fallback can
 *   still adopt-by-replace the whole segment cleanly.
 * - `e` is the segment's closing marker: the hard boundary no text-cursor
 *   claim may cross (text nodes AFTER the segment belong to later siblings).
 * - `t` records that a spine-level TEXT node was claimed. Text claims are
 *   cursor-based (positional), so they are only sound while server and
 *   client row order agree — `_adoptStructural` verifies order post-hoc and
 *   falls back when `t` rows turn out to be misaligned.
 *
 * The context does NOT propagate into a claimed element's children — those
 * hydrate in normal mode (with the standard per-node materialize fallbacks,
 * which append INSIDE the claimed element and are therefore position-safe).
 * @internal
 */
interface AdoptCtx {
  c: globalThis.Node[]
  f: boolean
  e: globalThis.Node
  t: boolean
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
  textCursor: { i: number },
  snapshot: Snapshot,
  ctx: AdoptCtx | null,
): void {
  // Structural nodes (when/each) — #465 in-place adoption.
  //
  // SSR renders structural content, delimited in hydratable output by
  // path-tagged comments: `<!--aihu:s:PATH-->` … `<!--aihu:/s:PATH-->` (the
  // `-`→`_` transform below matches `_commentPath` in @aihu/server's ssr.ts —
  // a wire-protocol pair like `_ROOT_PATH`). When the segment is found,
  // `_adoptStructural` claims the server's nodes IN PLACE into the
  // reconciler's ChildScopes (keyed rows matched by key, conditionals by
  // agreement between the client condition and the server's rendered branch)
  // and wires the same reconcile effect `_materializeStructural` would — the
  // effect's first run then confirms the adopted DOM instead of rebuilding.
  //
  // When adoption declines (no keyFn, spine shapes we cannot claim safely,
  // client/server divergence mid-claim), the segment falls back to
  // adopt-by-replace: the server segment is REMOVED and freshly materialized
  // content takes its exact position. That keeps the invariant that matters —
  // content appears exactly once and in order.
  //
  // Markerless hosts (legacy/terminal HTML, or SSR that predates the walk)
  // keep the old behavior exactly: materialize appended at the end of host.
  if (node.kind === 'structural') {
    const marker = pathBase.replace(/-/g, '_')
    const cns = host.childNodes
    let open: globalThis.Node | null = null
    for (let i = 0; i < cns.length; i++) {
      const c = cns[i]!
      if (c.nodeType === 8 /* COMMENT_NODE */ && (c as Comment).data === `aihu:s:${marker}`) {
        open = c
        break
      }
    }
    // Find the matching close by EXACT path — nested structural markers carry
    // deeper paths, so they can never match and are swept up as content.
    let close: globalThis.Node | null = null
    if (open) {
      const closeData = `aihu:/s:${marker}`
      for (let n = open.nextSibling; n; n = n.nextSibling) {
        if (n.nodeType === 8 && (n as Comment).data === closeData) {
          close = n
          break
        }
      }
    }

    // An unmatched open (malformed segment) is treated as markerless — never
    // sweep to the end of the host on a guess.
    const segment = open && close ? { open, close } : null

    if (segment) {
      const end = _adoptStructural(
        node as StructuralNode,
        host,
        segment.open as Comment,
        segment.close as Comment,
        pathBase,
        disposers,
        signalRegistry,
        pathMap,
        errorHandler,
        snapshot,
      )
      if (end) {
        // Adopted in place. The region now runs from the open marker (reused
        // as the structural anchor) through `end` (the close marker, or the
        // open marker itself when the region adopted empty). Report it to an
        // enclosing adoption spine and advance the shared text cursor past it
        // so later sibling text leaves never claim a text node inside.
        if (ctx) {
          for (let n: globalThis.Node | null = segment.open; n; n = n.nextSibling) {
            ctx.c.push(n)
            if (n === end) break
          }
        }
        const cnsA = host.childNodes
        for (let i = 0; i < cnsA.length; i++) {
          if (cnsA[i] === end) {
            if (i + 1 > textCursor.i) textCursor.i = i + 1
            break
          }
        }
        return
      }
    } else if (ctx) {
      // Markerless structural inside an adoption spine: there is no way to
      // place materialized content at the right mid-segment position, and
      // appending at the end of the host would corrupt the row's node
      // bookkeeping. Decline the whole spine instead.
      ctx.f = true
      return
    }

    let insertRef: globalThis.Node | null = null
    if (segment) {
      insertRef = segment.close.nextSibling
      let cur: globalThis.Node | null = segment.open
      while (cur) {
        const next: globalThis.Node | null = cur.nextSibling
        host.removeChild(cur)
        if (cur === segment.close) break
        cur = next
      }
    }

    // Materialize into a fragment, then move into position — the same
    // build-then-move shape as the reconciler's `_mc`, so anchors resolve
    // `parentNode` to `host` for every later reactive update.
    const frag = document.createDocumentFragment()
    _mountDisposersStack.push(disposers)
    try {
      _materialize(
        node,
        frag as unknown as Element,
        disposers,
        pathBase,
        _mountEffect,
        errorHandler,
        signalRegistry,
      )
    } finally {
      _mountDisposersStack.pop()
    }
    while (frag.firstChild) {
      const moved = frag.firstChild
      host.insertBefore(moved, insertRef)
      // A replace inside an adoption spine (nested segment that declined
      // in-place adoption) still contributes its fresh nodes to the row.
      ctx?.c.push(moved)
    }

    if (segment) {
      // Advance the shared text cursor past the inserted content so later
      // sibling text leaves never claim a text node INSIDE this structural
      // subtree (the segment sat mid-host, so fresh nodes now precede them).
      let after = host.childNodes.length
      if (insertRef) {
        for (let i = 0; i < host.childNodes.length; i++) {
          if (host.childNodes[i] === insertRef) {
            after = i
            break
          }
        }
      }
      if (after > textCursor.i) textCursor.i = after
    }
    return
  }

  // Text leaf
  if (node.kind === 'leaf' && node.leafKind === 'text') {
    const value = node.value
    // Pre-seed BEFORE claiming/wiring (and before any mismatch fallback
    // materialize) so the first reactive run reads the server's value.
    if (Array.isArray(value)) _seedSignal(snapshot, `${pathBase}.text`, value)
    // Claim the NEXT unclaimed text node at/after the shared per-host cursor.
    // Every text leaf (static or reactive) advances the cursor, so adjacent
    // text leaves each line up with their own DOM text node instead of all
    // rebinding the first one. Comments (e.g. SSR `<!--|-->` boundary
    // markers between adjacent text leaves) and elements are skipped here
    // and naturally keep neighbouring text nodes from coalescing.
    let textNode: Text | null = null
    const cns0 = host.childNodes
    for (let i = textCursor.i; i < cns0.length; i++) {
      // Adoption spine: never claim past the segment's closing marker — text
      // nodes beyond it belong to later siblings outside the segment.
      if (ctx && cns0[i] === ctx.e) break
      if (cns0[i]!.nodeType === 3 /* Node.TEXT_NODE */) {
        textNode = cns0[i] as Text
        textCursor.i = i + 1
        break
      }
    }
    if (ctx) {
      // Spine-level text: a positional (cursor) claim. Record it so the
      // adopter can verify row order afterwards; a miss (static or reactive)
      // means the server's segment diverges from this tree — decline rather
      // than materialize at the wrong position.
      if (textNode) {
        ctx.c.push(textNode)
        ctx.t = true
      } else {
        ctx.f = true
        return
      }
    }
    if (Array.isArray(value)) {
      const get = value[0] as () => unknown
      if (textNode) {
        const path = `${pathBase}.text`
        signalRegistry.set(path, get)
        const tn = textNode
        _mountEffect(
          disposers,
          () => {
            tn.nodeValue = String(get())
          },
          path,
          errorHandler,
        )
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
    // Static text leaf — SSR already rendered it; nothing to wire (the
    // cursor claim above keeps later reactive siblings aligned).
    return
  }

  // Element leaf (img, br, input, hr, etc.)
  if (node.kind === 'leaf' && node.leafKind === 'element') {
    if (ctx) {
      // Spine-level element leaf: the claim below is a first-match tag scan
      // from index 0 — positionally unsafe mid-segment (it could grab a
      // matching element OUTSIDE the segment). Decline the spine; the
      // segment falls back to adopt-by-replace.
      ctx.f = true
      return
    }
    _seedAttrs(snapshot, pathBase, node.attrs)
    const tag = (node.tag as string).toUpperCase()
    let found: Element | null = null
    const cns1 = host.childNodes
    for (let i = 0; i < cns1.length; i++) {
      if ((cns1[i] as Element).tagName === tag) {
        found = cns1[i] as Element
        break
      }
    }
    if (found && node.attrs) {
      // Wire only reactive attrs; static attrs are already set by SSR.
      _applyAttrs(
        found,
        node.attrs,
        disposers,
        pathBase,
        _mountEffect,
        errorHandler,
        signalRegistry,
      )
      return
    }
    if (!found) {
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

  // Fragment branch (null/'' tag) — no wrapper element exists on either side
  // (`_materialize` case 4; SSR renders children inline), so there is no path
  // marker to look up. Recurse children into the SAME host, sharing the
  // host's text cursor, exactly like materialize. Without this case the
  // lookup below misses and the whole fragment — the compiler's `{#if}`/
  // `{#each}` body shape — is rebuilt beside the server's DOM.
  if (node.kind === 'branch' && (node.tag === null || node.tag === '')) {
    const fch = node.children
    for (let i = 0; i < fch.length; i++) {
      // A fragment's children are spine-level too — the adoption context (and
      // its failure flag) passes straight through.
      _hydrateNode(
        fch[i] as Node,
        host,
        `${pathBase}.${i}`,
        disposers,
        signalRegistry,
        pathMap,
        errorHandler,
        textCursor,
        snapshot,
        ctx,
      )
      if (ctx?.f) return
    }
    return
  }

  // Branch node — all leaf/structural kinds returned above. Attr seeding
  // happens before the lookup so even a mismatch-fallback materialize
  // renders from server values.
  _seedAttrs(snapshot, pathBase, (node as Branch).attrs)
  const existingEl = pathMap.get(pathBase)

  if (ctx && (!existingEl || existingEl.parentNode !== host)) {
    // Adoption spine: this element is the row's/branch's addressable root —
    // a path miss (or an element that is not a direct child of the segment's
    // host) means the server did not render this subtree here. Decline; the
    // adopter decides between skipping the row (absent server-side) and
    // replacing the whole segment. Materializing here would append at the
    // END of the host, outside the segment.
    ctx.f = true
    return
  }

  if (!existingEl) {
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

  // Live-element ref, mirroring `_materialize` (`node.el = el`): compiled
  // `class:`/`html={…}` effects and the router's link boundary (`onMount` →
  // `node.el` for prefetch/aria-current) read the branch's `.el`. Without the
  // assignment those bindings silently no-op on ADOPTED trees — the server
  // DOM looks right at first paint but never reacts (observed: an adopted
  // page's active link never received `aria-current`).
  branchNode.el = existingEl

  // Spine-level claim recorded; children below hydrate in NORMAL mode (their
  // fallbacks materialize INSIDE this claimed element, which is position-safe).
  ctx?.c.push(existingEl)

  // Wire reactive attrs to the existing element.
  if (branchNode.attrs) {
    _applyAttrs(
      existingEl,
      branchNode.attrs,
      disposers,
      pathBase,
      _mountEffect,
      errorHandler,
      signalRegistry,
    )
  }

  // Recurse into children. A fresh text cursor scopes text-node claiming
  // to THIS element's childNodes (shared across all its direct children).
  const childCursor = { i: 0 }
  const ch = branchNode.children
  for (let i = 0; i < ch.length; i++) {
    _hydrateNode(
      ch[i] as Node,
      existingEl,
      `${pathBase}.${i}`,
      disposers,
      signalRegistry,
      pathMap,
      errorHandler,
      childCursor,
      snapshot,
      null,
    )
  }
}

/**
 * In-place adoption of a server-rendered structural segment.
 *
 * Claims the DOM between the segment's `<!--aihu:s:PATH-->`/`<!--aihu:/s:PATH-->`
 * markers into live reconciler child scopes, then wires the SAME reconcile
 * effect `_materializeStructural` would — with the state pre-seeded, so the
 * effect's first run confirms the adopted DOM instead of rebuilding it.
 *
 * Marker reuse: the OPEN comment becomes the structural anchor (the node the
 * reconcilers insert relative to), and for an active conditional the CLOSE
 * comment becomes the branch's child anchor — giving exactly the DOM layout
 * a client-side materialize produces (`[anc][content…][ca]` for when;
 * `[anc][rowAnchor][rowNodes…]…` for each, with per-row anchors inserted
 * during adoption).
 *
 * Reconciliation strategy:
 * - **Conditional**: adopt when the client condition is truthy AND the server
 *   rendered content; when they DISAGREE (client-divergent state — media
 *   query, localStorage), discard the server content and let the reconcile
 *   effect's first run rebuild from client truth at the anchor. `elseif`/
 *   `else` arms are sibling `when()`s with negated conditions, so each arm
 *   resolves independently under the same rule.
 * - **List**: rows match BY KEY — a client item's row is located through the
 *   `data-aihu-path` the server stamped from the same key
 *   (`PATH.list.<key>`), so matching is position-independent and a reordered
 *   client list still adopts every row. Client keys absent from the server
 *   DOM are skipped (the first reconcile run creates them in position);
 *   server rows no client key claims are swept out before wiring. Adopted
 *   rows carry `pos: -1` ("never placed"), which the first reconcile run
 *   resolves cursor-style: rows already in order cost zero DOM moves, a
 *   divergent order is corrected. Rows whose spine required positional TEXT
 *   claims are order-verified post-hoc; if their claim order does not match
 *   DOM order, the mispairing cannot be repaired locally and the whole
 *   segment falls back.
 * - **Fallback** is always the whole segment: partially-adopted rows are
 *   disposed and `null` is returned, upon which the caller adopt-by-REPLACES
 *   the segment (remove + fresh materialize in position) — safe by
 *   construction, never duplicated, merely un-adopted.
 *
 * Returns the last DOM node of the adopted region (close marker, or the open
 * marker when the region adopted empty), or `null` to request the replace
 * fallback.
 * @internal
 */
/** LIFO-run a disposer list (adoption-abort unwind). @internal */
function _unwind(d: Dispose[]): void {
  for (let i = d.length; i--; ) d[i]?.()
}

function _adoptStructural(
  node: StructuralNode,
  host: Element | ShadowRoot,
  open: Comment,
  close: Comment,
  pathBase: string,
  disposers: Dispose[],
  signalRegistry: Map<string, () => unknown>,
  pathMap: Map<string, Element>,
  errorHandler: ErrorHandler | undefined,
  snapshot: Snapshot,
): globalThis.Node | null {
  const st: { c: ChildScope | null } = { c: null }
  const sc = new Map<string | number, ChildScope>()
  let end: globalThis.Node = close

  const cns = host.childNodes
  const idxAfter = (n: globalThis.Node): number => {
    for (let i = 0; i < cns.length; i++) if (cns[i] === n) return i + 1
    return 0
  }

  if (node.structuralKind === 'conditional') {
    const active = Boolean((node.condition as Signal<boolean>)[0]())
    if (active && open.nextSibling !== close) {
      // Server rendered the branch and the client agrees: adopt it.
      const cd: Dispose[] = []
      const ctx: AdoptCtx = { c: [], f: false, e: close, t: false }
      _mountDisposersStack.push(cd)
      try {
        _hydrateNode(
          (node.grow as () => Node)(),
          host,
          `${pathBase}.conditional.true`,
          cd,
          signalRegistry,
          pathMap,
          errorHandler,
          { i: idxAfter(open) },
          snapshot,
          ctx,
        )
      } finally {
        _mountDisposersStack.pop()
      }
      if (ctx.f) {
        _unwind(cd)
        return null
      }
      // appendedNodes is the WHOLE range (open, close) — not just the claimed
      // set — so a later condition flip tears out everything the server put
      // in the branch, even nodes a divergent server rendered beyond the
      // client's tree.
      const an: globalThis.Node[] = []
      for (let n = open.nextSibling; n && n !== close; n = n.nextSibling) an.push(n)
      st.c = { anchor: close, disposers: cd, appendedNodes: an }
    } else {
      // Divergence (client condition disagrees with the server's rendered
      // branch) or both-empty: discard whatever sits in the segment,
      // including the close marker — `_reconcileWhen` creates its own child
      // anchor per activation — and let the effect's first run act from
      // client truth at the (reused-as-anchor) open marker.
      let n: globalThis.Node | null = open.nextSibling
      while (n) {
        const nx: globalThis.Node | null = n.nextSibling
        host.removeChild(n)
        if (n === close) break
        n = nx
      }
      end = open
    }
  } else {
    const kfn = node.keyFn
    if (!kfn) return null // unkeyed list: no key space to match rows by
    const items = (node.list as Signal<unknown[]>)[0]()
    const lgrow = node.listGrow as (i: unknown, idx: number) => Node
    const claimed = new Set<globalThis.Node>()
    const order: globalThis.Node[] = []
    const rows: ChildScope[] = []
    let sawText = false
    const cursor = { i: idxAfter(open) }
    const bail = (): null => {
      for (let r = rows.length; r--; ) _unwind(rows[r]!.disposers)
      return null
    }
    for (let i = 0; i < items.length; i++) {
      const k = kfn(items[i])
      // Duplicate keys collapse to one scope in the reconciler; adopt the
      // first occurrence only, matching that collapse.
      if (sc.has(k)) continue
      const cd: Dispose[] = []
      const ctx: AdoptCtx = { c: [], f: false, e: close, t: false }
      _mountDisposersStack.push(cd)
      try {
        _hydrateNode(
          lgrow(items[i], i),
          host,
          `${pathBase}.list.${String(k).replace(/\./g, '_')}`,
          cd,
          signalRegistry,
          pathMap,
          errorHandler,
          cursor,
          snapshot,
          ctx,
        )
      } finally {
        _mountDisposersStack.pop()
      }
      if (ctx.f || ctx.c.length === 0) {
        _unwind(cd)
        // A clean miss (nothing claimed) is a row the server did not render —
        // skip it; the reconcile effect's first run creates it in position.
        // A PARTIAL claim means the segment diverges mid-row: unwind
        // everything and replace the whole segment.
        if (ctx.c.length) return bail()
        continue
      }
      // Row anchor precedes the row's nodes — the layout `_reconcileEach`'s
      // reposition walk (`ref = anc.nextSibling`, anchor first) relies on.
      const ca = document.createComment('e')
      host.insertBefore(ca, ctx.c[0]!)
      const s: ChildScope = {
        anchor: ca,
        disposers: cd,
        appendedNodes: ctx.c,
        item: items[i],
        // "Never placed": the first reconcile run resolves real positions
        // cursor-style — zero moves when server and client order agree.
        pos: -1,
      }
      sc.set(k, s)
      rows.push(s)
      claimed.add(ca)
      order.push(ca)
      for (const n of ctx.c) {
        claimed.add(n)
        order.push(n)
      }
      if (ctx.t) sawText = true
    }
    // Sweep: remove server rows no client key claimed (they would otherwise
    // sit in the region as unowned ghost rows forever). While walking, verify
    // claim order against DOM order for segments that made positional text
    // claims — mispaired text cannot be repaired locally, so decline.
    let j = 0
    let n: globalThis.Node | null = open.nextSibling
    while (n && n !== close) {
      const nx: globalThis.Node | null = n.nextSibling
      if (!claimed.has(n)) host.removeChild(n)
      else if (sawText && order[j++] !== n) return bail()
      n = nx
    }
  }

  _wireStructural(node, open, disposers, pathBase, _mountEffect, errorHandler, st, sc)
  return end
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attach reactive effects from `component`'s arbor tree to pre-rendered
 * DOM nodes under `host` without re-creating elements.
 *
 * `snapshot` is the pre-parsed JSON state previously emitted by the server
 * (the `signals` record of the `__aihu_state__` envelope, or a
 * `MountScope.serialize()` result — same path-keyed shape; e.g. from
 * `window.__aihu_state__[tag]`). Every writable signal binding whose path
 * appears in it is PRE-SEEDED with the server value at first visit, before
 * its effect wires, so hydration adopts server state instead of re-deriving.
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
 * @param snapshot — pre-parsed state record from SSR (`window.__aihu_state__[tag]`).
 * @param options — optional `MountOptions` (e.g. `onError` handler).
 */
export function hydrate(
  component: () => Node,
  host: Element | ShadowRoot,
  snapshot: Snapshot,
  options?: MountOptions,
): ReturnType<typeof mount> {
  // Signal pre-seeding (wave 3): `snapshot` maps path keys (e.g. `0.text`,
  // `0.1.attr:class`) to server-side signal values. The walker seeds each
  // WRITABLE signal at first visit, before its effect is wired, so hydration
  // ADOPTS server state instead of re-deriving it. No registry shape change
  // was needed: the walker holds the `[read, write]` tuple itself at every
  // seeding site, so it writes through `sig[1]` directly. An empty snapshot
  // seeds nothing — byte-identical behavior to the pre-seeding walker.
  const errorHandler = options?.onError
  // Build path→element map inline (per spec §5: `data-aihu-path` anchors).
  //
  // Nested-render boundary: a server render wrapped in its own host element
  // carries `data-aihu-ssr` on that host (@aihu/server's `wrapTag` path) and
  // restarts its `data-aihu-path` keys at `_ROOT_PATH` — so a nested wrapped
  // render (e.g. the PAGE element sitting inside a LAYOUT's outlet marker)
  // duplicates the outer render's key space. Without pruning, the nested
  // render's root would OVERWRITE the outer root in the map ('0' → the page's
  // root instead of the layout's), mis-wiring effects and cascading into
  // mismatch-fallback materializes. An element whose nearest marked ancestor
  // is not this hydration's own host belongs to a nested render and is the
  // nested component's job to hydrate; skip it. Hosts without markers (plain
  // client-side hydrate calls, tests) resolve no boundary and keep the
  // original behavior exactly.
  const pathMap = new Map<string, Element>()
  const root = host as Element
  for (const el of root.querySelectorAll?.('[data-aihu-path]') ?? []) {
    // The boundary is the nearest marked PROPER ANCESTOR — start the search at
    // the parent, never at `el` itself.
    //
    // `closest()` matches the element it is called on, and a child host now
    // carries BOTH attributes: `data-aihu-path` (its position in the PARENT's
    // key space) and `data-aihu-ssr` (the marker for its own inner tree). It is
    // the first element in the codebase to carry both — `wrapTag`'s nested
    // hosts never got a path marker, which is why this went unnoticed.
    //
    // Matching on `el` made every SSR'd child host its own boundary, so it was
    // pruned from the parent's map, missed the `existingEl` lookup, and got
    // re-materialized as a DUPLICATE appended at the end of the host: the child
    // rendered twice, the second copy in the wrong place.
    //
    // Searching from the parent keeps the host in the map (its boundary
    // resolves to `root`), still prunes everything INSIDE it (their boundary
    // resolves to the host), and leaves the `wrapTag` case unchanged.
    const boundary = el === root ? null : el.parentElement?.closest?.('[data-aihu-ssr]')
    if (boundary != null && boundary !== root && root.contains(boundary)) continue
    const p = el.getAttribute('data-aihu-path')
    if (p != null) pathMap.set(p, el)
  }
  const hp = root.getAttribute?.('data-aihu-path')
  if (hp != null) pathMap.set(hp, root)

  if (typeof __DEV__ !== 'undefined' && __DEV__)
    _observeMount({ kind: 'mount-start', path: 'hydrate', timestamp: Date.now() })

  const disposers: Dispose[] = []
  const signalRegistry = new Map<string, () => unknown>()

  let node: Node
  try {
    node = component()
  } catch (err) {
    if (errorHandler) {
      // P3-1: same unowned rule as the wiring below — anything the handler
      // creates must not be adopted by a caller's scope.
      runWithoutScope(() => errorHandler(err, 'hydrate'))
      if (typeof __DEV__ !== 'undefined' && __DEV__)
        _observeMount({ kind: 'mount-end', path: 'hydrate', timestamp: Date.now() })
      return _makeScope(disposers, signalRegistry)
    }
    throw err
  }

  const pathBase = _ROOT_PATH

  // P0-2b (effect-scope plan §2): same unowned-bindings rule as mount() —
  // hydration wiring creates the same `_mountEffect` binding effects, so a
  // hydrate() re-entered while some component scope is current must not let
  // that scope adopt them (binding ownership is the MountScope, always).
  runWithoutScope(() =>
    _hydrateNode(
      node,
      host,
      pathBase,
      disposers,
      signalRegistry,
      pathMap,
      errorHandler,
      { i: 0 },
      snapshot ?? {},
      null,
    ),
  )

  if (typeof __DEV__ !== 'undefined' && __DEV__)
    _observeMount({ kind: 'mount-end', path: 'hydrate', timestamp: Date.now() })

  return _makeScope(disposers, signalRegistry)
}
