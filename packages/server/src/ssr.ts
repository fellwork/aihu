/// <reference lib="dom" />
/**
 * CRITICAL CONSTRAINTS:
 * 1. Zero client runtime imports. Zero DOM globals (no window, document, HTMLElement).
 * 2. Runs in: Workers, Deno, Bun, Node ESM.
 * 3. NEVER import @aihu/context at module level — use injection slots (_setContextFns).
 *
 * The `SsrOptions.serializer` field accepts an injected serialize function.
 * In v0 the arbor stub always throws; the spec path is wired for sub-project #6.
 */

import type { StreamOptions } from './stream-types.ts'

// ---------------------------------------------------------------------------
// Context injection slots (hard-boundary: @aihu/context is never imported here).
// The caller populates these once at app startup via _setContextFns().
// ---------------------------------------------------------------------------
let _setContextMap: ((map: Map<symbol, unknown>) => void) | undefined
let _clearContextMap: (() => void) | undefined

/**
 * Inject context activation/deactivation functions from @aihu/context/ssr.
 * Must be called once at app startup before any renderToString calls that use
 * SsrOptions.contextSetup.
 *
 * Example:
 *   import { setSsrContextMap, clearSsrContextMap } from '@aihu/context/ssr'
 *   import { _setContextFns } from '@aihu/server'
 *   _setContextFns(setSsrContextMap, clearSsrContextMap)
 */
export function _setContextFns(set: (map: Map<symbol, unknown>) => void, clear: () => void): void {
  _setContextMap = set
  _clearContextMap = clear
}

export interface MetaTag {
  readonly name?: string
  readonly property?: string
  readonly content: string
  readonly [attr: string]: string | undefined
}

export interface LinkTag {
  readonly rel: string
  readonly href: string
  readonly [attr: string]: string | undefined
}

/**
 * A `<script>` element in the document head. Used for structured-data blocks
 * such as JSON-LD (`type="application/ld+json"`). `content` is emitted verbatim
 * as the script body and is NOT HTML-attribute-escaped (it is element text, not
 * an attribute); callers are responsible for ensuring it contains no literal
 * `</script>` sequence (the SEO mapper guards this via `</` escaping).
 */
export interface ScriptTag {
  readonly type: string
  readonly content: string
}

export interface HeadConfig {
  readonly title?: string
  readonly meta?: ReadonlyArray<MetaTag>
  readonly links?: ReadonlyArray<LinkTag>
  readonly lang?: string
  /**
   * Inline `<script>` elements (e.g. JSON-LD structured data). Backward
   * compatible: omitted means no script tags are emitted, matching prior
   * `buildHead` behavior.
   */
  readonly scripts?: ReadonlyArray<ScriptTag>
}

export interface SsrOptions {
  /**
   * When provided: output is a full HTML document.
   * When absent: output is the component's inner HTML fragment only.
   */
  readonly head?: HeadConfig

  /**
   * When true: rendered HTML includes hydration markers as data attributes.
   * Default: false.
   */
  readonly hydratable?: boolean

  /**
   * Injected serializer from an arbor MountScope.
   * When it throws (v0 stub), the error is swallowed and no state script is emitted.
   */
  readonly serializer?: () => Record<string, unknown>

  /**
   * Optional per-render context setup hook. When provided alongside a prior call
   * to _setContextFns, ssr.ts will:
   *   1. Call contextSetup(activateFn, deactivateFn) so the caller can do
   *      per-request setup (e.g. pre-populate the context map).
   *   2. Activate a fresh context Map before the tree walk.
   *   3. Clear it in a finally block after the walk.
   *
   * ssr.ts never imports @aihu/context — the hard boundary is preserved.
   * The activate/deactivate functions are wired via _setContextFns at startup.
   *
   * Minimal usage:
   *   import { setSsrContextMap, clearSsrContextMap } from '@aihu/context/ssr'
   *   import { _setContextFns, renderToString } from '@aihu/server'
   *   _setContextFns(setSsrContextMap, clearSsrContextMap)
   *   await renderToString(component, { contextSetup: () => {} })
   */
  readonly contextSetup?: (
    activate: (map: Map<symbol, unknown>) => void,
    deactivate: () => void,
  ) => void

  /**
   * GX Phase 4 (#466) — the P5/I2s guard: mark this render as a GOVERNED
   * tree. Governed trees are never streamed — encountering a `pending`
   * `dataSource` boundary in a governed render is refused fail-closed
   * (`GOVERNED_UNGATED` posture, 40-spec §10) rather than suspended, because
   * a streamed governed subtree would be an emission path the generated
   * loader never gated. Set by the router's governed `handle` path.
   */
  readonly governed?: boolean
}

/**
 * Accepts:
 * 1. `() => unknown` — factory returning an arbor Branch | Leaf.
 * 2. `{ toHtml(): string }` — direct HTML provider (escape hatch).
 */
export type ComponentDescription = (() => unknown) | { toHtml(): string }

function escapeAttr(val: string): string {
  return val.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/** Escape element text content (NOT attributes): &, <, > → entities. */
function escapeText(val: string): string {
  return val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Read an arbor text-leaf `value`. Per the arbor leaf shape (leaf.ts), a static
 * leaf carries the string directly; a reactive leaf carries a `[read, write]`
 * Signal tuple (discriminated by `Array.isArray`). SSR reads the current value.
 */
function leafText(value: unknown): string {
  if (Array.isArray(value)) {
    const get = value[0]
    return typeof get === 'function' ? String((get as () => unknown)()) : ''
  }
  return value == null ? '' : String(value)
}

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

/** Serialize a branch/leaf attr map to ` k="v"` / boolean-attr form. */
function serializeAttrs(attrs: Record<string, string | boolean>): string {
  let out = ''
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) out += ` ${k}`
    else if (v !== false && v !== undefined) out += ` ${k}="${escapeAttr(String(v))}"`
  }
  return out
}

function asAttrMap(v: unknown): Record<string, string | boolean> {
  return typeof v === 'object' && v !== null ? (v as Record<string, string | boolean>) : {}
}

/**
 * Render an arbor leaf to HTML. A text leaf (`leafKind: 'text'`) renders its
 * escaped `value`; an element leaf (`leafKind: 'element'`) renders `<tag attrs>`
 * (void) or `<tag attrs></tag>`. Previously this read a nonexistent `obj.text`
 * field, so all leaf content was dropped (fellwork FEL-224).
 */
function renderLeaf(obj: Record<string, unknown>): string {
  if (obj.leafKind === 'element') {
    const tag = typeof obj.tag === 'string' ? obj.tag : 'span'
    const a = serializeAttrs(asAttrMap(obj.attrs))
    return VOID_ELEMENTS.has(tag) ? `<${tag}${a}>` : `<${tag}${a}></${tag}>`
  }
  return escapeText(leafText(obj.value))
}

/**
 * Boundary comment emitted between two adjacent text-leaf children. Two bare
 * text leaves rendered back-to-back (e.g. `{a} {b}` → `a`,` `,`b`) parse into a
 * SINGLE DOM Text node, which misaligns the hydration walker's per-host text
 * cursor (it claims one node per text leaf; see `arbor/src/hydrate.ts`). An
 * interleaved comment keeps them as separate Text nodes and is skipped by the
 * walker, so it is invisible to both render and hydrate. Only element/branch
 * children wrap in tags, so only text-leaf pairs need this. Emitted in
 * hydratable output only.
 *
 * "Hydratable output only" is a narrower claim than it used to make. This
 * comment previously justified the gate with "static SSR never hydrates, so the
 * extra bytes would be dead weight" — true only of output that is genuinely
 * terminal (a feed, an email body, a snapshot for an extractor). It was NOT
 * true of the two callers that dominate real traffic: `@aihu/router`'s SSR
 * handler and `@aihu/app`'s SSG prerenderer both produce HTML that a live SPA
 * hydrates into, and both formerly called `renderToString(...)` with no options
 * and therefore shipped markerless HTML. That is fixed at those call sites; the
 * gate itself is correct and stays. The lesson it encodes: `hydratable` is a
 * property of the DESTINATION, not of the renderer, so it must be explicit at
 * every call site rather than defaulted from what "SSR" seems to imply.
 */
const TEXT_LEAF_BOUNDARY = '<!--|-->'

/** A text leaf renders bare text (no tag/comment wrapper), so two adjacent ones coalesce. */
function _isTextLeaf(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) return false
  const o = node as Record<string, unknown>
  return o.kind === 'leaf' && o.leafKind !== 'element'
}

/** The boundary to emit before `children[i]` (empty unless it and its predecessor are both text leaves). */
function _textBoundaryBefore(children: unknown[], i: number, hydratable: boolean): string {
  return hydratable && i > 0 && _isTextLeaf(children[i - 1]) && _isTextLeaf(children[i])
    ? TEXT_LEAF_BOUNDARY
    : ''
}

/**
 * The root path key seeded into the `data-aihu-path` walk.
 *
 * A WIRE-PROTOCOL constant shared with two other implementations of the same
 * scheme: the client walker (`@aihu/arbor`'s `hydrate.ts`, `_ROOT_PATH`) and
 * the Rust renderer (`src-native/src/render.rs`, asserted in its `data-aihu-path="0"`
 * test). It is a fixed literal rather than a counter because the server renders
 * from a long-lived process and the client starts fresh each page load — no
 * counter can agree across that split. If this diverges from the client's root,
 * every branch lookup misses and hydration silently rebuilds the tree beside the
 * server's DOM instead of adopting it (no error is thrown; content duplicates).
 *
 * Not imported from `@aihu/arbor`: that is the client runtime and pulling it in
 * here would be a server-bundle leak. Agreement is enforced behaviorally by
 * `tests/integration/ssr-hydrate-path-parity.test.ts` and
 * `scripts/check-hydration-adoption.ts`, which is stronger than a shared import
 * anyway — a shared TS constant could not cover the Rust implementation at all.
 */
const ROOT_PATH = '0'

// ---------------------------------------------------------------------------
// #465 — the structural walk. `when()`/`each()` nodes (the compiled output of
// `{#if}`/`{#each}` and the upcoming attribute grammar) carry their branches
// as closures and their conditions/collections as Signal-shaped values; both
// are synchronously readable server-side, so SSR renders the ACTIVE branch.
// ---------------------------------------------------------------------------

/**
 * Read a structural condition's current boolean value.
 *
 * Accepted shapes (all observed in compiled output / arbor's contract):
 *   - `[read, write]` Signal tuple or `[() => expr]` thunk-array — the
 *     compiler's `createIfBoundary` forms; read via `cond[0]()`, exactly the
 *     client reconciler's read (`_reconcileWhen` in arbor/structural.ts).
 *   - a plain closure `() => boolean` — hand-built trees.
 *   - anything else — coerced with Boolean (fail-safe: no content).
 */
function _condTruthy(cond: unknown): boolean {
  if (Array.isArray(cond)) {
    const get = cond[0]
    return typeof get === 'function' ? Boolean((get as () => unknown)()) : Boolean(get)
  }
  return typeof cond === 'function' ? Boolean((cond as () => unknown)()) : Boolean(cond)
}

/**
 * Read a structural list's current items. Same shape latitude as
 * `_condTruthy`: Signal tuple / thunk-array (`list[0]()` — the client
 * reconciler's read in `_reconcileEach`), plain closure, or a plain array.
 * Non-array reads render as empty (fail-safe).
 */
function _listItems(list: unknown): unknown[] {
  let items: unknown = list
  if (Array.isArray(list) && typeof list[0] === 'function') {
    items = (list[0] as () => unknown)()
  } else if (typeof list === 'function') {
    items = (list as () => unknown)()
  }
  return Array.isArray(items) ? items : []
}

/**
 * The subtrees a structural node contributes to the render, with the path
 * each subtree continues under. Paths MIRROR the client materializer
 * (`arbor/src/structural.ts`) so `data-aihu-path` markers inside structural
 * content address the key space the hydration walker asks for:
 *   - conditional (true):  `${path}.conditional.true`
 *   - list item (key k):   `${path}.list.${String(k).replace(/\./g, '_')}`
 * A false conditional or an empty collection contributes nothing — the
 * compiler lowers `{:else}` / `{:empty}` arms to sibling `when()` nodes with
 * negated conditions, so every authored branch is its own conditional here.
 */
function _structuralSubtrees(
  obj: Record<string, unknown>,
  path: string,
): Array<{ node: unknown; path: string }> {
  if (obj.structuralKind === 'conditional') {
    const grow = obj.grow
    if (typeof grow !== 'function' || !_condTruthy(obj.condition)) return []
    return [{ node: (grow as () => unknown)(), path: `${path}.conditional.true` }]
  }
  if (obj.structuralKind === 'list') {
    const grow = obj.listGrow
    if (typeof grow !== 'function') return []
    const items = _listItems(obj.list)
    const keyFn = typeof obj.keyFn === 'function' ? (obj.keyFn as (i: unknown) => unknown) : null
    const out: Array<{ node: unknown; path: string }> = []
    for (let i = 0; i < items.length; i++) {
      const key = String(keyFn ? keyFn(items[i]) : i).replace(/\./g, '_')
      out.push({
        node: (grow as (i: unknown, idx: number) => unknown)(items[i], i),
        path: `${path}.list.${key}`,
      })
    }
    return out
  }
  return []
}

/**
 * Comment-safe form of a path for the structural delimiters below: `-` → `_`
 * so no `--` sequence can terminate the comment early (list keys are
 * arbitrary strings — slugs with hyphens are routine). The client walker
 * (`arbor/src/hydrate.ts`) applies the SAME transform when computing the
 * marker it looks for; the two must never diverge.
 */
function _commentPath(path: string): string {
  return path.replace(/-/g, '_')
}

/**
 * Structural delimiters emitted around a structural node's output in
 * HYDRATABLE renders only: `<!--aihu:s:PATH-->` … `<!--aihu:/s:PATH-->`.
 * They serve two roles:
 *   1. The client walker locates the server-rendered structural segment by
 *      exact path match and REPLACES it in position (adopt-by-replace — see
 *      the structural case in `arbor/src/hydrate.ts`), so hydration never
 *      duplicates content beside the server's DOM.
 *   2. As comments they keep a text leaf before the structural node and one
 *      after it from coalescing into a single DOM Text node (the same
 *      cursor-alignment concern `TEXT_LEAF_BOUNDARY` covers).
 * Like `data-aihu-path`, they are destination properties: terminal
 * (non-hydratable) output carries no markers and no extra bytes.
 */
function _structuralMarkers(path: string, hydratable: boolean): { open: string; close: string } {
  if (!hydratable) return { open: '', close: '' }
  const p = _commentPath(path)
  return { open: `<!--aihu:s:${p}-->`, close: `<!--aihu:/s:${p}-->` }
}

/** A branch with a `null` or `''` tag is a FRAGMENT: no wrapper element, no
 * path marker of its own; children continue at `${path}.${i}` in the same
 * host — mirroring `_materialize` case 4 (`arbor/src/materialize.ts`). The
 * compiler emits `branch('', …)` for `{#if}`/`{#each}` bodies, so structural
 * SSR is impossible without this case; previously a null tag rendered a
 * spurious `<div>` wrapper the client never creates. */
function _isFragment(obj: Record<string, unknown>): boolean {
  return obj.tag === null || obj.tag === ''
}

function _renderNode(node: unknown, path: string, hydratable: boolean): string {
  if (typeof node !== 'object' || node === null) return ''
  const obj = node as Record<string, unknown>
  if (!('kind' in obj)) return ''

  if (obj.kind === 'leaf') {
    return renderLeaf(obj)
  }

  if (obj.kind === 'branch') {
    const children = Array.isArray(obj.children) ? obj.children : []
    let inner = ''
    for (let i = 0; i < children.length; i++) {
      inner += _textBoundaryBefore(children, i, hydratable)
      inner += _renderNode(children[i], `${path}.${i}`, hydratable)
    }
    if (_isFragment(obj)) return inner
    const tag = typeof obj.tag === 'string' ? obj.tag : 'div'
    let attrStr = serializeAttrs(asAttrMap(obj.attrs))
    if (hydratable) attrStr += ` data-aihu-path="${escapeAttr(path)}"`
    return `<${tag}${attrStr}>${inner}</${tag}>`
  }

  if (obj.kind === 'structural') {
    const { open, close } = _structuralMarkers(path, hydratable)
    let inner = ''
    for (const sub of _structuralSubtrees(obj, path)) {
      inner += _renderNode(sub.node, sub.path, hydratable)
    }
    return open + inner + close
  }

  return ''
}

function buildHead(head: HeadConfig): string {
  const parts: string[] = []
  if (head.title) parts.push(`<title>${head.title}</title>`)
  for (const meta of head.meta ?? []) {
    const attrs = Object.entries(meta)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}="${escapeAttr(v as string)}"`)
      .join(' ')
    parts.push(`<meta ${attrs}>`)
  }
  for (const link of head.links ?? []) {
    const attrs = Object.entries(link)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}="${escapeAttr(v as string)}"`)
      .join(' ')
    parts.push(`<link ${attrs}>`)
  }
  for (const script of head.scripts ?? []) {
    // The script body is element text (not an attribute), so it is emitted
    // verbatim. We only neutralize a literal `</` so an injected `</script>`
    // cannot break out of the element — matching the HTML spec guidance for
    // inlining JSON in <script>.
    const body = script.content.replace(/<\//g, '<\\/')
    parts.push(`<script type="${escapeAttr(script.type)}">${body}</script>`)
  }
  return parts.join('')
}

// ---------------------------------------------------------------------------
// Internal async tree-walker for renderToStream
// ---------------------------------------------------------------------------

async function renderNodeAsync(
  node: unknown,
  path: string,
  hydratable: boolean,
  controller: ReadableStreamDefaultController<string>,
  pendingState: { count: number; walkDone: boolean; opts: StreamOptions | undefined },
): Promise<void> {
  if (typeof node !== 'object' || node === null) {
    controller.enqueue('')
    return
  }
  const obj = node as Record<string, unknown>
  if (!('kind' in obj)) {
    controller.enqueue('')
    return
  }

  if (obj.kind === 'leaf') {
    controller.enqueue(renderLeaf(obj))
    return
  }

  if (obj.kind === 'structural') {
    // #465 — structural nodes render their active branch. Children recurse
    // through THIS walker, so a `dataSource` boundary inside a structural
    // subtree keeps its semantics — including the P5/I2s governed refusal on
    // `pending` (a governed structural render still never streams).
    const { open, close } = _structuralMarkers(path, hydratable)
    if (open) controller.enqueue(open)
    for (const sub of _structuralSubtrees(obj, path)) {
      await renderNodeAsync(sub.node, sub.path, hydratable, controller, pendingState)
    }
    if (close) controller.enqueue(close)
    return
  }

  if (obj.kind === 'branch' && _isFragment(obj)) {
    // Fragment (null/'' tag): no wrapper, no path marker, no dataSource
    // boundary of its own — children continue at `${path}.${i}` directly,
    // mirroring `_materialize` case 4 in arbor.
    const children = Array.isArray(obj.children) ? obj.children : []
    for (let i = 0; i < children.length; i++) {
      const b = _textBoundaryBefore(children, i, hydratable)
      if (b) controller.enqueue(b)
      await renderNodeAsync(children[i], `${path}.${i}`, hydratable, controller, pendingState)
    }
    return
  }

  if (obj.kind === 'branch') {
    const tag = typeof obj.tag === 'string' ? obj.tag : 'div'
    let attrStr = serializeAttrs(asAttrMap(obj.attrs))
    if (hydratable) attrStr += ` data-aihu-path="${escapeAttr(path)}"`

    const children = Array.isArray(obj.children) ? obj.children : []

    // Check for DataSource boundary (duck-type check — no arbor type changes needed)
    const dataSource = obj.dataSource as
      | {
          status: 'pending' | 'ready' | 'error'
          value?: unknown
          error?: unknown
          onReady(cb: () => void): () => void
        }
      | undefined

    if (!dataSource || typeof dataSource !== 'object') {
      // Synchronous branch — no async boundary
      controller.enqueue(`<${tag}${attrStr}>`)
      for (let i = 0; i < children.length; i++) {
        const b = _textBoundaryBefore(children, i, hydratable)
        if (b) controller.enqueue(b)
        await renderNodeAsync(children[i], `${path}.${i}`, hydratable, controller, pendingState)
      }
      controller.enqueue(`</${tag}>`)
      return
    }

    // Async boundary handling
    controller.enqueue(`<${tag}${attrStr}>`)

    if (dataSource.status === 'error') {
      controller.error(dataSource.error)
      return
    }

    if (dataSource.status === 'ready') {
      // Already resolved — render children synchronously (no suspension)
      for (let i = 0; i < children.length; i++) {
        const b = _textBoundaryBefore(children, i, hydratable)
        if (b) controller.enqueue(b)
        await renderNodeAsync(children[i], `${path}.${i}`, hydratable, controller, pendingState)
      }
      controller.enqueue(`</${tag}>`)
      return
    }

    // GX Phase 4 (#466) — P5/I2s guard: a governed tree must not stream. A
    // `pending` dataSource here would suspend-and-emit governed content
    // outside the generated loader's gate, so it is refused fail-closed (the
    // GOVERNED_UNGATED posture, 40-spec §10) instead of registered.
    if (pendingState.opts?.governed) {
      controller.error(
        new Error(
          "GOVERNED_UNGATED: governed trees are not streamed — a 'pending' dataSource " +
            'inside a governed render is refused (fail-closed)',
        ),
      )
      return
    }

    // status === 'pending' — register callback and increment pending counter
    pendingState.count++

    dataSource.onReady(async () => {
      try {
        if (dataSource.status === 'error') {
          controller.error(dataSource.error)
          return
        }
        for (let i = 0; i < children.length; i++) {
          const b = _textBoundaryBefore(children, i, hydratable)
          if (b) controller.enqueue(b)
          await renderNodeAsync(children[i], `${path}.${i}`, hydratable, controller, pendingState)
        }
        controller.enqueue(`</${tag}>`)
        pendingState.count--
        if (pendingState.count === 0 && pendingState.walkDone) {
          emitStateScriptAndClose(controller, pendingState.opts)
        }
      } catch (err) {
        controller.error(err)
      }
    })

    // Return from renderNodeAsync — the synchronous walk continues past this boundary.
    return
  }

  // Unknown kind
  controller.enqueue('')
}

function emitStateScriptAndClose(
  controller: ReadableStreamDefaultController<string>,
  opts: StreamOptions | undefined,
): void {
  if (opts?.serializer) {
    try {
      const state = opts.serializer()
      controller.enqueue(
        `<script type="application/json" id="__aihu_state__">${JSON.stringify(state)}</script>`,
      )
    } catch {
      // swallow — no state script emitted
    }
  }
  if (opts?.head) {
    controller.enqueue('</body></html>')
  }
  controller.close()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderToStream(
  component: ComponentDescription,
  opts?: StreamOptions,
): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      const pendingState = { count: 0, walkDone: false, opts }

      // Step 1: Emit document preamble if opts.head is set
      if (opts?.head) {
        const headHtml = buildHead(opts.head)
        const lang = opts.head.lang ? ` lang="${escapeAttr(opts.head.lang)}"` : ''
        controller.enqueue(`<!DOCTYPE html><html${lang}><head>${headHtml}</head><body>`)
      }

      // Step 2: Resolve component
      if (typeof component !== 'function') {
        // { toHtml() } provider — no async boundaries possible
        let html: string
        try {
          html = component.toHtml()
        } catch (err) {
          controller.error(err)
          return
        }
        controller.enqueue(html)
        emitStateScriptAndClose(controller, opts)
        return
      }

      // Factory (function) — may produce async boundaries
      let root: unknown
      try {
        root = component()
      } catch (err) {
        controller.error(err)
        return
      }

      // Kick off async tree walk
      renderNodeAsync(root, ROOT_PATH, opts?.hydratable ?? false, controller, pendingState)
        .then(() => {
          pendingState.walkDone = true
          if (pendingState.count === 0) {
            emitStateScriptAndClose(controller, opts)
          }
        })
        .catch((err: unknown) => {
          controller.error(err)
        })
    },
  })
}

export async function renderToString(
  component: ComponentDescription,
  opts?: SsrOptions,
): Promise<string> {
  // Context setup: if configured, activate a fresh map before the render walk
  // and clear it unconditionally in the finally block.
  const hasContext = Boolean(opts?.contextSetup && _setContextMap && _clearContextMap)
  if (hasContext && opts?.contextSetup) {
    opts.contextSetup(_setContextMap!, _clearContextMap!)
    _setContextMap?.(new Map<symbol, unknown>())
  }

  try {
    const stream = renderToStream(component, opts)
    const reader = stream.getReader()
    const chunks: string[] = []
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
    return chunks.join('')
  } finally {
    if (hasContext) {
      _clearContextMap?.()
    }
  }
}
