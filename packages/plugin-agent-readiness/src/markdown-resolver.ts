import { getAllAgentMetadata } from '@aihu/agent'
import type { MarkdownResolver } from './content-negotiation.ts'
import { type ComponentMetaLike, renderComponentMarkdown } from './llms-txt.ts'

/**
 * A route's agent-facing declaration: the same source that builds the UI,
 * projected into the shape an agent asked for.
 *
 * This is deliberately NOT a rendered-HTML mirror. Thesis §1: "Derivation
 * produces different shapes from one source — not one shape rendered twice.
 * An agent surface that is merely the UI re-serialized has failed this
 * property, not satisfied it."
 */
export interface RouteMarkdownEntry {
  /** URL path this entry answers for, e.g. `/about`. Leading slash required. */
  readonly path: string
  /** Derived from the route's `@route { head }` title. */
  readonly title?: string
  /** Derived from the route's `@route { head }` description/meta. */
  readonly description?: string
  /** Primary prose content for the route, already markdown. */
  readonly body?: string
  /**
   * Tags of the agent-annotated components mounted on this route. Each is
   * expanded from the live registry into its callable actions and readable
   * state — a surface that NEVER appears in the rendered HTML, and therefore
   * cannot be recovered by any HTML→markdown converter.
   */
  readonly components?: ReadonlyArray<string>
}

export interface RouteMarkdownResolverOptions {
  readonly routes: ReadonlyArray<RouteMarkdownEntry>
  /** Site name, used as the document title when a route declares none. */
  readonly siteName?: string
  /**
   * Component-registry reader. Defaults to `getAllAgentMetadata` from
   * `@aihu/agent`. Injectable so the resolver stays testable without a
   * populated global registry.
   */
  readonly readComponents?: () => ReadonlyArray<ComponentMetaLike>
}

/**
 * Normalize a request path to a route key.
 *
 * Returns null for anything suspicious. Per the `MarkdownResolver` contract,
 * implementations must sanitize before use; this resolver never touches a
 * filesystem, but the guard is kept so the invariant holds if a subclass or
 * a future caller ever does.
 */
function normalizePath(path: string): string | null {
  if (path.includes('\0') || path.includes('..')) return null
  if (!path.startsWith('/')) return null
  // `/about.md` and `/about` address the same route.
  let key = path.endsWith('.md') ? path.slice(0, -3) : path
  // Collapse a trailing slash, except for the root.
  if (key.length > 1 && key.endsWith('/')) key = key.slice(0, -1)
  return key === '' ? '/' : key
}

/**
 * The production `MarkdownResolver`: projects route declarations plus the
 * agent-component registry into markdown.
 *
 * Edge-safe — no filesystem, no `node:` imports. Runs unchanged on Workers.
 */
export class RouteMarkdownResolver implements MarkdownResolver {
  readonly #routes: ReadonlyMap<string, RouteMarkdownEntry>
  readonly #siteName: string | undefined
  readonly #readComponents: () => ReadonlyArray<ComponentMetaLike>

  constructor(options: RouteMarkdownResolverOptions) {
    const entries = new Map<string, RouteMarkdownEntry>()
    for (const route of options.routes) {
      const key = normalizePath(route.path)
      if (key !== null) entries.set(key, route)
    }
    this.#routes = entries
    this.#siteName = options.siteName
    this.#readComponents = options.readComponents ?? getAllAgentMetadata
  }

  /** Route keys this resolver can answer for. Useful for build-time emission. */
  get paths(): ReadonlyArray<string> {
    return [...this.#routes.keys()]
  }

  async resolve(path: string): Promise<string | null> {
    try {
      const key = normalizePath(path)
      if (key === null) return null
      const route = this.#routes.get(key)
      if (route === undefined) return null
      return this.#render(route)
    } catch {
      // Contract: never throw — return null and let the HTML path serve.
      return null
    }
  }

  #render(route: RouteMarkdownEntry): string {
    const lines: string[] = []
    const title = route.title ?? this.#siteName ?? route.path
    lines.push(`# ${title}`, '')

    if (route.description) lines.push(`> ${route.description}`, '')
    if (route.body) lines.push(route.body.trim(), '')

    const wanted = route.components ?? []
    if (wanted.length > 0) {
      const registry = new Map(this.#readComponents().map((m) => [m.tag, m]))
      const present = wanted.flatMap((tag) => {
        const meta = registry.get(tag)
        return meta ? [meta] : []
      })
      if (present.length > 0) {
        lines.push(
          '## Interactive capabilities',
          '',
          'Callable by agents on this page. Declared in source, never present in the',
          'rendered HTML — an HTML→markdown conversion cannot recover this section.',
          '',
        )
        for (const meta of present) lines.push(...renderComponentMarkdown(meta), '')
      }
    }

    return lines.join('\n').trimEnd()
  }
}

/**
 * Factory form of {@link RouteMarkdownResolver}, for callers that prefer not
 * to use `new`.
 */
export function createRouteMarkdownResolver(
  options: RouteMarkdownResolverOptions,
): MarkdownResolver {
  return new RouteMarkdownResolver(options)
}
