/**
 * CRITICAL CONSTRAINTS:
 * 1. Zero client runtime imports. Zero DOM globals (no window, document, HTMLElement).
 * 2. Runs in: Workers, Deno, Bun, Node ESM.
 *
 * The `SsrOptions.serializer` field accepts an injected serialize function.
 * In v0 the arbor stub always throws; the spec path is wired for sub-project #6.
 */

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

export interface HeadConfig {
  readonly title?: string
  readonly meta?: ReadonlyArray<MetaTag>
  readonly links?: ReadonlyArray<LinkTag>
  readonly lang?: string
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
}

/**
 * Accepts:
 * 1. `() => unknown` — factory returning an arbor Branch | Leaf.
 * 2. `{ toHtml(): string }` — direct HTML provider (escape hatch).
 */
export type ComponentDescription =
  | (() => unknown)
  | { toHtml(): string }

function escapeAttr(val: string): string {
  return val.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function renderNode(node: unknown, path: string, hydratable: boolean): string {
  if (typeof node !== 'object' || node === null) return ''
  const obj = node as Record<string, unknown>
  if (!('kind' in obj)) return ''

  if (obj.kind === 'leaf') {
    const text = typeof obj.text === 'string' ? obj.text : ''
    return text
  }

  if (obj.kind === 'branch') {
    const tag = typeof obj.tag === 'string' ? obj.tag : 'div'
    const attrs = typeof obj.attrs === 'object' && obj.attrs !== null
      ? obj.attrs as Record<string, string | boolean>
      : {}
    let attrStr = ''
    for (const [k, v] of Object.entries(attrs)) {
      if (v === true) attrStr += ` ${k}`
      else if (v !== false && v !== undefined) attrStr += ` ${k}="${escapeAttr(String(v))}"`
    }
    if (hydratable) attrStr += ` data-scribe-path="${escapeAttr(path)}"`
    const children = Array.isArray(obj.children) ? obj.children : []
    const inner = children.map((c, i) => renderNode(c, `${path}.${i}`, hydratable)).join('')
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
  return parts.join('')
}

export async function renderToString(
  component: ComponentDescription,
  opts?: SsrOptions,
): Promise<string> {
  const hydratable = opts?.hydratable ?? false
  let content: string

  if (typeof component === 'function') {
    const result = component()
    content = renderNode(result, '0', hydratable)
  } else {
    content = component.toHtml()
  }

  let stateScript = ''
  if (opts?.serializer) {
    try {
      const state = opts.serializer()
      stateScript = `<script type="application/json" id="__scribe_state__">${JSON.stringify(state)}</script>`
    } catch {
      // swallow — no state script emitted
    }
  }

  if (opts?.head) {
    const headHtml = buildHead(opts.head)
    return `<!DOCTYPE html><html${opts.head.lang ? ` lang="${escapeAttr(opts.head.lang)}"` : ''}><head>${headHtml}</head><body>${content}${stateScript}</body></html>`
  }

  return content
}
