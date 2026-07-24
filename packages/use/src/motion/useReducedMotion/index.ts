/**
 * `useReducedMotion` — reactive read of the user's `prefers-reduced-motion`
 * preference (docs/plans/2026-07-22-effect-scope-and-composables.md §5,
 * wave0 seed for the `@aihu/use/motion` family — packages/use/families.json).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{prefersReduced()}`, never bare `{prefersReduced}`.
 *
 * A thin `/motion` wrapper over the already-shipped CORE `useMediaQuery` —
 * this is the seed that exercises the one-way import rule: a FAMILY entry
 * may import CORE (this file does), but CORE may never import back into a
 * family (enforced by `scripts/dep-check.ts`'s `checkUseSubpathPurity`,
 * with a negative fixture covering the forbidden direction).
 *
 * SSR (`isClient === false`): returns a static getter of `false` without
 * even reaching into `useMediaQuery` — the `isClient` no-op invariant,
 * checked directly here (not merely inherited transitively) so this
 * composable's own source references `isClient`, which is what makes a
 * Tier-2 row in `packages/use/tests/ssr-safety.test.ts` REQUIRED rather
 * than optional (the parity gate's 7th touch point).
 */
import { isClient } from '../../shared/index.ts'
import { useMediaQuery } from '../../useMediaQuery/index.ts'

export interface UseReducedMotionReturn {
  /** Reactive getter — read as `{prefersReduced()}` in templates (parens
   * required). `false` under SSR (no viewport to evaluate the query). */
  readonly prefersReduced: () => boolean
}

/**
 * Track the `(prefers-reduced-motion: reduce)` media query. Motion
 * composables (`useSpring`, etc., landing in later waves) read this to
 * decide whether to animate at all.
 */
export function useReducedMotion(): UseReducedMotionReturn {
  // SSR: static false, no query ever registered.
  if (!isClient) {
    const prefersReduced = (): boolean => false
    return { prefersReduced }
  }

  const { matches } = useMediaQuery('(prefers-reduced-motion: reduce)')
  return { prefersReduced: matches }
}
