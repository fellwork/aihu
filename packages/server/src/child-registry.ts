/**
 * Build the `SsrOptions.children` registry — the caller-side half of SSR child
 * component resolution (`docs/plans/2026-08-05-ssr-child-components.md`, step 5).
 *
 * The renderers take a pre-resolved `ReadonlyMap<tag, module>` and never load
 * anything themselves: module loading is async while the compiled fast path is
 * synchronous, so resolution has to happen before a render begins. This is
 * where it happens, and where a cyclic component graph is detected and
 * reported — a warning, not a rejection; see `ChildCycle` below for why.
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
 * A component reference cycle, reported (not thrown) by `buildChildRegistry`.
 *
 * This USED to be a thrown error that failed the build. It was downgraded,
 * because both halves of its justification turned out to be false.
 *
 * The stated reason to fail was that a cycle would "quietly emit 32 nested
 * copies and ship it". `__aihu_schild` now carries a depth cap AND an output
 * budget and reports loudly when either bites, so a cycle renders finitely and
 * visibly — the danger the hard failure existed to prevent no longer exists.
 *
 * And the detection has false positives it cannot avoid. `__aihu_child_tags__`
 * is derived by scanning emitted call sites, so it cannot see that a reference
 * is guarded: `<group if={kids.length}><tree-node>` reports `tree-node` as a
 * self-edge. Trees, nested menus and comment threads are ordinary shapes that
 * terminate perfectly well at runtime, and failing their builds — with a
 * message asserting "a component cannot render itself", which on the client is
 * simply untrue — was strictly worse than rendering them bounded.
 *
 * It also has false NEGATIVES: a reference the emitter declines contributes no
 * edge, so a genuine cycle through one is invisible. A warning is the honest
 * strength for a signal that is wrong in both directions.
 */
export interface ChildCycle {
  /** The loop, first recurrence to recurrence: `a → b → c → a`. */
  readonly cycle: ReadonlyArray<string>
  /** Human-readable, for a build log. */
  readonly message: string
}

/**
 * Index discovered components by tag, after verifying the graph is acyclic.
 *
 * `components` is every component the caller found — the whole set, not a
 * per-page subset, and not a transitive walk from each page's own tags out to
 * only the modules it can reach. Load-everything is simpler than a walk with
 * its own visited-set and load-order bookkeeping; the cycle check wants a
 * global view of the graph regardless (a cycle unreachable from any single
 * page is still a cycle); and for SSG the cost this trades away — loading a
 * component no rendered page references — is negligible next to the modules
 * already loaded to discover the tags in the first place. The child-tag sets
 * still earn their keep here as the edges of the cycle check.
 *
 * A tag claimed twice is a real conflict — two modules cannot both register it,
 * and the client's `customElements.define` would throw on the second. Reported
 * rather than silently last-wins.
 *
 * KEEPS THE FIRST, over a sorted file list, so the winner is deterministic —
 * and so does `@aihu/router`'s `scanComponents`, over its own sorted list. That
 * agreement is load-bearing and was absent: the router kept the LAST over
 * unsorted `readdirSync` order, so a duplicated tag shipped one module's markup
 * in the page and upgraded it with the other's on hydrate.
 *
 * The two sides also agree on the TAG, which they previously did not: the
 * router re-derived a name from source with a `@meta { name }` precedence the
 * compiler never applied (`SfcMeta` has no such field), while this registry
 * keys on the compiled `__aihu_tag__` — what `defineElement` actually
 * registers. The router's derivation was the one out of step and has been
 * dropped. §7a/§7b of `docs/plans/2026-08-06-ssr-child-followups.md` record
 * both, now closed.
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
    // Gated on FIRST registration: the same module reaching here twice under
    // one tag is legal (`discoverComponents` can yield it twice) and already
    // passes the conflict check above silently. Warning per occurrence rather
    // than per tag would report one broken component as two.
    if (existing === undefined) {
      const unrenderable = _whyUnrenderable(module)
      if (unrenderable !== null) onWarn?.(`[@aihu/server] <${tag}> ${unrenderable}`)
    }
    registry.set(tag, module)
  }
  for (const c of findCycles(registry)) onWarn?.(c.message)
  return registry
}

/**
 * Why `__aihu_schild` would refuse this module, or `null` if it would render it.
 *
 * The registry ACCEPTS such a module — it is still a real tag claim, it still
 * contributes edges to the cycle check, and the SSR-vs-client tag-collision
 * story depends on knowing about it. What it must not do is accept it in
 * SILENCE. `__aihu_schild` fails closed on both of these at render time and
 * emits the bare element, which is byte-identical to a tag nobody registered —
 * so "my footer is empty" and "my footer does not exist" produce the same page
 * and no message distinguishes them. That indistinguishability is the failure
 * mode this whole plan exists to remove; the information to tell them apart is
 * right here, one property read away, at build time.
 *
 * A diagnostic, not a rejection — the same disposition `ChildCycle` documents
 * at length. A build must not fail because one component of many cannot
 * prerender: the page still renders, the element still upgrades on the client,
 * and the only loss is the prerendered bytes. Reported, then carried on.
 *
 * The two causes are kept apart because the ACTIONS differ. A missing
 * `__ssrString` is the string emitter declining a template shape, and the author
 * fixes it by changing the template (or accepts it). A missing/unknown
 * `__aihu_shadow__` means the module was not produced by the server target's
 * full plugin path at all — a hand-built registry entry, or a compile that
 * skipped `aihuCompilerPlugin`'s server-env exports — and the author fixes it by
 * fixing the build.
 */
function _whyUnrenderable(module: ChildModuleLike): string | null {
  if (typeof module.__ssrString !== 'function') {
    return (
      'exports no compiled server renderer (`__ssrString`), so every reference to it ' +
      'prerenders as an empty element and fills in on the client. The string emitter ' +
      'declines some template shapes (`<suspense>`, a `$store`/`$resource` template, ' +
      'anything it cannot lower); check the compiled server artifact for the bail.'
    )
  }
  const shadow = module.__aihu_shadow__
  if (shadow !== 'light' && shadow !== 'shadow') {
    return (
      `declares no DOM mode (\`__aihu_shadow__\` is ${JSON.stringify(shadow)}), so every ` +
      'reference to it prerenders as an empty element. There is no safe default to ' +
      'guess — light children under a host that later calls `attachShadow` are ' +
      'discarded on upgrade, and a declarative shadow root on a light component is ' +
      'never adopted — so the renderer refuses rather than picking one. This export ' +
      "comes from `aihuCompilerPlugin`'s server target; a module missing it was not " +
      'compiled through it.'
    )
  }
  return null
}

/**
 * Depth-first cycle detection over the `__aihu_child_tags__` edges.
 *
 * Three-colour walk (unvisited / on the current stack / finished) rather than a
 * plain `seen` set: a set alone cannot tell a diamond (two paths reaching one
 * shared child — legal, and common) from a genuine back edge. Reporting the
 * former as a cycle would flag builds that are perfectly fine.
 *
 * Tags absent from the registry are edges out of the graph — a third-party
 * custom element, or a component the caller did not discover. They terminate
 * the walk instead of erroring: `__aihu_schild` already fails closed on them.
 *
 * Collects rather than throws; see `ChildCycle` for why. Each loop is reported
 * once — a tag already finished is not re-walked.
 */
function findCycles(registry: ReadonlyMap<string, ChildModuleLike>): ChildCycle[] {
  const FINISHED = 2
  const ON_STACK = 1
  const state = new Map<string, number>()
  const stack: string[] = []
  const found: ChildCycle[] = []
  const seenLoops = new Set<string>()

  const visit = (tag: string): void => {
    const s = state.get(tag)
    if (s === FINISHED) return
    if (s === ON_STACK) {
      // Report the cycle itself, not the whole traversal path: the edges from
      // the first recurrence onward are what the author would have to break.
      const cycle = [...stack.slice(stack.indexOf(tag)), tag]
      const key = cycle.join('\u0000')
      if (!seenLoops.has(key)) {
        seenLoops.add(key)
        found.push({
          cycle,
          message:
            `[@aihu/server] component reference cycle: ${cycle.join(' → ')}. ` +
            `Server rendering bounds this with a depth cap and an output budget, so it ` +
            `renders finitely — but if the recursion is not meant to terminate at a fixed ` +
            `depth, the deeper levels will be missing from the prerendered HTML and fill ` +
            `in on the client. (A guarded reference such as \`<x if={…}>\` is reported here ` +
            `too: this is derived from reference SITES, which cannot see the guard.)`,
        })
      }
      return
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
  return found
}
