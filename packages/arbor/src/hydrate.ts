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
 *      c. On DOM mismatch (expected node not found at path): fall back to
 *         `_materialize()` for that subtree, appending newly-created nodes.
 *   3. Returns a `MountScope` over the wired disposers.
 *
 * Per spec §5 (Plan 3.2): no element re-creation on happy path —
 * `host.innerHTML` is unchanged (verified in tests).
 *
 * @module
 */

import { type Dispose, runWithoutScope } from '@aihu/signals'
import { _applyAttrs } from './attrs.ts'
import { _materialize } from './materialize.ts'
import { _makeScope, _mountDisposersStack, _mountEffect, type mount } from './mount.ts'
import { _observeMount } from './telemetry.ts'
import type { AttrMap, Branch, ErrorHandler, MountOptions, Node, Snapshot } from './types.ts'

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
): void {
  // Structural nodes (when/each) — #465 adopt-by-replace.
  //
  // SSR now renders structural content, delimited in hydratable output by
  // path-tagged comments: `<!--aihu:s:PATH-->` … `<!--aihu:/s:PATH-->` (the
  // `-`→`_` transform below matches `_commentPath` in @aihu/server's ssr.ts —
  // a wire-protocol pair like `_ROOT_PATH`). TRUE adoption (claiming the
  // server's nodes into the reconciler's ChildScopes without a rebuild) needs
  // reconciler integration and is future work; until then the server segment
  // is REMOVED and freshly materialized content takes its exact position.
  // That keeps the invariant that matters — content appears exactly once and
  // in order — where the old unconditional `_materialize` fallback would have
  // DUPLICATED every server-rendered structural subtree beside itself.
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
    while (frag.firstChild) host.insertBefore(frag.firstChild, insertRef)

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
      if (cns0[i]!.nodeType === 3 /* Node.TEXT_NODE */) {
        textNode = cns0[i] as Text
        textCursor.i = i + 1
        break
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
      )
    }
    return
  }

  // Branch node — all leaf/structural kinds returned above. Attr seeding
  // happens before the lookup so even a mismatch-fallback materialize
  // renders from server values.
  _seedAttrs(snapshot, pathBase, (node as Branch).attrs)
  const existingEl = pathMap.get(pathBase)

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
    )
  }
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
  const pathMap = new Map<string, Element>()
  const root = host as Element
  for (const el of root.querySelectorAll?.('[data-aihu-path]') ?? []) {
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
    ),
  )

  if (typeof __DEV__ !== 'undefined' && __DEV__)
    _observeMount({ kind: 'mount-end', path: 'hydrate', timestamp: Date.now() })

  return _makeScope(disposers, signalRegistry)
}
