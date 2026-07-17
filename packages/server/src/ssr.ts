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
 * hydratable output only — static SSR never hydrates, so the extra bytes would
 * be dead weight.
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

function _renderNode(node: unknown, path: string, hydratable: boolean): string {
  if (typeof node !== 'object' || node === null) return ''
  const obj = node as Record<string, unknown>
  if (!('kind' in obj)) return ''

  if (obj.kind === 'leaf') {
    return renderLeaf(obj)
  }

  if (obj.kind === 'branch') {
    const tag = typeof obj.tag === 'string' ? obj.tag : 'div'
    let attrStr = serializeAttrs(asAttrMap(obj.attrs))
    if (hydratable) attrStr += ` data-aihu-path="${escapeAttr(path)}"`
    const children = Array.isArray(obj.children) ? obj.children : []
    let inner = ''
    for (let i = 0; i < children.length; i++) {
      inner += _textBoundaryBefore(children, i, hydratable)
      inner += _renderNode(children[i], `${path}.${i}`, hydratable)
    }
    return `<${tag}${attrStr}>${inner}</${tag}>`
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
      renderNodeAsync(root, '0', opts?.hydratable ?? false, controller, pendingState)
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
