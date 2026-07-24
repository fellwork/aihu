/**
 * `useRouteParams` — reactive read of the active route's matched params, via
 * the optional peers `@aihu/router` + `@aihu/context`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5, wave0 seed for
 * the `@aihu/use/router` family — packages/use/families.json).
 *
 * The seed for the FAMILY-WIDE peer + aggregate contract: `router`'s
 * `families.json` entry declares `peers: { "*": ["@aihu/router", "@aihu/context"] }`
 * (every member consents to BOTH peers just by being in this family — every
 * router composable needs `@aihu/context`'s `inject` for the same reason this
 * one does, see below) and `aggregate: true` — the bare `@aihu/use/router`
 * entry is safe because importing the family name already implies consenting
 * to its peers (contrast `/integrations`, which has five UNRELATED
 * per-member peers and therefore NO aggregate).
 *
 * Deliberately NOT `useRoute`: `@aihu/router` already exports `useRoute`
 * (`packages/router/src/runtime.ts`) with a `MatchResult | null` return
 * shape — re-declaring that name here under a different shape would be a
 * confusing, silently-shadowing duplicate. `useRouteParams` is a distinct,
 * narrower derivation over it.
 *
 * STATIC import, capture-at-call-time — NOT a lazy dynamic import. This
 * matters for correctness, not just style: `@aihu/context`'s `inject()`
 * resolves the real hierarchical (client) context ONLY during a component's
 * synchronous `setup()` window (`packages/runtime/src/define-component.ts`
 * wraps only `_build()` in `_enterOwnerContext`/`_exitContext`). A lazy
 * `import('@aihu/router')` resolves in a microtask, so any `inject()` call
 * made after it lands runs OUTSIDE that window — `inject` then falls through
 * to the token default (`null`), forever, on both client and (synchronous)
 * SSR render. There is no async escape hatch here: the ONE moment a call to
 * `inject(RouteContext)` can observe the real ancestor context is the
 * synchronous instant `useRouteParams()` itself is invoked from a component's
 * setup — so that is exactly when we call it, once, and capture the result.
 *
 * `ctx.current()` is then just a plain reactive signal read (not a context
 * lookup), so wrapping it in a `computed` is safe to re-evaluate at any
 * later point — including from outside setup — without needing `inject`
 * again.
 *
 * No client/server SSR guard needed: this reads reactive context, not the
 * DOM — `@aihu/router`'s own `useRoute()`/`inject()` are already SSR-safe
 * (`inject` falls back to `null` with no active context), so there is
 * nothing extra to special-case here.
 */
import { inject } from '@aihu/context'
import { RouteContext } from '@aihu/router'
import { computed } from '@aihu/signals'

export interface UseRouteParamsReturn {
  /** Reactive params getter — read as `{params()}` in templates (parens
   * required). `{}` with no active route (or outside a `<router>` context). */
  readonly params: () => Record<string, string>
}

/**
 * Read the current route's matched params (e.g. `:id` in `/posts/:id`),
 * recomputing whenever the active route changes.
 *
 * Must be called synchronously from a component's `setup()` (same rule as
 * every other context-reading composable) — calling it later, or storing
 * `useRouteParams` itself and invoking it lazily, will capture `undefined`
 * ancestor context instead of the real one.
 */
export function useRouteParams(): UseRouteParamsReturn {
  const ctx = inject(RouteContext)
  const params = computed(() => ctx?.current()?.params ?? {})
  return { params }
}
