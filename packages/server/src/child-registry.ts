/**
 * Build the `SsrOptions.children` registry — the caller-side half of SSR child
 * component resolution (`docs/plans/2026-08-05-ssr-child-components.md`, step 5).
 *
 * The renderers take a pre-resolved `ReadonlyMap<tag, module>` and never load
 * anything themselves: module loading is async while the compiled fast path is
 * synchronous, so resolution has to happen before a render begins. This is
 * where it happens, and where a cyclic component graph is rejected.
 *
 * Deliberately loader-agnostic. SSG hands it a Vite `ssrLoadModule` walk over
 * discovered `.aihu` files; a Workers build hands it a generated tag→module
 * manifest. Neither concern belongs in `@aihu/server`, so both stay on the
 * caller's side of a two-line interface.
 */

import type { SsrChildModule } from '@aihu/runtime/ssr'

/**
 * A component module as the registry sees it: whatever `__aihu_schild` needs,
 * plus the child-tag set that drives the walk.
 */
export interface ChildModuleLike extends SsrChildModule {
  /** `__aihu_child_tags__` — every component tag this module's template references. */
  readonly __aihu_child_tags__?: ReadonlyArray<string>
}

/** One discovered component: the tag it registers under, and its module. */
export interface DiscoveredComponent {
  readonly tag: string
  readonly module: ChildModuleLike
}

/**
 * Thrown when the component graph contains a cycle.
 *
 * Loud and at BUILD time on purpose. Render-time recursion is already bounded
 * (`__aihu_schild`'s depth cap), so a cycle would not hang a prerender — it
 * would quietly emit 32 nested copies of the same subtree and ship it. A build
 * that fails with the cycle spelled out is strictly better than markup nobody
 * inspects.
 */
export class ChildCycleError extends Error {
  readonly cycle: ReadonlyArray<string>
  constructor(cycle: ReadonlyArray<string>) {
    super(
      `[@aihu/server] component reference cycle: ${cycle.join(' → ')}. ` +
        `A component cannot render itself, directly or transitively — server rendering ` +
        `would nest it until the depth cap and ship the result.`,
    )
    this.name = 'ChildCycleError'
    this.cycle = cycle
  }
}

/**
 * Index discovered components by tag, after verifying the graph is acyclic.
 *
 * `components` is every component the caller found — the whole set, not a
 * per-page subset. Indexing everything once beats walking `__aihu_child_tags__`
 * transitively per render: the walk's only advantage is loading fewer modules,
 * and the caller has already loaded them to read their tags. The child-tag sets
 * still earn their keep here as the edges of the cycle check.
 *
 * A tag claimed twice is a real conflict — two modules cannot both register it,
 * and the client's `customElements.define` would throw on the second. Reported
 * rather than silently last-wins.
 */
export function buildChildRegistry(
  components: Iterable<DiscoveredComponent>,
  onWarn?: (message: string) => void,
): ReadonlyMap<string, ChildModuleLike> {
  const registry = new Map<string, ChildModuleLike>()
  for (const { tag, module } of components) {
    const existing = registry.get(tag)
    if (existing !== undefined && existing !== module) {
      onWarn?.(
        `[@aihu/server] two modules claim the custom-element tag "${tag}". ` +
          `Keeping the first; the second would fail customElements.define on the client.`,
      )
      continue
    }
    registry.set(tag, module)
  }
  assertAcyclic(registry)
  return registry
}

/**
 * Depth-first cycle detection over the `__aihu_child_tags__` edges.
 *
 * Three-colour walk (unvisited / on the current stack / finished) rather than a
 * plain `seen` set: a set alone cannot tell a diamond (two paths reaching one
 * shared child — legal, and common) from a genuine back edge. Reporting the
 * former as a cycle would fail builds that are perfectly fine.
 *
 * Tags absent from the registry are edges out of the graph — a third-party
 * custom element, or a component the caller did not discover. They terminate
 * the walk instead of erroring: `__aihu_schild` already fails closed on them.
 */
function assertAcyclic(registry: ReadonlyMap<string, ChildModuleLike>): void {
  const FINISHED = 2
  const ON_STACK = 1
  const state = new Map<string, number>()
  const stack: string[] = []

  const visit = (tag: string): void => {
    const s = state.get(tag)
    if (s === FINISHED) return
    if (s === ON_STACK) {
      // Report the cycle itself, not the whole traversal path: the edges from
      // the first recurrence onward are what the author has to break.
      throw new ChildCycleError([...stack.slice(stack.indexOf(tag)), tag])
    }
    state.set(tag, ON_STACK)
    stack.push(tag)
    for (const child of registry.get(tag)?.__aihu_child_tags__ ?? []) {
      if (registry.has(child)) visit(child)
    }
    stack.pop()
    state.set(tag, FINISHED)
  }

  for (const tag of registry.keys()) visit(tag)
}
